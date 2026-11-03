import {
  visitSourceComponents,
  sourceNestedEntries
} from "@galacean/engine-project/runtime-editor/scene/runtime-source-components";
import { FileHeader, parseBufferMeshData, parseTexturePixelsData } from "@galacean/engine-loader";
import type { RuntimeAssetFormat } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";

export const editableAssetTypes = [
  "Scene",
  "Prefab",
  "Material",
  "PrimitiveMesh",
  "AnimatorController",
  "script"
] as const;
const text = (content: string | Uint8Array): string => {
  if (typeof content !== "string") throw new Error("This asset format requires text content");
  return content;
};
const json = (content: string | Uint8Array): Record<string, any> => {
  const parsed = JSON.parse(text(content));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Asset JSON must be an object");
  return parsed;
};
const hierarchyReferences = (content: string | Uint8Array): string[] => {
  const refs = new Set<string>();
  const pending: unknown[] = [json(content)];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (typeof (value as any).$ref === "string") refs.add((value as any).$ref);
    pending.push(...Object.values(value));
  }
  return [...refs];
};

/** Native formats retain the Engine/Editor JSON layouts, rather than inventing another asset encoding. */
export function nativeAssetFormats(
  scriptDependencies: () => Readonly<Record<string, readonly string[]>>
): ReadonlyMap<string, RuntimeAssetFormat> {
  const hierarchy: RuntimeAssetFormat = {
    validate: (content) => {
      const source = json(content);
      if (source.asset?.version !== "2.0" || !Array.isArray(source.entities) || !Array.isArray(source.components))
        throw new Error("Hierarchy requires Editor v2 source");
    },
    references: (content) => {
      const source = json(content) as GalaceanSceneFile | GalaceanPrefabFile;
      const refs = new Set(hierarchyReferences(content));
      for (const entry of sourceNestedEntries(source)) refs.add(entry.assetId);
      visitSourceComponents(source, (component) => {
        if (component.type === "Script" && component.refId) refs.add(component.refId);
      });
      return [...refs];
    }
  };
  const formats = new Map<string, RuntimeAssetFormat>([
    [
      "JSON",
      {
        validate: (content) => {
          json(content);
        },
        references: hierarchyReferences
      }
    ],
    ["Scene", hierarchy],
    ["Prefab", hierarchy],
    [
      "AnimatorController",
      {
        validate: (content) => {
          const controller = json(content);
          if (!Array.isArray(controller.layers) || !Array.isArray(controller.parameters))
            throw new Error("AnimatorController requires layers and parameters");
        },
        referenceTypes: ["GLTF", "AnimationClip"],
        references: (content) => {
          const refs = new Set<string>();
          for (const layer of json(content).layers ?? [])
            for (const state of layer.stateMachine?.states ?? []) {
              if (typeof state.clip?.url === "string") refs.add(state.clip.url);
            }
          return [...refs];
        }
      }
    ],
    [
      "script",
      {
        validate: (content) => {
          text(content);
        },
        references: (_content, file) => {
          const dependencies = scriptDependencies()[file.virtualPath];
          if (!dependencies) throw new Error(`Analyze script imports before inspecting '${file.virtualPath}'`);
          return [...dependencies];
        }
      }
    ],
    [
      "PrimitiveMesh",
      {
        validate: (content) => {
          const mesh = json(content);
          if (!["cuboid", "sphere", "capsule", "cone", "cylinder", "plane", "torus"].includes(mesh.type))
            throw new Error("Unknown primitive mesh type");
          for (const [key, value] of Object.entries(mesh))
            if (key !== "type" && (typeof value !== "number" || !Number.isFinite(value)))
              throw new Error(`Mesh field '${key}' must be finite`);
        },
        referenceTypes: [],
        references: () => []
      }
    ],
    [
      "Material",
      {
        validate: (content) => {
          const material = json(content);
          if (
            typeof material.name !== "string" ||
            typeof material.shader !== "string" ||
            !material.shaderData ||
            typeof material.shaderData !== "object"
          )
            throw new Error("Material requires name, shader and shaderData");
          if (!Array.isArray(material.macros)) throw new Error("Material macros must be an array (use [] when empty)");
          for (const value of Object.values(material.shaderData) as any[]) {
            if (
              !value ||
              !["Color", "Float", "Integer", "Boolean", "Vector2", "Vector3", "Vector4", "Texture"].includes(
                value.type
              ) ||
              !("value" in value)
            )
              throw new Error("Invalid material shaderData entry");
          }
        },
        references: (content) => {
          const material = json(content);
          // A Texture value can address a subresource of a GLTF (or another container).
          // Its url identifies the owning asset; do not infer that asset's type from the property type.
          return [
            material.shaderRef?.url,
            ...Object.values(material.shaderData ?? {})
              .filter((value: any) => value.type === "Texture")
              .map((value: any) => value.value?.url)
          ].filter((value): value is string => typeof value === "string");
        }
      }
    ]
  ]);
  // These formats do not refer to editable Scene/Prefab/Material/PrimitiveMesh/Script assets.
  // Their own binary/texture dependencies are not claimed to be inspected by this native editor.
  for (const type of [
    "GLTF",
    "Buffer",
    "KTX2",
    "Texture2D",
    "TextureCube",
    "Texture",
    "Shader",
    "ShaderChunk",
    "Mesh"
  ]) {
    formats.set(type, {
      validate: () => {
        throw new Error(`No native edit handler for '${type}'`);
      },
      referenceTypes: [],
      references: () => []
    });
  }
  // Opaque bytes may be imported as a new asset. The referring domain owns
  // format/size/hash validation; this does not enable arbitrary text updates.
  formats.get("Buffer")!.validateImport = (content) => {
    if (!(content instanceof Uint8Array)) throw new Error("Buffer import requires binary bytes");
  };
  formats.get("Shader")!.validateImport = (content) => {
    const shader = json(content);
    if (
      typeof shader.name !== "string" ||
      !shader.name ||
      !Array.isArray(shader.subShaders) ||
      !shader.subShaders.length
    )
      throw new Error("Shader import requires native precompiled shader JSON");
    for (const sub of shader.subShaders) {
      if (!Array.isArray(sub.passes) || !sub.passes.length) throw new Error("Shader requires passes");
      for (const pass of sub.passes)
        for (const field of ["vertexShaderInstructions", "fragmentShaderInstructions"])
          if (
            !Array.isArray(pass[field]) ||
            !pass[field].length ||
            pass[field].some((instruction: unknown) => !Array.isArray(instruction) || !Number.isInteger(instruction[0]))
          )
            throw new Error("Invalid native Shader instructions");
    }
  };
  formats.get("GLTF")!.validateImport = (content) => {
    if (!(content instanceof Uint8Array) || content.byteLength < 20)
      throw new Error("GLB import requires binary glTF 2.0 content");
    const header = new DataView(content.buffer, content.byteOffset, content.byteLength);
    if (
      header.getUint32(0, true) !== 0x46546c67 ||
      header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== content.byteLength ||
      header.getUint32(16, true) !== 0x4e4f534a ||
      20 + header.getUint32(12, true) > content.byteLength
    )
      throw new Error("Invalid GLB header");
    const document = JSON.parse(new TextDecoder().decode(content.subarray(20, 20 + header.getUint32(12, true))));
    for (const resource of [...(document.buffers ?? []), ...(document.images ?? [])]) {
      if (resource.uri && !resource.uri.startsWith("data:"))
        throw new Error("GLB import requires embedded buffers and images");
    }
  };
  formats.get("Mesh")!.validateImport = (content) => {
    if (!(content instanceof Uint8Array)) throw new Error("Mesh import requires native binary mesh bytes");
    const buffer = Uint8Array.from(content).buffer,
      header = FileHeader.decode(buffer);
    if (header.type === "BufferMesh") parseBufferMeshData(buffer);
    else if (header.type !== "Mesh") throw new Error("Mesh import requires a native Mesh or BufferMesh");
  };
  formats.get("Texture")!.validateImport = (content) => {
    if (!(content instanceof Uint8Array)) throw new Error("Texture import requires PNG or JPEG bytes");
    const buffer = Uint8Array.from(content).buffer;
    if (FileHeader.checkMagic(buffer)) {
      const header = FileHeader.decode(buffer);
      if (header.type === "TexturePixels") parseTexturePixelsData(buffer);
      else if (!["Texture2D", "TextureCube"].includes(header.type)) throw new Error("Unsupported native texture asset");
      return;
    }
    const png =
      content.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => content[index] === value);
    const jpeg = content.length >= 4 && content[0] === 255 && content[1] === 216 && content[2] === 255;
    if (!png && !jpeg) throw new Error("Texture import requires PNG or JPEG bytes");
  };
  return formats;
}
