import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
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

/** Identity of the actual uploaded attributes, excluding material and instance placement.
 * Float32 conversion matches the GPU buffers exactly; it is not a geometry-fitting tolerance.
 * Include tangents because equal positions/UVs with different tangent frames cannot share a Mesh.
 */
export function plantMeshGeometryKey(data: PlantMeshData, normalMapped: boolean): string {
  const attributes = [
    data.positions,
    data.normals,
    data.uvs,
    ...(data.leafFrames ? [data.leafFrames] : []),
    ...(data.windFrames ? [data.windFrames] : []),
    ...(normalMapped ? [buildPlantMeshTangents(data)] : [])
  ];
  return JSON.stringify([
    attributes.map((values) => values.map((v) => v.map(Math.fround))),
    data.canopyOpticalDepths?.map(Math.fround),
    Array.from(data.indices)
  ]);
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
      mesh.uploadData(true);
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
            BufferUsage.Static
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
          new Buffer(engine, BufferBindFlag.VertexBuffer, values, BufferUsage.Static),
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
        if (data.windFrames.length !== data.positions.length) throw new Error("Wind frames must cover every vertex");
        const values = new Float32Array(data.windFrames.flat());
        const binding = mesh.vertexBufferBindings.length;
        mesh.setVertexBufferBinding(
          new Buffer(engine, BufferBindFlag.VertexBuffer, values, BufferUsage.Static),
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
