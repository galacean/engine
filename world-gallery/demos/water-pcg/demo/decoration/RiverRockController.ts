/**
 * Demo-only river rock decoration.
 *
 * Rock placement reads compiled samples and validates candidates through the
 * runtime water query. It does not add decoration concepts to Authoring,
 * Compiler, Resource, or Runtime contracts.
 */
import {
  BlinnPhongMaterial,
  DirectLight,
  Engine,
  Entity,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { RiverChunkSourceKind } from "../../compiler/river/RiverGeometryEnums";
import type { RiverCompiledData, RiverCompiledSample } from "../../compiler/river/types";
import { createRiverNetworkQueryResult, RiverNetworkQueryService } from "../../runtime/river/RiverQueryService";

const RIVER_ROCK_SCATTER = {
  count: 7,
  maxAttemptsPerRock: 16,
  minSampleFraction: 0.16,
  maxSampleFraction: 0.84,
  lateralOffsetFraction: 0.24,
  minBaseRadius: 0.62,
  maxBaseRadius: 1.3,
  widthToRadius: 0.13,
  minSpacing: 0.7,
  bankClearanceFraction: 0.35,
  minHorizontalScale: 0.85,
  horizontalScaleRange: 0.5,
  minVerticalScale: 0.58,
  verticalScaleRange: 0.3,
  maxTiltDegrees: 10,
  fullRotationDegrees: 360,
  waterlineOffset: 0,
  meshRadius: 1
} as const;

const RIVER_ROCK_RANDOM = {
  multiplier: 1664525,
  increment: 1013904223,
  divisor: 0x100000000,
  hashOffset: 2166136261,
  hashMultiplier: 16777619
} as const;

const RIVER_ROCK_STYLE = {
  meshSubdivisionSteps: 1,
  baseColor: new Color(0.2, 0.18, 0.15, 1),
  specularColor: new Color(0.38, 0.42, 0.44, 1),
  emissiveColor: new Color(0.018, 0.016, 0.013, 1),
  shininess: 48,
  lightColor: new Color(0.9, 0.88, 0.82, 1),
  lightRotation: [-52, -38, 0] as const
} as const;

type Vector3Tuple = readonly [number, number, number];

export interface RiverRockPlacement {
  readonly position: Vector3Tuple;
  readonly rotation: Vector3Tuple;
  readonly scale: Vector3Tuple;
}

interface AcceptedRockPlacement extends RiverRockPlacement {
  readonly horizontalRadius: number;
}

function hashString(value: string): number {
  let hash = RIVER_ROCK_RANDOM.hashOffset;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), RIVER_ROCK_RANDOM.hashMultiplier) >>> 0;
  }
  return hash;
}

function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, RIVER_ROCK_RANDOM.multiplier) + RIVER_ROCK_RANDOM.increment) >>> 0;
    return state / RIVER_ROCK_RANDOM.divisor;
  };
}

function sampleIndex(sampleCount: number, random: () => number): number {
  const lastIndex = sampleCount - 1;
  const start = Math.max(0, Math.ceil(lastIndex * RIVER_ROCK_SCATTER.minSampleFraction));
  const end = Math.max(start, Math.floor(lastIndex * RIVER_ROCK_SCATTER.maxSampleFraction));
  return Math.min(end, start + Math.floor(random() * (end - start + 1)));
}

function createCandidate(
  sample: RiverCompiledSample,
  surfaceHeight: number,
  random: () => number
): AcceptedRockPlacement {
  const baseRadius = Math.min(
    RIVER_ROCK_SCATTER.maxBaseRadius,
    Math.max(RIVER_ROCK_SCATTER.minBaseRadius, sample.width * RIVER_ROCK_SCATTER.widthToRadius)
  );
  const scaleX =
    baseRadius * (RIVER_ROCK_SCATTER.minHorizontalScale + random() * RIVER_ROCK_SCATTER.horizontalScaleRange);
  const scaleZ =
    baseRadius * (RIVER_ROCK_SCATTER.minHorizontalScale + random() * RIVER_ROCK_SCATTER.horizontalScaleRange);
  const scaleY = baseRadius * (RIVER_ROCK_SCATTER.minVerticalScale + random() * RIVER_ROCK_SCATTER.verticalScaleRange);
  const horizontalRadius = Math.max(scaleX, scaleZ);
  const lateralOffset = (random() * 2 - 1) * sample.width * RIVER_ROCK_SCATTER.lateralOffsetFraction;
  const rightX = -sample.tangent[2];
  const rightZ = sample.tangent[0];

  return {
    position: [
      sample.position[0] + rightX * lateralOffset,
      surfaceHeight + RIVER_ROCK_SCATTER.waterlineOffset,
      sample.position[2] + rightZ * lateralOffset
    ],
    rotation: [
      (random() * 2 - 1) * RIVER_ROCK_SCATTER.maxTiltDegrees,
      random() * RIVER_ROCK_SCATTER.fullRotationDegrees,
      (random() * 2 - 1) * RIVER_ROCK_SCATTER.maxTiltDegrees
    ],
    scale: [scaleX, scaleY, scaleZ],
    horizontalRadius
  };
}

function isSeparated(candidate: AcceptedRockPlacement, placements: readonly AcceptedRockPlacement[]): boolean {
  return placements.every((placement) => {
    const deltaX = placement.position[0] - candidate.position[0];
    const deltaZ = placement.position[2] - candidate.position[2];
    const minDistance = placement.horizontalRadius + candidate.horizontalRadius + RIVER_ROCK_SCATTER.minSpacing;
    return deltaX * deltaX + deltaZ * deltaZ >= minDistance * minDistance;
  });
}

export function createRiverRockPlacements(
  data: RiverCompiledData,
  queryService: RiverNetworkQueryService
): RiverRockPlacement[] {
  if (data.reaches.length === 0) return [];
  if (data.disturbances.length > 0) {
    const queryPosition = new Vector3();
    const queryResult = createRiverNetworkQueryResult();
    return data.disturbances.map((disturbance) => {
      queryPosition.set(disturbance.position[0], disturbance.position[1], disturbance.position[2]);
      queryService.sampleSurface(queryPosition, queryResult);
      const random = createRandom(hashString(`${data.sourceId}:${disturbance.id}`));
      return {
        position: [
          disturbance.position[0],
          queryResult.hit ? queryResult.surfaceHeight : disturbance.position[1],
          disturbance.position[2]
        ],
        rotation: [
          (random() * 2 - 1) * RIVER_ROCK_SCATTER.maxTiltDegrees,
          random() * RIVER_ROCK_SCATTER.fullRotationDegrees,
          (random() * 2 - 1) * RIVER_ROCK_SCATTER.maxTiltDegrees
        ],
        scale: [disturbance.radius, disturbance.radius * 0.72, disturbance.radius * 0.9]
      };
    });
  }
  const random = createRandom(hashString(data.sourceId));
  const placements: AcceptedRockPlacement[] = [];
  const queryPosition = new Vector3();
  const queryResult = createRiverNetworkQueryResult();

  for (let rockIndex = 0; rockIndex < RIVER_ROCK_SCATTER.count; rockIndex++) {
    for (let attempt = 0; attempt < RIVER_ROCK_SCATTER.maxAttemptsPerRock; attempt++) {
      const reach = data.reaches[(rockIndex + attempt) % data.reaches.length];
      const samples = reach.artifact.samples;
      if (samples.length === 0) continue;
      const sample = samples[sampleIndex(samples.length, random)];
      const candidate = createCandidate(sample, sample.position[1], random);
      queryPosition.set(candidate.position[0], candidate.position[1], candidate.position[2]);
      queryService.sampleSurface(queryPosition, queryResult);
      if (
        queryResult.sourceKind !== RiverChunkSourceKind.Reach ||
        !queryResult.insideFootprint ||
        queryResult.distanceToBank < candidate.horizontalRadius * RIVER_ROCK_SCATTER.bankClearanceFraction
      ) {
        continue;
      }
      const placement = {
        ...candidate,
        position: [candidate.position[0], queryResult.surfaceHeight, candidate.position[2]] as const
      };
      if (!isSeparated(placement, placements)) continue;
      placements.push(placement);
      break;
    }
  }

  return placements.map((placement) => ({
    position: placement.position,
    rotation: placement.rotation,
    scale: placement.scale
  }));
}

/** Renders deterministic, half-submerged rocks using shared demo resources. */
export class RiverRockController {
  readonly root: Entity;

  private readonly _rocksRoot: Entity;
  private readonly _mesh: ModelMesh;
  private readonly _material: BlinnPhongMaterial;

  get rockCount(): number {
    return this._rocksRoot.children.length;
  }

  constructor(engine: Engine, parent: Entity) {
    this.root = parent.createChild("river-rock-decoration");
    this._rocksRoot = this.root.createChild("rocks");
    this._mesh = PrimitiveMesh.createSubdivisionSurfaceSphere(
      engine,
      RIVER_ROCK_SCATTER.meshRadius,
      RIVER_ROCK_STYLE.meshSubdivisionSteps
    );
    this._material = new BlinnPhongMaterial(engine);
    this._material.baseColor = RIVER_ROCK_STYLE.baseColor;
    this._material.specularColor = RIVER_ROCK_STYLE.specularColor;
    this._material.emissiveColor = RIVER_ROCK_STYLE.emissiveColor;
    this._material.shininess = RIVER_ROCK_STYLE.shininess;

    const lightEntity = this.root.createChild("river-rock-light");
    lightEntity.transform.setRotation(...RIVER_ROCK_STYLE.lightRotation);
    lightEntity.addComponent(DirectLight).color = RIVER_ROCK_STYLE.lightColor;
  }

  rebuild(data: RiverCompiledData, queryService: RiverNetworkQueryService): void {
    while (this._rocksRoot.children.length > 0) {
      this._rocksRoot.children[this._rocksRoot.children.length - 1].destroy();
    }

    const placements = createRiverRockPlacements(data, queryService);
    for (let index = 0; index < placements.length; index++) {
      const placement = placements[index];
      const rock = this._rocksRoot.createChild(`river-rock-${index}`);
      rock.transform.setPosition(...placement.position);
      rock.transform.setRotation(...placement.rotation);
      rock.transform.setScale(...placement.scale);
      const renderer = rock.addComponent(MeshRenderer);
      renderer.mesh = this._mesh;
      renderer.setMaterial(this._material);
    }
  }

  destroy(): void {
    this.root.destroy();
    this._mesh.destroy(true);
    this._material.destroy(true);
  }
}
