export interface DecorationMesh {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Flat [u0, v0, u1, v1, ...] UV pairs (length vertexCount * 2, or 0 if absent). */
  materialUVs: Float32Array;
  indices: Uint16Array | Uint32Array;
  glass: Uint8Array;
  metal: Uint8Array;
  bounds: { min: number[]; max: number[] };
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
  const uvChannel = channels.Vertex_UV;
  return {
    positions: Float32Array.from(positions.values),
    normals: Float32Array.from(normals.values),
    colors: Float32Array.from(colors.values),
    indices: vertexCount <= 65535 ? Uint16Array.from(indices) : Uint32Array.from(indices),
    bounds,
    doubleSided,
    materialUVs: uvChannel && uvChannel.width === 2 ? Float32Array.from(uvChannel.values) : new Float32Array(0),
    glass: channels.is_glass ? Uint8Array.from(channels.is_glass.values) : new Uint8Array(0),
    metal: channels.is_metal_part ? Uint8Array.from(channels.is_metal_part.values) : new Uint8Array(0)
  };
}
