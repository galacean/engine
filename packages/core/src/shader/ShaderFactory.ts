import { Matrix, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Logger } from "../base/Logger";
import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { ConstantBufferBindingPoint } from "./enums/ConstantBufferBindingPoint";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderBlockProperty } from "./ShaderBlockProperty";
import { ShaderProperty } from "./ShaderProperty";

/**
 * Shader registry and GLSL utilities. Holds the `#include` lookup table
 * the runtime preprocessor reads, the GLSL ES 100 → 300 syntax converter
 * the WebGL2 path uses, and the GPU-instancing UBO injector that
 * `ShaderPass` runs over compiled GLSL source.
 */
export class ShaderFactory {
  static readonly RENDERER_INSTANCE_BLOCK_NAME = "RendererInstanceData";

  static readonly uniformBlockBindingMap: Record<number, number> = {
    [ShaderBlockProperty.getByName(ShaderFactory.RENDERER_INSTANCE_BLOCK_NAME)._uniqueId]:
      ConstantBufferBindingPoint.RendererInstance
  };

  static readonly includeMap: Record<string, string> = {};

  static readonly shaderExtension = [
    "GL_EXT_shader_texture_lod",
    "GL_OES_standard_derivatives",
    "GL_EXT_draw_buffers",
    "GL_EXT_frag_depth"
  ]
    .map((e) => `#extension ${e} : enable\n`)
    .join("");

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

  // [layout(location = 0)] out [highp] vec4 [color];
  private static readonly _has300OutInFragReg = /\bout\s+(?:\w+\s+)?vec4\s+\w+\s*;/;

  private static readonly _derivedDefines = `\
#define renderer_MVMat (camera_ViewMat * renderer_ModelMat)
#define renderer_MVPMat (camera_VPMat * renderer_ModelMat)
#define renderer_NormalMat mat4(transpose(inverse(mat3(renderer_ModelMat))))`;

  // Built-in renderer uniforms. value=true means derived (remove but not added to UBO)
  // NOTE: keep this in sync with _derivedDefines / _cameraMatrixCandidates above.
  private static readonly _builtinRendererUniforms: Record<string, boolean> = {
    renderer_ModelMat: false,
    renderer_Layer: false,
    renderer_MVMat: true,
    renderer_MVPMat: true,
    renderer_NormalMat: true
  };

  // Camera matrices the derived defines reference; declared on demand because
  // shader-compiler DCE may have stripped them from Transform.glsl.
  // NOTE: keep this in sync with _derivedDefines above.
  private static readonly _cameraMatrixCandidates: ReadonlyArray<string> = ["camera_ViewMat", "camera_VPMat"];

  private static readonly _uboUniformRegex =
    /^[ \t]*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*(\[.+?\])?\s*;/gm;

  // Preprocessor directives — only `#ifdef / #ifndef / #else / #endif` are
  // supported; `#if` with expressions is treated as always-active.
  private static readonly _ifdefRegex = /^[ \t]*#ifdef\s+(\w+)/;
  private static readonly _ifndefRegex = /^[ \t]*#ifndef\s+(\w+)/;
  private static readonly _elseRegex = /^[ \t]*#else\b/;
  private static readonly _endifRegex = /^[ \t]*#endif\b/;

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

  /**
   * Register a chunk source so `#include` resolves it.
   * @param includeName - The path key referenced in `#include "..."`.
   * @param includeSource - GLSL chunk source text.
   */
  static registerInclude(includeName: string, includeSource: string): void {
    if (ShaderFactory.includeMap[includeName]) {
      throw `The "${includeName}" shader include already exist`;
    }
    ShaderFactory.includeMap[includeName] = includeSource;
  }

  /**
   * Remove a registered shader chunk.
   * @param includeName - The path key passed to `registerInclude`.
   */
  static unRegisterInclude(includeName: string): void {
    delete ShaderFactory.includeMap[includeName];
  }

  /**
   * Convert lower GLSL version to GLSL 300 es.
   * @param shader - code
   * @param isFrag - Whether it is a fragment shader.
   */
  static convertTo300(shader: string, isFrag?: boolean): string {
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
          shader = ShaderFactory._replaceMRTShader(shader, result);
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
   * Scan VS/FS for renderer-group `uniform` declarations, replace them with a shared
   * std140 UBO (instanced array), and emit `#define` remapping so original uniform
   * names resolve to `rendererData[instanceID].field`.
   *
   * @param activeMacros - When supplied, scanning honors `#ifdef`/`#ifndef` blocks so
   *                       uniforms in inactive branches are not collected.
   */
  static injectInstanceUBO(
    engine: Engine,
    vertexSource: string,
    fragmentSource: string,
    activeMacros?: Set<string>
  ): { vertexSource: string; fragmentSource: string; instanceLayout: InstanceBufferLayout | null } {
    const fieldMap: Record<number, string> = Object.create(null);
    if (activeMacros) {
      vertexSource = ShaderFactory._scanInstanceUniformsWithMacros(vertexSource, fieldMap, activeMacros);
      fragmentSource = ShaderFactory._scanInstanceUniformsWithMacros(fragmentSource, fieldMap, activeMacros);
    } else {
      vertexSource = ShaderFactory._scanInstanceUniforms(vertexSource, fieldMap);
      fragmentSource = ShaderFactory._scanInstanceUniforms(fragmentSource, fieldMap);
    }

    let hasField = false;
    for (const _ in fieldMap) {
      hasField = true;
      break;
    }
    if (!hasField) return { vertexSource, fragmentSource, instanceLayout: null };

    const instanceLayout = ShaderFactory._buildLayout(engine, fieldMap);

    const { instanceFields } = instanceLayout;
    const uboDecl = ShaderFactory._buildUBODeclaration(instanceLayout);
    const fieldDefinesVS = ShaderFactory._buildFieldDefines(instanceFields, "gl_InstanceID");
    const fieldDefinesFS = ShaderFactory._buildFieldDefines(instanceFields, "v_instanceID");
    const derivedDefines = ShaderFactory._derivedDefines;
    const vsCameraDecls = ShaderFactory._buildMissingCameraDecls(vertexSource);
    const fsCameraDecls = ShaderFactory._buildMissingCameraDecls(fragmentSource);

    const vsBlock = `${uboDecl}flat out int v_instanceID;\n${vsCameraDecls}${fieldDefinesVS}\n${derivedDefines}\n`;
    const fsBlock = `${uboDecl}flat in int v_instanceID;\n${fsCameraDecls}${fieldDefinesFS}\n${derivedDefines}\n`;

    vertexSource = vsBlock + vertexSource;
    vertexSource = vertexSource.replace(
      /void\s+main\s*\(\s*\)\s*\{/,
      "void main() {\n    v_instanceID = gl_InstanceID;"
    );
    fragmentSource = fsBlock + fragmentSource;

    return { vertexSource, fragmentSource, instanceLayout };
  }

  private static _scanInstanceUniforms(source: string, fieldMap: Record<number, string>): string {
    const builtinUniforms = ShaderFactory._builtinRendererUniforms;
    return source.replace(ShaderFactory._uboUniformRegex, (match, type, name, arraySize) => {
      if (type.includes("sampler")) return match;
      const isDerived = builtinUniforms[name];
      if (isDerived === undefined && ShaderProperty._getShaderPropertyGroup(name) !== ShaderDataGroup.Renderer)
        return match;
      if (isDerived) return "";
      if (arraySize) {
        Logger.error(`GPU Instancing does not support array uniform "${name}${arraySize}"`);
        return match;
      }
      // ModelMat is affine, store as mat3x4 (3 columns) to save 16 bytes per instance
      fieldMap[ShaderProperty.getByName(name)._uniqueId] =
        type === "mat4" && name === "renderer_ModelMat" ? "mat3x4" : type;
      return "";
    });
  }

  /**
   * Scan with preprocessor awareness, for raw GLSL paths where `#ifdef` blocks are not yet
   * expanded. Uniforms inside inactive branches are skipped.
   */
  private static _scanInstanceUniformsWithMacros(
    source: string,
    fieldMap: Record<number, string>,
    activeMacros: Set<string>
  ): string {
    const branchStack: boolean[] = [true];
    const lines = source.split("\n");

    for (let i = 0, n = lines.length; i < n; i++) {
      const line = lines[i];

      let m = line.match(ShaderFactory._ifdefRegex);
      if (m) {
        const parentActive = branchStack[branchStack.length - 1];
        branchStack.push(parentActive && activeMacros.has(m[1]));
        continue;
      }
      m = line.match(ShaderFactory._ifndefRegex);
      if (m) {
        const parentActive = branchStack[branchStack.length - 1];
        branchStack.push(parentActive && !activeMacros.has(m[1]));
        continue;
      }
      if (ShaderFactory._elseRegex.test(line)) {
        const parentActive = branchStack.length >= 2 ? branchStack[branchStack.length - 2] : true;
        const currentActive = branchStack[branchStack.length - 1];
        branchStack[branchStack.length - 1] = parentActive && !currentActive;
        continue;
      }
      if (ShaderFactory._endifRegex.test(line)) {
        if (branchStack.length > 1) branchStack.pop();
        continue;
      }
      if (!branchStack[branchStack.length - 1]) continue;

      lines[i] = ShaderFactory._scanInstanceUniforms(line, fieldMap);
    }

    return lines.join("\n");
  }

  private static _buildLayout(engine: Engine, fieldMap: Record<number, string>): InstanceBufferLayout {
    const maxUBOSize = engine._hardwareRenderer.maxUniformBlockSize;
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

    return { instanceFields, instanceMaxCount, structSize };
  }

  private static _buildMissingCameraDecls(source: string): string {
    let out = "";
    const candidates = ShaderFactory._cameraMatrixCandidates;
    for (let i = 0; i < candidates.length; i++) {
      const name = candidates[i];
      const decl = new RegExp(`^\\s*uniform\\s+(?:(?:lowp|mediump|highp)\\s+)?mat4\\s+${name}\\s*;`, "m");
      if (!decl.test(source)) {
        out += `uniform mat4 ${name};\n`;
      }
    }
    return out;
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
      `    RendererInstanceStruct rendererData[INSTANCE_MAX_COUNT];\n};\n`
    );
  }

  private static _buildFieldDefines(fields: InstanceFieldInfo[], idExpr: string): string {
    const accessor = `rendererData[${idExpr}]`;
    const lines: string[] = [];
    for (let i = 0; i < fields.length; i++) {
      const { type, property } = fields[i];
      const n = property.name;
      if (type === "mat3x4") {
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
export interface InstanceBufferLayout {
  instanceFields: InstanceFieldInfo[];
  instanceMaxCount: number;
  structSize: number;
}

type InstancePackFunc = (view: Float32Array | Int32Array, offset: number, value: any) => void;
