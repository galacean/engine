import { Downsampling } from "@galacean/engine-core";
import type { HeightfieldWaterReflectionSamplingReadback } from "../../../runtime/heightfield/HeightfieldWaterReflectionSampling";
import type { CameraWaterFeatureMetrics } from "../../../runtime/optics/CameraWaterFeatureBroker";
import type {
  WaterReflectionBinding,
  WaterReflectionServiceMetrics
} from "../../../runtime/optics/WaterReflectionService";
import type { WaterOpticsLabMetrics, WaterOpticsLabProbeSnapshot, WaterOpticsP1BodyReadback } from "./types";

interface EngineMemorySnapshot {
  readonly textureMemory: number;
  readonly bufferMemory: number;
  readonly totalMemory: number;
}

export interface WaterOpticsLabMetricsInput {
  readonly state: Pick<
    WaterOpticsLabMetrics,
    | "ready"
    | "requestedTier"
    | "resolvedTier"
    | "fallbackReason"
    | "preset"
    | "cameraPreset"
    | "waterBody"
    | "opticsMetricConsumerId"
    | "reflectionMode"
    | "reflectionSource"
    | "refractionEnabled"
    | "compositionMode"
    | "depthWriteEnabled"
    | "waterRendererPriority"
    | "activeWaterRendererPriority"
    | "waterBlendEnabled"
    | "transparentOrderingProbeMode"
    | "transparentSentinelPriority"
    | "transparentSentinelNormalPriority"
    | "transparentSentinelTransparent"
    | "transparentOrderingContractSatisfied"
    | "transparentOrderingProbeWaterFirst"
    | "planarClipEnabled"
    | "debugView"
    | "calibrationMode"
    | "calibrationFeatureFlags"
    | "calibrationReferenceCompositionEnabled"
    | "calibrationEffectiveFresnelOverride"
    | "calibrationOpticalProfile"
    | "opticalDepthNormalizationMeters"
    | "planarAnchorVisible"
    | "planarOrientationMarkersVisible"
    | "localFoamMaskEnabled"
    | "localFoamMaskCenterXZ"
    | "localFoamMaskHalfSizeXZ"
    | "localFoamMaskFeatherMeters"
    | "localFoamMaskSuppressesRefraction"
    | "reflectorMovementEnabled"
    | "reflectorVisible"
    | "reflectorTimeOverrideActive"
    | "reflectorAnimating"
    | "reflectorTime"
    | "reflectorWorldPosition"
    | "cameraMovementEnabled"
    | "freeCameraEnabled"
    | "cameraWorldPosition"
    | "cameraWorldForward"
    | "cameraCutCount"
    | "frozen"
    | "surfaceTime"
    | "statsEnabled"
    | "statsPanelVisible"
    | "sourceHash"
    | "fixtureObjectCount"
    | "waterBodyCount"
    | "runtimeError"
  >;
  readonly cameraFeatures: CameraWaterFeatureMetrics;
  readonly reflection: WaterReflectionServiceMetrics;
  readonly reflectionBinding?: Readonly<WaterReflectionBinding>;
  readonly reflectionSampling?: Readonly<HeightfieldWaterReflectionSamplingReadback>;
  readonly activeBodyReadback?: Readonly<WaterOpticsP1BodyReadback>;
  readonly p1?: WaterOpticsLabMetrics["p1"];
  readonly probe: WaterOpticsLabProbeSnapshot;
  readonly engineMemory: EngineMemorySnapshot;
}

function describeDownsampling(value: Downsampling): string {
  switch (value) {
    case Downsampling.None:
      return "full";
    case Downsampling.TwoX:
      return "2x";
    case Downsampling.FourX:
      return "4x";
    default:
      return "unknown";
  }
}

export function createWaterOpticsLabMetrics(input: WaterOpticsLabMetricsInput): WaterOpticsLabMetrics {
  const binding = input.reflectionBinding;
  const sampling = input.reflectionSampling;
  const activeBodyReadback = input.activeBodyReadback;
  const emptyBodyReadback = (
    consumerId: string,
    bodyKind: "pool-heightfield" | "secondary-pool-heightfield" | "river" | "ocean",
    planarEligible: boolean
  ) =>
    Object.freeze({
      consumerId,
      bodyKind,
      planarEligible,
      refractionEnabled: false,
      filterSampleCount: 1 as const,
      textureWidth: 0,
      textureHeight: 0
    });
  const p1 =
    input.p1 ??
    Object.freeze({
      active: false,
      mode: "inactive" as const,
      validationScope: "evidence-gated" as const,
      materialConsumerCount: 0 as const,
      simultaneousVisibleMaterialConsumerCount: 0 as const,
      sharedOpticalProfileReference: false,
      sharedBindingInstance: false,
      consumerIds: Object.freeze([]),
      consumerPlaneYs: Object.freeze({ pool: 0, river: 0, ocean: 0, secondaryPool: 0 }),
      poolVisible: false,
      riverVisible: false,
      oceanVisible: false,
      secondaryPoolVisible: false,
      secondaryPoolRuntimeCreated: false,
      secondaryPoolRuntimeCreateCount: 0,
      secondaryPoolRuntimeDestroyCount: 0,
      secondaryPoolRuntimeLiveCount: 0 as const,
      bodyReadbacks: Object.freeze({
        pool: emptyBodyReadback("water-optics-lab", "pool-heightfield", true),
        river: emptyBodyReadback("water-optics-lab-river", "river", false),
        ocean: emptyBodyReadback("water-optics-lab-ocean", "ocean", true),
        secondaryPool: emptyBodyReadback("water-optics-lab-secondary-pool", "secondary-pool-heightfield", true)
      }),
      cameraDepthCopyPassCount: 0 as const,
      cameraOpaqueCopyPassCount: 0 as const,
      cameraFeatureConsumerIds: Object.freeze([]),
      activeReflectionConsumerCount: 0,
      eligiblePlanarRequestCount: 0,
      planarOwnerAgeFrames: 0,
      pendingPlanarOwnerAgeFrames: 0,
      planarCameraCount: 0 as const,
      liveRenderTargetCount: 0 as const,
      reflectionCameraCreateCount: 0,
      reflectionCameraDestroyCount: 0,
      renderTargetCreateCount: 0,
      renderTargetDestroyCount: 0,
      experimentalRequested: false,
      experimentalResolvedHigh: false,
      experimentalAdditionalRenderTargetCount: 0 as const
    });
  return Object.freeze({
    ...input.state,
    resolvedReflectionSource: binding?.resolvedSource ?? "sky",
    reflectionFallbackReason: binding?.fallbackReason,
    statsRole: "display-only",
    experimentalFeaturesEnabled: false,
    cameraDepthCopyPassCount: input.cameraFeatures.depthCopyPassCount,
    cameraOpaqueCopyPassCount: input.cameraFeatures.colorCopyPassCount,
    cameraFeatureBytes: input.cameraFeatures.estimatedRenderTargetBytes,
    opaqueDownsampling: describeDownsampling(input.cameraFeatures.opaqueTextureDownsampling),
    planarOwnerId: input.reflection.planarOwnerId,
    planarCameraCount: input.reflection.planarCameraCount,
    planarRenderTargetCount: input.reflection.renderTargetWidth > 0 ? 1 : 0,
    planarRenderTargetBytes: input.reflection.estimatedRenderTargetBytes,
    waterLayerMask: input.reflection.waterLayerMask,
    planarCameraCullingMask: input.reflection.planarCameraCullingMask,
    waterLayerExcludedFromPlanar: input.reflection.waterLayerExcludedFromPlanar,
    materialReflectionSource: activeBodyReadback?.effectiveSource ?? sampling?.effectiveSource ?? "sky",
    materialReflectionFallbackReason: activeBodyReadback?.fallbackReason ?? sampling?.fallbackReason,
    planarTextureWidth: activeBodyReadback?.textureWidth ?? sampling?.textureWidth ?? 0,
    planarTextureHeight: activeBodyReadback?.textureHeight ?? sampling?.textureHeight ?? 0,
    planarDistortionStrength: sampling?.distortionStrength ?? 0,
    planarEdgeFadeTexels: sampling?.edgeFadeTexels ?? 0,
    planarFilterSampleCount: sampling?.filterSampleCount ?? 1,
    probeTextureAvailable: input.probe.textureAvailable,
    probeTextureBound: binding?.resolvedSource === "probe" && binding.probeTexture !== undefined,
    probeResourceBytes: input.probe.resourceBytes,
    probeFaceHashes: input.probe.faceHashes,
    probeProvenance: input.probe.provenance,
    engineTextureBytes: input.engineMemory.textureMemory,
    engineBufferBytes: input.engineMemory.bufferMemory,
    engineTotalBytes: input.engineMemory.totalMemory,
    p1
  });
}

export function writeWaterOpticsLabMetrics(element: HTMLDListElement, metrics: WaterOpticsLabMetrics): void {
  const write = (name: string, value: string): void => {
    const target = element.querySelector(`[data-metric="${name}"]`);
    if (target) target.textContent = value;
  };

  element.dataset.ready = String(metrics.ready);
  element.dataset.requestedTier = metrics.requestedTier;
  element.dataset.resolvedTier = metrics.resolvedTier;
  element.dataset.tierFallbackReason = metrics.fallbackReason ?? "";
  element.dataset.preset = metrics.preset;
  element.dataset.cameraPreset = metrics.cameraPreset;
  element.dataset.waterBody = metrics.waterBody;
  element.dataset.opticsMetricConsumerId = metrics.opticsMetricConsumerId;
  element.dataset.reflectionMode = metrics.reflectionMode;
  element.dataset.reflectionSource = metrics.reflectionSource;
  element.dataset.resolvedReflectionSource = metrics.resolvedReflectionSource;
  element.dataset.reflectionFallbackReason = metrics.reflectionFallbackReason ?? "";
  element.dataset.refractionEnabled = String(metrics.refractionEnabled);
  element.dataset.compositionMode = metrics.compositionMode;
  element.dataset.depthWriteEnabled = String(metrics.depthWriteEnabled);
  element.dataset.waterRendererPriority = String(metrics.waterRendererPriority);
  element.dataset.activeWaterRendererPriority = String(metrics.activeWaterRendererPriority ?? "");
  element.dataset.waterBlendEnabled = String(metrics.waterBlendEnabled ?? "");
  element.dataset.transparentOrderingProbeMode = metrics.transparentOrderingProbeMode;
  element.dataset.transparentSentinelPriority = String(metrics.transparentSentinelPriority);
  element.dataset.transparentSentinelNormalPriority = String(metrics.transparentSentinelNormalPriority);
  element.dataset.transparentSentinelTransparent = String(metrics.transparentSentinelTransparent);
  element.dataset.transparentOrderingContractSatisfied = String(metrics.transparentOrderingContractSatisfied);
  element.dataset.transparentOrderingProbeWaterFirst = String(metrics.transparentOrderingProbeWaterFirst);
  element.dataset.planarClipEnabled = String(metrics.planarClipEnabled);
  element.dataset.debugView = metrics.debugView;
  element.dataset.calibrationMode = metrics.calibrationMode;
  element.dataset.calibrationFeatureFlags = JSON.stringify(metrics.calibrationFeatureFlags);
  element.dataset.calibrationReferenceCompositionEnabled = String(metrics.calibrationReferenceCompositionEnabled);
  element.dataset.calibrationEffectiveFresnelOverride = String(metrics.calibrationEffectiveFresnelOverride ?? "");
  element.dataset.calibrationOpticalProfile = JSON.stringify(metrics.calibrationOpticalProfile ?? null);
  element.dataset.opticalDepthNormalizationMeters = String(metrics.opticalDepthNormalizationMeters);
  element.dataset.planarAnchorVisible = String(metrics.planarAnchorVisible);
  element.dataset.planarOrientationMarkersVisible = String(metrics.planarOrientationMarkersVisible);
  element.dataset.localFoamMaskEnabled = String(metrics.localFoamMaskEnabled);
  element.dataset.localFoamMaskCenterXz = JSON.stringify(metrics.localFoamMaskCenterXZ);
  element.dataset.localFoamMaskHalfSizeXz = JSON.stringify(metrics.localFoamMaskHalfSizeXZ);
  element.dataset.localFoamMaskFeatherMeters = String(metrics.localFoamMaskFeatherMeters);
  element.dataset.localFoamMaskSuppressesRefraction = String(metrics.localFoamMaskSuppressesRefraction);
  element.dataset.reflectorMovementEnabled = String(metrics.reflectorMovementEnabled);
  element.dataset.reflectorVisible = String(metrics.reflectorVisible);
  element.dataset.reflectorTimeOverrideActive = String(metrics.reflectorTimeOverrideActive);
  element.dataset.reflectorAnimating = String(metrics.reflectorAnimating);
  element.dataset.reflectorTime = String(metrics.reflectorTime);
  element.dataset.reflectorWorldPosition = JSON.stringify(metrics.reflectorWorldPosition);
  element.dataset.cameraMovementEnabled = String(metrics.cameraMovementEnabled);
  element.dataset.freeCameraEnabled = String(metrics.freeCameraEnabled);
  element.dataset.cameraWorldPosition = JSON.stringify(metrics.cameraWorldPosition);
  element.dataset.cameraWorldForward = JSON.stringify(metrics.cameraWorldForward);
  element.dataset.cameraCutCount = String(metrics.cameraCutCount);
  element.dataset.surfaceTime = String(metrics.surfaceTime);
  element.dataset.statsEnabled = String(metrics.statsEnabled);
  element.dataset.statsRole = metrics.statsRole;
  element.dataset.depthCopyPassCount = String(metrics.cameraDepthCopyPassCount);
  element.dataset.opaqueCopyPassCount = String(metrics.cameraOpaqueCopyPassCount);
  element.dataset.cameraFeatureBytes = String(metrics.cameraFeatureBytes);
  element.dataset.planarCameraCount = String(metrics.planarCameraCount);
  element.dataset.planarRenderTargetCount = String(metrics.planarRenderTargetCount);
  element.dataset.planarRenderTargetBytes = String(metrics.planarRenderTargetBytes);
  element.dataset.waterLayerMask = String(metrics.waterLayerMask);
  element.dataset.planarCameraCullingMask = String(metrics.planarCameraCullingMask);
  element.dataset.waterLayerExcludedFromPlanar = String(metrics.waterLayerExcludedFromPlanar);
  element.dataset.materialReflectionSource = metrics.materialReflectionSource;
  element.dataset.materialReflectionFallbackReason = metrics.materialReflectionFallbackReason ?? "";
  element.dataset.planarTextureSize = `${metrics.planarTextureWidth}x${metrics.planarTextureHeight}`;
  element.dataset.planarDistortionStrength = String(metrics.planarDistortionStrength);
  element.dataset.planarEdgeFadeTexels = String(metrics.planarEdgeFadeTexels);
  element.dataset.planarFilterSampleCount = String(metrics.planarFilterSampleCount);
  element.dataset.probeTextureAvailable = String(metrics.probeTextureAvailable);
  element.dataset.probeTextureBound = String(metrics.probeTextureBound);
  element.dataset.probeResourceBytes = String(metrics.probeResourceBytes);
  element.dataset.probeFaceHashes = JSON.stringify(metrics.probeFaceHashes);
  element.dataset.probeProvenance = JSON.stringify(metrics.probeProvenance);
  element.dataset.engineTextureBytes = String(metrics.engineTextureBytes);
  element.dataset.engineBufferBytes = String(metrics.engineBufferBytes);
  element.dataset.engineTotalBytes = String(metrics.engineTotalBytes);
  element.dataset.p1Active = String(metrics.p1.active);
  element.dataset.p1ConsumerCount = String(metrics.p1.materialConsumerCount);
  element.dataset.p1VisibleConsumerCount = String(metrics.p1.simultaneousVisibleMaterialConsumerCount);
  element.dataset.p1SelectedOwner = metrics.p1.selectedPlanarOwnerId ?? "";
  element.dataset.p1PendingOwner = metrics.p1.pendingPlanarOwnerId ?? "";
  element.dataset.p1RenderedOwner = metrics.p1.renderedPlanarOwnerId ?? "";
  element.dataset.p1BodyReadbacks = JSON.stringify(metrics.p1.bodyReadbacks);
  element.dataset.runtimeError = metrics.runtimeError;

  write("tier", `${metrics.requestedTier} / ${metrics.resolvedTier}`);
  write("preset", metrics.preset);
  write("water-body", metrics.waterBody);
  write(
    "reflection",
    `${metrics.reflectionMode}${metrics.reflectionMode === "auto" ? ` -> ${metrics.reflectionSource}` : ""} / ${
      metrics.resolvedReflectionSource
    }${metrics.reflectionFallbackReason ? ` (${metrics.reflectionFallbackReason})` : ""}`
  );
  write("composition", `${metrics.compositionMode} / depth ${metrics.depthWriteEnabled ? "write" : "read-only"}`);
  write(
    "transparent-order",
    `${metrics.waterRendererPriority} < ${metrics.transparentSentinelNormalPriority} / ${
      metrics.transparentOrderingContractSatisfied ? "ready" : "not-ready"
    }`
  );
  write(
    "material-reflection",
    `${metrics.materialReflectionSource} / ${metrics.planarTextureWidth}x${metrics.planarTextureHeight}`
  );
  write("surface-time", metrics.surfaceTime.toFixed(2));
  write(
    "motion",
    `reflector ${metrics.reflectorAnimating ? "animating" : metrics.reflectorTimeOverrideActive ? "fixed override" : "hold"} @ ${metrics.reflectorTime.toFixed(2)} / camera ${
      metrics.freeCameraEnabled ? "free" : metrics.cameraMovementEnabled ? "auto" : "fixed"
    } / cuts ${metrics.cameraCutCount}`
  );
  write("camera-pose", metrics.cameraWorldPosition.map((value) => value.toFixed(1)).join(", "));
  write("local-foam", metrics.localFoamMaskEnabled ? "on / refraction suppressed" : "off");
  write("copies", `${metrics.cameraDepthCopyPassCount} / ${metrics.cameraOpaqueCopyPassCount}`);
  write("downsampling", metrics.opaqueDownsampling);
  write(
    "planar",
    `${metrics.planarCameraCount} / ${metrics.planarRenderTargetCount} / ${metrics.planarFilterSampleCount} tap / clip ${
      metrics.planarClipEnabled ? "on" : "off"
    }`
  );
  write(
    "water-bytes",
    String(metrics.cameraFeatureBytes + metrics.planarRenderTargetBytes + metrics.probeResourceBytes)
  );
  write("engine-bytes", `${metrics.engineTextureBytes} / ${metrics.engineBufferBytes}`);
  write("fixtures", String(metrics.fixtureObjectCount));
  write("stats", metrics.statsEnabled ? "display only / enabled" : "display only / disabled");
  write(
    "p1-bodies",
    `${metrics.p1.simultaneousVisibleMaterialConsumerCount}/${metrics.p1.materialConsumerCount} · shared binding`
  );
  write(
    "p1-owners",
    `${metrics.p1.selectedPlanarOwnerId ?? "—"} / ${metrics.p1.pendingPlanarOwnerId ?? "—"} / ${
      metrics.p1.renderedPlanarOwnerId ?? "—"
    }`
  );
  write("error", metrics.runtimeError || "none");
}
