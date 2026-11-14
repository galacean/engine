import type { PlanningComponentDefinition } from "./PlanningComponents";
import type { PlanningSystemDeclaration } from "./PlanningSystemDeclaration";
import type { WorldEnvironmentRuntime } from "../integrations/terrain/environment/WorldEnvironmentRuntime";
import { TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS } from "@galacean/engine-environment/terrain/environment/TerrainVolumetricCloudPreset";

/** Serialized inputs to the existing cloud and precipitation owners. */
export const PLANNING_WEATHER_COMPONENT: PlanningComponentDefinition = {
  type: "weather",
  label: "云与降水",
  version: 1,
  tab: "lighting",
  presentation: true,
  fields: [
    { key: "cloudCoverage", label: "云覆盖率", type: "number", min: 0, max: 1, unit: "比例", default: 0.45 },
    { key: "cloudBaseAltitudeM", label: "云底高度", type: "number", min: 0, unit: "m" },
    { key: "cloudFeatureSize", label: "云团大小倍率", type: "number", min: Number.EPSILON, step: 0.05 },
    { key: "rainRate", label: "降雨强度", type: "number", min: 0, max: 1, unit: "比例", default: 0 },
    { key: "snowRate", label: "降雪强度", type: "number", min: 0, max: 1, unit: "比例", default: 0 },
    { key: "temperatureCelsius", label: "气温", type: "number", unit: "°C", default: 22 },
    { key: "relativeHumidity", label: "相对湿度", type: "number", min: 0, max: 1, unit: "比例", default: 0.38 },
    { key: "surfaceWaterCoverage", label: "地面积水覆盖倍率", type: "number", min: 0, max: 4 },
    { key: "puddleStorageBias", label: "初始积水储量", type: "number", min: 0, max: 1 },
    { key: "surfaceReflectionIntensity", label: "地面积水反射强度", type: "number", min: 0, max: 4 },
    { key: "surfaceSsrMix", label: "地面积水 SSR 混合", type: "number", min: 0, max: 1 },
    { key: "surfaceRoughness", label: "浅水膜粗糙度", type: "number", min: 0.005, max: 1 },
    { key: "standingWaterRoughness", label: "低洼积水粗糙度", type: "number", min: 0.005, max: 1 },
    { key: "surfaceNormalFlattening", label: "水膜法线平滑", type: "number", min: 0, max: 1 },
    { key: "surfaceRippleStrength", label: "水膜雨纹法线强度", type: "number", min: 0, max: 4 }
  ]
};
export const PLANNING_WEATHER_DECLARATION: PlanningSystemDeclaration = {
  id: "weather",
  title: "云与降水",
  skill: "environment",
  components: [
    {
      type: "weather",
      domain: "lighting",
      knowledge: [
        "weather 的降雨、降雪和云覆盖率接入原生 WorldEnvironmentRuntime。降雨同时驱动已有的湿润地表和涟漪。光源时刻和光照能量由 lighting 独立控制，不通过材质主题色推断天气。"
      ]
    }
  ]
};
const applied = new WeakMap<
  WorldEnvironmentRuntime,
  { signature: string; cloudScale?: string; hasSurfaceTuning: boolean }
>();
/** Reapply only changed author inputs; ordinary layout edits do not restart weather transitions. */
export function applyPlanningWeather(
  environment: WorldEnvironmentRuntime,
  values: Record<string, unknown> | undefined
): void {
  if (!values) return;
  const signature = JSON.stringify(values);
  const previous = applied.get(environment);
  if (previous?.signature === signature) return;
  const { cloudBaseAltitudeM, cloudFeatureSize } = values;
  const cloudScale =
    cloudBaseAltitudeM === undefined && cloudFeatureSize === undefined
      ? undefined
      : JSON.stringify([cloudBaseAltitudeM, cloudFeatureSize]);
  if (cloudScale !== previous?.cloudScale) {
    const defaults = TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS;
    const size = Number(cloudFeatureSize ?? 1);
    environment.setCloudScaleSettings({
      baseAltitude: Number(cloudBaseAltitudeM ?? defaults.baseAltitude),
      shapeScale: defaults.shapeScale / size,
      detailScale: defaults.detailScale / size
    });
  }
  const current = environment.weatherSystem.getSnapshot();
  environment.setCloud({ ...current.cloud, cloudCoverage: Number(values.cloudCoverage) });
  environment.setPrecipitation({
    rainRate: Number(values.rainRate),
    snowRate: Number(values.snowRate),
    temperatureCelsius: Number(values.temperatureCelsius),
    relativeHumidity: Number(values.relativeHumidity)
  });
  if (previous?.hasSurfaceTuning) environment.resetSurfaceWaterTuning();
  const tuning = {
    ...(values.surfaceWaterCoverage === undefined ? {} : { coverageMultiplier: Number(values.surfaceWaterCoverage) }),
    ...(values.puddleStorageBias === undefined ? {} : { puddleStorageBias: Number(values.puddleStorageBias) }),
    ...(values.surfaceReflectionIntensity === undefined
      ? {}
      : { reflectionIntensity: Number(values.surfaceReflectionIntensity) }),
    ...(values.surfaceSsrMix === undefined ? {} : { ssrMix: Number(values.surfaceSsrMix) }),
    ...(values.surfaceRoughness === undefined
      ? {}
      : {
          thinFilmRoughness: Number(values.surfaceRoughness),
          standingWaterRoughness: Number(values.surfaceRoughness)
        }),
    ...(values.standingWaterRoughness === undefined
      ? {}
      : { standingWaterRoughness: Number(values.standingWaterRoughness) }),
    ...(values.surfaceNormalFlattening === undefined
      ? {}
      : { normalFlattening: Number(values.surfaceNormalFlattening) }),
    ...(values.surfaceRippleStrength === undefined
      ? {}
      : { rippleNormalStrength: Number(values.surfaceRippleStrength) })
  };
  const hasSurfaceTuning = Object.keys(tuning).length > 0;
  if (hasSurfaceTuning) environment.applySurfaceWaterTuning(tuning);
  applied.set(environment, { signature, cloudScale, hasSurfaceTuning });
}
