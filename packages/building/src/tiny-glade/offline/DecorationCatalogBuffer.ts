import meshes from "../assets/decorations/catalog-meshes";

/** One decoder for immutable original decoration attributes used by native
 * programs. Returned buffers are independently owned; instances never enter it. */
export function decorationCatalogBuffer(name: string, attribute: string, integer: boolean): ArrayBuffer {
  const mesh = meshes[name];
  if (!mesh) throw Error("Missing original decoration template " + name);
  const values =
    attribute === "indices"
      ? mesh.indices
      : attribute === "Vertex_Position"
        ? mesh.positions
        : attribute === "Vertex_Normal"
          ? mesh.normals
          : attribute === "Vertex_UV"
            ? mesh.materialUVs.flat()
            : mesh.attributes?.[attribute]?.flat();
  if (!values) throw Error("Missing original decoration attribute " + attribute);
  const bytes = new ArrayBuffer(values.length * 4),
    view = new DataView(bytes);
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!Number.isFinite(value)) throw Error("Invalid decoration template numeric value");
    if (integer) {
      const unsigned = attribute === "indices";
      if (
        !Number.isInteger(value) ||
        value < (unsigned ? 0 : -0x80000000) ||
        value > (unsigned ? 0xffffffff : 0x7fffffff)
      )
        throw Error("Decoration integer attribute exceeds 32 bits");
      if (unsigned) view.setUint32(index * 4, value, true);
      else view.setInt32(index * 4, value, true);
    } else {
      if (!Number.isFinite(Math.fround(value))) throw Error("Decoration attribute exceeds f32");
      view.setFloat32(index * 4, value, true);
    }
  }
  return bytes;
}
