import type { Viewer } from 'cesium'
import { Cartesian3, HeadingPitchRange, Matrix4, Math as CesiumMath } from 'cesium'
import { VENUE_MIN_RANGE_M, VENUE_MAX_RANGE_M } from '../../config/camera'

export type ViewMode = 'overview' | 'venue' | 'transition'

const OVERVIEW_MIN_ZOOM = 2_000_000
const OVERVIEW_MAX_ZOOM = 30_000_000

const CLAMP_FLY_DURATION = 0.3
const WHEEL_CLAMP_DELAY_MS = 150
const PROGRAMMATIC_FLY_GRACE_MS = 800

let currentViewMode: ViewMode = 'overview'
let lastWheelTs = 0
let clampScheduled = false
let lastProgrammaticFlyAt = 0

/** Call when a programmatic camera placement completes so wheel clamp does not override. */
export function recordProgrammaticFly(): void {
  lastProgrammaticFlyAt = performance.now()
}

/**
 * Venue controller: no pan, zoom/rotate/tilt; zoom 500–1000 m.
 * Collision detection off so no jump; min height enforced by pitch+range clamp in enforceVenueCamera.
 */
export function applyVenueController(viewer: Viewer): void {
  currentViewMode = 'venue'
  const c = viewer.scene.screenSpaceCameraController
  c.enableTranslate = false
  c.enableRotate = true
  c.enableTilt = true
  c.enableZoom = true
  c.minimumZoomDistance = VENUE_MIN_RANGE_M
  c.maximumZoomDistance = VENUE_MAX_RANGE_M
  c.enableCollisionDetection = false
}

/**
 * Restore overview controller: translate, zoom limits, collision detection on.
 */
export function restoreOverviewController(viewer: Viewer): void {
  currentViewMode = 'overview'
  viewer.camera.lookAtTransform(Matrix4.IDENTITY)
  const c = viewer.scene.screenSpaceCameraController
  c.enableTranslate = true
  c.enableZoom = true
  c.enableRotate = true
  c.enableTilt = true
  c.minimumZoomDistance = OVERVIEW_MIN_ZOOM
  c.maximumZoomDistance = OVERVIEW_MAX_ZOOM
  c.enableCollisionDetection = true
}

/**
 * Applies controller behavior per view mode. For transition, relaxes zoom for flights.
 */
export function applyCameraConstraints(viewer: Viewer, viewMode: ViewMode): void {
  if (viewMode === 'venue') {
    applyVenueController(viewer)
  } else if (viewMode === 'transition') {
    currentViewMode = 'transition'
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1.0
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = Number.POSITIVE_INFINITY
  } else {
    restoreOverviewController(viewer)
  }
}

/**
 * Clamps camera to zoom bounds. In venue mode uses camera.transform origin (ENU frame center).
 */
function clampCameraToBounds(viewer: Viewer): void {
  if (currentViewMode === 'transition') return
  if (performance.now() - lastProgrammaticFlyAt < PROGRAMMATIC_FLY_GRACE_MS) return

  const camera = viewer.camera
  const ellipsoid = viewer.scene.globe.ellipsoid

  let minDist: number
  let maxDist: number
  let targetPos: Cartesian3
  let direction: Cartesian3

  if (currentViewMode === 'venue') {
    // Venue orbit: center is origin of camera transform (ENU frame at venue)
    targetPos = Matrix4.getTranslation(camera.transform, new Cartesian3())
    minDist = VENUE_MIN_RANGE_M
    maxDist = VENUE_MAX_RANGE_M
    direction = Cartesian3.subtract(camera.positionWC, targetPos, new Cartesian3())
  } else {
    const camPos = camera.positionWC
    const radius = ellipsoid.maximumRadius
    const centerToCam = Cartesian3.normalize(camPos, new Cartesian3())
    const surfacePoint = Cartesian3.multiplyByScalar(centerToCam, radius, new Cartesian3())
    targetPos = surfacePoint
    minDist = OVERVIEW_MIN_ZOOM
    maxDist = OVERVIEW_MAX_ZOOM
    direction = Cartesian3.clone(centerToCam)
  }

  const currentDist = Cartesian3.distance(camera.positionWC, targetPos)
  if (currentDist >= minDist && currentDist <= maxDist) return

  const clampedDist = CesiumMath.clamp(currentDist, minDist, maxDist)
  if (currentViewMode === 'venue') {
    camera.lookAtTransform(
      camera.transform,
      new HeadingPitchRange(camera.heading, camera.pitch, clampedDist)
    )
    viewer.scene.requestRender()
    clampScheduled = false
    return
  }

  let newPos: Cartesian3
  {
    const radius = ellipsoid.maximumRadius
    newPos = Cartesian3.multiplyByScalar(
      direction,
      radius + clampedDist,
      new Cartesian3()
    )
    camera.flyTo({
      destination: newPos,
      duration: CLAMP_FLY_DURATION,
      complete: () => { clampScheduled = false },
      cancel: () => { clampScheduled = false },
    })
    clampScheduled = true
  }
}

function scheduleClampCheck(viewer: Viewer): void {
  lastWheelTs = performance.now()
  if (clampScheduled) return

  const check = () => {
    const elapsed = performance.now() - lastWheelTs
    if (elapsed >= WHEEL_CLAMP_DELAY_MS) {
      clampScheduled = true
      clampCameraToBounds(viewer)
      return
    }
    requestAnimationFrame(() => check())
  }
  requestAnimationFrame(check)
}

/**
 * Sets up wheel listener to clamp camera when zoom exceeds bounds.
 * Uses PROGRAMMATIC_FLY_GRACE_MS (800 ms) after programmatic placement.
 */
export function setupZoomClampListener(viewer: Viewer): () => void {
  const canvas = viewer.scene.canvas
  if (!canvas) return () => {}

  const onWheel = () => {
    scheduleClampCheck(viewer)
  }

  canvas.addEventListener('wheel', onWheel, { passive: true })

  return () => {
    canvas.removeEventListener('wheel', onWheel)
  }
}
