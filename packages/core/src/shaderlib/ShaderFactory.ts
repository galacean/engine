import { Matrix, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { GLCapabilityType } from "../base/Constant";
import { Logger } from "../base/Logger";
import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ShaderLib } from "./ShaderLib";

/**
 * @internal
 */
export interface InstanceFieldInfo {
  property: ShaderProperty;
  type: string;
  offset: number;
  useIntView: boolean;
  pack: (view: Float32Array | Int32Array, offset: number, value: any) => void;
}

export interface InstanceLayout {
  instanceFields: InstanceFieldInfo[];
  instanceMaxCount: number;
  structSize: number;
}

export class ShaderFactory {
  /** @internal */
  static readonly RENDERER_INSTANCE_BLOCK_NAME = "RendererInstanceData";

  /** @internal */
  static readonly _shaderExtension = [
    "GL_EXT_shader_texture_lod",
    "GL_OES_standard_derivatives",
    "GL_EXT_draw_buffers",
    "GL_EXT_frag_depth"
  ]
    .map((e) => `#extension ${e} : enable\n`)
    .join("");

  private static readonly _has300OutInFragReg = /\bout\s+(?:\w+\s+)?(?:vec4)\s+(?:\w+)\s*;/; // [layout(location = 0)] out [highp] vec4 [color];

  static parseCustomMacros(macros: ShaderMacro[]) {
    return macros.map((m) => `#define ${m.value ? m.name + ` ` + m.value : m.name}\n`).join("");
  }

  /**
   * @internal
   * Compile vertex and fragment source with standard macros, includes, and version header.
   * @param engine - Engine instance
   * @param macroCollection - Current macro collection
   * @param vertexSource - Raw vertex shader source (may contain #include)
   * @param fragmentSource - Raw fragment shader source
   * @returns Compiled { vertexSource, fragmentSource } ready for ShaderProgram
   */
  static compilePlatformSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    vertexSource: string,
    fragmentSource: string,
    isGpuInstance: boolean = false,
    instanceFields?: InstanceFieldInfo[]
  ): { vertexSource: string; fragmentSource: string; instanceFields: InstanceFieldInfo[]; instanceMaxCount: number } {
    const rhi = engine._hardwareRenderer;
    const isWebGL2 = rhi.isWebGL2;
    const shaderMacroList = new Array<ShaderMacro>();
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(ShaderMacro.getByName(isWebGL2 ? "GRAPHICS_API_WEBGL2" : "GRAPHICS_API_WEBGL1"));
    if (rhi.canIUse(GLCapabilityType.shaderTextureLod)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    }
    if (rhi.canIUse(GLCapabilityType.standardDerivatives)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));
    }

    let noIncludeVertex = ShaderFactory.parseIncludes(vertexSource);
    let noIncludeFrag = ShaderFactory.parseIncludes(fragmentSource);

    const macroStr = ShaderFactory.parseCustomMacros(shaderMacroList);
    noIncludeVertex = macroStr + noIncludeVertex;
    noIncludeFrag = macroStr + noIncludeFrag;

    let injectedInstanceFields: InstanceFieldInfo[] = null;
    let injectedInstanceMaxCount = 0;
    if (isGpuInstance) {
      const injected = ShaderFactory._injectInstanceUBO(engine, noIncludeVertex, noIncludeFrag, instanceFields);
      noIncludeVertex = injected.vertexSource;
      noIncludeFrag = injected.fragmentSource;
      injectedInstanceFields = injected.instanceFields;
      injectedInstanceMaxCount = injected.instanceMaxCount;
    }

    if (isWebGL2) {
      noIncludeVertex = ShaderFactory.convertTo300(noIncludeVertex);
      noIncludeFrag = ShaderFactory.convertTo300(noIncludeFrag, true);
    }

    const versionStr = isWebGL2 ? "#version 300 es" : "#version 100";
    const precisionStr = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  precision highp int;
#else
  precision mediump float;
  precision mediump int;
#endif
`;

    return {
      vertexSource: `${versionStr}\nprecision highp float;\n${noIncludeVertex}`,
      fragmentSource: `${versionStr}\n${isWebGL2 ? "" : ShaderFactory._shaderExtension}${precisionStr}${noIncludeFrag}`,
      instanceFields: injectedInstanceFields,
      instanceMaxCount: injectedInstanceMaxCount
    };
  }

  /** Built-in renderer uniforms. value=true means derived (remove but not added to UBO). */
  private static _builtinRendererUniforms = new Map([
    ["renderer_ModelMat", false],
    ["renderer_Layer", false],
    ["renderer_LocalMat", true],
    ["renderer_MVMat", true],
    ["renderer_MVPMat", true],
    ["renderer_NormalMat", true],
    ["renderer_MVInvMat", true]
  ]);

  private static _uboUniformRegex = /^([ \t]*)uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*;/gm;

  /** @internal std140 layout info by GLSL type string. */
  static _std140Map: Record<string, { size: number; align: number }> = {
    float: { size: 4, align: 4 },
    int: { size: 4, align: 4 },
    uint: { size: 4, align: 4 },
    vec2: { size: 8, align: 8 },
    ivec2: { size: 8, align: 8 },
    vec3: { size: 12, align: 16 },
    ivec3: { size: 12, align: 16 },
    vec4: { size: 16, align: 16 },
    ivec4: { size: 16, align: 16 },
    mat4: { size: 64, align: 16 },
    mat4_affine: { size: 48, align: 16 }
  };

  /** Pack functions for writing typed values into ArrayBuffer views. */
  private static _packFuncMap: Record<string, InstanceFieldInfo["pack"]> = {
    float: (v, o, val: number) => {
      v[o] = val;
    },
    int: (v, o, val: number) => {
      v[o] = val;
    },
    uint: (v, o, val: number) => {
      v[o] = val;
    },
    vec2: (v, o, val: Vector2) => {
      v[o] = val.x;
      v[o + 1] = val.y;
    },
    ivec2: (v, o, val: Vector2) => {
      v[o] = val.x;
      v[o + 1] = val.y;
    },
    vec3: (v, o, val: Vector3) => {
      v[o] = val.x;
      v[o + 1] = val.y;
      v[o + 2] = val.z;
    },
    ivec3: (v, o, val: Vector3) => {
      v[o] = val.x;
      v[o + 1] = val.y;
      v[o + 2] = val.z;
    },
    vec4: (v, o, val: Vector4) => {
      v[o] = val.x;
      v[o + 1] = val.y;
      v[o + 2] = val.z;
      v[o + 3] = val.w;
    },
    ivec4: (v, o, val: Vector4) => {
      v[o] = val.x;
      v[o + 1] = val.y;
      v[o + 2] = val.z;
      v[o + 3] = val.w;
    },
    mat4: (v, o, val: Matrix) => {
      const e = val.elements;
      for (let k = 0; k < 16; k++) v[o + k] = e[k];
    },
    // Affine mat4 → 3 rows (vec4 each), skip row3 (0,0,0,1). Transposed layout.
    mat4_affine: (v, o, val: Matrix) => {
      const e = val.elements;
      // row0=(e0,e4,e8,e12) row1=(e1,e5,e9,e13) row2=(e2,e6,e10,e14)
      for (let r = 0; r < 3; r++) {
        v[o + r * 4] = e[r];
        v[o + r * 4 + 1] = e[r + 4];
        v[o + r * 4 + 2] = e[r + 8];
        v[o + r * 4 + 3] = e[r + 12];
      }
    }
  };

  /**
   * @internal
   * For GPU instancing shaders, scan VS and FS for `uniform ... renderer_*` declarations,
   * compute their union, generate a full UBO struct + `#define` remapping, and inject into source.
   * Also computes std140 layout and INSTANCE_MAX_COUNT from maxUBOSize.
   */
  static _injectInstanceUBO(
    engine: Engine,
    vertexSource: string,
    fragmentSource: string,
    externalFields?: InstanceFieldInfo[]
  ): { vertexSource: string; fragmentSource: string; instanceFields: InstanceFieldInfo[]; instanceMaxCount: number } {
    const fieldMap: Record<number, string> = Object.create(null);
    vertexSource = ShaderFactory._scanInstanceUniforms(vertexSource, fieldMap, true);
    fragmentSource = ShaderFactory._scanInstanceUniforms(fragmentSource, fieldMap, true);

    let instanceFields: InstanceFieldInfo[];
    let instanceMaxCount: number;
    if (externalFields) {
      instanceFields = externalFields;
      const maxUBOSize = engine._hardwareRenderer.getMaxUniformBlockSize();
      const last = externalFields[externalFields.length - 1];
      const lastSize = ShaderFactory._std140Map[last.type]?.size ?? 0;
      const structSize = Math.ceil((last.offset + lastSize) / 16) * 16;
      instanceMaxCount = Math.floor(maxUBOSize / structSize);
    } else {
      let hasField = false;
      for (const _ in fieldMap) {
        hasField = true;
        break;
      }
      if (!hasField) return { vertexSource, fragmentSource, instanceFields: null, instanceMaxCount: 0 };
      ({ instanceFields, instanceMaxCount } = ShaderFactory._buildLayout(engine, fieldMap));
    }

    // Generate UBO struct fields and per-field #define remapping
    const structFieldLines: string[] = [];
    for (let i = 0; i < instanceFields.length; i++) {
      const { type, property } = instanceFields[i];
      if (type === "mat4_affine") {
        for (let r = 0; r < 3; r++) structFieldLines.push(`        vec4 ${property.name}R${r};`);
      } else {
        structFieldLines.push(`        ${type} ${property.name};`);
      }
    }

    const uboStruct =
      `#define INSTANCE_MAX_COUNT ${instanceMaxCount}\n` +
      `struct RendererInstanceStruct {\n${structFieldLines.join("\n")}\n};\n` +
      `layout(std140) uniform ${ShaderFactory.RENDERER_INSTANCE_BLOCK_NAME} {\n` +
      `    RendererInstanceStruct rendererData[INSTANCE_MAX_COUNT];\n};\n`;

    const derivedDefines =
      "#define renderer_MVMat (camera_ViewMat * renderer_ModelMat)\n" +
      "#define renderer_MVPMat (camera_VPMat * renderer_ModelMat)\n" +
      "#define renderer_NormalMat transpose(inverse(mat3(renderer_ModelMat)))";

    const vsUboBlock = `${uboStruct}flat out int v_instanceID;\n${ShaderFactory._buildFieldDefines(instanceFields, "gl_InstanceID")}\n${derivedDefines}\n`;
    const fsUboBlock = `${uboStruct}flat in int v_instanceID;\n${ShaderFactory._buildFieldDefines(instanceFields, "v_instanceID")}\n${derivedDefines}\n`;

    vertexSource = ShaderFactory._insertUBOBlock(vertexSource, vsUboBlock);
    vertexSource = vertexSource.replace(/void\s+main\s*\(\s*\)\s*\{/, "void main() {\n    v_instanceID = gl_InstanceID;");
    fragmentSource = ShaderFactory._insertUBOBlock(fragmentSource, fsUboBlock);

    return { vertexSource, fragmentSource, instanceFields, instanceMaxCount };
  }

  /**
   * @internal
   * Scan source for renderer-group uniforms and collect into fieldMap.
   * @param remove - If true, remove matched declarations from source.
   */
  static _scanInstanceUniforms(source: string, fieldMap: Record<number, string>, remove: true): string;
  static _scanInstanceUniforms(source: string, fieldMap: Record<number, string>): boolean;
  static _scanInstanceUniforms(source: string, fieldMap: Record<number, string>, remove?: boolean): string | boolean {
    const builtinUniforms = ShaderFactory._builtinRendererUniforms;
    let found = false;
    const result = source.replace(ShaderFactory._uboUniformRegex, (match, _indent, type, name) => {
      if (type.indexOf("sampler") !== -1) return match;
      const isDerived = builtinUniforms.get(name);
      if (isDerived === undefined && ShaderProperty._getShaderPropertyGroup(name) !== ShaderDataGroup.Renderer) return match;
      if (isDerived) return remove ? "" : match;
      // Store ModelMat as affine (3×vec4) to save UBO space
      fieldMap[ShaderProperty.getByName(name)._uniqueId] = type === "mat4" && name === "renderer_ModelMat" ? "mat4_affine" : type;
      found = true;
      return remove ? "" : match;
    });
    return remove ? result : found;
  }

  /** @internal */
  static _buildLayout(engine: Engine, fieldMap: Record<number, string>): InstanceLayout {
    const maxUBOSize = engine._hardwareRenderer.getMaxUniformBlockSize();
    const std140Map = ShaderFactory._std140Map;
    const instanceFields: InstanceFieldInfo[] = [];
    let currentOffset = 0;

    const packFuncMap = ShaderFactory._packFuncMap;
    const addField = (id: number): void => {
      const type = fieldMap[id];
      const info = std140Map[type];
      if (!info) return;
      currentOffset = Math.ceil(currentOffset / info.align) * info.align;
      instanceFields.push({
        property: ShaderProperty._propertyIdMap[id],
        type,
        offset: currentOffset,
        useIntView: type[0] === "i" || type[0] === "u",
        pack: packFuncMap[type]
      });
      currentOffset += info.size;
    };

    // Priority fields first
    const modelMatId = Renderer._worldMatrixProperty._uniqueId;
    const layerId = Renderer._rendererLayerProperty._uniqueId;
    if (modelMatId in fieldMap) {
      addField(modelMatId);
      delete fieldMap[modelMatId];
    }
    if (layerId in fieldMap) {
      addField(layerId);
      delete fieldMap[layerId];
    }

    // Remaining fields sorted by id
    const keys: number[] = [];
    for (const k in fieldMap) keys.push(+k);
    keys.sort((a, b) => a - b);
    for (let i = 0; i < keys.length; i++) addField(keys[i]);

    const structSize = Math.ceil(currentOffset / 16) * 16;
    const instanceMaxCount = Math.floor(maxUBOSize / structSize);

    return { instanceFields, instanceMaxCount, structSize };
  }

  /** Build per-field #define lines, using `idExpr` as the instance index (gl_InstanceID or v_instanceID). */
  private static _buildFieldDefines(fields: InstanceFieldInfo[], idExpr: string): string {
    const lines: string[] = [];
    for (let i = 0; i < fields.length; i++) {
      const { type, property } = fields[i];
      const d = `rendererData[${idExpr}]`;
      if (type === "mat4_affine") {
        const n = property.name;
        lines.push(
          `#define ${n} mat4(` +
          `vec4(${d}.${n}R0.x,${d}.${n}R1.x,${d}.${n}R2.x,0.0),` +
          `vec4(${d}.${n}R0.y,${d}.${n}R1.y,${d}.${n}R2.y,0.0),` +
          `vec4(${d}.${n}R0.z,${d}.${n}R1.z,${d}.${n}R2.z,0.0),` +
          `vec4(${d}.${n}R0.w,${d}.${n}R1.w,${d}.${n}R2.w,1.0))`
        );
      } else {
        lines.push(`#define ${property.name} ${d}.${property.name}`);
      }
    }
    return lines.join("\n");
  }

  /**
   * Insert a UBO block into source after the macro section.
   */
  private static _insertUBOBlock(source: string, uboBlock: string): string {
    const lines = source.split("\n");
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (trimmed.startsWith("#define ")) {
        insertIdx = i + 1;
      } else if (trimmed.length > 0) {
        break;
      }
    }
    lines.splice(insertIdx, 0, uboBlock);
    return lines.join("\n");
  }

  static registerInclude(includeName: string, includeSource: string) {
    if (ShaderLib[includeName]) {
      throw `The "${includeName}" shader include already exist`;
    }
    ShaderLib[includeName] = includeSource;
  }

  static unRegisterInclude(includeName: string) {
    delete ShaderLib[includeName];
  }

  /**
   * @param regex The default regex is for engine's builtin glsl `#include` syntax,
   * since `ShaderLab` use the same parsing function but different syntax for `#include` --- `/^[ \t]*#include +"([\w\d.]+)"/gm`
   */
  static parseIncludes(src: string, regex = /^[ \t]*#include +<([\w\d.]+)>/gm) {
    function replace(match, slice) {
      var replace = ShaderLib[slice];

      if (replace === undefined) {
        Logger.error(`Shader slice "${match.trim()}" not founded.`);
        return "";
      }

      return ShaderFactory.parseIncludes(replace, regex);
    }

    return src.replace(regex, replace);
  }

  /**
   * Convert lower GLSL version to GLSL 300 es.
   * @param shader - code
   * @param isFrag - Whether it is a fragment shader.
   */
  static convertTo300(shader: string, isFrag?: boolean) {
    shader = shader.replace(/\bvarying\b/g, isFrag ? "in" : "out");
    shader = shader.replace(/\btexture(2D|Cube)\b/g, "texture");
    shader = shader.replace(/\btexture2DProj\b/g, "textureProj");
    shader = shader.replace(/\btexture(2D|Cube)LodEXT\b/g, "textureLod");
    shader = shader.replace(/\btexture(2D|Cube)GradEXT\b/g, "textureGrad");
    shader = shader.replace(/\btexture2DProjLodEXT\b/g, "textureProjLod");
    shader = shader.replace(/\btexture2DProjGradEXT\b/g, "textureProjGrad");

    if (isFrag) {
      shader = shader.replace(/\bgl_FragDepthEXT\b/g, "gl_FragDepth");

      if (!ShaderFactory._has300Output(shader)) {
        const isMRT = /\bgl_FragData\[.+?\]/g.test(shader);
        if (isMRT) {
          shader = shader.replace(/\bgl_FragColor\b/g, "gl_FragData[0]");
          const result = shader.match(/\bgl_FragData\[.+?\]/g);
          shader = this._replaceMRTShader(shader, result);
        } else {
          shader = "out vec4 glFragColor;\n" + shader;
          shader = shader.replace(/\bgl_FragColor\b/g, "glFragColor");
        }
      }
    } else {
      shader = shader.replace(/\battribute\b/g, "in");
    }

    return shader;
  }

  private static _has300Output(fragmentShader: string): boolean {
    return ShaderFactory._has300OutInFragReg.test(fragmentShader);
  }

  private static _replaceMRTShader(shader: string, result: string[]): string {
    let declaration = "";
    const mrtIndexSet = new Set();

    for (let i = 0; i < result.length; i++) {
      const res = result[i].match(/\bgl_FragData\[(.+?)\]/);
      mrtIndexSet.add(res[1]);
    }

    mrtIndexSet.forEach((index) => {
      declaration += `layout(location=${index}) out vec4 fragOutColor${index};\n`;
    });
    declaration += `void main(`;

    shader = shader.replace(/\bgl_FragData\[(.+?)\]/g, "fragOutColor$1");

    shader = shader.replace(/void\s+?main\s*\(/g, declaration);
    return shader;
  }
}
