import { assertSupportedOceanRenderContract } from "./OceanRenderContract";
/** WaterBody backend for the finite Ocean with published surface queries. */
import type { Engine, Entity } from "@galacean/engine-core";
import { WaterBodySourceKind } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { ResolvedWaterBodyInstance } from "../../authoring/body/ResolvedWaterBodyInstance";
import type { WaterCompiledResource } from "../../compiler/body/WaterCompiledResource";
import type {
  WaterBackendCompileIdentityContext,
  WaterBackendRuntime,
  WaterBackendRuntimeContext,
  WaterBackendUpdateDecision,
  WaterBackendUpdateRequest,
  WaterBodyBackend
} from "../body/WaterBackendRegistry";
import { createWaterBackendDiagnosticsAdapter } from "../body/WaterBackendDiagnosticsAdapter";
import { WaterBodyRuntimeAdapter } from "../body/WaterBodyRuntime";
import { WaterReflectionBindingLifecycle } from "../optics/WaterReflectionBindingLifecycle";
import type { EffectiveWaterRuntimeSnapshot } from "../state/EffectiveWaterRuntimeSnapshot";
import { resolveOceanRuntimeColor } from "./OceanRuntimeTuning";
import type { OceanTextures } from "./OceanTextureLibrary";
import {
  OceanWaterCompiledResource,
  assertOceanWaterBodyDescriptor,
  computeOceanWaterCompileKey,
  computeOceanWaterPhysicalSourceHash,
  computeOceanWaterSourceHash,
  createEffectiveOceanWaterBodyDescriptor,
  isOceanWaterCompiledTransferV1,
  type OceanWaterBodyDescriptorV1,
  type OceanWaterCompiledTransferV1
} from "./OceanWaterCompiledResource";
import {
  OceanWaterRuntimeController,
  type OceanCameraPositionProvider,
  type OceanWaterRuntimeCompiledInput
} from "./OceanWaterRuntimeController";
import type { OceanWaterRuntimeConfig, OceanWaterRuntimeMetrics } from "./OceanWaterRuntimeTypes";

export const OCEAN_WATER_BACKEND_ID = "ocean";

export interface OceanWaterBackendRuntimeContext {
  readonly engine: Engine;
  readonly surfaceShader?: import("@galacean/engine-core").Shader;
  readonly root: Entity;
  readonly textures: Readonly<OceanTextures>;
  readonly cameraPositionProvider: OceanCameraPositionProvider;
  readonly sceneFogEnabled: boolean;
  readonly lodDebug?: boolean;
  readonly surfaceTimeOverride?: number;
  readonly surfaceLevelOffsetMetres?: number;
}

export interface OceanWaterBackendRuntimeDiagnostics {
  readonly instanceId: string;
  readonly parentRoot: Entity;
  readonly controller: OceanWaterRuntimeController;
  readonly reflection: WaterReflectionBindingLifecycle;
}

export interface OceanWaterBackendOptions {
  readonly createController?: (
    engine: Engine,
    parent: Entity,
    config: OceanWaterRuntimeConfig,
    compiled: Readonly<OceanWaterRuntimeCompiledInput>,
    cameraPositionProvider: OceanCameraPositionProvider
  ) => OceanWaterRuntimeController;
}

/** Freezes the maximum submitted path for WaterBody activation/resource diagnostics. */
export function resolveOceanWaterBodyActivationGeometryMetrics(
  metrics: Readonly<
    Pick<
      OceanWaterRuntimeMetrics,
      | "meshUploadCount"
      | "detailedPathDrawCount"
      | "detailedPathTriangleCount"
      | "farOnlyPathDrawCount"
      | "farOnlyPathTriangleCount"
    >
  >
): Readonly<{ meshUploadCount: number; drawCount: number; triangleCount: number }> {
  return Object.freeze({
    meshUploadCount: metrics.meshUploadCount,
    drawCount: Math.max(metrics.detailedPathDrawCount, metrics.farOnlyPathDrawCount),
    triangleCount: Math.max(metrics.detailedPathTriangleCount, metrics.farOnlyPathTriangleCount)
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimeContext(value: unknown): value is OceanWaterBackendRuntimeContext {
  if (!isRecord(value) || !isRecord(value.root) || !isRecord(value.textures)) return false;
  return (
    typeof value.engine === "object" &&
    value.engine !== null &&
    typeof value.root.createChild === "function" &&
    value.textures.textureCount === 5 &&
    value.textures.containerFormat === "ktx2" &&
    typeof value.textures.compressedTextureCount === "number" &&
    Number.isInteger(value.textures.compressedTextureCount) &&
    typeof value.textures.uncompressedFallbackTextureCount === "number" &&
    Number.isInteger(value.textures.uncompressedFallbackTextureCount) &&
    value.textures.compressedTextureCount + value.textures.uncompressedFallbackTextureCount === 5 &&
    Number.isFinite(value.textures.resourceBytes) &&
    typeof value.cameraPositionProvider === "function" &&
    typeof value.sceneFogEnabled === "boolean" &&
    (value.lodDebug === undefined || typeof value.lodDebug === "boolean") &&
    (value.surfaceLevelOffsetMetres === undefined ||
      (typeof value.surfaceLevelOffsetMetres === "number" && Number.isFinite(value.surfaceLevelOffsetMetres))) &&
    (value.surfaceTimeOverride === undefined ||
      (typeof value.surfaceTimeOverride === "number" && Number.isFinite(value.surfaceTimeOverride)))
  );
}

function assertIdentityTransform(effective: WaterBackendRuntimeContext["effectiveSnapshot"]): void {
  const transform = effective.instance.transform;
  if (
    transform.position[0] !== 0 ||
    transform.position[1] !== 0 ||
    transform.position[2] !== 0 ||
    transform.yawDegrees !== 0 ||
    transform.scaleXZ[0] !== 1 ||
    transform.scaleXZ[1] !== 1
  ) {
    throw new Error(
      "Finite Ocean uses authoritative world-space coordinates and requires an identity instance transform."
    );
  }
}

function assertOceanContract(effective: Readonly<ResolvedWaterBodyInstance | EffectiveWaterRuntimeSnapshot>): void {
  assertSupportedOceanRenderContract(effective.renderContract);
  if (effective.instance.interaction.buoyancy || effective.instance.interaction.wake) {
    throw new Error("Ocean does not support buoyancy or wake.");
  }
  const policy =
    "effectiveReflectionPolicy" in effective ? effective.effectiveReflectionPolicy : effective.reflectionPolicy.policy;
  if (policy.preferred !== "environment" || policy.fallbacks.some((source) => source === "ssr")) {
    throw new Error("Ocean reflection policy must be environment with analytic fallback only.");
  }
  if (effective.qualityPlan.sceneFields !== "scene-color-depth") {
    throw new Error("Ocean requires Camera Scene Color and Scene Depth for Ocean refraction and intersections.");
  }
}

function assertRepresentation(effective: WaterBackendRuntimeContext["effectiveSnapshot"]): void {
  const state = effective.instance.representationState;
  if (!state || state.kind !== "ocean-surface-layout" || state.surfaceTopology !== "finite") {
    throw new Error("Ocean requires one finite ocean-surface-layout Representation state.");
  }
}

function readPreparedOceanCompilation(
  asset: Parameters<NonNullable<WaterBodyBackend["getCompileKey"]>>[0],
  source: Readonly<OceanWaterBodyDescriptorV1>
): Readonly<OceanWaterCompiledTransferV1> | undefined {
  const prepared = asset.representationData;
  if (prepared === undefined) return undefined;
  if (!isOceanWaterCompiledTransferV1(prepared)) {
    throw new Error(`Ocean '${asset.id}' has invalid prepared compiler data.`);
  }
  if (
    prepared.data.sourceId !== source.id ||
    prepared.data.sourceHash !== prepared.sourceHash ||
    prepared.nearshoreData.sourceId !== source.config.nearshoreDescriptor.id
  ) {
    throw new Error(`Ocean '${asset.id}' prepared compiler data does not match its source identity.`);
  }
  return prepared;
}

function createRuntimeConfig(
  resource: OceanWaterCompiledResource,
  effective: WaterBackendRuntimeContext["effectiveSnapshot"],
  runtime: OceanWaterBackendRuntimeContext
): OceanWaterRuntimeConfig {
  const representation = effective.instance.representationState!;
  return Object.freeze({
    renderContract: effective.renderContract,
    surfaceShader: runtime.surfaceShader,
    waterLevel: resource.data.config.waterLevel,
    nearshoreDescriptor: resource.data.config.nearshoreDescriptor,
    connections: resource.data.config.connections,
    waterBodyId: effective.instance.id,
    color: resolveOceanRuntimeColor(effective.renderContract.surfaceClosure.appearance.depthResponse),
    surfaceCenterXZ: representation.centerXZ,
    size: representation.size,
    surfaceTopology: "finite",
    capabilityMode: "render-and-query",
    textures: runtime.textures,
    sceneFogEnabled: runtime.sceneFogEnabled,
    surfaceTimeOverride: runtime.surfaceTimeOverride,
    lodDebug: runtime.lodDebug
  });
}

function checkInstanceUpdate(request: WaterBackendUpdateRequest): WaterBackendUpdateDecision {
  if (request.changedFields.length === 0) {
    throw new Error("OceanWaterBackend update check requires at least one changed field.");
  }
  const field = request.changedFields[0]!;
  const path = field === "transform" ? "$.transform" : field === "quality" ? "$.qualityPlanId" : "$.priority";
  return Object.freeze({
    supported: false,
    path,
    reason: "Finite Ocean instance changes are applied through atomic runtime replacement."
  });
}

export class OceanWaterBackend implements WaterBodyBackend {
  readonly id = OCEAN_WATER_BACKEND_ID;
  readonly transformModel = "world-space" as const;
  readonly representationMatchers = Object.freeze([
    Object.freeze({
      domain: "world-space-ocean" as const,
      macroSurface: "gerstner" as const,
      sourceKinds: Object.freeze([WaterBodySourceKind.OceanNearshore])
    })
  ]);

  private readonly _createController: NonNullable<OceanWaterBackendOptions["createController"]>;
  private readonly _runtimes = new Map<string, OceanWaterBackendRuntimeDiagnostics>();

  constructor(options: OceanWaterBackendOptions = {}) {
    this._createController =
      options.createController ??
      ((engine, parent, config, compiled, cameraPositionProvider) =>
        new OceanWaterRuntimeController(engine, parent, config, compiled, cameraPositionProvider));
  }

  get activeRuntimeCount(): number {
    return this._runtimes.size;
  }

  getRuntimeDiagnostics(instanceId: string): OceanWaterBackendRuntimeDiagnostics | undefined {
    return this._runtimes.get(instanceId);
  }

  setRuntimeSurfaceTimeOverride(instanceId: string, timeSeconds: number | undefined): boolean {
    const runtime = this._runtimes.get(instanceId);
    if (!runtime) return false;
    runtime.controller.setSurfaceTimeOverride(timeSeconds);
    return true;
  }

  setRuntimeSurfaceLevelOffset(instanceId: string, offsetMetres: number): boolean {
    const runtime = this._runtimes.get(instanceId);
    if (!runtime) return false;
    runtime.controller.setSurfaceLevelOffsetMetres(offsetMetres);
    return true;
  }

  updateRuntime(instanceId: string, deltaTime: number): boolean {
    const runtime = this._runtimes.get(instanceId);
    if (!runtime) return false;
    runtime.controller.update(deltaTime);
    return true;
  }

  checkInstanceUpdate(request: WaterBackendUpdateRequest): WaterBackendUpdateDecision {
    return checkInstanceUpdate(request);
  }

  getCompileKey(
    asset: Parameters<NonNullable<WaterBodyBackend["getCompileKey"]>>[0],
    resolvedSource: unknown,
    _context?: WaterBackendCompileIdentityContext
  ): string {
    assertOceanWaterBodyDescriptor(resolvedSource);
    const source = createEffectiveOceanWaterBodyDescriptor(resolvedSource);
    return readPreparedOceanCompilation(asset, source)?.compileKey ?? computeOceanWaterCompileKey(source);
  }

  getSourceHash(
    asset: Parameters<NonNullable<WaterBodyBackend["getSourceHash"]>>[0],
    resolvedSource: unknown,
    _context?: WaterBackendCompileIdentityContext
  ): string {
    assertOceanWaterBodyDescriptor(resolvedSource);
    const source = createEffectiveOceanWaterBodyDescriptor(resolvedSource);
    return readPreparedOceanCompilation(asset, source)?.sourceHash ?? computeOceanWaterSourceHash(source);
  }

  resolveAsset(
    asset: Parameters<NonNullable<WaterBodyBackend["resolveAsset"]>>[0],
    _context: Parameters<NonNullable<WaterBodyBackend["resolveAsset"]>>[1]
  ): unknown {
    if (asset.source.kind !== WaterBodySourceKind.OceanNearshore) {
      throw new Error(`Ocean requires '${WaterBodySourceKind.OceanNearshore}'.`);
    }
    assertOceanWaterBodyDescriptor(asset.source.descriptor);
    return createEffectiveOceanWaterBodyDescriptor(asset.source.descriptor);
  }

  compile(resolvedSource: unknown, context: Parameters<WaterBodyBackend["compile"]>[1]): OceanWaterCompiledResource {
    if (context.signal?.aborted) throw new DOMException("Ocean compilation was aborted.", "AbortError");
    assertOceanContract(context.resolvedInstance);
    assertOceanWaterBodyDescriptor(resolvedSource);
    const source = createEffectiveOceanWaterBodyDescriptor(resolvedSource);
    const route = {
      resolvedBackendId: this.id,
      representation: context.asset.representation,
      sourceKind: context.asset.source.kind
    };
    const prepared = readPreparedOceanCompilation(context.asset, source);
    const resource = prepared
      ? OceanWaterCompiledResource.createFromTransfer(prepared, route)
      : OceanWaterCompiledResource.compile(source, route, computeOceanWaterPhysicalSourceHash(source));
    if (context.signal?.aborted) {
      resource.dispose();
      throw new DOMException("Ocean compilation was aborted.", "AbortError");
    }
    return resource;
  }

  createRuntime(resource: WaterCompiledResource, context: WaterBackendRuntimeContext): WaterBackendRuntime {
    if (!(resource instanceof OceanWaterCompiledResource)) {
      throw new Error("OceanWaterBackend received a non-Ocean compiled resource.");
    }
    if (!isRuntimeContext(context.runtimeContext)) {
      throw new Error(
        "OceanWaterBackend runtimeContext requires Engine, root, camera position provider, and the five Ocean textures."
      );
    }
    if (context.signal?.aborted) throw new DOMException("Ocean runtime activation was aborted.", "AbortError");
    const effective = context.effectiveSnapshot;
    assertIdentityTransform(effective);
    assertOceanContract(effective);
    assertRepresentation(effective);
    if (!context.reflection) throw new Error("Ocean requires the shared environment reflection service.");

    const instanceId = effective.instance.id;
    const staged = context.activationMode === "replacement-staging";
    const differentOcean = [...this._runtimes.keys()].find((activeId) => activeId !== instanceId);
    if (differentOcean) throw new Error(`Ocean '${differentOcean}' is already active.`);
    if (!staged && this._runtimes.has(instanceId)) throw new Error(`Ocean runtime '${instanceId}' is already active.`);

    const runtimeContext = context.runtimeContext;
    const parentRoot = runtimeContext.root.createChild(`water-body-${instanceId}`);
    let controller: OceanWaterRuntimeController | undefined;
    let reflection: WaterReflectionBindingLifecycle | undefined;
    try {
      const config = createRuntimeConfig(resource, effective, runtimeContext);
      controller = this._createController(
        runtimeContext.engine,
        parentRoot,
        config,
        {
          physicalSurfaceHash: resource.identity.physicalSurfaceHash,
          sourceHash: resource.identity.sourceHash,
          compiledHash: resource.identity.compiledHash,
          nearshoreResource: resource.nearshoreResource
        },
        runtimeContext.cameraPositionProvider
      );
      controller.setSurfaceLevelOffsetMetres(runtimeContext.surfaceLevelOffsetMetres ?? 0);
      controller.setRenderPriority(effective.renderContract.renderState.priorityOffset);
      const runtimeVisible = staged ? false : effective.instance.visible;
      controller.root.isActive = runtimeVisible;
      controller.setExternalCameraFeatureAvailability(
        runtimeVisible && effective.runtimeAvailability.sceneColor && effective.runtimeAvailability.sceneDepth
      );
      const activeController = controller;
      reflection = new WaterReflectionBindingLifecycle({
        service: context.reflection.service,
        activationMode: context.activationMode,
        request: {
          id: `water-body:${instanceId}:reflection`,
          policy: effective.effectiveReflectionPolicy,
          quality: "high",
          visible: runtimeVisible,
          priority: effective.instance.priority,
          ssrEligible: false,
          cullingMask: context.reflection.cullingMask,
          waterLayerMask: context.reflection.waterLayerMask
        },
        applyBinding: (binding) => activeController.setReflectionBinding(binding)
      });
      controller.setCameraSceneFieldDemandListener((required) => reflection!.setCameraSurfaceFieldsRequired(required));

      const atlas = resource.nearshoreResource.data;
      const metrics = controller.metrics;
      const activationGeometryMetrics = resolveOceanWaterBodyActivationGeometryMetrics(metrics);
      const body = new WaterBodyRuntimeAdapter({
        id: instanceId,
        resolvedBackendId: this.id,
        kind: effective.bodyKind,
        representation: effective.representation,
        sourceKind: effective.sourceKind,
        surfaceFeatures: { velocity: false, deformation: false, latencyFrames: 0 },
        surface: controller,
        spatialField: controller.spatialField,
        opticalProfile: controller.opticalProfile,
        bounds: {
          minX: metrics.worldMinimumX,
          minZ: metrics.worldMinimumZ,
          maxX: metrics.worldMaximumX,
          maxZ: metrics.worldMaximumZ
        },
        priority: effective.instance.priority,
        enabled: effective.instance.interaction.query,
        metrics: {
          ...activationGeometryMetrics,
          workload: {
            wetElementCount: atlas.stats.wetTexelCount,
            cpuQueryElementCount: atlas.stats.texelCount,
            gpuAtlasPixelCount: atlas.stats.texelCount
          },
          memory: {
            ...resource.memory,
            // The backend permits one Ocean, so the shared Ocean texture bundle
            // belongs to this Body's unified footprint without double counting.
            gpuBytes: metrics.ownedGpuBytes,
            historyBytes: 0,
            reflectionBytes: 0
          }
        }
      });
      const record: OceanWaterBackendRuntimeDiagnostics = Object.freeze({
        instanceId,
        parentRoot,
        controller,
        reflection
      });
      if (!staged) this._runtimes.set(instanceId, record);
      let active = true;
      let published = !staged;
      let activeEffective = effective;
      const canUpdateEffectiveState = (next: Readonly<EffectiveWaterRuntimeSnapshot>): boolean =>
        next.lookContentHash === activeEffective.lookContentHash &&
        next.renderContractHash === activeEffective.renderContractHash &&
        next.qualityPlanId === activeEffective.qualityPlanId;
      return {
        body,
        reflection,
        development: Object.freeze({
          backendId: this.id,
          adapter: createWaterBackendDiagnosticsAdapter(controller),
          reflection
        }),
        setVisible: (visible) => {
          if (!active) return;
          controller!.root.isActive = visible;
          controller!.setExternalCameraFeatureAvailability(
            visible && activeEffective.runtimeAvailability.sceneColor && activeEffective.runtimeAvailability.sceneDepth
          );
          reflection!.setVisible(visible);
        },
        refreshCameraVisibility: (provider) => {
          reflection!.observeCameraFrustumVisibility(controller!.hasCameraVisibleSurfaceChunk(provider));
        },
        refreshReflectionBinding: () => reflection!.refresh(),
        canUpdateEffectiveState,
        updateEffectiveState: (next) => {
          if (!active) throw new Error(`Ocean runtime '${instanceId}' is inactive.`);
          assertOceanContract(next);
          if (!canUpdateEffectiveState(next)) {
            throw new Error("Ocean Look and fixed render budget changes require atomic runtime replacement.");
          }
          controller!.setExternalCameraFeatureAvailability(
            next.instance.visible && next.runtimeAvailability.sceneColor && next.runtimeAvailability.sceneDepth
          );
          activeEffective = next;
        },
        commitReplacement: staged
          ? () => {
              if (!active) throw new Error(`Ocean runtime '${instanceId}' is inactive.`);
              if (published) return;
              reflection!.commitReplacement();
              published = true;
              this._runtimes.set(instanceId, record);
            }
          : undefined,
        restoreReplacement: () => {
          if (!active) throw new Error(`Ocean runtime '${instanceId}' is inactive.`);
          reflection!.restoreReplacement();
          this._runtimes.set(instanceId, record);
        },
        destroy: () => {
          if (!active) return;
          active = false;
          if (this._runtimes.get(instanceId) === record) this._runtimes.delete(instanceId);
          const errors: unknown[] = [];
          try {
            controller!.setCameraSceneFieldDemandListener(undefined);
          } catch (error) {
            errors.push(error);
          }
          try {
            reflection!.destroy();
          } catch (error) {
            errors.push(error);
          }
          try {
            controller!.destroy();
          } catch (error) {
            errors.push(error);
          }
          try {
            parentRoot.destroy();
          } catch (error) {
            errors.push(error);
          }
          if (errors.length === 1) throw errors[0];
          if (errors.length > 1) throw new AggregateError(errors, "Ocean runtime cleanup reported multiple errors.");
        }
      };
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      try {
        controller?.setCameraSceneFieldDemandListener(undefined);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        reflection?.destroy();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        controller?.destroy();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        parentRoot.destroy();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError([error, ...cleanupErrors], "Ocean activation rollback reported cleanup errors.");
      }
      throw error;
    }
  }
}
