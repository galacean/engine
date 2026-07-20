/** Cached network-level debug overlays for topology, chunks, terrain corridors, and query cells. */
import { Engine, MeshRenderer, ModelMesh, UnlitMaterial, type Entity } from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { RiverChunkSourceKind } from "../../compiler/river/RiverGeometryEnums";
import { RIVER_TERRAIN_CORRIDOR_COMPONENT } from "../../compiler/river/constants";
import type { RiverCompiledData, ReadonlyVector3Tuple } from "../../compiler/river/types";
import type { RiverDebugTarget, RiverNetworkOverlay } from "./RiverDebugSession";
import { buildLineSegmentsMesh } from "./RiverDebugMeshBuilder";

const OVERLAY_Y_OFFSET = 0.28;

function pushSegment(
  points: Vector3[],
  a: ReadonlyVector3Tuple,
  b: ReadonlyVector3Tuple,
  yOffset = OVERLAY_Y_OFFSET
): void {
  points.push(new Vector3(a[0], a[1] + yOffset, a[2]), new Vector3(b[0], b[1] + yOffset, b[2]));
}

function pushLoop(points: Vector3[], loop: readonly ReadonlyVector3Tuple[], yOffset = OVERLAY_Y_OFFSET): void {
  if (loop.length < 2) return;
  for (let index = 0; index < loop.length; index++) {
    pushSegment(points, loop[index], loop[(index + 1) % loop.length], yOffset);
  }
}

function pushNodeMarker(points: Vector3[], position: ReadonlyVector3Tuple, size: number): void {
  const [x, y, z] = position;
  points.push(
    new Vector3(x - size, y + OVERLAY_Y_OFFSET, z),
    new Vector3(x + size, y + OVERLAY_Y_OFFSET, z),
    new Vector3(x, y + OVERLAY_Y_OFFSET, z - size),
    new Vector3(x, y + OVERLAY_Y_OFFSET, z + size),
    new Vector3(x, y - size + OVERLAY_Y_OFFSET, z),
    new Vector3(x, y + size + OVERLAY_Y_OFFSET, z)
  );
}

function pushDirectionArrow(points: Vector3[], from: ReadonlyVector3Tuple, to: ReadonlyVector3Tuple): void {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return;
  const directionX = dx / length;
  const directionZ = dz / length;
  const normalX = -directionZ;
  const normalZ = directionX;
  const tip: ReadonlyVector3Tuple = [from[0] + dx * 0.62, from[1] + (to[1] - from[1]) * 0.62, from[2] + dz * 0.62];
  const arrowLength = Math.min(1.5, Math.max(0.55, length * 0.12));
  const wing = arrowLength * 0.5;
  const baseX = tip[0] - directionX * arrowLength;
  const baseZ = tip[2] - directionZ * arrowLength;
  pushSegment(points, tip, [baseX + normalX * wing, tip[1], baseZ + normalZ * wing]);
  pushSegment(points, tip, [baseX - normalX * wing, tip[1], baseZ - normalZ * wing]);
}

function targetMatchesSource(
  data: RiverCompiledData,
  target: RiverDebugTarget,
  sourceKind: RiverChunkSourceKind,
  sourceIndex: number,
  chunkId?: string
): boolean {
  switch (target.kind) {
    case "reach":
      return sourceKind === RiverChunkSourceKind.Reach && data.reaches[sourceIndex]?.id === target.id;
    case "junction":
      return sourceKind === RiverChunkSourceKind.Junction && data.junctions[sourceIndex]?.id === target.id;
    case "chunk":
      return chunkId === target.id;
    default:
      return true;
  }
}

function buildTopology(data: RiverCompiledData, target: RiverDebugTarget): Vector3[] {
  const points: Vector3[] = [];
  for (const reach of data.reaches) {
    if (target.kind !== "network" && !(target.kind === "reach" && target.id === reach.id)) continue;
    const from = data.nodes[reach.fromNodeIndex].position;
    const to = data.nodes[reach.toNodeIndex].position;
    pushSegment(points, from, to);
    pushDirectionArrow(points, from, to);
    pushNodeMarker(points, from, 0.65);
    pushNodeMarker(points, to, 0.65);
  }
  for (const junction of data.junctions) {
    if (target.kind !== "network" && !(target.kind === "junction" && target.id === junction.id)) continue;
    pushLoop(points, junction.queryBoundary);
    pushNodeMarker(points, junction.position, Math.max(0.7, junction.mergeRadius * 0.16));
  }
  return points;
}

function buildChunks(data: RiverCompiledData, target: RiverDebugTarget, junctionOnly: boolean): Vector3[] {
  const points: Vector3[] = [];
  for (const chunk of data.chunks) {
    if (junctionOnly && chunk.sourceKind !== RiverChunkSourceKind.Junction) continue;
    if (!targetMatchesSource(data, target, chunk.sourceKind, chunk.sourceIndex, chunk.id)) continue;
    const bounds = chunk.surfaceGeometry.bounds;
    const minX = bounds.min[0] + chunk.localOrigin[0];
    const minZ = bounds.min[2] + chunk.localOrigin[2];
    const maxX = bounds.max[0] + chunk.localOrigin[0];
    const maxZ = bounds.max[2] + chunk.localOrigin[2];
    const y = bounds.max[1] + chunk.localOrigin[1] + OVERLAY_Y_OFFSET;
    const loop: ReadonlyVector3Tuple[] = [
      [minX, y, minZ],
      [maxX, y, minZ],
      [maxX, y, maxZ],
      [minX, y, maxZ]
    ];
    pushLoop(points, loop, 0);
    pushNodeMarker(points, [chunk.localOrigin[0], y, chunk.localOrigin[2]], 0.42);
  }
  return points;
}

function buildTerrainCorridors(data: RiverCompiledData, target: RiverDebugTarget): Vector3[] {
  const points: Vector3[] = [];
  for (const corridor of data.terrainInteraction.reachCorridors) {
    const reach = data.reaches[corridor.reachIndex];
    if (!reach || (target.kind !== "network" && !(target.kind === "reach" && target.id === reach.id))) continue;
    const values = corridor.samples.toTypedArray();
    const left: ReadonlyVector3Tuple[] = [];
    const right: ReadonlyVector3Tuple[] = [];
    for (let index = 0; index < corridor.sampleCount; index++) {
      const offset = index * corridor.stride;
      const previousOffset = Math.max(0, index - 1) * corridor.stride;
      const nextOffset = Math.min(corridor.sampleCount - 1, index + 1) * corridor.stride;
      const tangentX =
        values[nextOffset + RIVER_TERRAIN_CORRIDOR_COMPONENT.x] -
        values[previousOffset + RIVER_TERRAIN_CORRIDOR_COMPONENT.x];
      const tangentZ =
        values[nextOffset + RIVER_TERRAIN_CORRIDOR_COMPONENT.z] -
        values[previousOffset + RIVER_TERRAIN_CORRIDOR_COMPONENT.z];
      const length = Math.hypot(tangentX, tangentZ) || 1;
      const normalX = -tangentZ / length;
      const normalZ = tangentX / length;
      const x = values[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.x];
      const z = values[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.z];
      const y = values[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.waterSurfaceY];
      const radius = values[offset + RIVER_TERRAIN_CORRIDOR_COMPONENT.vegetationExclusionRadius];
      left.push([x + normalX * radius, y, z + normalZ * radius]);
      right.push([x - normalX * radius, y, z - normalZ * radius]);
    }
    for (let index = 1; index < left.length; index++) {
      pushSegment(points, left[index - 1], left[index]);
      pushSegment(points, right[index - 1], right[index]);
    }
  }
  for (const corridor of data.terrainInteraction.junctionCorridors) {
    const junction = data.junctions[corridor.junctionIndex];
    if (!junction || (target.kind !== "network" && !(target.kind === "junction" && target.id === junction.id)))
      continue;
    pushLoop(points, corridor.boundary);
  }
  return points;
}

function buildQueryGrid(data: RiverCompiledData): Vector3[] {
  const points: Vector3[] = [];
  const { queryIndex } = data;
  const coordinates = queryIndex.cellCoordinates.toTypedArray();
  const y = data.stats.maxWaterSurfaceElevation + OVERLAY_Y_OFFSET;
  for (let index = 0; index < queryIndex.cellCount; index++) {
    const x = coordinates[index * 2] * queryIndex.cellSize;
    const z = coordinates[index * 2 + 1] * queryIndex.cellSize;
    pushLoop(
      points,
      [
        [x, y, z],
        [x + queryIndex.cellSize, y, z],
        [x + queryIndex.cellSize, y, z + queryIndex.cellSize],
        [x, y, z + queryIndex.cellSize]
      ],
      0
    );
  }
  return points;
}

function buildOverlay(data: RiverCompiledData, overlay: RiverNetworkOverlay, target: RiverDebugTarget): Vector3[] {
  switch (overlay) {
    case "topology":
      return buildTopology(data, target);
    case "chunks":
      return buildChunks(data, target, false);
    case "junctions":
      return buildChunks(data, target, true);
    case "terrain-corridor":
      return buildTerrainCorridors(data, target);
    case "query-grid":
      return buildQueryGrid(data);
    default:
      return [];
  }
}

export class RiverNetworkDebugController {
  private readonly _root: Entity;
  private readonly _renderer: MeshRenderer;
  private readonly _material: UnlitMaterial;
  private readonly _meshes = new Map<string, ModelMesh>();

  constructor(engine: Engine, parent: Entity) {
    this._root = parent.createChild("river-network-debug");
    this._renderer = this._root.createChild("river-network-debug-lines").addComponent(MeshRenderer);
    this._material = new UnlitMaterial(engine);
    this._material.baseColor = new Color(0.42, 0.92, 1, 1);
    this._renderer.setMaterial(this._material);
    this._root.isActive = false;
  }

  update(
    engine: Engine,
    data: RiverCompiledData,
    resourceHash: string,
    overlay: RiverNetworkOverlay,
    target: RiverDebugTarget
  ): void {
    if (overlay === "off") {
      this._root.isActive = false;
      return;
    }
    const targetToken = target.kind === "network" ? "network" : `${target.kind}:${target.id ?? ""}`;
    const key = `${resourceHash}:${overlay}:${targetToken}`;
    let mesh = this._meshes.get(key);
    if (!mesh) {
      mesh = buildLineSegmentsMesh(engine, buildOverlay(data, overlay, target), new Color(0.42, 0.92, 1, 1));
      mesh.isGCIgnored = true;
      this._meshes.set(key, mesh);
    }
    this._renderer.mesh = mesh;
    this._root.isActive = true;
  }

  destroy(): void {
    this._root.destroy();
    for (const mesh of this._meshes.values()) mesh.destroy(true);
    this._meshes.clear();
    this._material.destroy(true);
  }
}
