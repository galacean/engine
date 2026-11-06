import { createHash } from "node:crypto";
import original from "../assets/decorations/catalog-meshes";
import type { ConstructionAssetLibrary } from "./CapturedConstructionAssets";
import type { DecorationMeshField, DecorationMeshSource } from "./CapturedDecorationMeshes";

/** Offline import only. Matching GPU attribute buffers keep the same VFS identity.
 * Remaining attributes share one packed file, rather than one network request each. */
export function mergeDecorationMeshLibrary(base: ConstructionAssetLibrary) {
  const pending: { offset: number; bytes: Uint8Array }[] = [],
    decorations: Record<string, DecorationMeshSource> = {};
  let length = 0;
  const offsets = new Map<string, number>();
  for (const [name, mesh] of Object.entries(original)) {
    const fields: Record<string, DecorationMeshField> = {};
    const inputs: Record<string, { width: number; values: number[] }> = Object.fromEntries(
      Object.entries(mesh.attributes ?? {}).map(([key, rows]) => [
        key,
        { width: rows[0]?.length ?? 1, values: rows.flat() }
      ])
    );
    for (const [key, width, values] of [
      ["Vertex_Position", 3, mesh.positions],
      ["Vertex_Normal", 3, mesh.normals],
      ["Vertex_Color", 3, mesh.colors],
      ["indices", 1, mesh.indices],
      ["is_glass", 1, mesh.glass],
      ["is_metal_part", 1, mesh.metal],
      ["Vertex_UV", mesh.materialUVs[0]?.length ?? 2, mesh.materialUVs.flat()],
      ["tangent", mesh.tangents[0]?.length ?? 3, mesh.tangents.flat()],
      ["bitangent", mesh.bitangents[0]?.length ?? 3, mesh.bitangents.flat()]
    ] as [string, number, number[]][])
      if (values.length) inputs[key] = { width, values };
    for (const [key, input] of Object.entries(inputs)) {
      const data = input.values;
      if (!data.length) continue;
      const encoding = key === "indices" ? "u32" : data.every((v) => Object.is(Math.fround(v), v)) ? "f32" : "f64";
      const step = encoding === "f64" ? 8 : 4,
        bytes = new Uint8Array(data.length * step),
        view = new DataView(bytes.buffer);
      data.forEach((v, i) => {
        if (!Number.isFinite(v) || (encoding === "u32" && (!Number.isSafeInteger(v) || v < 0 || v > 0xffffffff)))
          throw Error("Invalid source decoration attribute " + name + "/" + key);
        if (encoding === "u32") view.setUint32(i * step, v, true);
        else if (encoding === "f64") view.setFloat64(i * step, v, true);
        else view.setFloat32(i * step, v, true);
      });
      const file = createHash("sha256").update(bytes).digest("hex") + ".bin";
      const templateName = ["stone-frame/" + name, name].find((n) => {
        const t = base.templates[n];
        if (!t) return false;
        return key === "indices"
          ? t.indices === file
          : key === "Vertex_Position" && t.attributes.some((a) => a.location === 0 && a.file === file);
      });
      if (templateName) fields[key] = { template: templateName, attribute: key === "indices" ? "indices" : "position" };
      else if (Object.hasOwn(base.files, file))
        fields[key] = { file, offset: 0, count: data.length, width: input.width, encoding };
      else {
        let offset = offsets.get(file);
        if (offset === undefined) {
          length = Math.ceil(length / 8) * 8;
          offset = length;
          offsets.set(file, offset);
          pending.push({ offset, bytes });
          length += bytes.length;
        }
        fields[key] = { file: "@packed", offset, count: data.length, width: input.width, encoding };
      }
    }
    decorations[name] = { fields, doubleSided: !!mesh.doubleSided };
  }
  const packed = new Uint8Array(length);
  for (const { offset, bytes } of pending) packed.set(bytes, offset);
  const sha256 = createHash("sha256").update(packed).digest("hex"),
    name = sha256 + ".bin";
  for (const source of Object.values(decorations))
    for (const field of Object.values(source.fields))
      if ("file" in field && field.file === "@packed") field.file = name;
  return {
    library: {
      ...base,
      schema: "tiny-glade-static-assets-v7" as const,
      decorations,
      files: { ...base.files, [name]: { sha256, byteLength: packed.length, role: "original-mesh-attribute" } }
    },
    hasAsset: (file: string) => file === name,
    asset: async (file: string) => {
      if (file !== name) throw Error("Unknown decoration mesh buffer " + file);
      return packed.buffer as ArrayBuffer;
    }
  };
}
