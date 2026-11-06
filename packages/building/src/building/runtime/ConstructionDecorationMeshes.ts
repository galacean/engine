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
  attributes: Record<string, number[][]>;
  doubleSided: boolean;
}
/** Detached algorithm data derived from native Meshes; no file schema or decoder. */
export interface ConstructionDecorationMeshes {
  assemblies?: Record<string, import("../resources/BuildingAssembly").BuildingAssembly>;
  meshes: Record<string, DecorationMesh>;
}
export function decorationMesh(assets: ConstructionDecorationMeshes | undefined, name: string): DecorationMesh {
  const mesh = assets && Object.hasOwn(assets.meshes, name) ? assets.meshes[name] : undefined;
  if (!mesh) throw Error("Missing decoration mesh in construction VFS: " + name);
  return mesh;
}
export function decorationMeshBounds(assets: ConstructionDecorationMeshes | undefined, name: string) {
  return decorationMesh(assets, name).bounds;
}
/** Map native vertex semantics once at the asset boundary, not once per algorithm. */
export function createDecorationMesh(
  channels: Record<string, { values: number[]; width: number }>,
  indices: number[],
  bounds: DecorationMesh["bounds"],
  doubleSided: boolean
): DecorationMesh {
  const positions = channels.Vertex_Position,
    normals = channels.Vertex_Normal,
    colors = channels.Vertex_Color;
  if (
    !positions ||
    positions.width !== 3 ||
    !normals ||
    normals.width !== 3 ||
    !colors ||
    colors.width !== 3 ||
    !positions.values.length ||
    positions.values.length % 3 ||
    indices.length % 3
  )
    throw Error("Incomplete decoration mesh");
  const vertexCount = positions.values.length / 3;
  for (const channel of Object.values(channels)) {
    if (
      !Number.isInteger(channel.width) ||
      channel.width <= 0 ||
      channel.values.length !== vertexCount * channel.width ||
      !channel.values.every(Number.isFinite)
    )
      throw Error("Invalid decoration vertex attribute");
  }
  if (indices.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= vertexCount))
    throw Error("Invalid decoration index");
  const attributes: Record<string, number[][]> = {};
  for (const [key, { values, width }] of Object.entries(channels)) {
    if (["Vertex_Position", "Vertex_Normal", "Vertex_Color", "is_glass", "is_metal_part"].includes(key)) continue;
    attributes[key] = Array.from({ length: vertexCount }, (_, i) => values.slice(i * width, (i + 1) * width));
  }
  return {
    positions: positions.values,
    normals: normals.values,
    colors: colors.values,
    indices,
    bounds,
    doubleSided,
    materialUVs: attributes.Vertex_UV ?? [],
    tangents: attributes.tangent ?? [],
    bitangents: attributes.bitangent ?? [],
    glass: channels.is_glass?.values ?? [],
    metal: channels.is_metal_part?.values ?? [],
    attributes
  };
}
