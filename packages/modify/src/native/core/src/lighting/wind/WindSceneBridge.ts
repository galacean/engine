import { Vector3, Vector4 } from "@galacean/engine-math";
import { ContentRestorer } from "../../asset/ContentRestorer";
import type { Camera } from "../../Camera";
import { PipelinePassStage, type PipelinePassRegistration } from "../../RenderPipeline/PipelinePass";
import type { Scene } from "../../Scene";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2D } from "../../texture/Texture2D";
import { TextureFilterMode } from "../../texture/enums/TextureFilterMode";
import { TextureFormat } from "../../texture/enums/TextureFormat";
import { TextureUsage } from "../../texture/enums/TextureUsage";
import { TextureWrapMode } from "../../texture/enums/TextureWrapMode";
import { WindGpuFieldRenderer, WindGpuResponsePass } from "./WindGpuFieldRenderer";
import { WindGpuConsumerDemand, WindGpuPass } from "./WindGpuPass";
import { createWindLocalSample, WindSystem } from "./WindSystem";
import type { WindGpuExposureProvider, WindVector3Like } from "./WindTypes";

const WIND_VELOCITY = ShaderProperty.getByName("scene_WindVelocity");
const WIND_FIELD_PARAMS = ShaderProperty.getByName("scene_WindFieldParams");
const WIND_SPECTRUM_ADVECTION_OFFSET = ShaderProperty.getByName("scene_WindSpectrumAdvectionOffset");
const WIND_LAYER_MULTIPLIERS = ShaderProperty.getByName("scene_WindLayerMultipliers");
const WIND_SPECTRUM_TEXTURE = ShaderProperty.getByName("scene_WindSpectrumTexture");
const WIND_SPECTRUM_PARAMS = ShaderProperty.getByName("scene_WindSpectrumParams");
const WIND_LOCAL_FIELD_TEXTURE = ShaderProperty.getByName("scene_WindLocalFieldTexture");
const WIND_LOCAL_FIELD_PREVIOUS_TEXTURE = ShaderProperty.getByName("scene_WindLocalFieldPreviousTexture");
const WIND_LOCAL_FIELD_EXPOSURE_TEXTURE = ShaderProperty.getByName("scene_WindLocalFieldExposureTexture");
const WIND_LOCAL_FIELD_PREVIOUS_EXPOSURE_TEXTURE = ShaderProperty.getByName(
  "scene_WindLocalFieldPreviousExposureTexture"
);
const WIND_GROUND_RESPONSE_TEXTURE = ShaderProperty.getByName("scene_WindGroundResponseTexture");
const WIND_FLOWER_RESPONSE_TEXTURE = ShaderProperty.getByName("scene_WindFlowerResponseTexture");
const WIND_GROUND_RESPONSE_PARAMS = ShaderProperty.getByName("scene_WindGroundResponseParams");
const WIND_FLOWER_RESPONSE_PARAMS = ShaderProperty.getByName("scene_WindFlowerResponseParams");
const WIND_GROUND_REFERENCE_GUST_HISTORY = ShaderProperty.getByName("scene_WindGroundReferenceGustHistory");
const WIND_GROUND_RESPONSE_RAMP_DURATION = ShaderProperty.getByName("scene_WindGroundResponseRampDuration");
const WIND_TREE_RESPONSE_SLOW_TEXTURE = ShaderProperty.getByName("scene_WindTreeResponseSlowTexture");
const WIND_TREE_RESPONSE_FAST_TEXTURE = ShaderProperty.getByName("scene_WindTreeResponseFastTexture");
const WIND_TREE_RESPONSE_PARAMS = ShaderProperty.getByName("scene_WindTreeResponseParams");
const WIND_LOCAL_FIELD_TRANSFORM = ShaderProperty.getByName("scene_WindLocalFieldTransform");
const WIND_LOCAL_FIELD_TEMPORAL_PARAMS = ShaderProperty.getByName("scene_WindLocalFieldTemporalParams");
const WIND_ANIMATION_ENABLED = ShaderProperty.getByName("scene_WindAnimationEnabled");
const FIELD_DIRECTION_REBUILD_COSINE = 0.996194698;
const _halfF32 = new Float32Array(1);
const _halfI32 = new Int32Array(_halfF32.buffer);

const enum WindFieldDirtyFlag {
  None = 0,
  Anchor = 1 << 0,
  Exposure = 1 << 1,
  Dynamic = 1 << 2,
  Resource = 1 << 3,
  History = 1 << 4
}

export type WindFieldDirtyReason = "anchor" | "exposure" | "dynamic" | "resource" | "history";

/** Retained CPU fallback measurement for one split-field update class. */
export interface WindCpuRasterBaselineSnapshot {
  readonly updateCount: number;
  readonly timeMs: number;
  readonly exposureSampleCount: number;
  readonly dynamicSampleCount: number;
  readonly dirtyReasons: readonly WindFieldDirtyReason[];
}

/** P3 GPU-field allocation and update policy. */
export interface WindSceneBridgeConfig {
  spectrumTextureSize: number;
  localFieldResolution: number;
  localFieldWorldSizeMeters: number;
  /** Maximum dirty-field raster/upload frequency; a stationary gust-free field performs no uploads. */
  localFieldUpdatesPerSecond: number;
  localVelocityRangeMps: number;
  /** Lower canonical receiver frequency retained by the shared ground-response field. */
  groundResponseLowFrequencyHz: number;
  /** Damping ratio paired with the lower canonical response. */
  groundResponseLowDampingRatio: number;
  /** Higher canonical receiver frequency retained by the shared ground-response field. */
  groundResponseHighFrequencyHz: number;
  /** Damping ratio paired with the higher canonical response. */
  groundResponseHighDampingRatio: number;
  /** Flower-head/stem frequency retained independently from grass and shrub. */
  flowerResponseFrequencyHz: number;
  /** Flower-head/stem damping retained independently from grass and shrub. */
  flowerResponseDampingRatio: number;
  /** Slow canonical tree frequency retained by the shared vector response basis. */
  treeResponseSlowFrequencyHz: number;
  /** Damping ratio paired with the slow canonical tree basis. */
  treeResponseSlowDampingRatio: number;
  /** Fast canonical tree frequency retained by the shared vector response basis. */
  treeResponseFastFrequencyHz: number;
  /** Damping ratio paired with the fast canonical tree basis. */
  treeResponseFastDampingRatio: number;
}

/** Detached diagnostics used by performance panels and acceptance tests. */
export interface WindSceneBridgeSnapshot {
  readonly active: boolean;
  readonly localFieldResolution: number;
  readonly localFieldWorldSizeMeters: number;
  readonly localFieldUpdatesPerSecond: number;
  readonly localVelocityRangeMps: number;
  readonly localFieldCenterWS: readonly [number, number, number];
  readonly localFieldRevision: number;
  /** Previous/current field interpolation. One means the newest raster is fully presented. */
  readonly localFieldTemporalBlend: number;
  readonly lastLocalFieldCpuTimeMs: number;
  readonly peakLocalFieldCpuTimeMs: number;
  /** Number of analytical samples evaluated by the most recent local-field update. */
  readonly lastLocalFieldSampleCount: number;
  /** Largest analytical sample count observed in one local-field update. */
  readonly peakLocalFieldSampleCount: number;
  /** Terrain/canopy exposure samples evaluated by the most recent update. */
  readonly lastExposureSampleCount: number;
  /** Dynamic emitter/gust samples evaluated by the most recent update. */
  readonly lastDynamicSampleCount: number;
  /** Dirty domains consumed by the most recent local-field update. */
  readonly lastDirtyReasons: readonly WindFieldDirtyReason[];
  /** Last CPU fallback update that evaluated ExposureField and DynamicWindField together. */
  readonly cpuExposureAndDynamicBaseline: WindCpuRasterBaselineSnapshot;
  /** Last CPU fallback update that reused ExposureField and evaluated only DynamicWindField. */
  readonly cpuDynamicOnlyBaseline: WindCpuRasterBaselineSnapshot;
  readonly fullLocalFieldUpdateCount: number;
  readonly incrementalLocalFieldUpdateCount: number;
  /** Wind texture families consumed by elements in the bound Camera's current render queues. */
  readonly visibleGpuConsumerDemand: WindGpuConsumerDemand;
  /** Retained response rasters waiting for their one-pass-per-frame budget. */
  readonly pendingGpuResponsePassCount: number;
  /** Total retained response passes submitted since bridge creation. */
  readonly gpuResponsePassCount: number;
  readonly spectrumTextureBytes: number;
  /** Bytes in one local-field texture or CPU pixel slice. */
  readonly localFieldSliceBytes: number;
  /** Combined retained bytes for the previous/current local-field pair. */
  readonly localFieldTextureBytes: number;
  /** Bytes in the independent previous/current R8 shelter/exposure pair. */
  readonly exposureTextureBytes: number;
  /** Combined bytes of the shrub/grass and exact flower RGBA16F response grids. */
  readonly groundResponseTextureBytes: number;
  /** Previous/current RGBA16F state for both canonical vector tree-response bases. */
  readonly treeResponseTextureBytes: number;
  /** All CPU fallback, dynamic-field, exposure, and retained-response texture bytes owned by the bridge. */
  readonly retainedLocalFieldTextureBytes: number;
  readonly rasterBackend: "cpu" | "gpu";
}

const DEFAULT_BRIDGE_CONFIG: Readonly<WindSceneBridgeConfig> = Object.freeze({
  spectrumTextureSize: 64,
  localFieldResolution: 64,
  localFieldWorldSizeMeters: 128,
  localFieldUpdatesPerSecond: 12,
  localVelocityRangeMps: 20,
  groundResponseLowFrequencyHz: 0.95,
  groundResponseLowDampingRatio: 0.9,
  groundResponseHighFrequencyHz: 1.8,
  groundResponseHighDampingRatio: 0.82,
  flowerResponseFrequencyHz: 1.22,
  flowerResponseDampingRatio: 0.74,
  treeResponseSlowFrequencyHz: 0.38,
  treeResponseSlowDampingRatio: 0.62,
  treeResponseFastFrequencyHz: 0.68,
  treeResponseFastDampingRatio: 0.56
});
const GPU_RESPONSE_PASS_ORDER = Object.freeze([
  WindGpuResponsePass.Ground,
  WindGpuResponsePass.Flower,
  WindGpuResponsePass.TreeSlow,
  WindGpuResponsePass.TreeFast
]);
// Temporary performance-isolation switch: keep the CPU/global wind state published, but do not
// register the post-cull GPU field/response pass until the visibility/pass-order refactor in #39.
const WIND_GPU_PIPELINE_PASS_ENABLED = false;

/**
 * Publishes the complete P3 WindSystem to Scene shader data.
 *
 * @remarks
 * The packed spectrum is static and advected in shaders. Travelling gusts, analytical emitters and
 * exposure are rasterized at a capped mobile-oriented frequency. The previous/current RGBA16F
 * pair stores emitter velocity, local turbulence, and an independently reweightable travelling-
 * gust scalar without the velocity-range quantisation that made weak gust recovery stall. A shared
 * RGBA16F response grid retains displacement/velocity for two canonical ground-receiver bands;
 * shaders advance those states analytically every rendered frame, so cost is independent of the
 * number of grass, flower, and shrub instances.
 */
export class WindSceneBridge {
  readonly config: WindSceneBridgeConfig;
  readonly spectrumTexture: Texture2D;
  readonly localFieldTexture: Texture2D;
  readonly previousLocalFieldTexture: Texture2D;
  readonly localFieldExposureTexture: Texture2D;
  readonly previousLocalFieldExposureTexture: Texture2D;
  readonly groundResponseTexture: Texture2D;
  readonly flowerResponseTexture: Texture2D;
  private readonly _treeResponseFallbackTexture: Texture2D;

  private readonly _scene: Scene;
  private readonly _system: WindSystem;
  private readonly _spectrumPixels: Uint8Array;
  private readonly _localFieldPixels: Uint16Array;
  private readonly _previousLocalFieldPixels: Uint16Array;
  private readonly _localFieldScratchPixels: Uint16Array;
  private readonly _localFieldExposurePixels: Uint8Array;
  private readonly _previousLocalFieldExposurePixels: Uint8Array;
  private readonly _localFieldExposureScratchPixels: Uint8Array;
  private readonly _groundResponseState: Float32Array;
  private readonly _groundResponseStateScratch: Float32Array;
  private readonly _groundResponseStartTargets: Float32Array;
  private readonly _groundResponseStartTargetScratch: Float32Array;
  private readonly _groundResponseTargets: Float32Array;
  private readonly _groundResponseTargetScratch: Float32Array;
  private readonly _nextGroundResponseTargets: Float32Array;
  private readonly _groundResponsePixels: Uint16Array;
  private readonly _flowerResponseState: Float32Array;
  private readonly _flowerResponseStateScratch: Float32Array;
  private readonly _flowerResponsePixels: Uint16Array;
  private readonly _velocity = new Vector3();
  private readonly _spectrumAdvectionOffset = new Vector3();
  private readonly _fieldParams = new Vector4();
  private readonly _layerMultipliers = new Vector3();
  private readonly _spectrumParams = new Vector4();
  private readonly _localFieldTransform = new Vector4();
  private readonly _localFieldTemporalParams = new Vector4();
  private readonly _groundResponseParams = new Vector4();
  private readonly _flowerResponseParams = new Vector4();
  private readonly _groundReferenceGustHistory = new Vector4();
  private readonly _disabledGroundReferenceGustHistory = new Vector4();
  private readonly _treeResponseParams = new Vector4();
  private readonly _fieldCenter = new Vector3();
  private readonly _requestedFieldCenter = new Vector3();
  private readonly _samplePosition = new Vector3();
  private readonly _localSample = createWindLocalSample();
  private readonly _samplingBounds = { minimumX: 0, minimumZ: 0, maximumX: 0, maximumZ: 0 };
  private readonly _gpuExposureRequest = {
    minimumX: 0,
    minimumZ: 0,
    maximumX: 0,
    maximumZ: 0,
    resolution: 0,
    directionX: 1,
    directionZ: 0
  };
  private readonly _gpuFieldRequest = {
    minimumX: 0,
    minimumZ: 0,
    maximumX: 0,
    maximumZ: 0,
    centerY: 0,
    velocityRangeMps: 1,
    historyInvalid: true,
    responseDeltaTime: 0,
    responseRampDuration: 1,
    responseHistoryOffsetX: 0,
    responseHistoryOffsetZ: 0
  };
  private _gpuExposureProvider: WindGpuExposureProvider | null = null;
  private _gpuExposureTexture: Texture2D | null = null;
  private _previousGpuExposureTexture: Texture2D | null = null;
  private _gpuFieldRenderer: WindGpuFieldRenderer | null = null;
  private readonly _gpuPipelinePass: WindGpuPass;
  private _gpuPipelinePassRegistration: PipelinePassRegistration | null = null;
  private _gpuRenderCamera: Camera | null = null;
  private _observedGpuExposureRevision = -1;
  private _observedGpuFieldContentRevision = -1;
  private _gpuRefreshPending = false;
  private _visibleGpuConsumerDemand = WindGpuConsumerDemand.None;
  private _pendingGpuResponsePasses = WindGpuResponsePass.None;
  private _gpuResponseResetPasses = WindGpuResponsePass.None;
  private _gpuResponseInitializedPasses = WindGpuResponsePass.None;
  private _gpuResponsePassCursor = 0;
  private _gpuResponsePassCount = 0;
  private readonly _gpuResponseElapsedSeconds = [0, 0, 0, 0];
  private _fieldAccumulator = 0;
  private _fieldTemporalBlend = 1;
  private _exposureTemporalBlend = 1;
  private _fieldRevision = 0;
  private _observedEmitterRevision = -1;
  private _observedExposureRevision = -1;
  private _fieldDirectionX = 1;
  private _fieldDirectionZ = 0;
  private _responseVelocityX = Number.NaN;
  private _responseVelocityZ = Number.NaN;
  private readonly _groundResponseSettleDurationSeconds: number;
  private _groundResponseSettleRemainingSeconds = 0;
  private readonly _treeResponseSettleDurationSeconds: number;
  private _treeResponseSettleRemainingSeconds = 0;
  private _lastLocalFieldCpuTimeMs = 0;
  private _peakLocalFieldCpuTimeMs = 0;
  private _lastLocalFieldSampleCount = 0;
  private _peakLocalFieldSampleCount = 0;
  private _lastExposureSampleCount = 0;
  private _lastDynamicSampleCount = 0;
  private _lastDirtyFlags = WindFieldDirtyFlag.None;
  private readonly _cpuExposureAndDynamicBaseline = createCpuRasterBaseline();
  private readonly _cpuDynamicOnlyBaseline = createCpuRasterBaseline();
  private _fullLocalFieldUpdateCount = 0;
  private _incrementalLocalFieldUpdateCount = 0;
  private _dirtyFlags =
    WindFieldDirtyFlag.Exposure | WindFieldDirtyFlag.Dynamic | WindFieldDirtyFlag.Resource | WindFieldDirtyFlag.History;
  private _requiresFullExposureRebuild = true;
  private _requiresFullDynamicRebuild = true;
  private _observedActiveGusts = false;
  private _active = true;
  private _destroyed = false;

  constructor(scene: Scene, system: WindSystem, config: Readonly<Partial<WindSceneBridgeConfig>> = {}) {
    this._scene = scene;
    this._system = system;
    this._gpuPipelinePass = new WindGpuPass(scene.engine, this);
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
    validateBridgeConfig(this.config);
    this._groundResponseSettleDurationSeconds =
      7 /
      (Math.min(
        this.config.groundResponseLowDampingRatio * this.config.groundResponseLowFrequencyHz,
        this.config.groundResponseHighDampingRatio * this.config.groundResponseHighFrequencyHz,
        this.config.flowerResponseDampingRatio * this.config.flowerResponseFrequencyHz
      ) *
        Math.PI *
        2);
    this._treeResponseSettleDurationSeconds =
      7 / (this.config.treeResponseSlowDampingRatio * this.config.treeResponseSlowFrequencyHz * Math.PI * 2);

    const engine = scene.engine;
    const spectrumSize = this.config.spectrumTextureSize;
    const spectrumPixels = (this._spectrumPixels = buildPackedWindSpectrum(spectrumSize, system.config.seed));
    const spectrumTexture = (this.spectrumTexture = new Texture2D(
      engine,
      spectrumSize,
      spectrumSize,
      TextureFormat.R8G8B8A8,
      false,
      false,
      TextureUsage.Static
    ));
    spectrumTexture.name = "Wind packed multi-scale spectrum";
    spectrumTexture.filterMode = TextureFilterMode.Bilinear;
    spectrumTexture.wrapModeU = TextureWrapMode.Repeat;
    spectrumTexture.wrapModeV = TextureWrapMode.Repeat;
    spectrumTexture.setPixelBuffer(spectrumPixels);

    const localResolution = this.config.localFieldResolution;
    const localPixels = (this._localFieldPixels = new Uint16Array(localResolution * localResolution * 4));
    const previousLocalPixels = (this._previousLocalFieldPixels = new Uint16Array(localPixels.length));
    this._localFieldScratchPixels = new Uint16Array(localPixels.length);
    const exposurePixels = (this._localFieldExposurePixels = new Uint8Array(localResolution * localResolution));
    const previousExposurePixels = (this._previousLocalFieldExposurePixels = new Uint8Array(exposurePixels.length));
    this._localFieldExposureScratchPixels = new Uint8Array(exposurePixels.length);
    const responseElementCount = localResolution * localResolution * 4;
    this._groundResponseState = new Float32Array(responseElementCount);
    this._groundResponseStateScratch = new Float32Array(responseElementCount);
    this._groundResponseStartTargets = new Float32Array(localResolution * localResolution);
    this._groundResponseStartTargetScratch = new Float32Array(localResolution * localResolution);
    this._groundResponseTargets = new Float32Array(localResolution * localResolution);
    this._groundResponseTargetScratch = new Float32Array(localResolution * localResolution);
    this._nextGroundResponseTargets = new Float32Array(localResolution * localResolution);
    const responsePixels = (this._groundResponsePixels = new Uint16Array(responseElementCount));
    this._flowerResponseState = new Float32Array(responseElementCount);
    this._flowerResponseStateScratch = new Float32Array(responseElementCount);
    const flowerResponsePixels = (this._flowerResponsePixels = new Uint16Array(responseElementCount));
    const localTexture = (this.localFieldTexture = new Texture2D(
      engine,
      localResolution,
      localResolution,
      TextureFormat.R16G16B16A16,
      false,
      false,
      TextureUsage.Dynamic
    ));
    localTexture.name = "Wind camera-centred local field";
    localTexture.filterMode = TextureFilterMode.Bilinear;
    localTexture.wrapModeU = TextureWrapMode.Clamp;
    localTexture.wrapModeV = TextureWrapMode.Clamp;
    fillNeutralLocalField(localPixels);
    fillNeutralLocalField(previousLocalPixels);
    localTexture.setPixelBuffer(localPixels);

    const previousLocalTexture = (this.previousLocalFieldTexture = new Texture2D(
      engine,
      localResolution,
      localResolution,
      TextureFormat.R16G16B16A16,
      false,
      false,
      TextureUsage.Dynamic
    ));
    previousLocalTexture.name = "Wind previous camera-centred local field";
    previousLocalTexture.filterMode = TextureFilterMode.Bilinear;
    previousLocalTexture.wrapModeU = TextureWrapMode.Clamp;
    previousLocalTexture.wrapModeV = TextureWrapMode.Clamp;
    previousLocalTexture.setPixelBuffer(previousLocalPixels);

    const exposureTexture = (this.localFieldExposureTexture = new Texture2D(
      engine,
      localResolution,
      localResolution,
      TextureFormat.R8,
      false,
      false,
      TextureUsage.Dynamic
    ));
    exposureTexture.name = "Wind camera-centred shelter exposure";
    exposureTexture.filterMode = TextureFilterMode.Bilinear;
    exposureTexture.wrapModeU = exposureTexture.wrapModeV = TextureWrapMode.Clamp;
    exposurePixels.fill(255);
    exposureTexture.setPixelBuffer(exposurePixels);

    const previousExposureTexture = (this.previousLocalFieldExposureTexture = new Texture2D(
      engine,
      localResolution,
      localResolution,
      TextureFormat.R8,
      false,
      false,
      TextureUsage.Dynamic
    ));
    previousExposureTexture.name = "Wind previous camera-centred shelter exposure";
    previousExposureTexture.filterMode = TextureFilterMode.Bilinear;
    previousExposureTexture.wrapModeU = previousExposureTexture.wrapModeV = TextureWrapMode.Clamp;
    previousExposurePixels.fill(255);
    previousExposureTexture.setPixelBuffer(previousExposurePixels);

    const responseTexture = (this.groundResponseTexture = new Texture2D(
      engine,
      localResolution,
      localResolution,
      TextureFormat.R16G16B16A16,
      false,
      false,
      TextureUsage.Dynamic
    ));
    responseTexture.name = "Wind shared ground mechanical response";
    responseTexture.filterMode = TextureFilterMode.Bilinear;
    responseTexture.wrapModeU = responseTexture.wrapModeV = TextureWrapMode.Clamp;
    responsePixels.fill(toHalf(0));
    responseTexture.setPixelBuffer(responsePixels);
    const flowerResponseTexture = (this.flowerResponseTexture = new Texture2D(
      engine,
      localResolution,
      localResolution,
      TextureFormat.R16G16B16A16,
      false,
      false,
      TextureUsage.Dynamic
    ));
    flowerResponseTexture.name = "Wind exact flower mechanical response";
    flowerResponseTexture.filterMode = TextureFilterMode.Bilinear;
    flowerResponseTexture.wrapModeU = flowerResponseTexture.wrapModeV = TextureWrapMode.Clamp;
    flowerResponsePixels.fill(toHalf(0));
    flowerResponseTexture.setPixelBuffer(flowerResponsePixels);
    this._groundResponseParams.set(
      this.config.groundResponseLowFrequencyHz,
      this.config.groundResponseLowDampingRatio,
      this.config.groundResponseHighFrequencyHz,
      this.config.groundResponseHighDampingRatio
    );
    this._flowerResponseParams.set(this.config.flowerResponseFrequencyHz, this.config.flowerResponseDampingRatio, 0, 0);
    this._treeResponseParams.set(
      this.config.treeResponseSlowFrequencyHz,
      this.config.treeResponseSlowDampingRatio,
      this.config.treeResponseFastFrequencyHz,
      this.config.treeResponseFastDampingRatio
    );
    const treeResponseFallbackPixels = new Uint16Array(4);
    const treeResponseFallbackTexture = (this._treeResponseFallbackTexture = new Texture2D(
      engine,
      1,
      1,
      TextureFormat.R16G16B16A16,
      false,
      false,
      TextureUsage.Static
    ));
    treeResponseFallbackTexture.name = "Wind neutral tree mechanical response";
    treeResponseFallbackTexture.filterMode = TextureFilterMode.Point;
    treeResponseFallbackTexture.wrapModeU = treeResponseFallbackTexture.wrapModeV = TextureWrapMode.Clamp;
    treeResponseFallbackTexture.setPixelBuffer(treeResponseFallbackPixels);

    engine.resourceManager.addContentRestorer(new WindTextureContentRestorer(spectrumTexture, spectrumPixels));
    engine.resourceManager.addContentRestorer(new WindTextureContentRestorer(localTexture, localPixels));
    engine.resourceManager.addContentRestorer(
      new WindTextureContentRestorer(previousLocalTexture, previousLocalPixels)
    );
    engine.resourceManager.addContentRestorer(new WindTextureContentRestorer(exposureTexture, exposurePixels));
    engine.resourceManager.addContentRestorer(
      new WindTextureContentRestorer(previousExposureTexture, previousExposurePixels)
    );
    engine.resourceManager.addContentRestorer(new WindTextureContentRestorer(responseTexture, responsePixels));
    engine.resourceManager.addContentRestorer(
      new WindTextureContentRestorer(flowerResponseTexture, flowerResponsePixels)
    );
    engine.resourceManager.addContentRestorer(
      new WindTextureContentRestorer(treeResponseFallbackTexture, treeResponseFallbackPixels)
    );
    this._publishTextures();
    this.rebuildLocalField();
    // Startup has no meaningful previous state. Present the first complete field without fading
    // from the neutral texture, then retain it as history for subsequent capped-rate updates.
    previousLocalPixels.set(localPixels);
    previousLocalTexture.setPixelBuffer(previousLocalPixels);
    previousExposurePixels.set(exposurePixels);
    previousExposureTexture.setPixelBuffer(previousExposurePixels);
    this._fieldTemporalBlend = 1;
    this.publish();
  }

  /** Installs an optional GPU exposure producer and switches dense visual rasterization to WebGL2 passes. */
  setGpuExposureProvider(provider: WindGpuExposureProvider | null): void {
    this._assertAlive();
    if (this._gpuExposureProvider === provider) return;
    this._gpuExposureProvider = provider;
    this._gpuExposureTexture = null;
    this._previousGpuExposureTexture = null;
    this._observedGpuExposureRevision = provider ? readGpuExposureRevision(provider) : -1;
    this._gpuResponseInitializedPasses = WindGpuResponsePass.None;
    this._gpuResponseResetPasses = WindGpuResponsePass.None;
    if (provider) {
      this._gpuFieldRenderer ??= new WindGpuFieldRenderer(
        this._scene.engine,
        this.config.localFieldResolution,
        this._system,
        {
          lowFrequencyHz: this.config.groundResponseLowFrequencyHz,
          lowDampingRatio: this.config.groundResponseLowDampingRatio,
          highFrequencyHz: this.config.groundResponseHighFrequencyHz,
          highDampingRatio: this.config.groundResponseHighDampingRatio,
          flowerFrequencyHz: this.config.flowerResponseFrequencyHz,
          flowerDampingRatio: this.config.flowerResponseDampingRatio,
          treeSlowFrequencyHz: this.config.treeResponseSlowFrequencyHz,
          treeSlowDampingRatio: this.config.treeResponseSlowDampingRatio,
          treeFastFrequencyHz: this.config.treeResponseFastFrequencyHz,
          treeFastDampingRatio: this.config.treeResponseFastDampingRatio
        }
      );
      this._observedGpuFieldContentRevision = this._gpuFieldRenderer.contentRevision;
      this._gpuRefreshPending = true;
    } else if (this._gpuFieldRenderer) {
      this._gpuFieldRenderer.destroy();
      this._gpuFieldRenderer = null;
      this._observedGpuFieldContentRevision = -1;
      this._gpuRefreshPending = false;
      // The Scene shader data still owns the former GPU target bindings after renderer teardown.
      // Publish the CPU/fallback textures before another draw can sample destroyed resources.
      this._publishTextures();
    }
    this._dirtyFlags |=
      WindFieldDirtyFlag.Exposure |
      WindFieldDirtyFlag.Dynamic |
      WindFieldDirtyFlag.Resource |
      WindFieldDirtyFlag.History;
    this._requiresFullExposureRebuild = true;
    this._requiresFullDynamicRebuild = true;
  }

  /** Selects the Camera whose post-cull render queues define this bridge's current GPU demand. */
  setGpuRenderCamera(camera: Camera | null): void {
    this._assertAlive();
    if (camera === this._gpuRenderCamera) return;
    let nextRegistration: PipelinePassRegistration | null = null;
    if (camera && WIND_GPU_PIPELINE_PASS_ENABLED) {
      if (camera.scene !== this._scene) throw new Error("Wind GPU raster Camera must belong to the bridge Scene");
      const pipeline = camera._renderPipeline;
      if (!pipeline) throw new Error("Wind GPU raster Camera must own an active render pipeline");
      nextRegistration = pipeline._registerPass(PipelinePassStage.AfterCulling, this._gpuPipelinePass);
    }
    this._gpuPipelinePassRegistration?.unregister();
    this._gpuPipelinePassRegistration = nextRegistration;
    this._gpuRenderCamera = camera;
    if (!nextRegistration) {
      this._visibleGpuConsumerDemand = WindGpuConsumerDemand.None;
      this._pendingGpuResponsePasses = WindGpuResponsePass.None;
    }
  }

  /** Moves the P3 field with a stable texel-snapped camera/player anchor. */
  setLocalFieldCenter(position: WindVector3Like): void {
    validateVector("Wind local-field center", position);
    const texelSize = this.config.localFieldWorldSizeMeters / this.config.localFieldResolution;
    const snappedX = Math.round(position.x / texelSize) * texelSize;
    const snappedY = Math.round(position.y / texelSize) * texelSize;
    const snappedZ = Math.round(position.z / texelSize) * texelSize;
    if (
      snappedX === this._requestedFieldCenter.x &&
      snappedY === this._requestedFieldCenter.y &&
      snappedZ === this._requestedFieldCenter.z
    ) {
      return;
    }
    this._requestedFieldCenter.set(snappedX, snappedY, snappedZ);
    this._system.setReferencePosition(this._requestedFieldCenter);
    this._dirtyFlags |= WindFieldDirtyFlag.Anchor | WindFieldDirtyFlag.Exposure | WindFieldDirtyFlag.Dynamic;
  }

  /** Rebuilds dirty local data at a capped frequency and publishes the reused GPU context. */
  update(deltaTime: number): void {
    this._assertAlive();
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("Wind Scene bridge delta time must be finite and non-negative");
    }
    if (!this._active) return;
    this._fieldAccumulator += deltaTime;
    const responseElapsedSeconds = this._gpuResponseElapsedSeconds;
    for (let i = 0; i < responseElapsedSeconds.length; i++) responseElapsedSeconds[i] += deltaTime;
    this._fieldTemporalBlend = Math.min(1, this._fieldAccumulator * this.config.localFieldUpdatesPerSecond);
    this._exposureTemporalBlend = Math.min(
      1,
      this._exposureTemporalBlend + deltaTime * this.config.localFieldUpdatesPerSecond
    );
    const context = this._system.getGpuContext();
    let responseForcingChanged = false;
    if (
      !Number.isFinite(this._responseVelocityX) ||
      Math.hypot(context.velocityWS[0] - this._responseVelocityX, context.velocityWS[2] - this._responseVelocityZ) >
        0.002
    ) {
      // Unlike the stateless air-field texture, the retained woody response integrates the
      // weather-smoothed mean load. Keep its capped-rate pass alive while that target changes.
      this._dirtyFlags |= WindFieldDirtyFlag.Dynamic;
      this._requiresFullDynamicRebuild = true;
      responseForcingChanged = true;
    }
    const horizontalDirectionLength = Math.hypot(context.directionWS[0], context.directionWS[2]);
    const directionX = horizontalDirectionLength > 1e-5 ? context.directionWS[0] / horizontalDirectionLength : 1;
    const directionZ = horizontalDirectionLength > 1e-5 ? context.directionWS[2] / horizontalDirectionLength : 0;
    if (directionX * this._fieldDirectionX + directionZ * this._fieldDirectionZ < FIELD_DIRECTION_REBUILD_COSINE) {
      this._dirtyFlags |= WindFieldDirtyFlag.Exposure | WindFieldDirtyFlag.Dynamic;
      this._requiresFullExposureRebuild = true;
      this._requiresFullDynamicRebuild = true;
      responseForcingChanged = true;
    }
    if (this._observedEmitterRevision !== this._system.getEmitterRevision()) {
      this._dirtyFlags |= WindFieldDirtyFlag.Dynamic;
      this._requiresFullDynamicRebuild = true;
      responseForcingChanged = true;
    }
    if (this._observedExposureRevision !== this._system.getExposureRevision()) {
      this._dirtyFlags |= WindFieldDirtyFlag.Exposure | WindFieldDirtyFlag.Dynamic;
      this._requiresFullExposureRebuild = true;
      this._requiresFullDynamicRebuild = true;
      responseForcingChanged = true;
    }
    if (
      this._gpuExposureProvider &&
      this._observedGpuExposureRevision !== readGpuExposureRevision(this._gpuExposureProvider)
    ) {
      this._dirtyFlags |= WindFieldDirtyFlag.Exposure | WindFieldDirtyFlag.Dynamic;
      this._requiresFullExposureRebuild = true;
      this._requiresFullDynamicRebuild = true;
      responseForcingChanged = true;
    }
    if (this._gpuFieldRenderer && this._observedGpuFieldContentRevision !== this._gpuFieldRenderer.contentRevision) {
      this._observedGpuFieldContentRevision = this._gpuFieldRenderer.contentRevision;
      this._dirtyFlags |=
        WindFieldDirtyFlag.Exposure |
        WindFieldDirtyFlag.Dynamic |
        WindFieldDirtyFlag.Resource |
        WindFieldDirtyFlag.History;
      this._requiresFullExposureRebuild = true;
      this._requiresFullDynamicRebuild = true;
      responseForcingChanged = true;
    }
    const hasActiveGusts = this._system.getActiveGustCount() > 0;
    if (hasActiveGusts || hasActiveGusts !== this._observedActiveGusts) {
      // Every texel changes while a front travels. One final rebuild removes the packet after it
      // leaves the fixed pool; gust-free stationary fields retain the zero-upload fast path.
      this._dirtyFlags |= WindFieldDirtyFlag.Dynamic;
      this._requiresFullDynamicRebuild = true;
      responseForcingChanged = true;
    }
    this._observedActiveGusts = hasActiveGusts;
    if (responseForcingChanged) {
      this._groundResponseSettleRemainingSeconds = this._groundResponseSettleDurationSeconds;
      this._treeResponseSettleRemainingSeconds = this._treeResponseSettleDurationSeconds;
    } else {
      this._groundResponseSettleRemainingSeconds = Math.max(0, this._groundResponseSettleRemainingSeconds - deltaTime);
      this._treeResponseSettleRemainingSeconds = Math.max(0, this._treeResponseSettleRemainingSeconds - deltaTime);
    }
    if (
      this._groundResponseSettleRemainingSeconds > 0 ||
      (this._gpuFieldRenderer && this._treeResponseSettleRemainingSeconds > 0)
    ) {
      // Seven decay constants reduce every retained mode below 0.1%. Ground responses must keep
      // advancing on both raster backends; the woody response additionally keeps the GPU pass
      // alive without introducing per-tree CPU state or readback.
      this._dirtyFlags |= WindFieldDirtyFlag.Dynamic;
      this._requiresFullDynamicRebuild = true;
    }
    const interval = 1 / this.config.localFieldUpdatesPerSecond;
    const centerDelta = Math.hypot(
      this._requestedFieldCenter.x - this._fieldCenter.x,
      this._requestedFieldCenter.z - this._fieldCenter.z
    );
    const teleported = centerDelta >= this.config.localFieldWorldSizeMeters * 0.25;
    if (teleported) this._dirtyFlags |= WindFieldDirtyFlag.History;
    if (this._dirtyFlags !== WindFieldDirtyFlag.None && (teleported || this._fieldAccumulator >= interval)) {
      if (this._gpuFieldRenderer) this._gpuRefreshPending = true;
      else this._refreshLocalField(false);
    }
    this.publish();
  }

  /**
   * Executes at most one scheduled wind raster after this Camera's current render queues are known.
   * Direct callers retain the legacy all-consumers behaviour by omitting `consumerDemand`.
   */
  renderGpuLocalField(camera: Camera, consumerDemand: WindGpuConsumerDemand = WindGpuConsumerDemand.All): boolean {
    this._assertAlive();
    if (camera.scene !== this._scene) throw new Error("Wind GPU raster Camera must belong to the bridge Scene");
    const previousConsumerDemand = this._visibleGpuConsumerDemand;
    this._visibleGpuConsumerDemand = consumerDemand;
    if (consumerDemand === WindGpuConsumerDemand.None) {
      this._pendingGpuResponsePasses = WindGpuResponsePass.None;
      return false;
    }
    if (!this._active || !this._gpuFieldRenderer || !this._gpuExposureProvider) return false;

    const responseDemand = responsePassesForConsumerDemand(consumerDemand);
    const previousResponseDemand = responsePassesForConsumerDemand(previousConsumerDemand);
    const newlyVisibleResponses = responseDemand & ~previousResponseDemand;
    this._pendingGpuResponsePasses = (this._pendingGpuResponsePasses & responseDemand) | newlyVisibleResponses;
    this._gpuResponseResetPasses |= newlyVisibleResponses & ~this._gpuResponseInitializedPasses;

    // The normal pipeline already owns this Camera here. Retain explicit scoping for authoring
    // and deterministic callers that submit the same operation outside Camera.render.
    const context = this._scene.engine._renderContext;
    const previousCamera = context.camera;
    context.camera = camera;
    try {
      let submitted = false;
      if (this._gpuRefreshPending) {
        this._refreshLocalField(false, responseDemand);
        this._gpuRefreshPending = false;
        submitted = true;
      } else {
        submitted = this._renderNextGpuResponse(responseDemand);
      }
      if (submitted) this.publish();
      return submitted;
    } finally {
      context.camera = previousCamera;
    }
  }

  /** Rasterizes gusts, emitters and shelter immediately, for authoring and deterministic tests. */
  rebuildLocalField(): void {
    this._assertAlive();
    if (this._gpuFieldRenderer) {
      this._dirtyFlags |= WindFieldDirtyFlag.Exposure | WindFieldDirtyFlag.Dynamic | WindFieldDirtyFlag.History;
      this._requiresFullExposureRebuild = true;
      this._requiresFullDynamicRebuild = true;
      this._gpuRefreshPending = true;
      return;
    }
    this._refreshLocalField(true);
  }

  private _refreshLocalField(
    forceFullRebuild: boolean,
    gpuResponseDemand: WindGpuResponsePass = WindGpuResponsePass.All
  ): void {
    const cpuStart = performance.now();
    if (forceFullRebuild) {
      this._dirtyFlags |= WindFieldDirtyFlag.Exposure | WindFieldDirtyFlag.Dynamic | WindFieldDirtyFlag.History;
      this._requiresFullExposureRebuild = true;
      this._requiresFullDynamicRebuild = true;
    }
    const consumedDirtyFlags = this._dirtyFlags;
    const historyInvalid = (consumedDirtyFlags & WindFieldDirtyFlag.History) !== 0;
    this._advanceGroundReferenceGustHistory(this._system.getGpuContext().gust, historyInvalid);
    if (this._gpuExposureProvider && this._gpuFieldRenderer) {
      this._refreshGpuLocalField(cpuStart, consumedDirtyFlags, historyInvalid, gpuResponseDemand);
      return;
    }
    if (!historyInvalid) {
      this._previousLocalFieldPixels.set(this._localFieldPixels);
      this.previousLocalFieldTexture.setPixelBuffer(this._previousLocalFieldPixels);
      this._previousLocalFieldExposurePixels.set(this._localFieldExposurePixels);
      this.previousLocalFieldExposureTexture.setPixelBuffer(this._previousLocalFieldExposurePixels);
    }
    const resolution = this.config.localFieldResolution;
    const worldSize = this.config.localFieldWorldSizeMeters;
    const cellSize = worldSize / resolution;
    const centerDeltaX = this._requestedFieldCenter.x - this._fieldCenter.x;
    const centerDeltaZ = this._requestedFieldCenter.z - this._fieldCenter.z;
    const sameFieldHeight = this._requestedFieldCenter.y === this._fieldCenter.y;
    const cellOffsetX = Math.round(centerDeltaX / cellSize);
    const cellOffsetZ = Math.round(centerDeltaZ / cellSize);
    const anchorDirty = (consumedDirtyFlags & WindFieldDirtyFlag.Anchor) !== 0;
    const exposureDirty = (consumedDirtyFlags & WindFieldDirtyFlag.Exposure) !== 0;
    const dynamicDirty = (consumedDirtyFlags & WindFieldDirtyFlag.Dynamic) !== 0;
    const canScrollExposure =
      !forceFullRebuild &&
      anchorDirty &&
      exposureDirty &&
      !this._requiresFullExposureRebuild &&
      sameFieldHeight &&
      Math.abs(centerDeltaX - cellOffsetX * cellSize) <= cellSize * 1e-5 &&
      Math.abs(centerDeltaZ - cellOffsetZ * cellSize) <= cellSize * 1e-5 &&
      (cellOffsetX !== 0 || cellOffsetZ !== 0) &&
      Math.abs(cellOffsetX) < resolution &&
      Math.abs(cellOffsetZ) < resolution;
    this._fieldCenter.copyFrom(this._requestedFieldCenter);
    const startX = this._fieldCenter.x - worldSize * 0.5 + cellSize * 0.5;
    const startZ = this._fieldCenter.z - worldSize * 0.5 + cellSize * 0.5;
    const samplingBounds = this._samplingBounds;
    samplingBounds.minimumX = this._fieldCenter.x - worldSize * 0.5;
    samplingBounds.minimumZ = this._fieldCenter.z - worldSize * 0.5;
    samplingBounds.maximumX = this._fieldCenter.x + worldSize * 0.5;
    samplingBounds.maximumZ = this._fieldCenter.z + worldSize * 0.5;
    if (exposureDirty) this._system.prepareLocalFieldSampling(samplingBounds);
    const position = this._samplePosition;
    position.y = this._fieldCenter.y;
    this._nextGroundResponseTargets.fill(0);
    let exposureSampleCount = 0;
    let dynamicSampleCount = 0;
    let performedIncrementalUpdate = false;
    let performedFullUpdate = false;
    if (canScrollExposure) {
      const source = this._localFieldPixels;
      const target = this._localFieldScratchPixels;
      const exposureSource = this._localFieldExposurePixels;
      const exposureTarget = this._localFieldExposureScratchPixels;
      for (let y = 0; y < resolution; y++) {
        const sourceY = y + cellOffsetZ;
        position.z = startZ + y * cellSize;
        for (let x = 0; x < resolution; x++) {
          const sourceX = x + cellOffsetX;
          const targetIndex = y * resolution + x;
          const targetOffset = (y * resolution + x) * 4;
          if (sourceX >= 0 && sourceX < resolution && sourceY >= 0 && sourceY < resolution) {
            const sourceIndex = sourceY * resolution + sourceX;
            const sourceOffset = (sourceY * resolution + sourceX) * 4;
            target[targetOffset] = source[sourceOffset];
            target[targetOffset + 1] = source[sourceOffset + 1];
            target[targetOffset + 2] = source[sourceOffset + 2];
            target[targetOffset + 3] = source[sourceOffset + 3];
            exposureTarget[targetIndex] = exposureSource[sourceIndex];
            this._nextGroundResponseTargets[targetIndex] = this._groundResponseTargets[sourceIndex];
          } else {
            position.x = startX + x * cellSize;
            this._writeLocalFieldSample(target, targetOffset, exposureTarget, targetIndex, position, targetIndex);
            exposureSampleCount++;
            dynamicSampleCount++;
          }
        }
      }
      source.set(target);
      exposureSource.set(exposureTarget);
      performedIncrementalUpdate = true;
    } else if (exposureDirty) {
      const pixels = this._localFieldPixels;
      for (let y = 0; y < resolution; y++) {
        position.z = startZ + y * cellSize;
        for (let x = 0; x < resolution; x++) {
          position.x = startX + x * cellSize;
          const pixelIndex = y * resolution + x;
          this._writeLocalFieldSample(
            pixels,
            pixelIndex * 4,
            this._localFieldExposurePixels,
            pixelIndex,
            position,
            pixelIndex
          );
          exposureSampleCount++;
          dynamicSampleCount++;
        }
      }
      performedFullUpdate = true;
    }
    const requiresFullDynamicRefresh = dynamicDirty && (!canScrollExposure || this._requiresFullDynamicRebuild);
    if (requiresFullDynamicRefresh && !performedFullUpdate) {
      const pixels = this._localFieldPixels;
      for (let y = 0; y < resolution; y++) {
        position.z = startZ + y * cellSize;
        for (let x = 0; x < resolution; x++) {
          position.x = startX + x * cellSize;
          const pixelIndex = y * resolution + x;
          this._writeDynamicFieldSample(
            pixels,
            pixelIndex * 4,
            this._localFieldExposurePixels[pixelIndex] / 255,
            position,
            pixelIndex
          );
          dynamicSampleCount++;
        }
      }
      performedFullUpdate = true;
    }
    const canScrollResponse =
      !historyInvalid &&
      anchorDirty &&
      sameFieldHeight &&
      Math.abs(centerDeltaX - cellOffsetX * cellSize) <= cellSize * 1e-5 &&
      Math.abs(centerDeltaZ - cellOffsetZ * cellSize) <= cellSize * 1e-5 &&
      (cellOffsetX !== 0 || cellOffsetZ !== 0) &&
      Math.abs(cellOffsetX) < resolution &&
      Math.abs(cellOffsetZ) < resolution;
    this._updateGroundResponseField(
      this._fieldAccumulator,
      historyInvalid || (anchorDirty && !canScrollResponse),
      canScrollResponse,
      cellOffsetX,
      cellOffsetZ
    );
    this.localFieldTexture.setPixelBuffer(this._localFieldPixels);
    if (exposureDirty) this.localFieldExposureTexture.setPixelBuffer(this._localFieldExposurePixels);
    if (historyInvalid) {
      this._previousLocalFieldPixels.set(this._localFieldPixels);
      this.previousLocalFieldTexture.setPixelBuffer(this._previousLocalFieldPixels);
      this._previousLocalFieldExposurePixels.set(this._localFieldExposurePixels);
      this.previousLocalFieldExposureTexture.setPixelBuffer(this._previousLocalFieldExposurePixels);
    }
    this._fieldRevision++;
    this._observedEmitterRevision = this._system.getEmitterRevision();
    this._observedExposureRevision = this._system.getExposureRevision();
    const context = this._system.getGpuContext();
    if (exposureDirty) {
      const horizontalDirectionLength = Math.hypot(context.directionWS[0], context.directionWS[2]);
      this._fieldDirectionX = horizontalDirectionLength > 1e-5 ? context.directionWS[0] / horizontalDirectionLength : 1;
      this._fieldDirectionZ = horizontalDirectionLength > 1e-5 ? context.directionWS[2] / horizontalDirectionLength : 0;
    }
    this._fieldAccumulator = 0;
    this._fieldTemporalBlend = historyInvalid ? 1 : 0;
    this._exposureTemporalBlend = historyInvalid ? 1 : exposureDirty ? 0 : 1;
    this._lastDirtyFlags = consumedDirtyFlags;
    this._dirtyFlags = WindFieldDirtyFlag.None;
    this._requiresFullExposureRebuild = false;
    this._requiresFullDynamicRebuild = false;
    this._lastExposureSampleCount = exposureSampleCount;
    this._lastDynamicSampleCount = dynamicSampleCount;
    this._lastLocalFieldSampleCount = dynamicSampleCount;
    this._peakLocalFieldSampleCount = Math.max(this._peakLocalFieldSampleCount, dynamicSampleCount);
    if (performedFullUpdate) this._fullLocalFieldUpdateCount++;
    else if (performedIncrementalUpdate) this._incrementalLocalFieldUpdateCount++;
    this._lastLocalFieldCpuTimeMs = performance.now() - cpuStart;
    this._peakLocalFieldCpuTimeMs = Math.max(this._peakLocalFieldCpuTimeMs, this._lastLocalFieldCpuTimeMs);
    if (exposureSampleCount > 0) {
      updateCpuRasterBaseline(
        this._cpuExposureAndDynamicBaseline,
        this._lastLocalFieldCpuTimeMs,
        exposureSampleCount,
        dynamicSampleCount,
        consumedDirtyFlags
      );
    } else if (dynamicSampleCount > 0) {
      updateCpuRasterBaseline(
        this._cpuDynamicOnlyBaseline,
        this._lastLocalFieldCpuTimeMs,
        0,
        dynamicSampleCount,
        consumedDirtyFlags
      );
    }
  }

  private _refreshGpuLocalField(
    cpuStart: number,
    consumedDirtyFlags: WindFieldDirtyFlag,
    historyInvalid: boolean,
    responseDemand: WindGpuResponsePass
  ): void {
    const provider = this._gpuExposureProvider!;
    const renderer = this._gpuFieldRenderer!;
    const worldSize = this.config.localFieldWorldSizeMeters;
    const responseHistoryOffsetX = (this._requestedFieldCenter.x - this._fieldCenter.x) / worldSize;
    const responseHistoryOffsetZ = (this._requestedFieldCenter.z - this._fieldCenter.z) / worldSize;
    const resolution = this.config.localFieldResolution;
    const cellSize = worldSize / resolution;
    const centerDeltaX = this._requestedFieldCenter.x - this._fieldCenter.x;
    const centerDeltaZ = this._requestedFieldCenter.z - this._fieldCenter.z;
    const sameFieldHeight = this._requestedFieldCenter.y === this._fieldCenter.y;
    const cellOffsetX = Math.round(centerDeltaX / cellSize);
    const cellOffsetZ = Math.round(centerDeltaZ / cellSize);
    const anchorDirty = (consumedDirtyFlags & WindFieldDirtyFlag.Anchor) !== 0;
    const canScrollResponse =
      !historyInvalid &&
      anchorDirty &&
      sameFieldHeight &&
      Math.abs(centerDeltaX - cellOffsetX * cellSize) <= cellSize * 1e-5 &&
      Math.abs(centerDeltaZ - cellOffsetZ * cellSize) <= cellSize * 1e-5 &&
      (cellOffsetX !== 0 || cellOffsetZ !== 0) &&
      Math.abs(cellOffsetX) < resolution &&
      Math.abs(cellOffsetZ) < resolution;
    this._fieldCenter.copyFrom(this._requestedFieldCenter);
    const minimumX = this._fieldCenter.x - worldSize * 0.5;
    const minimumZ = this._fieldCenter.z - worldSize * 0.5;
    const maximumX = this._fieldCenter.x + worldSize * 0.5;
    const maximumZ = this._fieldCenter.z + worldSize * 0.5;
    const context = this._system.getGpuContext();
    const horizontalDirectionLength = Math.hypot(context.directionWS[0], context.directionWS[2]);
    const directionX = horizontalDirectionLength > 1e-5 ? context.directionWS[0] / horizontalDirectionLength : 1;
    const directionZ = horizontalDirectionLength > 1e-5 ? context.directionWS[2] / horizontalDirectionLength : 0;
    const exposureDirty = (consumedDirtyFlags & WindFieldDirtyFlag.Exposure) !== 0;
    if (exposureDirty || !this._gpuExposureTexture) {
      const request = this._gpuExposureRequest;
      request.minimumX = minimumX;
      request.minimumZ = minimumZ;
      request.maximumX = maximumX;
      request.maximumZ = maximumZ;
      request.resolution = this.config.localFieldResolution;
      request.directionX = directionX;
      request.directionZ = directionZ;
      this._gpuExposureTexture = provider.render(request);
      this._previousGpuExposureTexture = provider.getPreviousTexture();
      this._observedGpuExposureRevision = readGpuExposureRevision(provider);
      this._fieldDirectionX = directionX;
      this._fieldDirectionZ = directionZ;
    }
    const request = this._gpuFieldRequest;
    request.minimumX = minimumX;
    request.minimumZ = minimumZ;
    request.maximumX = maximumX;
    request.maximumZ = maximumZ;
    request.centerY = this._fieldCenter.y;
    request.velocityRangeMps = this.config.localVelocityRangeMps;
    request.historyInvalid = historyInvalid;
    request.responseDeltaTime = Math.max(0, this._fieldAccumulator);
    request.responseRampDuration = 1 / this.config.localFieldUpdatesPerSecond;
    request.responseHistoryOffsetX = responseHistoryOffsetX;
    request.responseHistoryOffsetZ = responseHistoryOffsetZ;
    renderer.renderField(this._gpuExposureTexture!, request);
    this._pendingGpuResponsePasses |= responseDemand;
    if (historyInvalid) this._gpuResponseResetPasses |= responseDemand;
    this._responseVelocityX = context.velocityWS[0];
    this._responseVelocityZ = context.velocityWS[2];
    this._fieldRevision++;
    this._observedEmitterRevision = this._system.getEmitterRevision();
    this._observedExposureRevision = this._system.getExposureRevision();
    this._observedGpuFieldContentRevision = renderer.contentRevision;
    this._fieldAccumulator = 0;
    this._fieldTemporalBlend = historyInvalid ? 1 : 0;
    this._exposureTemporalBlend = historyInvalid ? 1 : exposureDirty ? 0 : 1;
    this._lastDirtyFlags = consumedDirtyFlags;
    this._dirtyFlags = WindFieldDirtyFlag.None;
    this._requiresFullExposureRebuild = false;
    this._requiresFullDynamicRebuild = false;
    this._lastExposureSampleCount = 0;
    this._lastDynamicSampleCount = 0;
    this._lastLocalFieldSampleCount = 0;
    this._peakLocalFieldSampleCount = Math.max(this._peakLocalFieldSampleCount, this._lastLocalFieldSampleCount);
    this._fullLocalFieldUpdateCount++;
    this._lastLocalFieldCpuTimeMs = performance.now() - cpuStart;
    this._peakLocalFieldCpuTimeMs = Math.max(this._peakLocalFieldCpuTimeMs, this._lastLocalFieldCpuTimeMs);
    this._publishTextures();
  }

  private _renderNextGpuResponse(responseDemand: WindGpuResponsePass): boolean {
    const renderer = this._gpuFieldRenderer;
    const exposureTexture = this._gpuExposureTexture;
    const previousExposureTexture = this._previousGpuExposureTexture;
    if (!renderer || !exposureTexture || !previousExposureTexture) return false;
    const eligiblePasses = this._pendingGpuResponsePasses & responseDemand;
    if (eligiblePasses === WindGpuResponsePass.None) return false;

    for (let offset = 0; offset < GPU_RESPONSE_PASS_ORDER.length; offset++) {
      const index = (this._gpuResponsePassCursor + offset) % GPU_RESPONSE_PASS_ORDER.length;
      const pass = GPU_RESPONSE_PASS_ORDER[index];
      if (!(eligiblePasses & pass)) continue;
      const request = this._gpuFieldRequest;
      request.historyInvalid = (this._gpuResponseResetPasses & pass) !== 0;
      request.responseDeltaTime = Math.max(0, this._gpuResponseElapsedSeconds[index]);
      renderer.renderResponse(pass, exposureTexture, previousExposureTexture, request);
      this._gpuResponseElapsedSeconds[index] = 0;
      this._pendingGpuResponsePasses &= ~pass;
      this._gpuResponseResetPasses &= ~pass;
      this._gpuResponseInitializedPasses |= pass;
      this._gpuResponsePassCursor = (index + 1) % GPU_RESPONSE_PASS_ORDER.length;
      this._gpuResponsePassCount++;
      this._publishTextures();
      return true;
    }
    return false;
  }

  private _updateGroundResponseField(
    elapsedSeconds: number,
    resetHistory: boolean,
    scrollHistory: boolean,
    cellOffsetX: number,
    cellOffsetZ: number
  ): void {
    const resolution = this.config.localFieldResolution;
    const state = this._groundResponseState;
    const startTargets = this._groundResponseStartTargets;
    const targets = this._groundResponseTargets;
    let inputState = state;
    let inputFlowerState = this._flowerResponseState;
    let inputStartTargets = startTargets;
    let inputTargets = targets;
    if (scrollHistory) {
      const scrolledState = this._groundResponseStateScratch;
      const scrolledFlowerState = this._flowerResponseStateScratch;
      const scrolledStartTargets = this._groundResponseStartTargetScratch;
      const scrolledTargets = this._groundResponseTargetScratch;
      scrolledState.fill(Number.NaN);
      scrolledFlowerState.fill(Number.NaN);
      scrolledStartTargets.fill(0);
      scrolledTargets.fill(0);
      for (let y = 0; y < resolution; y++) {
        const sourceY = y + cellOffsetZ;
        if (sourceY < 0 || sourceY >= resolution) continue;
        for (let x = 0; x < resolution; x++) {
          const sourceX = x + cellOffsetX;
          if (sourceX < 0 || sourceX >= resolution) continue;
          const targetIndex = y * resolution + x;
          const sourceIndex = sourceY * resolution + sourceX;
          const targetOffset = targetIndex * 4;
          const sourceOffset = sourceIndex * 4;
          scrolledState[targetOffset] = state[sourceOffset];
          scrolledState[targetOffset + 1] = state[sourceOffset + 1];
          scrolledState[targetOffset + 2] = state[sourceOffset + 2];
          scrolledState[targetOffset + 3] = state[sourceOffset + 3];
          scrolledFlowerState[targetOffset] = this._flowerResponseState[sourceOffset];
          scrolledFlowerState[targetOffset + 1] = this._flowerResponseState[sourceOffset + 1];
          scrolledFlowerState[targetOffset + 2] = this._flowerResponseState[sourceOffset + 2];
          scrolledFlowerState[targetOffset + 3] = this._flowerResponseState[sourceOffset + 3];
          scrolledStartTargets[targetIndex] = startTargets[sourceIndex];
          scrolledTargets[targetIndex] = targets[sourceIndex];
        }
      }
      inputState = scrolledState;
      inputFlowerState = scrolledFlowerState;
      inputStartTargets = scrolledStartTargets;
      inputTargets = scrolledTargets;
    }

    const nextTargets = this._nextGroundResponseTargets;
    const responsePixels = this._groundResponsePixels;
    const flowerState = this._flowerResponseState;
    const flowerResponsePixels = this._flowerResponsePixels;
    const deltaTime = Math.max(0, elapsedSeconds);
    const rampDuration = 1 / this.config.localFieldUpdatesPerSecond;
    for (let index = 0; index < nextTargets.length; index++) {
      const offset = index * 4;
      const localWeight = groundResponseLocalWeightAtIndex(index, resolution);
      const nextTarget = this._groundReferenceGustHistory.z * (1 - localWeight) + nextTargets[index] * localWeight;
      nextTargets[index] = nextTarget;
      if (resetHistory || !Number.isFinite(inputState[offset])) {
        state[offset] = nextTarget;
        state[offset + 1] = 0;
        state[offset + 2] = nextTarget;
        state[offset + 3] = 0;
        flowerState[offset] = nextTarget;
        flowerState[offset + 1] = 0;
        flowerState[offset + 2] = nextTarget;
        flowerState[offset + 3] = 0;
        inputTargets[index] = nextTarget;
      } else {
        integrateDampedRampResponse(
          inputState[offset],
          inputState[offset + 1],
          inputStartTargets[index],
          inputTargets[index],
          this.config.groundResponseLowFrequencyHz,
          this.config.groundResponseLowDampingRatio,
          rampDuration,
          deltaTime,
          state,
          offset
        );
        integrateDampedRampResponse(
          inputState[offset + 2],
          inputState[offset + 3],
          inputStartTargets[index],
          inputTargets[index],
          this.config.groundResponseHighFrequencyHz,
          this.config.groundResponseHighDampingRatio,
          rampDuration,
          deltaTime,
          state,
          offset + 2
        );
        integrateDampedRampResponse(
          inputFlowerState[offset],
          inputFlowerState[offset + 1],
          inputStartTargets[index],
          inputTargets[index],
          this.config.flowerResponseFrequencyHz,
          this.config.flowerResponseDampingRatio,
          rampDuration,
          deltaTime,
          flowerState,
          offset
        );
        flowerState[offset + 2] = flowerState[offset];
        flowerState[offset + 3] = flowerState[offset + 1];
      }
      responsePixels[offset] = toHalf(state[offset]);
      responsePixels[offset + 1] = toHalf(state[offset + 1]);
      responsePixels[offset + 2] = toHalf(state[offset + 2]);
      responsePixels[offset + 3] = toHalf(state[offset + 3]);
      flowerResponsePixels[offset] = toHalf(flowerState[offset]);
      flowerResponsePixels[offset + 1] = toHalf(flowerState[offset + 1]);
      flowerResponsePixels[offset + 2] = toHalf(flowerState[offset + 2]);
      flowerResponsePixels[offset + 3] = toHalf(flowerState[offset + 3]);
    }
    if (resetHistory) startTargets.set(nextTargets);
    else startTargets.set(inputTargets);
    targets.set(nextTargets);
    this.groundResponseTexture.setPixelBuffer(responsePixels);
    this.flowerResponseTexture.setPixelBuffer(flowerResponsePixels);
  }

  private _advanceGroundReferenceGustHistory(currentGust: number, resetHistory: boolean): void {
    const history = this._groundReferenceGustHistory;
    if (resetHistory) {
      history.set(currentGust, currentGust, currentGust, 0);
      return;
    }
    history.set(history.y, history.z, currentGust, 0);
  }

  private _writeLocalFieldSample(
    pixels: Uint16Array,
    offset: number,
    exposurePixels: Uint8Array,
    exposureOffset: number,
    position: Vector3,
    responseTargetIndex: number
  ): void {
    const sample = this._system.sampleRenderLocalField(position, this._localSample);
    const velocityRange = this.config.localVelocityRangeMps;
    const context = this._system.getGpuContext();
    const emitterVelocityX = sample.velocityDeltaWS[0] - context.velocityWS[0] * sample.gust;
    const emitterVelocityZ = sample.velocityDeltaWS[2] - context.velocityWS[2] * sample.gust;
    pixels[offset] = toHalf(clamp(emitterVelocityX, -velocityRange, velocityRange));
    pixels[offset + 1] = toHalf(clamp(emitterVelocityZ, -velocityRange, velocityRange));
    pixels[offset + 2] = toHalf(sample.turbulence);
    pixels[offset + 3] = toHalf(sample.gust);
    this._nextGroundResponseTargets[responseTargetIndex] = sample.gust;
    exposurePixels[exposureOffset] = encodeUnit(sample.exposure);
  }

  private _writeDynamicFieldSample(
    pixels: Uint16Array,
    offset: number,
    exposure: number,
    position: Vector3,
    responseTargetIndex: number
  ): void {
    const sample = this._system.sampleRenderDynamicLocalField(position, exposure, this._localSample);
    const velocityRange = this.config.localVelocityRangeMps;
    const context = this._system.getGpuContext();
    const emitterVelocityX = sample.velocityDeltaWS[0] - context.velocityWS[0] * sample.gust;
    const emitterVelocityZ = sample.velocityDeltaWS[2] - context.velocityWS[2] * sample.gust;
    pixels[offset] = toHalf(clamp(emitterVelocityX, -velocityRange, velocityRange));
    pixels[offset + 1] = toHalf(clamp(emitterVelocityZ, -velocityRange, velocityRange));
    pixels[offset + 2] = toHalf(sample.turbulence);
    pixels[offset + 3] = toHalf(sample.gust);
    this._nextGroundResponseTargets[responseTargetIndex] = sample.gust;
  }

  /** Publishes the reused CPU state; no vector allocations occur per frame. */
  publish(): void {
    this._assertAlive();
    if (!this._active) return;
    const context = this._system.getGpuContext();
    this._velocity.set(context.velocityWS[0], context.velocityWS[1], context.velocityWS[2]);
    this._spectrumAdvectionOffset.set(context.spectrumAdvectionOffsetXZ[0], 0, context.spectrumAdvectionOffsetXZ[1]);
    this._fieldParams.set(context.speedMps, context.gust, context.turbulence, context.elapsedTime);
    this._layerMultipliers.set(context.layerMultipliers[0], context.layerMultipliers[1], context.layerMultipliers[2]);
    const profile = context.spectrum;
    this._spectrumParams.set(
      1 / profile.macroScaleMeters,
      profile.macroScaleMeters / profile.mesoScaleMeters,
      profile.macroScaleMeters / profile.microScaleMeters,
      profile.directionalVariation
    );
    this._localFieldTransform.set(
      this._fieldCenter.x,
      this._fieldCenter.z,
      1 / this.config.localFieldWorldSizeMeters,
      this.config.localVelocityRangeMps
    );
    this._localFieldTemporalParams.set(
      this._fieldTemporalBlend,
      this._exposureTemporalBlend,
      this._fieldRevision,
      Math.max(0, this._fieldAccumulator)
    );
    const data = this._scene.shaderData;
    data.setFloat(WIND_ANIMATION_ENABLED, 1);
    data.setVector3(WIND_VELOCITY, this._velocity);
    data.setVector3(WIND_SPECTRUM_ADVECTION_OFFSET, this._spectrumAdvectionOffset);
    data.setVector4(WIND_FIELD_PARAMS, this._fieldParams);
    data.setVector3(WIND_LAYER_MULTIPLIERS, this._layerMultipliers);
    data.setVector4(WIND_SPECTRUM_PARAMS, this._spectrumParams);
    data.setVector4(WIND_LOCAL_FIELD_TRANSFORM, this._localFieldTransform);
    data.setVector4(WIND_LOCAL_FIELD_TEMPORAL_PARAMS, this._localFieldTemporalParams);
    data.setVector4(WIND_GROUND_RESPONSE_PARAMS, this._groundResponseParams);
    data.setVector4(WIND_FLOWER_RESPONSE_PARAMS, this._flowerResponseParams);
    data.setVector4(
      WIND_GROUND_REFERENCE_GUST_HISTORY,
      this._gpuFieldRenderer?.groundReferenceGustHistory ?? this._groundReferenceGustHistory
    );
    data.setVector4(WIND_TREE_RESPONSE_PARAMS, this._treeResponseParams);
    data.setFloat(WIND_GROUND_RESPONSE_RAMP_DURATION, 1 / this.config.localFieldUpdatesPerSecond);
  }

  /** Suspends or restores every Scene binding without reallocating the P3 textures. */
  setActive(active: boolean): void {
    this._assertAlive();
    if (this._active === active) return;
    this._active = active;
    if (active) {
      this._dirtyFlags |= WindFieldDirtyFlag.Exposure | WindFieldDirtyFlag.Dynamic | WindFieldDirtyFlag.History;
      this._requiresFullExposureRebuild = true;
      this._requiresFullDynamicRebuild = true;
      if (this._gpuFieldRenderer) this._gpuRefreshPending = true;
      this._publishTextures();
      this.publish();
      return;
    }
    const data = this._scene.shaderData;
    this._visibleGpuConsumerDemand = WindGpuConsumerDemand.None;
    this._pendingGpuResponsePasses = WindGpuResponsePass.None;
    this._gpuResponseResetPasses = WindGpuResponsePass.None;
    this._gpuResponseInitializedPasses = WindGpuResponsePass.None;
    data.setFloat(WIND_ANIMATION_ENABLED, 0);
    this._velocity.set(0, 0, 0);
    this._fieldParams.set(0, 0, 0, 0);
    this._spectrumAdvectionOffset.set(0, 0, 0);
    this._localFieldTransform.set(this._fieldCenter.x, this._fieldCenter.z, 0, 0);
    this._localFieldTemporalParams.set(0, 0, this._fieldRevision, 0);
    data.setVector3(WIND_VELOCITY, this._velocity);
    data.setVector4(WIND_FIELD_PARAMS, this._fieldParams);
    data.setVector3(WIND_SPECTRUM_ADVECTION_OFFSET, this._spectrumAdvectionOffset);
    data.setVector4(WIND_LOCAL_FIELD_TRANSFORM, this._localFieldTransform);
    data.setVector4(WIND_LOCAL_FIELD_TEMPORAL_PARAMS, this._localFieldTemporalParams);
    data.setVector4(WIND_GROUND_RESPONSE_PARAMS, this._groundResponseParams);
    data.setVector4(WIND_FLOWER_RESPONSE_PARAMS, this._flowerResponseParams);
    data.setVector4(WIND_GROUND_REFERENCE_GUST_HISTORY, this._disabledGroundReferenceGustHistory);
    data.setVector4(WIND_TREE_RESPONSE_PARAMS, this._treeResponseParams);
    data.setFloat(WIND_GROUND_RESPONSE_RAMP_DURATION, 1 / this.config.localFieldUpdatesPerSecond);
  }

  /** Detached allocation/memory diagnostics. */
  getSnapshot(): WindSceneBridgeSnapshot {
    return {
      active: this._active,
      localFieldResolution: this.config.localFieldResolution,
      localFieldWorldSizeMeters: this.config.localFieldWorldSizeMeters,
      localFieldUpdatesPerSecond: this.config.localFieldUpdatesPerSecond,
      localVelocityRangeMps: this.config.localVelocityRangeMps,
      localFieldCenterWS: [this._fieldCenter.x, this._fieldCenter.y, this._fieldCenter.z],
      localFieldRevision: this._fieldRevision,
      localFieldTemporalBlend: this._fieldTemporalBlend,
      lastLocalFieldCpuTimeMs: this._lastLocalFieldCpuTimeMs,
      peakLocalFieldCpuTimeMs: this._peakLocalFieldCpuTimeMs,
      lastLocalFieldSampleCount: this._lastLocalFieldSampleCount,
      peakLocalFieldSampleCount: this._peakLocalFieldSampleCount,
      lastExposureSampleCount: this._lastExposureSampleCount,
      lastDynamicSampleCount: this._lastDynamicSampleCount,
      lastDirtyReasons: dirtyReasons(this._lastDirtyFlags),
      cpuExposureAndDynamicBaseline: snapshotCpuRasterBaseline(this._cpuExposureAndDynamicBaseline),
      cpuDynamicOnlyBaseline: snapshotCpuRasterBaseline(this._cpuDynamicOnlyBaseline),
      fullLocalFieldUpdateCount: this._fullLocalFieldUpdateCount,
      incrementalLocalFieldUpdateCount: this._incrementalLocalFieldUpdateCount,
      visibleGpuConsumerDemand: this._visibleGpuConsumerDemand,
      pendingGpuResponsePassCount: countSetBits(this._pendingGpuResponsePasses),
      gpuResponsePassCount: this._gpuResponsePassCount,
      spectrumTextureBytes: this._spectrumPixels.byteLength,
      localFieldSliceBytes: this._localFieldPixels.byteLength,
      localFieldTextureBytes: this._localFieldPixels.byteLength + this._previousLocalFieldPixels.byteLength,
      exposureTextureBytes:
        this._localFieldExposurePixels.byteLength + this._previousLocalFieldExposurePixels.byteLength,
      groundResponseTextureBytes: this._groundResponsePixels.byteLength + this._flowerResponsePixels.byteLength,
      treeResponseTextureBytes: this._gpuFieldRenderer ? this._groundResponsePixels.byteLength * 4 : 0,
      retainedLocalFieldTextureBytes:
        this._localFieldPixels.byteLength +
        this._previousLocalFieldPixels.byteLength +
        (this._gpuFieldRenderer ? this._localFieldPixels.byteLength * 3 : 0) +
        this._localFieldExposurePixels.byteLength +
        this._previousLocalFieldExposurePixels.byteLength +
        this._groundResponsePixels.byteLength +
        this._flowerResponsePixels.byteLength +
        (this._gpuFieldRenderer ? this._groundResponsePixels.byteLength * 6 : 0) +
        (this._gpuFieldRenderer ? this._flowerResponsePixels.byteLength * 2 : 0) +
        8,
      rasterBackend: this._gpuFieldRenderer ? "gpu" : "cpu"
    };
  }

  /**
   * Returns whether every retained dynamic response has completed its physical release.
   * Static exposure/anchor dirtiness is intentionally excluded: it has no visible contribution
   * when both the macro wind and analytical local sources are absent.
   */
  isDynamicResponseSettled(): boolean {
    this._assertAlive();
    return (
      this._groundResponseSettleRemainingSeconds <= 0 &&
      this._treeResponseSettleRemainingSeconds <= 0 &&
      this._system.getActiveGustCount() === 0 &&
      (this._dirtyFlags & WindFieldDirtyFlag.Dynamic) === 0 &&
      (!this._gpuRefreshPending || this._visibleGpuConsumerDemand === WindGpuConsumerDemand.None) &&
      this._pendingGpuResponsePasses === WindGpuResponsePass.None
    );
  }

  /** Clears Scene bindings and releases every bridge-owned CPU/GPU texture. */
  destroy(): void {
    if (this._destroyed) return;
    if (this._active) this.setActive(false);
    this._gpuPipelinePassRegistration?.unregister();
    this._gpuPipelinePassRegistration = null;
    this._gpuRenderCamera = null;
    this.spectrumTexture.destroy(true);
    this._gpuFieldRenderer?.destroy();
    this._gpuFieldRenderer = null;
    this.localFieldTexture.destroy(true);
    this.previousLocalFieldTexture.destroy(true);
    this.localFieldExposureTexture.destroy(true);
    this.previousLocalFieldExposureTexture.destroy(true);
    this.groundResponseTexture.destroy(true);
    this.flowerResponseTexture.destroy(true);
    this._treeResponseFallbackTexture.destroy(true);
    this._destroyed = true;
  }

  private _publishTextures(): void {
    const data = this._scene.shaderData;
    const current = this._gpuFieldRenderer?.texture ?? this.localFieldTexture;
    const previous = this._gpuFieldRenderer?.previousTexture ?? this.previousLocalFieldTexture;
    const exposure = this._gpuExposureTexture ?? this.localFieldExposureTexture;
    const previousExposure = this._previousGpuExposureTexture ?? this.previousLocalFieldExposureTexture;
    data.setTexture(WIND_SPECTRUM_TEXTURE, this.spectrumTexture);
    data.setTexture(WIND_LOCAL_FIELD_TEXTURE, current);
    data.setTexture(WIND_LOCAL_FIELD_PREVIOUS_TEXTURE, previous);
    data.setTexture(WIND_LOCAL_FIELD_EXPOSURE_TEXTURE, exposure);
    data.setTexture(WIND_LOCAL_FIELD_PREVIOUS_EXPOSURE_TEXTURE, previousExposure);
    data.setTexture(
      WIND_GROUND_RESPONSE_TEXTURE,
      this._gpuFieldRenderer?.groundResponseTexture ?? this.groundResponseTexture
    );
    data.setTexture(
      WIND_FLOWER_RESPONSE_TEXTURE,
      this._gpuFieldRenderer?.flowerResponseTexture ?? this.flowerResponseTexture
    );
    data.setTexture(
      WIND_TREE_RESPONSE_SLOW_TEXTURE,
      this._gpuFieldRenderer?.treeSlowResponseTexture ?? this._treeResponseFallbackTexture
    );
    data.setTexture(
      WIND_TREE_RESPONSE_FAST_TEXTURE,
      this._gpuFieldRenderer?.treeFastResponseTexture ?? this._treeResponseFallbackTexture
    );
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("Wind Scene bridge has been destroyed");
  }
}

function responsePassesForConsumerDemand(demand: WindGpuConsumerDemand): WindGpuResponsePass {
  let passes = WindGpuResponsePass.None;
  if (demand & WindGpuConsumerDemand.GroundResponse) passes |= WindGpuResponsePass.Ground;
  if (demand & WindGpuConsumerDemand.FlowerResponse) passes |= WindGpuResponsePass.Flower;
  if (demand & WindGpuConsumerDemand.TreeResponse) passes |= WindGpuResponsePass.Tree;
  return passes;
}

function countSetBits(value: number): number {
  let count = 0;
  while (value) {
    value &= value - 1;
    count++;
  }
  return count;
}

interface MutableWindCpuRasterBaseline {
  updateCount: number;
  timeMs: number;
  exposureSampleCount: number;
  dynamicSampleCount: number;
  dirtyFlags: WindFieldDirtyFlag;
}

function createCpuRasterBaseline(): MutableWindCpuRasterBaseline {
  return {
    updateCount: 0,
    timeMs: 0,
    exposureSampleCount: 0,
    dynamicSampleCount: 0,
    dirtyFlags: WindFieldDirtyFlag.None
  };
}

function updateCpuRasterBaseline(
  baseline: MutableWindCpuRasterBaseline,
  timeMs: number,
  exposureSampleCount: number,
  dynamicSampleCount: number,
  dirtyFlags: WindFieldDirtyFlag
): void {
  baseline.updateCount++;
  baseline.timeMs = timeMs;
  baseline.exposureSampleCount = exposureSampleCount;
  baseline.dynamicSampleCount = dynamicSampleCount;
  baseline.dirtyFlags = dirtyFlags;
}

function snapshotCpuRasterBaseline(baseline: MutableWindCpuRasterBaseline): WindCpuRasterBaselineSnapshot {
  return {
    updateCount: baseline.updateCount,
    timeMs: baseline.timeMs,
    exposureSampleCount: baseline.exposureSampleCount,
    dynamicSampleCount: baseline.dynamicSampleCount,
    dirtyReasons: dirtyReasons(baseline.dirtyFlags)
  };
}

/** Deterministic seamless RGBA spectrum used by one packed vertex-texture sample. */
export function buildPackedWindSpectrum(size: number, seed: number): Uint8Array {
  if (!Number.isSafeInteger(size) || size < 4) throw new RangeError("Wind spectrum size must be an integer >= 4");
  if (!Number.isSafeInteger(seed)) throw new RangeError("Wind spectrum seed must be a safe integer");
  const pixels = new Uint8Array(size * size * 4);
  // Adjacent integer seeds must not collapse to the same 8-bit texture after quantisation.
  // Avalanche the authored seed before turning it into a phase so nearby seeds produce
  // decorrelated, but still deterministic, spectra.
  const seedPhase = (hashSeed(seed >>> 0) / 0x1_0000_0000) * Math.PI * 2;
  for (let y = 0; y < size; y++) {
    const v = (y / size) * Math.PI * 2;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const macro = periodicBand(u, v, 1, seedPhase);
      const meso = periodicBand(u, v, 4, seedPhase + 1.73);
      const micro = periodicBand(u, v, 14, seedPhase + 3.91);
      const decorrelated = periodicBand(u, v, 7, seedPhase + 5.27);
      const offset = (y * size + x) * 4;
      pixels[offset] = encodeSignedUnit(macro);
      pixels[offset + 1] = encodeSignedUnit(meso);
      pixels[offset + 2] = encodeSignedUnit(micro);
      pixels[offset + 3] = encodeSignedUnit(decorrelated);
    }
  }
  return pixels;
}

function hashSeed(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function periodicBand(u: number, v: number, frequency: number, phase: number): number {
  // Repeat sampling requires every nested phase term to complete an integer number of cycles
  // over the texture domain. frequency * 0.5 breaks that invariant for the odd macro/detail
  // bands: the last-to-first texel delta becomes up to ten times an ordinary macro texel step,
  // so fast advection presents a narrow high-gradient strip as a whole-plant pose snap. Keep the
  // former half-frequency modulation for even bands and choose the nearest lower integer for odd
  // bands. The field remains deterministic and multi-scale while its value and slope stay locally
  // bounded across both repeated axes.
  const modulationFrequency = Math.max(1, Math.floor(frequency * 0.5));
  return clamp(
    Math.sin(u * frequency + Math.sin(v * modulationFrequency + phase) * 0.78 + phase) * 0.58 +
      Math.sin(v * frequency + Math.cos(u * modulationFrequency - phase) * 0.64 - phase) * 0.42,
    -1,
    1
  );
}

function fillNeutralLocalField(pixels: Uint16Array): void {
  pixels.fill(toHalf(0));
}

function encodeSignedUnit(value: number): number {
  return Math.round((clamp(value, -1, 1) * 0.5 + 0.5) * 255);
}

function encodeUnit(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

function dirtyReasons(flags: WindFieldDirtyFlag): WindFieldDirtyReason[] {
  const reasons: WindFieldDirtyReason[] = [];
  if (flags & WindFieldDirtyFlag.Anchor) reasons.push("anchor");
  if (flags & WindFieldDirtyFlag.Exposure) reasons.push("exposure");
  if (flags & WindFieldDirtyFlag.Dynamic) reasons.push("dynamic");
  if (flags & WindFieldDirtyFlag.Resource) reasons.push("resource");
  if (flags & WindFieldDirtyFlag.History) reasons.push("history");
  return reasons;
}

function readGpuExposureRevision(provider: WindGpuExposureProvider): number {
  const revision = provider.getRevision();
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError("Wind GPU exposure revision must be a non-negative safe integer");
  }
  return revision;
}

function validateBridgeConfig(config: Readonly<WindSceneBridgeConfig>): void {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Wind bridge ${name} must be finite and positive`);
  }
  if (!Number.isSafeInteger(config.spectrumTextureSize) || !Number.isSafeInteger(config.localFieldResolution)) {
    throw new RangeError("Wind bridge texture resolutions must be safe integers");
  }
  if (
    config.groundResponseLowDampingRatio > 1 ||
    config.groundResponseHighDampingRatio > 1 ||
    config.flowerResponseDampingRatio > 1 ||
    config.groundResponseLowFrequencyHz >= config.groundResponseHighFrequencyHz
  ) {
    throw new RangeError("Wind bridge ground response requires ordered shrub/grass frequencies and damping in (0, 1]");
  }
  if (
    config.treeResponseSlowDampingRatio > 1 ||
    config.treeResponseFastDampingRatio > 1 ||
    config.treeResponseSlowFrequencyHz >= config.treeResponseFastFrequencyHz
  ) {
    throw new RangeError("Wind bridge tree response requires ordered frequencies and damping in (0, 1]");
  }
}

function groundResponseLocalWeightAtIndex(index: number, resolution: number): number {
  const x = index % resolution;
  const y = Math.floor(index / resolution);
  const u = (x + 0.5) / resolution;
  const v = (y + 0.5) / resolution;
  const edgeDistance = Math.min(u, v, 1 - u, 1 - v);
  const normalized = clamp(edgeDistance / 0.04, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function validateVector(name: string, value: WindVector3Like): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) throw new RangeError(`${name} must be finite`);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function integrateDampedResponse(
  position: number,
  velocity: number,
  target: number,
  frequencyHz: number,
  dampingRatio: number,
  deltaTime: number,
  out: Float32Array,
  offset: number
): void {
  if (deltaTime <= 0) {
    out[offset] = position;
    out[offset + 1] = velocity;
    return;
  }
  const omega = Math.PI * 2 * frequencyHz;
  const error = position - target;
  if (dampingRatio >= 0.9999) {
    const coefficient = velocity + omega * error;
    const decay = Math.exp(-omega * deltaTime);
    out[offset] = target + (error + coefficient * deltaTime) * decay;
    out[offset + 1] = (velocity - omega * coefficient * deltaTime) * decay;
    return;
  }
  const dampedOmega = omega * Math.sqrt(Math.max(1 - dampingRatio * dampingRatio, 1e-6));
  const decay = Math.exp(-dampingRatio * omega * deltaTime);
  const cosine = Math.cos(dampedOmega * deltaTime);
  const sine = Math.sin(dampedOmega * deltaTime);
  const sineCoefficient = (velocity + dampingRatio * omega * error) / dampedOmega;
  const oscillation = error * cosine + sineCoefficient * sine;
  out[offset] = target + decay * oscillation;
  out[offset + 1] =
    decay * (-dampingRatio * omega * oscillation - error * dampedOmega * sine + sineCoefficient * dampedOmega * cosine);
}

function integrateDampedRampResponse(
  position: number,
  velocity: number,
  startTarget: number,
  endTarget: number,
  frequencyHz: number,
  dampingRatio: number,
  rampDurationSeconds: number,
  deltaTime: number,
  out: Float32Array,
  offset: number
): void {
  if (deltaTime <= 0) {
    out[offset] = position;
    out[offset + 1] = velocity;
    return;
  }
  const rampDuration = Math.max(rampDurationSeconds, 1e-4);
  const rampTime = Math.min(deltaTime, rampDuration);
  const omega = Math.PI * 2 * frequencyHz;
  const boundedDamping = Math.min(1, Math.max(0.001, dampingRatio));
  const slope = (endTarget - startTarget) / rampDuration;
  const steadyVelocityOffset = (2 * boundedDamping * slope) / omega;
  integrateDampedResponse(
    position - startTarget + steadyVelocityOffset,
    velocity - slope,
    0,
    frequencyHz,
    boundedDamping,
    rampTime,
    out,
    offset
  );
  out[offset] += startTarget + slope * rampTime - steadyVelocityOffset;
  out[offset + 1] += slope;
  if (deltaTime > rampDuration) {
    integrateDampedResponse(
      out[offset],
      out[offset + 1],
      endTarget,
      frequencyHz,
      boundedDamping,
      deltaTime - rampDuration,
      out,
      offset
    );
  }
}

/** Encode a float32 as a float16 bit pattern for RGBA16F data textures. */
function toHalf(value: number): number {
  _halfF32[0] = value;
  const x = _halfI32[0];
  let bits = (x >> 16) & 0x8000;
  let mantissa = (x >> 12) & 0x07ff;
  const exponent = (x >> 23) & 0xff;
  if (exponent < 103) return bits;
  if (exponent > 142) {
    bits |= 0x7c00;
    bits |= (exponent === 255 ? 0 : 1) && x & 0x007fffff;
    return bits;
  }
  if (exponent < 113) {
    mantissa |= 0x0800;
    bits |= (mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1);
    return bits;
  }
  bits |= ((exponent - 112) << 10) | (mantissa >> 1);
  bits += mantissa & 1;
  return bits;
}

class WindTextureContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    private readonly _pixels: Uint8Array | Uint16Array
  ) {
    super(resource);
  }

  override restoreContent(): void {
    this.resource.setPixelBuffer(this._pixels);
  }
}
