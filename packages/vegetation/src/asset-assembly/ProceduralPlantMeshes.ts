import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  ContentRestorer,
  type Engine,
  MeshTopology,
  ModelMesh,
  Vector2,
  Vector3,
  Vector4,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import {
  buildPlantMeshTangents,
  buildProceduralPlantGeometry,
  mergePlantGeometryByMaterial,
  type PlantMeshData,
  type PlantPartMesh,
  type ProceduralPlantStructure
} from "./ProceduralPlantGeometry";

const keyF32Buf = new ArrayBuffer(4);
const keyF32 = new Float32Array(keyF32Buf);
const keyU32 = new Uint32Array(keyF32Buf);

/** Identity of the actual uploaded attributes, excluding material and instance placement.
 * Float32 conversion matches the GPU buffers exactly; it is not a geometry-fitting tolerance.
 * Include tangents because equal positions/UVs with different tangent frames cannot share a Mesh.
 */
export function plantMeshGeometryKey(data: PlantMeshData, normalMapped: boolean): string {
  // 128-bit (4 x 32-bit) binary hash over exact Float32 GPU buffer bit patterns and indices.
  let h0 = 0x811c9dc5;
  let h1 = 0x9e3779b9;
  let h2 = 0x243f6a88;
  let h3 = 0xb7e15162;

  const mixU32 = (word: number): void => {
    const w = word >>> 0;
    h0 = Math.imul(h0 ^ w, 0x01000193) >>> 0;
    h1 = Math.imul((h1 ^ w) + 0x9e3779b9, 0x85ebca6b) >>> 0;
    h1 ^= h1 >>> 13;
    h2 = Math.imul(h2 ^ ((w << 11) | (w >>> 21)), 0xc2b2ae35) >>> 0;
    h2 ^= h2 >>> 16;
    h3 = (Math.imul(h3 ^ w, 0x27d4eb2d) + (h0 >>> 7)) >>> 0;
  };

  const mixF32 = (value: number): void => {
    // Normalize -0 to +0 to match JSON.stringify([Math.fround(-0)]) === "[0]".
    keyF32[0] = value === 0 ? 0 : value;
    mixU32(keyU32[0]);
  };

  const mixTupleArray = (tuples: readonly (readonly number[])[], stride: number, tag: number): void => {
    mixU32(tag);
    mixU32(tuples.length);
    for (let i = 0; i < tuples.length; i++) {
      const t = tuples[i];
      for (let k = 0; k < stride; k++) mixF32(t[k]);
    }
  };

  mixTupleArray(data.positions, 3, 0x1001);
  mixTupleArray(data.normals, 3, 0x1002);
  mixTupleArray(data.uvs, 2, 0x1003);

  if (data.leafFrames) {
    mixTupleArray(data.leafFrames, 4, 0x1004);
  } else {
    mixU32(0x2004);
  }

  if (data.windFrames) {
    if (data.windFrames instanceof Float32Array) {
      const frames = data.windFrames;
      mixU32(0x1005);
      mixU32(frames.length >>> 2);
      for (let i = 0; i < frames.length; i++) mixF32(frames[i]);
    } else {
      mixTupleArray(data.windFrames, 4, 0x1005);
    }
  } else {
    mixU32(0x2005);
  }

  if (normalMapped) {
    mixTupleArray(buildPlantMeshTangents(data), 4, 0x1006);
  } else {
    mixU32(0x2006);
  }

  if (data.canopyOpticalDepths) {
    const depths = data.canopyOpticalDepths;
    mixU32(0x1007);
    mixU32(depths.length);
    for (let i = 0; i < depths.length; i++) mixF32(depths[i]);
  } else {
    mixU32(0x2007);
  }

  const indices = data.indices;
  mixU32(0x1008);
  mixU32(indices.length);
  for (let i = 0; i < indices.length; i++) mixU32(indices[i]);

  return (
    `pmg1:${data.positions.length}:${indices.length}:${normalMapped ? 1 : 0}:` +
    `${h0.toString(16).padStart(8, "0")}${h1.toString(16).padStart(8, "0")}` +
    `${h2.toString(16).padStart(8, "0")}${h3.toString(16).padStart(8, "0")}`
  );
}

/** The caller owns these meshes and the materials referenced by materialId. */
export interface ProceduralPlantMeshes {
  readonly parts: readonly { readonly partId: string; readonly materialId: string; readonly mesh: ModelMesh }[];
  destroy(): void;
}

/** Uploads compiled 3D vertices directly. No tree card shader or external mesh asset is involved. */
export function createProceduralPlantMeshes(
  engine: Engine,
  structure: ProceduralPlantStructure,
  lod: number,
  mergeByMaterial = false,
  materialOptions?: {
    readonly normalMapped?: boolean;
    readonly leafMaterialIds?: ReadonlySet<string>;
    readonly windHeight?: number;
    /** CPU geometry-preview equivalent of the production GPU organ-scaling contract. */
    readonly instanceScale?: readonly [number, number, number];
  }
): ProceduralPlantMeshes {
  const partsGeometry = buildProceduralPlantGeometry(
    structure,
    lod,
    materialOptions?.leafMaterialIds,
    materialOptions?.windHeight
  ).map((part) => {
    const scale = materialOptions?.instanceScale;
    if (!scale || !part.mesh.leafFrames) return part;
    const positions = part.mesh.positions.map((p, index) => {
      const pivot = part.mesh.leafFrames![index];
      return p.map((v, axis) => pivot[axis] + ((v - pivot[axis]) * scale[1]) / scale[axis]) as [number, number, number];
    });
    const normals = part.mesh.normals.map((n) => {
      const transformed = n.map((v, axis) => (v * scale[axis]) / scale[1]);
      const length = Math.hypot(...transformed) || 1;
      return transformed.map((v) => v / length) as [number, number, number];
    });
    return {
      ...part,
      mesh: {
        ...part.mesh,
        positions,
        normals,
        leafFrames: undefined,
        bounds: [
          [0, 1, 2].map((axis) => Math.min(...positions.map((p) => p[axis]))) as [number, number, number],
          [0, 1, 2].map((axis) => Math.max(...positions.map((p) => p[axis]))) as [number, number, number]
        ] as const
      }
    };
  });
  const geometry = mergeByMaterial ? mergePlantGeometryByMaterial(partsGeometry) : partsGeometry;
  return uploadProceduralPlantGeometry(engine, geometry, materialOptions);
}

class StaticPlantBufferRestorer extends ContentRestorer<Buffer> {
  constructor(
    buffer: Buffer,
    private readonly _data: ArrayBufferView
  ) {
    super(buffer);
  }

  override restoreContent(): void {
    if (!this.resource.destroyed && !this.resource.pendingDestroy) {
      this.resource.setData(this._data);
    }
  }
}

/** Upload generated source meshes once for sharing across independent renderers. */
export function uploadProceduralPlantGeometry(
  engine: Engine,
  geometry: readonly PlantPartMesh[],
  materialOptions?: { readonly normalMapped?: boolean }
): ProceduralPlantMeshes {
  const parts: { partId: string; materialId: string; mesh: ModelMesh }[] = [];
  const owned: ModelMesh[] = [];
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const mesh of owned) mesh.destroy();
  };
  try {
    for (const { partId, materialId, mesh: data } of geometry) {
      if (!data.indices.length) continue;
      const mesh = new ModelMesh(engine, `plant/${partId}`);
      owned.push(mesh);
      mesh.setPositions(data.positions.map((p) => new Vector3(...p)));
      mesh.setNormals(data.normals.map((p) => new Vector3(...p)));
      mesh.setUVs(data.uvs.map((p) => new Vector2(...p)));
      if (materialOptions?.normalMapped) mesh.setTangents(buildPlantMeshTangents(data).map((t) => new Vector4(...t)));
      mesh.setIndices(data.indices);
      mesh.addSubMesh(0, data.indices.length, MeshTopology.Triangles);
      mesh.bounds.min.set(...data.bounds[0]);
      mesh.bounds.max.set(...data.bounds[1]);
      // Capture compact interleaved GPU bytes before uploadData(true) frees CPU Vector3 arrays.
      mesh.uploadData(false);
      const vertexBuffer = mesh.vertexBufferBindings[0]?.buffer;
      const vertexBytes = vertexBuffer?.readable && vertexBuffer.data ? vertexBuffer.data.slice() : null;
      const indexBuffer = (mesh as unknown as { _primitive: { indexBufferBinding?: { buffer: Buffer } } })._primitive
        .indexBufferBinding?.buffer;
      const indexBytes = data.indices.slice();
      mesh.uploadData(true);
      if (vertexBuffer && vertexBytes) {
        engine.resourceManager.addContentRestorer(new StaticPlantBufferRestorer(vertexBuffer, vertexBytes));
      }
      if (indexBuffer) {
        engine.resourceManager.addContentRestorer(new StaticPlantBufferRestorer(indexBuffer, indexBytes));
      }
      if (data.canopyOpticalDepths) {
        if (
          data.canopyOpticalDepths.length !== data.positions.length ||
          data.canopyOpticalDepths.some((value) => !Number.isFinite(value) || value < 0)
        )
          throw new Error("Canopy optical depths must cover every vertex with finite non-negative values");
        const binding = mesh.vertexBufferBindings.length;
        mesh.setVertexBufferBinding(
          new Buffer(
            engine,
            BufferBindFlag.VertexBuffer,
            new Float32Array(data.canopyOpticalDepths),
            BufferUsage.Static,
            true
          ),
          4,
          binding
        );
        (mesh as unknown as { _addVertexElement(element: VertexElement): void })._addVertexElement(
          new VertexElement("PLANT_CANOPY_DEPTH", 0, VertexElementFormat.Float, binding)
        );
      }
      if (data.leafFrames) {
        if (data.leafFrames.length !== data.positions.length) throw new Error("Leaf frames must cover every vertex");
        // Reuse the existing fixed-leaf GPU variation shader: no new shader or Material variant.
        const values = new Float32Array(data.positions.length * 11);
        data.leafFrames.forEach(([x, y, z, rank], vertex) => {
          values.set([x, y, z, x, y, z, 1, 0, rank, 0, 0], vertex * 11);
        });
        const binding = mesh.vertexBufferBindings.length;
        mesh.setVertexBufferBinding(
          new Buffer(engine, BufferBindFlag.VertexBuffer, values, BufferUsage.Static, true),
          44,
          binding
        );
        const extensible = mesh as unknown as { _addVertexElement(element: VertexElement): void };
        extensible._addVertexElement(new VertexElement("LEAF_PIVOT", 0, VertexElementFormat.Vector3, binding));
        extensible._addVertexElement(
          new VertexElement("TREE_VARIATION_ROOT", 12, VertexElementFormat.Vector4, binding)
        );
        extensible._addVertexElement(
          new VertexElement("TREE_VARIATION_DATA", 28, VertexElementFormat.Vector4, binding)
        );
      }
      if (data.windFrames) {
        const flat = data.windFrames instanceof Float32Array;
        const count = flat ? data.windFrames.length / 4 : data.windFrames.length;
        if (count !== data.positions.length) throw new Error("Wind frames must cover every vertex");
        const values = flat
          ? (data.windFrames as Float32Array)
          : new Float32Array((data.windFrames as readonly (readonly [number, number, number, number])[]).flat());
        const binding = mesh.vertexBufferBindings.length;
        mesh.setVertexBufferBinding(
          new Buffer(engine, BufferBindFlag.VertexBuffer, values, BufferUsage.Static, true),
          16,
          binding
        );
        (mesh as unknown as { _addVertexElement(element: VertexElement): void })._addVertexElement(
          new VertexElement("PLANT_WIND", 0, VertexElementFormat.Vector4, binding)
        );
      }
      parts.push({ partId, materialId, mesh });
    }
    return { parts, destroy };
  } catch (error) {
    destroy();
    throw error;
  }
}
