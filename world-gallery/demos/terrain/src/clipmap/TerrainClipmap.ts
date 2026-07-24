import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Camera,
  Engine,
  Entity,
  IndexFormat,
  MeshTopology,
  Script,
  Vector3,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import { TerrainData } from "../data/TerrainData";
import { TerrainMaterial } from "../TerrainMaterial";
import { TerrainRenderer } from "../TerrainRenderer";

const TILE = 0;
const EDGE_A = 1;
const EDGE_B = 2;
const FILL_A = 3;
const FILL_B = 4;

type Offset = readonly [x: number, z: number];

interface Segment {
  readonly entity: Entity;
  readonly wireEntity: Entity;
  readonly lod: number;
  readonly group: number;
  readonly instance: number;
}

/** Read-only placement used by deterministic clipmap diagnostics. */
export interface TerrainClipmapSegmentSnapshot {
  readonly lod: number;
  readonly group: "tile" | "edge-a" | "edge-b" | "fill-a" | "fill-b";
  readonly instance: number;
  readonly position: readonly [x: number, z: number];
  readonly scale: number;
}

/** Exact terrain geometry-clipmap segment topology and camera snapping. */
export class TerrainClipmap {
  readonly segmentCount: number;

  private readonly _segments: Segment[] = [];
  private readonly _vertexSpacing: number;
  private readonly _offsets: ClipmapOffsets;
  private _lastSignature = "";

  /**
   * Builds all terrain clipmap rings once and starts tracking a camera.
   * @param engine Engine used to allocate shared meshes.
   * @param root Identity-transform entity receiving the clipmap segments.
   * @param camera Camera whose world XZ position controls snapping.
   * @param data Terrain region dimensions and height bounds.
   * @param material Shared terrain material.
   * @param meshSize terrain mesh size in quads.
   * @param meshLods Number of simultaneously active clipmap rings.
   */
  constructor(
    engine: Engine,
    root: Entity,
    camera: Camera,
    data: TerrainData,
    material: TerrainMaterial,
    meshSize: number,
    meshLods: number
  ) {
    this._vertexSpacing = data.vertexSpacing;
    this._offsets = createOffsets(meshSize);

    const meshes = createMeshTypes(engine, meshSize, data.minHeight, data.maxHeight);
    for (let lod = 0; lod < meshLods; lod++) {
      this._createGroup(
        root,
        material,
        lod,
        TILE,
        lod === 0 ? meshes.standardTile : meshes.tile,
        lod === 0 ? meshes.standardTileWire : meshes.tileWire,
        lod === 0 ? 16 : 12
      );
      this._createGroup(
        root,
        material,
        lod,
        EDGE_A,
        lod === 0 ? meshes.standardEdgeA : meshes.edgeA,
        lod === 0 ? meshes.standardEdgeAWire : meshes.edgeAWire,
        2
      );
      this._createGroup(
        root,
        material,
        lod,
        EDGE_B,
        lod === 0 ? meshes.standardEdgeB : meshes.edgeB,
        lod === 0 ? meshes.standardEdgeBWire : meshes.edgeBWire,
        2
      );
      this._createGroup(
        root,
        material,
        lod,
        FILL_A,
        lod === 0 ? meshes.standardTrimA : meshes.fillA,
        lod === 0 ? meshes.standardTrimAWire : meshes.fillAWire,
        2
      );
      this._createGroup(
        root,
        material,
        lod,
        FILL_B,
        lod === 0 ? meshes.standardTrimB : meshes.fillB,
        lod === 0 ? meshes.standardTrimBWire : meshes.fillBWire,
        2
      );
    }
    this.segmentCount = this._segments.length;

    const follower = root.addComponent(TerrainClipmapFollower);
    follower.initialize(this, camera);
    this.snap(camera.entity.transform.worldPosition);
  }

  /**
   * Snaps every clipmap ring to the supplied world position using terrain's per-LOD grid.
   * @param trackedPosition World-space camera/tracker position.
   */
  snap(trackedPosition: Vector3): void {
    const signatures: number[] = [];
    for (let lod = 0; lod < this._lodCount(); lod++) {
      const snapStep = 2 ** (lod + 1) * this._vertexSpacing;
      const nextSnapStep = 2 ** (lod + 2) * this._vertexSpacing;
      const snapX = roundHalfAwayFromZero(trackedPosition.x / snapStep) * snapStep;
      const snapZ = roundHalfAwayFromZero(trackedPosition.z / snapStep) * snapStep;
      const nextX = roundHalfAwayFromZero(trackedPosition.x / nextSnapStep) * nextSnapStep;
      const nextZ = roundHalfAwayFromZero(trackedPosition.z / nextSnapStep) * nextSnapStep;
      const testX = clamp(roundHalfAwayFromZero((snapX - nextX) / snapStep) + 1, 0, 2);
      const testZ = clamp(roundHalfAwayFromZero((snapZ - nextZ) / snapStep) + 1, 0, 2);
      signatures.push(snapX, snapZ, testX, testZ);
    }
    const signature = signatures.join(",");
    if (signature === this._lastSignature) return;
    this._lastSignature = signature;

    let signatureIndex = 0;
    for (let lod = 0; lod < this._lodCount(); lod++) {
      const snapX = signatures[signatureIndex++];
      const snapZ = signatures[signatureIndex++];
      const testX = signatures[signatureIndex++];
      const testZ = signatures[signatureIndex++];
      const scale = 2 ** lod * this._vertexSpacing;
      for (const segment of this._segments) {
        if (segment.lod !== lod) continue;
        const [offsetX, offsetZ] = this._resolveOffset(segment, testX, testZ);
        segment.entity.transform.setScale(scale, 1, scale);
        segment.entity.transform.setPosition(offsetX * scale + snapX, 0, offsetZ * scale + snapZ);
        segment.wireEntity.transform.setScale(scale, 1, scale);
        segment.wireEntity.transform.setPosition(offsetX * scale + snapX, 0, offsetZ * scale + snapZ);
      }
    }
  }

  /**
   * Captures current segment placement without exposing engine objects.
   * @returns Stable diagnostic snapshot ordered by LOD, segment group, and instance.
   */
  inspectSegments(): readonly TerrainClipmapSegmentSnapshot[] {
    return this._segments.map((segment) => {
      const position = segment.entity.transform.position;
      return {
        lod: segment.lod,
        group: GROUP_NAMES[segment.group],
        instance: segment.instance,
        position: [position.x, position.z] as const,
        scale: segment.entity.transform.scale.x
      };
    });
  }

  /**
   * Shows or hides line-topology companions that share each segment's production vertex path.
   * @param enabled Whether to render the clipmap wire overlay.
   */
  setWireframe(enabled: boolean): void {
    for (const segment of this._segments) segment.wireEntity.isActive = enabled;
  }

  private _createGroup(
    root: Entity,
    material: TerrainMaterial,
    lod: number,
    group: number,
    mesh: BufferMesh,
    wireMesh: BufferMesh,
    count: number
  ): void {
    for (let instance = 0; instance < count; instance++) {
      const entity = root.createChild(`lod-${lod}-${GROUP_NAMES[group]}-${instance}`);
      const renderer = entity.addComponent(TerrainRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      renderer.setLod(lod);
      // The terrain forward pass applies height displacement; it must not submit the undisplaced clipmap to CSM.
      renderer.castShadows = false;
      renderer.setDebugWire(false);

      const wireEntity = root.createChild(`lod-${lod}-${GROUP_NAMES[group]}-${instance}-wire`);
      const wireRenderer = wireEntity.addComponent(TerrainRenderer);
      wireRenderer.mesh = wireMesh;
      wireRenderer.setMaterial(material);
      wireRenderer.castShadows = false;
      wireRenderer.setLod(lod);
      wireRenderer.setDebugWire(true);
      wireRenderer.priority = 1;
      wireEntity.isActive = false;
      this._segments.push({ entity, wireEntity, lod, group, instance });
    }
  }

  private _resolveOffset(segment: Segment, testX: number, testZ: number): Offset {
    const { group, instance, lod } = segment;
    if (group === TILE) return lod === 0 ? this._offsets.lod0Tiles[instance] : this._offsets.tiles[instance];
    if (group === EDGE_A) {
      return [this._offsets.edges[instance][testX], -(this._offsets.offsetA + testZ * 2)];
    }
    if (group === EDGE_B) {
      return [-this._offsets.offsetA, this._offsets.edges[instance][testZ]];
    }
    if (group === FILL_A) return lod === 0 ? this._offsets.trimA[instance] : this._offsets.fillA[instance];
    return lod === 0 ? this._offsets.trimB[instance] : this._offsets.fillB[instance];
  }

  private _lodCount(): number {
    return this._segments[this._segments.length - 1].lod + 1;
  }
}

class TerrainClipmapFollower extends Script {
  private _clipmap!: TerrainClipmap;
  private _camera!: Camera;

  initialize(clipmap: TerrainClipmap, camera: Camera): void {
    this._clipmap = clipmap;
    this._camera = camera;
  }

  override onUpdate(): void {
    this._clipmap.snap(this._camera.entity.transform.worldPosition);
  }
}

interface MeshTypes {
  tile: BufferMesh;
  edgeA: BufferMesh;
  edgeB: BufferMesh;
  fillA: BufferMesh;
  fillB: BufferMesh;
  standardTrimA: BufferMesh;
  standardTrimB: BufferMesh;
  standardTile: BufferMesh;
  standardEdgeA: BufferMesh;
  standardEdgeB: BufferMesh;
  tileWire: BufferMesh;
  edgeAWire: BufferMesh;
  edgeBWire: BufferMesh;
  fillAWire: BufferMesh;
  fillBWire: BufferMesh;
  standardTrimAWire: BufferMesh;
  standardTrimBWire: BufferMesh;
  standardTileWire: BufferMesh;
  standardEdgeAWire: BufferMesh;
  standardEdgeBWire: BufferMesh;
}

function createMeshTypes(engine: Engine, size: number, minHeight: number, maxHeight: number): MeshTypes {
  return {
    tile: createGridMesh(engine, size, size, false, minHeight, maxHeight, "terrain-tile"),
    edgeA: createGridMesh(engine, 2, size * 4 + 8, false, minHeight, maxHeight, "terrain-edge-a"),
    edgeB: createGridMesh(engine, size * 4 + 4, 2, false, minHeight, maxHeight, "terrain-edge-b"),
    fillA: createGridMesh(engine, 4, size, false, minHeight, maxHeight, "terrain-fill-a"),
    fillB: createGridMesh(engine, size, 4, false, minHeight, maxHeight, "terrain-fill-b"),
    standardTrimA: createGridMesh(engine, 2, size * 4 + 2, true, minHeight, maxHeight, "terrain-trim-a"),
    standardTrimB: createGridMesh(engine, size * 4 + 2, 2, true, minHeight, maxHeight, "terrain-trim-b"),
    standardTile: createGridMesh(engine, size, size, true, minHeight, maxHeight, "terrain-standard-tile"),
    standardEdgeA: createGridMesh(engine, 2, size * 4 + 8, true, minHeight, maxHeight, "terrain-standard-edge-a"),
    standardEdgeB: createGridMesh(engine, size * 4 + 4, 2, true, minHeight, maxHeight, "terrain-standard-edge-b"),
    tileWire: createGridMesh(engine, size, size, false, minHeight, maxHeight, "terrain-tile-wire", true),
    edgeAWire: createGridMesh(engine, 2, size * 4 + 8, false, minHeight, maxHeight, "terrain-edge-a-wire", true),
    edgeBWire: createGridMesh(engine, size * 4 + 4, 2, false, minHeight, maxHeight, "terrain-edge-b-wire", true),
    fillAWire: createGridMesh(engine, 4, size, false, minHeight, maxHeight, "terrain-fill-a-wire", true),
    fillBWire: createGridMesh(engine, size, 4, false, minHeight, maxHeight, "terrain-fill-b-wire", true),
    standardTrimAWire: createGridMesh(engine, 2, size * 4 + 2, true, minHeight, maxHeight, "terrain-trim-a-wire", true),
    standardTrimBWire: createGridMesh(engine, size * 4 + 2, 2, true, minHeight, maxHeight, "terrain-trim-b-wire", true),
    standardTileWire: createGridMesh(
      engine,
      size,
      size,
      true,
      minHeight,
      maxHeight,
      "terrain-standard-tile-wire",
      true
    ),
    standardEdgeAWire: createGridMesh(
      engine,
      2,
      size * 4 + 8,
      true,
      minHeight,
      maxHeight,
      "terrain-standard-edge-a-wire",
      true
    ),
    standardEdgeBWire: createGridMesh(
      engine,
      size * 4 + 4,
      2,
      true,
      minHeight,
      maxHeight,
      "terrain-standard-edge-b-wire",
      true
    )
  };
}

function createGridMesh(
  engine: Engine,
  width: number,
  depth: number,
  standardGrid: boolean,
  minHeight: number,
  maxHeight: number,
  name: string,
  wireframe = false
): BufferMesh {
  const positions = new Float32Array((width + 1) * (depth + 1) * 3);
  let vertexOffset = 0;
  for (let z = 0; z <= depth; z++) {
    for (let x = 0; x <= width; x++) {
      positions[vertexOffset++] = x;
      positions[vertexOffset++] = 0;
      positions[vertexOffset++] = z;
    }
  }

  const triangleIndices = new Uint32Array(width * depth * 6);
  let indexOffset = 0;
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const bottomLeft = z * (width + 1) + x;
      const bottomRight = bottomLeft + 1;
      const topLeft = (z + 1) * (width + 1) + x;
      const topRight = topLeft + 1;
      // The imported mesh convention has the opposite front-face winding.
      if (((x + z) & 1) === 0 || standardGrid) {
        triangleIndices[indexOffset++] = bottomLeft;
        triangleIndices[indexOffset++] = topLeft;
        triangleIndices[indexOffset++] = topRight;
        triangleIndices[indexOffset++] = bottomLeft;
        triangleIndices[indexOffset++] = topRight;
        triangleIndices[indexOffset++] = bottomRight;
      } else {
        triangleIndices[indexOffset++] = bottomLeft;
        triangleIndices[indexOffset++] = topLeft;
        triangleIndices[indexOffset++] = bottomRight;
        triangleIndices[indexOffset++] = topLeft;
        triangleIndices[indexOffset++] = topRight;
        triangleIndices[indexOffset++] = bottomRight;
      }
    }
  }

  const indices = wireframe ? createWireIndices(triangleIndices) : triangleIndices;

  const mesh = new BufferMesh(engine, name);
  mesh.setVertexBufferBinding(new Buffer(engine, BufferBindFlag.VertexBuffer, positions, BufferUsage.Static), 12);
  mesh.setIndexBufferBinding(
    new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static),
    IndexFormat.UInt32
  );
  mesh.setVertexElements([new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0)]);
  mesh.addSubMesh(0, indices.length, wireframe ? MeshTopology.Lines : MeshTopology.Triangles);
  mesh.bounds.min.set(0, minHeight, 0);
  mesh.bounds.max.set(width, maxHeight, depth);
  return mesh;
}

function createWireIndices(triangleIndices: Uint32Array): Uint32Array {
  const lineIndices = new Uint32Array((triangleIndices.length / 3) * 6);
  let offset = 0;
  for (let triangle = 0; triangle < triangleIndices.length; triangle += 3) {
    const a = triangleIndices[triangle];
    const b = triangleIndices[triangle + 1];
    const c = triangleIndices[triangle + 2];
    lineIndices[offset++] = a;
    lineIndices[offset++] = b;
    lineIndices[offset++] = b;
    lineIndices[offset++] = c;
    lineIndices[offset++] = c;
    lineIndices[offset++] = a;
  }
  return lineIndices;
}

interface ClipmapOffsets {
  readonly lod0Tiles: readonly Offset[];
  readonly trimA: readonly Offset[];
  readonly trimB: readonly Offset[];
  readonly tiles: readonly Offset[];
  readonly edges: readonly (readonly [number, number, number])[];
  readonly fillA: readonly Offset[];
  readonly fillB: readonly Offset[];
  readonly offsetA: number;
}

function createOffsets(size: number): ClipmapOffsets {
  const offsetA = size * 2 + 2;
  const offsetB = size * 2 + 4;
  const offsetC = size * 2 + 6;
  return {
    lod0Tiles: [
      [0, size],
      [size, size],
      [size, 0],
      [size, -size],
      [size, -size * 2],
      [0, -size * 2],
      [-size, -size * 2],
      [-size * 2, -size * 2],
      [-size * 2, -size],
      [-size * 2, 0],
      [-size * 2, size],
      [-size, size],
      [0, 0],
      [-size, 0],
      [0, -size],
      [-size, -size]
    ],
    trimA: [
      [size * 2, -size * 2],
      [-size * 2 - 2, -size * 2 - 2]
    ],
    trimB: [
      [-size * 2, -size * 2 - 2],
      [-size * 2 - 2, size * 2]
    ],
    tiles: [
      [2, size + 2],
      [size + 2, size + 2],
      [size + 2, -2],
      [size + 2, -size - 2],
      [size + 2, -size * 2 - 2],
      [-2, -size * 2 - 2],
      [-size - 2, -size * 2 - 2],
      [-size * 2 - 2, -size * 2 - 2],
      [-size * 2 - 2, -size + 2],
      [-size * 2 - 2, 2],
      [-size * 2 - 2, size + 2],
      [-size + 2, size + 2]
    ],
    edges: [
      [offsetA, offsetA, -offsetB],
      [offsetB, -offsetB, -offsetC]
    ],
    fillA: [
      [size - 2, -size * 2 - 2],
      [-size - 2, size + 2]
    ],
    fillB: [
      [size + 2, size - 2],
      [-size * 2 - 2, -size - 2]
    ],
    offsetA
  };
}

function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const GROUP_NAMES = ["tile", "edge-a", "edge-b", "fill-a", "fill-b"] as const;
