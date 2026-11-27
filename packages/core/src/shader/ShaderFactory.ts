import { Matrix, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import {
  normalizeShaderIncludeKey,
  type IShaderInstanceLayout,
  type IShaderUniformBlock,
  type IShaderUniformSelection
} from "@galacean/engine-design";
import { Logger } from "../base/Logger";
import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { ConstantBufferBindingPoint } from "./enums/ConstantBufferBindingPoint";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderBlockProperty } from "./ShaderBlockProperty";
import { ShaderProperty } from "./ShaderProperty";
import { Std140FieldWriter } from "./Std140FieldWriter";

/**
 * Shader registry and GLSL utilities. Holds the `#include` lookup table
 * the runtime preprocessor reads and the instancing compatibility path for
 * compiled shaders that predate uniform declaration metadata.
 */
export class ShaderFactory {
  static readonly RENDERER_INSTANCE_BLOCK_NAME = "RendererInstanceData";
  static readonly REALTIME_IBL_SH_BLOCK_NAME = "RealtimeIBLSphericalHarmonics";

  static readonly uniformBlockBindingMap: Record<number, number> = {
    [ShaderBlockProperty.getByName(ShaderFactory.RENDERER_INSTANCE_BLOCK_NAME)._uniqueId]:
      ConstantBufferBindingPoint.RendererInstance,
    [ShaderBlockProperty.getByName(ShaderFactory.REALTIME_IBL_SH_BLOCK_NAME)._uniqueId]:
      ConstantBufferBindingPoint.RealtimeIBLSphericalHarmonics
  };

  static readonly includeMap: Record<string, string> = Object.create(null);

  private static readonly _std140TypeInfoMap: Record<string, { size: number; align: number }> = {
    float: { size: 4, align: 4 },
    int: { size: 4, align: 4 },
    uint: { size: 4, align: 4 },
    bool: { size: 4, align: 4 },
    vec2: { size: 8, align: 8 },
    ivec2: { size: 8, align: 8 },
    bvec2: { size: 8, align: 8 },
    vec3: { size: 12, align: 16 },
    ivec3: { size: 12, align: 16 },
    bvec3: { size: 12, align: 16 },
    vec4: { size: 16, align: 16 },
    ivec4: { size: 16, align: 16 },
    bvec4: { size: 16, align: 16 },
    mat4: { size: 64, align: 16 },
    mat3x4: { size: 48, align: 16 }
  };

  // Derived built-ins re-exposed on top of `renderer_ModelMat`.
  // `renderer_NormalMat` uses the cofactor (cross-product) form, which algebraically equals
  // `det(M) · transpose(inverse(M))`. After `normalize()` it's directionally identical to the
  // classic `transpose(inverse(M))`, but stays NaN-free when `M` is singular (e.g. any scale
  // axis is 0 — common in animations that pop / hide via scale). `sign(det)` (`s` below)
  // keeps mirrored matrices facing the right way
  private static readonly _normalMatrixFunction = `\
mat3 _normalMatFromModel(mat3 m) {
    vec3 c0 = cross(m[1], m[2]);
    vec3 c1 = cross(m[2], m[0]);
    vec3 c2 = cross(m[0], m[1]);
    float s = (dot(m[0], c0) < 0.0) ? -1.0 : 1.0;
    return mat3(c0 * s, c1 * s, c2 * s);
}`;

  // Built-in renderer uniforms. value=true means derived (remove but not added to UBO)
  private static readonly _builtinRendererUniforms: Record<string, boolean> = {
    renderer_ModelMat: false,
    renderer_Layer: false,
    renderer_MVMat: true,
    renderer_MVPMat: true,
    renderer_NormalMat: true
  };

  // Camera matrices the derived defines reference; declared on demand because
  // shader-compiler DCE may have stripped them from Transform.glsl.
  private static readonly _instanceCameraInputs = [
    { derived: "renderer_MVMat", matrix: "camera_ViewMat" },
    { derived: "renderer_MVPMat", matrix: "camera_VPMat" }
  ];
  private static readonly _uniformBlock = /layout\s*\(\s*std140\s*\)\s*uniform\s+\w+\s*\{[^{}]*\}\s*;/g;

  private static readonly _uboUniformRegex =
    /^[ \t]*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*(\[.+?\])?\s*;/gm;

  private static _packFuncMap: Record<string, InstancePackFunc> = (() => {
    const packScalar = (v: Float32Array | Int32Array, o: number, val: number) => {
      v[o] = val;
    };
    const packVec2 = (v: Float32Array | Int32Array, o: number, val: Vector2) => {
      v[o] = val.x;
      v[o + 1] = val.y;
    };
    const packVec3 = (v: Float32Array | Int32Array, o: number, val: Vector3) => {
      v[o] = val.x;
      v[o + 1] = val.y;
      v[o + 2] = val.z;
    };
    const packVec4 = (v: Float32Array | Int32Array, o: number, val: Vector4) => {
      v[o] = val.x;
      v[o + 1] = val.y;
      v[o + 2] = val.z;
      v[o + 3] = val.w;
    };
    return {
      float: packScalar,
      int: packScalar,
      uint: packScalar,
      bool: packScalar,
      vec2: packVec2,
      ivec2: packVec2,
      bvec2: packVec2,
      vec3: packVec3,
      ivec3: packVec3,
      bvec3: packVec3,
      vec4: packVec4,
      ivec4: packVec4,
      bvec4: packVec4,
      mat4: (v: Float32Array | Int32Array, o: number, val: Matrix) => {
        const e = val.elements;
        for (let k = 0; k < 16; k++) v[o + k] = e[k];
      },
      // Affine mat4 stored as mat3x4: write 3 transposed rows (row3 is always 0,0,0,1)
      mat3x4: (v: Float32Array | Int32Array, o: number, val: Matrix) => {
        const e = val.elements;
        v[o] = e[0];
        v[o + 1] = e[4];
        v[o + 2] = e[8];
        v[o + 3] = e[12];
        v[o + 4] = e[1];
        v[o + 5] = e[5];
        v[o + 6] = e[9];
        v[o + 7] = e[13];
        v[o + 8] = e[2];
        v[o + 9] = e[6];
        v[o + 10] = e[10];
        v[o + 11] = e[14];
      }
    };
  })();

  /** @internal Resolve application includes and this distribution's built-in shader library. */
  static _getRuntimeIncludes(library?: readonly { path: string; source: string }[]): Record<string, string> {
    if (!library) return ShaderFactory.includeMap;
    const includes = Object.create(ShaderFactory.includeMap);
    for (const { path, source } of library) includes[normalizeShaderIncludeKey(path)] = source;
    return includes;
  }

  /** @internal Both engine flavors may bootstrap the same shared include library. */
  static _registerBuiltinIncludes(library: readonly { path: string; source: string }[]): void {
    for (const { path, source } of library) {
      if (ShaderFactory.includeMap[normalizeShaderIncludeKey(path)] !== source) {
        ShaderFactory.registerInclude(path, source);
      }
    }
  }

  /**
   * Register a chunk source so `#include` resolves it.
   * @param includeName - The path key referenced in `#include "..."`.
   * @param includeSource - GLSL chunk source text.
   * @throws Error when the key is empty, malformed, or already registered after normalization.
   */
  static registerInclude(includeName: string, includeSource: string): void {
    const key = normalizeShaderIncludeKey(includeName);
    if (Object.prototype.hasOwnProperty.call(ShaderFactory.includeMap, key)) {
      throw new Error(`The shader include "${key}" is already registered.`);
    }
    Object.defineProperty(ShaderFactory.includeMap, key, {
      value: includeSource,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }

  /**
   * Remove a registered shader chunk.
   * @param includeName - The path key passed to `registerInclude`.
   * @throws Error when the key is empty or malformed.
   */
  static unregisterInclude(includeName: string): void {
    delete ShaderFactory.includeMap[normalizeShaderIncludeKey(includeName)];
  }

  /**
   * Remove a registered shader chunk.
   * @param includeName - The path key passed to `registerInclude`.
   * @deprecated Use `unregisterInclude`.
   * @throws Error when the key is empty or malformed.
   */
  static unRegisterInclude(includeName: string): void {
    ShaderFactory.unregisterInclude(includeName);
  }

  /** Resolve compiler-generated field layouts to CPU upload operations once at program link. */
  static createInstanceLayout(
    layout: IShaderInstanceLayout,
    vertexSites: readonly IShaderUniformSelection[],
    fragmentSites: readonly IShaderUniformSelection[],
    explicitBlocks?: readonly IShaderUniformBlock[]
  ): InstanceBufferLayout {
    const instanceFields = layout.fields.map(({ name, type, offset, worldTransform }) => {
      const writer = worldTransform ? null : new Std140FieldWriter(type);
      return {
        property: ShaderProperty.getByName(name),
        type,
        offset,
        offsetInElements: offset / 4,
        useIntView: writer?.useIntView ?? false,
        worldTransform: worldTransform ?? false,
        pack: writer ? writer.write.bind(writer) : ShaderFactory._packFuncMap.mat3x4
      };
    });
    const headerFields: NonNullable<InstanceBufferLayout["headerFields"]> = [];
    function addCameraMatrix(name: string, offset: number): void {
      if (offset < 0) return;
      // The same public name can be authored in a strict Scene block, possibly in the opposite stage.
      const inScene = ({ site }: IShaderUniformSelection): boolean =>
        site.kind === "explicitMatrix" && site.structName === "Scene" && site.name === name;
      headerFields.push({
        property: ShaderProperty.getByName(name),
        offsetInElements: offset / 4,
        sceneOnly:
          vertexSites.some(inScene) ||
          fragmentSites.some(inScene) ||
          !!explicitBlocks?.some(
            (block) => block.name === "Scene" && block.members.some((member) => member.name === name)
          )
      });
    }
    addCameraMatrix("camera_ViewMat", layout.viewOffset);
    addCameraMatrix("camera_VPMat", layout.viewProjectionOffset);
    return {
      bindingName: layout.bindingName,
      instanceFields,
      structSize: layout.structSize,
      instanceMaxCount: layout.instanceMaxCount,
      headerBytes: layout.headerBytes,
      headerFields
    };
  }

  /**
   * Scan VS/FS for renderer-group `uniform` declarations, replace them with a shared
   * std140 UBO (instanced array), and emit `#define` remapping so original uniform
   * names resolve to `rendererData.items[instanceID].field`.
   *
   * Inputs are expected to be already preprocessor-evaluated (no `#ifdef` left).
   */
  /** Replaces the realtime SH array uniform with a std140 block after ShaderLab preprocessing. @internal */
  static injectRealtimeIBLUniformBlocks(shader: string): string {
    return shader.replace(
      /uniform\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+scene_RealtimeEnvSH\s*\[\s*9\s*\]\s*;/g,
      `layout(std140) uniform ${ShaderFactory.REALTIME_IBL_SH_BLOCK_NAME} {\n` +
        "    vec4 scene_RealtimeEnvSH[9];\n" +
        "};"
    );
  }

  static injectInstanceUBO(
    engine: Engine,
    vertexSource: string,
    fragmentSource: string
  ): { vertexSource: string; fragmentSource: string; instanceLayout: InstanceBufferLayout | null } {
    const fieldMap: Record<number, string> = Object.create(null);
    const originalVertex = vertexSource;
    const originalFragment = fragmentSource;
    vertexSource = ShaderFactory._scanInstanceUniforms(vertexSource, fieldMap);
    fragmentSource = ShaderFactory._scanInstanceUniforms(fragmentSource, fieldMap);

    // Even when fieldMap is empty, derived built-ins (e.g. `renderer_MVPMat`) may have
    // had their declarations stripped by scan and still need a `#define` to compile
    const instanceLayout = ShaderFactory._buildLayout(engine, fieldMap);

    if (!instanceLayout.instanceMaxCount) {
      return { vertexSource: originalVertex, fragmentSource: originalFragment, instanceLayout: null };
    }

    const { instanceFields } = instanceLayout;
    const uboDecl = ShaderFactory._buildUBODeclaration(instanceLayout);
    const blocks = [
      ...(vertexSource.match(ShaderFactory._uniformBlock) ?? []),
      ...(fragmentSource.match(ShaderFactory._uniformBlock) ?? [])
    ];
    const members = new Set<string>();
    for (const block of blocks) {
      for (const match of block.matchAll(/\b(\w+)\s*(?:\[[^\]]*\])?\s*;/g)) members.add(match[1]);
    }
    const fieldDefinesVS = ShaderFactory._buildFieldDefines(instanceFields, "gl_InstanceID", members);
    const fieldDefinesFS = ShaderFactory._buildFieldDefines(instanceFields, "v_instanceID", members);
    const vertex = ShaderFactory._prepareInstanceCameraInputs(vertexSource, fragmentSource, blocks, members);
    const fragment = ShaderFactory._prepareInstanceCameraInputs(fragmentSource, vertexSource, blocks, members);

    const vsBlock = `${uboDecl}flat out int v_instanceID;\n${vertex.declarations}${fieldDefinesVS}\n`;
    const fsBlock = `${uboDecl}flat in int v_instanceID;\n${fragment.declarations}${fieldDefinesFS}\n`;

    vertexSource = vsBlock + vertex.source;
    vertexSource = vertexSource.replace(
      /void\s+main\s*\(\s*\)\s*\{/,
      "void main() {\n    v_instanceID = gl_InstanceID;"
    );
    fragmentSource = fsBlock + fragment.source;

    return { vertexSource, fragmentSource, instanceLayout };
  }

  private static _scanInstanceUniforms(source: string, fieldMap: Record<number, string>): string {
    const builtinUniforms = ShaderFactory._builtinRendererUniforms;
    const std140Map = ShaderFactory._std140TypeInfoMap;
    return source.replace(ShaderFactory._uboUniformRegex, (match, type, name, arraySize) => {
      if (type.includes("sampler")) return match;
      const isDerived = builtinUniforms[name];
      if (isDerived === undefined && ShaderProperty._propertyNameMap[name]?._groups !== ShaderDataGroup.Renderer)
        return match;
      if (isDerived) return "";
      if (arraySize) {
        Logger.error(`GPU Instancing does not support array uniform "${name}${arraySize}"`);
        return match;
      }
      // ModelMat is affine, stored as mat3x4 (3 columns) to save 16 bytes per instance
      const storageType = type === "mat4" && name === "renderer_ModelMat" ? "mat3x4" : type;
      if (!std140Map[storageType]) {
        Logger.error(`GPU Instancing does not support uniform "${name}" of type "${type}"`);
        return match;
      }
      fieldMap[ShaderProperty.getByName(name)._uniqueId] = storageType;
      return "";
    });
  }

  private static readonly _maxInstanceUBOBytes = 16384;

  private static _buildLayout(engine: Engine, fieldMap: Record<number, string>): InstanceBufferLayout {
    const maxUBOSize = Math.min(engine._hardwareRenderer.maxUniformBlockSize, ShaderFactory._maxInstanceUBOBytes);
    const std140Map = ShaderFactory._std140TypeInfoMap;
    const instanceFields: InstanceFieldInfo[] = [];
    let currentOffset = 0;

    const packFuncMap = ShaderFactory._packFuncMap;
    const addField = (id: number): void => {
      const type = fieldMap[id];
      // Unsupported types are filtered out in `_scanInstanceUniforms` with a clear error;
      // this only triggers if the scan/build contract is violated
      const info = std140Map[type];
      if (!info) return;
      currentOffset = Math.ceil(currentOffset / info.align) * info.align;
      instanceFields.push({
        property: ShaderProperty._propertyIdMap[id],
        type,
        offset: currentOffset,
        offsetInElements: currentOffset / 4,
        useIntView: type[0] === "i" || type[0] === "u" || type[0] === "b",
        pack: packFuncMap[type]
      });
      currentOffset += info.size;
    };

    // renderer_ModelMat is always required: derived defines reference it, so
    // even shaders that never declared the plain uniform need it in the UBO.
    const modelMatId = Renderer._worldMatrixProperty._uniqueId;
    const layerId = Renderer._rendererLayerProperty._uniqueId;
    if (!(modelMatId in fieldMap)) fieldMap[modelMatId] = "mat3x4";

    // Priority order: ModelMat first, Layer second, rest by property id.
    addField(modelMatId);
    if (layerId in fieldMap) addField(layerId);
    const keys: number[] = [];
    for (const k in fieldMap) {
      const id = +k;
      if (id !== modelMatId && id !== layerId) keys.push(id);
    }
    keys.sort((a, b) => a - b);
    for (let i = 0; i < keys.length; i++) addField(keys[i]);

    const structSize = Math.ceil(currentOffset / 16) * 16;
    const instanceMaxCount = Math.floor(maxUBOSize / structSize);

    return { bindingName: ShaderFactory.RENDERER_INSTANCE_BLOCK_NAME, instanceFields, instanceMaxCount, structSize };
  }

  private static _prepareInstanceCameraInputs(
    source: string,
    otherStage: string,
    blocks: string[],
    members: Set<string>
  ): { source: string; declarations: string } {
    const declarations: string[] = [];
    for (const { derived, matrix } of ShaderFactory._instanceCameraInputs) {
      if (members.has(derived)) continue;
      const firstUse = source.search(new RegExp(`\\b${derived}\\b`));
      if (firstUse < 0) continue;
      // A derived renderer matrix introduces a dependency at its first use, which may
      // precede the original camera declaration or occur in the opposite stage.
      const field = new RegExp(`\\bmat4\\s+${matrix}\\s*;`);
      const loose = new RegExp(`^[ \\t]*uniform\\s+(?:(?:lowp|mediump|highp)\\s+)?mat4\\s+${matrix}\\s*;`, "m");
      const block = blocks.find((block) => field.test(block));
      const declaration = block ?? loose.exec(source)?.[0] ?? loose.exec(otherStage)?.[0] ?? `uniform mat4 ${matrix};`;
      const index = source.indexOf(declaration);
      if (index >= 0 && index < firstUse) continue;
      let hoisted = declaration;
      if (!block && /uniform\s+mat4\b/.test(declaration)) {
        const owner = index >= 0 ? source : otherStage;
        const prefix = owner.slice(0, Math.max(0, owner.indexOf(declaration)));
        const precision = Array.from(prefix.matchAll(/\bprecision\s+(lowp|mediump|highp)\s+float\s*;/g)).pop()?.[1];
        if (precision) hoisted = declaration.replace(/uniform\s+mat4/, `uniform ${precision} mat4`);
      }
      if (!declarations.includes(hoisted)) declarations.push(hoisted);
      if (index >= 0) source = source.replace(declaration, "");
    }
    return { source, declarations: declarations.length ? declarations.join("\n") + "\n" : "" };
  }

  private static _buildUBODeclaration(layout: InstanceBufferLayout): string {
    const { instanceFields, instanceMaxCount } = layout;
    const structLines: string[] = [];
    for (let i = 0; i < instanceFields.length; i++) {
      const { type, property } = instanceFields[i];
      structLines.push(`        ${type} ${property.name};`);
    }
    return (
      `#define INSTANCE_MAX_COUNT ${instanceMaxCount}\n` +
      `struct RendererInstanceStruct {\n${structLines.join("\n")}\n};\n` +
      `layout(std140) uniform ${ShaderFactory.RENDERER_INSTANCE_BLOCK_NAME} {\n` +
      `    RendererInstanceStruct items[INSTANCE_MAX_COUNT];\n} rendererData;\n`
    );
  }

  private static _buildFieldDefines(fields: InstanceFieldInfo[], idExpr: string, members: Set<string>): string {
    const accessor = `rendererData.items[${idExpr}]`;
    const lines: string[] = [];
    let model = "renderer_ModelMat";
    for (let i = 0; i < fields.length; i++) {
      const { type, property } = fields[i];
      const n = property.name;
      if (type === "mat3x4") {
        const m = `${accessor}.${n}`;
        const expression =
          `mat4(` +
          `vec4(${m}[0].x,${m}[1].x,${m}[2].x,0.0),` +
          `vec4(${m}[0].y,${m}[1].y,${m}[2].y,0.0),` +
          `vec4(${m}[0].z,${m}[1].z,${m}[2].z,0.0),` +
          `vec4(${m}[0].w,${m}[1].w,${m}[2].w,1.0))`;
        if (!members.has(n)) lines.push(`#define ${n} ${expression}`);
        // The public spelling can belong to a Scene/Camera member. Derived transforms
        // still read the current instance's affine matrix directly in that case.
        else if (n === model) model = expression;
      } else if (!members.has(n)) {
        lines.push(`#define ${n} ${accessor}.${n}`);
      }
    }
    for (const { derived, matrix } of ShaderFactory._instanceCameraInputs) {
      if (!members.has(derived)) lines.push(`#define ${derived} (${matrix} * ${model})`);
    }
    if (!members.has("renderer_NormalMat")) {
      lines.push(
        ShaderFactory._normalMatrixFunction,
        `#define renderer_NormalMat mat4(_normalMatFromModel(mat3(${model})))`
      );
    }
    return lines.join("\n");
  }
}

/**
 * @internal
 */
export interface InstanceFieldInfo {
  property: ShaderProperty;
  type: string;
  offset: number;
  /** offset / 4, precomputed to avoid repeated division in upload loop */
  offsetInElements: number;
  useIntView: boolean;
  worldTransform?: boolean;
  pack: InstancePackFunc;
}

/**
 * @internal
 */
export interface InstanceBufferLayout {
  bindingName?: string;
  instanceFields: InstanceFieldInfo[];
  instanceMaxCount: number;
  structSize: number;
  headerBytes?: number;
  headerFields?: { property: ShaderProperty; offsetInElements: number; sceneOnly: boolean }[];
}

type InstancePackFunc = (view: Float32Array | Int32Array, offset: number, value: any) => void;
