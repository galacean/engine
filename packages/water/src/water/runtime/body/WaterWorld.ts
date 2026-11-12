/** Bounded broad phase and deterministic overlap selection for active water bodies. */
import type { Vector3 } from "@galacean/engine-math";
import type { WaterSurfaceInteractionSink } from "../interaction/WaterSurfaceInteractionSink";
import type { WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import {
  createWaterSurfaceSample,
  resetWaterSurfaceSample,
  type WaterSurfaceProvider,
  type WaterSurfaceSample
} from "../query/WaterSurfaceProvider";
import { containsWaterBounds, type WaterBodyRuntime } from "./WaterBodyRuntime";
import { createWaterVolumeSample, resetWaterVolumeSample, type WaterVolumeSample } from "./WaterVolumeProvider";
import { WaterWorldSpatialIndex, type WaterWorldSpatialIndexOptions } from "./WaterWorldSpatialIndex";

const DEFAULT_SPATIAL_INDEX_MINIMUM_BODY_COUNT = 64;
const DEFAULT_SPATIAL_INDEX_CELL_SIZE = 256;
const DEFAULT_SPATIAL_INDEX_MAXIMUM_CELLS_PER_BODY = 256;

interface RegisteredWaterBody {
  body: WaterBodyRuntime;
  readonly bounds: WaterBodyRuntime["bounds"];
  interaction: WaterWorldInteractionChannels;
  routeRevision: number;
  readonly sample: WaterSurfaceSample;
  readonly volumeSample: WaterVolumeSample;
  readonly registrationState: WaterWorldRegistrationState;
}

interface WaterWorldSurfaceQueryContext {
  active: boolean;
  channel: keyof WaterWorldInteractionChannels;
  worldPosition: Vector3 | undefined;
  outSample: WaterSurfaceSample | undefined;
  bodyId: string | undefined;
  bestPriority: number;
  bestHeight: number;
  bestBodyId: string;
  bestEntry: RegisteredWaterBody | undefined;
}

interface WaterWorldVolumeQueryContext {
  active: boolean;
  worldPosition: Vector3 | undefined;
  outSample: WaterWorldVolumeSample | undefined;
  bestPriority: number;
  bestHeight: number;
  bestBodyId: string;
}

export interface WaterWorldInteractionChannels {
  readonly query: boolean;
  readonly buoyancy: boolean;
  readonly wake: boolean;
}

interface WaterWorldRegistrationState {
  active: boolean;
}

export type WaterWorldSurfaceConsumerPurpose = "query" | "buoyancy";
export type WaterWorldConsumerPurpose = WaterWorldSurfaceConsumerPurpose | "wake";

interface WaterWorldConsumerLeaseState {
  active: boolean;
  readonly bodyId: string;
  readonly purpose: WaterWorldConsumerPurpose;
}

const DEFAULT_INTERACTION_CHANNELS: WaterWorldInteractionChannels = Object.freeze({
  query: true,
  buoyancy: false,
  wake: false
});

function validateAndFreezeInteractionChannels(
  body: WaterBodyRuntime,
  interaction: WaterWorldInteractionChannels
): WaterWorldInteractionChannels {
  if (
    !interaction ||
    typeof interaction.query !== "boolean" ||
    typeof interaction.buoyancy !== "boolean" ||
    typeof interaction.wake !== "boolean"
  ) {
    throw new Error(`Water body '${body.id}' interaction channels must be boolean values.`);
  }
  if (!interaction.query && (interaction.buoyancy || interaction.wake)) {
    throw new Error(`Water body '${body.id}' cannot enable buoyancy or wake without query routing.`);
  }
  if (interaction.wake && !body.interactionSink) {
    throw new Error(`Water body '${body.id}' cannot enable wake routing without an interaction sink.`);
  }
  return Object.freeze({
    query: interaction.query,
    buoyancy: interaction.buoyancy,
    wake: interaction.wake
  });
}

function compareWaterBodyOrder(left: WaterBodyRuntime, right: WaterBodyRuntime): number {
  return right.priority - left.priority || left.id.localeCompare(right.id);
}

export interface WaterWorldVolumeSample extends WaterVolumeSample {
  priority: number;
  opticalProfile?: WaterOpticalProfile;
}

/** Caller-owned status for one WaterWorld broad-phase and exact-query traversal. */
export interface WaterWorldQueryStatus {
  hit: boolean;
  complete: boolean;
}

export function createWaterWorldQueryStatus(): WaterWorldQueryStatus {
  return {
    hit: false,
    complete: false
  };
}

export function resetWaterWorldQueryStatus(status: WaterWorldQueryStatus): void {
  status.hit = false;
  status.complete = false;
}

export function createWaterWorldVolumeSample(): WaterWorldVolumeSample {
  return {
    ...createWaterVolumeSample(),
    priority: Number.NEGATIVE_INFINITY,
    opticalProfile: undefined
  };
}

export function resetWaterWorldVolumeSample(sample: WaterWorldVolumeSample): void {
  resetWaterVolumeSample(sample);
  sample.priority = Number.NEGATIVE_INFINITY;
  sample.opticalProfile = undefined;
}

export interface WaterWorldOptions {
  /**
   * The index activates only after the configured body-count threshold. Small
   * scenes keep the simpler ordered linear path.
   */
  readonly spatialIndex?: Partial<WaterWorldSpatialIndexOptions> & {
    readonly minimumBodyCount?: number;
  };
}

export interface WaterWorldRegistration {
  readonly bodyId: string;
  readonly interaction: WaterWorldInteractionChannels;
  readonly routeRevision: number;
  readonly active: boolean;
  replace(body: WaterBodyRuntime, interaction: WaterWorldInteractionChannels): void;
  destroy(): void;
}

interface WaterWorldConsumerLeaseBase {
  readonly active: boolean;
  destroy(): void;
}

export interface WaterWorldSurfaceConsumerLease extends WaterWorldConsumerLeaseBase {
  readonly purpose: WaterWorldSurfaceConsumerPurpose;
  readonly surfaceProvider: WaterSurfaceProvider;
}

export interface WaterWorldWakeConsumerLease extends WaterWorldConsumerLeaseBase {
  readonly purpose: "wake";
  readonly interactionSink: WaterSurfaceInteractionSink;
}

export class WaterWorld implements WaterSurfaceProvider {
  private readonly _entries: RegisteredWaterBody[] = [];
  private readonly _consumerLeases = new Set<WaterWorldConsumerLeaseState>();
  private readonly _bodyRouteRevisions = new Map<string, number>();
  private readonly _spatialIndexMinimumBodyCount: number;
  private readonly _spatialIndexOptions: WaterWorldSpatialIndexOptions;
  private _spatialIndex?: WaterWorldSpatialIndex<RegisteredWaterBody>;
  private readonly _wakeSurfaceSample = createWaterSurfaceSample();
  private readonly _surfaceQueryContext: WaterWorldSurfaceQueryContext = {
    active: false,
    channel: "query",
    worldPosition: undefined,
    outSample: undefined,
    bodyId: undefined,
    bestPriority: Number.NEGATIVE_INFINITY,
    bestHeight: Number.NEGATIVE_INFINITY,
    bestBodyId: "",
    bestEntry: undefined
  };
  private readonly _volumeQueryContext: WaterWorldVolumeQueryContext = {
    active: false,
    worldPosition: undefined,
    outSample: undefined,
    bestPriority: Number.NEGATIVE_INFINITY,
    bestHeight: Number.NEGATIVE_INFINITY,
    bestBodyId: ""
  };
  private readonly _surfaceCandidateVisitor = (entry: RegisteredWaterBody): boolean =>
    this._visitSurfaceCandidate(entry);
  private readonly _volumeCandidateVisitor = (entry: RegisteredWaterBody): boolean => this._visitVolumeCandidate(entry);
  readonly buoyancySurfaceProvider: WaterSurfaceProvider;
  readonly wakeInteractionSink: WaterSurfaceInteractionSink;

  constructor(options: WaterWorldOptions = {}) {
    const spatialIndexMinimumBodyCount =
      options.spatialIndex?.minimumBodyCount ?? DEFAULT_SPATIAL_INDEX_MINIMUM_BODY_COUNT;
    if (!Number.isInteger(spatialIndexMinimumBodyCount) || spatialIndexMinimumBodyCount <= 0) {
      throw new RangeError("WaterWorld spatial-index minimum body count must be a positive integer.");
    }
    this._spatialIndexMinimumBodyCount = spatialIndexMinimumBodyCount;
    this._spatialIndexOptions = Object.freeze({
      cellSize: options.spatialIndex?.cellSize ?? DEFAULT_SPATIAL_INDEX_CELL_SIZE,
      maximumCellsPerBody: options.spatialIndex?.maximumCellsPerBody ?? DEFAULT_SPATIAL_INDEX_MAXIMUM_CELLS_PER_BODY
    });
    this.buoyancySurfaceProvider = Object.freeze({
      sampleSurface: (worldPosition: Vector3, outSample: WaterSurfaceSample): boolean =>
        this._sampleSurfaceForChannel("buoyancy", worldPosition, outSample) !== undefined
    });
    this.wakeInteractionSink = Object.freeze({
      registerInteraction: (
        worldPosition: Vector3,
        surfaceNormal: Vector3,
        relativeVelocity: Vector3,
        radius: number,
        submergedRatio: number,
        enteredWater: boolean
      ): boolean => {
        const entry = this._sampleSurfaceForChannel("wake", worldPosition, this._wakeSurfaceSample);
        const sink = entry?.body.interactionSink;
        if (!sink) return false;
        const accepted = sink.registerInteraction(
          worldPosition,
          surfaceNormal,
          relativeVelocity,
          radius,
          submergedRatio,
          enteredWater
        );
        return accepted;
      }
    });
  }

  register(
    body: WaterBodyRuntime,
    interaction: WaterWorldInteractionChannels = DEFAULT_INTERACTION_CHANNELS
  ): WaterWorldRegistration {
    if (this._entries.some((entry) => entry.body.id === body.id)) {
      throw new Error(`Water body '${body.id}' is already registered.`);
    }
    const frozenInteraction = validateAndFreezeInteractionChannels(body, interaction);
    const registrationState: WaterWorldRegistrationState = { active: true };
    const entry: RegisteredWaterBody = {
      body,
      get bounds() {
        return this.body.bounds;
      },
      interaction: frozenInteraction,
      routeRevision: this._nextRouteRevision(body.id),
      sample: createWaterSurfaceSample(),
      volumeSample: createWaterVolumeSample(),
      registrationState
    };
    this._entries.push(entry);
    this._entries.sort((left, right) => compareWaterBodyOrder(left.body, right.body));
    this._refreshSpatialIndex();
    const bodyId = body.id;
    return Object.freeze({
      bodyId,
      get interaction() {
        return entry.interaction;
      },
      get routeRevision() {
        return entry.routeRevision;
      },
      get active() {
        return registrationState.active;
      },
      replace: (nextBody: WaterBodyRuntime, nextInteraction: WaterWorldInteractionChannels): void => {
        if (!registrationState.active) {
          throw new Error(`Water body '${bodyId}' registration is inactive and cannot be replaced.`);
        }
        if (nextBody.id !== bodyId) {
          throw new Error(`Water body registration '${bodyId}' cannot be replaced by body '${nextBody.id}'.`);
        }
        const nextFrozenInteraction = validateAndFreezeInteractionChannels(nextBody, nextInteraction);
        const currentIndex = this._entries.indexOf(entry);
        if (currentIndex < 0) {
          throw new Error(`Water body '${bodyId}' registration is no longer present in the world.`);
        }

        // Resolve the final position before mutating the stable entry. Validation
        // failures therefore leave the currently routed body untouched.
        let nextIndex = 0;
        for (const candidate of this._entries) {
          if (candidate === entry) continue;
          if (compareWaterBodyOrder(candidate.body, nextBody) <= 0) nextIndex++;
        }

        entry.body = nextBody;
        entry.interaction = nextFrozenInteraction;
        entry.routeRevision = this._nextRouteRevision(bodyId);
        if (currentIndex !== nextIndex) {
          this._entries.splice(currentIndex, 1);
          this._entries.splice(nextIndex, 0, entry);
        }
        this._refreshSpatialIndex();
      },
      destroy: () => {
        if (!registrationState.active) return;
        registrationState.active = false;
        const index = this._entries.indexOf(entry);
        if (index < 0) return;
        this._entries.splice(index, 1);
        this._refreshSpatialIndex();
      }
    });
  }

  acquireSurfaceConsumerLease(
    bodyId: string,
    purpose: WaterWorldSurfaceConsumerPurpose
  ): WaterWorldSurfaceConsumerLease {
    this._validateConsumerBodyId(bodyId);
    const state: WaterWorldConsumerLeaseState = {
      active: true,
      bodyId,
      purpose
    };
    this._consumerLeases.add(state);
    const surfaceProvider: WaterSurfaceProvider = Object.freeze({
      sampleSurface: (worldPosition: Vector3, outSample: WaterSurfaceSample): boolean => {
        if (!state.active) {
          resetWaterSurfaceSample(outSample);
          return false;
        }
        const entry = this._sampleSurfaceForChannel(purpose, worldPosition, outSample, bodyId);
        if (!entry) return false;
        return true;
      }
    });
    return Object.freeze({
      purpose,
      surfaceProvider,
      get active() {
        return state.active;
      },
      destroy: () => this._destroyConsumerLease(state)
    });
  }

  acquireWakeConsumerLease(bodyId: string): WaterWorldWakeConsumerLease {
    this._validateConsumerBodyId(bodyId);
    const state: WaterWorldConsumerLeaseState = {
      active: true,
      bodyId,
      purpose: "wake"
    };
    const surfaceSample = createWaterSurfaceSample();
    this._consumerLeases.add(state);
    const interactionSink: WaterSurfaceInteractionSink = Object.freeze({
      registerInteraction: (
        worldPosition: Vector3,
        surfaceNormal: Vector3,
        relativeVelocity: Vector3,
        radius: number,
        submergedRatio: number,
        enteredWater: boolean
      ): boolean => {
        if (!state.active) return false;
        const entry = this._sampleSurfaceForChannel("wake", worldPosition, surfaceSample, bodyId);
        const sink = entry?.body.interactionSink;
        if (!sink) return false;
        const accepted = sink.registerInteraction(
          worldPosition,
          surfaceNormal,
          relativeVelocity,
          radius,
          submergedRatio,
          enteredWater
        );
        return accepted;
      }
    });
    return Object.freeze({
      purpose: "wake",
      interactionSink,
      get active() {
        return state.active;
      },
      destroy: () => this._destroyConsumerLease(state)
    });
  }

  unregister(bodyId: string): boolean {
    const index = this._entries.findIndex((entry) => entry.body.id === bodyId);
    if (index < 0) return false;
    this._entries[index].registrationState.active = false;
    this._entries.splice(index, 1);
    this._refreshSpatialIndex();
    return true;
  }

  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
    return this._sampleSurfaceForChannel("query", worldPosition, outSample) !== undefined;
  }

  sampleSurfaceDetailed(
    worldPosition: Vector3,
    outSample: WaterSurfaceSample,
    outStatus: WaterWorldQueryStatus
  ): boolean {
    return this._sampleSurfaceForChannel("query", worldPosition, outSample, undefined, outStatus) !== undefined;
  }

  private _sampleSurfaceForChannel(
    channel: keyof WaterWorldInteractionChannels,
    worldPosition: Vector3,
    outSample: WaterSurfaceSample,
    bodyId?: string,
    outStatus?: WaterWorldQueryStatus
  ): RegisteredWaterBody | undefined {
    resetWaterSurfaceSample(outSample);
    if (outStatus) resetWaterWorldQueryStatus(outStatus);
    const context = this._surfaceQueryContext;
    if (context.active) throw new Error("WaterWorld surface queries are not reentrant.");

    context.active = true;
    context.channel = channel;
    context.worldPosition = worldPosition;
    context.outSample = outSample;
    context.bodyId = bodyId;
    context.bestPriority = Number.NEGATIVE_INFINITY;
    context.bestHeight = Number.NEGATIVE_INFINITY;
    context.bestBodyId = "";
    context.bestEntry = undefined;

    try {
      this._visitBroadPhaseCandidates(worldPosition.x, worldPosition.z, this._surfaceCandidateVisitor);
    } finally {
      context.active = false;
      context.worldPosition = undefined;
      context.outSample = undefined;
      context.bodyId = undefined;
    }

    const bestEntry = context.bestEntry;
    if (outStatus) {
      outStatus.hit = bestEntry !== undefined;
      outStatus.complete = true;
    }
    if (!bestEntry) return undefined;
    return bestEntry;
  }

  private _visitSurfaceCandidate(entry: RegisteredWaterBody): boolean {
    const context = this._surfaceQueryContext;
    const worldPosition = context.worldPosition;
    const outSample = context.outSample;
    if (!context.active || !worldPosition || !outSample) {
      throw new Error("WaterWorld surface candidate visitor has no active query.");
    }

    const body = entry.body;
    if (context.bestEntry && body.priority < context.bestPriority) return false;
    if (
      (context.bodyId !== undefined && body.id !== context.bodyId) ||
      !entry.interaction[context.channel] ||
      !body.enabled ||
      !containsWaterBounds(body.bounds, worldPosition.x, worldPosition.z) ||
      this._isExcluded(body, worldPosition.x, worldPosition.z)
    ) {
      return true;
    }

    const candidate = entry.sample;
    if (!body.surface?.sampleSurface(worldPosition, candidate)) return true;

    const candidateHeight = candidate.surfacePosition.y;
    const wins =
      context.bestEntry === undefined ||
      body.priority > context.bestPriority ||
      (body.priority === context.bestPriority && candidateHeight > context.bestHeight) ||
      (body.priority === context.bestPriority &&
        candidateHeight === context.bestHeight &&
        body.id < context.bestBodyId);
    if (!wins) return true;

    context.bestPriority = body.priority;
    context.bestHeight = candidateHeight;
    context.bestBodyId = body.id;
    context.bestEntry = entry;
    this._copySample(candidate, outSample);
    outSample.waterBodyId = body.id;
    return true;
  }

  /** Selects the highest-priority water body that vertically contains the point. */
  findContainingVolume(worldPosition: Vector3, outSample: WaterWorldVolumeSample): boolean {
    return this._findContainingVolume(worldPosition, outSample);
  }

  findContainingVolumeDetailed(
    worldPosition: Vector3,
    outSample: WaterWorldVolumeSample,
    outStatus: WaterWorldQueryStatus
  ): boolean {
    return this._findContainingVolume(worldPosition, outSample, outStatus);
  }

  private _findContainingVolume(
    worldPosition: Vector3,
    outSample: WaterWorldVolumeSample,
    outStatus?: WaterWorldQueryStatus
  ): boolean {
    resetWaterWorldVolumeSample(outSample);
    if (outStatus) resetWaterWorldQueryStatus(outStatus);
    const context = this._volumeQueryContext;
    if (context.active) throw new Error("WaterWorld volume queries are not reentrant.");

    context.active = true;
    context.worldPosition = worldPosition;
    context.outSample = outSample;
    context.bestPriority = Number.NEGATIVE_INFINITY;
    context.bestHeight = Number.NEGATIVE_INFINITY;
    context.bestBodyId = "";

    try {
      this._visitBroadPhaseCandidates(worldPosition.x, worldPosition.z, this._volumeCandidateVisitor);
    } finally {
      context.active = false;
      context.worldPosition = undefined;
      context.outSample = undefined;
    }

    const hit = context.bestBodyId !== "";
    if (outStatus) {
      outStatus.hit = hit;
      outStatus.complete = true;
    }
    if (!hit) return false;
    return true;
  }

  private _visitVolumeCandidate(entry: RegisteredWaterBody): boolean {
    const context = this._volumeQueryContext;
    const worldPosition = context.worldPosition;
    const outSample = context.outSample;
    if (!context.active || !worldPosition || !outSample) {
      throw new Error("WaterWorld volume candidate visitor has no active query.");
    }

    const body = entry.body;
    if (context.bestBodyId !== "" && body.priority < context.bestPriority) return false;
    const volume = body.volume;
    if (
      !entry.interaction.query ||
      !volume ||
      !body.enabled ||
      !containsWaterBounds(body.bounds, worldPosition.x, worldPosition.z) ||
      this._isExcluded(body, worldPosition.x, worldPosition.z)
    ) {
      return true;
    }

    const candidate = entry.volumeSample;
    resetWaterVolumeSample(candidate);
    if (!volume.sampleVolume(worldPosition, candidate) || !candidate.insideVolume) return true;

    const wins =
      body.priority > context.bestPriority ||
      (body.priority === context.bestPriority && candidate.surfaceHeight > context.bestHeight) ||
      (body.priority === context.bestPriority &&
        candidate.surfaceHeight === context.bestHeight &&
        body.id < context.bestBodyId);
    if (!wins) return true;

    context.bestPriority = body.priority;
    context.bestHeight = candidate.surfaceHeight;
    context.bestBodyId = body.id;
    this._copyVolumeSample(candidate, outSample);
    outSample.waterBodyId = body.id;
    outSample.priority = body.priority;
    outSample.opticalProfile = body.opticalProfile;
    return true;
  }

  /** Samples one registered body even just above its surface for controller hysteresis. */
  sampleBodyVolume(bodyId: string, worldPosition: Vector3, outSample: WaterWorldVolumeSample): boolean {
    resetWaterWorldVolumeSample(outSample);
    let entry: RegisteredWaterBody | undefined;
    for (let index = 0; index < this._entries.length; index++) {
      const candidate = this._entries[index];
      if (candidate.body.id === bodyId) {
        entry = candidate;
        break;
      }
    }
    if (!entry) return false;
    const body = entry.body;
    const volume = body.volume;
    if (
      !entry.interaction.query ||
      !volume ||
      !body.enabled ||
      !containsWaterBounds(body.bounds, worldPosition.x, worldPosition.z) ||
      this._isExcluded(body, worldPosition.x, worldPosition.z)
    ) {
      return false;
    }
    const candidate = entry.volumeSample;
    resetWaterVolumeSample(candidate);
    if (!volume.sampleVolume(worldPosition, candidate)) return false;
    this._copyVolumeSample(candidate, outSample);
    outSample.waterBodyId = body.id;
    outSample.priority = body.priority;
    outSample.opticalProfile = body.opticalProfile;
    return true;
  }

  destroy(): void {
    for (const entry of this._entries) {
      entry.registrationState.active = false;
    }
    this._entries.length = 0;
    this._spatialIndex = undefined;
    for (const lease of this._consumerLeases) {
      lease.active = false;
    }
    this._consumerLeases.clear();
  }

  private _refreshSpatialIndex(): void {
    if (this._entries.length < this._spatialIndexMinimumBodyCount) {
      this._spatialIndex = undefined;
      return;
    }
    if (!this._spatialIndex) {
      this._spatialIndex = new WaterWorldSpatialIndex<RegisteredWaterBody>(this._spatialIndexOptions);
    }
    this._spatialIndex.rebuild(this._entries);
  }

  private _visitBroadPhaseCandidates(
    worldX: number,
    worldZ: number,
    visitor: (entry: RegisteredWaterBody) => boolean
  ): number {
    if (this._spatialIndex) {
      return this._spatialIndex.visitPoint(worldX, worldZ, visitor);
    }
    let visitedCount = 0;
    for (const entry of this._entries) {
      visitedCount++;
      if (!visitor(entry)) break;
    }
    return visitedCount;
  }

  private _destroyConsumerLease(state: WaterWorldConsumerLeaseState): void {
    if (!state.active) return;
    state.active = false;
    this._consumerLeases.delete(state);
  }

  private _validateConsumerBodyId(bodyId: string): void {
    if (bodyId.trim().length === 0) {
      throw new Error("Water consumer lease body id must be non-empty.");
    }
  }

  private _nextRouteRevision(bodyId: string): number {
    const revision = (this._bodyRouteRevisions.get(bodyId) ?? 0) + 1;
    this._bodyRouteRevisions.set(bodyId, revision);
    return revision;
  }

  private _copySample(source: WaterSurfaceSample, target: WaterSurfaceSample): void {
    target.waterBodyId = source.waterBodyId;
    target.surfacePosition.copyFrom(source.surfacePosition);
    target.surfaceNormal.copyFrom(source.surfaceNormal);
    target.waterVelocity.copyFrom(source.waterVelocity);
    target.waterDepth = source.waterDepth;
  }

  private _copyVolumeSample(source: WaterVolumeSample, target: WaterVolumeSample): void {
    target.waterBodyId = source.waterBodyId;
    target.insideFootprint = source.insideFootprint;
    target.insideVolume = source.insideVolume;
    target.surfaceHeight = source.surfaceHeight;
    target.bottomHeight = source.bottomHeight;
    target.signedSurfaceDistance = source.signedSurfaceDistance;
    target.submergedDepth = source.submergedDepth;
    target.waterDepth = source.waterDepth;
  }

  private _isExcluded(body: WaterBodyRuntime, worldX: number, worldZ: number): boolean {
    for (const bounds of body.exclusionBounds) {
      if (containsWaterBounds(bounds, worldX, worldZ)) return true;
    }
    return false;
  }
}
