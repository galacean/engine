import { Engine } from "../Engine";
import { InstanceBuffer } from "../RenderPipeline/InstanceBuffer";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { GLCapabilityType } from "../base/Constant";
import { ShaderFactory, InstanceBufferLayout } from "../shaderlib/ShaderFactory";
import { Shader } from "./Shader";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPart } from "./ShaderPart";
import { ShaderProgramMap } from "./ShaderProgramMap";
import { ShaderProgram } from "./ShaderProgram";
import { ShaderProperty } from "./ShaderProperty";
import { ShaderLanguage } from "./enums/ShaderLanguage";
import { RenderState } from "./state/RenderState";

const precisionStr = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      precision highp int;
    #else
      precision mediump float;
      precision mediump int;
    #endif
    `;

/**
 * Shader pass containing vertex and fragment source.
 */
export class ShaderPass extends ShaderPart {
  /** @internal */
  static _shaderPassCounter: number = 0;
  /** @internal */
  static _shaderRootPath = "shaders://root/";

  /**
   * @internal
   */
  _platformTarget: ShaderLanguage | undefined;

  /** @internal */
  _shaderPassId: number = 0;

  /**
   * @internal
   * @remarks If undefined, the blend state of the material will be used ( deprecate mode ).
   */
  _renderState: RenderState;
  /** @internal */
  _renderStateDataMap: Record<number, ShaderProperty> = {};
  /** @internal */
  _shaderProgramMaps: ShaderProgramMap[] = [];

  private _vertexSource: string;
  private _fragmentSource: string;

  /**
   * Create a shader pass.
   * @param name - Shader pass name
   * @param vertexSource - Vertex shader source
   * @param fragmentSource - Fragment shader source
   * @param tags - Tags
   */
  constructor(
    name: string,
    vertexSource: string,
    fragmentSource: string,
    tags?: Record<string, number | string | boolean>
  );

  /**
   * Create a shader pass.
   * @param vertexSource - Vertex shader source
   * @param fragmentSource - Fragment shader source
   * @param tags - Tags
   */
  constructor(vertexSource: string, fragmentSource: string, tags?: Record<string, number | string | boolean>);

  constructor(
    nameOrVertexSource: string,
    vertexSourceOrFragmentSource: string,
    fragmentSourceOrTags?: string | Record<string, number | string | boolean>,
    tags?: Record<string, number | string | boolean>
  ) {
    super();
    this._shaderPassId = ShaderPass._shaderPassCounter++;

    if (typeof fragmentSourceOrTags === "string") {
      this._name = nameOrVertexSource;
      this._vertexSource = vertexSourceOrFragmentSource;
      this._fragmentSource = fragmentSourceOrTags;
      tags = {
        pipelineStage: PipelineStage.Forward,
        ...tags
      };
    } else {
      this._name = "Default";
      this._vertexSource = nameOrVertexSource;
      this._fragmentSource = vertexSourceOrFragmentSource;
      tags = {
        pipelineStage: PipelineStage.Forward,
        ...fragmentSourceOrTags
      };
    }

    for (const key in tags) {
      this.setTag(key, tags[key]);
    }
  }

  /**
   * @internal
   */
  _getShaderProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram {
    const shaderProgramMap = engine._getShaderProgramMap(this._shaderPassId, this._shaderProgramMaps);
    let shaderProgram = shaderProgramMap.get(macroCollection);
    if (shaderProgram) {
      return shaderProgram;
    }

    shaderProgram = this._compileShaderProgram(engine, macroCollection);

    shaderProgramMap.cache(shaderProgram);
    return shaderProgram;
  }

  /**
   * @internal
   */
  _destroy(): void {
    const shaderProgramMaps = this._shaderProgramMaps;
    for (let i = 0, n = shaderProgramMaps.length; i < n; i++) {
      const map = shaderProgramMaps[i];
      map.destroy();
      delete map.engine._shaderProgramMaps[this._shaderPassId];
    }
    shaderProgramMaps.length = 0;
  }

  private _compileShaderProgram(engine: Engine, macroCollection: ShaderMacroCollection): ShaderProgram {
    const isGPUInstance = macroCollection.isEnable(InstanceBuffer.gpuInstanceMacro);
    const { vertexSource, fragmentSource, instanceLayout } =
      this._platformTarget != undefined
        ? this._compileShaderLabSource(engine, macroCollection, isGPUInstance)
        : this._compilePlatformSource(engine, macroCollection, isGPUInstance);

    const program = new ShaderProgram(engine, vertexSource, fragmentSource);
    program._instanceLayout = instanceLayout;
    return program;
  }

  private _compilePlatformSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    isGPUInstance: boolean
  ): { vertexSource: string; fragmentSource: string; instanceLayout: InstanceBufferLayout | null } {
    return ShaderFactory.compilePlatformSource(
      engine,
      macroCollection,
      this._vertexSource,
      this._fragmentSource,
      isGPUInstance
    );
  }

  private _compileShaderLabSource(
    engine: Engine,
    macroCollection: ShaderMacroCollection,
    isGPUInstance: boolean
  ): { vertexSource: string; fragmentSource: string; instanceLayout: InstanceBufferLayout | null } {
    const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
    const shaderMacroList = new Array<ShaderMacro>();
    ShaderMacro._getMacrosElements(macroCollection, shaderMacroList);
    shaderMacroList.push(ShaderMacro.getByName(isWebGL2 ? "GRAPHICS_API_WEBGL2" : "GRAPHICS_API_WEBGL1"));
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.shaderTextureLod)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_TEX_LOD"));
    }
    if (engine._hardwareRenderer.canIUse(GLCapabilityType.standardDerivatives)) {
      shaderMacroList.push(ShaderMacro.getByName("HAS_DERIVATIVES"));
    }

    let noIncludeVertex = ShaderFactory.parseIncludes(this._vertexSource);
    let noIncludeFrag = ShaderFactory.parseIncludes(this._fragmentSource);

    noIncludeVertex = Shader._shaderLab._parseMacros(noIncludeVertex, shaderMacroList);
    noIncludeFrag = Shader._shaderLab._parseMacros(noIncludeFrag, shaderMacroList);

    let instanceLayout: InstanceBufferLayout | null = null;
    if (isGPUInstance) {
      const injected = ShaderFactory.injectInstanceUBO(engine, noIncludeVertex, noIncludeFrag);
      noIncludeVertex = injected.vertexSource;
      noIncludeFrag = injected.fragmentSource;
      instanceLayout = injected.instanceLayout;
    }

    if (isWebGL2 && this._platformTarget === ShaderLanguage.GLSLES100) {
      noIncludeVertex = ShaderFactory.convertTo300(noIncludeVertex);
      noIncludeFrag = ShaderFactory.convertTo300(noIncludeFrag, true);
    }

    const versionStr = isWebGL2 ? "#version 300 es" : "#version 100";

    return {
      vertexSource: ` ${versionStr}
        ${noIncludeVertex}
      `,
      fragmentSource: ` ${versionStr}
        ${isWebGL2 ? "" : ShaderFactory.shaderExtension}
        ${precisionStr}
        ${noIncludeFrag}
      `,
      instanceLayout
    };
  }
}
