/** Public Water entry. Internal modules retain direct imports. */
export { registerOceanAuthoring } from "../../authoring/ocean/OceanAuthoring";
export {
  OCEAN_LOOK,
  OCEAN_LOOK_ID,
  OCEAN_RENDER_BUDGET,
  OCEAN_WAVE_DISPLACEMENT_ENVELOPE,
  OCEAN_WAVE_KERNEL,
  deriveOceanWaveDisplacementEnvelope
} from "../../authoring/ocean/presets/OceanLook";
export type { OceanLook, OceanWaveDisplacementEnvelope } from "../../authoring/ocean/presets/OceanLook";
