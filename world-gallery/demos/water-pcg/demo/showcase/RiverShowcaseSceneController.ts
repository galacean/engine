import { BlinnPhongMaterial, Engine, Entity, MeshRenderer, ModelMesh, PrimitiveMesh } from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import type { RiverCompiledData, RiverCompiledSample } from "../../compiler/river/types";
import { createRiverNetworkQueryResult, type RiverNetworkQueryService } from "../../runtime/river/RiverQueryService";
import { WaterDecorationStyle } from "../decoration/constants";
import { createWaterTerrainHeightSampler } from "../decoration/WaterTerrainBuilder";

type Vector3Tuple = readonly [number, number, number];
type ColorTuple = readonly [number, number, number, number];

export interface RiverShowcaseSceneMetrics {
  readonly enabled: boolean;
  readonly fixtureObjectCount: number;
  readonly treeCount: number;
  readonly bridgeCount: number;
  readonly activeDriftCount: number;
  readonly driftQueryHitCount: number;
  readonly maxDownstreamDistance: number;
  readonly finite: boolean;
}

interface DriftTrack {
  readonly samples: readonly RiverCompiledSample[];
  readonly cumulativeDistance: Float32Array;
  readonly totalDistance: number;
}

interface DriftRuntime {
  readonly entity: Entity;
  readonly track: DriftTrack;
  readonly offset: number;
  readonly speed: number;
}

export const RIVER_SHOWCASE_TREE_POSITIONS: readonly Vector3Tuple[] = Object.freeze([
  Object.freeze([-43, 0, -17] as const),
  Object.freeze([-37, 0, -5] as const),
  Object.freeze([-31, 0, 1] as const),
  Object.freeze([-38, 0, 20] as const),
  Object.freeze([-25, 0, 27] as const),
  Object.freeze([-5, 0, -17] as const),
  Object.freeze([8, 0, -13] as const),
  Object.freeze([20, 0, 10] as const),
  Object.freeze([31, 0, 24] as const),
  Object.freeze([42, 0, 18] as const)
]);

const DRIFT_ROUTE_IDS = Object.freeze([
  Object.freeze(["showcase-main-upper", "showcase-main-lower"] as const),
  Object.freeze(["showcase-tributary", "showcase-main-lower"] as const),
  Object.freeze(["showcase-main-lower"] as const)
]);
const RAD_TO_DEG = 180 / Math.PI;

function createTrack(samples: readonly RiverCompiledSample[]): DriftTrack {
  const cumulativeDistance = new Float32Array(samples.length);
  let totalDistance = 0;
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1].position;
    const current = samples[index].position;
    totalDistance += Math.hypot(current[0] - previous[0], current[1] - previous[1], current[2] - previous[2]);
    cumulativeDistance[index] = totalDistance;
  }
  return { samples, cumulativeDistance, totalDistance };
}

function combineReachSamples(data: RiverCompiledData, reachIds: readonly string[]): readonly RiverCompiledSample[] {
  const samples: RiverCompiledSample[] = [];
  for (const reachId of reachIds) {
    const reach = data.reaches.find((candidate) => candidate.id === reachId);
    if (!reach) continue;
    const startIndex = samples.length > 0 ? 1 : 0;
    for (let index = startIndex; index < reach.artifact.samples.length; index++) {
      samples.push(reach.artifact.samples[index]);
    }
  }
  return samples;
}

function sampleTrack(track: DriftTrack, distance: number, outPosition: Vector3, outTangent: Vector3): boolean {
  if (track.samples.length < 2 || track.totalDistance <= 0) return false;
  const wrappedDistance = ((distance % track.totalDistance) + track.totalDistance) % track.totalDistance;
  let endIndex = 1;
  while (endIndex < track.cumulativeDistance.length - 1 && track.cumulativeDistance[endIndex] < wrappedDistance) {
    endIndex++;
  }
  const startIndex = endIndex - 1;
  const startDistance = track.cumulativeDistance[startIndex];
  const endDistance = track.cumulativeDistance[endIndex];
  const weight = endDistance > startDistance ? (wrappedDistance - startDistance) / (endDistance - startDistance) : 0;
  const start = track.samples[startIndex].position;
  const end = track.samples[endIndex].position;
  outPosition.set(
    start[0] + (end[0] - start[0]) * weight,
    start[1] + (end[1] - start[1]) * weight,
    start[2] + (end[2] - start[2]) * weight
  );
  outTangent.set(end[0] - start[0], end[1] - start[1], end[2] - start[2]).normalize();
  return true;
}

/** Demo-only scenic dressing and provider-driven drift objects for the River hero. */
export class RiverShowcaseSceneController {
  readonly root: Entity;

  private readonly _environmentRoot: Entity;
  private readonly _driftRoot: Entity;
  private readonly _meshes: ModelMesh[] = [];
  private readonly _materials: BlinnPhongMaterial[] = [];
  private readonly _position = new Vector3();
  private readonly _tangent = new Vector3(0, 0, 1);
  private readonly _queryPosition = new Vector3();
  private readonly _queryResult = createRiverNetworkQueryResult();
  private readonly _unitCube: ModelMesh;
  private readonly _unitSphere: ModelMesh;
  private readonly _unitCylinder: ModelMesh;
  private readonly _unitCone: ModelMesh;
  private _queryService?: RiverNetworkQueryService;
  private _drifts: DriftRuntime[] = [];
  private _enabled = false;
  private _fixtureObjectCount = 0;
  private _treeCount = 0;
  private _bridgeCount = 0;
  private _driftQueryHitCount = 0;
  private _maxDownstreamDistance = 0;
  private _finite = true;

  constructor(
    private readonly _engine: Engine,
    parent: Entity
  ) {
    this.root = parent.createChild("river-showcase-scene");
    this._environmentRoot = this.root.createChild("river-showcase-environment");
    this._driftRoot = this.root.createChild("river-showcase-drift");
    this._unitCube = this._trackMesh(PrimitiveMesh.createCuboid(this._engine, 1, 1, 1));
    this._unitSphere = this._trackMesh(PrimitiveMesh.createSphere(this._engine, 1, 14));
    this._unitCylinder = this._trackMesh(PrimitiveMesh.createCylinder(this._engine, 0.5, 0.5, 1, 12, 1));
    this._unitCone = this._trackMesh(PrimitiveMesh.createCone(this._engine, 0.5, 1, 12, 1));
    this.root.isActive = false;
  }

  get metrics(): Readonly<RiverShowcaseSceneMetrics> {
    return Object.freeze({
      enabled: this._enabled,
      fixtureObjectCount: this._enabled ? this._fixtureObjectCount : 0,
      treeCount: this._enabled ? this._treeCount : 0,
      bridgeCount: this._enabled ? this._bridgeCount : 0,
      activeDriftCount: this._enabled ? this._drifts.length : 0,
      driftQueryHitCount: this._enabled ? this._driftQueryHitCount : 0,
      maxDownstreamDistance: this._enabled ? this._maxDownstreamDistance : 0,
      finite: this._finite
    });
  }

  rebuild(data: RiverCompiledData, queryService: RiverNetworkQueryService, enabled: boolean): void {
    this._clearChildren(this._environmentRoot);
    this._clearChildren(this._driftRoot);
    for (const material of this._materials) material.destroy(true);
    this._materials.length = 0;
    this._queryService = queryService;
    this._drifts = [];
    this._fixtureObjectCount = 0;
    this._treeCount = 0;
    this._bridgeCount = 0;
    this._driftQueryHitCount = 0;
    this._maxDownstreamDistance = 0;
    this._finite = true;
    this._enabled = enabled;
    this.root.isActive = enabled;
    if (!enabled) return;

    const terrainHeight = createWaterTerrainHeightSampler(data, WaterDecorationStyle.HeightfieldRiver);
    const foliage = this._createMaterial("RiverShowcaseFoliage", [0.055, 0.23, 0.13, 1], 16);
    const foliageLight = this._createMaterial("RiverShowcaseFoliageLight", [0.1, 0.34, 0.18, 1], 18);
    const trunk = this._createMaterial("RiverShowcaseTrunk", [0.23, 0.13, 0.065, 1], 9);
    const bridge = this._createMaterial("RiverShowcaseBridge", [0.32, 0.19, 0.085, 1], 24);
    const mountain = this._createMaterial("RiverShowcaseMountain", [0.13, 0.19, 0.17, 1], 6);
    const drift = this._createMaterial("RiverShowcaseDriftWood", [0.38, 0.21, 0.08, 1], 22);

    for (let index = 0; index < RIVER_SHOWCASE_TREE_POSITIONS.length; index++) {
      const [x, , z] = RIVER_SHOWCASE_TREE_POSITIONS[index];
      const y = terrainHeight(x, z);
      this._createPrimitive(`tree-${index}-trunk`, this._unitCylinder, trunk, [x, y + 1.25, z], [0.42, 2.5, 0.42]);
      this._createPrimitive(
        `tree-${index}-crown`,
        this._unitCone,
        index % 2 === 0 ? foliage : foliageLight,
        [x, y + 3.4, z],
        [2.1, 4.4, 2.1]
      );
      this._treeCount++;
    }

    this._createPrimitive("distant-mountain-left", this._unitSphere, mountain, [-58, 9, -55], [22, 15, 18]);
    this._createPrimitive("distant-mountain-center", this._unitSphere, mountain, [-12, 12, -64], [27, 18, 17]);
    this._createPrimitive("distant-mountain-right", this._unitSphere, mountain, [38, 8, -55], [19, 13, 16]);

    this._queryPosition.set(10, 0, 2);
    queryService.sampleSurface(this._queryPosition, this._queryResult);
    const bridgeY = (this._queryResult.hit ? this._queryResult.surfaceHeight : terrainHeight(10, 2)) + 1.1;
    this._createPrimitive(
      "bridge-deck",
      this._unitCube,
      bridge,
      [10, bridgeY, 2],
      [1.2, 0.35, 13],
      this._environmentRoot,
      [0, 68, 0]
    );
    this._createPrimitive(
      "bridge-rail-left",
      this._unitCube,
      bridge,
      [9.45, bridgeY + 0.75, 2],
      [0.18, 1.25, 13],
      this._environmentRoot,
      [0, 68, 0]
    );
    this._createPrimitive(
      "bridge-rail-right",
      this._unitCube,
      bridge,
      [10.55, bridgeY + 0.75, 2],
      [0.18, 1.25, 13],
      this._environmentRoot,
      [0, 68, 0]
    );
    this._bridgeCount = 1;

    for (let index = 0; index < DRIFT_ROUTE_IDS.length; index++) {
      const track = createTrack(combineReachSamples(data, DRIFT_ROUTE_IDS[index]));
      if (track.totalDistance <= 0) continue;
      const entity = this._createPrimitive(
        `drift-log-${index}`,
        this._unitCube,
        drift,
        [0, 0, 0],
        [0.48, 0.3, 2.1],
        this._driftRoot
      );
      this._drifts.push({
        entity,
        track,
        offset: track.totalDistance * (0.12 + index * 0.27),
        speed: 1.15 + index * 0.22
      });
    }
  }

  update(elapsedTime: number): void {
    const queryService = this._queryService;
    if (!this._enabled || !queryService) return;
    this._driftQueryHitCount = 0;
    this._maxDownstreamDistance = 0;
    this._finite = true;
    for (let index = 0; index < this._drifts.length; index++) {
      const drift = this._drifts[index];
      const downstreamDistance = elapsedTime * drift.speed + drift.offset;
      if (!sampleTrack(drift.track, downstreamDistance, this._position, this._tangent)) continue;
      this._queryPosition.copyFrom(this._position);
      const hit = queryService.sampleSurface(this._queryPosition, this._queryResult);
      if (hit) {
        this._driftQueryHitCount++;
        this._position.y = this._queryResult.surfaceHeight + 0.17;
        const flow = this._queryResult.flowVector;
        if (Math.hypot(flow.x, flow.z) > 0.001) this._tangent.set(flow.x, 0, flow.z).normalize();
      }
      const yaw = Math.atan2(this._tangent.x, this._tangent.z) * RAD_TO_DEG;
      const roll = Math.sin(elapsedTime * 1.4 + index * 1.7) * 5;
      drift.entity.transform.setPosition(this._position.x, this._position.y, this._position.z);
      drift.entity.transform.setRotation(0, yaw, roll);
      this._maxDownstreamDistance = Math.max(
        this._maxDownstreamDistance,
        downstreamDistance % drift.track.totalDistance
      );
      this._finite =
        this._finite &&
        Number.isFinite(this._position.x) &&
        Number.isFinite(this._position.y) &&
        Number.isFinite(this._position.z) &&
        Number.isFinite(yaw);
    }
  }

  destroy(): void {
    this.root.destroy();
    for (const mesh of this._meshes) mesh.destroy(true);
    for (const material of this._materials) material.destroy(true);
    this._meshes.length = 0;
    this._materials.length = 0;
    this._drifts = [];
  }

  private _createMaterial(name: string, color: ColorTuple, shininess: number): BlinnPhongMaterial {
    const material = new BlinnPhongMaterial(this._engine);
    material.name = name;
    material.baseColor = new Color(...color);
    material.emissiveColor = new Color(color[0] * 0.035, color[1] * 0.035, color[2] * 0.035, 1);
    material.specularColor = new Color(0.08, 0.1, 0.09, 1);
    material.shininess = shininess;
    this._materials.push(material);
    return material;
  }

  private _createPrimitive(
    name: string,
    mesh: ModelMesh,
    material: BlinnPhongMaterial,
    position: Vector3Tuple,
    scale: Vector3Tuple,
    parent: Entity = this._environmentRoot,
    rotation: Vector3Tuple = [0, 0, 0]
  ): Entity {
    const entity = parent.createChild(name);
    entity.transform.setPosition(...position);
    entity.transform.setRotation(...rotation);
    entity.transform.setScale(...scale);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    this._fixtureObjectCount++;
    return entity;
  }

  private _trackMesh(mesh: ModelMesh): ModelMesh {
    this._meshes.push(mesh);
    return mesh;
  }

  private _clearChildren(parent: Entity): void {
    while (parent.children.length > 0) parent.children[parent.children.length - 1].destroy();
  }
}
