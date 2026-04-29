import { IShaderCompiler, IPrecompiledShader } from "@galacean/engine-design";
import { Color } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { IReferable } from "../asset/IReferable";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPass } from "./ShaderPass";
import { ShaderProperty } from "./ShaderProperty";
import { SubShader } from "./SubShader";
import { BlendFactor } from "./enums/BlendFactor";
import { BlendOperation } from "./enums/BlendOperation";
import { ColorWriteMask } from "./enums/ColorWriteMask";
import { CompareFunction } from "./enums/CompareFunction";
import { CullMode } from "./enums/CullMode";
import { RenderQueueType } from "./enums/RenderQueueType";
import { RenderStateElementKey } from "./enums/RenderStateElementKey";
import { ShaderLanguage } from "./enums/ShaderLanguage";
import { StencilOperation } from "./enums/StencilOperation";
import { RenderState } from "./state/RenderState";

/**
 * Shader for rendering.
 */
export class Shader implements IReferable {
  /** @internal */
  static readonly _compileMacros: ShaderMacroCollection = new ShaderMacroCollection();

  /** @internal */
  static _shaderCompiler?: IShaderCompiler;

  private static _shaderMap: Record<string, Shader> = Object.create(null);

  /**
   * Create a shader by source code.
   *
   * @remarks
   *
   * The shader compiler must be enabled first as follows:
   * ```ts
   * // Import the shader compiler
   * import { ShaderCompiler } from "@galacean/engine-shader-compiler";
   * // Create engine with the shader compiler
   * const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
   * ...
   * ```
   *
   * @param shaderSource - Shader code
   * @param platformTarget - Shader platform target, @defaultValue ShaderLanguage.GLSLES300
   * @returns Shader
   *
   * @throws
   * Throw string exception if the shader compiler has not been enabled properly.
   */
  static create(shaderSource: string, platformTarget?: ShaderLanguage): Shader;

  /**
   * Create a shader.
   * @param name - Name of the shader
   * @param shaderPasses - Shader passes
   * @returns Shader
   */
  static create(name: string, shaderPasses: ShaderPass[]): Shader;

  /**
   * Create a shader.
   * @param name - Name of the shader
   * @param subShaders - Sub shaders
   * @returns Shader
   */
  static create(name: string, subShaders: SubShader[]): Shader;

  static create(
    nameOrShaderSource: string,
    shaderPassesOrSubShadersOrPlatformTarget?: ShaderLanguage | SubShader[] | ShaderPass[]
  ): Shader {
    let shader: Shader;
    const shaderMap = Shader._shaderMap;

    if (shaderPassesOrSubShadersOrPlatformTarget == undefined) {
      shaderPassesOrSubShadersOrPlatformTarget = ShaderLanguage.GLSLES100;
    }

    if (typeof shaderPassesOrSubShadersOrPlatformTarget === "number") {
      const shaderCompiler = Shader._shaderCompiler;
      if (!shaderCompiler) {
        throw "ShaderCompiler has not been set up yet.";
      }

      const shaderSource = shaderCompiler._parseShaderSource(nameOrShaderSource);
      if (shaderMap[shaderSource.name]) {
        console.error(`Shader named "${shaderSource.name}" already exists.`);
        return;
      }

      const subShaderList = shaderSource.subShaders.map((subShaderSource) => {
        const passList = subShaderSource.passes.map((passSource) => {
          if (passSource.isUsePass) {
            return Shader._resolveUsePass(passSource.name);
          }

          const shaderPassSource = Shader._shaderCompiler._parseShaderPass(
            passSource.contents,
            passSource.vertexEntry,
            passSource.fragmentEntry,
            shaderPassesOrSubShadersOrPlatformTarget
          );

          if (!shaderPassSource) {
            throw `Shader pass "${shaderSource.name}.${subShaderSource.name}.${passSource.name}" parse failed, please check the shader source code.`;
          }

          const shaderPass = new ShaderPass(
            passSource.name,
            shaderPassSource.vertexShaderInstructions,
            shaderPassSource.fragmentShaderInstructions,
            shaderPassesOrSubShadersOrPlatformTarget as ShaderLanguage,
            passSource.tags
          );

          Shader._applyRenderStates(
            shaderPass,
            passSource.renderStates.constantMap,
            passSource.renderStates.variableMap,
            false
          );

          return shaderPass;
        });

        return new SubShader(subShaderSource.name, passList, subShaderSource.tags);
      });

      shader = new Shader(shaderSource.name, subShaderList);
      shaderMap[shaderSource.name] = shader;
      return shader;
    } else {
      if (shaderMap[nameOrShaderSource]) {
        console.error(`Shader named "${nameOrShaderSource}" already exists.`);
        return;
      }
      if (shaderPassesOrSubShadersOrPlatformTarget.length > 0) {
        if (shaderPassesOrSubShadersOrPlatformTarget[0].constructor === ShaderPass) {
          shader = new Shader(nameOrShaderSource, [
            new SubShader("Default", <ShaderPass[]>shaderPassesOrSubShadersOrPlatformTarget)
          ]);
        } else {
          shader = new Shader(nameOrShaderSource, <SubShader[]>shaderPassesOrSubShadersOrPlatformTarget.slice());
        }
      } else {
        throw "SubShader or ShaderPass count must large than 0.";
      }
    }

    shaderMap[nameOrShaderSource] = shader;
    return shader;
  }

  /**
   * Find a shader by name.
   * @param name - Name of the shader
   */
  static find(name: string): Shader {
    return Shader._shaderMap[name];
  }

  /**
   * @internal
   */
  static _createFromPrecompiled(data: IPrecompiledShader): Shader {
    const shaderMap = Shader._shaderMap;
    if (shaderMap[data.name]) {
      console.error(`Shader named "${data.name}" already exists.`);
      return;
    }

    const subShaderList = data.subShaders.map((subData) => {
      const passList = subData.passes.map((passData) => {
        if (passData.isUsePass) {
          return Shader._resolveUsePass(passData.name);
        }

        const shaderPass = new ShaderPass(
          passData.name,
          passData.vertexShaderInstructions,
          passData.fragmentShaderInstructions,
          data.platformTarget as ShaderLanguage,
          passData.tags
        );

        Shader._applyRenderStates(
          shaderPass,
          passData.renderStates.constantMap,
          passData.renderStates.variableMap,
          true
        );

        return shaderPass;
      });

      return new SubShader(subData.name, passList, subData.tags);
    });

    const shader = new Shader(data.name, subShaderList);
    shaderMap[data.name] = shader;
    return shader;
  }

  /**
   * @internal
   */
  static _clear(engine: Engine): void {
    const shaderMap = Shader._shaderMap;
    for (const key in shaderMap) {
      const shader = shaderMap[key];
      const subShaders = shader._subShaders;
      for (let i = 0, n = subShaders.length; i < n; i++) {
        const passes = subShaders[i].passes;
        for (let j = 0, m = passes.length; j < m; j++) {
          const pass = passes[j];
          const passShaderProgramPools = pass._shaderProgramPools;
          for (let k = passShaderProgramPools.length - 1; k >= 0; k--) {
            const shaderProgramPool = passShaderProgramPools[k];
            if (shaderProgramPool.engine !== engine) continue;
            shaderProgramPool._destroy();
            passShaderProgramPools.splice(k, 1);
          }
        }
      }
    }
  }

  private static _resolveUsePass(passName: string): ShaderPass | undefined {
    // Parse from the end: last segment is pass name, second-to-last is subshader name,
    // everything before is the shader name (which may contain "/" like "Utility/ShadowMap").
    const parts = passName.split("/");
    if (parts.length < 3) {
      throw new Error(`UsePass "${passName}" must be formatted as "shaderName/subShaderName/passName".`);
    }
    const passNamePart = parts.pop();
    const subShaderName = parts.pop();
    const shaderName = parts.join("/");
    const shader = Shader.find(shaderName);
    if (!shader) {
      throw new Error(
        `UsePass "${passName}" failed: shader "${shaderName}" not found. Ensure referenced shaders are registered first.`
      );
    }
    return shader.subShaders
      .find((subShader) => subShader.name === subShaderName)
      ?.passes.find((pass) => pass.name === passNamePart);
  }

  private static _applyRenderStates(
    shaderPass: ShaderPass,
    constantMap: Record<string, any>,
    variableMap: Record<string, string>,
    deserializeColor: boolean
  ): void {
    if (Object.keys(constantMap).length > 0 || Object.keys(variableMap).length > 0) {
      const renderState = new RenderState();
      let constantPropertyMask = 0;

      for (const k in constantMap) {
        const key = +k;
        const value = constantMap[k];
        if (deserializeColor && Array.isArray(value)) {
          Shader._applyConstRenderStates(renderState, key, new Color(value[0], value[1], value[2], value[3]));
        } else {
          Shader._applyConstRenderStates(renderState, key, value);
        }
        constantPropertyMask |= 1 << key;
      }
      shaderPass._renderState = renderState;

      const renderStateDataMap = <Record<number, ShaderProperty>>{};
      for (const k in variableMap) {
        const key = +k;
        renderStateDataMap[key] = ShaderProperty.getByName(variableMap[k]);
      }
      shaderPass._renderStateDataMap = renderStateDataMap;
      shaderPass._constantPropertyMask = constantPropertyMask;
    }
  }

  private static _applyConstRenderStates(
    renderState: RenderState,
    key: RenderStateElementKey,
    value: boolean | string | number | Color
  ): void {
    switch (key) {
      case RenderStateElementKey.BlendStateEnabled0:
        renderState.blendState.targetBlendState.enabled = <boolean>value;
        break;
      case RenderStateElementKey.BlendStateColorBlendOperation0:
        renderState.blendState.targetBlendState.colorBlendOperation = <BlendOperation>value;
        break;
      case RenderStateElementKey.BlendStateAlphaBlendOperation0:
        renderState.blendState.targetBlendState.alphaBlendOperation = <BlendOperation>value;
        break;
      case RenderStateElementKey.BlendStateSourceColorBlendFactor0:
        renderState.blendState.targetBlendState.sourceColorBlendFactor = <BlendFactor>value;
        break;
      case RenderStateElementKey.BlendStateDestinationColorBlendFactor0:
        renderState.blendState.targetBlendState.destinationColorBlendFactor = <BlendFactor>value;
        break;
      case RenderStateElementKey.BlendStateSourceAlphaBlendFactor0:
        renderState.blendState.targetBlendState.sourceAlphaBlendFactor = <BlendFactor>value;
        break;
      case RenderStateElementKey.BlendStateDestinationAlphaBlendFactor0:
        renderState.blendState.targetBlendState.destinationAlphaBlendFactor = <BlendFactor>value;
        break;
      case RenderStateElementKey.BlendStateColorWriteMask0:
        renderState.blendState.targetBlendState.colorWriteMask = <ColorWriteMask>value;
        break;
      case RenderStateElementKey.DepthStateEnabled:
        renderState.depthState.enabled = <boolean>value;
        break;
      case RenderStateElementKey.DepthStateWriteEnabled:
        renderState.depthState.writeEnabled = <boolean>value;
        break;
      case RenderStateElementKey.DepthStateCompareFunction:
        renderState.depthState.compareFunction = <CompareFunction>value;
        break;
      case RenderStateElementKey.StencilStateEnabled:
        renderState.stencilState.enabled = <boolean>value;
        break;
      case RenderStateElementKey.StencilStateReferenceValue:
        renderState.stencilState.referenceValue = <number>value;
        break;
      case RenderStateElementKey.StencilStateMask:
        renderState.stencilState.mask = <number>value;
        break;
      case RenderStateElementKey.StencilStateWriteMask:
        renderState.stencilState.writeMask = <number>value;
        break;
      case RenderStateElementKey.StencilStateCompareFunctionFront:
        renderState.stencilState.compareFunctionFront = <CompareFunction>value;
        break;
      case RenderStateElementKey.StencilStateCompareFunctionBack:
        renderState.stencilState.compareFunctionBack = <CompareFunction>value;
        break;
      case RenderStateElementKey.StencilStatePassOperationFront:
        renderState.stencilState.passOperationFront = <StencilOperation>value;
        break;
      case RenderStateElementKey.StencilStatePassOperationBack:
        renderState.stencilState.passOperationBack = <StencilOperation>value;
        break;
      case RenderStateElementKey.StencilStateFailOperationFront:
        renderState.stencilState.failOperationFront = <StencilOperation>value;
        break;
      case RenderStateElementKey.StencilStateFailOperationBack:
        renderState.stencilState.failOperationBack = <StencilOperation>value;
        break;
      case RenderStateElementKey.StencilStateZFailOperationFront:
        renderState.stencilState.zFailOperationFront = <StencilOperation>value;
        break;
      case RenderStateElementKey.StencilStateZFailOperationBack:
        renderState.stencilState.zFailOperationBack = <StencilOperation>value;
        break;
      case RenderStateElementKey.RasterStateCullMode:
        renderState.rasterState.cullMode = <CullMode>value;
        break;
      case RenderStateElementKey.RasterStateDepthBias:
        renderState.rasterState.depthBias = <number>value;
        break;
      case RenderStateElementKey.RasterStateSlopeScaledDepthBias:
        renderState.rasterState.slopeScaledDepthBias = <number>value;
        break;
      case RenderStateElementKey.RenderQueueType:
        renderState.renderQueueType = <RenderQueueType>value;
        break;
    }
  }

  private _refCount: number = 0;
  private _destroyed: boolean = false;
  private _subShaders: SubShader[];

  /**
   * Sub shaders of the shader.
   */
  get subShaders(): ReadonlyArray<SubShader> {
    return this._subShaders;
  }

  /**
   * Whether it has been destroyed.
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  private constructor(
    public readonly name: string,
    subShaders: SubShader[]
  ) {
    this.name = name;
    this._subShaders = subShaders;
  }

  /**
   * Compile shader variant by macro name list.
   *
   * @remarks
   * Usually a shader contains some macros,any combination of macros is called shader variant.
   *
   * @param engine - Engine to which the shader variant belongs
   * @param macros - Macro name list
   * @returns Is the compiled shader variant valid
   */
  compileVariant(engine: Engine, macros: string[]): boolean {
    const compileMacros = Shader._compileMacros;
    compileMacros.clear();
    for (let i = 0, n = macros.length; i < n; i++) {
      compileMacros.enable(ShaderMacro.getByName(macros[i]));
    }

    let isValid = false;
    const subShaders = this._subShaders;
    for (let i = 0, n = subShaders.length; i < n; i++) {
      const { passes } = subShaders[i];
      for (let j = 0, m = passes.length; j < m; j++) {
        const shaderProgram = passes[j]._getShaderProgram(engine, compileMacros);
        isValid = j === 0 ? shaderProgram.isValid : isValid && shaderProgram.isValid;
      }
    }
    return isValid;
  }

  /**
   * Destroy the shader.
   * @param force - Whether to force the destruction, if it is false, refCount = 0 can be released successfully.
   * @returns Whether the release was successful.
   */
  destroy(force: boolean = false): boolean {
    if (!force && this._refCount !== 0) {
      return false;
    }

    const subShaders = this._subShaders;
    for (let i = 0, n = subShaders.length; i < n; i++) {
      const passes = subShaders[i].passes;
      for (let j = 0, m = passes.length; j < m; j++) {
        passes[j]._destroy();
      }
    }

    delete Shader._shaderMap[this.name];
    this._destroyed = true;
    return true;
  }

  /**
   * @internal
   */
  _getReferCount(): number {
    return this._refCount;
  }

  /**
   * @internal
   */
  _addReferCount(value: number): void {
    this._refCount += value;
  }

  /**
   * @deprecated Please use `ShaderMacro.getByName` instead
   *
   * Get shader macro by name.
   * @param name - Name of the shader macro
   * @returns Shader macro
   */
  static getMacroByName(name: string): ShaderMacro;

  /**
   * @deprecated Please use `ShaderMacro.getByName` instead
   *
   * Get shader macro by name.
   * @param name - Name of the shader macro
   * @param value - Value of the shader macro
   * @returns Shader macro
   */
  static getMacroByName(name: string, value: string): ShaderMacro;

  static getMacroByName(name: string, value?: string): ShaderMacro {
    return ShaderMacro.getByName(name, value);
  }

  /**
   * @deprecated Please use `ShaderProperty.getByName` instead
   *
   * Get shader property by name.
   * @param name - Name of the shader property
   * @returns Shader property
   */
  static getPropertyByName(name: string): ShaderProperty {
    return ShaderProperty.getByName(name);
  }
}
