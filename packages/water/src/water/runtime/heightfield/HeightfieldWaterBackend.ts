import { assertWaterConnectionTransform } from "../../authoring/connections/WaterConnection";
import { WaterFieldConsumerActivation, WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import { resolveWaterSurfaceFieldGraph } from "../surface/WaterSurfaceFieldResolver";
/** Real WaterBody backend adapter for the existing Heightfield compiler/runtime. */
import type { Engine, Entity, Texture2D } from "@galacean/engine-core";
import { createPhysicalSurfaceIdentity } from "../../authoring/body/PhysicalSurfaceIdentity";
import { WaterBodySourceKind } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type { HeightfieldWaterDiagnostic } from "../../authoring/heightfield/HeightfieldWaterTypes";
import { WaterSurfaceDepthSource } from "../../authoring/surface/enums/WaterSurfaceDepthSource";
import { WaterSurfaceCompositionV2 } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { WaterCompiledResource } from "../../compiler/body/WaterCompiledResource";
import {
  HeightfieldWaterCompiler,
  compileHashFromSourceHash,
  computeHeightfieldWaterPhysicalSourceHash,
  computeHeightfieldWaterSourceHash,
  resolveHeightfieldWaterQueryRepresentation
} from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { validateHeightfieldWaterDescriptor } from "../../compiler/heightfield/HeightfieldWaterValidator";
import { hashStableValue } from "../../compiler/shared/determinism";
import type { CompiledWaterRenderStateV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import { createWaterBackendControl } from "../body/WaterBackendControl";
import type {
  ResolvedWaterBodyInstance,
  WaterBackendCompileContext,
  WaterBackendCompileIdentityContext,
  WaterBackendRuntime,
  WaterBackendRuntimeContext,
  WaterBackendUpdateDecision,
  WaterBackendUpdateRequest,
  WaterBodyBackend
} from "../body/WaterBackendRegistry";
import { WaterBodyRuntimeAdapter } from "../body/WaterBodyRuntime";
import { resolveWaterBodyQualityTier } from "../body/WaterBodyRuntimeSemantics";
import {
  compileWaterPlanarTransform,
  waterPlanarTransformIsIdentity,
  type CompiledWaterPlanarTransformV1
} from "../body/WaterPlanarTransform";
import type { WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import { WaterReflectionBindingLifecycle } from "../optics/WaterReflectionBindingLifecycle";
import { waterReflectionPolicyModeToSource } from "../optics/WaterReflectionPolicy";
import type { WaterRuntimeResourceLease } from "../resources/WaterRuntimeResourceRegistry";
import type { EffectiveWaterRuntimeSnapshot } from "../state/EffectiveWaterRuntimeSnapshot";
import type { WaterSurfaceAppearanceBindingV2 } from "../surface/WaterSurfaceAppearanceRuntimeTypes";
import {
  readHeightfieldWaterPreparedCompilerIdentityV1,
  type HeightfieldWaterPreparedCompilerIdentityV1
} from "./HeightfieldWaterPreparedCompilerIdentity";
import { HeightfieldWaterResource } from "./HeightfieldWaterResource";
import {
  HeightfieldWaterRuntimeController,
  type HeightfieldWaterRuntimeActivation,
  type HeightfieldWaterRuntimeSubmissionOptions
} from "./HeightfieldWaterRuntimeController";
import { HeightfieldWaterCompositionMode } from "./HeightfieldWaterRuntimeEnums";

export const HEIGHTFIELD_WATER_BACKEND_ID = "heightfield";

export class HeightfieldWaterBackendCompileError extends Error {
  constructor(readonly diagnostics: readonly HeightfieldWaterDiagnostic[]) {
    super(diagnostics.map((diagnostic) => `${diagnostic.code}@${diagnostic.path}`).join(" | "));
    this.name = "HeightfieldWaterBackendCompileError";
  }
}

export class HeightfieldWaterBackendQualityError extends Error {
  constructor(
    readonly path: string,
    actual: number,
    maximum: number
  ) {
    super(`Heightfield compiled value ${actual} exceeds '${path}' budget ${maximum}.`);
    this.name = "HeightfieldWaterBackendQualityError";
  }
}

export class HeightfieldWaterBackendRenderStateError extends Error {
  constructor(readonly path: "$.renderState.queue" | "$.renderState.blendMode" | "$.renderState.cullMode") {
    super(`Heightfield Water does not support the requested '${path}' value.`);
    this.name = "HeightfieldWaterBackendRenderStateError";
  }
}

/** Heightfield's V2 shader is deliberately one transparent, alpha-blended, two-sided pipeline. */
export function assertHeightfieldWaterRenderState(state: Readonly<CompiledWaterRenderStateV1>): void {
  if (state.queue !== "transparent") throw new HeightfieldWaterBackendRenderStateError("$.renderState.queue");
  if (state.blendMode !== "alpha") throw new HeightfieldWaterBackendRenderStateError("$.renderState.blendMode");
  if (state.cullMode !== "off") throw new HeightfieldWaterBackendRenderStateError("$.renderState.cullMode");
}

/** Keeps custom geometry depth-safe without excluding body-local Basin coverage. */
export function assertHeightfieldWaterRenderSurfaceDepthSource(
  descriptor: Readonly<HeightfieldWaterDescriptorV1>,
  depthSource: WaterSurfaceDepthSource
): void {
  const coverage = descriptor.renderSurface?.coverage;
  if (!coverage || descriptor.lakeBoundary || depthSource === WaterSurfaceDepthSource.SceneDepth) return;
  if (depthSource === WaterSurfaceDepthSource.HybridOptionalSceneDepth && coverage !== "geometry") return;
  throw new Error(
    "Heightfield custom render surfaces require SceneDepth, or Hybrid depth with body-local Basin coverage."
  );
}

export interface HeightfieldWaterBackendRuntimeContext {
  readonly engine: Engine;
  readonly surfaceShader?: import("@galacean/engine-core").Shader;
  readonly root: Entity;
  readonly submission?: Omit<HeightfieldWaterRuntimeSubmissionOptions, "shouldCancel">;
  /** Runtime-only render offset; it does not alter the immutable Heightfield source or WaterBody transform. */
  readonly surfaceLevelOffsetMetres?: number;
  /** Demo/developer presentation hooks; authoring semantics are applied first. */
  readonly surfaceTimeOverride?: number;
}

interface HeightfieldWaterRuntimeState {
  readonly instanceId: string;
  readonly controller: HeightfieldWaterRuntimeController;
  readonly activation: HeightfieldWaterRuntimeActivation;
  readonly root: Entity;
  readonly planarTransform: Readonly<CompiledWaterPlanarTransformV1>;
  readonly reflection?: WaterReflectionBindingLifecycle;
}

export interface HeightfieldWaterBackendOptions {
  readonly compile?: (
    descriptor: HeightfieldWaterDescriptorV1,
    context: WaterBackendCompileContext
  ) => HeightfieldWaterResource | Promise<HeightfieldWaterResource>;
  readonly createController?: (
    engine: Engine,
    root: Entity,
    materialQuality: WaterQualityTier
  ) => HeightfieldWaterRuntimeController;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const effectiveHeightfieldDescriptors = new WeakSet<object>();
const effectiveHeightfieldDescriptorCache = new WeakMap<object, Map<WaterQualityTier, HeightfieldWaterDescriptorV1>>();

function freezeHeightfieldSourceSnapshot<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  // JavaScript cannot freeze typed-array indexed elements. Validation already
  // detached them, so the effective source exclusively owns these copies.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  for (const child of Object.values(value as Readonly<Record<string, unknown>>)) {
    freezeHeightfieldSourceSnapshot(child);
  }
  return Object.freeze(value);
}

function omitUndefinedHeightfieldSourceValues<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (Array.isArray(value)) {
    return value.map((child) => omitUndefinedHeightfieldSourceValues(child)) as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Readonly<Record<string, unknown>>)) {
    if (child === undefined) continue;
    result[key] = omitUndefinedHeightfieldSourceValues(child);
  }
  return result as T;
}

function createEffectiveHeightfieldDescriptor(
  source: unknown,
  quality: WaterQualityTier
): HeightfieldWaterDescriptorV1 {
  if (!isRecord(source)) {
    const validation = validateHeightfieldWaterDescriptor(source);
    throw new HeightfieldWaterBackendCompileError(validation.diagnostics);
  }
  if (effectiveHeightfieldDescriptors.has(source) && source.quality === quality) {
    return source as unknown as HeightfieldWaterDescriptorV1;
  }
  const cached = effectiveHeightfieldDescriptorCache.get(source)?.get(quality);
  if (cached) return cached;

  const validation = validateHeightfieldWaterDescriptor({
    ...source,
    quality
  });
  if (!validation.valid || !validation.value) {
    throw new HeightfieldWaterBackendCompileError(validation.diagnostics);
  }
  const effective = freezeHeightfieldSourceSnapshot(omitUndefinedHeightfieldSourceValues(validation.value));
  effectiveHeightfieldDescriptors.add(effective);
  let byQuality = effectiveHeightfieldDescriptorCache.get(source);
  if (!byQuality) {
    byQuality = new Map();
    effectiveHeightfieldDescriptorCache.set(source, byQuality);
  }
  byQuality.set(quality, effective);
  return effective;
}

function readPreparedHeightfieldIdentity(
  asset: Parameters<NonNullable<WaterBodyBackend["getCompileKey"]>>[0],
  effective: Readonly<HeightfieldWaterDescriptorV1>
): Readonly<HeightfieldWaterPreparedCompilerIdentityV1> | undefined {
  const prepared = readHeightfieldWaterPreparedCompilerIdentityV1(asset.representationData);
  if (!prepared) return undefined;
  if (prepared.sourceId !== effective.id || prepared.quality !== effective.quality) {
    throw new Error(`Heightfield Water '${asset.id}' prepared compiler identity does not match its source.`);
  }
  return prepared;
}

function resolveHeightfieldDescriptorQuality(
  source: unknown,
  context?: WaterBackendCompileIdentityContext
): WaterQualityTier {
  if (context) return resolveHeightfieldRuntimeQuality(context.resolvedInstance);
  if (!isRecord(source)) {
    const validation = validateHeightfieldWaterDescriptor(source);
    throw new HeightfieldWaterBackendCompileError(validation.diagnostics);
  }
  return source.quality as WaterQualityTier;
}

function resolveHeightfieldQueryQuality(context?: WaterBackendCompileIdentityContext) {
  return context?.resolvedInstance.qualityPlan.query ?? "dense";
}

function isRuntimeContext(value: unknown): value is HeightfieldWaterBackendRuntimeContext {
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
    (value.surfaceLevelOffsetMetres === undefined ||
      (typeof value.surfaceLevelOffsetMetres === "number" && Number.isFinite(value.surfaceLevelOffsetMetres)))
  );
}

function resolveHeightfieldRuntimeQuality(
  resolved: Pick<ResolvedWaterBodyInstance, "qualityPlan"> | Pick<EffectiveWaterRuntimeSnapshot, "qualityPlan">
): WaterQualityTier {
  return resolveWaterBodyQualityTier(resolved.qualityPlan.geometry);
}

function resolveHeightfieldPlanarTransform(
  resolved: Pick<ResolvedWaterBodyInstance, "instance"> | Pick<EffectiveWaterRuntimeSnapshot, "instance">
): Readonly<CompiledWaterPlanarTransformV1> {
  const transform = resolved.instance.transform;
  if (transform.scaleXZ[0] !== 1 || transform.scaleXZ[1] !== 1) {
    throw new RangeError("Heightfield instance transform.scaleXZ must remain exactly [1, 1].");
  }
  return compileWaterPlanarTransform(transform);
}

function checkHeightfieldInstanceUpdate(request: WaterBackendUpdateRequest): WaterBackendUpdateDecision {
  const fields = request.changedFields;
  if (fields.length === 0) {
    throw new Error("HeightfieldWaterBackend update check requires at least one changed field.");
  }
  if (fields.includes("transform")) {
    resolveHeightfieldPlanarTransform(request.next);
    return Object.freeze({ supported: true });
  }
  return Object.freeze({ supported: true });
}

function compileHeightfieldWater(
  descriptor: HeightfieldWaterDescriptorV1,
  context: WaterBackendCompileContext
): HeightfieldWaterResource {
  const result = HeightfieldWaterCompiler.compile(descriptor, {
    queryQuality: context.resolvedInstance?.qualityPlan.query ?? "dense"
  });
  if (!result.valid || !result.data) {
    throw new HeightfieldWaterBackendCompileError(result.diagnostics);
  }
  return HeightfieldWaterResource.create(
    result.data,
    {
      resolvedBackendId: HEIGHTFIELD_WATER_BACKEND_ID,
      representation: context.asset.representation,
      sourceKind: context.asset.source.kind
    },
    {
      physicalSourceHash: computeHeightfieldWaterPhysicalSourceHash(descriptor)
    }
  );
}

function assertQualityBudget(
  resource: HeightfieldWaterResource,
  resolved: Pick<ResolvedWaterBodyInstance, "qualityPlan"> | Pick<EffectiveWaterRuntimeSnapshot, "qualityPlan">
): void {
  const budget = resolved.qualityPlan.spatialField;
  const data = resource.data;
  const actual = {
    maximumHorizontalError: data.queryGrid
      ? Math.hypot(data.queryGrid.grid.cellSizeXZ[0], data.queryGrid.grid.cellSizeXZ[1]) * 0.5
      : 0,
    maximumDepthError: 0,
    maximumGpuDepthDecodeError: data.localMapAtlas.maxDepth / 510,
    maximumGpuShoreDecodeError: data.localMapAtlas.signedDistanceRange / 255,
    maximumAtlasPixels: data.localMapAtlas.width * data.localMapAtlas.height
  } as const;
  for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
    if (actual[key] > budget[key]) {
      throw new HeightfieldWaterBackendQualityError(`$.quality.spatialField.${key}`, actual[key], budget[key]);
    }
  }
}

function resolveEffectiveOpticalProfile(effective: Readonly<EffectiveWaterRuntimeSnapshot>): WaterOpticalProfile {
  return Object.freeze({ ...effective.optics });
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

function resolveAppearanceBinding(
  effective: Readonly<EffectiveWaterRuntimeSnapshot>,
  leases: readonly WaterRuntimeResourceLease[]
): Readonly<WaterSurfaceAppearanceBindingV2> {
  const appearance = effective.renderContract.surfaceClosure.appearance;
  const textureBindings = appearance.textureReferences.map((reference) => {
    const lease = leases.find((candidate) => candidate.descriptor.id === reference.textureAssetId);
    const texture = resolveTexture(lease?.resource);
    if (!lease || !texture) {
      throw new Error(
        `Heightfield appearance '${appearance.sourceId}' requires texture resource '${reference.textureAssetId}'.`
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
    fieldGraph: resolveWaterSurfaceFieldGraph(effective.renderContract.surfaceClosure.fields, {
      quality: resolveWaterBodyQualityTier(effective.qualityPlan.surfaceShading),
      effectiveQualityPlan: effective.qualityPlan,
      compiledSpatialFields: new Set([
        WaterFieldSemantic.Coverage,
        WaterFieldSemantic.SurfaceHeight,
        ...(effective.sourceCapabilities.localBathymetry ? [WaterFieldSemantic.VerticalDepth] : []),
        ...(effective.sourceCapabilities.shoreSdf ? [WaterFieldSemantic.HorizontalShoreDistance] : []),
        ...(effective.sourceCapabilities.current ? [WaterFieldSemantic.Flow] : [])
      ]),
      enabledActivations: new Set(Object.values(WaterFieldConsumerActivation)),
      cameraDepth: effective.qualityPlan.sceneFields === "scene-color-depth",
      cameraOpaqueColor: effective.qualityPlan.sceneFields !== "local-only"
    }),
    textureBindings: Object.freeze(textureBindings)
  });
}

function destroyRuntime(
  controller: HeightfieldWaterRuntimeController,
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
    root.destroy();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Heightfield runtime cleanup reported multiple errors.");
  }
}

export class HeightfieldWaterBackend implements WaterBodyBackend {
  readonly id = HEIGHTFIELD_WATER_BACKEND_ID;
  readonly transformModel = "finite-planar" as const;
  readonly representationMatchers = Object.freeze([
    Object.freeze({
      domain: "bounded-grid" as const,
      macroSurface: "heightfield" as const,
      sourceKinds: Object.freeze([WaterBodySourceKind.GridMask, WaterBodySourceKind.TerrainRegion])
    })
  ]);

  private readonly _compile: NonNullable<HeightfieldWaterBackendOptions["compile"]>;
  private readonly _createController: NonNullable<HeightfieldWaterBackendOptions["createController"]>;
  private readonly _runtimes = new Map<string, HeightfieldWaterRuntimeState>();

  constructor(options: HeightfieldWaterBackendOptions = {}) {
    this._compile = options.compile ?? compileHeightfieldWater;
    this._createController =
      options.createController ??
      ((engine, root, materialQuality) => new HeightfieldWaterRuntimeController(engine, root, materialQuality));
  }

  getRuntimeController(instanceId: string): HeightfieldWaterRuntimeController | undefined {
    return this._runtimes.get(instanceId)?.controller;
  }

  get activeRuntimeCount(): number {
    return this._runtimes.size;
  }

  /** RuntimeHost lifecycle command; it changes no authored or Effective semantic state. */
  setRuntimeSurfaceTimeOverride(instanceId: string, timeSeconds: number | undefined): boolean {
    const runtime = this._runtimes.get(instanceId);
    if (!runtime) return false;
    runtime.controller.setSurfaceTimeOverride(timeSeconds);
    return true;
  }

  /** Hot runtime path used by bounded Lake previews; it performs no compile or mesh replacement. */
  setRuntimeSurfaceLevelOffset(instanceId: string, offsetMetres: number): boolean {
    if (!Number.isFinite(offsetMetres)) {
      throw new RangeError("Heightfield runtime surface level offset must be finite.");
    }
    const runtime = this._runtimes.get(instanceId);
    if (!runtime) return false;
    runtime.controller.setSurfaceLevelOffsetMetres(offsetMetres);
    return true;
  }

  checkInstanceUpdate(request: WaterBackendUpdateRequest): WaterBackendUpdateDecision {
    return checkHeightfieldInstanceUpdate(request);
  }

  private readonly compileIdentities = new WeakMap<
    WaterBackendCompileIdentityContext,
    { source: unknown; sourceHash: string; compileKey: string }
  >();

  private compileIdentity(
    asset: Parameters<NonNullable<WaterBodyBackend["getCompileKey"]>>[0],
    resolvedSource: unknown,
    context?: WaterBackendCompileIdentityContext
  ) {
    const cached = context && this.compileIdentities.get(context);
    if (cached && cached.source === resolvedSource) return cached;
    const effective = createEffectiveHeightfieldDescriptor(
      resolvedSource,
      resolveHeightfieldDescriptorQuality(resolvedSource, context)
    );
    const queryQuality = resolveHeightfieldWaterQueryRepresentation(resolveHeightfieldQueryQuality(context));
    const prepared = readPreparedHeightfieldIdentity(asset, effective);
    const sourceHash = prepared?.sourceHash ?? computeHeightfieldWaterSourceHash(effective);
    const identity = {
      source: resolvedSource,
      sourceHash,
      compileKey: prepared?.compileHashes[queryQuality] ?? compileHashFromSourceHash(sourceHash, queryQuality)
    };
    // Loader supplies one short-lived context per identity check; mutable author inputs are never memoized globally.
    if (context) this.compileIdentities.set(context, identity);
    return identity;
  }

  getCompileKey(
    asset: Parameters<NonNullable<WaterBodyBackend["getCompileKey"]>>[0],
    resolvedSource: unknown,
    context?: WaterBackendCompileIdentityContext
  ): string {
    return this.compileIdentity(asset, resolvedSource, context).compileKey;
  }

  getSourceHash(
    asset: Parameters<NonNullable<WaterBodyBackend["getSourceHash"]>>[0],
    resolvedSource: unknown,
    context?: WaterBackendCompileIdentityContext
  ): string {
    return this.compileIdentity(asset, resolvedSource, context).sourceHash;
  }

  resolveAsset(
    asset: Parameters<NonNullable<WaterBodyBackend["resolveAsset"]>>[0],
    context: Parameters<NonNullable<WaterBodyBackend["resolveAsset"]>>[1]
  ): unknown {
    const source = asset.source;
    if (!isRecord(source) || source.kind !== WaterBodySourceKind.GridMask) {
      throw new Error(`HeightfieldWaterBackend requires a '${WaterBodySourceKind.GridMask}' WaterBody source.`);
    }
    const representationData = asset.representationData;
    if (
      !isRecord(representationData) ||
      representationData.schemaVersion !== 1 ||
      representationData.kind !== "heightfield-spatial-representation" ||
      !isRecord(representationData.spatialField) ||
      !isRecord(source.descriptor)
    ) {
      throw new Error("HeightfieldWaterBackend requires valid Heightfield Representation data.");
    }
    const descriptor = Object.freeze({
      ...source.descriptor,
      spatialField: representationData.spatialField,
      renderSurface: representationData.renderSurface
    });
    return createEffectiveHeightfieldDescriptor(descriptor, resolveHeightfieldRuntimeQuality(context.resolvedInstance));
  }

  async compile(resolvedSource: unknown, context: WaterBackendCompileContext): Promise<HeightfieldWaterResource> {
    const resolved = context.resolvedInstance;
    if (!resolved) {
      throw new Error("HeightfieldWaterBackend requires a resolved WaterBody instance.");
    }
    resolveHeightfieldPlanarTransform(resolved);
    const effective = createEffectiveHeightfieldDescriptor(resolvedSource, resolveHeightfieldRuntimeQuality(resolved));
    assertHeightfieldWaterRenderSurfaceDepthSource(effective, resolved.optics.depthSource);
    const resource = await this._compile(effective, context);
    const queryQuality = resolveHeightfieldWaterQueryRepresentation(resolved.qualityPlan.query);
    const actualQueryQuality = resource.data.queryQuality;
    const actualCompiledHash = resource.data.compiledHash;
    const expectedCompiledHash = compileHashFromSourceHash(resource.data.sourceHash, queryQuality);
    if (actualQueryQuality !== queryQuality || actualCompiledHash !== expectedCompiledHash) {
      resource.dispose();
      throw new Error(
        `Heightfield resource Query representation '${actualQueryQuality}' / '${actualCompiledHash}' does not match canonical '${queryQuality}' / '${expectedCompiledHash}'.`
      );
    }
    const route = resource.identity;
    const physicalSourceHash =
      readPreparedHeightfieldIdentity(context.asset, effective)?.physicalSourceHash ??
      computeHeightfieldWaterPhysicalSourceHash(effective);
    const expectedPhysicalSurfaceHash = createPhysicalSurfaceIdentity({
      sourceHash: physicalSourceHash,
      physicalWaveHash: hashStableValue({
        waveHash: resource.data.waveSet.sourceHash,
        surfaceMotion: resource.data.surfaceMotion
      })
    }).contentHash;
    if (
      route.resolvedBackendId === this.id &&
      route.representation.domain === context.asset.representation.domain &&
      route.representation.macroSurface === context.asset.representation.macroSurface &&
      route.sourceKind === context.asset.source.kind &&
      route.physicalSurfaceHash === expectedPhysicalSurfaceHash
    ) {
      return resource;
    }
    const rerouted = HeightfieldWaterResource.create(
      resource.data,
      {
        resolvedBackendId: this.id,
        representation: context.asset.representation,
        sourceKind: context.asset.source.kind
      },
      {
        physicalSourceHash
      }
    );
    resource.dispose();
    return rerouted;
  }

  async createRuntime(
    resource: WaterCompiledResource,
    context: WaterBackendRuntimeContext
  ): Promise<WaterBackendRuntime> {
    const effective = context.effectiveSnapshot;
    assertHeightfieldWaterRenderState(effective.renderContract.renderState);
    const planarTransform = resolveHeightfieldPlanarTransform(effective);
    if (!(resource instanceof HeightfieldWaterResource)) {
      throw new Error("HeightfieldWaterBackend received a non-Heightfield compiled resource.");
    }
    assertWaterConnectionTransform(resource.data.connections, effective.instance.transform);
    if (!isRuntimeContext(context.runtimeContext)) {
      throw new Error("HeightfieldWaterBackend runtimeContext requires an Engine and parent Entity.");
    }
    const runtimeQuality = resolveHeightfieldRuntimeQuality(effective);
    if (resource.data.quality !== runtimeQuality) {
      throw new Error(
        `Heightfield resource quality '${resource.data.quality}' does not match plan '${runtimeQuality}'.`
      );
    }
    assertQualityBudget(resource, effective);
    const instanceId = effective.instance.id;
    const staged = context.activationMode === "replacement-staging";
    if (!staged && this._runtimes.has(instanceId)) {
      throw new Error(`Heightfield runtime '${instanceId}' is already active.`);
    }

    const runtimeContext = context.runtimeContext;
    const surfaceLevelOffsetMetres = runtimeContext.surfaceLevelOffsetMetres ?? 0;
    const instanceRoot = runtimeContext.root.createChild(`water-body-${instanceId}`);
    if (!waterPlanarTransformIsIdentity(planarTransform)) {
      const position = planarTransform.source.position;
      instanceRoot.transform.setPosition(position[0], position[1], position[2]);
      instanceRoot.transform.setRotation(0, planarTransform.source.yawDegrees, 0);
    }
    const controller = this._createController(
      runtimeContext.engine,
      instanceRoot,
      resolveWaterBodyQualityTier(effective.qualityPlan.surfaceShading)
    );
    let reflection: WaterReflectionBindingLifecycle | undefined;
    try {
      controller.surfaceShader = runtimeContext.surfaceShader;
      controller.setDepthSource(effective.lookRuntimeFeatures.depthSource);
      controller.setOpticalProfile(resolveEffectiveOpticalProfile(effective));
      controller.setRefractionEnabled(effective.refractionEnabled);
      controller.setReflectionSamplingConfig(effective.reflectionSampling);
      controller.setScreenSpaceReflectionCompositeIntensity(effective.reflectionSampling.screenSpaceCompositeIntensity);
      controller.setSurfaceAppearanceFeatureFlags(effective.appearanceFeatureFlags);
      controller.setSurfaceAppearanceBinding(
        resolveAppearanceBinding(effective, context.resourceLeases ?? Object.freeze([]))
      );
      if (runtimeContext.surfaceTimeOverride !== undefined) {
        controller.setSurfaceTimeOverride(runtimeContext.surfaceTimeOverride);
      }
      controller.setSurfaceLevelOffsetMetres(surfaceLevelOffsetMetres);
      const renderContract = effective.renderContract;
      controller.setCompositionMode(
        renderContract.surfaceClosure.appearance.composition === WaterSurfaceCompositionV2.PrecomposedReplace
          ? HeightfieldWaterCompositionMode.PrecomposedReplace
          : HeightfieldWaterCompositionMode.AlphaBlend
      );
      controller.setDepthWriteEnabled(renderContract.renderState.depthWriteEnabled);
      // Instance priority belongs to query/interaction arbitration. Renderer ordering is a
      // separate Render Contract concern: folding the instance value into MeshRenderer.priority
      // moves Water's Forward and SSR surface passes out of their canonical ordering.
      controller.setRenderPriority(renderContract.renderState.priorityOffset);
      const runtimeVisible = staged ? false : effective.instance.visible;
      if (context.reflection) {
        const reflectionPolicy = effective.effectiveReflectionPolicy;
        const reflectionSource = waterReflectionPolicyModeToSource(reflectionPolicy.preferred);
        if (reflectionSource !== "sky") {
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
      }
      const activation = await controller.replaceActiveIncremental(instanceId, resource, {
        ...runtimeContext.submission,
        planarTransform,
        shouldCancel: () => context.signal?.aborted === true
      });
      instanceRoot.isActive = runtimeVisible;
      const body = new WaterBodyRuntimeAdapter({
        id: instanceId,
        resolvedBackendId: this.id,
        kind: effective.bodyKind,
        representation: effective.representation,
        sourceKind: effective.sourceKind,
        surface: activation.surfaceProvider,
        surfaceFeatures: { velocity: true, deformation: true, latencyFrames: 0 },
        spatialField: activation.spatialFieldProvider,
        opticalProfile: resolveEffectiveOpticalProfile(effective),
        bounds: activation.spatialFieldProvider.metadata.bounds,
        priority: effective.instance.priority,
        enabled: effective.instance.interaction.query
      });
      const record: HeightfieldWaterRuntimeState = Object.freeze({
        instanceId,
        controller,
        activation,
        root: instanceRoot,
        planarTransform,
        reflection
      });
      if (!staged) this._runtimes.set(instanceId, record);
      let active = true;
      let published = !staged;
      let activeEffective = effective;
      return {
        body,
        reflection,
        development: Object.freeze({
          backendId: this.id,
          adapter: createWaterBackendControl(controller),
          planarTransform,
          reflection
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
            throw new Error(`Heightfield runtime '${instanceId}' cannot accept an in-place Look update.`);
          }
          const opticalProfile = resolveEffectiveOpticalProfile(nextEffective);
          controller.setOpticalProfile(opticalProfile);
          controller.setRefractionEnabled(nextEffective.refractionEnabled);
          controller.setReflectionSamplingConfig(nextEffective.reflectionSampling);
          controller.setScreenSpaceReflectionCompositeIntensity(
            nextEffective.reflectionSampling.screenSpaceCompositeIntensity
          );
          if (
            nextEffective.renderContract.surfaceClosure.appearance.appearanceHash !==
              activeEffective.renderContract.surfaceClosure.appearance.appearanceHash ||
            JSON.stringify(nextEffective.appearanceFeatureFlags) !==
              JSON.stringify(activeEffective.appearanceFeatureFlags)
          ) {
            controller.setSurfaceAppearanceFeatureFlags(nextEffective.appearanceFeatureFlags);
            controller.setSurfaceAppearanceBinding(
              resolveAppearanceBinding(nextEffective, context.resourceLeases ?? Object.freeze([]))
            );
            controller.setCompositionMode(
              nextEffective.renderContract.surfaceClosure.appearance.composition ===
                WaterSurfaceCompositionV2.PrecomposedReplace
                ? HeightfieldWaterCompositionMode.PrecomposedReplace
                : HeightfieldWaterCompositionMode.AlphaBlend
            );
          }
          if (
            nextEffective.renderContract.renderState.contentHash !==
            activeEffective.renderContract.renderState.contentHash
          ) {
            controller.setDepthWriteEnabled(nextEffective.renderContract.renderState.depthWriteEnabled);
            controller.setRenderPriority(nextEffective.renderContract.renderState.priorityOffset);
          }
          body.setOpticalProfile(opticalProfile);
          activeEffective = nextEffective;
        },
        commitReplacement: staged
          ? () => {
              if (!active) {
                throw new Error(`Heightfield runtime '${instanceId}' is no longer active.`);
              }
              if (published) return;
              reflection?.commitReplacement();
              published = true;
              this._runtimes.set(instanceId, record);
            }
          : undefined,
        restoreReplacement: () => {
          if (!active) throw new Error(`Heightfield runtime '${instanceId}' is no longer active.`);
          reflection?.restoreReplacement();
          this._runtimes.set(instanceId, record);
        },
        destroy: () => {
          if (!active) return;
          active = false;
          if (this._runtimes.get(instanceId) === record) this._runtimes.delete(instanceId);
          destroyRuntime(controller, instanceRoot, reflection);
        }
      };
    } catch (error) {
      try {
        destroyRuntime(controller, instanceRoot, reflection);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Heightfield runtime creation failed and cleanup reported an additional error."
        );
      }
      throw error;
    }
  }
}
