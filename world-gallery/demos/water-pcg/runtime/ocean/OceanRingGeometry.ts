/** Camera-relative Ocean clip rings with immutable GPU topology. */
import { Engine, Entity, Layer, Material, MeshRenderer, ModelMesh } from "@galacean/engine-core";
import { Vector2, Vector3 } from "@galacean/engine-math";

const CENTRAL_PATCH_SCALE = 4;
const RING_GRID_SIDE = 4;
const RING_HOLE_MIN_INDEX = 1;
const RING_HOLE_MAX_INDEX = 2;
const MIN_PATCH_SEGMENTS = 2;
const DEFAULT_SKIRT_DEPTH = 1.5;

export const OCEAN_RING_DEFAULT_LAYER = Layer.Layer30;

export const enum OceanPatchSkirt {
  None = 0,
  NegativeX = 1 << 0,
  PositiveX = 1 << 1,
  NegativeZ = 1 << 2,
  PositiveZ = 1 << 3,
  All = NegativeX | PositiveX | NegativeZ | PositiveZ
}

export interface OceanRingGeometryConfig {
  readonly size: number;
  readonly ringCount: 2 | 3;
  readonly patchSegments: number;
  readonly waterLevel: number;
  readonly maxHorizontalDisplacement: number;
  readonly maxVerticalDisplacement: number;
  readonly skirtDepth?: number;
  readonly layer?: Layer;
}

export interface OceanRingPatchDescriptor {
  readonly id: string;
  readonly lod: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly size: number;
  readonly segmentCount: number;
  readonly skirtMask: OceanPatchSkirt;
}

export interface OceanRingLayout {
  readonly ringCount: 2 | 3;
  readonly basePatchSize: number;
  readonly baseCellSize: number;
  readonly coverageHalfExtent: number;
  readonly patches: readonly OceanRingPatchDescriptor[];
}

export interface OceanRingGeometryMetrics {
  readonly ringCount: number;
  readonly patchCount: number;
  readonly visiblePatchCount: number;
  readonly drawCount: number;
  readonly triangleCount: number;
  readonly visibleTriangleCount: number;
  readonly vertexCount: number;
  readonly meshCreateCount: number;
  readonly meshUploadCount: number;
  readonly originSnapCount: number;
  readonly originX: number;
  readonly originZ: number;
  readonly baseCellSize: number;
  readonly coverageHalfExtent: number;
  readonly perFrameMeshUpload: false;
}

interface OceanPatchTopology {
  readonly positions: Vector3[];
  readonly uvs: Vector2[];
  readonly indices: Uint16Array | Uint32Array;
}

interface OceanPatchRuntime {
  readonly descriptor: OceanRingPatchDescriptor;
  readonly entity: Entity;
  readonly renderer: MeshRenderer;
  readonly mesh: ModelMesh;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

function normalizeFinitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function outerSkirtMask(x: number, z: number): OceanPatchSkirt {
  let mask = OceanPatchSkirt.None;
  if (x === 0) mask |= OceanPatchSkirt.NegativeX;
  if (x === RING_GRID_SIDE - 1) mask |= OceanPatchSkirt.PositiveX;
  if (z === 0) mask |= OceanPatchSkirt.NegativeZ;
  if (z === RING_GRID_SIDE - 1) mask |= OceanPatchSkirt.PositiveZ;
  return mask;
}

export function createOceanRingLayout(config: OceanRingGeometryConfig): OceanRingLayout {
  const ringCount = config.ringCount;
  const size = normalizeFinitePositive(config.size, 1);
  const patchSegments = Math.max(MIN_PATCH_SEGMENTS, Math.floor(config.patchSegments));
  const basePatchSize = size / 2 ** (ringCount + 2);
  const patches: OceanRingPatchDescriptor[] = [
    Object.freeze({
      id: "central",
      lod: 0,
      centerX: 0,
      centerZ: 0,
      size: basePatchSize * CENTRAL_PATCH_SCALE,
      segmentCount: patchSegments * CENTRAL_PATCH_SCALE,
      skirtMask: OceanPatchSkirt.All
    })
  ];

  for (let lod = 1; lod <= ringCount; lod++) {
    const patchSize = basePatchSize * 2 ** lod;
    for (let z = 0; z < RING_GRID_SIDE; z++) {
      for (let x = 0; x < RING_GRID_SIDE; x++) {
        const insideHole =
          x >= RING_HOLE_MIN_INDEX && x <= RING_HOLE_MAX_INDEX && z >= RING_HOLE_MIN_INDEX && z <= RING_HOLE_MAX_INDEX;
        if (insideHole) continue;
        patches.push(
          Object.freeze({
            id: `ring-${lod}-${x}-${z}`,
            lod,
            centerX: (x - (RING_GRID_SIDE - 1) * 0.5) * patchSize,
            centerZ: (z - (RING_GRID_SIDE - 1) * 0.5) * patchSize,
            size: patchSize,
            segmentCount: patchSegments,
            // The finer inner level owns a downward skirt at every 2:1 boundary.
            skirtMask: outerSkirtMask(x, z)
          })
        );
      }
    }
  }

  return Object.freeze({
    ringCount,
    basePatchSize,
    baseCellSize: basePatchSize / patchSegments,
    coverageHalfExtent: size * 0.5,
    patches: Object.freeze(patches)
  });
}

function appendSkirt(
  positions: Vector3[],
  uvs: Vector2[],
  indices: number[],
  edgeIndices: readonly number[],
  skirtDepth: number
): void {
  const skirtStart = positions.length;
  for (const sourceIndex of edgeIndices) {
    const source = positions[sourceIndex];
    const sourceUv = uvs[sourceIndex];
    positions.push(new Vector3(source.x, source.y - skirtDepth, source.z));
    uvs.push(new Vector2(sourceUv.x, sourceUv.y));
  }
  for (let index = 0; index < edgeIndices.length - 1; index++) {
    const topA = edgeIndices[index];
    const topB = edgeIndices[index + 1];
    const bottomA = skirtStart + index;
    const bottomB = bottomA + 1;
    indices.push(topA, bottomA, topB, topB, bottomA, bottomB);
  }
}

export function createOceanRingPatchTopology(
  descriptor: OceanRingPatchDescriptor,
  skirtDepth = DEFAULT_SKIRT_DEPTH
): OceanPatchTopology {
  const segmentCount = descriptor.segmentCount;
  const vertexSide = segmentCount + 1;
  const halfSize = descriptor.size * 0.5;
  const positions: Vector3[] = [];
  const uvs: Vector2[] = [];
  const indexValues: number[] = [];

  for (let z = 0; z <= segmentCount; z++) {
    for (let x = 0; x <= segmentCount; x++) {
      positions.push(
        new Vector3((x / segmentCount) * descriptor.size - halfSize, 0, (z / segmentCount) * descriptor.size - halfSize)
      );
      uvs.push(new Vector2(x / segmentCount, z / segmentCount));
    }
  }
  for (let z = 0; z < segmentCount; z++) {
    for (let x = 0; x < segmentCount; x++) {
      const a = z * vertexSide + x;
      const b = a + 1;
      const c = a + vertexSide;
      const d = c + 1;
      indexValues.push(a, c, b, b, c, d);
    }
  }

  const negativeX: number[] = [];
  const positiveX: number[] = [];
  const negativeZ: number[] = [];
  const positiveZ: number[] = [];
  for (let index = 0; index <= segmentCount; index++) {
    negativeX.push(index * vertexSide);
    positiveX.push(index * vertexSide + segmentCount);
    negativeZ.push(index);
    positiveZ.push(segmentCount * vertexSide + index);
  }
  if (descriptor.skirtMask & OceanPatchSkirt.NegativeX) {
    appendSkirt(positions, uvs, indexValues, negativeX, skirtDepth);
  }
  if (descriptor.skirtMask & OceanPatchSkirt.PositiveX) {
    appendSkirt(positions, uvs, indexValues, positiveX, skirtDepth);
  }
  if (descriptor.skirtMask & OceanPatchSkirt.NegativeZ) {
    appendSkirt(positions, uvs, indexValues, negativeZ, skirtDepth);
  }
  if (descriptor.skirtMask & OceanPatchSkirt.PositiveZ) {
    appendSkirt(positions, uvs, indexValues, positiveZ, skirtDepth);
  }

  const indices = positions.length > 65535 ? new Uint32Array(indexValues) : new Uint16Array(indexValues);
  return { positions, uvs, indices };
}

export class OceanRingGeometry {
  readonly root: Entity;
  readonly layout: OceanRingLayout;
  readonly layer: Layer;
  private readonly _patches: OceanPatchRuntime[] = [];
  private _waterLevel: number;
  private _maxHorizontalDisplacement: number;
  private _maxVerticalDisplacement: number;
  private readonly _skirtDepth: number;
  private _meshCreateCount = 0;
  private _meshUploadCount = 0;
  private _originSnapCount = 0;
  private _originX = 0;
  private _originZ = 0;
  private _destroyed = false;

  constructor(
    private readonly _engine: Engine,
    parent: Entity,
    material: Material,
    config: OceanRingGeometryConfig
  ) {
    this.layout = createOceanRingLayout(config);
    this.layer = config.layer ?? OCEAN_RING_DEFAULT_LAYER;
    this._waterLevel = config.waterLevel;
    this._maxHorizontalDisplacement = Math.max(0, config.maxHorizontalDisplacement);
    this._maxVerticalDisplacement = Math.max(0, config.maxVerticalDisplacement);
    this._skirtDepth = normalizeFinitePositive(config.skirtDepth ?? DEFAULT_SKIRT_DEPTH, DEFAULT_SKIRT_DEPTH);
    this.root = parent.createChild("ocean-rings");
    this.root.layer = this.layer;

    for (const descriptor of this.layout.patches) {
      const topology = createOceanRingPatchTopology(descriptor, this._skirtDepth);
      const mesh = new ModelMesh(this._engine);
      mesh.setPositions(topology.positions);
      mesh.setUVs(topology.uvs);
      mesh.setIndices(topology.indices);
      mesh.addSubMesh(0, topology.indices.length);
      this._setMeshBounds(mesh, descriptor.size);
      mesh.uploadData(true);
      const entity = this.root.createChild(descriptor.id);
      entity.layer = this.layer;
      entity.transform.setPosition(descriptor.centerX, 0, descriptor.centerZ);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      renderer.shaderData.setFloat("renderer_OceanLod", descriptor.lod);
      this._patches.push({
        descriptor,
        entity,
        renderer,
        mesh,
        vertexCount: topology.positions.length,
        triangleCount: topology.indices.length / 3
      });
      this._meshCreateCount++;
      this._meshUploadCount++;
    }
  }

  get metrics(): OceanRingGeometryMetrics {
    let visiblePatchCount = 0;
    let triangleCount = 0;
    let visibleTriangleCount = 0;
    let vertexCount = 0;
    for (const patch of this._patches) {
      const visible = !patch.renderer.isCulled;
      visiblePatchCount += visible ? 1 : 0;
      triangleCount += patch.triangleCount;
      visibleTriangleCount += visible ? patch.triangleCount : 0;
      vertexCount += patch.vertexCount;
    }
    return Object.freeze({
      ringCount: this.layout.ringCount,
      patchCount: this._patches.length,
      visiblePatchCount,
      drawCount: visiblePatchCount,
      triangleCount,
      visibleTriangleCount,
      vertexCount,
      meshCreateCount: this._meshCreateCount,
      meshUploadCount: this._meshUploadCount,
      originSnapCount: this._originSnapCount,
      originX: this._originX,
      originZ: this._originZ,
      baseCellSize: this.layout.baseCellSize,
      coverageHalfExtent: this.layout.coverageHalfExtent,
      perFrameMeshUpload: false
    });
  }

  setMaterial(material: Material): void {
    for (const patch of this._patches) patch.renderer.setMaterial(material);
  }

  setLodDebug(enabled: boolean): void {
    for (const patch of this._patches) {
      patch.renderer.shaderData.setFloat("renderer_OceanLodDebug", enabled ? 1 : 0);
    }
  }

  setWaveBounds(waterLevel: number, maxHorizontalDisplacement: number, maxVerticalDisplacement: number): void {
    this._waterLevel = waterLevel;
    this._maxHorizontalDisplacement = Math.max(0, maxHorizontalDisplacement);
    this._maxVerticalDisplacement = Math.max(0, maxVerticalDisplacement);
    for (const patch of this._patches) this._setMeshBounds(patch.mesh, patch.descriptor.size);
  }

  updateCameraPosition(worldX: number, worldZ: number): boolean {
    if (this._destroyed) return false;
    const cellSize = this.layout.baseCellSize;
    const nextX = Math.round(worldX / cellSize) * cellSize || 0;
    const nextZ = Math.round(worldZ / cellSize) * cellSize || 0;
    if (nextX === this._originX && nextZ === this._originZ) return false;
    this._originX = nextX;
    this._originZ = nextZ;
    this._originSnapCount++;
    this.root.transform.setPosition(nextX, 0, nextZ);
    return true;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.root.destroy();
    for (const patch of this._patches) patch.mesh.destroy(true);
    this._patches.length = 0;
  }

  private _setMeshBounds(mesh: ModelMesh, patchSize: number): void {
    const horizontalExtent = patchSize * 0.5 + this._maxHorizontalDisplacement;
    mesh.bounds.min.set(
      -horizontalExtent,
      this._waterLevel - this._maxVerticalDisplacement - this._skirtDepth,
      -horizontalExtent
    );
    mesh.bounds.max.set(horizontalExtent, this._waterLevel + this._maxVerticalDisplacement, horizontalExtent);
  }
}
