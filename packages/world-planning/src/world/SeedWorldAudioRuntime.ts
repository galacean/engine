import { AudioListener, createWindSample, type Camera } from "@galacean/engine";
import { sampleGroundCoverDensity } from "./SeedWorldGroundCoverExclusions";
import type { WorldEnvironmentRuntime } from "../integrations/terrain/environment/WorldEnvironmentRuntime.ts";
import type { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import type { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import {
  EnvironmentAudioRuntime,
  createEnvironmentAudioEmitter,
  type EnvironmentAudioEmitter
} from "@galacean/engine-terrain/terrain/audio/EnvironmentAudioRuntime";
import {
  AudioFootstepCadence,
  audioDistance,
  AudioPropagation,
  audioPropagationGain,
  audioRayIntersectsObb,
  clamp01,
  waterPropagationGain,
  AudioPoint
} from "@galacean/engine-terrain/terrain/audio/EnvironmentAudioMath";
import {
  sampleSeedWorldHeightInto,
  SeedWorldHeightSample,
  seedWorldOriginX,
  seedWorldOriginZ,
  type SeedWorldFields
} from "../runtime/SeedWorldFields.ts";
import type { SeedWorldHydrologyArtifactV1 } from "../runtime/hydrology-v1/SeedWorldHydrologyArtifact.ts";
import type { SeedWorldPopulationPreview } from "../runtime/SeedWorldPopulationPlan.ts";
import type { SeedWorldSolvedRockObb } from "../runtime/SeedWorldRockAssemblySolver.ts";
import type { SeedWorldNavigationSurface } from "../runtime/SeedWorldNavigationSurface.ts";
import type { SeedWorldWaterRuntime } from "../runtime/SeedWorldWaterRuntime.ts";

import { AudioBoundsIndex, type AudioBounds } from "@galacean/engine-terrain/terrain/audio/AudioBoundsIndex";
import { AudioCandidateBuffer, selectAudioCandidates, type AudioCandidateSelection } from "./SeedWorldAudioCandidates";
import { SeedWorldAudioWater } from "../runtime/SeedWorldAudioWater.ts";

/** Exact acoustic bounds; rendering and asset identity stay with their original owners. */
export type SeedWorldAudioSolid = Pick<SeedWorldSolvedRockObb, "obbCenter" | "obbSizeMetres" | "obbRotationQuaternion">;
/** Published water geometry adapter. The legacy hydrology implementation satisfies the same contract. */
export interface SeedWorldWaterAudioSource {
  readonly invalidationRevision: number;
  prepareBuffer(result: AudioCandidateBuffer): void;
  update(point: AudioPoint): void;
  collect(point: AudioPoint, result: AudioCandidateBuffer): void;
  invalidateTerrain(minX: number, minZ: number, maxX: number, maxZ: number): void;
}
interface RockEntry extends AudioBounds {
  readonly rock: SeedWorldAudioSolid;
}
interface VegetationCluster {
  readonly id: string;
  readonly clip: "leaves" | "shrub";
  readonly x: number;
  readonly z: number;
  readonly gain: number;
  readonly reach: number;
}
export interface SeedWorldAudioWorld {
  readonly fields: SeedWorldFields;
  readonly hydrology?: SeedWorldHydrologyArtifactV1;
  readonly waterAudio?: SeedWorldWaterAudioSource;
  readonly navigation: Pick<SeedWorldNavigationSurface, "sampleContactIsWater">;
  readonly population: () => SeedWorldPopulationPreview;
  readonly rocks: readonly SeedWorldAudioSolid[];
}
export interface PreparedSeedWorldAudioWorld {
  readonly world: SeedWorldAudioWorld;
  readonly waterAudio?: SeedWorldWaterAudioSource;
  readonly waterCandidates: AudioCandidateBuffer;
  readonly rockIndex: AudioBoundsIndex<RockEntry>;
}
const SPATIAL_CLIPS = ["leaves", "shrub", "grass", "stream", "lake", "ocean"] as const;
// Disabled after listening review; grass footsteps remain enabled.
const GRASS_WIND_AUDIO_ENABLED = false;
const QUERY_INTERVAL = 0.2;
const QUERY_PHASES = 6;
const QUERY_SLOT = QUERY_INTERVAL / QUERY_PHASES;

/** Adapts committed World facts to a bounded, spatially continuous soundscape. */
export class SeedWorldAudioRuntime {
  readonly audio: EnvironmentAudioRuntime;
  /** Reports when another movement provider owns contact sounds. */
  suppressFootsteps?: () => boolean;
  private readonly audioListener: AudioListener;
  private world?: SeedWorldAudioWorld;
  private waterAudio?: SeedWorldWaterAudioSource;
  private rockIndex = new AudioBoundsIndex<RockEntry>([]);
  private population?: SeedWorldPopulationPreview;
  private readonly clusters = new Map<number, Map<number, VegetationCluster[]>>();
  private readonly cadence = new AudioFootstepCadence();
  private elapsed = 0;
  private queryPhase = 0;
  private nextQueryAt = 0;
  private queriesActive = false;
  private readonly propagation = new AudioPropagation();
  private readonly heightSample = new SeedWorldHeightSample();
  private readonly previousListener = new AudioPoint();
  private readonly listener = {
    position: new AudioPoint()
  };
  // Two vegetation categories in each of 9x9 cells, plus 5x5 grass cells.
  private readonly vegetationCandidates = new AudioCandidateBuffer(2 * 81 + 25);
  private waterCandidates = new AudioCandidateBuffer(0);
  private readonly selection: AudioCandidateSelection = {};
  private readonly beds: EnvironmentAudioEmitter[] = [
    createEnvironmentAudioEmitter("wind", "air"),
    createEnvironmentAudioEmitter("gust", "gusts"),
    createEnvironmentAudioEmitter("rain-light", "rain-light"),
    createEnvironmentAudioEmitter("rain-heavy", "rain-heavy")
  ];
  private bedsReady = false;
  private readonly spatial = SPATIAL_CLIPS.map((clip) => [
    createEnvironmentAudioEmitter(clip, "", true),
    createEnvironmentAudioEmitter(clip, "", true)
  ]);
  private readonly spatialCounts = new Uint8Array(SPATIAL_CLIPS.length);
  private readonly emitters: EnvironmentAudioEmitter[] = new Array(16);
  private emitterCount = 0;
  private readonly sample = createWindSample();
  private readonly footPosition = new AudioPoint();
  private rayA!: AudioPoint;
  private rayB!: AudioPoint;
  private readonly intersectsRock = (entry: RockEntry): boolean =>
    audioRayIntersectsObb(
      this.rayA,
      this.rayB,
      entry.rock.obbCenter,
      entry.rock.obbSizeMetres,
      entry.rock.obbRotationQuaternion
    );
  private readonly unsubscribe: () => void;
  private active = false;

  constructor(
    private readonly camera: Camera,
    private readonly navigation: TerrainNavigationRuntime,
    private readonly environment: WorldEnvironmentRuntime,
    private readonly wind: TerrainWindRuntime,
    private readonly water?: SeedWorldWaterRuntime
  ) {
    this.audio = camera.scene!.createRootEntity("Nature audio").addComponent(EnvironmentAudioRuntime);
    this.audioListener = camera.entity.addComponent(AudioListener);
    this.audio.setOcclusionProvider((a, b) => (this.world ? this.occlusion(a, b) : 0));
    this.unsubscribe = environment.subscribeLightningStrikes((strike) => this.audio.strike(strike));
    navigation.onGroundedTravel = this.onTravel;
  }

  /** Allocate and validate acoustic query state without touching the audible world. */
  prepareWorld(world: SeedWorldAudioWorld): PreparedSeedWorldAudioWorld {
    const waterAudio =
      world.waterAudio ??
      (world.hydrology && this.water ? new SeedWorldAudioWater(world.fields, world.hydrology, this.water) : undefined);
    const waterCandidates = new AudioCandidateBuffer(0);
    waterAudio?.prepareBuffer(waterCandidates);
    return { world, waterAudio, waterCandidates, rockIndex: new AudioBoundsIndex(world.rocks.map(rockEntry)) };
  }

  /** Publish only prepared references. WebAudio retirement happens in the following audio frame. */
  publishWorld(prepared: PreparedSeedWorldAudioWorld): void {
    this.world = prepared.world;
    this.waterAudio = prepared.waterAudio;
    this.waterCandidates = prepared.waterCandidates;
    this.rockIndex = prepared.rockIndex;
    this.worldResetPending = true;
  }

  /** Preserve the exact accepted audio references until the surrounding scene commits. */
  prepareWorldPublication(prepared: PreparedSeedWorldAudioWorld) {
    const previous = {
      world: this.world,
      waterAudio: this.waterAudio,
      waterCandidates: this.waterCandidates,
      rockIndex: this.rockIndex,
      resetPending: this.worldResetPending
    };
    return {
      commit: () => this.publishWorld(prepared),
      rollback: () => {
        this.world = previous.world;
        this.waterAudio = previous.waterAudio;
        this.waterCandidates = previous.waterCandidates;
        this.rockIndex = previous.rockIndex;
        this.worldResetPending = previous.resetPending;
      }
    };
  }

  /** Existing callers use the same preparation/publication path. */
  setWorld(world: SeedWorldAudioWorld): void {
    this.publishWorld(this.prepareWorld(world));
  }

  private worldResetPending = false;

  /** Called by both terrain-patch publication and each animated height frame. */
  invalidateTerrain(fields: SeedWorldFields, origin: readonly [number, number], size: readonly [number, number]): void {
    if (fields !== this.world?.fields) return;
    const step = fields.sizeMetres / Math.max(1, fields.heightResolution - 1),
      originX = seedWorldOriginX(fields),
      originZ = seedWorldOriginZ(fields);
    // One extra height cell covers bilinear interpolation outside the edited sample rectangle.
    this.waterAudio?.invalidateTerrain(
      (origin[0] - 1) * step + originX,
      (origin[1] - 1) * step + originZ,
      (origin[0] + size[0]) * step + originX,
      (origin[1] + size[1]) * step + originZ
    );
  }

  update(deltaTime: number, active: boolean, recording: boolean): void {
    if (this.worldResetPending) {
      this.worldResetPending = false;
      this.population = undefined;
      this.clusters.clear();
      this.cadence.reset();
      this.resetQueries();
      this.audio.resetWorld();
    }
    this.elapsed += Math.max(0, deltaTime);
    if (active !== this.active) {
      this.cadence.reset();
      this.resetQueries();
      this.active = active;
    }
    this.audio.setActive(active && !!this.world);
    this.audio.setDucked(recording);
    const transform = this.camera.entity.transform;
    const position = this.listener.position;
    const cameraPosition = transform.worldPosition;
    cameraPosition.copyTo(position);
    if (!this.audio.playbackActive) {
      if (this.queriesActive) this.resetQueries();
      this.queriesActive = false;
    } else if (this.world) {
      // Teleports start a fresh local query cycle; ordinary movement does not keep postponing later phases.
      audioDistance(position, this.previousListener, this.propagation);
      if (!this.queriesActive || this.propagation.distance > 32) {
        this.resetQueries();
      }
      this.queriesActive = true;
      this.previousListener.x = position.x;
      this.previousListener.y = position.y;
      this.previousListener.z = position.z;
      const waterRevision = this.waterAudio?.invalidationRevision;
      this.waterAudio?.update(position);
      if (waterRevision !== this.waterAudio?.invalidationRevision) {
        this.waterCandidates.count = 0;
        this.spatialCounts[3] = this.spatialCounts[4] = this.spatialCounts[5] = 0;
        this.assembleEmitters();
      }
      if (this.elapsed + 1e-9 >= this.nextQueryAt) {
        this.runQueryPhase(position);
        this.queryPhase = (this.queryPhase + 1) % QUERY_PHASES;
        // One phase per rendered frame, including after a hitch. Never replay missed cycles in a burst.
        this.nextQueryAt = Math.max(this.nextQueryAt + QUERY_SLOT, this.elapsed);
      }
    }
    this.audio.update(this.listener, this.emitters, this.emitterCount);
  }

  private resetQueries(): void {
    this.queryPhase = 0;
    this.nextQueryAt = this.elapsed;
    this.vegetationCandidates.count = 0;
    this.waterCandidates.count = 0;
    this.bedsReady = false;
    this.spatialCounts.fill(0);
    this.emitterCount = 0;
  }

  /** At 30+ FPS, six separate phases complete one 200 ms cycle. Mixing and listener orientation remain per-frame. */
  private runQueryPhase(p: AudioPoint): void {
    switch (this.queryPhase) {
      case 0:
        this.sampleBeds(p);
        this.sampleVegetation(p);
        break;
      case 1:
        this.publishRepresentatives(0, this.vegetationCandidates, p);
        this.publishRepresentatives(1, this.vegetationCandidates, p);
        break;
      case 2:
        this.publishRepresentatives(2, this.vegetationCandidates, p);
        break;
      case 3:
        this.waterCandidates.count = 0;
        this.collectWater(p, this.waterCandidates);
        break;
      case 4:
        this.publishRepresentatives(3, this.waterCandidates, p);
        break;
      case 5:
        this.publishRepresentatives(4, this.waterCandidates, p);
        this.publishRepresentatives(5, this.waterCandidates, p);
        break;
    }
    this.assembleEmitters();
  }

  private assembleEmitters(): void {
    // Overwrite existing slots before trimming: clearing a JS array can discard its backing store.
    let count = 0;
    if (this.bedsReady) for (let i = 0; i < this.beds.length; i++) this.emitters[count++] = this.beds[i]!;
    for (let i = 0; i < this.spatial.length; i++)
      for (let j = 0; j < this.spatialCounts[i]!; j++) this.emitters[count++] = this.spatial[i]![j]!;
    this.emitterCount = count;
  }

  private readonly onTravel = (distance: number): void => {
    const world = this.world;
    if (this.suppressFootsteps?.()) {
      this.cadence.reset();
      return;
    }
    if (!this.active || !world || !this.cadence.travel(distance, this.navigation.movementSpeed, this.elapsed)) return;
    const p = this.camera.entity.transform.worldPosition;
    const surface = world.navigation.sampleContactIsWater(p.x, p.z)
      ? "water"
      : this.environment.surfaceClimate.snowCover > 0.45
        ? "snow"
        : this.grassWeight(p.x, p.z) > 0.45
          ? "grass"
          : "dirt";
    this.footPosition.x = p.x;
    this.footPosition.y = p.y - this.navigation.eyeHeight;
    this.footPosition.z = p.z;
    this.audio.footstep(surface, this.footPosition);
  };

  private grassWeight(x: number, z: number): number {
    const f = this.world!.fields,
      ix = Math.floor(((x - seedWorldOriginX(f)) / f.sizeMetres) * f.surfaceResolution),
      iz = Math.floor(((z - seedWorldOriginZ(f)) / f.sizeMetres) * f.surfaceResolution);
    if (ix < 0 || iz < 0 || ix >= f.surfaceResolution || iz >= f.surfaceResolution) return 0;
    const i = iz * f.surfaceResolution + ix;
    return (f.materialWeights[i * 4]! / 255) * (1 - f.rockySlopeWeight[i]! / 255);
  }

  private sampleBeds(p: AudioPoint): void {
    this.wind.sample(p, "ground", undefined, this.sample);
    const sample = this.sample,
      wind = clamp01(sample.speedMps / 8);
    const rain = clamp01(this.environment.weatherSystem.state.precipitation.rainRate);
    this.beds[0]!.gain = 0.15 * wind;
    this.beds[1]!.gain = 0.12 * clamp01(sample.gust) * wind;
    this.beds[2]!.gain = 0.42 * Math.sqrt(rain) * (1 - clamp01((rain - 0.35) / 0.6));
    this.beds[3]!.gain = 0.62 * clamp01((rain - 0.25) / 0.75);
    this.bedsReady = true;
  }

  private sampleVegetation(p: AudioPoint): void {
    const world = this.world!,
      population = world.population();
    if (population !== this.population) {
      this.population = population;
      this.buildClusters(population);
    }
    const candidates = this.vegetationCandidates;
    candidates.count = 0;
    const cx = Math.floor(p.x / 32),
      cz = Math.floor(p.z / 32);
    for (let z = cz - 4; z <= cz + 4; z++)
      for (let x = cx - 4; x <= cx + 4; x++) {
        const clusters = this.clusters.get(x)?.get(z);
        if (!clusters) continue;
        for (let i = 0; i < clusters.length; i++) {
          const cluster = clusters[i]!;
          // Terrain authoring mutates the height field without replacing the population layout.
          const height = this.heightSample;
          height.x = cluster.x;
          height.z = cluster.z;
          if (!sampleSeedWorldHeightInto(world.fields, height)) continue;
          const y = height.height;
          const c = candidates.items[candidates.count++]!;
          c.id = cluster.id;
          c.clip = cluster.clip;
          c.cellX = c.cellZ = undefined;
          c.gain = cluster.gain;
          c.reach = cluster.reach;
          c.position.x = cluster.x;
          c.position.y = y + (cluster.clip === "leaves" ? 6 : 1);
          c.position.z = cluster.z;
        }
      }
    if (!GRASS_WIND_AUDIO_ENABLED) return;
    // Detail density fields are the same fields submitted to the renderer, sampled at fixed world cells.
    for (let z = Math.floor(p.z / 16) - 2; z <= Math.floor(p.z / 16) + 2; z++)
      for (let x = Math.floor(p.x / 16) - 2; x <= Math.floor(p.x / 16) + 2; x++) {
        const wx = x * 16 + 8,
          wz = z * 16 + 8,
          f = world.fields;
        let density = 0;
        for (let i = 0; i < population.detailDensityFields.length; i++) {
          const detail = population.detailDensityFields[i]!;
          if (detail.category !== "grass") continue;
          const ix = Math.floor(((wx - seedWorldOriginX(f)) / f.sizeMetres) * detail.resolution),
            iz = Math.floor(((wz - seedWorldOriginZ(f)) / f.sizeMetres) * detail.resolution);
          if (ix >= 0 && iz >= 0 && ix < detail.resolution && iz < detail.resolution)
            density = Math.max(density, sampleGroundCoverDensity(detail, iz * detail.resolution + ix) / 255);
        }
        const height = this.heightSample;
        height.x = wx;
        height.z = wz;
        if (sampleSeedWorldHeightInto(f, height) && density > 0.03 && this.grassWeight(wx, wz) > 0.3) {
          const c = candidates.items[candidates.count++]!;
          c.id = "grass";
          c.cellX = x;
          c.cellZ = z;
          c.clip = "grass";
          c.position.x = wx;
          c.position.y = height.height + 0.4;
          c.position.z = wz;
          c.gain = 0.2 * Math.sqrt(density);
          c.reach = 48;
        }
      }
  }

  private publishRepresentatives(index: number, candidates: AudioCandidateBuffer, p: AudioPoint): void {
    const clip = SPATIAL_CLIPS[index]!;
    const vegetation = clip === "leaves" || clip === "shrub" || clip === "grass";
    if (vegetation) {
      // Height animations may advance between discovery and publication.
      for (let i = 0; i < candidates.count; i++) {
        const c = candidates.items[i]!;
        if (c.clip !== clip) continue;
        const height = this.heightSample;
        height.x = c.position.x;
        height.z = c.position.z;
        if (sampleSeedWorldHeightInto(this.world!.fields, height))
          c.position.y = height.height + (clip === "leaves" ? 6 : clip === "shrub" ? 1 : 0.4);
      }
    }
    selectAudioCandidates(candidates, clip, p, this.selection);
    const selected = this.selection;
    const count = selected.second ? 2 : selected.first ? 1 : 0;
    const group = this.spatial[index]!;
    let strongest = 0,
      power = 0;
    for (let i = 0; i < count; i++) {
      const c = (i === 0 ? selected.first : selected.second)!;
      const emitter = group[i]!;
      let forcing = 1;
      if (vegetation) {
        this.wind.sample(c.position, clip === "leaves" ? "canopy" : "ground", undefined, this.sample);
        forcing =
          clamp01(this.sample.speedMps / 7) *
          (clip === "grass" ? 1 - this.environment.surfaceClimate.snowCover * 0.8 : 1);
      }
      emitter.id = c.id;
      emitter.cellX = c.cellX;
      emitter.cellZ = c.cellZ;
      emitter.position!.x = c.position.x;
      emitter.position!.y = c.position.y;
      emitter.position!.z = c.position.z;
      emitter.gain = c.gain * forcing;
      emitter.reach = c.reach;
      emitter.occlusion = this.occlusion(p, c.position);
      audioDistance(p, c.position, this.propagation);
      if (vegetation) audioPropagationGain(c.reach, emitter.occlusion, this.propagation);
      else waterPropagationGain(c.reach, emitter.occlusion, this.propagation);
      const contribution = emitter.gain * this.propagation.gain;
      strongest = Math.max(strongest, contribution);
      power += contribution * contribution;
    }
    const normalization = power > 0 ? strongest / Math.sqrt(power) : 1;
    for (let i = 0; i < count; i++) group[i]!.gain *= normalization;
    this.spatialCounts[index] = count;
  }

  private buildClusters(population: SeedWorldPopulationPreview): void {
    this.clusters.clear();
    const groups = new Map<string, { x: number; z: number; count: number; clip: "leaves" | "shrub" }>();
    const size = this.world!.fields.sizeMetres;
    for (const instance of population.treeInstances) {
      if (instance.category !== "tree" && instance.category !== "shrub") continue;
      const x = instance.normalizedPosition.x * size + seedWorldOriginX(this.world!.fields),
        z = instance.normalizedPosition.y * size + seedWorldOriginZ(this.world!.fields);
      const clip = instance.category === "tree" ? "leaves" : "shrub",
        key = `${clip}:${Math.floor(x / 32)}:${Math.floor(z / 32)}`;
      const group = groups.get(key) ?? { x: 0, z: 0, count: 0, clip };
      group.x += x;
      group.z += z;
      group.count++;
      groups.set(key, group);
    }
    for (const [id, g] of groups) {
      const x = g.x / g.count,
        z = g.z / g.count;
      const cellX = Math.floor(x / 32),
        cellZ = Math.floor(z / 32);
      let column = this.clusters.get(cellX);
      if (!column) this.clusters.set(cellX, (column = new Map()));
      const list = column.get(cellZ) ?? [];
      list.push({
        id,
        clip: g.clip,
        x,
        z,
        gain: g.clip === "leaves" ? 0.3 : 0.22,
        reach: g.clip === "leaves" ? 110 : 65
      });
      column.set(cellZ, list);
    }
  }

  private collectWater(p: AudioPoint, result: AudioCandidateBuffer): void {
    this.waterAudio?.collect(p, result);
  }

  private occlusion(a: AudioPoint, b: AudioPoint): number {
    const world = this.world!;
    audioDistance(a, b, this.propagation);
    const steps = Math.min(24, Math.max(2, Math.ceil(this.propagation.distance / 6)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps,
        x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t;
      const height = this.heightSample;
      height.x = x;
      height.z = z;
      if (sampleSeedWorldHeightInto(world.fields, height) && height.height > a.y + (b.y - a.y) * t + 0.5) return 1;
    }
    this.rayA = a;
    this.rayB = b;
    return this.rockIndex.intersectsSegment(a, b, this.intersectsRock) ? 1 : 0;
  }

  destroy(): void {
    this.navigation.onGroundedTravel = undefined;
    this.unsubscribe();
    this.audio.entity.destroy();
    this.audioListener.destroy();
    this.world = undefined;
    this.resetQueries();
    this.waterAudio = undefined;
    this.rockIndex = new AudioBoundsIndex([]);
    this.clusters.clear();
  }
}

/** Conservative world AABB of the published canonical OBB; exact intersection remains the final authority. */
function rockEntry(rock: SeedWorldAudioSolid): RockEntry {
  const [x, y, z, w] = rock.obbRotationQuaternion,
    [sx, sy, sz] = rock.obbSizeMetres;
  const ex =
    (Math.abs(1 - 2 * (y * y + z * z)) * sx + Math.abs(2 * (x * y - z * w)) * sy + Math.abs(2 * (x * z + y * w)) * sz) *
      0.5 +
    1e-6;
  const ey =
    (Math.abs(2 * (x * y + z * w)) * sx + Math.abs(1 - 2 * (x * x + z * z)) * sy + Math.abs(2 * (y * z - x * w)) * sz) *
      0.5 +
    1e-6;
  const ez =
    (Math.abs(2 * (x * z - y * w)) * sx + Math.abs(2 * (y * z + x * w)) * sy + Math.abs(1 - 2 * (x * x + y * y)) * sz) *
      0.5 +
    1e-6;
  const [cx, cy, cz] = rock.obbCenter;
  return { rock, minX: cx - ex, minY: cy - ey, minZ: cz - ez, maxX: cx + ex, maxY: cy + ey, maxZ: cz + ez };
}
