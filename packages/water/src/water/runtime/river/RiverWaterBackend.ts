import { RiverDropRenderer } from "./RiverDropRenderer";
import { assertWaterConnectionTransform } from "../../authoring/connections/WaterConnection";
/** Real WaterBody backend adapter for the existing River compiler/runtime. */
import type { Engine, Entity, Texture2D } from "@galacean/engine-core";
import type {
  RiverNetworkDescriptor,
  RiverWaterBodyRepresentationDataV1,
  RiverWaterBodySourceDescriptorV2
} from "../../authoring/river/RiverDescriptor";
import { computeRiverPhysicalSourceHash } from "../../authoring/river/RiverPhysicalSourceIdentity";
import {
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverQualityLevel
} from "../../authoring/river/RiverAuthoringEnums";
import { RIVER_QUALITY_PRESET } from "../../authoring/river/RiverAuthoringLimits";
import { WaterBodySourceKind } from "../../authoring/body/WaterBodyAuthoringTypes";
import { createPhysicalSurfaceIdentity } from "../../authoring/body/PhysicalSurfaceIdentity";
import type { WaterQualityLevelV2 } from "../../authoring/quality/WaterQualityPlan";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { WaterCompiledResource } from "../../compiler/body/WaterCompiledResource";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import type { RiverDiagnostic } from "../../compiler/shared/diagnostics";
import { hashRiverStableValue } from "../../compiler/shared/determinism";
import type {
  WaterBackendCompileContext,
  WaterBackendCompileIdentityContext,
  WaterBackendRuntime,
  WaterBackendRuntimeContext,
  WaterBackendUpdateDecision,
  WaterBackendUpdateRequest,
  WaterBodyBackend,
  ResolvedWaterBodyInstance
} from "../body/WaterBackendRegistry";
import { WaterBodyRuntimeAdapter } from "../body/WaterBodyRuntime";
import { resolveWaterBodyQualityTier } from "../body/WaterBodyRuntimeSemantics";
import type { WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import { WaterReflectionBindingLifecycle } from "../optics/WaterReflectionBindingLifecycle";
import { waterReflectionPolicyModeToSource } from "../optics/WaterReflectionPolicy";
import { WaterOpticsDebugView, type WaterSurfaceOpticsBinding } from "../optics/WaterSurfaceOpticsTypes";
import type { WaterRuntimeResourceLease } from "../resources/WaterRuntimeResourceRegistry";
import type { EffectiveWaterRuntimeSnapshot } from "../state/EffectiveWaterRuntimeSnapshot";
import { createWaterBackendDiagnosticsAdapter } from "../body/WaterBackendDiagnosticsAdapter";
import type { WaterSurfaceAppearanceBindingV2 } from "../surface/WaterSurfaceAppearanceRuntimeTypes";
import {
  compileWaterPlanarTransform,
  waterPlanarTransformIsIdentity,
  type CompiledWaterPlanarTransformV1
} from "../body/WaterPlanarTransform";
import {
  WaterSpatialFieldRegion,
  resetWaterSpatialFieldSample,
  type WaterSpatialFieldMetadata,
  type WaterSpatialFieldProvider,
  type WaterSpatialFieldSample
} from "../spatial/WaterSpatialFieldProvider";
import { RiverResource } from "./RiverResource";
import { resolveRiverRenderContractAdapter } from "./RiverRenderContractAdapter";
import {
  RiverRuntimeController,
  RiverRuntimeSubmissionCancelledError,
  type RiverRuntimeActivation,
  type RiverRuntimeReachSource,
  type RiverRuntimeSubmissionOptions
} from "./RiverRuntimeController";
import { TransformedRiverWaterSpatialFieldProvider } from "./RiverWaterSpatialFieldProvider";
import { TransformedRiverWaterSurfaceProvider } from "./RiverWaterSurfaceProvider";
import type { RiverTerrainInteractionData } from "../../compiler/river/types";
import { RiverReadonlyFloat32Buffer, RiverReadonlyUint8Buffer } from "../../compiler/shared/ReadonlyNumericBuffer";
import { createWaterCompiledDataSnapshot } from "../../compiler/body/WaterCompiledResource";
import { createImmutableWaterSnapshot } from "../../authoring/identity/WaterImmutableSnapshot";
import { deserializeRiverResource } from "../../compiler/river/RiverResourceSerializer";
import type { RiverCompiledData } from "../../compiler/river/types";

import { RIVER_COMPILER_SEMANTIC_VERSION } from "../../compiler/river/constants";

export const RIVER_WATER_BACKEND_ID = "river";

export class RiverWaterBackendCompileError extends Error {
  constructor(readonly diagnostics: readonly RiverDiagnostic[]) {
    super(diagnostics.map((diagnostic) => `${diagnostic.code}@${diagnostic.path}: ${diagnostic.message}`).join(" | "));
    this.name = "RiverWaterBackendCompileError";
  }
}

export class RiverWaterBackendQualityError extends Error {
  constructor(
    readonly path: string,
    actual: number,
    maximum: number
  ) {
    super(`River compiled value ${actual} exceeds '${path}' budget ${maximum}.`);
    this.name = "RiverWaterBackendQualityError";
  }
}

export interface RiverWaterBackendRuntimeContext {
  readonly engine: Engine;
  readonly root: Entity;
  readonly submission?: Omit<RiverRuntimeSubmissionOptions, "shouldCancel">;
  readonly reachSources?: readonly RiverRuntimeReachSource[];
  /** Logical-world translation for a descriptor compiled in stable body-local XZ coordinates. */
  readonly logicalBodyOrigin?: readonly [x: number, z: number];
  /** Transient deterministic time pin; it never changes Look or physical identity. */
  readonly surfaceTimeOverride?: number;
  /** Explicit detached data projection for demo diagnostics; never exposes the resource owner. */
  readonly compiledDiagnostics?: boolean;
}

export interface RiverWaterCompiledDiagnostics {
  readonly identity: RiverResource["identity"];
  readonly metadata: RiverResource["metadata"];
  readonly totalBytes: number;
  readonly data: Readonly<RiverCompiledData>;
}

export interface RiverWaterBackendRuntimeDiagnostics {
  readonly instanceId: string;
  readonly controller: RiverRuntimeController;
  readonly activation: RiverRuntimeActivation;
  readonly root: Entity;
  readonly planarTransform: Readonly<CompiledWaterPlanarTransformV1>;
  readonly reflection?: WaterReflectionBindingLifecycle;
  /** Detached compiler projection for Terrain integration; it owns no active resource lifecycle. */
  readonly terrainInteraction: Readonly<RiverTerrainInteractionData>;
  readonly compiledDiagnostics?: Readonly<RiverWaterCompiledDiagnostics>;
}

export interface RiverWaterBackendOptions {
  readonly compile?: (
    descriptor: RiverNetworkDescriptor,
    context: WaterBackendCompileContext
  ) => RiverResource | Promise<RiverResource>;
  readonly createController?: (engine: Engine, root: Entity) => RiverRuntimeController;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createRiverTerrainInteractionSnapshot(
  source: Readonly<RiverTerrainInteractionData>
): Readonly<RiverTerrainInteractionData> {
  return createWaterCompiledDataSnapshot(
    Object.freeze({
      terrainSurfaceOwnership: source.terrainSurfaceOwnership,
      maskChannels: createImmutableWaterSnapshot(source.maskChannels),
      reachCorridors: Object.freeze(
        source.reachCorridors.map((corridor) =>
          Object.freeze({
            id: corridor.id,
            reachIndex: corridor.reachIndex,
            samples: new RiverReadonlyFloat32Buffer(corridor.samples.toTypedArray()),
            stride: corridor.stride,
            sampleCount: corridor.sampleCount
          })
        )
      ),
      junctionCorridors: createImmutableWaterSnapshot(source.junctionCorridors),
      localMapBakeRegions: createImmutableWaterSnapshot(source.localMapBakeRegions),
      localMapAtlas: source.localMapAtlas
        ? Object.freeze({
            width: source.localMapAtlas.width,
            height: source.localMapAtlas.height,
            padding: source.localMapAtlas.padding,
            tiles: createImmutableWaterSnapshot(source.localMapAtlas.tiles),
            pixels: new RiverReadonlyUint8Buffer(source.localMapAtlas.pixels.toTypedArray())
          })
        : undefined
    })
  );
}

function isRuntimeContext(value: unknown): value is RiverWaterBackendRuntimeContext {
  if (!isRecord(value)) return false;
  const root = value.root;
  return (
    typeof value.engine === "object" &&
    value.engine !== null &&
    typeof root === "object" &&
    root !== null &&
    typeof (root as Readonly<Record<string, unknown>>).createChild === "function" &&
    (value.surfaceTimeOverride === undefined ||
      (typeof value.surfaceTimeOverride === "number" && Number.isFinite(value.surfaceTimeOverride))) &&
    (value.logicalBodyOrigin === undefined ||
      (Array.isArray(value.logicalBodyOrigin) &&
        value.logicalBodyOrigin.length === 2 &&
        value.logicalBodyOrigin.every((component) => typeof component === "number" && Number.isFinite(component))))
  );
}

function resolveRiverPlanarTransform(
  resolved: Pick<ResolvedWaterBodyInstance, "instance"> | Pick<EffectiveWaterRuntimeSnapshot, "instance">
): Readonly<CompiledWaterPlanarTransformV1> {
  const transform = resolved.instance.transform;
  if (transform.scaleXZ[0] !== 1 || transform.scaleXZ[1] !== 1) {
    throw new RangeError("River instance transform.scaleXZ must remain exactly [1, 1].");
  }
  return compileWaterPlanarTransform(transform);
}

function checkRiverInstanceUpdate(request: WaterBackendUpdateRequest): WaterBackendUpdateDecision {
  const fields = request.changedFields;
  if (fields.length === 0) {
    throw new Error("RiverWaterBackend update check requires at least one changed field.");
  }
  if (fields.includes("transform")) {
    resolveRiverPlanarTransform(request.next);
    return Object.freeze({ supported: true });
  }
  return Object.freeze({ supported: true });
}

function resolveRiverQualityLevel(tier: WaterQualityTier | WaterQualityLevelV2): RiverQualityLevel {
  if (tier !== WaterQualityTier.High) {
    throw new Error(`River only supports High quality; received '${String(tier)}'.`);
  }
  return RiverQualityLevel.High;
}

const RIVER_COMPILE_MATERIAL_SENTINEL = Object.freeze({
  preset: RiverMaterialPreset.ClearStream,
  baseColor: "#000000",
  foamColor: "#000000",
  foamIntensity: 0,
  clarity: 0
});

/**
 * Materializes the compile-affecting quality tier into a detached descriptor.
 *
 * The WaterBody quality preset is the runtime variant selector; keeping stale
 * quality values inside the shared source would otherwise let cache identity,
 * compiler output, Query, and local maps disagree.
 */
function buildEffectiveRiverCompileDescriptor(
  descriptor: RiverNetworkDescriptor,
  resolved: ResolvedWaterBodyInstance
): RiverNetworkDescriptor {
  const geometryLevel = resolveRiverQualityLevel(resolved.qualityPlan.geometry);
  const materialLevel = resolveRiverQualityLevel(resolved.qualityPlan.surfaceShading);
  if (resolved.qualityPlan.query !== "dense") throw new Error("River requires dense High queries.");
  const queryLevel = RiverQualityLevel.High;
  const quality = RIVER_QUALITY_PRESET[geometryLevel];
  const mapsLevel = geometryLevel;
  const nodes = descriptor.nodes.map((node) => ({
    ...node,
    position: [...node.position] as [number, number, number]
  }));
  const segments = descriptor.segments.map((segment) => ({
    ...segment,
    curve: {
      ...segment.curve,
      segmentLength: Math.min(segment.curve.segmentLength, quality.segmentLength),
      points: segment.curve.points.map((point) => ({
        ...point,
        position: [...point.position] as [number, number, number],
        in: point.in ? ([...point.in] as [number, number, number]) : undefined,
        out: point.out ? ([...point.out] as [number, number, number]) : undefined
      }))
    },
    shape: segment.shape ? { ...segment.shape } : undefined,
    flow: segment.flow ? { ...segment.flow } : undefined,
    // Material is presentation-only. Compile topology uses one neutral value
    // so Look changes never alter PhysicalSurface or resource identity.
    material: undefined
  }));
  const defaults = {
    shape: { ...descriptor.defaults.shape },
    flow: { ...descriptor.defaults.flow },
    material: { ...RIVER_COMPILE_MATERIAL_SENTINEL },
    quality: {
      geometry: {
        level: geometryLevel,
        maxSegmentCount: descriptor.defaults.quality.geometry.maxSegmentCount,
        maxChordError: Math.min(descriptor.defaults.quality.geometry.maxChordError, quality.maxChordError)
      },
      material: { level: materialLevel },
      maps: { level: mapsLevel },
      query: { level: queryLevel }
    }
  };
  const budget = descriptor.budget ? { ...descriptor.budget } : undefined;
  return {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: descriptor.id,
    ...(descriptor.connections ? { connections: descriptor.connections } : {}),
    ...(descriptor.drops ? { drops: descriptor.drops } : {}),
    surfaceAuthority: descriptor.surfaceAuthority,
    terrain: descriptor.terrain,
    derivation: descriptor.derivation,
    nodes,
    segments,
    defaults: {
      ...defaults,
      surfaceMotion: { ...descriptor.defaults.surfaceMotion }
    },
    budget,
    disturbances: descriptor.disturbances?.map((disturbance) => ({
      ...disturbance,
      position: [...disturbance.position] as [number, number, number]
    }))
  };
}

function restoreRiverCompilerDescriptor(
  source: Readonly<RiverWaterBodySourceDescriptorV2>,
  representation: Readonly<RiverWaterBodyRepresentationDataV1>
): RiverNetworkDescriptor {
  if (
    representation.schemaVersion !== 1 ||
    representation.kind !== "river-surface-representation" ||
    !Number.isFinite(representation.defaultBankFeather) ||
    representation.defaultBankFeather < 0
  ) {
    throw new Error("RiverWaterBackend received invalid River Representation data.");
  }
  const visualBySegmentId = new Map(representation.segments.map((segment) => [segment.id, segment] as const));
  if (visualBySegmentId.size !== representation.segments.length || visualBySegmentId.size !== source.segments.length) {
    throw new Error("RiverWaterBackend River Representation segment identity mismatch.");
  }
  const highQuality = RIVER_QUALITY_PRESET[RiverQualityLevel.High];
  const sampling = representation.sampling;
  if (
    sampling &&
    (!Number.isFinite(sampling.maxChordError) ||
      sampling.maxChordError <= 0 ||
      (sampling.maxSegmentCount !== undefined &&
        (!Number.isSafeInteger(sampling.maxSegmentCount) || sampling.maxSegmentCount < 1)))
  ) {
    throw new Error("River Representation sampling precision or explicit budget is invalid.");
  }
  const spacingById = new Map(sampling?.segments.map((segment) => [segment.id, segment.segmentLength] as const));
  if (
    sampling &&
    (spacingById.size !== source.segments.length ||
      sampling.segments.length !== spacingById.size ||
      source.segments.some(
        (segment) => !Number.isFinite(spacingById.get(segment.id)) || spacingById.get(segment.id)! <= 0
      ))
  ) {
    throw new Error("River Representation sample spacing does not match source segments.");
  }
  const segments = source.segments.map((segment) => {
    const visual = visualBySegmentId.get(segment.id);
    if (
      !visual ||
      (visual.bankFeather !== undefined && (!Number.isFinite(visual.bankFeather) || visual.bankFeather < 0))
    ) {
      throw new Error(`RiverWaterBackend has invalid Representation data for segment '${segment.id}'.`);
    }
    const pointVisualById = new Map(visual.pointBankFeathers.map((point) => [point.id, point.bankFeather] as const));
    if (pointVisualById.size !== visual.pointBankFeathers.length) {
      throw new Error(`RiverWaterBackend has duplicate Representation point ids for segment '${segment.id}'.`);
    }
    for (const [pointId, bankFeather] of pointVisualById) {
      if (
        !segment.curve.points.some((point) => point.id === pointId) ||
        !Number.isFinite(bankFeather) ||
        bankFeather < 0
      ) {
        throw new Error(`RiverWaterBackend has invalid Representation point '${pointId}' for segment '${segment.id}'.`);
      }
    }
    return {
      ...segment,
      curve: {
        ...segment.curve,
        segmentLength: Math.min(spacingById.get(segment.id) ?? highQuality.segmentLength, highQuality.segmentLength),
        points: segment.curve.points.map((point) => ({
          ...point,
          bankFeather: pointVisualById.get(point.id)
        }))
      },
      shape: segment.shape
        ? { ...segment.shape, bankFeather: visual.bankFeather }
        : visual.bankFeather === undefined
          ? undefined
          : { bankFeather: visual.bankFeather },
      material: undefined
    };
  });
  return {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: source.id,
    surfaceAuthority: source.surfaceAuthority,
    connections: source.connections,
    drops: source.drops,
    terrain: source.terrain,
    derivation: source.derivation,
    budget: sampling?.budget ? { ...sampling.budget } : undefined,
    nodes: source.nodes.map((node) => ({ ...node, position: [...node.position] })),
    segments,
    defaults: {
      shape: { ...source.defaults.shape, bankFeather: representation.defaultBankFeather },
      flow: { ...source.defaults.flow },
      material: { ...RIVER_COMPILE_MATERIAL_SENTINEL },
      quality: {
        geometry: {
          level: RiverQualityLevel.High,
          maxSegmentCount: sampling?.maxSegmentCount,
          maxChordError: Math.min(sampling?.maxChordError ?? highQuality.maxChordError, highQuality.maxChordError)
        },
        material: { level: RiverQualityLevel.High },
        maps: { level: RiverQualityLevel.High },
        query: { level: RiverQualityLevel.High }
      },
      surfaceMotion: { ...source.defaults.surfaceMotion }
    },
    disturbances: source.disturbances?.map((disturbance) => ({
      ...disturbance,
      position: [...disturbance.position]
    }))
  };
}

function compileRiver(
  descriptor: RiverNetworkDescriptor,
  context: WaterBackendCompileContext,
  physicalSourceHash: string
): RiverResource {
  const result = RiverNetworkCompiler.compile(descriptor);
  if (!result.valid || !result.data) {
    throw new RiverWaterBackendCompileError(result.diagnostics);
  }
  return RiverResource.create(
    descriptor,
    result.data,
    {
      resolvedBackendId: RIVER_WATER_BACKEND_ID,
      representation: context.asset.representation,
      sourceKind: context.asset.source.kind
    },
    physicalSourceHash
  );
}

function assertSupportedAuthoring(
  resolved: Readonly<ResolvedWaterBodyInstance> | Readonly<EffectiveWaterRuntimeSnapshot>
): void {
  resolveRiverRenderContractAdapter(resolved);
  const features = "lookRuntimeFeatures" in resolved ? resolved.lookRuntimeFeatures : resolved.optics;
  if (features.caustics) {
    throw new Error("RiverWaterBackend currently supports no caustics pass.");
  }
}

function createOpticsBinding(effective: Readonly<EffectiveWaterRuntimeSnapshot>): Readonly<WaterSurfaceOpticsBinding> {
  return Object.freeze({
    tier: "high",
    opticalProfile: Object.freeze({ ...effective.optics }),
    refractionEnabled: effective.refractionEnabled,
    reflection: undefined,
    reflectionSampling: effective.reflectionSampling,
    debugView: WaterOpticsDebugView.Final
  });
}

function resolveTexture(resource: unknown): Texture2D | undefined {
  if (!isRecord(resource)) return undefined;
  const nested = resource.texture;
  if (isRecord(nested)) return nested as unknown as Texture2D;
  if (
    typeof resource.width === "number" &&
    typeof resource.height === "number" &&
    typeof resource.destroyed === "boolean"
  ) {
    return resource as unknown as Texture2D;
  }
  return undefined;
}

function resolveSurfaceAppearanceBinding(
  effective: Readonly<EffectiveWaterRuntimeSnapshot>,
  leases: readonly WaterRuntimeResourceLease[]
): Readonly<WaterSurfaceAppearanceBindingV2> {
  const appearance = effective.renderContract.surfaceClosure.appearance;
  const textureBindings = appearance.textureReferences.map((reference) => {
    const lease = leases.find((candidate) => candidate.descriptor.id === reference.textureAssetId);
    const texture = resolveTexture(lease?.resource);
    if (!lease || !texture) {
      throw new Error(
        `River Surface Appearance '${appearance.sourceId}' requires texture resource '${reference.textureAssetId}'.`
      );
    }
    return Object.freeze({
      layerId: reference.layerId,
      assetId: reference.textureAssetId,
      contentHash: reference.textureContentHash,
      texture,
      ownership: "borrowed" as const
    });
  });
  return Object.freeze({
    appearance,
    renderContract: effective.renderContract,
    featureFlags: effective.appearanceFeatureFlags,
    textureBindings: Object.freeze(textureBindings)
  });
}

function assertQuality(
  resource: RiverResource,
  resolved: Pick<ResolvedWaterBodyInstance, "qualityPlan"> | Pick<EffectiveWaterRuntimeSnapshot, "qualityPlan">
): void {
  for (const [reachIndex, reach] of resource.data.reaches.entries()) {
    if (String(reach.config.quality.material.level) !== resolved.qualityPlan.surfaceShading) {
      throw new Error(
        `River reach ${reachIndex} quality '${reach.config.quality.material.level}' does not match plan '${resolved.qualityPlan.surfaceShading}'.`
      );
    }
  }
  const budget = resolved.qualityPlan.spatialField;
  const atlas = resource.data.terrainInteraction.localMapAtlas;
  const actualAtlasPixels = atlas ? atlas.width * atlas.height : 0;
  if (actualAtlasPixels > budget.maximumAtlasPixels) {
    throw new RiverWaterBackendQualityError(
      "$.quality.spatialField.maximumAtlasPixels",
      actualAtlasPixels,
      budget.maximumAtlasPixels
    );
  }
}

function assertSpatialFieldQuality(
  activation: RiverRuntimeActivation,
  resolved: Pick<ResolvedWaterBodyInstance, "qualityPlan"> | Pick<EffectiveWaterRuntimeSnapshot, "qualityPlan">
): void {
  const metadata = activation.spatialFieldProvider.metadata;
  const budget = resolved.qualityPlan.spatialField;
  if (metadata.maximumHorizontalError > budget.maximumHorizontalError) {
    throw new RiverWaterBackendQualityError(
      "$.quality.spatialField.maximumHorizontalError",
      metadata.maximumHorizontalError,
      budget.maximumHorizontalError
    );
  }
  if (metadata.maximumDepthError > budget.maximumDepthError) {
    throw new RiverWaterBackendQualityError(
      "$.quality.spatialField.maximumDepthError",
      metadata.maximumDepthError,
      budget.maximumDepthError
    );
  }
}

function destroyRuntime(
  controller: RiverRuntimeController,
  root: Entity,
  reflection?: WaterReflectionBindingLifecycle
): void {
  const errors: unknown[] = [];
  try {
    reflection?.destroy();
  } catch (error) {
    errors.push(error);
  }
  try {
    controller.destroy();
  } catch (error) {
    errors.push(error);
  }
  try {
    controller.flushDeferredResources();
  } catch (error) {
    errors.push(error);
  }
  try {
    root.destroy();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "River runtime cleanup reported multiple errors.");
  }
}

class ActiveRiverSpatialFieldProvider implements WaterSpatialFieldProvider {
  private readonly _fallbackMetadata: WaterSpatialFieldMetadata;

  constructor(
    private readonly _controller: RiverRuntimeController,
    initial: WaterSpatialFieldProvider
  ) {
    this._fallbackMetadata = initial.metadata;
  }

  get metadata(): WaterSpatialFieldMetadata {
    return this._controller.activeSpatialFieldProvider?.metadata ?? this._fallbackMetadata;
  }

  get gpuBinding() {
    const active: WaterSpatialFieldProvider | undefined = this._controller.activeSpatialFieldProvider;
    return active?.gpuBinding;
  }

  sampleSpatialField(worldX: number, worldZ: number, outSample: WaterSpatialFieldSample): boolean {
    const active = this._controller.activeSpatialFieldProvider;
    if (active) return active.sampleSpatialField(worldX, worldZ, outSample);
    resetWaterSpatialFieldSample(outSample);
    outSample.region = WaterSpatialFieldRegion.OutsideUnresolved;
    return false;
  }

  capture() {
    const active = this._controller.activeSpatialFieldProvider;
    if (!active?.capture) throw new Error("River has no active static Spatial Field to capture.");
    return active.capture();
  }
}

export class RiverWaterBackend implements WaterBodyBackend {
  readonly id = RIVER_WATER_BACKEND_ID;
  readonly transformModel = "finite-planar" as const;
  readonly representationMatchers = Object.freeze([
    Object.freeze({
      domain: "spline-network" as const,
      macroSurface: "flow-deformed" as const,
      sourceKinds: Object.freeze([WaterBodySourceKind.SplineProfile])
    })
  ]);

  private readonly _compile: RiverWaterBackendOptions["compile"];
  private readonly _createController: NonNullable<RiverWaterBackendOptions["createController"]>;
  private readonly _runtimes = new Map<string, RiverWaterBackendRuntimeDiagnostics>();

  constructor(options: RiverWaterBackendOptions = {}) {
    this._compile = options.compile;
    this._createController = options.createController ?? ((engine, root) => new RiverRuntimeController(engine, root));
  }

  getRuntimeDiagnostics(instanceId: string): RiverWaterBackendRuntimeDiagnostics | undefined {
    return this._runtimes.get(instanceId);
  }

  get activeRuntimeCount(): number {
    return this._runtimes.size;
  }

  getTerrainInteractionSnapshot(instanceId: string): Readonly<RiverTerrainInteractionData> | undefined {
    return this._runtimes.get(instanceId)?.terrainInteraction;
  }

  checkInstanceUpdate(request: WaterBackendUpdateRequest): WaterBackendUpdateDecision {
    return checkRiverInstanceUpdate(request);
  }

  private readonly sourceIdentities = new WeakMap<
    WaterBackendCompileIdentityContext,
    { source: unknown; hash: string }
  >();

  private sourceIdentity(source: unknown, context?: WaterBackendCompileIdentityContext): string {
    const cached = context && this.sourceIdentities.get(context);
    if (cached && cached.source === source) return cached.hash;
    const hash = hashRiverStableValue(source);
    if (context) this.sourceIdentities.set(context, { source, hash });
    return hash;
  }

  getCompileKey(
    _asset: Parameters<NonNullable<WaterBodyBackend["getCompileKey"]>>[0],
    resolvedSource: unknown,
    context?: WaterBackendCompileIdentityContext
  ): string {
    return hashRiverStableValue({
      compilerSemanticVersion: RIVER_COMPILER_SEMANTIC_VERSION,
      sourceHash: this.sourceIdentity(resolvedSource, context)
    });
  }

  getSourceHash(
    _asset: Parameters<NonNullable<WaterBodyBackend["getSourceHash"]>>[0],
    resolvedSource: unknown,
    context?: WaterBackendCompileIdentityContext
  ): string {
    return this.sourceIdentity(resolvedSource, context);
  }

  resolveAsset(
    asset: Parameters<NonNullable<WaterBodyBackend["resolveAsset"]>>[0],
    context: Parameters<NonNullable<WaterBodyBackend["resolveAsset"]>>[1]
  ): unknown {
    const source = asset.source;
    if (!isRecord(source) || source.kind !== WaterBodySourceKind.SplineProfile) {
      throw new Error(`RiverWaterBackend requires a '${WaterBodySourceKind.SplineProfile}' WaterBody source.`);
    }
    const descriptor = source.descriptor as Readonly<RiverWaterBodySourceDescriptorV2>;
    if (!isRecord(descriptor) || descriptor.schemaVersion !== RiverNetworkSchemaVersion.V2) {
      throw new Error("River WaterBody sources require River descriptor schema V2.");
    }
    const representation = asset.representationData as Readonly<RiverWaterBodyRepresentationDataV1> | undefined;
    if (!representation || !isRecord(representation)) {
      throw new Error("River WaterBody assets require explicit River Representation data.");
    }
    const compilerDescriptor = restoreRiverCompilerDescriptor(descriptor, representation);
    return context.resolvedInstance
      ? buildEffectiveRiverCompileDescriptor(compilerDescriptor, context.resolvedInstance)
      : compilerDescriptor;
  }

  async compile(resolvedSource: unknown, context: WaterBackendCompileContext): Promise<RiverResource> {
    const resolved = context.resolvedInstance;
    if (!resolved) throw new Error("RiverWaterBackend requires a resolved WaterBody instance.");
    resolveRiverPlanarTransform(resolved);
    assertSupportedAuthoring(resolved);
    const descriptor = resolvedSource as RiverNetworkDescriptor;
    const physicalSourceHash = computeRiverPhysicalSourceHash(descriptor);
    const resource = await (this._compile
      ? this._compile(descriptor, context)
      : compileRiver(descriptor, context, physicalSourceHash));
    const expectedPhysicalSurfaceHash = createPhysicalSurfaceIdentity({
      sourceHash: physicalSourceHash,
      physicalWaveHash: hashRiverStableValue({ model: "river-flow-surface", physicalSourceHash })
    }).contentHash;
    const route = resource.identity;
    if (
      route.resolvedBackendId === this.id &&
      route.representation.domain === context.asset.representation.domain &&
      route.representation.macroSurface === context.asset.representation.macroSurface &&
      route.sourceKind === context.asset.source.kind &&
      route.physicalSurfaceHash === expectedPhysicalSurfaceHash
    ) {
      return resource;
    }
    const rerouted = RiverResource.create(
      descriptor,
      resource.data,
      {
        resolvedBackendId: this.id,
        representation: context.asset.representation,
        sourceKind: context.asset.source.kind
      },
      physicalSourceHash
    );
    resource.dispose();
    return rerouted;
  }

  async createRuntime(
    resource: WaterCompiledResource,
    context: WaterBackendRuntimeContext
  ): Promise<WaterBackendRuntime> {
    const effective = context.effectiveSnapshot;
    const planarTransform = resolveRiverPlanarTransform(effective);
    assertSupportedAuthoring(effective);
    if (!(resource instanceof RiverResource)) {
      throw new Error("RiverWaterBackend received a non-River compiled resource.");
    }
    assertWaterConnectionTransform(resource.data.connections, effective.instance.transform);
    if (!isRuntimeContext(context.runtimeContext)) {
      throw new Error("RiverWaterBackend runtimeContext requires an Engine and parent Entity.");
    }
    assertQuality(resource, effective);
    const runtimeContext = context.runtimeContext;
    if (runtimeContext.reachSources && runtimeContext.reachSources.length !== resource.data.reaches.length) {
      throw new Error("River runtime reachSources length does not match the compiled reach count.");
    }
    const instanceId = effective.instance.id;
    const staged = context.activationMode === "replacement-staging";
    if (!staged && this._runtimes.has(instanceId)) {
      throw new Error(`River runtime '${instanceId}' is already active.`);
    }

    const instanceRoot = runtimeContext.root.createChild(`water-body-${instanceId}`);
    if (!waterPlanarTransformIsIdentity(planarTransform)) {
      const position = planarTransform.source.position;
      instanceRoot.transform.setPosition(position[0], position[1], position[2]);
      instanceRoot.transform.setRotation(0, planarTransform.source.yawDegrees, 0);
    }
    const controller = this._createController(runtimeContext.engine, instanceRoot);
    let reflection: WaterReflectionBindingLifecycle | undefined;
    let dropRenderer: RiverDropRenderer | undefined;
    try {
      const renderContractAdapter = resolveRiverRenderContractAdapter(effective);
      const renderContract = renderContractAdapter.renderContract;
      const fieldGraph = renderContractAdapter.fieldGraph;
      controller.setSurfaceOpticsBinding(createOpticsBinding(effective));
      controller.setScreenSpaceReflectionCompositeIntensity(effective.reflectionSampling.screenSpaceCompositeIntensity);
      controller.setSurfaceAppearanceBinding(
        resolveSurfaceAppearanceBinding(effective, context.resourceLeases ?? Object.freeze([]))
      );
      controller.setDepthWriteEnabled(renderContract.renderState.depthWriteEnabled);
      controller.setRenderPriority(renderContract.renderState.priorityOffset);
      if (runtimeContext.surfaceTimeOverride !== undefined) {
        controller.setSurfaceTimeOverride(runtimeContext.surfaceTimeOverride);
      }
      const runtimeVisible = staged ? false : effective.instance.visible;
      const reflectionPolicy = effective.effectiveReflectionPolicy;
      const reflectionSource = waterReflectionPolicyModeToSource(reflectionPolicy.preferred);
      if (reflectionSource !== "sky") {
        if (!context.reflection) {
          throw new Error(`River reflection source '${reflectionSource}' requires a WaterReflectionService.`);
        }
        reflection = new WaterReflectionBindingLifecycle({
          service: context.reflection.service,
          activationMode: context.activationMode,
          request: {
            id: `water-body:${instanceId}:reflection`,
            policy: reflectionPolicy,
            quality: resolveWaterBodyQualityTier(effective.qualityPlan.surfaceShading),
            visible: runtimeVisible,
            priority: effective.instance.priority,
            ssrEligible: reflectionPolicy.preferred === "ssr" || reflectionPolicy.fallbacks.includes("ssr"),
            cullingMask: context.reflection.cullingMask,
            waterLayerMask: context.reflection.waterLayerMask
          },
          applyBinding: (binding) => controller.setReflectionBinding(binding)
        });
      }
      const activation = await controller.replaceActiveIncremental(instanceId, resource, runtimeContext.reachSources, {
        ...runtimeContext.submission,
        shouldCancel: () => context.signal?.aborted === true
      });
      assertSpatialFieldQuality(activation, effective);
      if (resource.data.drops?.length) {
        dropRenderer = new RiverDropRenderer(
          runtimeContext.engine,
          instanceRoot,
          resource.data.drops,
          effective.renderContract.look.riverDrops,
          context.resourceLeases ?? [],
          runtimeContext.surfaceTimeOverride
        );
        dropRenderer.setSurfacePriority(effective.renderContract.renderState.priorityOffset);
      }
      instanceRoot.isActive = runtimeVisible;
      const logicalBodyOrigin = runtimeContext.logicalBodyOrigin ?? ([0, 0] as const);
      const surfaceProvider = new TransformedRiverWaterSurfaceProvider(
        controller,
        instanceId,
        logicalBodyOrigin,
        planarTransform
      );
      const localSpatialField = new ActiveRiverSpatialFieldProvider(controller, activation.spatialFieldProvider);
      const spatialField = new TransformedRiverWaterSpatialFieldProvider(
        localSpatialField,
        logicalBodyOrigin,
        planarTransform
      );
      const dropCount = resource.data.drops?.length ?? 0;
      const drawCount = resource.data.chunks.reduce((count, chunk) => count + 1, dropRenderer?.drawCount ?? 0);
      const triangleCount = resource.data.chunks.reduce(
        (count, chunk) => count + chunk.surfaceGeometry.indices.length / 3,
        dropRenderer?.triangleCount ?? 0
      );
      const body = new WaterBodyRuntimeAdapter({
        id: instanceId,
        resolvedBackendId: this.id,
        kind: effective.bodyKind,
        representation: effective.representation,
        sourceKind: effective.sourceKind,
        surface: surfaceProvider,
        surfaceFeatures: { velocity: true, deformation: true, latencyFrames: 0 },
        spatialField,
        opticalProfile: Object.freeze({ ...effective.optics }),
        bounds: spatialField.metadata.bounds,
        priority: effective.instance.priority,
        enabled: effective.instance.interaction.query,
        metrics: {
          meshUploadCount: activation.submittedChunkCount + dropCount,
          drawCount,
          triangleCount,
          workload: {
            cpuQueryElementCount: resource.data.stats.queryPrimitiveCount,
            gpuAtlasPixelCount: resource.data.stats.mapPixelCount,
            fallbackReasons: [
              ...(resource.data.stats.budgetRedistributed ? ["sampling-budget-redistributed"] : []),
              ...(resource.data.reaches.some((reach) => reach.artifact.geometryAnalysis.sharpBendFallbackCount > 0)
                ? ["bounded-sharp-bend-join"]
                : [])
            ]
          },
          memory: resource.memory
        }
      });
      const record: RiverWaterBackendRuntimeDiagnostics = Object.freeze({
        instanceId,
        controller,
        activation,
        root: instanceRoot,
        planarTransform,
        reflection,
        terrainInteraction: createRiverTerrainInteractionSnapshot(resource.data.terrainInteraction),
        compiledDiagnostics: runtimeContext.compiledDiagnostics
          ? Object.freeze({
              identity: Object.freeze({ ...resource.identity }),
              metadata: Object.freeze({ ...resource.metadata }),
              totalBytes: resource.byteLength,
              data: deserializeRiverResource(resource.serialize()).data
            })
          : undefined
      });
      if (!staged) this._runtimes.set(instanceId, record);
      let active = true;
      let published = !staged;
      return {
        body,
        reflection,
        development: Object.freeze({
          backendId: this.id,
          adapter: createWaterBackendDiagnosticsAdapter(controller),
          renderContract,
          fieldGraph
        }),
        setVisible: (visible) => {
          instanceRoot.isActive = visible;
          reflection?.setVisible(visible);
        },
        refreshTerrainOcclusion: (provider) => {
          controller.refreshTerrainOcclusion(provider);
        },
        refreshCameraVisibility: (provider) => {
          reflection?.observeCameraFrustumVisibility(controller.hasCameraVisibleSurfaceChunk(provider));
        },
        refreshReflectionBinding: () => {
          reflection?.refresh();
        },
        updateEffectiveState: (nextEffective) => {
          if (!active) {
            throw new Error(`River runtime '${instanceId}' cannot accept an in-place Look update.`);
          }
          const opticalProfile = Object.freeze({ ...nextEffective.optics });
          // Look edits update optical uniforms while retaining the lifecycle-owned reflection.
          // Clearing it here disables receivers, but the unchanged binding revision is then skipped.
          controller.setSurfaceOpticsBinding({
            ...createOpticsBinding(nextEffective),
            reflection: controller.surfaceOpticsBinding?.reflection
          });
          controller.setScreenSpaceReflectionCompositeIntensity(
            nextEffective.reflectionSampling.screenSpaceCompositeIntensity
          );
          controller.setSurfaceAppearanceBinding(
            resolveSurfaceAppearanceBinding(nextEffective, context.resourceLeases ?? Object.freeze([]))
          );
          controller.setDepthWriteEnabled(nextEffective.renderContract.renderState.depthWriteEnabled);
          controller.setRenderPriority(nextEffective.renderContract.renderState.priorityOffset);
          body.setOpticalProfile(opticalProfile);
          dropRenderer?.setLook(nextEffective.renderContract.look.riverDrops);
          dropRenderer?.setSurfacePriority(nextEffective.renderContract.renderState.priorityOffset);
        },
        commitReplacement: staged
          ? () => {
              if (!active) {
                throw new Error(`River runtime '${instanceId}' is no longer active.`);
              }
              if (published) return;
              reflection?.commitReplacement();
              published = true;
              this._runtimes.set(instanceId, record);
            }
          : undefined,
        restoreReplacement: () => {
          if (!active) throw new Error(`River runtime '${instanceId}' is no longer active.`);
          reflection?.restoreReplacement();
          this._runtimes.set(instanceId, record);
        },
        destroy: () => {
          if (!active) return;
          active = false;
          if (this._runtimes.get(instanceId) === record) this._runtimes.delete(instanceId);
          dropRenderer?.destroy();
          destroyRuntime(controller, instanceRoot, reflection);
        }
      };
    } catch (error) {
      const failure =
        context.signal?.aborted && error instanceof RiverRuntimeSubmissionCancelledError
          ? new DOMException("River runtime activation was aborted.", "AbortError")
          : error;
      try {
        dropRenderer?.destroy();
        destroyRuntime(controller, instanceRoot, reflection);
      } catch (cleanupError) {
        throw new AggregateError(
          [failure, cleanupError],
          "River runtime creation failed and cleanup reported an additional error."
        );
      }
      throw failure;
    }
  }
}
