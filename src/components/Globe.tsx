import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { Viewer, ImageryLayer } from 'cesium'
import {
  EasingFunction,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  JulianDate
} from 'cesium'
import { createViewer, setMapMode } from '../lib/cesium/createViewer'
import { VenueMarkerManager, type MarkerHoverInfo } from '../lib/cesium/markerUtils'
import { PremiumCameraManager } from '../lib/cesium/cameraUtils'
import { RouteManager } from '../lib/cesium/addRoute'
import { BuildingManager } from '../lib/cesium/buildingUtils'
import { AutoRotateController, setOverviewCamera, removeOverviewConstraints, applyOverviewConstraints } from '../lib/cesium/autoRotate'
import { removeVenueCameraLock } from '../lib/cesium/venueCameraLock'
import { applyVenueFog } from '../lib/cesium/venueFog'
import {
  createVenueImageryLayer,
  animateVenueLayerAlpha,
} from '../lib/cesium/imagery/venueImagery'
import { setupZoomClampListener } from '../lib/cesium/cameraConstraints'
import { attachVenueEnforcer, type VenueFrame } from '../lib/cesium/enforceVenueCamera'
import { installVenueLighting } from '../lib/cesium/lighting'
import { applyLightingByMode } from '../lib/cesium/overviewLighting'
import { enterVenueOrbit } from '../lib/cesium/venueOrbit'
import { OVERVIEW_DISTANCE_MULTIPLIER } from '../lib/cesium/camera/overview'
import { getEarthRadius, computeEarthCenteredPoseAboveLatLng } from '../lib/cesium/camera/poses'
import type { Stop } from '../lib/data/types'

interface GlobeProps {
  onReady?: (viewer: Viewer, cameraManager: PremiumCameraManager) => void
  onImageryReady?: () => void
  hideUntilReady?: boolean
  stops?: Stop[]
  viewMode?: 'overview' | 'venue'
  selectedStopId?: string | null
  onSelectStop?: (stopId: string) => void
  onFlyToOverview?: (flyToOverviewFn: (stops: Stop[]) => void) => void
  onFlyToOverviewAboveStop?: (flyToOverviewAboveStopFn: (stop: Stop) => Promise<void>) => void
  onBuildingsSuppressed?: (stopId: string, suppressed: boolean) => void
}

export function Globe({ 
  onReady, 
  onImageryReady, 
  hideUntilReady = false, 
  stops = [], 
  viewMode = 'overview',
  selectedStopId = null, 
  onSelectStop,
  onFlyToOverview,
  onFlyToOverviewAboveStop,
  onBuildingsSuppressed
}: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const creditContainerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const gibsLayerRef = useRef<ImageryLayer | null>(null)
  const osmLayerRef = useRef<ImageryLayer | null>(null)
  const markerManagerRef = useRef<VenueMarkerManager | null>(null)
  const cameraManagerRef = useRef<PremiumCameraManager | null>(null)
  const routeManagerRef = useRef<RouteManager | null>(null)
  const buildingManagerRef = useRef<BuildingManager | null>(null)
  const venueImageryLayerRef = useRef<ImageryLayer | null>(null)
  const autoRotateControllerRef = useRef<AutoRotateController | null>(null)
  const zoomClampCleanupRef = useRef<(() => void) | null>(null)
  const venueFrameRef = useRef<VenueFrame | null>(null)
  const venueEnforcerCleanupRef = useRef<(() => void) | null>(null)
  const venueLightingCleanupRef = useRef<(() => void) | null>(null)
  const overviewLightingCleanupRef = useRef<(() => void) | null>(null)
  const nightLayerRef = useRef<ImageryLayer | null>(null)
  const clickHandlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const onSelectRef = useRef<((stopId: string) => void) | undefined>(onSelectStop)
  const initOnceRef = useRef(false)
  const didInitialOverviewRef = useRef(false)
  const allowFlyToSelectedRef = useRef(false)
  const stopsRef = useRef<Stop[]>([])
  const viewModeRef = useRef<'overview' | 'venue'>(viewMode)
  const selectedStopIdRef = useRef<string | null>(selectedStopId)
  stopsRef.current = stops
  viewModeRef.current = viewMode
  selectedStopIdRef.current = selectedStopId
  useEffect(() => {
    onSelectRef.current = onSelectStop
  }, [onSelectStop])
  const [isReady, setIsReady] = useState(false)
  const [tooltip, setTooltip] = useState<MarkerHoverInfo>(null)

  // Stable callback to avoid recreating the onReady function
  const onReadyCallback = useCallback((viewer: Viewer, cameraManager: PremiumCameraManager) => {
    console.log('[Cesium] Globe ready for interactions')
    onReady?.(viewer, cameraManager)
  }, [onReady])

  // Overview: whole Earth above first venue, auto-rotate, overview constraints
  const flyToOverview = useCallback((stops: Stop[]) => {
    if (!viewerRef.current || !gibsLayerRef.current || !osmLayerRef.current) return
    const viewer = viewerRef.current
    const gibsLayer = gibsLayerRef.current
    const osmLayer = osmLayerRef.current

    setMapMode('overview', viewer, gibsLayer, osmLayer, {
      routeEntities: routeManagerRef.current?.getRouteEntities() ?? undefined
    })

    const firstStop = [...stops].sort((a, b) => a.order - b.order)[0]
    const anchor = firstStop && firstStop.lat != null && firstStop.lng != null
      ? { lon: firstStop.lng, lat: firstStop.lat }
      : undefined

    autoRotateControllerRef.current?.flyToOverview(anchor)
    allowFlyToSelectedRef.current = true
    console.log('[Globe] Overview: whole Earth, auto-rotate active')
  }, [])

  // Fly out to overview pose above the given stop; returns Promise that resolves when flight completes
  const flyToOverviewAboveStop = useCallback((stop: Stop): Promise<void> => {
    const viewer = viewerRef.current
    const gibsLayer = gibsLayerRef.current
    const osmLayer = osmLayerRef.current
    if (!viewer || !gibsLayer || !osmLayer || !stop.lat || !stop.lng) return Promise.resolve()

    setMapMode('overview', viewer, gibsLayer, osmLayer, {
      routeEntities: routeManagerRef.current?.getRouteEntities() ?? undefined
    })
    routeManagerRef.current?.setRouteVisible(true)
    autoRotateControllerRef.current?.onFlightStart()
    applyOverviewConstraints(viewer)

    const radius = getEarthRadius(viewer)
    const distanceFromCenter = radius * OVERVIEW_DISTANCE_MULTIPLIER
    const ellipsoid = viewer.scene.globe.ellipsoid
    const pose = computeEarthCenteredPoseAboveLatLng(stop.lng, stop.lat, distanceFromCenter, ellipsoid)

    const duration = 3.0
    return new Promise<void>((resolve) => {
      viewer.camera.flyTo({
        destination: pose.destination,
        orientation: { direction: pose.direction, up: pose.up },
        duration,
        easingFunction: EasingFunction.QUADRATIC_IN_OUT,
        complete: () => {
          autoRotateControllerRef.current?.onFlightEnd()
          resolve()
        },
        cancel: () => {
          autoRotateControllerRef.current?.onFlightEnd()
          resolve()
        },
      })
    })
  }, [])

  useEffect(() => {
    if (onFlyToOverview) onFlyToOverview(flyToOverview)
  }, [onFlyToOverview, flyToOverview])

  useEffect(() => {
    if (onFlyToOverviewAboveStop) onFlyToOverviewAboveStop(flyToOverviewAboveStop)
  }, [onFlyToOverviewAboveStop, flyToOverviewAboveStop])

  // Initialize Cesium viewer ONCE
  useEffect(() => {
    if (!containerRef.current) return
    if (initOnceRef.current) return
    
    initOnceRef.current = true
    console.log('[Cesium] init viewer')

    const initializeViewer = async () => {
      try {
        // Create Cesium viewer with credit container
        const result = await createViewer(
          containerRef.current!, 
          creditContainerRef.current || undefined
        )

        viewerRef.current = result.viewer
        gibsLayerRef.current = result.gibsLayer
        osmLayerRef.current = result.osmLayer
        nightLayerRef.current = result.nightLayer

        overviewLightingCleanupRef.current = applyLightingByMode(
          result.viewer,
          () => viewModeRef.current
        )
        
        // Set up imagery ready callback
        result.onImageryReady(() => {
          console.log('[Globe] Imagery ready callback triggered')
          onImageryReady?.()
        })
        
        // Wait for imagery to be ready
        await result.isReady
        
        // Fade in the globe (only if not hidden until ready)
        if (containerRef.current && !hideUntilReady) {
          containerRef.current.style.opacity = '1'
        }
        
        setIsReady(true)
        
        // Initialize camera manager
        cameraManagerRef.current = new PremiumCameraManager(result.viewer)
        
        // Initialize route manager
        routeManagerRef.current = new RouteManager(result.viewer)
        
        // Initialize marker manager
        markerManagerRef.current = new VenueMarkerManager(result.viewer)
        markerManagerRef.current.setOnMarkerHover(setTooltip)

        // Initialize building manager
        buildingManagerRef.current = new BuildingManager(result.viewer)

        // Initial view: above equator, on same meridian as first stop
        autoRotateControllerRef.current = new AutoRotateController(result.viewer)
        const currentStops = stopsRef.current
        const firstStop = currentStops.length > 0
          ? [...currentStops].sort((a, b) => a.order - b.order)[0]
          : null
        const lon = firstStop && typeof firstStop.lng === 'number' ? firstStop.lng : 0
        const initialAnchor = { lon, lat: 0 }
        autoRotateControllerRef.current.initialize(initialAnchor)

        zoomClampCleanupRef.current = setupZoomClampListener(result.viewer)
        venueEnforcerCleanupRef.current = attachVenueEnforcer(
          result.viewer,
          () => viewModeRef.current,
          () => venueFrameRef
        )
        venueLightingCleanupRef.current = installVenueLighting(
          result.viewer,
          () => viewModeRef.current
        )

        // Marker click: set selection only (same as list click). Fly is triggered by the
        // viewMode/selectedStopId effect below so list and marker behave identically.
        const globeClickHandler = new ScreenSpaceEventHandler(result.viewer.scene.canvas)
        globeClickHandler.setInputAction((event: { position: { x: number; y: number } }) => {
          result.viewer.selectedEntity = undefined
          const picked = result.viewer.scene.pick(event.position)
          if (!defined(picked)) return

          let stopId: string | null = null
          const pickedId = (picked as { id?: { id?: string; properties?: { stopId?: { getValue?: (t: unknown) => string } } } }).id
          if (pickedId) {
            if (typeof pickedId === 'string') stopId = pickedId
            else if (typeof (pickedId as { id?: string }).id === 'string') stopId = (pickedId as { id: string }).id
            else {
              const props = (pickedId as { properties?: { stopId?: unknown } }).properties
              const stopIdProp = props?.stopId
              const v = typeof (stopIdProp as { getValue?: (t: unknown) => string })?.getValue === 'function'
                ? (stopIdProp as { getValue: (t: unknown) => string }).getValue(JulianDate.now())
                : stopIdProp
              if (typeof v === 'string') stopId = v
            }
          }
          if (!stopId) {
            const prim = (picked as { primitive?: { id?: string; properties?: { stopId?: unknown } } }).primitive
            if (typeof prim?.id === 'string') stopId = prim.id
            else if (prim?.properties?.stopId) {
              const stopIdProp = prim.properties.stopId
              const v = typeof (stopIdProp as { getValue?: (t: unknown) => string })?.getValue === 'function'
                ? (stopIdProp as { getValue: (t: unknown) => string }).getValue(JulianDate.now())
                : stopIdProp
              if (typeof v === 'string') stopId = v
            }
          }
          if (!stopId) return

          onSelectRef.current?.(stopId)
        }, ScreenSpaceEventType.LEFT_CLICK)
        clickHandlerRef.current = globeClickHandler

        // Initialize markers and routes if stops are available
        if (stops.length > 0) {
          console.log('[Globe] Initializing markers and routes on viewer creation')
          markerManagerRef.current.updateMarkers(stops, selectedStopId)
          if (stops.length > 1) {
            routeManagerRef.current.addTourRoute(stops)
          }
        }
        
        onReadyCallback(result.viewer, cameraManagerRef.current!)
      } catch (error) {
        console.error('Failed to initialize Cesium viewer:', error)
        setIsReady(true) // Show something even if failed
      }
    }

    initializeViewer()

    // Cleanup on unmount
    return () => {
      console.log('[Cesium] destroy viewer')
      if (cameraManagerRef.current) {
        cameraManagerRef.current.cancelFlight()
        cameraManagerRef.current = null
      }
      if (routeManagerRef.current) {
        routeManagerRef.current.destroy()
        routeManagerRef.current = null
      }
      if (markerManagerRef.current) {
        markerManagerRef.current.destroy()
        markerManagerRef.current = null
      }
      if (buildingManagerRef.current) {
        buildingManagerRef.current.clearAllBuildings()
        buildingManagerRef.current = null
      }
      if (autoRotateControllerRef.current) {
        autoRotateControllerRef.current.destroy()
        autoRotateControllerRef.current = null
      }
      zoomClampCleanupRef.current?.()
      zoomClampCleanupRef.current = null
      venueEnforcerCleanupRef.current?.()
      venueEnforcerCleanupRef.current = null
      venueLightingCleanupRef.current?.()
      venueLightingCleanupRef.current = null
      overviewLightingCleanupRef.current?.()
      overviewLightingCleanupRef.current = null
      nightLayerRef.current = null
      if (clickHandlerRef.current) {
        clickHandlerRef.current.destroy()
        clickHandlerRef.current = null
      }
      if (viewerRef.current) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }
      initOnceRef.current = false
    }
  }, []) // Empty dependency array - init ONCE only

  // Separate effect to handle onReady callback changes
  useEffect(() => {
    if (isReady && viewerRef.current && cameraManagerRef.current) {
      console.log('[Cesium] Calling onReady callback (viewer already exists)')
      onReadyCallback(viewerRef.current, cameraManagerRef.current!)
    }
  }, [onReadyCallback, isReady])

  // Update markers and routes when stops change or viewer becomes ready
  useEffect(() => {
    if (markerManagerRef.current && stops.length > 0 && isReady) {
      console.log('[Globe] Updating markers for stops')
      markerManagerRef.current.updateMarkers(stops, selectedStopId)
    }
    
    if (routeManagerRef.current && stops.length > 1 && isReady) {
      console.log('[Globe] Updating route for stops')
      routeManagerRef.current.addTourRoute(stops)
      routeManagerRef.current.setRouteVisible(viewMode === 'overview')
      viewerRef.current?.scene.requestRender()
    }
  }, [stops, selectedStopId, isReady, viewMode])

  // Initialize markers and routes when both viewer is ready and stops are available
  useEffect(() => {
    if (isReady && stops.length > 0 && viewerRef.current && gibsLayerRef.current && osmLayerRef.current) {
      console.log('[Globe] Viewer and stops ready - initializing markers and routes')
      
      // Initialize markers
      if (markerManagerRef.current) {
        markerManagerRef.current.updateMarkers(stops, selectedStopId)
      }
      
      // Initialize routes and sync visibility to current view mode
      if (routeManagerRef.current && stops.length > 1) {
        routeManagerRef.current.addTourRoute(stops)
        routeManagerRef.current.setRouteVisible(viewMode === 'overview')
        viewerRef.current.scene.requestRender()
      }

      // Initial load: establish overview state (imagery + route visibility)
      if (!didInitialOverviewRef.current) {
        didInitialOverviewRef.current = true
        allowFlyToSelectedRef.current = true
        setMapMode('overview', viewerRef.current, gibsLayerRef.current, osmLayerRef.current, {
          routeEntities: routeManagerRef.current?.getRouteEntities() ?? undefined
        })
        routeManagerRef.current?.setRouteVisible(true)
        viewerRef.current.scene.requestRender()
        console.log('[Globe] Initial overview (southern perspective)')
      }
    }
  }, [isReady, stops, flyToOverview, viewMode]) // Run when either viewer becomes ready OR stops data arrives

  // Route arc visibility: overview = visible, venue = hidden
  useEffect(() => {
    if (routeManagerRef.current && isReady) {
      routeManagerRef.current.setRouteVisible(viewMode === 'overview')
      viewerRef.current?.scene.requestRender()
    }
  }, [viewMode, isReady])

  // Night lights layer disabled (polar artifacts); keep hidden. Hide in venue so it never interferes.
  useEffect(() => {
    const layer = nightLayerRef.current
    if (!layer || !isReady) return
    layer.show = false
    viewerRef.current?.scene.requestRender()
  }, [viewMode, isReady])

  // Markers: visible in overview, hidden in venue; clear tooltip when entering venue
  useEffect(() => {
    if (markerManagerRef.current && isReady) {
      markerManagerRef.current.setVisible(viewMode === 'overview')
      if (viewMode === 'venue') {
        markerManagerRef.current.clearHover()
        setTooltip(null)
      }
      viewerRef.current?.scene.requestRender()
    }
  }, [viewMode, isReady])

  // Auto-rotate: active in overview, disabled in venue
  useEffect(() => {
    if (autoRotateControllerRef.current && isReady) {
      autoRotateControllerRef.current.setViewMode(viewMode)
    }
  }, [viewMode, isReady])

  // Venue camera lock: remove when switching to overview; clear venue frame so enforcer no-ops
  useEffect(() => {
    if (viewerRef.current && isReady && viewMode === 'overview') {
      venueFrameRef.current = null
      removeVenueCameraLock(viewerRef.current)
    }
  }, [viewMode, isReady])

  // Venue fog: scene fog, distance ~2000m
  useEffect(() => {
    if (viewerRef.current && isReady) {
      applyVenueFog(viewerRef.current, viewMode)
      viewerRef.current.scene.requestRender()
    }
  }, [viewMode, isReady])

  // Venue imagery: photo-from-above layer, limited to venue region
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !isReady) return

    if (viewMode === 'venue' && selectedStopId && stops.length > 0) {
      const selectedStop = stops.find((s) => s.id === selectedStopId)
      if (!selectedStop?.lat || !selectedStop?.lng) return

      const existing = venueImageryLayerRef.current
      if (existing) {
        viewer.imageryLayers.remove(existing, true)
        venueImageryLayerRef.current = null
      }

      const layer = createVenueImageryLayer(viewer, selectedStop)
      venueImageryLayerRef.current = layer
      animateVenueLayerAlpha(layer, 1, 600, viewer)
    } else {
      const layer = venueImageryLayerRef.current
      if (layer) {
        venueImageryLayerRef.current = null
        animateVenueLayerAlpha(layer, 0, 600, viewer).then(() => {
          if (viewer.imageryLayers.contains(layer)) {
            viewer.imageryLayers.remove(layer, true)
          }
          viewer.scene.requestRender()
        })
      }
    }
  }, [viewMode, selectedStopId, stops, isReady])

  // Fly to venue: driven only by state (viewMode + selectedStopId). Runs for both list and
  // marker clicks so behavior is identical. Apply correct range (1000m) immediately.
  useEffect(() => {
    if (!allowFlyToSelectedRef.current) return
    if (!isReady) return
    if (viewMode !== 'venue' || !selectedStopId) return

    const viewer = viewerRef.current
    const gibsLayer = gibsLayerRef.current
    const osmLayer = osmLayerRef.current
    if (!viewer || !gibsLayer || !osmLayer || stops.length === 0) return

    const stop = stops.find(s => s.id === selectedStopId)
    if (!stop?.lat || !stop?.lng) return

    removeVenueCameraLock(viewer)
    routeManagerRef.current?.setRouteVisible(false)
    setMapMode('venue', viewer, gibsLayer, osmLayer, {
      routeEntities: routeManagerRef.current?.getRouteEntities() ?? undefined
    })

    const scene = viewer.scene
    const prev = scene.requestRenderMode
    scene.requestRenderMode = false
    enterVenueOrbit(viewer, stop, venueFrameRef)
    requestAnimationFrame(() => {
      scene.requestRenderMode = prev
      scene.requestRender()
    })
  }, [isReady, viewMode, selectedStopId, stops])

  // Load buildings only in VENUE mode (textured buildings)
  useEffect(() => {
    if (!buildingManagerRef.current || !isReady) return

    if (viewMode === 'venue' && selectedStopId && stops.length > 0) {
      const selectedStop = stops.find(stop => stop.id === selectedStopId)
      if (selectedStop) {
        console.log(`[Globe] Loading buildings for selected stop: ${selectedStop.city}`)
        const check = () => viewModeRef.current === 'venue' && selectedStopIdRef.current === selectedStop.id
        void buildingManagerRef.current
          .loadBuildingsForStop(selectedStop, check)
          .then(result => {
            if (result.suppressed) {
              onBuildingsSuppressed?.(selectedStop.id, true)
            } else {
              onBuildingsSuppressed?.(selectedStop.id, false)
            }
          })
          .catch(error => {
            console.warn(`[Buildings] Failed to load for ${selectedStop.city}:`, error)
            onBuildingsSuppressed?.(selectedStop.id, false)
          })
      } else {
        onBuildingsSuppressed?.(selectedStopId, false)
      }
    } else {
      // Overview: clear buildings
      void buildingManagerRef.current.clearAllBuildings()
      if (selectedStopId) onBuildingsSuppressed?.(selectedStopId, false)
    }
  }, [viewMode, selectedStopId, stops, isReady, onBuildingsSuppressed])

  return (
    <>
      {/* Loading Overlay - CSS overlay, not conditional rendering */}
      <div 
        className="loading-overlay"
        style={{ 
          opacity: isReady ? 0 : 1,
          pointerEvents: isReady ? 'none' : 'auto'
        }}
      >
        <div className="glass-panel" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <div 
            style={{ 
              fontSize: 'var(--font-size-lg)', 
              color: 'var(--text)', 
              marginBottom: 'var(--space-2)' 
            }}
          >
            Loading experience...
          </div>
          <div 
            style={{ 
              fontSize: 'var(--font-size-sm)', 
              color: 'var(--text-muted)' 
            }}
          >
            Preparing high-resolution imagery
          </div>
        </div>
      </div>

      {/* Marker tooltip - glass overlay */}
      {tooltip && (
        <div
          className="marker-tooltip"
          style={{
            left: tooltip.screenX,
            top: tooltip.screenY,
          }}
        >
          <div className="marker-tooltip__city">{tooltip.city}</div>
          <div className="marker-tooltip__venue">{tooltip.venue}</div>
        </div>
      )}

      {/* Venue vignette - subtle edge darkening (venue mode only) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
          opacity: viewMode === 'venue' ? 1 : 0,
          transition: 'opacity 0.2s ease-out',
          background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 45%, rgba(0,0,0,0.12) 100%)',
        }}
      />

      {/* Cesium Container - ALWAYS rendered, never conditional */}
      <div 
        ref={containerRef}
        className="cesiumRoot"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: hideUntilReady ? 0 : (isReady ? 1 : 0), // Hide until ready or fade in normally
          transform: hideUntilReady ? 'scale(1.02)' : 'scale(1)',
          transition: 'opacity 650ms cubic-bezier(0.23, 1, 0.32, 1), transform 650ms cubic-bezier(0.23, 1, 0.32, 1)'
        }}
      />

      {/* Hidden Credit Container */}
      <div 
        ref={creditContainerRef}
        style={{ display: 'none' }}
      />
    </>
  )
}