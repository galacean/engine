import { encodeTerrainCanonicalJson, sha256TerrainBytes } from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";
import type { TerrainProjectPrototypeRenderer } from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const NEUTRAL_NORMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEWAgP9QzlGcAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";

/** Detached browser file used by the editor asset import pipeline. */
export interface TerrainEditorUploadedFile {
  /** Original display name including its extension. */
  readonly name: string;
  /** Browser-reported MIME type, which may be empty. */
  readonly mimeType: string;
  /** Detached file contents. */
  readonly bytes: Uint8Array;
}

/** Validated texture resources ready to enter one canonical TerrainLayer. */
export interface TerrainEditorPreparedTextureAsset {
  /** Stable layer id derived from content. */
  readonly id: string;
  /** Human-readable layer name derived from the uploaded filename. */
  readonly name: string;
  /** Canonical virtual diffuse Texture path. */
  readonly diffuseUrl: string;
  /** Exact uploaded image bytes. */
  readonly diffuseBytes: Uint8Array;
  /** Canonical virtual neutral-normal Texture path. */
  readonly normalUrl: string;
  /** Valid one-pixel tangent-space neutral normal PNG. */
  readonly normalBytes: Uint8Array;
}

/** Validated model and generated Prefab ready to enter a tree or Detail prototype. */
export interface TerrainEditorPreparedPrototypeAsset {
  /** Stable prototype id derived from content and capability. */
  readonly id: string;
  /** Human-readable prototype name derived from the uploaded filename. */
  readonly name: string;
  /** Canonical virtual binary glTF path. */
  readonly modelUrl: string;
  /** Exact uploaded binary glTF bytes. */
  readonly modelBytes: Uint8Array;
  /** Canonical virtual generated Prefab path. */
  readonly prefabUrl: string;
  /** Standard Prefab bytes containing explicit renderer metadata. */
  readonly prefabBytes: Uint8Array;
}

/**
 * Validates an uploaded image and prepares portable TerrainLayer resources.
 * @param file Detached PNG, JPEG, or WebP upload.
 * @returns Content-addressed diffuse and neutral-normal resources.
 * @throws If the file extension or content is unsupported.
 */
export async function prepareTerrainEditorTextureAsset(
  file: TerrainEditorUploadedFile
): Promise<TerrainEditorPreparedTextureAsset> {
  const extension = imageExtension(file.name, file.mimeType);
  if (!extension) throw new Error("Terrain layer upload requires a PNG, JPEG, or WebP image");
  if (file.bytes.byteLength === 0) throw new Error("Terrain layer upload is empty");
  validateImageSignature(extension, file.bytes);
  const contentHash = await sha256TerrainBytes(file.bytes);
  const identity = contentHash.slice(0, 16);
  return Object.freeze({
    id: `layer-${identity}`,
    name: displayName(file.name),
    diffuseUrl: `Texture/Imported/${identity}.${extension}`,
    diffuseBytes: file.bytes.slice(),
    normalUrl: "Texture/Generated/neutral-normal.png",
    normalBytes: decodeBase64(NEUTRAL_NORMAL_PNG_BASE64)
  });
}

/**
 * Validates a self-contained static binary glTF and generates one standard metadata Prefab.
 * @param file Detached `.glb` upload.
 * @param capability Editor prototype capability; Detail alone permits Detail instance attributes.
 * @returns Content-addressed model and generated Prefab resources.
 * @throws If the model is malformed, externally dependent, skinned, animated by weights, or has no renderers.
 */
export async function prepareTerrainEditorPrototypeAsset(
  file: TerrainEditorUploadedFile,
  capability: "detail" | "tree" | "object"
): Promise<TerrainEditorPreparedPrototypeAsset> {
  if (!file.name.toLowerCase().endsWith(".glb")) throw new Error("Prototype upload requires a binary .glb file");
  const gltf = decodeGlbJson(file.bytes);
  validateSelfContainedGltf(gltf);
  const renderers = collectRendererBindings(gltf, capability === "detail");
  const contentHash = await sha256TerrainBytes(file.bytes);
  const identity = contentHash.slice(0, 16);
  const modelUrl = `Models/Imported/${identity}.glb`;
  const prefabUrl = `Prefab/Imported/${capability}-${identity}.prefab`;
  const name = displayName(file.name);
  const prefab = {
    version: "2.0",
    refs: [{ url: modelUrl }, { url: "/Script/TerrainPrototypeMetadata.ts" }],
    entities: [{ name, children: [1], components: [0] }, { instance: { asset: 0 } }],
    components: [
      {
        type: "Script",
        script: 1,
        props: {
          geometry: {
            kind: "renderers",
            renderers
          }
        }
      }
    ],
    root: 0
  };
  return Object.freeze({
    id: `${capability}-${identity}`,
    name,
    modelUrl,
    modelBytes: file.bytes.slice(),
    prefabUrl,
    prefabBytes: encodeTerrainCanonicalJson(prefab)
  });
}

interface GltfDocument {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{ children?: number[]; mesh?: number; skin?: number; weights?: number[] }>;
  meshes?: Array<{ weights?: number[]; primitives?: unknown[] }>;
  buffers?: Array<{ uri?: string }>;
  images?: Array<{ uri?: string }>;
}

function decodeGlbJson(bytes: Uint8Array): GltfDocument {
  if (bytes.byteLength < 20) throw new Error("Prototype GLB header is incomplete");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    throw new Error("Prototype upload must use binary glTF version 2");
  }
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.byteLength) throw new Error("Prototype GLB declared length does not match its bytes");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== GLB_JSON_CHUNK || 20 + jsonLength > bytes.byteLength) {
    throw new Error("Prototype GLB has no valid JSON chunk");
  }
  try {
    const text = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).replace(/[\u0000\u0020]+$/g, "");
    return JSON.parse(text) as GltfDocument;
  } catch (error) {
    throw new Error("Prototype GLB JSON cannot be decoded", { cause: error });
  }
}

function validateSelfContainedGltf(gltf: GltfDocument): void {
  if (!Array.isArray(gltf.scenes) || !Array.isArray(gltf.nodes) || !Array.isArray(gltf.meshes)) {
    throw new Error("Prototype GLB requires scenes, nodes, and meshes");
  }
  const externalUri = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].find(
    (resource) => typeof resource.uri === "string" && !resource.uri.startsWith("data:")
  );
  if (externalUri) throw new Error("Prototype GLB must be self-contained and cannot reference external files");
}

function collectRendererBindings(gltf: GltfDocument, detailInstancing: boolean): TerrainProjectPrototypeRenderer[] {
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  if (!scene) throw new Error("Prototype GLB default Scene is missing");
  const nodes = gltf.nodes!;
  const meshes = gltf.meshes!;
  const renderers: TerrainProjectPrototypeRenderer[] = [];
  const activeNodes = new Set<number>();
  const visit = (nodeIndex: number, path: number[]): void => {
    if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length) {
      throw new Error("Prototype GLB Scene references an invalid node");
    }
    if (activeNodes.has(nodeIndex)) throw new Error("Prototype GLB node hierarchy contains a cycle");
    activeNodes.add(nodeIndex);
    const node = nodes[nodeIndex];
    if (node.skin !== undefined || node.weights || (node.mesh !== undefined && meshes[node.mesh]?.weights)) {
      throw new Error("Prototype GLB must use static MeshRenderers; skinning and morph weights are unsupported");
    }
    if (node.mesh !== undefined) {
      const mesh = meshes[node.mesh];
      if (!mesh || !Array.isArray(mesh.primitives) || mesh.primitives.length === 0) {
        throw new Error("Prototype GLB node references an invalid mesh");
      }
      for (let componentIndex = 0; componentIndex < mesh.primitives.length; componentIndex++) {
        renderers.push({
          entityPath: [0, ...path],
          componentIndex,
          ...(detailInstancing ? { detailInstancing: true as const } : {})
        });
      }
    }
    for (let childIndex = 0; childIndex < (node.children?.length ?? 0); childIndex++) {
      visit(node.children![childIndex], [...path, childIndex]);
    }
    activeNodes.delete(nodeIndex);
  };
  for (let rootIndex = 0; rootIndex < (scene.nodes?.length ?? 0); rootIndex++) {
    visit(scene.nodes![rootIndex], [rootIndex]);
  }
  if (renderers.length === 0) throw new Error("Prototype GLB default Scene contains no static renderable geometry");
  return renderers;
}

function imageExtension(name: string, mimeType: string): "png" | "jpg" | "webp" | null {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".png") || mimeType === "image/png") return "png";
  if (/\.jpe?g$/.test(lowerName) || mimeType === "image/jpeg") return "jpg";
  if (lowerName.endsWith(".webp") || mimeType === "image/webp") return "webp";
  return null;
}

function validateImageSignature(extension: "png" | "jpg" | "webp", bytes: Uint8Array): void {
  const valid =
    extension === "png"
      ? bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      : extension === "jpg"
        ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : bytes.length >= 12 &&
          bytes[0] === 0x52 &&
          bytes[1] === 0x49 &&
          bytes[2] === 0x46 &&
          bytes[3] === 0x46 &&
          bytes[8] === 0x57 &&
          bytes[9] === 0x45 &&
          bytes[10] === 0x42 &&
          bytes[11] === 0x50;
  if (!valid) throw new Error(`Terrain layer upload content does not match ${extension.toUpperCase()} format`);
}

function displayName(fileName: string): string {
  const basename = fileName.replace(/\.[^.]+$/, "").trim();
  return basename || "Imported asset";
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
