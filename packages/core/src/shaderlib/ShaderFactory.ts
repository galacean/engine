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
export class ShaderFactory {
  static readonly RENDERER_INSTANCE_BLOCK_NAME = "RendererInstanceData";

  static readonly shaderExtension = [
    "GL_EXT_shader_texture_lod",
    "GL_OES_standard_derivatives",
    "GL_EXT_draw_buffers",
    "GL_EXT_frag_depth"
  ]
    .map((e) => `#extension ${e} : enable\n`)
    .join("");

  /** std140 layout info by GLSL type string */
  private static readonly _std140TypeInfoMap: Record<string, { size: number; align: number }> = {
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
    mat3x4: { size: 48, align: 16 }
  };

  private static readonly _has300OutInFragReg = /\bout\s+(?:\w+\s+)?vec4\s+\w+\s*;/;

  private static readonly _precisionStr = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  precision highp int;
#else
  precision mediump float;
  precision mediump int;
#endif
`;

  private static readonly _derivedDefines =
    "#define renderer_MVMat (camera_ViewMat * renderer_ModelMat)\n" +
    "#define renderer_MVPMat (camera_VPMat * renderer_ModelMat)\n" +
    "#define renderer_NormalMat mat4(transpose(inverse(mat3(renderer_ModelMat))))";

  /** Built-in renderer uniforms. value=true means derived (remove but not added to UBO) */
  private static readonly _builtinRendererUniforms = new Map([
    ["renderer_ModelMat", false],
    ["renderer_Layer", false],
    ["renderer_MVMat", true],
    ["renderer_MVPMat", true],
    ["renderer_NormalMat", true]
  ]);

  private static readonly _uboUniformRegex = /^[ \t]*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*;/gm;

  /** Pack functions for writing typed values into ArrayBuffer views */
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
      vec2: packVec2,
      ivec2: packVec2,
      vec3: packVec3,
      ivec3: packVec3,
      vec4: packVec4,
      ivec4: packVec4,
      mat4: (v: Float32Array | Int32Array, o: number, val: Matrix) => {
        const e = val.elements;
        for (let k = 0; k < 16; k++) v[o + k] = e[k];
      },
      // Affine mat4 stored as mat3x4: write 3 transposed rows (row3 is always 0,0,0,1)
      mat3x4: (v: Float32Array | Int32Array, o: number, val: Matrix) => {
        const e = val.elements;
        // Row 0
        v[o] = e[0];
        v[o + 1] = e[4];
        v[o + 2] = e[8];
        v[o + 3] = e[12];
        // Row 1
        v[o + 4] = e[1];
        v[o + 5] = e[5];
        v[o + 6] = e[9];
        v[o + 7] = e[13];
        // Row 2
        v[o + 8] = e[2];
        v[o + 9] = e[6];
        v[o + 10] = e[10];
        v[o + 11] = e[14];
      }
    };
  })();

  static parseCustomMacros(macros: ShaderMacro[]) {
    return macros.map((m) => `#define ${m.value ? m.name + ` ` + m.value : m.name}\n`).join("");
  }

  /**
   * Compile vertex and fragment source with standard macros, includes, and version header.
   */
  static compilePlatformSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    vertexSource: string,
    fragmentSource: string,
    isGPUInstance: boolean
  ): { vertexSource: string; fragmentSource: string; instanceLayout: InstanceLayout | null } {
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

    let instanceLayout: InstanceLayout | null = null;
    if (isGPUInstance) {
      const injected = ShaderFactory.injectInstanceUBO(engine, noIncludeVertex, noIncludeFrag);
      noIncludeVertex = injected.vertexSource;
      noIncludeFrag = injected.fragmentSource;
      instanceLayout = injected.instanceLayout;
    }

    if (isWebGL2) {
      noIncludeVertex = ShaderFactory.convertTo300(noIncludeVertex);
      noIncludeFrag = ShaderFactory.convertTo300(noIncludeFrag, true);
    }

    const versionStr = isWebGL2 ? "#version 300 es" : "#version 100";

    return {
      vertexSource: `${versionStr}\nprecision highp float;\n${noIncludeVertex}`,
      fragmentSource: `${versionStr}\n${isWebGL2 ? "" : ShaderFactory.shaderExtension}${ShaderFactory._precisionStr}${noIncludeFrag}`,
      instanceLayout
    };
  }

  /**
   * Scan VS/FS for renderer-group `uniform` declarations, replace them with a shared
   * std140 UBO (instanced array), and emit `#define` remapping so original uniform
   * names resolve to `rendererData[instanceID].field`.
   */
  static injectInstanceUBO(
    engine: Engine,
    vertexSource: string,
    fragmentSource: string
  ): { vertexSource: string; fragmentSource: string; instanceLayout: InstanceLayout | null } {
    // 1. Scan & strip renderer uniforms from both stages, collect into fieldMap
    const fieldMap: Record<number, string> = Object.create(null);
    vertexSource = ShaderFactory._scanInstanceUniforms(vertexSource, fieldMap);
    fragmentSource = ShaderFactory._scanInstanceUniforms(fragmentSource, fieldMap);

    // Fast empty check without allocating an array
    let hasField = false;
    for (const _ in fieldMap) {
      hasField = true;
      break;
    }
    if (!hasField) return { vertexSource, fragmentSource, instanceLayout: null };

    // 2. Compute std140 layout (field offsets, struct size, max instance count)
    const instanceLayout = ShaderFactory._buildLayout(engine, fieldMap);

    // 3. Generate GLSL UBO block and inject into both stages
    const { instanceFields } = instanceLayout;
    const uboDecl = ShaderFactory._buildUBODeclaration(instanceLayout);
    const fieldDefinesVS = ShaderFactory._buildFieldDefines(instanceFields, "gl_InstanceID");
    const fieldDefinesFS = ShaderFactory._buildFieldDefines(instanceFields, "v_instanceID");
    const derivedDefines = ShaderFactory._derivedDefines;

    const vsBlock = `${uboDecl}flat out int v_instanceID;\n${fieldDefinesVS}\n${derivedDefines}\n`;
    const fsBlock = `${uboDecl}flat in int v_instanceID;\n${fieldDefinesFS}\n${derivedDefines}\n`;

    vertexSource = vsBlock + vertexSource;
    vertexSource = vertexSource.replace(
      /void\s+main\s*\(\s*\)\s*\{/,
      "void main() {\n    v_instanceID = gl_InstanceID;"
    );
    fragmentSource = fsBlock + fragmentSource;

    return { vertexSource, fragmentSource, instanceLayout };
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
    return src.replace(regex, (match, slice) => {
      const replacement = ShaderLib[slice];
      if (replacement === undefined) {
        Logger.error(`Shader slice "${match.trim()}" not founded.`);
        return "";
      }
      return ShaderFactory.parseIncludes(replacement, regex);
    });
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

      if (!ShaderFactory._has300OutInFragReg.test(shader)) {
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

  /**
   * Scan source for renderer-group uniforms, collect into fieldMap, and remove matched declarations
   */
  private static _scanInstanceUniforms(source: string, fieldMap: Record<number, string>): string {
    const builtinUniforms = ShaderFactory._builtinRendererUniforms;
    return source.replace(ShaderFactory._uboUniformRegex, (match, type, name) => {
      if (type.includes("sampler")) return match;
      const isDerived = builtinUniforms.get(name);
      if (isDerived === undefined && ShaderProperty._getShaderPropertyGroup(name) !== ShaderDataGroup.Renderer)
        return match;
      if (isDerived) return "";
      // ModelMat is affine, store as mat3x4 (3 columns) to save 16 bytes per instance
      fieldMap[ShaderProperty.getByName(name)._uniqueId] =
        type === "mat4" && name === "renderer_ModelMat" ? "mat3x4" : type;
      return "";
    });
  }

  private static _buildLayout(engine: Engine, fieldMap: Record<number, string>): InstanceLayout {
    const maxUBOSize = engine._hardwareRenderer.getMaxUniformBlockSize();
    const std140Map = ShaderFactory._std140TypeInfoMap;
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
        offsetInElements: currentOffset / 4,
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

  /** Generate the GLSL UBO struct declaration + layout uniform block */
  private static _buildUBODeclaration(layout: InstanceLayout): string {
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
      `    RendererInstanceStruct rendererData[INSTANCE_MAX_COUNT];\n};\n`
    );
  }

  /** Build per-field #define lines remapping uniform names to UBO array access */
  private static _buildFieldDefines(fields: InstanceFieldInfo[], idExpr: string): string {
    const accessor = `rendererData[${idExpr}]`;
    const lines: string[] = [];
    for (let i = 0; i < fields.length; i++) {
      const { type, property } = fields[i];
      const n = property.name;
      if (type === "mat3x4") {
        // mat3x4 stores 3 transposed rows; reconstruct column-major mat4 with row3=(0,0,0,1)
        const m = `${accessor}.${n}`;
        lines.push(
          `#define ${n} mat4(` +
            `vec4(${m}[0].x,${m}[1].x,${m}[2].x,0.0),` +
            `vec4(${m}[0].y,${m}[1].y,${m}[2].y,0.0),` +
            `vec4(${m}[0].z,${m}[1].z,${m}[2].z,0.0),` +
            `vec4(${m}[0].w,${m}[1].w,${m}[2].w,1.0))`
        );
      } else {
        lines.push(`#define ${n} ${accessor}.${n}`);
      }
    }
    return lines.join("\n");
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

/**
 * @internal
 */
type InstancePackFunc = (view: Float32Array | Int32Array, offset: number, value: any) => void;

export interface InstanceFieldInfo {
  property: ShaderProperty;
  type: string;
  offset: number;
  /** offset / 4, precomputed to avoid repeated division in upload loop */
  offsetInElements: number;
  useIntView: boolean;
  pack: InstancePackFunc;
}

/**
 * @internal
 */
export interface InstanceLayout {
  instanceFields: InstanceFieldInfo[];
  instanceMaxCount: number;
  structSize: number;
}
