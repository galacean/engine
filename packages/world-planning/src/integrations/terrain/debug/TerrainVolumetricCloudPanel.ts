import * as dat from "dat.gui";
import type {
  VolumetricCloudLightingProfile,
  VolumetricCloudQuality,
  VolumetricCloudScaleSettings,
  VolumetricCloudShapeSettings
} from "@galacean/engine";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import { WorldEnvironmentRuntime } from "../environment/WorldEnvironmentRuntime.ts";
import {
  describeTerrainVolumetricCloudScaleSettings,
  resolveTerrainVolumetricCloudScaleSettings,
  type TerrainVolumetricCloudAuthoringScaleSettings
} from "@galacean/engine-environment/terrain/environment/TerrainVolumetricCloudPreset";

type MutableProfile<Profile> = { -readonly [Key in keyof Profile]: Profile[Key] };
type MutableLightingProfile = MutableProfile<VolumetricCloudLightingProfile>;
type MutableShapeProfile = MutableProfile<VolumetricCloudShapeSettings>;
type LightingParameter = {
  [Key in keyof VolumetricCloudLightingProfile]: VolumetricCloudLightingProfile[Key] extends number ? Key : never;
}[keyof VolumetricCloudLightingProfile];
type ShapeParameter = keyof VolumetricCloudShapeSettings;
type NumericControl<Key extends string> = readonly [
  key: Key,
  label: string,
  minimum: number,
  maximum: number,
  step: number
];

interface CloudRenderState {
  quality: VolumetricCloudQuality;
  weatherSeed: number;
}

type CloudScaleState = MutableProfile<TerrainVolumetricCloudAuthoringScaleSettings>;

interface CloudTuningBaseline {
  readonly quality: VolumetricCloudQuality;
  readonly weatherSeed: number;
  readonly scaleSettings: Readonly<VolumetricCloudScaleSettings>;
  readonly shapeProfile: Readonly<VolumetricCloudShapeSettings>;
  readonly lightingProfile: Readonly<VolumetricCloudLightingProfile>;
}

const SHAPE_FORM_CONTROLS: ReadonlyArray<NumericControl<ShapeParameter>> = [
  ["bottomShape", "Bottom shape / 云底形态", -6, 2, 0.01],
  ["middleShape", "Middle shape / 云中形态", -8, 2, 0.01],
  ["topShape", "Top shape / 云顶形态", -10, 2, 0.01],
  ["rampShape", "Ramp / 形态坡度", 0.05, 3, 0.01],
  ["cloudTypeShaping", "Type shaping / 云型塑形", 0, 1, 0.005],
  ["profileTypeOffset", "Type offset / 云型偏移", -1, 1, 0.005],
  ["topDensityMultiplier", "Top density / 云顶密度", 0, 1, 0.005],
  ["topSkewRatio", "Top skew / 云顶倾斜", 0, 1, 0.005],
  ["envelopeScale", "Envelope / 外形包络", 0, 2, 0.01]
];

const SHAPE_EROSION_CONTROLS: ReadonlyArray<NumericControl<ShapeParameter>> = [
  ["baseErosionIntensity", "Base erosion / 基础侵蚀", 0, 1, 0.005],
  ["baseNoiseMultiplier", "Base noise / 基础噪声", 0.1, 3, 0.01],
  ["detailErosionScale", "Detail erosion / 细节侵蚀", 0, 2, 0.01],
  ["maxDetailErosion", "Max erosion / 最大侵蚀", 0, 1, 0.005],
  ["detailNoiseMultiplier", "Detail noise / 细节噪声", 0.1, 3, 0.01],
  ["curlIntensity", "Curl / 卷曲强度", 0, 2, 0.005],
  ["detailAnimationSpeed", "Detail speed / 细节速度", 0, 0.05, 0.0001],
  ["detailCurlFrequency", "Curl frequency / 卷曲频率", 0.1, 10, 0.01],
  ["detailCurlBlend", "Curl blend / 卷曲混合", 0, 1, 0.005],
  ["detailCurlExponent", "Curl exponent / 卷曲指数", 0.01, 2, 0.005],
  ["detailVerticalCurlStrength", "Vertical curl / 垂直卷曲", 0, 2, 0.005],
  ["detailHeightErosionScale", "Height erosion / 高度侵蚀", 0.1, 20, 0.05]
];

const SHAPE_FADE_CONTROLS: ReadonlyArray<NumericControl<ShapeParameter>> = [
  ["bottomFadeExponent", "Bottom exponent / 云底指数", 0.1, 24, 0.05],
  ["bottomFadeStrength", "Bottom fade / 云底淡化", 0, 4, 0.01],
  ["topFadeExponent", "Top exponent / 云顶指数", 0.1, 24, 0.05],
  ["topFadeStrength", "Top fade / 云顶淡化", 0, 4, 0.01],
  ["topCutoff", "Top cutoff / 云顶截断", 0.01, 1, 0.005]
];

const LIGHTING_OPTICAL_CONTROLS: ReadonlyArray<NumericControl<LightingParameter>> = [
  ["lightMarchDistanceScale", "March distance / 光照步进距离", 0.1, 3, 0.01],
  ["stormExtinctionMultiplier", "Storm extinction / 风暴消光", 0, 4, 0.01],
  ["extinctionScale", "Extinction / 消光系数", 0.00001, 0.1, 0.00001],
  ["densitySmoothness", "Density smoothness / 密度平滑", 0.25, 3, 0.01],
  ["singleScatteringAlbedo", "Single albedo / 单次散射反照率", 0.8, 1, 0.001],
  ["directionalEnergyScale", "Direct energy / 直射能量", 0, 3, 0.01],
  ["directionalEnergyCompression", "Direct compress / 直射压缩", 0, 2, 0.01],
  ["phaseForwardAnisotropy", "Forward phase / 前向相位", -0.95, 0.95, 0.005],
  ["phaseBackwardAnisotropy", "Backward phase / 后向相位", -0.95, 0.95, 0.005],
  ["phaseBlend", "Phase blend / 相位混合", 0, 1, 0.005],
  ["extinctionEdgeStart", "Edge start / 边缘消光起点", 0, 0.495, 0.005],
  ["extinctionEdgeEnd", "Edge end / 边缘消光终点", 0.005, 0.5, 0.005],
  ["edgeLightIntensity", "Edge light / 边缘光", 0, 4, 0.01]
];

const LIGHTING_AMBIENT_CONTROLS: ReadonlyArray<NumericControl<LightingParameter>> = [
  ["ambientSkyBottom", "Sky bottom / 云底天空光", 0, 1, 0.005],
  ["ambientSkyTop", "Sky top / 云顶天空光", 0, 1, 0.005],
  ["ambientGroundBottom", "Ground bottom / 云底地面光", 0, 1, 0.005],
  ["ambientGroundTop", "Ground top / 云顶地面光", 0, 1, 0.005],
  ["powderDensityScale", "Powder density / 粉末密度", 0, 8, 0.05],
  ["powderDirectMinimum", "Powder direct min / 粉末直射下限", 0, 3, 0.01],
  ["powderDirectMaximum", "Powder direct max / 粉末直射上限", 0, 3, 0.01],
  ["ambientSkyColorBlend", "Sky color blend / 天空色混合", 0, 1, 0.005],
  ["ambientGroundColorBlend", "Ground color blend / 地面色混合", 0, 1, 0.005],
  ["ambientShadowStrength", "Ambient shadow / 环境阴影", 0, 1, 0.005],
  ["stormAmbientMultiplier", "Storm ambient / 风暴环境光", 0, 2, 0.01]
];

const LIGHTING_SCATTERING_CONTROLS: ReadonlyArray<NumericControl<LightingParameter>> = [
  ["inscatteringDensityScale", "Inscatter density / 内散射密度", 0, 8, 0.05],
  ["multipleScatteringMinimum", "Scatter minimum / 多散射下限", 0, 1, 0.01],
  ["multipleScatteringOctaves", "Scatter octaves / 多散射层数", 1, 12, 1],
  ["multipleScatteringEnergyAttenuation", "Energy attenuation / 能量衰减", 0.05, 1, 0.005],
  ["multipleScatteringExtinctionAttenuation", "Extinction attenuation / 消光衰减", 0.05, 1, 0.005],
  ["multipleScatteringAnisotropyAttenuation", "Phase attenuation / 相位衰减", 0.05, 1, 0.005],
  ["multipleScatteringMaxOpticalDepth", "Max optical depth / 最大光学深度", 0.1, 16, 0.05]
];

const PANEL_UPDATE_INTERVAL_MS = 250;

/** Dat.gui authoring surface for the dedicated Volumetric Clouds category. */
export class TerrainVolumetricCloudPanel {
  private readonly _folder: dat.GUI;
  private readonly _environment: WorldEnvironmentRuntime;
  private readonly _baseline: CloudTuningBaseline;
  private readonly _renderState: CloudRenderState;
  private readonly _scaleState: CloudScaleState;
  private readonly _shapeState: MutableShapeProfile;
  private readonly _lightingState: MutableLightingProfile;
  private readonly _controllers: dat.GUIController[] = [];
  private readonly _updateReadout: (value: string) => void;
  private _updateTimer = 0;
  private _destroyed = false;

  constructor(inspector: DebugInspectorPanelHost, environment: WorldEnvironmentRuntime) {
    this._environment = environment;
    const clouds = environment.getSnapshot().clouds;
    this._baseline = {
      quality: clouds.quality,
      weatherSeed: clouds.weatherSeed,
      scaleSettings: { ...clouds.scaleSettings },
      shapeProfile: { ...clouds.shapeProfile },
      lightingProfile: { ...clouds.lightingProfile }
    };
    this._renderState = {
      quality: clouds.quality,
      weatherSeed: clouds.weatherSeed
    };
    this._scaleState = describeTerrainVolumetricCloudScaleSettings(clouds.scaleSettings);
    this._shapeState = { ...clouds.shapeProfile };
    this._lightingState = { ...clouds.lightingProfile };

    const folder = (this._folder = inspector.gui);
    folder.domElement.id = "volumetric-cloud-control-panel";

    this._addRenderControls(folder);
    this._addScaleControls(inspector, folder);
    this._addProfileControls(inspector, folder);
    this._updateReadout = inspector.addReadout(folder, "Runtime / 运行状态", "volumetric-cloud-status");
    inspector.addAction(folder, "Invalidate history / 清空历史缓存", () => environment.invalidateCloudHistory());
    inspector.addAction(folder, "Reset all / 恢复默认", () => this._reset());

    this.refresh();
    this._updateTimer = window.setInterval(() => this.refresh(), PANEL_UPDATE_INTERVAL_MS);
  }

  /** Synchronizes the panel from the live cloud runtime without interrupting the active editor. */
  refresh(): void {
    if (this._destroyed) return;
    const clouds = this._environment.getSnapshot().clouds;
    Object.assign(this._renderState, {
      quality: clouds.quality,
      weatherSeed: clouds.weatherSeed
    });
    Object.assign(this._scaleState, describeTerrainVolumetricCloudScaleSettings(clouds.scaleSettings));
    Object.assign(this._shapeState, clouds.shapeProfile);
    Object.assign(this._lightingState, clouds.lightingProfile);
    const activeElement = document.activeElement;
    for (const controller of this._controllers) {
      if (!activeElement || !controller.domElement.contains(activeElement)) controller.updateDisplay();
    }
    this._updateReadout(
      `${clouds.quality} · direction-cache · seed ${clouds.weatherSeed}\n` +
        `base ${clouds.scaleSettings.baseAltitude.toFixed(0)} m · ` +
        `${clouds.baseHeightAboveObserver.toFixed(0)} m above camera · ` +
        `${clouds.scaleSettings.thickness.toFixed(0)} m thick\n` +
        `weather ${this._scaleState.weatherSize.toFixed(2)}× · shape ${this._scaleState.shapeSize.toFixed(2)}× · ` +
        `detail ${this._scaleState.detailSize.toFixed(2)}× · extinction ${clouds.lightingProfile.extinctionScale.toFixed(5)}`
    );
  }

  /** Stops status polling; the shared Terrain inspector owns DOM teardown. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    window.clearInterval(this._updateTimer);
    this._updateTimer = 0;
  }

  private _addRenderControls(folder: dat.GUI): void {
    this._track(
      folder
        .add(this._renderState, "quality", {
          "Economy / 性能": "economy",
          "Balanced / 均衡": "balanced",
          "High / 高质量": "high"
        })
        .name("Quality / 云质量")
        .onChange((quality: VolumetricCloudQuality) => this._environment.setCloudQuality(quality)),
      "volumetric-cloud-quality",
      "Volumetric cloud quality"
    );
    this._track(
      folder
        .add(this._renderState, "weatherSeed", 0, 65535, 1)
        .name("Weather seed / 分布种子")
        .onFinishChange((seed: number) => this._environment.setCloudWeatherSeed(Math.round(Number(seed)))),
      "volumetric-cloud-weather-seed",
      "Volumetric cloud weather seed"
    );
  }

  private _addScaleControls(inspector: DebugInspectorPanelHost, folder: dat.GUI): void {
    const baseline = this._baseline.scaleSettings;
    const scale = inspector.subfolder(folder, "Layer & Distribution / 云层与分布", true);
    for (const control of [
      ["baseAltitude", "Base altitude / 云底高度", 1, Math.max(10_000, baseline.baseAltitude * 3), 1],
      ["thickness", "Thickness / 云层厚度", 100, Math.max(8_000, baseline.thickness * 3), 1],
      ["planetRadius", "Planet radius / 行星半径", baseline.planetRadius * 0.1, baseline.planetRadius * 4, 1],
      ["weatherSize", "Weather size / 天气团尺度", 0.1, 10, 0.01],
      ["shapeSize", "Shape size / 形态尺度", 0.1, 10, 0.01],
      ["detailSize", "Detail size / 细节尺度", 0.1, 10, 0.01],
      ["shapeVerticalFrequency", "Shape vertical / 形态垂直频率", 0.1, 8, 0.01],
      ["detailVerticalFrequency", "Detail vertical / 细节垂直频率", 0.1, 8, 0.01]
    ] as const) {
      const [key, label, minimum, maximum, step] = control;
      this._track(
        scale
          .add(this._scaleState, key, minimum, maximum, step)
          .name(label)
          .onChange(() => this._applyScale()),
        `volumetric-cloud-${toKebabCase(key)}`,
        `Volumetric cloud ${key}`
      );
    }
  }

  private _addProfileControls(inspector: DebugInspectorPanelHost, folder: dat.GUI): void {
    const shape = inspector.subfolder(folder, "Shape / 形态", true);
    this._addShapeControls(inspector.subfolder(shape, "Form / 外形", true), SHAPE_FORM_CONTROLS);
    this._addShapeControls(inspector.subfolder(shape, "Erosion & Curl / 侵蚀与卷曲", true), SHAPE_EROSION_CONTROLS);
    this._addShapeControls(inspector.subfolder(shape, "Height Fade / 高度淡化", true), SHAPE_FADE_CONTROLS);

    const lighting = inspector.subfolder(folder, "Lighting / 光照", true);
    this._addLightingControls(inspector.subfolder(lighting, "Optical / 光学", true), LIGHTING_OPTICAL_CONTROLS);
    this._addLightingControls(
      inspector.subfolder(lighting, "Ambient & Powder / 环境光与粉末", true),
      LIGHTING_AMBIENT_CONTROLS
    );
    this._addLightingControls(
      inspector.subfolder(lighting, "Multiple Scattering / 多重散射", true),
      LIGHTING_SCATTERING_CONTROLS
    );
  }

  private _addShapeControls(folder: dat.GUI, controls: ReadonlyArray<NumericControl<ShapeParameter>>): void {
    for (const [key, label, minimum, maximum, step] of controls) {
      this._track(
        folder
          .add(this._shapeState, key, minimum, maximum, step)
          .name(label)
          .onChange(() => this._environment.setCloudShapeProfile(this._shapeState)),
        `volumetric-cloud-shape-${toKebabCase(key)}`,
        `Volumetric cloud shape ${key}`
      );
    }
  }

  private _addLightingControls(folder: dat.GUI, controls: ReadonlyArray<NumericControl<LightingParameter>>): void {
    for (const [key, label, minimum, maximum, step] of controls) {
      this._track(
        folder
          .add(this._lightingState, key, minimum, maximum, step)
          .name(label)
          .onChange(() => this._applyLighting(key)),
        `volumetric-cloud-lighting-${toKebabCase(key)}`,
        `Volumetric cloud lighting ${key}`
      );
    }
  }

  private _applyScale(): void {
    this._environment.setCloudScaleSettings(resolveTerrainVolumetricCloudScaleSettings(this._scaleState));
  }

  private _applyLighting(changed: LightingParameter): void {
    const profile = this._lightingState;
    if (profile.powderDirectMinimum > profile.powderDirectMaximum) {
      if (changed === "powderDirectMinimum") profile.powderDirectMaximum = profile.powderDirectMinimum;
      else profile.powderDirectMinimum = profile.powderDirectMaximum;
    }
    if (profile.extinctionEdgeStart >= profile.extinctionEdgeEnd) {
      if (changed === "extinctionEdgeStart")
        profile.extinctionEdgeEnd = Math.min(0.5, profile.extinctionEdgeStart + 0.005);
      else profile.extinctionEdgeStart = Math.max(0, profile.extinctionEdgeEnd - 0.005);
    }
    this._environment.setCloudLightingProfile(profile);
  }

  private _reset(): void {
    const baseline = this._baseline;
    this._environment.setCloudQuality(baseline.quality);
    this._environment.setCloudScaleSettings(baseline.scaleSettings);
    this._environment.setCloudShapeProfile(baseline.shapeProfile);
    this._environment.setCloudLightingProfile(baseline.lightingProfile);
    this._environment.setCloudWeatherSeed(baseline.weatherSeed);
    this.refresh();
  }

  private _track(controller: dat.GUIController, id: string, label: string): void {
    const input = controller.domElement.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
    if (!input) throw new Error(`[Terrain volumetric-cloud panel] Controller ${id} has no editable input`);
    input.id = id;
    input.setAttribute("aria-label", label);
    const row = controller.domElement.parentElement;
    if (row) row.id = `${id}-control`;
    this._controllers.push(controller);
  }
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}
