import { TREE_ASSEMBLY_LOD_CROSS_FADE_SECONDS } from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyPlan";
import { SEED_WORLD_DETAIL_DENSITY_MULTIPLIER } from "../world/SeedWorldDetailCandidateLattice.ts";
import { sampleSeedWorldHeight, seedWorldOriginX, seedWorldOriginZ, type SeedWorldFields } from "./SeedWorldFields.ts";
import type { SeedWorldPlan } from "../world/SeedWorldPlanner.ts";
import {
  SeedWorldPopulationCellCompiler,
  SEED_WORLD_POPULATION_CELL_METRES,
  type SeedWorldPopulationInstance
} from "./SeedWorldPopulationPlan.ts";
import { SEED_WORLD_TREE_TERMINAL_DISTANCE_METRES } from "../world/SeedWorldRuntimeLodProfile.ts";

/** Precompiled population needs identity and dimensions, not a second semantic generator. */
export interface SeedWorldPopulationWorld {
  readonly rootSeed: number;
  readonly sizeMetres: number;
  readonly observationAnchor?: Readonly<{ x: number; y: number; z: number }>;
}
function requirePopulationGenerator(plan: SeedWorldPopulationWorld): SeedWorldPlan {
  if (!("vegetationRules" in plan)) throw new Error("Population without a generator requires precompiled instances");
  return plan as SeedWorldPlan;
}
const DETAIL_AUTHORED_MATERIAL_FADE = Object.freeze({ enabled: true, distanceMetres: 90, falloff: 0.8 });
// Unity Terrain Details defaults to an 80m terminal distance. Keep the authored 90m/105m
// source contract intact, but use its exact squared radial fade with a 60m mobile endpoint.
const DETAIL_MATERIAL_FADE = Object.freeze({
  enabled: true,
  model: "unity-radial-squared" as const,
  maximumDistanceMetres: 60
});
const DETAIL_PREFETCH_DISTANCE_METRES = DETAIL_MATERIAL_FADE.maximumDistanceMetres + SEED_WORLD_POPULATION_CELL_METRES;
const DETAIL_RENDER_PATCH_METRES = 32;
const DETAIL_COMPACTION_CANDIDATE_BUDGET_PER_UPDATE = 768;
const DETAIL_COMPACTION_TIME_BUDGET_MILLISECONDS = 2;
const DETAIL_PUBLICATION_BATCH_BUDGET_PER_UPDATE = 2;
const WHITE_POPULATION_COLOR = [1, 1, 1] as const;
// The extra Cell width keeps an exiting Cell resident until every tree in it has finished the terminal fade.
const RESIDENT_CELL_RADIUS =
  Math.ceil(SEED_WORLD_TREE_TERMINAL_DISTANCE_METRES / SEED_WORLD_POPULATION_CELL_METRES) + 1;
const DETAIL_RESIDENT_CELL_RADIUS =
  Math.ceil(seedWorldPopulationDetailFadeTerminalDistance() / SEED_WORLD_POPULATION_CELL_METRES) + 1;

/** Population categories rendered by the 3D runtime. Rocks belong exclusively to Decorations. */
export const SEED_WORLD_POPULATION_RUNTIME_CATEGORIES = Object.freeze(["tree", "shrub", "flower", "grass"] as const);

/** One category accepted by the shared Population Producer. */
export type SeedWorldPopulationRuntimeCategory = (typeof SEED_WORLD_POPULATION_RUNTIME_CATEGORIES)[number];

/** Renderer policy which does not participate in population acceptance or transform generation. */
export const SEED_WORLD_POPULATION_RUNTIME_PROFILE = Object.freeze({
  /** Ground vegetation receives scene shadows; woody plants also cast shadows. */
  shadows: Object.freeze({ castShadows: false, receiveShadows: true }),
  cellMetres: SEED_WORLD_POPULATION_CELL_METRES,
  residentCellRadius: RESIDENT_CELL_RADIUS,
  detailResidentCellRadius: DETAIL_RESIDENT_CELL_RADIUS,
  detail: Object.freeze({
    categories: Object.freeze(["grass", "flower"] as const),
    authoredMaterialFade: DETAIL_AUTHORED_MATERIAL_FADE,
    materialFade: DETAIL_MATERIAL_FADE,
    prefetchDistanceMetres: DETAIL_PREFETCH_DISTANCE_METRES,
    densityMultiplier: SEED_WORLD_DETAIL_DENSITY_MULTIPLIER,
    renderPatchMetres: DETAIL_RENDER_PATCH_METRES,
    compactionCandidateBudgetPerUpdate: DETAIL_COMPACTION_CANDIDATE_BUDGET_PER_UPDATE,
    compactionTimeBudgetMilliseconds: DETAIL_COMPACTION_TIME_BUDGET_MILLISECONDS,
    publicationBatchBudgetPerUpdate: DETAIL_PUBLICATION_BATCH_BUDGET_PER_UPDATE
  }),
  tree: Object.freeze({
    shadows: Object.freeze({ castShadows: true, receiveShadows: true }),
    lodThresholdSource: "authored-screen-relative" as const,
    terminalFadeDistanceMetres: SEED_WORLD_TREE_TERMINAL_DISTANCE_METRES,
    crossFadeSeconds: TREE_ASSEMBLY_LOD_CROSS_FADE_SECONDS
  }),
  shrub: Object.freeze({
    shadows: Object.freeze({ castShadows: true, receiveShadows: true }),
    lodThresholdSource: "authored-screen-relative" as const,
    crossFadeSeconds: TREE_ASSEMBLY_LOD_CROSS_FADE_SECONDS
  })
});

/** One accepted Producer instance after adding only final terrain grounding data. */
export interface SeedWorldGroundedPopulationInstance {
  /** Exact immutable instance published by `compileSeedWorldPopulationCell`. */
  readonly producerInstance: SeedWorldPopulationInstance;
  /** Exact world-space position; X-Z come from the Producer and Y comes from final height. */
  readonly position: readonly [x: number, y: number, z: number];
  /** Unit final-terrain normal at the accepted X-Z position. */
  readonly surfaceNormal: readonly [x: number, y: number, z: number];
  /** World-up woody yaw or surface-aligned Detail rotation. */
  readonly rotation: readonly [x: number, y: number, z: number, w: number];
}

/** World-space bounds used to retain dense detail through its authored radial-distance fade. */
export interface SeedWorldPopulationDetailBounds {
  /** Inclusive minimum corner. */
  readonly min: Readonly<{ x: number; y: number; z: number }>;
  /** Inclusive maximum corner. */
  readonly max: Readonly<{ x: number; y: number; z: number }>;
}

/** Immutable accepted population and world bounds for one 64m Population Cell. */
export interface SeedWorldPopulationRuntimeCell {
  /** Stable `cell-X-Z` identity shared with the Producer. */
  readonly id: string;
  /** Zero-based Population Cell X coordinate. */
  readonly cellX: number;
  /** Zero-based Population Cell Z coordinate. */
  readonly cellZ: number;
  /** Inclusive world X minimum. */
  readonly minimumWorldX: number;
  /** Inclusive world Z minimum. */
  readonly minimumWorldZ: number;
  /** Exclusive world X maximum except at the outer world edge. */
  readonly maximumWorldX: number;
  /** Exclusive world Z maximum except at the outer world edge. */
  readonly maximumWorldZ: number;
  /** Grounded accepted instances grouped without changing Producer order. */
  readonly instances: Readonly<
    Record<SeedWorldPopulationRuntimeCategory, readonly SeedWorldGroundedPopulationInstance[]>
  >;
  /** Stable hash of exact accepted identities and grounded transforms. */
  readonly transformHash: number;
}

/** Resource callbacks used by the Cell residency owner. */
export interface SeedWorldPopulationCellResourceFactory<TResource> {
  /**
   * Creates the complete render resource owned by one resident Cell.
   * @param cell Deterministic CPU Cell data.
   * @returns Cell-owned render resource.
   */
  create(cell: SeedWorldPopulationRuntimeCell): TResource;

  /**
   * Refreshes terrain-dependent transforms without replacing an existing render resource.
   * @param resource Existing Cell-owned render resource.
   * @param cell Re-grounded Cell data with unchanged Producer instance identities.
   * @returns Nothing after the resource reflects the supplied transforms.
   */
  refreshGrounding?(resource: TResource, cell: SeedWorldPopulationRuntimeCell): void;

  /**
   * Releases one Cell resource exactly once when it leaves residency or the owner is destroyed.
   * @param resource Resource previously returned by `create`.
   * @returns Nothing.
   */
  dispose(resource: TResource): void;
}

/**
 * Camera-residency policy for one deterministic Population Cell set.
 * The category subset changes upload ownership only; it never changes candidate identity.
 */
export interface SeedWorldPopulationCellSetOptions {
  /** Producer categories compiled into each owned Cell. */
  readonly categories?: readonly SeedWorldPopulationRuntimeCategory[];
  /** Optional Worker-baked exact instances; when present, runtime never evaluates population candidates. */
  readonly precompiledInstances?: readonly SeedWorldPopulationInstance[];
  /** Optional exact grounding overrides for Producer instances materialized on non-terrain surfaces. */
  readonly groundedInstanceOverrides?: ReadonlyMap<string, SeedWorldGroundedPopulationInstance>;
  /** Whether precompiled residency omits Cells containing no selected exact instances. */
  readonly omitEmptyPrecompiledCells?: boolean;
  /** Radius in 64m Cells around the camera. */
  readonly residentCellRadius?: number;
  /** Maximum newly compiled Cell resources admitted by one update. */
  readonly maximumNewCellsPerUpdate?: number;
  /** Maximum stale Cell resources released by one update. */
  readonly maximumReleasedCellsPerUpdate?: number;
  /**
   * Maximum canonical candidates evaluated before yielding one UI frame.
   * Omit this for offline or test callers which need synchronous admission.
   */
  readonly maximumCandidateEvaluationsPerUpdate?: number;
  /**
   * Maximum wall-clock time spent compiling pending Cells during one update.
   * Omit this for offline or test callers which need synchronous admission.
   */
  readonly maximumCompilationMillisecondsPerUpdate?: number;
  /** Inclusive Cell range permitted to this renderer-owned inspection residency. */
  readonly activeCellRange?: Readonly<{
    /** Inclusive horizontal Cell minimum. */
    readonly minimumX: number;
    /** Inclusive horizontal Cell maximum. */
    readonly maximumX: number;
    /** Inclusive depth Cell minimum. */
    readonly minimumZ: number;
    /** Inclusive depth Cell maximum. */
    readonly maximumZ: number;
  }>;
}

/** One resident deterministic Cell paired with its complete render resource. */
export interface SeedWorldResidentPopulationCell<TResource> {
  /** Deterministic CPU Cell data. */
  readonly data: SeedWorldPopulationRuntimeCell;
  /** Complete render resource owned by this residency entry. */
  readonly resource: TResource;
}

type PrecompiledPopulationCells = readonly (readonly SeedWorldPopulationInstance[] | undefined)[];

const EMPTY_PRECOMPILED_POPULATION_INSTANCES = Object.freeze([]) as readonly SeedWorldPopulationInstance[];

/**
 * Verifies that Population inputs describe the same generated world.
 * @param plan Authoritative semantic plan.
 * @param fields Canonical final fields compiled from the plan.
 * @returns Nothing.
 * @throws {RangeError} When Root Seed or world size differs.
 */
export function validateSeedWorldPopulationRuntimeInputs(
  plan: SeedWorldPopulationWorld,
  fields: SeedWorldFields
): void {
  if (
    !Number.isFinite(seedWorldOriginX(fields)) ||
    !Number.isFinite(seedWorldOriginZ(fields)) ||
    (fields.heightDecode &&
      (!Number.isFinite(fields.heightDecode.offset) ||
        !Number.isFinite(fields.heightDecode.scale) ||
        fields.heightDecode.scale <= 0))
  )
    throw new RangeError("Population terrain origin and height decode must be finite");
  if (plan.rootSeed !== fields.rootSeed || plan.sizeMetres !== fields.sizeMetres) {
    throw new RangeError("Seed World Population requires Plan and WorldFields from the same world");
  }
}

/**
 * Compiles a 3D Cell by grounding the exact accepted instances from the shared Population Producer.
 * @param plan Authoritative semantic plan.
 * @param fields Canonical final terrain and habitat fields.
 * @param cellX Zero-based Population Cell X coordinate.
 * @param cellZ Zero-based Population Cell Z coordinate.
 * @param categories Producer categories compiled into this runtime Cell.
 * @returns Immutable accepted transforms grouped by the four vegetation categories.
 * @throws {RangeError} When Plan and fields mismatch or Cell coordinates are outside the world.
 */
export function compileSeedWorldPopulationRuntimeCell(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  cellX: number,
  cellZ: number,
  categories: readonly SeedWorldPopulationRuntimeCategory[] = SEED_WORLD_POPULATION_RUNTIME_CATEGORIES
): SeedWorldPopulationRuntimeCell {
  return new SeedWorldPopulationRuntimeCellCompiler(plan, fields, cellX, cellZ, categories).finish();
}

/**
 * Incrementally grounds one exact Producer Cell so residency cannot block a camera transition.
 * @remarks Candidate identity remains owned by `SeedWorldPopulationCellCompiler`; this class adds only Hfinal grounding.
 */
export class SeedWorldPopulationRuntimeCellCompiler {
  private readonly _plan: SeedWorldPlan;
  private readonly _fields: SeedWorldFields;
  private readonly _cellX: number;
  private readonly _cellZ: number;
  private readonly _producer: SeedWorldPopulationCellCompiler;
  private _finished: SeedWorldPopulationRuntimeCell | undefined;

  /**
   * Creates one deferred runtime Cell compiler.
   * @param plan Authoritative semantic plan.
   * @param fields Canonical final terrain and habitat fields.
   * @param cellX Zero-based Population Cell X coordinate.
   * @param cellZ Zero-based Population Cell Z coordinate.
   * @param categories Producer categories compiled into this runtime Cell.
   */
  constructor(
    plan: SeedWorldPlan,
    fields: SeedWorldFields,
    cellX: number,
    cellZ: number,
    categories: readonly SeedWorldPopulationRuntimeCategory[] = SEED_WORLD_POPULATION_RUNTIME_CATEGORIES
  ) {
    this._plan = plan;
    this._fields = fields;
    this._cellX = cellX;
    this._cellZ = cellZ;
    this._producer = new SeedWorldPopulationCellCompiler(plan, fields, cellX, cellZ, categories);
  }

  /**
   * Advances a bounded count of canonical population candidates.
   * @param maximumCandidates Maximum candidates to evaluate before yielding, or positive infinity to finish synchronously.
   * @returns `true` when the complete grounded Cell is available.
   */
  advance(maximumCandidates: number): boolean {
    if (this._finished) return true;
    if (!this._producer.advance(maximumCandidates)) return false;
    this._finished = finalizeSeedWorldPopulationRuntimeCell(
      this._plan,
      this._fields,
      this._cellX,
      this._cellZ,
      this._producer.finish()
    );
    return true;
  }

  /**
   * Completes the runtime Cell synchronously for offline callers and tests.
   * @returns Complete immutable runtime Cell.
   */
  finish(): SeedWorldPopulationRuntimeCell {
    this.advance(Number.POSITIVE_INFINITY);
    return this._finished!;
  }
}

function finalizeSeedWorldPopulationRuntimeCell(
  plan: SeedWorldPopulationWorld,
  fields: SeedWorldFields,
  cellX: number,
  cellZ: number,
  accepted: readonly SeedWorldPopulationInstance[],
  groundedInstanceOverrides?: ReadonlyMap<string, SeedWorldGroundedPopulationInstance>
): SeedWorldPopulationRuntimeCell {
  const grouped: Record<SeedWorldPopulationRuntimeCategory, SeedWorldGroundedPopulationInstance[]> = {
    tree: [],
    shrub: [],
    flower: [],
    grass: []
  };
  let transformHash = 0x811c_9dc5;
  for (const producerInstance of accepted) {
    const grounded =
      groundedInstanceOverrides?.get(producerInstance.id) ??
      groundSeedWorldPopulationInstance(plan, fields, producerInstance);
    grouped[producerInstance.category].push(grounded);
    transformHash = hashGroundedInstance(transformHash, grounded);
  }

  const minimumWorldX = seedWorldOriginX(fields) + cellX * SEED_WORLD_POPULATION_CELL_METRES;
  const minimumWorldZ = seedWorldOriginZ(fields) + cellZ * SEED_WORLD_POPULATION_CELL_METRES;
  return Object.freeze({
    id: `cell-${cellX}-${cellZ}`,
    cellX,
    cellZ,
    minimumWorldX,
    minimumWorldZ,
    maximumWorldX: Math.min(
      seedWorldOriginX(fields) + plan.sizeMetres,
      minimumWorldX + SEED_WORLD_POPULATION_CELL_METRES
    ),
    maximumWorldZ: Math.min(
      seedWorldOriginZ(fields) + plan.sizeMetres,
      minimumWorldZ + SEED_WORLD_POPULATION_CELL_METRES
    ),
    instances: Object.freeze({
      tree: Object.freeze(grouped.tree),
      shrub: Object.freeze(grouped.shrub),
      flower: Object.freeze(grouped.flower),
      grass: Object.freeze(grouped.grass)
    }),
    transformHash: transformHash >>> 0
  });
}

/**
 * Writes one grounded logical transform to the existing instanced-buffer record layout.
 * @param records Destination interleaved records.
 * @param recordIndex Zero-based destination record.
 * @param instance Grounded accepted Producer instance.
 * @param color Linear RGB instance multiplier.
 * @param signedCoverage Signed LOD dither coverage.
 * @returns Nothing.
 * @throws {RangeError} When the destination record is outside the buffer.
 */
export function writeSeedWorldPopulationRuntimeRecord(
  records: Float32Array,
  recordIndex: number,
  instance: SeedWorldGroundedPopulationInstance,
  color: readonly [number, number, number] = WHITE_POPULATION_COLOR,
  signedCoverage = 1
): void {
  const offset = recordIndex * 16;
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || offset + 16 > records.length) {
    throw new RangeError("Seed World Population record exceeds its buffer capacity");
  }
  const { position, rotation } = instance;
  const [scaleX, scaleY, scaleZ] = instance.producerInstance.scale;
  records[offset] = position[0];
  records[offset + 1] = position[1];
  records[offset + 2] = position[2];
  records[offset + 3] = 1;
  records[offset + 4] = rotation[0];
  records[offset + 5] = rotation[1];
  records[offset + 6] = rotation[2];
  records[offset + 7] = rotation[3];
  records[offset + 8] = scaleX;
  records[offset + 9] = scaleY;
  records[offset + 10] = scaleZ;
  records[offset + 11] = 1;
  records[offset + 12] = color[0];
  records[offset + 13] = color[1];
  records[offset + 14] = color[2];
  records[offset + 15] = signedCoverage;
}

/**
 * Resolves the terminal radius of the runtime dense-detail fade.
 * @param profile Runtime radial-fade values.
 * @returns Maximum visible radius, or positive infinity when the profile is disabled.
 */
export function seedWorldPopulationDetailFadeTerminalDistance(
  profile: Readonly<{
    enabled: boolean;
    maximumDistanceMetres: number;
  }> = DETAIL_MATERIAL_FADE
): number {
  if (!profile.enabled) return Number.POSITIVE_INFINITY;
  return Math.max(0, profile.maximumDistanceMetres);
}

/**
 * Tests whether an expanded dense-detail Cell remains inside the authored radial-distance fade.
 * @param bounds Expanded 3D Cell bounds including the largest authored atom radius.
 * @param cameraPosition World-space camera position used by the vegetation fade shader.
 * @param terminalDistance Radial endpoint; callers may supply the farther prefetch radius.
 * @returns Whether grass and flower buffers should be resident and submitted.
 */
export function seedWorldPopulationDetailBoundsIsActive(
  bounds: SeedWorldPopulationDetailBounds,
  cameraPosition: Readonly<{ x: number; y: number; z: number }>,
  terminalDistance = seedWorldPopulationDetailFadeTerminalDistance()
): boolean {
  const offsetX = Math.max(bounds.min.x - cameraPosition.x, 0, cameraPosition.x - bounds.max.x);
  const offsetY = Math.max(bounds.min.y - cameraPosition.y, 0, cameraPosition.y - bounds.max.y);
  const offsetZ = Math.max(bounds.min.z - cameraPosition.z, 0, cameraPosition.z - bounds.max.z);
  return offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ <= terminalDistance * terminalDistance;
}

/**
 * Owns deterministic 64m Cell residency and guarantees exact-once render-resource disposal.
 * Worker-baked layouts are indexed directly; legacy callers may still provide the canonical deferred compiler.
 */
export class SeedWorldPopulationCellSet<TResource> {
  /** Stage resident resource replacements without allocating or retiring unrelated cells. */
  prepareResidentResources(replacements: ReadonlyMap<string, TResource>) {
    const changes = this._residentCells.flatMap((entry, slot) => {
      const resource = replacements.get(entry.data.id);
      return resource === undefined
        ? []
        : [{ old: entry, next: { data: entry.data, resource }, slot, index: this._cells.indexOf(entry) }];
    });
    let committed = false;
    return {
      commit: () => {
        if (committed || changes.some((c) => this._residentCells[c.slot] !== c.old || this._cells[c.index] !== c.old))
          throw Error("Stale population cells");
        for (const c of changes) {
          this._residentCells[c.slot] = c.next;
          this._cells[c.index] = c.next;
        }
        committed = true;
      },
      rollback: () => {
        if (!committed) return;
        for (const c of changes) {
          this._residentCells[c.slot] = c.old;
          this._cells[c.index] = c.old;
        }
        committed = false;
      }
    };
  }

  /** Drop partial CPU compilers before swapping their shared field snapshot. */
  invalidatePending(): void {
    this._pending.fill(undefined);
    this._pendingCount = 0;
    this._pendingSlotByCell.fill(0);
    this._residencySettled = false;
  }

  private readonly _plan: SeedWorldPopulationWorld;
  private readonly _fields: SeedWorldFields;
  private readonly _resources: SeedWorldPopulationCellResourceFactory<TResource>;
  private readonly _categories: readonly SeedWorldPopulationRuntimeCategory[];
  private readonly _cellCount: number;
  private readonly _cells: Array<SeedWorldResidentPopulationCell<TResource> | undefined>;
  private readonly _residentCells: SeedWorldResidentPopulationCell<TResource>[] = [];
  private readonly _residentSlotByCell: Int32Array;
  private readonly _pending: Array<SeedWorldPopulationRuntimeCellCompiler | undefined>;
  private readonly _pendingCells: Uint32Array;
  private readonly _pendingSlotByCell: Int32Array;
  private readonly _desiredCells: Uint32Array;
  private readonly _desiredDistanceSquared: Float64Array;
  private readonly _desiredEpochByCell: Uint32Array;
  private readonly _createdCells: SeedWorldResidentPopulationCell<TResource>[] = [];
  private _precompiledInstancesByCell: PrecompiledPopulationCells | undefined;
  private readonly _groundedInstanceOverrides: ReadonlyMap<string, SeedWorldGroundedPopulationInstance> | undefined;
  private readonly _omitEmptyPrecompiledCells: boolean;
  private readonly _residentCellRadius: number;
  private readonly _residentCellRadiusCoversWorld: boolean;
  private readonly _maximumNewCellsPerUpdate: number;
  private readonly _maximumReleasedCellsPerUpdate: number;
  private readonly _maximumCandidateEvaluationsPerUpdate: number;
  private readonly _maximumCompilationMillisecondsPerUpdate: number;
  private readonly _activeCellRange:
    | Readonly<{ minimumX: number; maximumX: number; minimumZ: number; maximumZ: number }>
    | undefined;
  private _pendingCount = 0;
  private _desiredEpoch = 0;
  private _centerCellX = -1;
  private _centerCellZ = -1;
  private _residencySettled = false;
  private _destroyed = false;

  /**
   * Creates an empty camera-driven Cell owner.
   * @param plan Authoritative semantic plan.
   * @param fields Canonical final fields from the same world.
   * @param resources Complete resource lifecycle for one Cell.
   * @param options Category, extent, and admission ownership policy.
   */
  constructor(
    plan: SeedWorldPopulationWorld,
    fields: SeedWorldFields,
    resources: SeedWorldPopulationCellResourceFactory<TResource>,
    options: SeedWorldPopulationCellSetOptions = {}
  ) {
    validateSeedWorldPopulationRuntimeInputs(plan, fields);
    const residentCellRadius = options.residentCellRadius ?? RESIDENT_CELL_RADIUS;
    const maximumNewCellsPerUpdate = options.maximumNewCellsPerUpdate ?? Number.POSITIVE_INFINITY;
    const maximumReleasedCellsPerUpdate = options.maximumReleasedCellsPerUpdate ?? Number.POSITIVE_INFINITY;
    const maximumCandidateEvaluationsPerUpdate =
      options.maximumCandidateEvaluationsPerUpdate ?? Number.POSITIVE_INFINITY;
    const maximumCompilationMillisecondsPerUpdate =
      options.maximumCompilationMillisecondsPerUpdate ?? Number.POSITIVE_INFINITY;
    const cellCount = Math.ceil(plan.sizeMetres / SEED_WORLD_POPULATION_CELL_METRES);
    if (!Number.isInteger(residentCellRadius) || residentCellRadius < 0) {
      throw new RangeError("Seed World Population Cell radius must be a non-negative integer");
    }
    if (
      maximumNewCellsPerUpdate !== Number.POSITIVE_INFINITY &&
      (!Number.isInteger(maximumNewCellsPerUpdate) || maximumNewCellsPerUpdate < 1)
    ) {
      throw new RangeError("Seed World Population Cell admission limit must be a positive integer");
    }
    if (
      maximumReleasedCellsPerUpdate !== Number.POSITIVE_INFINITY &&
      (!Number.isInteger(maximumReleasedCellsPerUpdate) || maximumReleasedCellsPerUpdate < 1)
    ) {
      throw new RangeError("Seed World Population Cell release limit must be a positive integer");
    }
    if (
      maximumCandidateEvaluationsPerUpdate !== Number.POSITIVE_INFINITY &&
      (!Number.isInteger(maximumCandidateEvaluationsPerUpdate) || maximumCandidateEvaluationsPerUpdate < 1)
    ) {
      throw new RangeError("Seed World Population Cell candidate budget must be a positive integer");
    }
    if (
      maximumCompilationMillisecondsPerUpdate !== Number.POSITIVE_INFINITY &&
      (!Number.isFinite(maximumCompilationMillisecondsPerUpdate) || maximumCompilationMillisecondsPerUpdate <= 0)
    ) {
      throw new RangeError("Seed World Population Cell compilation time budget must be positive");
    }
    if (options.activeCellRange) {
      const { minimumX, maximumX, minimumZ, maximumZ } = options.activeCellRange;
      if (
        !Number.isInteger(minimumX) ||
        !Number.isInteger(maximumX) ||
        !Number.isInteger(minimumZ) ||
        !Number.isInteger(maximumZ) ||
        minimumX < 0 ||
        minimumZ < 0 ||
        maximumX >= cellCount ||
        maximumZ >= cellCount ||
        minimumX > maximumX ||
        minimumZ > maximumZ
      ) {
        throw new RangeError("Seed World Population active Cell range is outside the generated world");
      }
    }
    this._plan = plan;
    this._fields = fields;
    this._resources = resources;
    this._categories = Object.freeze([...(options.categories ?? SEED_WORLD_POPULATION_RUNTIME_CATEGORIES)]);
    this._cellCount = cellCount;
    const cellCapacity = cellCount * cellCount;
    this._cells = new Array(cellCapacity);
    this._residentSlotByCell = new Int32Array(cellCapacity);
    this._pending = new Array(cellCapacity);
    this._pendingCells = new Uint32Array(cellCapacity);
    this._pendingSlotByCell = new Int32Array(cellCapacity);
    this._desiredCells = new Uint32Array(cellCapacity);
    this._desiredDistanceSquared = new Float64Array(cellCapacity);
    this._desiredEpochByCell = new Uint32Array(cellCapacity);
    this._precompiledInstancesByCell = options.precompiledInstances
      ? groupPrecompiledInstancesByCell(options.precompiledInstances, this._categories, cellCount)
      : undefined;
    this._groundedInstanceOverrides = options.groundedInstanceOverrides;
    this._omitEmptyPrecompiledCells = options.omitEmptyPrecompiledCells ?? false;
    this._residentCellRadius = residentCellRadius;
    this._residentCellRadiusCoversWorld = residentCellRadius >= cellCount - 1;
    this._maximumNewCellsPerUpdate = maximumNewCellsPerUpdate;
    this._maximumReleasedCellsPerUpdate = maximumReleasedCellsPerUpdate;
    this._maximumCandidateEvaluationsPerUpdate = maximumCandidateEvaluationsPerUpdate;
    this._maximumCompilationMillisecondsPerUpdate = maximumCompilationMillisecondsPerUpdate;
    this._activeCellRange = options.activeCellRange ? Object.freeze({ ...options.activeCellRange }) : undefined;
  }

  /**
   * Current resident Cells and their owned resources.
   * @returns A stable allocation-free view updated in place when Cell ownership changes.
   */
  get cells(): readonly SeedWorldResidentPopulationCell<TResource>[] {
    return this._residentCells;
  }

  /**
   * Number of resident Cells.
   * @returns Current resident Cell count.
   */
  get size(): number {
    return this._residentCells.length;
  }

  /**
   * Whether the current camera Cell has admitted every desired resource and released every stale resource.
   * @returns `true` when another update in the same camera Cell cannot change residency.
   */
  get isResidencySettled(): boolean {
    return this._residencySettled;
  }

  /**
   * Replaces Worker-baked exact instances while rebuilding only explicitly dirty resident Cells.
   * Resource creation is staged first, so a failed Cell cannot disturb the currently published set.
   * @param instances Complete next immutable instance index.
   * @param dirtyCellIds Stable `cell-X-Z` identities whose contents may have changed.
   */
  replacePrecompiledInstances(
    instances: readonly SeedWorldPopulationInstance[],
    dirtyCellIds: ReadonlySet<string>
  ): void {
    if (this._destroyed) throw new Error("Seed World Population Cell owner is destroyed");
    if (!this._precompiledInstancesByCell) {
      throw new Error("Seed World Population Cell owner has no precompiled instance index");
    }
    const nextByCell = groupPrecompiledInstancesByCell(instances, this._categories, this._cellCount);
    const staged = new Map<number, SeedWorldResidentPopulationCell<TResource> | null>();
    try {
      for (const key of dirtyCellIds) {
        const cellIndex = requirePopulationCellIndex(key, this._cellCount);
        const current = this._cells[cellIndex];
        if (!current) {
          continue;
        }
        if (this._omitEmptyPrecompiledCells && !nextByCell[cellIndex]) {
          staged.set(cellIndex, null);
          continue;
        }
        const cellX = cellIndex % this._cellCount;
        const cellZ = Math.floor(cellIndex / this._cellCount);
        const data = finalizeSeedWorldPopulationRuntimeCell(
          this._plan,
          this._fields,
          cellX,
          cellZ,
          nextByCell[cellIndex] ?? EMPTY_PRECOMPILED_POPULATION_INSTANCES,
          this._groundedInstanceOverrides
        );
        staged.set(cellIndex, { data, resource: this._resources.create(data) });
      }
    } catch (error) {
      for (const cell of staged.values()) {
        if (cell) this._resources.dispose(cell.resource);
      }
      throw error;
    }
    this._precompiledInstancesByCell = nextByCell;
    for (const [cellIndex, next] of staged) {
      const previous = this._cells[cellIndex];
      if (previous) {
        this._resources.dispose(previous.resource);
      }
      if (next) {
        this._setResidentCell(cellIndex, next);
      } else {
        this._removeResidentCell(cellIndex);
      }
    }
    this._residencySettled = false;
  }

  /**
   * Re-grounds dirty resident precompiled Cells while retaining their render resources and LOD state.
   * @param dirtyCellIds Stable `cell-X-Z` identities intersecting the changed height field.
   * @returns Nothing after every resident match exposes transforms sampled from the current fields.
   * @throws If this owner has no precompiled instances or its resource factory cannot refresh grounding.
   */
  refreshPrecompiledGrounding(dirtyCellIds: ReadonlySet<string>): void {
    if (this._destroyed) throw new Error("Seed World Population Cell owner is destroyed");
    const precompiledInstancesByCell = this._precompiledInstancesByCell;
    if (!precompiledInstancesByCell) {
      throw new Error("Seed World Population Cell owner has no precompiled instance index");
    }
    const refreshGrounding = this._resources.refreshGrounding;
    if (!refreshGrounding) {
      throw new Error("Seed World Population Cell resources do not support grounding refresh");
    }
    for (const key of dirtyCellIds) {
      const cellIndex = requirePopulationCellIndex(key, this._cellCount);
      const current = this._cells[cellIndex];
      if (!current) {
        continue;
      }
      const cellX = cellIndex % this._cellCount;
      const cellZ = Math.floor(cellIndex / this._cellCount);
      const nextData = finalizeSeedWorldPopulationRuntimeCell(
        this._plan,
        this._fields,
        cellX,
        cellZ,
        precompiledInstancesByCell[cellIndex] ?? EMPTY_PRECOMPILED_POPULATION_INSTANCES,
        this._groundedInstanceOverrides
      );
      refreshGrounding(current.resource, nextData);
      this._setResidentCell(cellIndex, { data: nextData, resource: current.resource });
    }
  }

  /**
   * Completes the nearest Cell synchronously for a pre-interaction visual warmup.
   * @param worldX World-space X used to choose the one nearest Cell.
   * @param worldZ World-space Z used to choose the one nearest Cell.
   * @returns The retained Cell, or `undefined` when the requested position lies outside this owner's inspection range.
   * @throws If called after destruction or a Cell resource cannot be created.
   */
  primeNearest(worldX: number, worldZ: number): SeedWorldResidentPopulationCell<TResource> | undefined {
    if (this._destroyed) {
      throw new Error("Seed World Population Cell owner is destroyed");
    }
    const cellX = worldToCellCoordinate(
      this._plan.sizeMetres,
      worldX - seedWorldOriginX(this._fields) - this._plan.sizeMetres / 2
    );
    const cellZ = worldToCellCoordinate(
      this._plan.sizeMetres,
      worldZ - seedWorldOriginZ(this._fields) - this._plan.sizeMetres / 2
    );
    if (
      this._activeCellRange &&
      (cellX < this._activeCellRange.minimumX ||
        cellX > this._activeCellRange.maximumX ||
        cellZ < this._activeCellRange.minimumZ ||
        cellZ > this._activeCellRange.maximumZ)
    ) {
      return undefined;
    }
    const cellIndex = cellZ * this._cellCount + cellX;
    if (this._omitEmptyPrecompiledCells && !this._precompiledInstancesByCell?.[cellIndex]) {
      return undefined;
    }
    const existing = this._cells[cellIndex];
    if (existing) {
      return existing;
    }
    this._removePendingCell(cellIndex);
    const data = this._precompiledInstancesByCell
      ? finalizeSeedWorldPopulationRuntimeCell(
          this._plan,
          this._fields,
          cellX,
          cellZ,
          this._precompiledInstancesByCell[cellIndex] ?? EMPTY_PRECOMPILED_POPULATION_INSTANCES,
          this._groundedInstanceOverrides
        )
      : new SeedWorldPopulationRuntimeCellCompiler(
          requirePopulationGenerator(this._plan),
          this._fields,
          cellX,
          cellZ,
          this._categories
        ).finish();
    const cell = { data, resource: this._resources.create(data) };
    this._setResidentCell(cellIndex, cell);
    return cell;
  }

  /**
   * Reconciles Cell residency around one camera position.
   * @param worldX Camera world X coordinate.
   * @param worldZ Camera world Z coordinate.
   * @returns Current resident Cells.
   * @throws If called after destruction or a Cell resource cannot be created.
   */
  update(worldX: number, worldZ: number): readonly SeedWorldResidentPopulationCell<TResource>[] {
    if (this._destroyed) {
      throw new Error("Seed World Population Cell owner is destroyed");
    }
    const centerCellX = worldToCellCoordinate(
      this._plan.sizeMetres,
      worldX - seedWorldOriginX(this._fields) - this._plan.sizeMetres / 2
    );
    const centerCellZ = worldToCellCoordinate(
      this._plan.sizeMetres,
      worldZ - seedWorldOriginZ(this._fields) - this._plan.sizeMetres / 2
    );
    if (this._residencySettled) {
      if (
        this._residentCellRadiusCoversWorld ||
        (centerCellX === this._centerCellX && centerCellZ === this._centerCellZ)
      ) {
        this._centerCellX = centerCellX;
        this._centerCellZ = centerCellZ;
        return this.cells;
      }
    }
    this._centerCellX = centerCellX;
    this._centerCellZ = centerCellZ;
    this._residencySettled = false;
    const desiredCount = this._collectDesiredCells(worldX, worldZ, centerCellX, centerCellZ);
    if (this._precompiledInstancesByCell) {
      return this._updatePrecompiled(desiredCount);
    }
    for (let pendingSlot = this._pendingCount - 1; pendingSlot >= 0; pendingSlot--) {
      const cellIndex = this._pendingCells[pendingSlot]!;
      if (this._desiredEpochByCell[cellIndex] !== this._desiredEpoch) {
        this._removePendingCell(cellIndex);
      }
    }
    for (let desiredIndex = 0; desiredIndex < desiredCount; desiredIndex++) {
      if (this._pendingCount >= this._maximumNewCellsPerUpdate) {
        break;
      }
      const cellIndex = this._desiredCells[desiredIndex]!;
      if (this._cells[cellIndex] || this._pending[cellIndex]) {
        continue;
      }
      const cellX = cellIndex % this._cellCount;
      const cellZ = Math.floor(cellIndex / this._cellCount);
      this._addPendingCell(
        cellIndex,
        new SeedWorldPopulationRuntimeCellCompiler(
          requirePopulationGenerator(this._plan),
          this._fields,
          cellX,
          cellZ,
          this._categories
        )
      );
    }
    const created = this._createdCells;
    created.length = 0;
    try {
      let remainingCandidates = this._maximumCandidateEvaluationsPerUpdate;
      const hasDeadline = this._maximumCompilationMillisecondsPerUpdate !== Number.POSITIVE_INFINITY;
      const deadline = hasDeadline ? performance.now() + this._maximumCompilationMillisecondsPerUpdate : 0;
      let advanced = true;
      while (
        advanced &&
        created.length < this._maximumNewCellsPerUpdate &&
        remainingCandidates > 0 &&
        (!hasDeadline || performance.now() < deadline)
      ) {
        advanced = false;
        for (let desiredIndex = 0; desiredIndex < desiredCount; desiredIndex++) {
          if (
            created.length >= this._maximumNewCellsPerUpdate ||
            remainingCandidates <= 0 ||
            (hasDeadline && performance.now() >= deadline)
          ) {
            break;
          }
          const cellIndex = this._desiredCells[desiredIndex]!;
          const pending = this._pending[cellIndex];
          if (!pending) {
            continue;
          }
          const pendingCount =
            remainingCandidates === Number.POSITIVE_INFINITY
              ? Number.POSITIVE_INFINITY
              : Math.max(1, Math.min(remainingCandidates, 32));
          advanced = true;
          if (!pending.advance(pendingCount)) {
            if (remainingCandidates !== Number.POSITIVE_INFINITY) {
              remainingCandidates -= pendingCount;
            }
            continue;
          }
          const data = pending.finish();
          created.push({ data, resource: this._resources.create(data) });
          this._removePendingCell(cellIndex);
          if (remainingCandidates !== Number.POSITIVE_INFINITY) {
            remainingCandidates -= pendingCount;
          }
        }
      }
    } catch (error) {
      for (let index = 0; index < created.length; index++) {
        this._resources.dispose(created[index]!.resource);
      }
      throw error;
    }
    for (let index = 0; index < created.length; index++) {
      const cell = created[index]!;
      this._setResidentCell(this._cellIndex(cell.data.cellX, cell.data.cellZ), cell);
    }
    this._releaseUndesiredCells();
    this._residencySettled = this._pendingCount === 0 && this._residencyMatches(desiredCount);
    return this.cells;
  }

  private _updatePrecompiled(desiredCount: number): readonly SeedWorldResidentPopulationCell<TResource>[] {
    const created = this._createdCells;
    created.length = 0;
    try {
      for (let desiredIndex = 0; desiredIndex < desiredCount; desiredIndex++) {
        if (created.length >= this._maximumNewCellsPerUpdate) {
          break;
        }
        const cellIndex = this._desiredCells[desiredIndex]!;
        if (this._cells[cellIndex]) {
          continue;
        }
        const cellX = cellIndex % this._cellCount;
        const cellZ = Math.floor(cellIndex / this._cellCount);
        const data = finalizeSeedWorldPopulationRuntimeCell(
          this._plan,
          this._fields,
          cellX,
          cellZ,
          this._precompiledInstancesByCell![cellIndex] ?? EMPTY_PRECOMPILED_POPULATION_INSTANCES,
          this._groundedInstanceOverrides
        );
        created.push({ data, resource: this._resources.create(data) });
      }
    } catch (error) {
      for (let index = 0; index < created.length; index++) {
        this._resources.dispose(created[index]!.resource);
      }
      throw error;
    }
    for (let index = 0; index < created.length; index++) {
      const cell = created[index]!;
      this._setResidentCell(this._cellIndex(cell.data.cellX, cell.data.cellZ), cell);
    }
    this._releaseUndesiredCells();
    this._residencySettled = this._residencyMatches(desiredCount);
    return this.cells;
  }

  private _collectDesiredCells(worldX: number, worldZ: number, centerX: number, centerZ: number): number {
    this._desiredEpoch = (this._desiredEpoch + 1) >>> 0;
    if (this._desiredEpoch === 0) {
      this._desiredEpochByCell.fill(0);
      this._desiredEpoch = 1;
    }
    let minimumX = Math.max(0, centerX - this._residentCellRadius);
    let maximumX = Math.min(this._cellCount - 1, centerX + this._residentCellRadius);
    let minimumZ = Math.max(0, centerZ - this._residentCellRadius);
    let maximumZ = Math.min(this._cellCount - 1, centerZ + this._residentCellRadius);
    const activeCellRange = this._activeCellRange;
    if (activeCellRange) {
      minimumX = Math.max(minimumX, activeCellRange.minimumX);
      maximumX = Math.min(maximumX, activeCellRange.maximumX);
      minimumZ = Math.max(minimumZ, activeCellRange.minimumZ);
      maximumZ = Math.min(maximumZ, activeCellRange.maximumZ);
    }
    if (minimumX > maximumX || minimumZ > maximumZ) {
      return 0;
    }
    const worldMinimumX = seedWorldOriginX(this._fields),
      worldMinimumZ = seedWorldOriginZ(this._fields);
    const precompiledInstancesByCell = this._precompiledInstancesByCell;
    let desiredCount = 0;
    for (let cellZ = minimumZ; cellZ <= maximumZ; cellZ++) {
      const centerWorldZ = worldMinimumZ + (cellZ + 0.5) * SEED_WORLD_POPULATION_CELL_METRES;
      for (let cellX = minimumX; cellX <= maximumX; cellX++) {
        const cellIndex = this._cellIndex(cellX, cellZ);
        if (this._omitEmptyPrecompiledCells && !precompiledInstancesByCell?.[cellIndex]) {
          continue;
        }
        const centerWorldX = worldMinimumX + (cellX + 0.5) * SEED_WORLD_POPULATION_CELL_METRES;
        const offsetX = centerWorldX - worldX;
        const offsetZ = centerWorldZ - worldZ;
        this._desiredCells[desiredCount++] = cellIndex;
        this._desiredDistanceSquared[cellIndex] = offsetX * offsetX + offsetZ * offsetZ;
        this._desiredEpochByCell[cellIndex] = this._desiredEpoch;
      }
    }
    sortPopulationCellsByDistance(this._desiredCells, desiredCount, this._desiredDistanceSquared);
    return desiredCount;
  }

  private _addPendingCell(cellIndex: number, compiler: SeedWorldPopulationRuntimeCellCompiler): void {
    this._pending[cellIndex] = compiler;
    this._pendingCells[this._pendingCount] = cellIndex;
    this._pendingSlotByCell[cellIndex] = ++this._pendingCount;
  }

  private _removePendingCell(cellIndex: number): void {
    const slotMarker = this._pendingSlotByCell[cellIndex]!;
    if (slotMarker === 0) {
      return;
    }
    const slot = slotMarker - 1;
    const lastSlot = --this._pendingCount;
    if (slot !== lastSlot) {
      const movedCellIndex = this._pendingCells[lastSlot]!;
      this._pendingCells[slot] = movedCellIndex;
      this._pendingSlotByCell[movedCellIndex] = slot + 1;
    }
    this._pending[cellIndex] = undefined;
    this._pendingSlotByCell[cellIndex] = 0;
  }

  private _setResidentCell(cellIndex: number, cell: SeedWorldResidentPopulationCell<TResource>): void {
    const slotMarker = this._residentSlotByCell[cellIndex]!;
    this._cells[cellIndex] = cell;
    if (slotMarker === 0) {
      this._residentCells.push(cell);
      this._residentSlotByCell[cellIndex] = this._residentCells.length;
    } else {
      this._residentCells[slotMarker - 1] = cell;
    }
  }

  private _removeResidentCell(cellIndex: number): void {
    const slotMarker = this._residentSlotByCell[cellIndex]!;
    if (slotMarker === 0) {
      return;
    }
    const slot = slotMarker - 1;
    const lastSlot = this._residentCells.length - 1;
    for (let shiftedSlot = slot; shiftedSlot < lastSlot; shiftedSlot++) {
      const shifted = this._residentCells[shiftedSlot + 1]!;
      this._residentCells[shiftedSlot] = shifted;
      this._residentSlotByCell[this._cellIndex(shifted.data.cellX, shifted.data.cellZ)] = shiftedSlot + 1;
    }
    this._residentCells.length = lastSlot;
    this._cells[cellIndex] = undefined;
    this._residentSlotByCell[cellIndex] = 0;
  }

  private _releaseUndesiredCells(): void {
    let released = 0;
    let residentSlot = 0;
    while (residentSlot < this._residentCells.length && released < this._maximumReleasedCellsPerUpdate) {
      const cell = this._residentCells[residentSlot]!;
      const cellIndex = this._cellIndex(cell.data.cellX, cell.data.cellZ);
      if (this._desiredEpochByCell[cellIndex] === this._desiredEpoch) {
        residentSlot++;
        continue;
      }
      this._resources.dispose(cell.resource);
      this._removeResidentCell(cellIndex);
      released++;
    }
  }

  private _residencyMatches(desiredCount: number): boolean {
    if (this._residentCells.length !== desiredCount) {
      return false;
    }
    for (let index = 0; index < this._residentCells.length; index++) {
      const cell = this._residentCells[index]!;
      if (this._desiredEpochByCell[this._cellIndex(cell.data.cellX, cell.data.cellZ)] !== this._desiredEpoch) {
        return false;
      }
    }
    return true;
  }

  private _cellIndex(cellX: number, cellZ: number): number {
    return cellZ * this._cellCount + cellX;
  }

  /**
   * Releases every resident Cell resource exactly once.
   * @returns Nothing.
   */
  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this._pending.fill(undefined);
    this._pendingCount = 0;
    this._pendingSlotByCell.fill(0);
    for (let index = 0; index < this._residentCells.length; index++) {
      this._resources.dispose(this._residentCells[index]!.resource);
    }
    this._cells.fill(undefined);
    this._residentCells.length = 0;
    this._residentSlotByCell.fill(0);
    this._createdCells.length = 0;
    this._residencySettled = true;
  }
}

function groupPrecompiledInstancesByCell(
  instances: readonly SeedWorldPopulationInstance[],
  categories: readonly SeedWorldPopulationRuntimeCategory[],
  cellCount: number
): PrecompiledPopulationCells {
  const allowedCategories = new Set(categories);
  const ids = new Set<string>();
  const grouped = new Array<SeedWorldPopulationInstance[] | undefined>(cellCount * cellCount);
  for (const instance of instances) {
    if (!allowedCategories.has(instance.category)) {
      continue;
    }
    const cellIndex = populationCellIndex(instance.sourceCellId, cellCount);
    if (cellIndex < 0) {
      throw new RangeError(`Population instance ${instance.id} has an invalid source Cell`);
    }
    if (ids.has(instance.id)) {
      throw new RangeError(`Population instance id ${instance.id} is duplicated`);
    }
    ids.add(instance.id);
    const cell = grouped[cellIndex];
    if (cell) {
      cell.push(instance);
    } else {
      grouped[cellIndex] = [instance];
    }
  }
  for (let cellIndex = 0; cellIndex < grouped.length; cellIndex++) {
    const cell = grouped[cellIndex];
    if (cell) {
      Object.freeze(cell);
    }
  }
  return Object.freeze(grouped);
}

/** Grounds one exact Producer instance against the currently published terrain fields. */
export function groundSeedWorldPopulationInstance(
  plan: SeedWorldPopulationWorld,
  fields: SeedWorldFields,
  producerInstance: SeedWorldPopulationInstance
): SeedWorldGroundedPopulationInstance {
  const worldX = fields.worldOrigin
    ? fields.worldOrigin[0] + producerInstance.normalizedPosition.x * plan.sizeMetres
    : (producerInstance.normalizedPosition.x - 0.5) * plan.sizeMetres;
  const worldZ = fields.worldOrigin
    ? fields.worldOrigin[1] + producerInstance.normalizedPosition.y * plan.sizeMetres
    : (producerInstance.normalizedPosition.y - 0.5) * plan.sizeMetres;
  const worldY = sampleSeedWorldHeight(fields, worldX, worldZ);
  if (worldY === undefined) throw new RangeError(`Population instance ${producerInstance.id} is outside final terrain`);
  const surfaceNormal = sampleFinalSurfaceNormal(fields, worldX, worldZ, worldY);
  const rotation =
    producerInstance.category === "tree" || producerInstance.category === "shrub"
      ? worldUpYawQuaternion(producerInstance.yawRadians)
      : groundedYawQuaternion(surfaceNormal, producerInstance.yawRadians);
  return Object.freeze({
    producerInstance,
    position: Object.freeze([worldX, worldY, worldZ] as const),
    surfaceNormal,
    rotation
  });
}

function worldUpYawQuaternion(yawRadians: number): readonly [number, number, number, number] {
  const halfYaw = yawRadians * 0.5;
  return Object.freeze([0, Math.sin(halfYaw), 0, Math.cos(halfYaw)] as const);
}

function sampleFinalSurfaceNormal(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  centerHeight: number
): readonly [number, number, number] {
  const originX = seedWorldOriginX(fields),
    originZ = seedWorldOriginZ(fields);
  const step = fields.sizeMetres / (fields.heightResolution - 1);
  const leftX = Math.max(originX, worldX - step);
  const rightX = Math.min(originX + fields.sizeMetres, worldX + step);
  const nearZ = Math.max(originZ, worldZ - step);
  const farZ = Math.min(originZ + fields.sizeMetres, worldZ + step);
  const left = sampleSeedWorldHeight(fields, leftX, worldZ) ?? centerHeight;
  const right = sampleSeedWorldHeight(fields, rightX, worldZ) ?? centerHeight;
  const near = sampleSeedWorldHeight(fields, worldX, nearZ) ?? centerHeight;
  const far = sampleSeedWorldHeight(fields, worldX, farZ) ?? centerHeight;
  const gradientX = (right - left) / Math.max(rightX - leftX, Number.EPSILON);
  const gradientZ = (far - near) / Math.max(farZ - nearZ, Number.EPSILON);
  const inverseLength = 1 / Math.hypot(gradientX, 1, gradientZ);
  return Object.freeze([-gradientX * inverseLength, inverseLength, -gradientZ * inverseLength] as const);
}

function groundedYawQuaternion(
  normal: readonly [number, number, number],
  yawRadians: number
): readonly [number, number, number, number] {
  const alignLength = Math.hypot(normal[2], -normal[0], 1 + normal[1]);
  let alignX: number;
  let alignZ: number;
  let alignW: number;
  if (alignLength <= Number.EPSILON) {
    alignX = 1;
    alignZ = 0;
    alignW = 0;
  } else {
    const inverseAlignLength = 1 / alignLength;
    alignX = normal[2] * inverseAlignLength;
    alignZ = -normal[0] * inverseAlignLength;
    alignW = (1 + normal[1]) * inverseAlignLength;
  }
  const halfYaw = yawRadians * 0.5;
  const yawY = Math.sin(halfYaw);
  const yawW = Math.cos(halfYaw);
  return Object.freeze([
    alignX * yawW - alignZ * yawY,
    alignW * yawY,
    alignX * yawY + alignZ * yawW,
    alignW * yawW
  ] as const);
}

function worldToCellCoordinate(sizeMetres: number, worldCoordinate: number): number {
  const cellCount = Math.ceil(sizeMetres / SEED_WORLD_POPULATION_CELL_METRES);
  return clampCell(Math.floor((worldCoordinate + sizeMetres * 0.5) / SEED_WORLD_POPULATION_CELL_METRES), cellCount);
}

function sortPopulationCellsByDistance(cells: Uint32Array, count: number, distanceSquared: Float64Array): void {
  for (let root = Math.floor(count * 0.5) - 1; root >= 0; root--) {
    siftPopulationCellHeap(cells, root, count, distanceSquared);
  }
  for (let end = count - 1; end > 0; end--) {
    const farthest = cells[0]!;
    cells[0] = cells[end]!;
    cells[end] = farthest;
    siftPopulationCellHeap(cells, 0, end, distanceSquared);
  }
}

function siftPopulationCellHeap(cells: Uint32Array, root: number, count: number, distanceSquared: Float64Array): void {
  const rootCell = cells[root]!;
  while (true) {
    const left = root * 2 + 1;
    if (left >= count) {
      break;
    }
    const right = left + 1;
    let farthest = left;
    if (right < count && populationCellIsFarther(cells[right]!, cells[left]!, distanceSquared)) {
      farthest = right;
    }
    if (!populationCellIsFarther(cells[farthest]!, rootCell, distanceSquared)) {
      break;
    }
    cells[root] = cells[farthest]!;
    root = farthest;
  }
  cells[root] = rootCell;
}

function populationCellIsFarther(left: number, right: number, distanceSquared: Float64Array): boolean {
  const leftDistance = distanceSquared[left]!;
  const rightDistance = distanceSquared[right]!;
  return leftDistance > rightDistance || (leftDistance === rightDistance && left > right);
}

function clampCell(value: number, cellCount: number): number {
  return Math.min(cellCount - 1, Math.max(0, value));
}

function populationCellIndex(cellId: string, cellCount: number): number {
  const match = /^cell-(\d+)-(\d+)$/.exec(cellId);
  if (!match) {
    return -1;
  }
  const cellX = Number(match[1]);
  const cellZ = Number(match[2]);
  if (cellX >= cellCount || cellZ >= cellCount) {
    return -1;
  }
  return cellZ * cellCount + cellX;
}

function requirePopulationCellIndex(cellId: string, cellCount: number): number {
  const cellIndex = populationCellIndex(cellId, cellCount);
  if (cellIndex < 0) {
    throw new RangeError(`Seed World Population Cell id '${cellId}' is invalid`);
  }
  return cellIndex;
}

function hashGroundedInstance(hash: number, instance: SeedWorldGroundedPopulationInstance): number {
  hash = hashText(hash, instance.producerInstance.id);
  const position = instance.position;
  hash = hashQuantizedFloat(hash, position[0]);
  hash = hashQuantizedFloat(hash, position[1]);
  hash = hashQuantizedFloat(hash, position[2]);
  const surfaceNormal = instance.surfaceNormal;
  hash = hashQuantizedFloat(hash, surfaceNormal[0]);
  hash = hashQuantizedFloat(hash, surfaceNormal[1]);
  hash = hashQuantizedFloat(hash, surfaceNormal[2]);
  const rotation = instance.rotation;
  hash = hashQuantizedFloat(hash, rotation[0]);
  hash = hashQuantizedFloat(hash, rotation[1]);
  hash = hashQuantizedFloat(hash, rotation[2]);
  hash = hashQuantizedFloat(hash, rotation[3]);
  const scale = instance.producerInstance.scale;
  hash = hashQuantizedFloat(hash, scale[0]);
  hash = hashQuantizedFloat(hash, scale[1]);
  hash = hashQuantizedFloat(hash, scale[2]);
  hash = hashQuantizedFloat(hash, instance.producerInstance.yawRadians);
  hash = hashUint32(hash, instance.producerInstance.prototypeRank);
  return hash;
}

function hashQuantizedFloat(hash: number, value: number): number {
  return hashUint32(hash, Math.round(value * 1_000_000));
}

function hashText(hash: number, value: string): number {
  for (let index = 0; index < value.length; index++) {
    hash = hashUint32(hash, value.charCodeAt(index));
  }
  return hash;
}

function hashUint32(hash: number, value: number): number {
  return Math.imul(hash ^ value, 0x0100_0193) >>> 0;
}
