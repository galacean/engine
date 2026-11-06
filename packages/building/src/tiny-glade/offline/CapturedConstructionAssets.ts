/** Offline recovery/oracle input only. Never imported by the runtime. */
import { validateDecorationMeshes, type DecorationMeshSource } from "./CapturedDecorationMeshes";
import {
  validateDecorationCollisions,
  type ConstructionDecorationCollisions
} from "../runtime/ConstructionDecorationCollisions";
import { validateConstructionWindowCuts, type ConstructionWindowCutAsset } from "../runtime/ConstructionWindowCutAsset";
import { validateRoofSpireAsset, type RoofSpireAsset } from "../runtime/RoofSpireAsset";
import type { ResidentDraw, ResidentPackage } from "../runtime/EngineResidentScene";
import type { ConstructionResourceRole, ConstructionAssetLoader } from "../runtime/ConstructionBindings";
export type { ConstructionResourceRole, ConstructionAssetLoader } from "../runtime/ConstructionBindings";
export interface ConstructionTemplateResource {
  kind: "storage" | "uniform" | "texture";
  role?: ConstructionResourceRole;
  file?: string;
  texture?: string;
  array?: boolean;
  minByteLength?: number;
}
export interface ConstructionDrawTemplate {
  family: string;
  program: string;
  attributes: ResidentDraw["attributes"];
  indices: string;
  indexCount: number;
  lod?: Pick<ResidentDraw, "attributes" | "indices" | "indexCount">;
  instanceStride: 48 | 64 | 80 | 96 | 128;
  directInstances: boolean;
  resources: Record<string, ConstructionTemplateResource>;
}
/** A library contains template geometry only. Each scene supplies every mutable
 * resource through a typed role; captured instances are not a library category. */
export interface ConstructionAssetLibrary {
  schema: "tiny-glade-static-assets-v7";
  programs: ResidentPackage["programs"];
  windowCuts: ConstructionWindowCutAsset;
  decorationCollisions: ConstructionDecorationCollisions;
  decorations: Record<string, DecorationMeshSource>;
  brickSdf: BrickSdfAsset;
  roofSpire: RoofSpireAsset;
  textures: Record<
    string,
    {
      width: number;
      height: number;
      layers: number;
      srgb: boolean;
      levels: string[];
      compressed?: string[];
      vkFormat?: 139 | 145 | 146;
      sampling?: "linear-clamp";
    }
  >;
  templates: Record<string, ConstructionDrawTemplate>;
  files: Record<string, { sha256: string; byteLength: number; role: string }>;
  environmentDefaults: { frame: string };
  glassTextureBindings: string[];
  gothic: Record<
    1 | 2 | 3,
    {
      glassAlbedoSlot: number;
      frameTemplate: string;
      glassTemplate: string;
      collisionPositions: string;
      collisionIndices: string;
      collisionSourceSha256: string;
    }
  >;
  provenance: Record<string, unknown>;
}
/** SDF shader/texture ABI owned by the VFS library, shared by resident draws. */
export interface BrickSdfAsset {
  schema: "tiny-glade-brick-sdf-programs/v1";
  template: string;
  programs: ResidentPackage["programs"];
  proxyIndices: number[];
  textureEncoding: string;
  provenance: Record<string, unknown>;
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
/** Validate static manifest references at the asset boundary. Byte digests can
 * additionally be checked by verifyConstructionAsset on offline/import paths. */
export function parseConstructionAssets(input: unknown): ConstructionAssetLibrary {
  if (!object(input) || input.schema !== "tiny-glade-static-assets-v7")
    throw Error("Static construction library required");
  const allowed = [
    "schema",
    "programs",
    "textures",
    "templates",
    "files",
    "gothic",
    "glassTextureBindings",
    "environmentDefaults",
    "provenance",
    "brickSdf",
    "roofSpire",
    "windowCuts",
    "decorationCollisions",
    "decorations"
  ];
  if (Object.keys(input).some((k) => !allowed.includes(k))) throw Error("Unexpected field in static asset library");
  for (const key of ["programs", "textures", "templates", "files", "gothic", "environmentDefaults"])
    if (!object(input[key])) throw Error("Missing static library " + key);
  if (
    !Array.isArray(input.glassTextureBindings) ||
    !input.glassTextureBindings.every((v: unknown) => typeof v === "string")
  )
    throw Error("Invalid glass texture bindings");
  validateRoofSpireAsset(input.roofSpire);
  validateDecorationCollisions(input.decorationCollisions);
  validateConstructionWindowCuts(input.windowCuts, input.textures);
  const file = (name: unknown) => {
    if (typeof name !== "string" || !Object.hasOwn(input.files, name))
      throw Error("Unknown static file " + String(name));
  };
  for (const [name, rec] of Object.entries(input.files)) {
    if (
      !object(rec) ||
      !Number.isSafeInteger(rec.byteLength) ||
      rec.byteLength < 0 ||
      typeof rec.role !== "string" ||
      !/^[a-f0-9]{64}$/.test(rec.sha256) ||
      name !== rec.sha256 + ".bin"
    )
      throw Error("Invalid static asset record");
    const assetRoles = [
      "original-mesh-attribute",
      "original-mesh-indices",
      "derived-mesh-indices",
      "original-decoded-texture",
      "original-compressed-texture",
      "original-static-uniform",
      "original-default-environment-uniform",
      "original-collision-mesh",
      "original-collision-indices",
      "derived-distance-field"
    ];
    if (!rec.role.split(" / ").every((r: string) => assetRoles.includes(r)))
      throw Error("Scene-derived asset category is forbidden");
  }
  validateDecorationMeshes(input.decorations, input.files, input.templates);
  const sdf = input.brickSdf;
  if (
    !object(sdf) ||
    sdf.schema !== "tiny-glade-brick-sdf-programs/v1" ||
    sdf.textureEncoding !== "signed-byte-plus-128-unorm8; decode=(sample*255-128)/127" ||
    !object(sdf.programs) ||
    !Object.keys(sdf.programs).length ||
    !Array.isArray(sdf.proxyIndices) ||
    !sdf.proxyIndices.length ||
    sdf.proxyIndices.length % 3 ||
    sdf.proxyIndices.some((index: unknown) => !Number.isInteger(index) || Number(index) < 0 || Number(index) > 7)
  )
    throw Error("Invalid brick SDF ABI");
  file(sdf.template);
  if (input.files[sdf.template].byteLength !== 24448 || input.files[sdf.template].role !== "derived-distance-field")
    throw Error("Invalid brick SDF template");
  for (const [name, program] of Object.entries(sdf.programs)) {
    // Clip variants are derived package programs, not entries of the base library.
    if (
      !name ||
      !object(program) ||
      !["vert", "frag"].every(
        (stage) => object(program[stage]) && typeof program[stage].source === "string" && program[stage].source.length
      )
    )
      throw Error("Invalid brick SDF program " + name);
  }
  const roles = [
    "instances",
    "indirection",
    "view",
    "frame",
    "frameCounter",
    "stoneFoundation",
    "roofColors",
    "wallColors",
    "identities",
    "woodenColors",
    "halfTimberColors",
    "roofCounts",
    "roofHoles",
    "domainRoof",
    "domainCounts",
    "domainHoles",
    "windowCuts",
    "plasterVertices"
  ];
  for (const t of Object.values(input.templates)) {
    if (
      !object(t) ||
      !Object.hasOwn(input.programs, t.program) ||
      ![48, 64, 80, 96, 128].includes(t.instanceStride) ||
      typeof t.directInstances !== "boolean" ||
      !Number.isInteger(t.indexCount) ||
      t.indexCount < 0 ||
      !Array.isArray(t.attributes) ||
      !object(t.resources)
    )
      throw Error("Invalid draw template");
    for (const geometry of [t, ...(t.lod ? [t.lod] : [])]) {
      file(geometry.indices);
      if (input.files[geometry.indices].byteLength !== geometry.indexCount * 4)
        throw Error("Template index ABI differs");
      for (const a of geometry.attributes) {
        file(a.file);
        if (
          !Number.isInteger(a.location) ||
          a.location < 0 ||
          ![1, 2, 3, 4].includes(a.size) ||
          !Number.isInteger(a.stride) ||
          a.stride < a.size * 4 ||
          !Number.isInteger(a.offset) ||
          a.offset < 0 ||
          a.offset + a.size * 4 > a.stride
        )
          throw Error("Invalid template attribute ABI");
      }
    }
    if (
      t.lod &&
      (t.lod.indexCount >= t.indexCount ||
        t.lod.attributes.length !== t.attributes.length ||
        t.lod.attributes.some(
          (a: any, i: number) =>
            a.location !== t.attributes[i].location ||
            a.size !== t.attributes[i].size ||
            !!a.integer !== !!t.attributes[i].integer
        ))
    )
      throw Error("LOD vertex ABI differs");
    for (const r of Object.values(t.resources)) {
      if (!object(r) || !["uniform", "storage", "texture"].includes(r.kind)) throw Error("Invalid template resource");
      if (r.kind === "texture") {
        if (!Object.hasOwn(input.textures, r.texture)) throw Error("Missing template texture");
      } else if (r.role) {
        if (!roles.includes(r.role) || r.file) throw Error("Invalid dynamic resource role");
      } else file(r.file);
    }
    if (Object.values(t.resources).some((r) => object(r) && r.role === "windowCuts")) {
      // This sampler name is part of the cut shader ABI, just like its packed
      // storage record. CPU bounds must describe the atlas actually sampled.
      const atlas = t.resources.material_data_window_cut_sdf;
      if (
        !object(atlas) ||
        atlas.kind !== "texture" ||
        atlas.array !== true ||
        atlas.texture !== input.windowCuts.texture
      )
        throw Error("Window-cut template must bind its metadata atlas");
    }
  }
  for (const spec of Object.values(input.textures)) {
    if (
      !object(spec) ||
      !Array.isArray(spec.levels) ||
      !spec.levels.length ||
      ![spec.width, spec.height, spec.layers].every((n) => Number.isInteger(n) && n > 0) ||
      typeof spec.srgb !== "boolean" ||
      (spec.sampling !== undefined && spec.sampling !== "linear-clamp")
    )
      throw Error("Invalid texture ABI");
    spec.levels.forEach(file);
    const fullMipCount = 1 + Math.floor(Math.log2(Math.max(spec.width, spec.height)));
    if (spec.levels.length !== 1 && spec.levels.length !== fullMipCount) throw Error("Incomplete texture mip chain");
    spec.levels.forEach((name: string, mip: number) => {
      const expected = Math.max(1, spec.width >> mip) * Math.max(1, spec.height >> mip) * spec.layers * 4;
      if (input.files[name].byteLength !== expected) throw Error("Decoded texture mip byte count differs");
    });
    if (spec.compressed !== undefined || spec.vkFormat !== undefined) {
      if (
        ![139, 145, 146].includes(spec.vkFormat) ||
        !Array.isArray(spec.compressed) ||
        spec.compressed.length !== spec.levels.length ||
        spec.srgb !== (spec.vkFormat === 146)
      )
        throw Error("Invalid original BC texture format");
      spec.compressed.forEach((name: string, mip: number) => {
        file(name);
        const blockBytes = spec.vkFormat === 139 ? 8 : 16;
        const expected =
          Math.ceil(Math.max(1, spec.width >> mip) / 4) *
          Math.ceil(Math.max(1, spec.height >> mip) / 4) *
          spec.layers *
          blockBytes;
        if (
          input.files[name].byteLength !== expected ||
          !input.files[name].role.split(" / ").includes("original-compressed-texture")
        )
          throw Error("Original BC mip layout differs");
      });
    }
  }
  file(input.environmentDefaults.frame);
  for (const rank of [1, 2, 3]) {
    const g = input.gothic[rank];
    if (
      !object(g) ||
      Object.keys(g).some(
        (key) =>
          ![
            "glassAlbedoSlot",
            "frameTemplate",
            "glassTemplate",
            "collisionPositions",
            "collisionIndices",
            "collisionSourceSha256"
          ].includes(key)
      )
    )
      throw Error("Invalid Gothic asset descriptor");
    file(g.collisionPositions);
    file(g.collisionIndices);
    if (
      !Object.hasOwn(input.templates, g.frameTemplate) ||
      !Object.hasOwn(input.templates, g.glassTemplate) ||
      input.glassTextureBindings[g.glassAlbedoSlot] !== "window_glass"
    )
      throw Error("Invalid Gothic template/texture owner");
  }
  return input as unknown as ConstructionAssetLibrary;
}
export async function verifyConstructionAsset(
  library: ConstructionAssetLibrary,
  name: string,
  raw: ArrayBuffer
): Promise<void> {
  const spec = library.files[name];
  if (!spec || raw.byteLength !== spec.byteLength) throw Error("Static asset size differs: " + name);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", raw)), (x) =>
    x.toString(16).padStart(2, "0")
  ).join("");
  if (digest !== spec.sha256) throw Error("Static asset digest differs: " + name);
}
