import { constructionDecorationModels } from "./CapturedDecorationRecipes";
import type {
  ConstructionAssetLoader,
  ConstructionAssetLibrary,
  ConstructionDrawTemplate
} from "./CapturedConstructionAssets";
import { createDecorationMesh, type ConstructionDecorationMeshes } from "../runtime/ConstructionDecorationMeshes";
export interface DecorationBufferField {
  file: string;
  offset: number;
  count: number;
  width: number;
  encoding: "f32" | "f64" | "u32";
  /** Resolved GPU interleaving; not persisted on a standalone packed field. */
  stride?: number;
}
export type DecorationMeshField = DecorationBufferField | { template: string; attribute: "position" | "indices" };
export interface DecorationMeshSource {
  fields: Record<string, DecorationMeshField>;
  doubleSided: boolean;
}

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
function resolveField(
  field: DecorationMeshField,
  templates: Record<string, ConstructionDrawTemplate>,
  files: Record<string, { byteLength: number }>
): DecorationBufferField {
  if (!object(field) || !("template" in field)) return field as DecorationBufferField;
  if (
    Object.keys(field).some((k) => k !== "template" && k !== "attribute") ||
    typeof field.template !== "string" ||
    !Object.hasOwn(templates, field.template)
  )
    throw Error("Invalid decoration template reference");
  const template = templates[field.template];
  if (field.attribute === "indices")
    return { file: template.indices, offset: 0, count: template.indexCount, width: 1, encoding: "u32" };
  if (field.attribute !== "position") throw Error("Invalid decoration template attribute");
  const a = template.attributes?.find((a) => a.location === 0);
  if (!a || a.integer || a.size !== 3 || !files[a.file]) throw Error("Invalid decoration position template");
  return {
    file: a.file,
    offset: a.offset ?? 0,
    count: (files[a.file].byteLength / a.stride) * 3,
    width: 3,
    encoding: "f32",
    stride: a.stride
  };
}
export function validateDecorationMeshes(
  value: unknown,
  files: Record<string, { byteLength: number }>,
  templates: Record<string, ConstructionDrawTemplate>
): asserts value is Record<string, DecorationMeshSource> {
  if (!object(value) || !Object.keys(value).length) throw Error("Decoration meshes required in construction VFS");
  for (const [name, mesh] of Object.entries(value)) {
    if (
      !object(mesh) ||
      Object.keys(mesh).some((k) => k !== "fields" && k !== "doubleSided") ||
      typeof mesh.doubleSided !== "boolean" ||
      !object(mesh.fields)
    )
      throw Error("Invalid decoration mesh: " + name);
    const fields: Record<string, DecorationBufferField> = {};
    for (const [attribute, input] of Object.entries<any>(mesh.fields)) {
      const field = resolveField(input, templates, files);
      fields[attribute] = field;
      if (
        input?.template &&
        (attribute === "indices"
          ? input.attribute !== "indices"
          : attribute !== "Vertex_Position" || input.attribute !== "position")
      )
        throw Error("Mismatched decoration template attribute");
      if (
        !object(field) ||
        Object.keys(field).some(
          (k) => !["file", "offset", "count", "width", "encoding", ...(input?.template ? ["stride"] : [])].includes(k)
        ) ||
        typeof field.file !== "string" ||
        !Object.hasOwn(files, field.file) ||
        !["f32", "f64", "u32"].includes(field.encoding) ||
        ![field.offset, field.count, field.width].every(Number.isSafeInteger) ||
        field.offset < 0 ||
        field.count <= 0 ||
        field.width <= 0 ||
        field.count % field.width ||
        field.offset % (field.encoding === "f64" ? 8 : 4) ||
        (field.stride !== undefined &&
          (!Number.isSafeInteger(field.stride) || field.stride < field.width * (field.encoding === "f64" ? 8 : 4))) ||
        field.offset +
          (field.count / field.width - 1) * (field.stride ?? field.width * (field.encoding === "f64" ? 8 : 4)) +
          field.width * (field.encoding === "f64" ? 8 : 4) >
          files[field.file].byteLength
      )
        throw Error("Invalid decoration attribute: " + name + "/" + attribute);
    }
    const positions = fields.Vertex_Position,
      indices = fields.indices;
    if (
      !positions ||
      positions.width !== 3 ||
      positions.encoding === "u32" ||
      !indices ||
      indices.width !== 1 ||
      indices.encoding !== "u32" ||
      indices.count % 3
    )
      throw Error("Invalid decoration topology: " + name);
    for (const key of ["Vertex_Normal", "Vertex_Color"]) {
      const field = fields[key];
      if (!field || field.width !== 3 || field.count !== positions.count)
        throw Error("Invalid decoration vertex attribute: " + name + "/" + key);
    }
    for (const [key, field] of Object.entries(fields))
      if (key !== "indices" && field.count / field.width !== positions.count / 3)
        throw Error("Decoration attribute vertex count differs: " + name + "/" + key);
  }
}
function values(buffers: Record<string, ArrayBuffer>, field: DecorationBufferField) {
  const raw = buffers[field.file];
  if (!raw) throw Error("Missing decoration buffer in construction VFS: " + field.file);
  const view = new DataView(raw),
    step = field.encoding === "f64" ? 8 : 4,
    result: number[] = [];
  for (let i = 0; i < field.count; i++) {
    const at =
      field.offset + Math.floor(i / field.width) * (field.stride ?? field.width * step) + (i % field.width) * step;
    const value =
      field.encoding === "f64"
        ? view.getFloat64(at, true)
        : field.encoding === "u32"
          ? view.getUint32(at, true)
          : view.getFloat32(at, true);
    if (!Number.isFinite(value)) throw Error("Nonfinite decoration attribute: " + field.file);
    result.push(value);
  }
  return result;
}
export async function loadDecorationMeshes(
  library: ConstructionAssetLibrary,
  read: ConstructionAssetLoader
): Promise<ConstructionDecorationMeshes> {
  const sources = Object.fromEntries(
    Object.entries(library.decorations).map(([name, source]) => [
      name,
      {
        doubleSided: source.doubleSided,
        fields: Object.fromEntries(
          Object.entries(source.fields).map(([key, field]) => [
            key,
            resolveField(field, library.templates, library.files)
          ])
        )
      }
    ])
  );
  const names = [...new Set(Object.values(sources).flatMap((s) => Object.values(s.fields).map((f) => f.file)))];
  const buffers = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await read(name)])));
  const meshes: ConstructionDecorationMeshes["meshes"] = {};
  for (const [name, source] of Object.entries(sources)) {
    const positions = values(buffers, source.fields.Vertex_Position),
      indices = values(buffers, source.fields.indices);
    if (indices.some((i) => i >= positions.length / 3)) throw Error("Decoration index outside vertex buffer: " + name);
    const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      box.min[axis] = Math.min(box.min[axis], positions[i]);
      box.max[axis] = Math.max(box.max[axis], positions[i]);
    }
    meshes[name] = createDecorationMesh(
      Object.fromEntries(
        Object.entries(source.fields)
          .filter(([key]) => key !== "indices")
          .map(([key, field]) => [key, { values: values(buffers, field), width: field.width }])
      ),
      indices,
      box,
      source.doubleSided
    );
  }
  // Offline oracle for the captured wall lamp. Production derives this descriptor
  // from its authored Prefab; the capture has no native Entity hierarchy.
  const assemblies: NonNullable<ConstructionDecorationMeshes["assemblies"]> = {};
  for (const type of [
    "window-cottage",
    "dormer-cottage-half",
    "dormer-cottage",
    "dormer-gothic",
    "window-cottage-corner",
    "window-gothic",
    "dormer-gothic-half",
    "window-arrow-slit",
    "door-cottage",
    "door-gothic",
    "dormer-arrow-slit-half",
    "hatch-cottage",
    "hatch-gothic",
    "roof-lantern"
  ])
    for (const rank of [1, 2, 3]) {
      const model = constructionDecorationModels(type, rank);
      if (model)
        assemblies[`${type}/${rank}`] = {
          selected: model.selected.map(([name, suffix, material, emission]) => [
            name,
            suffix,
            material,
            emission,
            {
              role: suffix === "frame" ? "frame" : suffix === "glass" ? "glass" : "body",
              ...(suffix === "frame" && library.templates[`stone-frame/${name}`]
                ? { stoneTemplate: `stone-frame/${name}` }
                : {})
            }
          ])
        };
    }
  return {
    meshes,
    assemblies: {
      ...assemblies,
      "wall-lantern/1": {
        selected: [
          ["lantern_wall", "body", 6, [0, 0, 0.367000013589859]],
          ["lantern_wall_inside", "light", 7, [0, 0, 0.367000013589859]]
        ]
      }
    }
  };
}
