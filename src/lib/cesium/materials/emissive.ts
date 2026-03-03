import { Material, Color } from 'cesium'

/**
 * Creates a self-lit (emissive) material so the surface never goes black
 * regardless of scene.light, time-of-day, or globe lighting.
 */
export function createEmissiveColorMaterial(color: Color): Material {
  return new Material({
    fabric: {
      type: 'EmissiveColor',
      uniforms: { u_color: color },
      source: `
        uniform vec4 u_color;
        czm_material czm_getMaterial(czm_materialInput input) {
          czm_material m = czm_getDefaultMaterial(input);
          m.emission = u_color.rgb;
          m.alpha = u_color.a;
          return m;
        }
      `,
    },
  })
}
