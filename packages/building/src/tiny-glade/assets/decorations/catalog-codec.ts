/** Offline-packed original attributes. Decode on first use, once per mesh. */
export interface DecorationMesh {
  positions: number[];
  normals: number[];
  colors: number[];
  materialUVs: number[][];
  tangents: number[][];
  bitangents: number[][];
  indices: number[];
  glass: number[];
  metal: number[];
  bounds: { min: number[]; max: number[] };
  /** Additional native attributes, including bevel flags, brick IDs and soft normals. */
  attributes?: Record<string, number[][]>;
  doubleSided?: boolean;
}
export interface PackedDecorationMesh {
  data: string;
  /** Native name, component count, numeric encoding, byte offset, scalar count. */
  fields: [string, number, "f32" | "f64" | "u32", number, number][];
  bounds: { min: number[]; max: number[] };
  doubleSided: boolean;
}
export function decodeDecorationMesh(packed: PackedDecorationMesh): DecorationMesh {
  const text = atob(packed.data);
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const attributes: Record<string, number[][]> = {};
  const scalars: Record<string, number[]> = {};
  for (const [name, width, encoding, offset, count] of packed.fields) {
    const stride = encoding === "f64" ? 8 : 4;
    if (offset < 0 || offset + count * stride > bytes.length || count % width !== 0)
      throw Error("Invalid packed decoration attribute: " + name);
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      const at = offset + i * stride;
      values.push(
        encoding === "f64"
          ? view.getFloat64(at, true)
          : encoding === "u32"
            ? view.getUint32(at, true)
            : view.getFloat32(at, true)
      );
    }
    scalars[name] = values;
    if (!["indices", "Vertex_Position", "Vertex_Normal", "Vertex_Color", "is_glass", "is_metal_part"].includes(name)) {
      const rows: number[][] = [];
      for (let i = 0; i < count; i += width) rows.push(values.slice(i, i + width));
      attributes[name] = rows;
    }
  }
  return {
    positions: scalars.Vertex_Position,
    normals: scalars.Vertex_Normal,
    colors: scalars.Vertex_Color,
    materialUVs: attributes.Vertex_UV ?? [],
    tangents: attributes.tangent ?? [],
    bitangents: attributes.bitangent ?? [],
    indices: scalars.indices,
    glass: scalars.is_glass ?? [],
    metal: scalars.is_metal_part ?? [],
    attributes,
    doubleSided: packed.doubleSided,
    bounds: { min: packed.bounds.min.slice(), max: packed.bounds.max.slice() }
  };
}
/** Getters keep unused catalogue geometry packed; repeated access reuses the decoded mesh. */
export function registerDecorationMeshes(
  target: Record<string, DecorationMesh>,
  packed: Record<string, PackedDecorationMesh>
): void {
  for (const [name, source] of Object.entries(packed)) {
    if (Object.prototype.hasOwnProperty.call(target, name)) throw Error("Duplicate original decoration: " + name);
    let mesh: DecorationMesh | undefined;
    Object.defineProperty(target, name, { enumerable: true, get: () => (mesh ??= decodeDecorationMesh(source)) });
  }
}
