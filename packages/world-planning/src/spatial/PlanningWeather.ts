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
    { key: "relativeHumidity", label: "相对湿度", type: "number", min: 0, max: 1, unit: "比例", default: 0.38 }
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
const applied = new WeakMap<WorldEnvironmentRuntime, { signature: string; cloudScale?: string }>();
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
  applied.set(environment, { signature, cloudScale });
}
