import { Entity, Material, Mesh, ReferResource, type Scene, type Camera } from "@galacean/engine-core";
import { PrefabResource } from "@galacean/engine-loader";
import type { ProfilePlacementInput, ProfilePlacementOutput } from "./architecture/ProfilePlacementAlgorithms";
import { arrangementRules, type ArrangementRule } from "../runtime/UnitPlacementStyle";
import type { Matrix } from "@galacean/engine-math";
import type { BuildingMeshChart, BuildingPath, BuildingPoint, BuildingPose } from "./BuildingLayout";

/** Point/Path/Surface coordinates are local to the part's Entity. */
export type BuildingSupport =
  | { type: "point"; pose: BuildingPose }
  | { type: "point"; attachment: import("../runtime/DecorationAssemblyPlacement").DecorationAssemblyMount }
  | { type: "path"; path: BuildingPath }
  | { type: "surface"; chart: BuildingMeshChart }
  | { type: "surface"; cottageRoof: import("../runtime/CottageDormerSupport").CottageDormerRoofSupport }
  | { type: "surface"; profiledRoof: import("../runtime/ProfiledDormerSupport").ProfiledDormerRoofSupport }
  /** Analytic geometry retains the exact chart and neighbouring constraints; it is not a second author model. */
  | { type: "surface"; profile: ProfilePlacementInput };
export interface BuildingAlgorithmContext {
  readonly entity: Entity;
  /** Shared only within this build; algorithms may reuse expensive source preparation. */
  readonly cache?: Map<string, unknown>;
  /** Generated resources belong to this build, borrowed resources must not be passed here. */
  own<T extends Mesh>(resource: T): T;
}
export type BuildingSupportGenerator<P = any> = (params: P, context: BuildingAlgorithmContext) => BuildingSupport;
export interface BuildingPlacementContext {
  readonly cache?: Map<string, unknown>;
  readonly signal?: AbortSignal;
}
export interface BuildingProfilePlacement {
  kind: "profile";
  output: ProfilePlacementOutput;
}
/** Transferable numerical placement records. Their format is consumed by the
 * matching native packer, never by invoking another layout algorithm. */
export interface BuildingPlacementRecords<T = unknown> {
  kind: "records";
  format: string;
  records: readonly T[];
}
export type BuildingPlacementResult =
  | readonly BuildingPose[]
  | BuildingPlacementBatch
  | BuildingProfilePlacement
  | BuildingPlacementRecords;
export type BuildingPlacementAlgorithm<P = any> = (
  support: BuildingSupport,
  params: P,
  context: BuildingPlacementContext
) => BuildingPlacementResult | Promise<BuildingPlacementResult>;
/** An algorithm may retain a native instance ABI instead of expanding one Entity per placement.
 * This is transient executable output, never persisted in a recipe. */
export interface BuildingPlacementBatch {
  kind: "batch";
  build(unit: Entity, context: BuildingBatchContext): Promise<BuildingPackedBatch>;
}
export interface BuildingBatchContext {
  readonly camera?: Camera;
  readonly parent: Entity;
  readonly scene: Scene;
  readonly signal: AbortSignal;
  readonly limit: number;
  own(resource: { destroy(): void }): void;
}
export interface BuildingPackedBatch {
  count: number;
  draws: number;
  /** Algorithm-specific diagnostic data; not author state. */
  details?: unknown;
}
/** A native node template with optional generated geometry. Architectural
 * composition belongs to the flat draft or native prefab hierarchy. */
export interface BuildingUnitTemplate {
  name?: string;
  geometry?: BuildingGeometryDefinition;
}
export interface BuildingGeometryDefinition {
  generator: string;
  params?: Record<string, any>;
  materials: Material[];
}
export type BuildingGeometryGenerator<P = any> = (params: P, context: BuildingAlgorithmContext) => Mesh;
export interface BuildingInstanceOrigin {
  /** Component-local path: part id, placement index, template child indices. */
  path: string;
  matrix: Matrix;
}

/** Native profile backing/preview kernels need a geometric layout convention.
 * This does not choose the executable callback: dispatch always uses the authored id.
 * Arbitrary Mesh/Point/Path algorithms do not need a profile convention. */
export interface BuildingProfileConvention {
  basis: ArrangementRule | "nativeMasonry" | "foundationSurface";
}
export interface BuildingPlacementRegistration {
  profile?: BuildingProfileConvention;
}

/** Registry stores code, recipes store references. Custom functions follow the same contract as presets.
 * Register before rebuilding/loading a recipe; use a new id for incompatible algorithms. */
export class AlgorithmLibrary<F extends (...args: any[]) => any> {
  private readonly entries = new Map<string, F>();
  private readonly names = new WeakMap<F, string>();
  register<T extends F>(id: string, fn: T): (...args: Parameters<F>) => ReturnType<T> {
    if (!id || typeof fn !== "function") throw Error("Algorithm needs a nonempty id and function");
    if (this.entries.has(id) && this.entries.get(id) !== fn) throw Error(`Algorithm already registered: ${id}`);
    if (this.names.has(fn) && this.names.get(fn) !== id) throw Error("Algorithm already has an id");
    this.entries.set(id, fn);
    this.names.set(fn, id);
    return fn as (...args: Parameters<F>) => ReturnType<T>;
  }
  reference(value: string | F): string {
    const id = typeof value === "string" ? value : this.names.get(value);
    if (!id) throw Error("Register custom algorithms before assigning them to a building part");
    return id;
  }
  resolve(value: string | F): F {
    const id = this.reference(value),
      fn = this.entries.get(id);
    if (!fn) throw Error(`Unknown building algorithm: ${id}`);
    return fn;
  }
}
export const buildingGeometryAlgorithms = new AlgorithmLibrary<BuildingGeometryGenerator>();
export const buildingSupportAlgorithms = new AlgorithmLibrary<BuildingSupportGenerator>();
export class BuildingPlacementLibrary extends AlgorithmLibrary<BuildingPlacementAlgorithm> {
  private readonly profiles = new Map<string, Readonly<BuildingProfileConvention> | undefined>();
  override register<T extends BuildingPlacementAlgorithm>(
    id: string,
    fn: T,
    options: BuildingPlacementRegistration = {}
  ): (...args: Parameters<BuildingPlacementAlgorithm>) => ReturnType<T> {
    const basis = options.profile?.basis;
    if (basis !== undefined && ![...arrangementRules, "nativeMasonry", "foundationSurface"].includes(basis))
      throw Error("Unknown profile geometry convention: " + basis);
    const previous = this.profiles.get(id);
    if (this.profiles.has(id) && previous?.basis !== basis)
      throw Error("Algorithm profile convention cannot change: " + id);
    const registered = super.register(id, fn);
    this.profiles.set(id, basis !== undefined ? Object.freeze({ basis }) : undefined);
    return registered;
  }
  profile(value: string | BuildingPlacementAlgorithm): Readonly<BuildingProfileConvention> {
    const id = this.reference(value);
    this.resolve(id);
    const profile = this.profiles.get(id);
    if (!profile) throw Error("Algorithm must declare its profile geometry convention: " + id);
    return profile;
  }
}
export const buildingPlacementAlgorithms = new BuildingPlacementLibrary();

/** The same dispatch/cancellation boundary applies to early placements needed
 * by the distance view and deferred detail placements. */
export async function executeBuildingPlacement(
  algorithm: string,
  support: BuildingSupport,
  params: Record<string, any>,
  context: BuildingPlacementContext = {}
): Promise<BuildingPlacementResult> {
  context.signal?.throwIfAborted();
  const result = await buildingPlacementAlgorithms.resolve(algorithm)(support, params, context);
  context.signal?.throwIfAborted();
  return result;
}

/** Copy author data while preserving native references. Reject cycles/non-data values. */
export function copyBuildingValue<T>(value: T, stack = new Set<object>()): T {
  if (value instanceof Entity || value instanceof ReferResource) {
    if (value.destroyed) throw Error("Building reference has been destroyed");
    return value;
  }
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw Error("Building values must be finite");
    return value;
  }
  if (typeof value !== "object") throw Error("Building parameters must be data or native references");
  if (stack.has(value)) throw Error("Cyclic building parameters");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
    throw Error("Unsupported building parameter object");
  stack.add(value);
  const result = Array.isArray(value)
    ? value.map((v) => copyBuildingValue(v, stack))
    : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyBuildingValue(v, stack)]));
  stack.delete(value);
  return result as T;
}
export function retainBuildingResources(value: unknown, count: number): void {
  if (value instanceof ReferResource)
    (value as ReferResource & { _addReferCount(n: number): void })._addReferCount(count);
  else if (value && typeof value === "object" && !(value instanceof Entity))
    for (const child of Object.values(value)) retainBuildingResources(child, count);
}
