import * as dat from "dat.gui";
import {
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionSettings,
  SSRRuntimeState,
  type Camera,
  type SSRDiagnostics
} from "@galacean/engine";
import { TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS } from "@galacean/engine-environment/terrain/lighting/TerrainScreenSpaceReflectionTuning";
import type { DebugInspectorPanelHost } from "./DebugInspector";

/** String-keyed SSR v2 quality presets exposed by the inspector UI. */
export type TerrainScreenSpaceReflectionPanelQuality = "low" | "medium" | "high" | "xhigh";

/** Editable v2 SSR settings bound to `scene.screenSpaceReflection` / `camera.screenSpaceReflectionOverride`. */
export interface TerrainScreenSpaceReflectionPanelConfiguration {
  readonly globalEnabled: boolean;
  readonly cameraEnabled: boolean;
  readonly useCameraOverride: boolean;
  readonly quality: TerrainScreenSpaceReflectionPanelQuality;
  readonly intensity: number;
  readonly maxRoughness: number;
  readonly maxDistance: number;
  readonly thickness: number;
  readonly edgeFade: number;
  readonly temporalBlend: number;
}

/** Default World SSR v2 settings profile synchronized across Terrain water film and Water surfaces. */
export const TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION: TerrainScreenSpaceReflectionPanelConfiguration = {
  globalEnabled: TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS.enabled,
  cameraEnabled: true,
  useCameraOverride: false,
  quality: formatScreenSpaceReflectionQuality(TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS.quality),
  intensity: TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS.intensity,
  maxRoughness: TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS.maxRoughness,
  maxDistance: TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS.maxDistance,
  thickness: TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS.thickness,
  edgeFade: TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS.edgeFade,
  temporalBlend: TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS.temporalBlend
};

/** Snapshot of active SSR settings and runtime pass diagnostics reported by `camera.screenSpaceReflectionDiagnostics`. */
export interface TerrainScreenSpaceReflectionPanelStatus {
  readonly configuration: TerrainScreenSpaceReflectionPanelConfiguration;
  readonly active: boolean;
  readonly state: SSRRuntimeState;
  readonly supported: boolean;
  readonly unsupportedReason: string | null;
  readonly traceWidth: number;
  readonly traceHeight: number;
  readonly estimatedBytes: number;
  readonly opaqueReceiverCount: number;
  readonly transparentReceiverCount: number;
  readonly useHardwareStencil: boolean;
  readonly usesPackedDepthRG8: boolean;
  readonly usesPackedNormalOct8: boolean;
}

/** Applies SSR v2 settings to `camera.enableScreenSpaceReflection`, `camera.screenSpaceReflectionOverride`, or `camera.scene.screenSpaceReflection`. */
export function applyScreenSpaceReflectionConfiguration(
  camera: Camera,
  configuration: Partial<TerrainScreenSpaceReflectionPanelConfiguration>
): void {
  if (configuration.cameraEnabled !== undefined) {
    camera.enableScreenSpaceReflection = Boolean(configuration.cameraEnabled);
  }
  const sceneSettings = camera.scene?.screenSpaceReflection ?? null;
  if (configuration.useCameraOverride === false) {
    camera.screenSpaceReflectionOverride = null;
  } else if (configuration.useCameraOverride === true && !camera.screenSpaceReflectionOverride) {
    const override = new ScreenSpaceReflectionSettings();
    if (sceneSettings) sceneSettings.cloneTo(override);
    camera.screenSpaceReflectionOverride = override;
  }

  const target = camera.screenSpaceReflectionOverride ?? sceneSettings;
  if (!target) {
    throw new Error("Camera.scene is required to apply scene-level SSR settings without a camera override.");
  }

  if (configuration.globalEnabled !== undefined) {
    target.enabled = Boolean(configuration.globalEnabled);
  }
  if (configuration.quality !== undefined) {
    target.quality = resolveScreenSpaceReflectionQuality(configuration.quality);
  }
  if (configuration.intensity !== undefined) {
    target.intensity = requireFiniteInRange(configuration.intensity, "intensity", 0, Number.POSITIVE_INFINITY);
  }
  if (configuration.maxRoughness !== undefined) {
    target.maxRoughness = requireFiniteInRange(configuration.maxRoughness, "maxRoughness", 0, 1);
  }
  if (configuration.maxDistance !== undefined) {
    target.maxDistance = requireFiniteInRange(configuration.maxDistance, "maxDistance", 0.1, 1000);
  }
  if (configuration.thickness !== undefined) {
    target.thickness = requireFiniteInRange(configuration.thickness, "thickness", 0.005, 5);
  }
  if (configuration.edgeFade !== undefined) {
    target.edgeFade = requireFiniteInRange(configuration.edgeFade, "edgeFade", 0, 0.5);
  }
  if (configuration.temporalBlend !== undefined) {
    target.temporalBlend = requireFiniteInRange(configuration.temporalBlend, "temporalBlend", 0, 0.95);
  }
}

/** Applies an automatic SSR preset configuration onto the scene/camera SSR v2 settings. */
export function applyAutomaticScreenSpaceReflectionConfiguration(
  camera: Camera,
  configuration: TerrainScreenSpaceReflectionPanelConfiguration
): void {
  applyScreenSpaceReflectionConfiguration(camera, configuration);
}

/** Reads the effective v2 SSR configuration and runtime diagnostics from `camera`. */
export function inspectScreenSpaceReflectionPanelStatus(camera: Camera): TerrainScreenSpaceReflectionPanelStatus {
  const override = camera.screenSpaceReflectionOverride;
  const source = override ?? camera.scene?.screenSpaceReflection ?? TERRAIN_SCREEN_SPACE_REFLECTION_SETTINGS;
  const diagnostics: Readonly<SSRDiagnostics> = camera.screenSpaceReflectionDiagnostics;

  return {
    configuration: {
      globalEnabled: Boolean(source.enabled),
      cameraEnabled: Boolean(camera.enableScreenSpaceReflection),
      useCameraOverride: override !== null,
      quality: formatScreenSpaceReflectionQuality(source.quality),
      intensity: source.intensity,
      maxRoughness: source.maxRoughness,
      maxDistance: source.maxDistance,
      thickness: source.thickness,
      edgeFade: source.edgeFade,
      temporalBlend: source.temporalBlend
    },
    active: diagnostics.active,
    state: diagnostics.state,
    supported: diagnostics.unsupportedReason === null,
    unsupportedReason: diagnostics.unsupportedReason,
    traceWidth: diagnostics.traceWidth,
    traceHeight: diagnostics.traceHeight,
    estimatedBytes: diagnostics.estimatedBytes,
    opaqueReceiverCount: diagnostics.opaqueReceiverCount,
    transparentReceiverCount: diagnostics.transparentReceiverCount,
    useHardwareStencil: diagnostics.useHardwareStencil,
    usesPackedDepthRG8: diagnostics.usesPackedDepthRG8,
    usesPackedNormalOct8: diagnostics.usesPackedNormalOct8
  };
}

/** Options wiring `TerrainScreenSpaceReflectionPanel` to the active runtime camera state. */
export interface TerrainScreenSpaceReflectionPanelOptions {
  readonly readStatus: () => TerrainScreenSpaceReflectionPanelStatus;
  readonly applyConfiguration: (configuration: Partial<TerrainScreenSpaceReflectionPanelConfiguration>) => void;
}

type MutableConfiguration = {
  -readonly [K in keyof TerrainScreenSpaceReflectionPanelConfiguration]: TerrainScreenSpaceReflectionPanelConfiguration[K];
};

const PANEL_UPDATE_INTERVAL_MS = 250;

/** Debug inspector panel driving SSR v2 scene settings, camera override, and live diagnostics. */
export class TerrainScreenSpaceReflectionPanel {
  private readonly _options: TerrainScreenSpaceReflectionPanelOptions;
  private readonly _folder: dat.GUI;
  private readonly _controllers: dat.GUIController[] = [];
  private readonly _updatePipelineStatus: (value: string) => void;
  private readonly _updateResolvedStatus: (value: string) => void;
  private readonly _updateResourceStatus: (value: string) => void;
  private readonly _state: MutableConfiguration;
  private _updateTimer: number;
  private _syncing = false;

  constructor(inspector: DebugInspectorPanelHost, options: TerrainScreenSpaceReflectionPanelOptions) {
    this._options = options;
    const initial = options.readStatus();
    this._state = { ...initial.configuration };

    const folder = (this._folder = inspector.gui);
    this.bind(
      folder
        .add(this._state, "globalEnabled")
        .name("Scene Enable / 场景启用")
        .onChange((value: boolean) => this.push({ globalEnabled: value })),
      "ssr-global-enabled",
      "Scene Enable / 场景启用"
    );
    this.bind(
      folder
        .add(this._state, "cameraEnabled")
        .name("Camera Enable / 相机启用")
        .onChange((value: boolean) => this.push({ cameraEnabled: value })),
      "ssr-camera-enabled",
      "Camera Enable / 相机启用"
    );
    this.bind(
      folder
        .add(this._state, "useCameraOverride")
        .name("Camera Override / 相机覆盖")
        .onChange((value: boolean) => this.push({ useCameraOverride: value })),
      "ssr-camera-override",
      "Camera Override / 相机覆盖"
    );

    const settingsFolder = inspector.subfolder(folder, "SSR Settings / 反射参数", true);
    this.bind(
      settingsFolder
        .add(this._state, "quality", {
          "Low (0.25x, 12)": "low",
          "Medium (0.5x, 28)": "medium",
          "High (0.5x, 28)": "high",
          "XHigh (1.0x, 64)": "xhigh"
        })
        .name("Quality / 质量档位")
        .onChange((value: TerrainScreenSpaceReflectionPanelQuality) => this.push({ quality: value })),
      "ssr-quality",
      "Quality / 质量档位"
    );
    this.bind(
      settingsFolder
        .add(this._state, "intensity", 0, 2, 0.01)
        .name("Intensity / 反射强度")
        .onChange((value: number) => this.push({ intensity: value })),
      "ssr-intensity",
      "Intensity / 反射强度"
    );
    this.bind(
      settingsFolder
        .add(this._state, "maxRoughness", 0, 1, 0.01)
        .name("Max Roughness / 最大粗糙度")
        .onChange((value: number) => this.push({ maxRoughness: value })),
      "ssr-max-roughness",
      "Max Roughness / 最大粗糙度"
    );
    this.bind(
      settingsFolder
        .add(this._state, "maxDistance", 0.1, 1000, 1)
        .name("Max Distance / 追踪距离")
        .onChange((value: number) => this.push({ maxDistance: value })),
      "ssr-max-distance",
      "Max Distance / 追踪距离"
    );
    this.bind(
      settingsFolder
        .add(this._state, "thickness", 0.005, 5, 0.01)
        .name("Thickness / 深度厚度")
        .onChange((value: number) => this.push({ thickness: value })),
      "ssr-thickness",
      "Thickness / 深度厚度"
    );
    this.bind(
      settingsFolder
        .add(this._state, "edgeFade", 0, 0.5, 0.01)
        .name("Edge Fade / 边缘衰减")
        .onChange((value: number) => this.push({ edgeFade: value })),
      "ssr-edge-fade",
      "Edge Fade / 边缘衰减"
    );
    this.bind(
      settingsFolder
        .add(this._state, "temporalBlend", 0, 0.95, 0.01)
        .name("Temporal Blend / 时域混合")
        .onChange((value: number) => this.push({ temporalBlend: value })),
      "ssr-temporal-blend",
      "Temporal Blend / 时域混合"
    );

    const runtime = inspector.subfolder(folder, "Runtime Diagnostics / 运行诊断", true);
    this._updatePipelineStatus = inspector.addReadout(runtime, "Pipeline / 管线", "ssr-status-activation");
    this._updateResolvedStatus = inspector.addReadout(runtime, "Settings / 生效参数", "ssr-status-resolved");
    this._updateResourceStatus = inspector.addReadout(runtime, "Resources / 资源", "ssr-status-resources");

    this.refresh(initial);
    this._updateTimer = window.setInterval(() => this.refresh(), PANEL_UPDATE_INTERVAL_MS);
  }

  /** Synchronizes inspector controls and diagnostics text with the live camera state. */
  refresh(status = this._options.readStatus()): void {
    this._folder.domElement.dataset.active = String(status.active);
    this._folder.domElement.dataset.effective = String(status.active);
    this._folder.domElement.dataset.supported = String(status.supported);
    this._folder.domElement.dataset.state = status.state;

    const configuration = status.configuration;
    this._syncing = true;
    try {
      this._state.globalEnabled = configuration.globalEnabled;
      this._state.cameraEnabled = configuration.cameraEnabled;
      this._state.useCameraOverride = configuration.useCameraOverride;
      this._state.quality = configuration.quality;
      this._state.intensity = configuration.intensity;
      this._state.maxRoughness = configuration.maxRoughness;
      this._state.maxDistance = configuration.maxDistance;
      this._state.thickness = configuration.thickness;
      this._state.edgeFade = configuration.edgeFade;
      this._state.temporalBlend = configuration.temporalBlend;
      this.syncControllerDisplays();
    } finally {
      this._syncing = false;
    }

    const receiverSummary = `opaque ${status.opaqueReceiverCount} · transparent ${status.transparentReceiverCount}`;
    const pipelineText = status.supported
      ? `${status.state} · ${status.active ? "active" : "idle"} · ${receiverSummary}`
      : `unsupported (${status.unsupportedReason ?? "unknown"})`;
    this._updatePipelineStatus(pipelineText);

    this._updateResolvedStatus(
      `${formatQuality(configuration.quality)} · int ${configuration.intensity.toFixed(2)} · rough ${configuration.maxRoughness.toFixed(2)} · dist ${configuration.maxDistance.toFixed(0)}m · thick ${configuration.thickness.toFixed(2)}m · edge ${configuration.edgeFade.toFixed(2)} · taa ${configuration.temporalBlend.toFixed(2)}`
    );

    const traceSize =
      status.traceWidth > 0 && status.traceHeight > 0 ? `${status.traceWidth}x${status.traceHeight}` : "idle";
    const packing = [
      status.useHardwareStencil ? "hw-stencil" : "sw-mask",
      status.usesPackedDepthRG8 ? "depth-rg8" : "depth-f16",
      status.usesPackedNormalOct8 ? "norm-oct8" : "norm-rgba"
    ].join(", ");
    this._updateResourceStatus(`${traceSize} · ${formatBytes(status.estimatedBytes)} · ${packing}`);
  }

  /** Stops the polling refresh timer. */
  dispose(): void {
    window.clearInterval(this._updateTimer);
  }

  private push(patch: Partial<TerrainScreenSpaceReflectionPanelConfiguration>): void {
    if (this._syncing) return;
    this._options.applyConfiguration(patch);
    this.refresh();
  }

  private bind(controller: dat.GUIController, id: string, label: string): void {
    setControllerIdentity(controller, id, label);
    this._controllers.push(controller);
  }

  private syncControllerDisplays(): void {
    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    for (let i = 0; i < this._controllers.length; i++) {
      const controller = this._controllers[i];
      if (!activeElement || !controller.domElement.contains(activeElement)) {
        controller.updateDisplay();
      }
    }
  }
}

function setControllerIdentity(controller: dat.GUIController, id: string, label: string): void {
  const input = controller.domElement.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
  if (!input) return;
  input.id = id;
  input.setAttribute("aria-label", label);
  const row = controller.domElement.parentElement;
  row?.setAttribute("data-ssr-control", id);
}

function formatQuality(quality: TerrainScreenSpaceReflectionPanelQuality): string {
  switch (quality) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "XHigh";
  }
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
    case "xhigh":
      return ScreenSpaceReflectionQuality.XHigh;
  }
}

function formatScreenSpaceReflectionQuality(
  quality: ScreenSpaceReflectionQuality
): TerrainScreenSpaceReflectionPanelQuality {
  switch (quality) {
    case ScreenSpaceReflectionQuality.Low:
      return "low";
    case ScreenSpaceReflectionQuality.Medium:
      return "medium";
    case ScreenSpaceReflectionQuality.High:
      return "high";
    case ScreenSpaceReflectionQuality.XHigh:
      return "xhigh";
    default:
      return "medium";
  }
}

function requireFiniteInRange(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`Expected SSR ${name} in [${minimum}, ${maximum}], received ${value}.`);
  }
  return value;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}
