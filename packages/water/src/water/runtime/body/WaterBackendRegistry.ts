/** Backend routing contracts for authoritative Water authoring and runtime state. */
import type { BoundingBox } from "@galacean/engine-math";
import { WaterBodySourceKind, type WaterBodySourceV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterBodyAsset } from "../../authoring/body/WaterBodyAsset";
import type { ResolvedWaterBodyInstance } from "../../authoring/body/ResolvedWaterBodyInstance";
export type { ResolvedWaterBodyInstance } from "../../authoring/body/ResolvedWaterBodyInstance";
import {
  createWaterRepresentationV1,
  type WaterDomainKind,
  type WaterMacroSurfaceKind
} from "../../authoring/body/WaterBodyRepresentation";
import type { WaterCompiledResource } from "../../compiler/body/WaterCompiledResource";
import type { WaterCameraFeatureRequest } from "../optics/CameraWaterFeatureBroker";
import type { WaterRuntimeResourceLease } from "../resources/WaterRuntimeResourceRegistry";
import type {
  WaterReflectionBindingLifecycle,
  WaterReflectionBindingService,
  WaterReflectionRuntimeReadback
} from "../optics/WaterReflectionBindingLifecycle";
import type { WaterBodyRuntime } from "./WaterBodyRuntime";
import type { EffectiveWaterRuntimeSnapshot } from "../state/EffectiveWaterRuntimeSnapshot";

/** Backend operations accept only authoritative authoring bundles. */
export interface WaterBackendOperationContext {
  readonly authoringVersion: 2;
  readonly signal?: AbortSignal;
  readonly resolvedInstance: ResolvedWaterBodyInstance;
}

export interface WaterBackendCompileIdentityContext {
  readonly signal?: AbortSignal;
  readonly resolvedInstance: ResolvedWaterBodyInstance;
}

export type WaterBackendAuthoringAsset = WaterBodyAsset<WaterBodySourceV1>;

/** Actual committed update mode derived by the Loader from compiled identity. */
export type WaterBackendUpdateMode = "runtime-update" | "recompile";

export type WaterBackendUpdateField = "transform" | "quality" | "priority";

export interface WaterBackendUpdateRequest {
  readonly previous: ResolvedWaterBodyInstance;
  readonly next: ResolvedWaterBodyInstance;
  readonly changedFields: readonly WaterBackendUpdateField[];
}

/** Backend support decision; it never predicts compiled-resource identity. */
export type WaterBackendUpdateDecision =
  | Readonly<{ supported: true }>
  | Readonly<{
      supported: false;
      path: "$.transform" | "$.qualityPlanId" | "$.priority";
      reason: string;
    }>;

export interface WaterBackendCompileContext extends WaterBackendOperationContext {
  readonly asset: WaterBackendAuthoringAsset;
  /** Host-local request identity for diagnostics; excluded from compile/cache identity. */
  readonly generationId?: number;
}

/**
 * Shared per-camera reflection route. Backends own per-body requests and
 * bindings; the Loader only transports this engine-facing service context.
 */
export interface WaterBackendReflectionContext {
  readonly service: WaterReflectionBindingService;
  readonly cullingMask: number;
  readonly waterLayerMask: number;
  /** Optional Camera SSR tuning shared by Water receivers on this Camera. */
  readonly screenSpaceReflection?: WaterCameraFeatureRequest["screenSpaceReflection"];
}

interface WaterBackendRuntimeContextCommon {
  readonly resourceLeases?: readonly WaterRuntimeResourceLease[];
  readonly reflection?: WaterBackendReflectionContext;
  /**
   * Replacement runtimes are constructed hidden and are not published by the
   * backend until `commitReplacement()` succeeds.
   */
  readonly activationMode?: "initial" | "replacement-staging";
  /** Engine/scene objects remain backend-specific; the Loader transports but never interprets this value. */
  readonly runtimeContext?: unknown;
}

export interface WaterBackendRuntimeContext extends WaterBackendRuntimeContextCommon {
  readonly authoringVersion: 2;
  readonly signal?: AbortSignal;
  /** The only immutable semantic state consumed by a backend runtime. */
  readonly effectiveSnapshot: Readonly<EffectiveWaterRuntimeSnapshot>;
}

/**
 * Optional, DOM-free context consumed by development tooling.
 *
 * Backends expose only objects they already own. The runtime and Loader never
 * import a panel implementation, descriptor schema, or dat.gui dependency.
 */
export interface WaterBackendDevelopmentContext {
  readonly backendId: string;
  readonly resolvedInstance?: ResolvedWaterBodyInstance;
  /** Backend-specific diagnostics/transient-control adapter; never the runtime controller owner. */
  readonly adapter?: unknown;
  readonly runtime?: unknown;
  readonly reflection?: WaterReflectionRuntimeReadback;
}

export type WaterBackendCameraRequestOverrides = Readonly<Pick<WaterCameraFeatureRequest, "opaqueDownsampling">>;

/** External conservative terrain-occlusion query consumed only by finite Water chunks. */
export interface WaterTerrainOcclusionProvider {
  isOccluded(candidateId: string, bounds: BoundingBox): boolean;
}

/** Current source-Camera visibility shared by every active Water runtime for one render frame. */
export interface WaterCameraVisibilityProvider {
  isVisible(bounds: BoundingBox, layer: number): boolean;
}

export interface WaterBackendRuntime {
  readonly body: WaterBodyRuntime;
  readonly cameraRequest?: WaterCameraFeatureRequest;
  /** Narrow backend render-budget hint; Loader still derives capability and reflection ownership. */
  readonly cameraRequestOverrides?: WaterBackendCameraRequestOverrides;
  /** Actual backend reflection capability and request lifecycle, when reflection is active. */
  readonly reflection?: WaterReflectionBindingLifecycle;
  readonly development?: WaterBackendDevelopmentContext;
  setVisible?(visible: boolean): void;
  /** Applies World-level terrain occlusion to finite renderer chunks; Ocean deliberately omits it. */
  refreshTerrainOcclusion?(provider?: WaterTerrainOcclusionProvider): void;
  /** Publishes current source-Camera frustum demand before the reflection service resolves. */
  refreshCameraVisibility?(provider: WaterCameraVisibilityProvider): void;
  /** Re-applies a service binding after the per-camera service updates. */
  refreshReflectionBinding?(): void;
  /**
   * Rebinds numeric Look values on the existing renderer. The Loader calls
   * this only when Look identity, shader structure, resources, Camera demand,
   * transform, quality, priority, visibility, and interaction are unchanged.
   */
  /** Optional backend veto for a uniform-only refresh; false stages an atomic runtime replacement. */
  canUpdateEffectiveState?(next: Readonly<EffectiveWaterRuntimeSnapshot>): boolean;
  /** Applies one already-resolved immutable snapshot synchronously and atomically. */
  updateEffectiveState?(next: Readonly<EffectiveWaterRuntimeSnapshot>): void;
  /** Publishes a previously staged same-id runtime in backend diagnostics. */
  commitReplacement?(): void;
  /** Restores this still-live runtime after a later participant fails publication. */
  restoreReplacement?(): void;
  destroy(): void | Promise<void>;
}

/** One exact representation route with an explicit source-kind allowlist. */
export interface WaterBackendRepresentationMatcher {
  readonly domain: WaterDomainKind;
  readonly macroSurface: WaterMacroSurfaceKind;
  readonly sourceKinds: readonly WaterBodySourceKind[];
}

export enum WaterBackendResolutionErrorCode {
  // Stable diagnostic values are data contracts; only the TypeScript API name is unversioned.
  InvalidSourceKind = "WATER_BACKEND_V2_INVALID_SOURCE_KIND",
  NoMatch = "WATER_BACKEND_V2_NO_MATCH",
  AmbiguousMatch = "WATER_BACKEND_V2_AMBIGUOUS_MATCH"
}

export class WaterBackendResolutionError extends Error {
  readonly name = "WaterBackendResolutionError";

  constructor(
    readonly code: WaterBackendResolutionErrorCode,
    readonly path: "$.source.kind" | "$.representation",
    message: string,
    readonly matchingBackendIds: readonly string[] = Object.freeze([])
  ) {
    super(message);
  }
}

/**
 * Algorithms live behind this boundary. The registry and loader only route,
 * cache, activate, and unwind backend work.
 */
export interface WaterBodyBackend {
  readonly id: string;
  /** Explicit world-transform contract published with the backend route. */
  readonly transformModel?: "finite-planar" | "world-space";
  /** Optional backend-specific camera-count ceiling. Other backends remain unrestricted. */
  readonly maximumCameraFeatureCount?: number;
  /**
   * Routing is independent from semantic body kind and implementation id.
   * Multiple entries let one backend own more than one exact representation.
   */
  readonly representationMatchers?: readonly WaterBackendRepresentationMatcher[];
  /**
   * Optional backend-owned compile identity. Runtime instance id/visibility must
   * never enter this key; only values that change immutable compiled output may.
   */
  getCompileKey?(
    asset: WaterBackendAuthoringAsset,
    resolvedSource: unknown,
    context?: WaterBackendCompileIdentityContext
  ): string;
  /**
   * Hash of the detached source actually compiled. This may differ from the
   * authoring asset hash when a registered provider resolves scene data.
   */
  getSourceHash?(
    asset: WaterBackendAuthoringAsset,
    resolvedSource: unknown,
    context?: WaterBackendCompileIdentityContext
  ): string;
  /** Pure capability check; Loader derives the actual mode from compiled identity. */
  checkInstanceUpdate?(request: WaterBackendUpdateRequest): WaterBackendUpdateDecision;
  resolveAsset?(asset: WaterBackendAuthoringAsset, context: WaterBackendOperationContext): unknown | Promise<unknown>;
  compile(
    resolvedSource: unknown,
    context: WaterBackendCompileContext
  ): WaterCompiledResource | Promise<WaterCompiledResource>;
  createRuntime(
    resource: WaterCompiledResource,
    context: WaterBackendRuntimeContext
  ): WaterBackendRuntime | Promise<WaterBackendRuntime>;
}

export class WaterBackendRegistry {
  private readonly _backends = new Map<string, WaterBodyBackend>();
  private readonly _representationMatchers = new Map<string, readonly Readonly<WaterBackendRepresentationMatcher>[]>();

  register(backend: WaterBodyBackend): void {
    if (backend.id.trim().length === 0) throw new Error("Water backend id must be non-empty.");
    if (this._backends.has(backend.id)) {
      throw new Error(`Water backend '${backend.id}' is already registered.`);
    }
    const matchers = normalizeRepresentationMatchers(backend.id, backend.representationMatchers ?? []);
    if (matchers.length > 0 && backend.transformModel === undefined) {
      throw new Error(`Water backend '${backend.id}' must declare transformModel when it publishes matchers.`);
    }
    if (
      backend.maximumCameraFeatureCount !== undefined &&
      (!Number.isSafeInteger(backend.maximumCameraFeatureCount) || backend.maximumCameraFeatureCount < 0)
    ) {
      throw new Error(`Water backend '${backend.id}' maximumCameraFeatureCount must be a non-negative safe integer.`);
    }
    this._backends.set(backend.id, backend);
    this._representationMatchers.set(backend.id, matchers);
  }

  unregister(backendId: string): boolean {
    const deleted = this._backends.delete(backendId);
    if (deleted) this._representationMatchers.delete(backendId);
    return deleted;
  }

  has(backendId: string): boolean {
    return this._backends.has(backendId);
  }

  /**
   * Resolves only from representation and source kind. Zero or multiple
   * matching backends are explicit errors; registration order never selects a
   * winner.
   */
  requireBackend(asset: Pick<WaterBodyAsset, "representation" | "source">): WaterBodyBackend {
    const sourceKind = readWaterBodySourceKind(asset.source);
    const matches = [...this._backends.values()]
      .filter((backend) =>
        (this._representationMatchers.get(backend.id) ?? []).some(
          (matcher) =>
            matcher.domain === asset.representation.domain &&
            matcher.macroSurface === asset.representation.macroSurface &&
            matcher.sourceKinds.includes(sourceKind)
        )
      )
      .sort(compareBackendsById);

    if (matches.length === 0) {
      throw new WaterBackendResolutionError(
        WaterBackendResolutionErrorCode.NoMatch,
        "$.representation",
        `No Water backend matches representation '${asset.representation.domain}/${asset.representation.macroSurface}' and source kind '${sourceKind}'.`
      );
    }
    if (matches.length > 1) {
      const matchingBackendIds = Object.freeze(matches.map((backend) => backend.id));
      throw new WaterBackendResolutionError(
        WaterBackendResolutionErrorCode.AmbiguousMatch,
        "$.representation",
        `Water backend routing is ambiguous for representation '${asset.representation.domain}/${asset.representation.macroSurface}' and source kind '${sourceKind}': ${matchingBackendIds.join(", ")}.`,
        matchingBackendIds
      );
    }
    return matches[0] as WaterBodyBackend;
  }

  get backends(): readonly WaterBodyBackend[] {
    return Object.freeze([...this._backends.values()].sort((a, b) => a.id.localeCompare(b.id)));
  }
}

const WATER_BODY_SOURCE_KINDS = Object.freeze(Object.values(WaterBodySourceKind));

function compareBackendsById(left: WaterBodyBackend, right: WaterBodyBackend): number {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function readWaterBodySourceKind(source: unknown): WaterBodySourceKind {
  const kind =
    typeof source === "object" && source !== null && "kind" in source
      ? (source as Readonly<{ kind?: unknown }>).kind
      : undefined;
  if (!WATER_BODY_SOURCE_KINDS.includes(kind as WaterBodySourceKind)) {
    throw new WaterBackendResolutionError(
      WaterBackendResolutionErrorCode.InvalidSourceKind,
      "$.source.kind",
      `WaterBody source kind '${String(kind)}' is unsupported.`
    );
  }
  return kind as WaterBodySourceKind;
}

function normalizeRepresentationMatchers(
  backendId: string,
  matchers: readonly WaterBackendRepresentationMatcher[]
): readonly Readonly<WaterBackendRepresentationMatcher>[] {
  return Object.freeze(
    matchers.map((matcher, index) => {
      createWaterRepresentationV1({ domain: matcher.domain, macroSurface: matcher.macroSurface });
      if (!Array.isArray(matcher.sourceKinds) || matcher.sourceKinds.length === 0) {
        throw new Error(`Water backend '${backendId}' matcher ${index} must declare at least one source kind.`);
      }
      const sourceKinds = new Set<WaterBodySourceKind>();
      for (const sourceKind of matcher.sourceKinds) {
        if (!WATER_BODY_SOURCE_KINDS.includes(sourceKind)) {
          throw new Error(
            `Water backend '${backendId}' matcher ${index} has unsupported source kind '${String(sourceKind)}'.`
          );
        }
        if (sourceKinds.has(sourceKind)) {
          throw new Error(`Water backend '${backendId}' matcher ${index} duplicates source kind '${sourceKind}'.`);
        }
        sourceKinds.add(sourceKind);
      }
      return Object.freeze({
        domain: matcher.domain,
        macroSurface: matcher.macroSurface,
        sourceKinds: Object.freeze([...sourceKinds])
      });
    })
  );
}
