import * as dat from "dat.gui";
import {
  Camera,
  ScreenSpaceReflectionActivationMode,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionReceiverMode,
  ScreenSpaceReflectionReceiverPolicy
} from "@galacean/engine";
import type { DebugInspectorPanelHost } from "./DebugInspector";
import {
  TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES,
  TERRAIN_SCREEN_SPACE_REFLECTION_MIN_THICKNESS_METRES,
  TERRAIN_SCREEN_SPACE_REFLECTION_RAY_LENGTH_FADE_METRES,
  TERRAIN_SCREEN_SPACE_REFLECTION_RESOLUTION_SCALE
} from "@galacean/engine-environment/terrain/lighting/TerrainScreenSpaceReflectionTuning";

/** Stable SSR trace-quality names exposed by the Terrain debug panel. */
export type TerrainScreenSpaceReflectionPanelQuality = "low" | "medium" | "high";

/** Stable receiver policies exposed by the Terrain debug panel. */
export type TerrainScreenSpaceReflectionPanelReceiverPolicy = "explicit-only" | "standard-pbr-auto";

/** Browser-stable configuration values edited by the Integrated World SSR panel. */
export interface TerrainScreenSpaceReflectionPanelConfiguration {
  readonly globalEnabled: boolean;
  readonly receiverPolicy: TerrainScreenSpaceReflectionPanelReceiverPolicy;
  readonly quality: TerrainScreenSpaceReflectionPanelQuality;
  readonly resolutionScale: number;
  readonly intensity: number;
  readonly maxRayDistance: number;
  readonly rayLengthFade: number;
  readonly maxRaySteps: number;
  readonly hitRefinementSteps: number;
  readonly thickness: number;
  readonly maxRoughness: number;
  readonly edgeFade: number;
  readonly waterQuality: TerrainScreenSpaceReflectionPanelQuality;
  readonly waterResolutionScale: number;
  readonly waterRayLengthFade: number;
  readonly waterMaxRaySteps: number;
  readonly waterHitRefinementSteps: number;
  readonly waterThickness: number;
  readonly waterMaxRoughness: number;
  readonly waterEdgeFade: number;
}

/** Production SSR trace settings; activation remains consumer-driven in `Auto`. */
export type TerrainScreenSpaceReflectionAutomaticConfiguration = Omit<
  TerrainScreenSpaceReflectionPanelConfiguration,
  "globalEnabled"
>;

/** Canonical consumer-driven Integrated World SSR configuration shared by every Terrain page. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION: TerrainScreenSpaceReflectionAutomaticConfiguration =
  Object.freeze({
    receiverPolicy: "explicit-only",
    quality: "high",
    resolutionScale: TERRAIN_SCREEN_SPACE_REFLECTION_RESOLUTION_SCALE,
    intensity: 1,
    maxRayDistance: TERRAIN_SCREEN_SPACE_REFLECTION_MAX_RAY_DISTANCE_METRES,
    rayLengthFade: TERRAIN_SCREEN_SPACE_REFLECTION_RAY_LENGTH_FADE_METRES,
    maxRaySteps: 64,
    hitRefinementSteps: 5,
    thickness: TERRAIN_SCREEN_SPACE_REFLECTION_MIN_THICKNESS_METRES,
    maxRoughness: 0.7,
    edgeFade: 0.06,
    waterQuality: "high",
    waterResolutionScale: TERRAIN_SCREEN_SPACE_REFLECTION_RESOLUTION_SCALE,
    waterRayLengthFade: TERRAIN_SCREEN_SPACE_REFLECTION_RAY_LENGTH_FADE_METRES,
    waterMaxRaySteps: 64,
    waterHitRefinementSteps: 5,
    waterThickness: TERRAIN_SCREEN_SPACE_REFLECTION_MIN_THICKNESS_METRES,
    waterMaxRoughness: 0.7,
    waterEdgeFade: 0.02
  });

type TerrainScreenSpaceReflectionPanelResolvedSettings = Pick<
  TerrainScreenSpaceReflectionPanelConfiguration,
  | "quality"
  | "resolutionScale"
  | "intensity"
  | "maxRayDistance"
  | "rayLengthFade"
  | "maxRaySteps"
  | "hitRefinementSteps"
  | "thickness"
  | "maxRoughness"
  | "edgeFade"
>;

/** Live Camera and Water readback rendered by the Integrated World SSR panel. */
export interface TerrainScreenSpaceReflectionPanelStatus {
  readonly configuration: TerrainScreenSpaceReflectionPanelConfiguration;
  readonly activationMode: "auto" | "force-on" | "force-off";
  readonly requested: boolean;
  readonly effective: boolean;
  readonly supported: boolean;
  readonly requestedByManual: boolean;
  readonly requestedByConsumers: boolean;
  readonly activeConsumerLeaseCount: number;
  readonly resolvedSettings: TerrainScreenSpaceReflectionPanelResolvedSettings;
  readonly opaqueResolvedSettings: TerrainScreenSpaceReflectionPanelResolvedSettings;
  readonly transparentResolvedSettings: TerrainScreenSpaceReflectionPanelResolvedSettings;
  readonly width: number;
  readonly height: number;
  readonly renderTargetCount: number;
  readonly estimatedBytes: number;
  readonly opaqueSurfacePassDrawCount: number;
  readonly transparentSurfacePassDrawCount: number;
  readonly inactiveReason: string | null;
  readonly unsupportedReason: string | null;
  readonly water: {
    readonly requestedMode: "environment" | "ssr";
    readonly effectiveSource: "sky" | "probe" | "ssr";
    readonly fallbackReason?: string;
  } | null;
}

/** Water reflection readback consumed by the shared SSR status panel. */
export interface TerrainScreenSpaceReflectionPanelWater {
  /** Requested Water reflection mode. */
  readonly reflectionMode: "environment" | "ssr";

  /**
   * Returns the current effective reflection source.
   * @returns Water reflection diagnostics, or `null` before Water is ready.
   */
  getDiagnostics(): {
    readonly effectiveReflectionSource: "sky" | "probe" | "ssr";
    readonly reflectionFallbackReason?: string;
  } | null;
}

/**
 * Applies the canonical panel contract to the Camera-owned SSR runtime.
 * This camera-global control never changes Water reflection mode or releases consumer leases.
 * @param camera Camera whose SSR runtime receives the configuration.
 * @param configuration Partial configuration selected by startup or the panel.
 * @returns Nothing.
 * @throws If the configuration is invalid or the Camera does not expose SSR.
 */
export function applyScreenSpaceReflectionConfiguration(
  camera: Camera,
  configuration: Partial<TerrainScreenSpaceReflectionPanelConfiguration>
): void {
  if (!configuration || typeof configuration !== "object") {
    throw new TypeError("Terrain SSR configuration must be an object.");
  }
  const target = cameraScreenSpaceReflection(camera);
  if (configuration.globalEnabled !== undefined) {
    if (typeof configuration.globalEnabled !== "boolean") {
      throw new TypeError("Terrain global SSR state must be boolean.");
    }
    target.activationMode = configuration.globalEnabled
      ? ScreenSpaceReflectionActivationMode.ForceOn
      : ScreenSpaceReflectionActivationMode.ForceOff;
  }
  if (configuration.receiverPolicy !== undefined) {
    target.receiverPolicy = resolveScreenSpaceReflectionReceiverPolicy(configuration.receiverPolicy);
  }
  if (configuration.quality !== undefined) {
    target.quality = resolveScreenSpaceReflectionQuality(configuration.quality);
  }
  if (configuration.resolutionScale !== undefined) {
    target.resolutionScale = requireScreenSpaceReflectionSetting(
      configuration.resolutionScale,
      "resolutionScale",
      0.25,
      1
    );
  }
  if (configuration.intensity !== undefined) {
    target.intensity = requireScreenSpaceReflectionSetting(configuration.intensity, "intensity", 0, 1);
  }
  const sharedMaxRayDistance =
    configuration.maxRayDistance !== undefined
      ? requireScreenSpaceReflectionSetting(configuration.maxRayDistance, "maxRayDistance", 1, 200)
      : undefined;
  if (sharedMaxRayDistance !== undefined) target.maxRayDistance = sharedMaxRayDistance;
  if (configuration.rayLengthFade !== undefined) {
    target.rayLengthFade = requireScreenSpaceReflectionSetting(configuration.rayLengthFade, "rayLengthFade", 0, 200);
  }
  if (configuration.maxRaySteps !== undefined) {
    target.maxRaySteps = requireIntegerScreenSpaceReflectionSetting(configuration.maxRaySteps, "maxRaySteps", 1, 64);
  }
  if (configuration.hitRefinementSteps !== undefined) {
    target.hitRefinementSteps = requireIntegerScreenSpaceReflectionSetting(
      configuration.hitRefinementSteps,
      "hitRefinementSteps",
      0,
      5
    );
  }
  if (configuration.thickness !== undefined) {
    target.thickness = requireScreenSpaceReflectionSetting(configuration.thickness, "thickness", 0.01, 2);
  }
  if (configuration.maxRoughness !== undefined) {
    target.maxRoughness = requireScreenSpaceReflectionSetting(configuration.maxRoughness, "maxRoughness", 0, 1);
  }
  if (configuration.edgeFade !== undefined) {
    target.edgeFade = requireScreenSpaceReflectionSetting(configuration.edgeFade, "edgeFade", 0, 0.5);
  }
  if (
    sharedMaxRayDistance !== undefined ||
    configuration.waterQuality !== undefined ||
    configuration.waterResolutionScale !== undefined ||
    configuration.waterRayLengthFade !== undefined ||
    configuration.waterMaxRaySteps !== undefined ||
    configuration.waterHitRefinementSteps !== undefined ||
    configuration.waterThickness !== undefined ||
    configuration.waterMaxRoughness !== undefined ||
    configuration.waterEdgeFade !== undefined
  ) {
    const current = target.metrics.transparentResolvedSettings;
    const waterQuality =
      configuration.waterQuality !== undefined
        ? resolveScreenSpaceReflectionQuality(configuration.waterQuality)
        : current.quality;
    const qualityTuning = resolveScreenSpaceReflectionQualityTuning(waterQuality);
    target.setReceiverTraceSettingsOverride(ScreenSpaceReflectionReceiverMode.TransparentSampleOnly, {
      quality: waterQuality,
      resolutionScale:
        configuration.waterResolutionScale !== undefined
          ? requireScreenSpaceReflectionSetting(configuration.waterResolutionScale, "waterResolutionScale", 0.25, 1)
          : current.resolutionScale,
      maxRayDistance: sharedMaxRayDistance ?? current.maxRayDistance,
      rayLengthFade:
        configuration.waterRayLengthFade !== undefined
          ? requireScreenSpaceReflectionSetting(configuration.waterRayLengthFade, "waterRayLengthFade", 0, 200)
          : current.rayLengthFade,
      maxRaySteps:
        configuration.waterMaxRaySteps !== undefined
          ? requireIntegerScreenSpaceReflectionSetting(configuration.waterMaxRaySteps, "waterMaxRaySteps", 1, 64)
          : configuration.waterQuality !== undefined
            ? qualityTuning.maxRaySteps
            : current.maxRaySteps,
      hitRefinementSteps:
        configuration.waterHitRefinementSteps !== undefined
          ? requireIntegerScreenSpaceReflectionSetting(
              configuration.waterHitRefinementSteps,
              "waterHitRefinementSteps",
              0,
              5
            )
          : configuration.waterQuality !== undefined
            ? qualityTuning.hitRefinementSteps
            : current.hitRefinementSteps,
      thickness:
        configuration.waterThickness !== undefined
          ? requireScreenSpaceReflectionSetting(configuration.waterThickness, "waterThickness", 0.01, 2)
          : current.thickness,
      maxRoughness:
        configuration.waterMaxRoughness !== undefined
          ? requireScreenSpaceReflectionSetting(configuration.waterMaxRoughness, "waterMaxRoughness", 0, 1)
          : current.maxRoughness,
      edgeFade:
        configuration.waterEdgeFade !== undefined
          ? requireScreenSpaceReflectionSetting(configuration.waterEdgeFade, "waterEdgeFade", 0, 0.5)
          : current.edgeFade
    });
  }
}

/**
 * Applies production trace settings while explicitly restoring consumer-driven activation.
 * Debug controls continue to use `applyScreenSpaceReflectionConfiguration` so an operator can
 * force the feature on or off without releasing independent Water or Terrain consumer leases.
 */
export function applyAutomaticScreenSpaceReflectionConfiguration(
  camera: Camera,
  configuration: Partial<TerrainScreenSpaceReflectionAutomaticConfiguration>
): void {
  applyScreenSpaceReflectionConfiguration(camera, configuration);
  cameraScreenSpaceReflection(camera).activationMode = ScreenSpaceReflectionActivationMode.Auto;
}

/**
 * Reads the Camera and optional Water state rendered by the shared SSR panel.
 * @param camera Camera whose SSR runtime owns the pipeline state.
 * @param water Optional Water runtime supplying reflection fallback state.
 * @returns Detached browser-stable panel status.
 * @throws If the Camera does not expose SSR.
 */
export function inspectScreenSpaceReflectionPanelStatus(
  camera: Camera,
  water: TerrainScreenSpaceReflectionPanelWater | null = null
): TerrainScreenSpaceReflectionPanelStatus {
  const target = cameraScreenSpaceReflection(camera);
  const metrics = target.metrics;
  const waterSnapshot = water?.getDiagnostics() ?? null;
  return Object.freeze({
    configuration: Object.freeze({
      globalEnabled: metrics.globalEnabled,
      receiverPolicy: formatScreenSpaceReflectionReceiverPolicy(target.receiverPolicy),
      quality: formatScreenSpaceReflectionQuality(target.quality),
      resolutionScale: target.resolutionScale,
      intensity: target.intensity,
      maxRayDistance: target.maxRayDistance,
      rayLengthFade: target.rayLengthFade,
      maxRaySteps: target.maxRaySteps,
      hitRefinementSteps: target.hitRefinementSteps,
      thickness: target.thickness,
      maxRoughness: target.maxRoughness,
      edgeFade: target.edgeFade,
      waterQuality: formatScreenSpaceReflectionQuality(metrics.transparentResolvedSettings.quality),
      waterResolutionScale: metrics.transparentResolvedSettings.resolutionScale,
      waterRayLengthFade: metrics.transparentResolvedSettings.rayLengthFade,
      waterMaxRaySteps: metrics.transparentResolvedSettings.maxRaySteps,
      waterHitRefinementSteps: metrics.transparentResolvedSettings.hitRefinementSteps,
      waterThickness: metrics.transparentResolvedSettings.thickness,
      waterMaxRoughness: metrics.transparentResolvedSettings.maxRoughness,
      waterEdgeFade: metrics.transparentResolvedSettings.edgeFade
    }),
    activationMode: formatScreenSpaceReflectionActivationMode(target.activationMode),
    requested: metrics.requested,
    effective: metrics.effective,
    supported: metrics.supported,
    requestedByManual: metrics.requestedByManual,
    requestedByConsumers: metrics.requestedByConsumers,
    activeConsumerLeaseCount: metrics.activeConsumerLeaseCount,
    resolvedSettings: freezeResolvedSettings(metrics.resolvedSettings),
    opaqueResolvedSettings: freezeResolvedSettings(metrics.opaqueResolvedSettings),
    transparentResolvedSettings: freezeResolvedSettings(metrics.transparentResolvedSettings),
    width: metrics.width,
    height: metrics.height,
    renderTargetCount: metrics.renderTargetCount,
    estimatedBytes: metrics.estimatedBytes,
    opaqueSurfacePassDrawCount: metrics.opaqueSurfacePassDrawCount,
    transparentSurfacePassDrawCount: metrics.transparentSurfacePassDrawCount,
    inactiveReason: metrics.inactiveReason,
    unsupportedReason: metrics.unsupportedReason,
    water:
      water && waterSnapshot
        ? Object.freeze({
            requestedMode: water.reflectionMode,
            effectiveSource: waterSnapshot.effectiveReflectionSource,
            fallbackReason: waterSnapshot.reflectionFallbackReason
          })
        : null
  });
}

function cameraScreenSpaceReflection(camera: Camera): Camera["screenSpaceReflection"] {
  const target = camera.screenSpaceReflection;
  if (!target) throw new Error("Terrain camera does not expose the expected screen-space reflection API.");
  return target;
}

/** Inputs for the Water SSR folder mounted in the shared Terrain controls. */
export interface TerrainScreenSpaceReflectionPanelOptions {
  readonly readStatus: () => TerrainScreenSpaceReflectionPanelStatus;
  readonly applyConfiguration: (configuration: Partial<TerrainScreenSpaceReflectionPanelConfiguration>) => void;
}

type MutableConfiguration = {
  -readonly [K in keyof TerrainScreenSpaceReflectionPanelConfiguration]: TerrainScreenSpaceReflectionPanelConfiguration[K];
};

const PANEL_UPDATE_INTERVAL_MS = 250;

/**
 * Mounts the advanced SSR controls below Water without changing Water
 * reflection mode, so disabling global SSR only leaves the environment fallback.
 */
export class TerrainScreenSpaceReflectionPanel {
  private readonly _folder: dat.GUI;
  private readonly _options: TerrainScreenSpaceReflectionPanelOptions;
  private readonly _state: MutableConfiguration;
  private readonly _configurationControllers: readonly dat.GUIController[];
  private readonly _updatePipelineStatus: (value: string) => void;
  private readonly _updateResolvedStatus: (value: string) => void;
  private readonly _updateResourceStatus: (value: string) => void;
  private readonly _updateWaterStatus: (value: string) => void;
  private _updateTimer = 0;
  private _destroyed = false;

  constructor(inspector: DebugInspectorPanelHost, options: TerrainScreenSpaceReflectionPanelOptions) {
    this._options = options;
    this._state = { ...options.readStatus().configuration };

    const folder = (this._folder = inspector.gui);
    folder.domElement.id = "ssr-control-panel";

    const globalEnabled = folder
      .add(this._state, "globalEnabled")
      .name("Enabled / 全局开启")
      .onChange((enabled: boolean) => this._applyConfiguration({ globalEnabled: enabled }));
    setControllerIdentity(globalEnabled, "ssr-global-enabled", "Global screen-space reflection enabled");

    const receiverPolicy = folder
      .add(this._state, "receiverPolicy", {
        "Standard PBR · Auto / 自动": "standard-pbr-auto",
        "Explicit only / 仅显式接收": "explicit-only"
      })
      .name("Receiver / 接收策略")
      .onChange((policy: TerrainScreenSpaceReflectionPanelReceiverPolicy) =>
        this._applyConfiguration({ receiverPolicy: policy })
      );
    setControllerIdentity(receiverPolicy, "ssr-receiver-policy", "SSR receiver policy");

    const intensity = folder
      .add(this._state, "intensity", 0, 1, 0.01)
      .name("Intensity / 全局强度")
      .onChange((value: number) => this._applyConfiguration({ intensity: value }));
    setControllerIdentity(intensity, "ssr-intensity", "Global SSR intensity");

    const maxRayDistance = folder
      .add(this._state, "maxRayDistance", 1, 200, 1)
      .name("Shared reach / 共享距离")
      .onChange((value: number) => this._applyConfiguration({ maxRayDistance: value }));
    setControllerIdentity(maxRayDistance, "ssr-max-distance", "Shared SSR maximum ray distance");

    const trace = inspector.subfolder(folder, "Scene PBR Trace / 场景 PBR 追踪", true);
    const quality = trace
      .add(this._state, "quality", {
        "Low / 低": "low",
        "Medium / 中": "medium",
        "High / 高": "high"
      })
      .name("Quality / 质量")
      .onChange((value: TerrainScreenSpaceReflectionPanelQuality) => this._applyConfiguration({ quality: value }));
    setControllerIdentity(quality, "ssr-quality", "SSR trace quality");

    const resolutionScale = trace
      .add(this._state, "resolutionScale", 0.25, 1, 0.05)
      .name("Resolution / 分辨率")
      .onChange((value: number) => this._applyConfiguration({ resolutionScale: value }));
    setControllerIdentity(resolutionScale, "ssr-resolution-scale", "SSR linear resolution scale");

    const rayLengthFade = trace
      .add(this._state, "rayLengthFade", 0, 200, 0.1)
      .name("Ray fade / 射线末端淡出")
      .onChange((value: number) => this._applyConfiguration({ rayLengthFade: value }));
    setControllerIdentity(rayLengthFade, "ssr-ray-length-fade", "SSR world-space ray length fade");

    const maxRaySteps = trace
      .add(this._state, "maxRaySteps", 1, 64, 1)
      .name("Ray steps / 追踪步数")
      .onChange((value: number) => this._applyConfiguration({ maxRaySteps: value }));
    setControllerIdentity(maxRaySteps, "ssr-max-ray-steps", "SSR maximum linear ray steps");

    const hitRefinementSteps = trace
      .add(this._state, "hitRefinementSteps", 0, 5, 1)
      .name("Hit refine / 命中细化")
      .onChange((value: number) => this._applyConfiguration({ hitRefinementSteps: value }));
    setControllerIdentity(hitRefinementSteps, "ssr-hit-refinement-steps", "SSR hit refinement steps");

    const thickness = trace
      .add(this._state, "thickness", 0.01, 2, 0.01)
      .name("Thickness floor / 厚度下限")
      .onChange((value: number) => this._applyConfiguration({ thickness: value }));
    setControllerIdentity(thickness, "ssr-thickness", "SSR depth-thickness floor");

    const maxRoughness = trace
      .add(this._state, "maxRoughness", 0, 1, 0.01)
      .name("Max roughness / 最大粗糙度")
      .onChange((value: number) => this._applyConfiguration({ maxRoughness: value }));
    setControllerIdentity(maxRoughness, "ssr-max-roughness", "SSR maximum receiver roughness");

    const edgeFade = trace
      .add(this._state, "edgeFade", 0, 0.5, 0.01)
      .name("Edge fade / 边缘淡出")
      .onChange((value: number) => this._applyConfiguration({ edgeFade: value }));
    setControllerIdentity(edgeFade, "ssr-edge-fade", "SSR viewport edge fade");

    const waterTrace = inspector.subfolder(folder, "Water Trace / 水面追踪", true);
    const waterQuality = waterTrace
      .add(this._state, "waterQuality", {
        "Low / 低": "low",
        "Medium / 中": "medium",
        "High / 高": "high"
      })
      .name("Quality / 质量")
      .onChange((value: TerrainScreenSpaceReflectionPanelQuality) => this._applyConfiguration({ waterQuality: value }));
    setControllerIdentity(waterQuality, "ssr-water-quality", "Water SSR trace quality");

    const waterResolutionScale = waterTrace
      .add(this._state, "waterResolutionScale", 0.25, 1, 0.05)
      .name("Resolution / 分辨率")
      .onChange((value: number) => this._applyConfiguration({ waterResolutionScale: value }));
    setControllerIdentity(waterResolutionScale, "ssr-water-resolution-scale", "Water SSR linear resolution scale");

    const waterRayLengthFade = waterTrace
      .add(this._state, "waterRayLengthFade", 0, 200, 0.1)
      .name("Ray fade / 射线末端淡出")
      .onChange((value: number) => this._applyConfiguration({ waterRayLengthFade: value }));
    setControllerIdentity(waterRayLengthFade, "ssr-water-ray-length-fade", "Water SSR world-space ray length fade");

    const waterMaxRaySteps = waterTrace
      .add(this._state, "waterMaxRaySteps", 1, 64, 1)
      .name("Ray steps / 追踪步数")
      .onChange((value: number) => this._applyConfiguration({ waterMaxRaySteps: value }));
    setControllerIdentity(waterMaxRaySteps, "ssr-water-max-ray-steps", "Water SSR maximum linear ray steps");

    const waterHitRefinementSteps = waterTrace
      .add(this._state, "waterHitRefinementSteps", 0, 5, 1)
      .name("Hit refine / 命中细化")
      .onChange((value: number) => this._applyConfiguration({ waterHitRefinementSteps: value }));
    setControllerIdentity(waterHitRefinementSteps, "ssr-water-hit-refinement-steps", "Water SSR hit refinement steps");

    const waterThickness = waterTrace
      .add(this._state, "waterThickness", 0.01, 2, 0.01)
      .name("Thickness floor / 厚度下限")
      .onChange((value: number) => this._applyConfiguration({ waterThickness: value }));
    setControllerIdentity(waterThickness, "ssr-water-thickness", "Water SSR depth-thickness floor");

    const waterMaxRoughness = waterTrace
      .add(this._state, "waterMaxRoughness", 0, 1, 0.01)
      .name("Max roughness / 最大粗糙度")
      .onChange((value: number) => this._applyConfiguration({ waterMaxRoughness: value }));
    setControllerIdentity(waterMaxRoughness, "ssr-water-max-roughness", "Water SSR maximum receiver roughness");

    const waterEdgeFade = waterTrace
      .add(this._state, "waterEdgeFade", 0, 0.5, 0.01)
      .name("Edge fade / 边缘淡出")
      .onChange((value: number) => this._applyConfiguration({ waterEdgeFade: value }));
    setControllerIdentity(waterEdgeFade, "ssr-water-edge-fade", "Water SSR viewport edge fade");

    this._configurationControllers = [
      globalEnabled,
      receiverPolicy,
      quality,
      resolutionScale,
      rayLengthFade,
      maxRaySteps,
      hitRefinementSteps,
      intensity,
      maxRayDistance,
      thickness,
      maxRoughness,
      edgeFade,
      waterQuality,
      waterResolutionScale,
      waterRayLengthFade,
      waterMaxRaySteps,
      waterHitRefinementSteps,
      waterThickness,
      waterMaxRoughness,
      waterEdgeFade
    ];

    const runtime = inspector.subfolder(folder, "Runtime Status / 运行状态", true);
    this._updatePipelineStatus = inspector.addReadout(runtime, "Pipeline / 管线", "ssr-status-activation");
    this._updateResolvedStatus = inspector.addReadout(runtime, "Resolved Settings / 生效参数", "ssr-status-resolved");
    this._updateResourceStatus = inspector.addReadout(runtime, "Resources / 资源", "ssr-status-resources");
    this._updateWaterStatus = inspector.addReadout(runtime, "Water Integration / 水体接入", "ssr-status-fallback");

    this.refresh();
    this._updateTimer = window.setInterval(() => this.refresh(), PANEL_UPDATE_INTERVAL_MS);
  }

  /** Synchronizes controls and readouts from live Camera and Water state. */
  refresh(): void {
    if (this._destroyed) return;
    const status = this._options.readStatus();
    this._syncConfiguration(status.configuration);
    this._folder.domElement.dataset.effective = String(status.effective);
    this._folder.domElement.dataset.supported = String(status.supported);

    const requestState = status.effective
      ? "running"
      : !status.configuration.globalEnabled && status.requestedByConsumers
        ? "consumer demand dormant"
        : status.requested
          ? "requested · dormant"
          : "not requested";
    const reason = status.inactiveReason ?? status.unsupportedReason;
    this._updatePipelineStatus(
      `${status.effective ? "Active" : "Off"} · ${formatActivationMode(status.activationMode)} · ` +
        `${status.supported ? "supported" : "unsupported"}\n` +
        `${requestState} · ${status.activeConsumerLeaseCount} consumer lease${status.activeConsumerLeaseCount === 1 ? "" : "s"}` +
        `${reason ? `\n${reason}` : ""}`
    );
    this._updateResolvedStatus(
      `Scene PBR · ${formatResolvedSettings(status.opaqueResolvedSettings)}\n` +
        `Water / Transparent · ${formatResolvedSettings(status.transparentResolvedSettings)}`
    );
    this._updateResourceStatus(
      `${formatRenderTargets(status)}\n` +
        `receivers · opaque ${status.opaqueSurfacePassDrawCount} · transparent ${status.transparentSurfacePassDrawCount}\n` +
        `${status.effective ? "scene color + depth captured" : "scene capture paused"}`
    );
    this._updateWaterStatus(formatWaterFallback(status));
  }

  /** Stops status polling; the shared Terrain inspector owns DOM teardown. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    window.clearInterval(this._updateTimer);
    this._updateTimer = 0;
  }

  private _applyConfiguration(configuration: Partial<TerrainScreenSpaceReflectionPanelConfiguration>): void {
    this._options.applyConfiguration(configuration);
    requestAnimationFrame(() => this.refresh());
  }

  private _syncConfiguration(configuration: TerrainScreenSpaceReflectionPanelConfiguration): void {
    Object.assign(this._state, configuration);
    const activeElement = document.activeElement;
    for (const controller of this._configurationControllers) {
      if (!activeElement || !controller.domElement.contains(activeElement)) controller.updateDisplay();
    }
  }
}

function setControllerIdentity(controller: dat.GUIController, id: string, label: string): void {
  const input = controller.domElement.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
  if (!input) throw new Error(`[Terrain SSR panel] Controller ${id} has no editable input`);
  input.id = id;
  input.setAttribute("aria-label", label);
  const row = controller.domElement.parentElement;
  if (row) row.id = `${id}-control`;
}

function formatActivationMode(mode: TerrainScreenSpaceReflectionPanelStatus["activationMode"]): string {
  switch (mode) {
    case "force-on":
      return "Force On";
    case "force-off":
      return "Force Off";
    default:
      return "Auto";
  }
}

function formatResolvedSettings(settings: TerrainScreenSpaceReflectionPanelResolvedSettings): string {
  return (
    `${formatQuality(settings.quality)} · intensity ${settings.intensity.toFixed(2)} · ` +
    `resolution ${settings.resolutionScale.toFixed(2)}× · distance ${settings.maxRayDistance.toFixed(0)} m · ` +
    `fade ${settings.rayLengthFade.toFixed(1)} m\n` +
    `steps ${settings.maxRaySteps} + refine ${settings.hitRefinementSteps} · ` +
    `thickness floor ${settings.thickness.toFixed(2)} m\n` +
    `roughness ≤ ${settings.maxRoughness.toFixed(2)} · edge fade ${settings.edgeFade.toFixed(2)}`
  );
}

function formatQuality(quality: TerrainScreenSpaceReflectionPanelQuality): string {
  return `${quality[0].toUpperCase()}${quality.slice(1)}`;
}

function formatRenderTargets(status: TerrainScreenSpaceReflectionPanelStatus): string {
  return status.renderTargetCount > 0
    ? `RT ${status.renderTargetCount} · ${status.width}×${status.height} · ${formatBytes(status.estimatedBytes)}`
    : "RT 0 · released";
}

function formatWaterFallback(status: TerrainScreenSpaceReflectionPanelStatus): string {
  const water = status.water;
  if (!water) return "Water runtime unavailable";
  const source = formatReflectionSource(water.effectiveSource);
  if (water.requestedMode === "ssr" && water.effectiveSource !== "ssr") {
    const reason = water.fallbackReason ? ` · ${water.fallbackReason}` : "";
    return `Water requests SSR → ${source}${reason}`;
  }
  return "Water uses SSR · miss fallback Environment/Probe";
}

function resolveScreenSpaceReflectionReceiverPolicy(
  policy: TerrainScreenSpaceReflectionPanelReceiverPolicy
): ScreenSpaceReflectionReceiverPolicy {
  switch (policy) {
    case "explicit-only":
      return ScreenSpaceReflectionReceiverPolicy.ExplicitOnly;
    case "standard-pbr-auto":
      return ScreenSpaceReflectionReceiverPolicy.StandardPbrAuto;
    default:
      throw new RangeError(`Unsupported Terrain SSR receiver policy: ${String(policy)}`);
  }
}

function formatScreenSpaceReflectionReceiverPolicy(
  policy: ScreenSpaceReflectionReceiverPolicy
): TerrainScreenSpaceReflectionPanelReceiverPolicy {
  return policy === ScreenSpaceReflectionReceiverPolicy.StandardPbrAuto ? "standard-pbr-auto" : "explicit-only";
}

function resolveScreenSpaceReflectionQuality(
  quality: TerrainScreenSpaceReflectionPanelQuality
): ScreenSpaceReflectionQuality {
  switch (quality) {
    case "low":
      return ScreenSpaceReflectionQuality.Low;
    case "medium":
      return ScreenSpaceReflectionQuality.Medium;
    case "high":
      return ScreenSpaceReflectionQuality.High;
    default:
      throw new RangeError(`Unsupported Terrain SSR quality: ${String(quality)}`);
  }
}

function formatScreenSpaceReflectionQuality(
  quality: ScreenSpaceReflectionQuality
): TerrainScreenSpaceReflectionPanelQuality {
  switch (quality) {
    case ScreenSpaceReflectionQuality.Low:
      return "low";
    case ScreenSpaceReflectionQuality.High:
      return "high";
    default:
      return "medium";
  }
}

function formatScreenSpaceReflectionActivationMode(
  mode: ScreenSpaceReflectionActivationMode
): TerrainScreenSpaceReflectionPanelStatus["activationMode"] {
  switch (mode) {
    case ScreenSpaceReflectionActivationMode.ForceOn:
      return "force-on";
    case ScreenSpaceReflectionActivationMode.ForceOff:
      return "force-off";
    default:
      return "auto";
  }
}

function freezeResolvedSettings(settings: {
  readonly quality: ScreenSpaceReflectionQuality;
  readonly resolutionScale: number;
  readonly intensity: number;
  readonly maxRayDistance: number;
  readonly rayLengthFade: number;
  readonly maxRaySteps: number;
  readonly hitRefinementSteps: number;
  readonly thickness: number;
  readonly maxRoughness: number;
  readonly edgeFade: number;
}): TerrainScreenSpaceReflectionPanelStatus["resolvedSettings"] {
  return Object.freeze({
    quality: formatScreenSpaceReflectionQuality(settings.quality),
    resolutionScale: settings.resolutionScale,
    intensity: settings.intensity,
    maxRayDistance: settings.maxRayDistance,
    rayLengthFade: settings.rayLengthFade,
    maxRaySteps: settings.maxRaySteps,
    hitRefinementSteps: settings.hitRefinementSteps,
    thickness: settings.thickness,
    maxRoughness: settings.maxRoughness,
    edgeFade: settings.edgeFade
  });
}

function requireScreenSpaceReflectionSetting(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`Terrain SSR ${name} must be finite and within [${minimum}, ${maximum}].`);
  }
  return value;
}

function requireIntegerScreenSpaceReflectionSetting(
  value: number,
  name: string,
  minimum: number,
  maximum: number
): number {
  const validated = requireScreenSpaceReflectionSetting(value, name, minimum, maximum);
  if (!Number.isInteger(validated)) throw new RangeError(`Terrain SSR ${name} must be an integer.`);
  return validated;
}

function resolveScreenSpaceReflectionQualityTuning(quality: ScreenSpaceReflectionQuality): {
  readonly maxRaySteps: number;
  readonly hitRefinementSteps: number;
} {
  switch (quality) {
    case ScreenSpaceReflectionQuality.Low:
      return { maxRaySteps: 16, hitRefinementSteps: 2 };
    case ScreenSpaceReflectionQuality.High:
      return { maxRaySteps: 64, hitRefinementSteps: 5 };
    default:
      return { maxRaySteps: 32, hitRefinementSteps: 3 };
  }
}

function formatReflectionSource(
  source: NonNullable<TerrainScreenSpaceReflectionPanelStatus["water"]>["effectiveSource"]
): string {
  switch (source) {
    case "sky":
      return "Environment";
    case "probe":
      return "Probe";
    default:
      return "SSR";
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const mebibytes = bytes / (1024 * 1024);
  return mebibytes >= 0.1 ? `${mebibytes.toFixed(1)} MiB` : `${Math.round(bytes / 1024)} KiB`;
}
