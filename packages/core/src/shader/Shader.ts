import { IShaderLab } from "@galacean/engine-design";
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
import { StencilOperation } from "./enums/StencilOperation";
import { RenderState } from "./state/RenderState";

/**
 * Shader for rendering.
 */
export class Shader implements IReferable {
  /** @internal */
  static readonly _compileMacros: ShaderMacroCollection = new ShaderMacroCollection();

  /** @internal */
  static _shaderLab?: IShaderLab;

  private static _shaderMap: Record<string, Shader> = Object.create(null);

  /**
   * Create a shader by source code.
   *
   * @remarks
   *
   * ShaderLab must be enabled first as follows:
   * ```ts
   * // Import shaderLab
   * import { ShaderLab } from "@galacean/engine-shader-lab";
   * // Create engine with shaderLab
   * const engine = await WebGLEngine.create({ canvas: "canvas", shader: new ShaderLab() });
   * ...
   * ```
   *
   * @param shaderSource - shader code
   * @returns Shader
   *
   * @throws
   * Throw string exception if shaderLab has not been enabled properly.
   */
  static create(shaderSource: string): Shader;

  /**
   * Create a shader.
   * @param name - Name of the shader
   * @param vertexSource - Vertex source code
   * @param fragmentSource - Fragment source code
   * @returns Shader
   */
  static create(name: string, vertexSource: string, fragmentSource: string): Shader;

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
    vertexSourceOrShaderPassesOrSubShaders?: SubShader[] | ShaderPass[] | string,
    fragmentSource?: string
  ): Shader {
    let shader: Shader;
    const shaderMap = Shader._shaderMap;

    if (!vertexSourceOrShaderPassesOrSubShaders) {
      if (!Shader._shaderLab) {
        throw "ShaderLab has not been set up yet.";
      }

      const shaderStructInfo = Shader._shaderLab.parseShaderStruct(nameOrShaderSource);
      if (shaderMap[shaderStructInfo.name]) {
        console.error(`Shader named "${shaderStructInfo.name}" already exists.`);
        return;
      }
      const subShaderList = shaderStructInfo.subShaders.map((subShaderInfo) => {
        const passList = subShaderInfo.passes.map((passInfo) => {
          if (passInfo.isUsePass) {
            // Use pass reference
            const paths = passInfo.name.split("/");
            return Shader.find(paths[0])
              ?.subShaders.find((subShader) => subShader.name === paths[1])
              ?.passes.find((pass) => pass.name === paths[2]);
          }

          const shaderPass = new ShaderPass(
            passInfo.contents,
            { vertexEntry: passInfo.vertexEntry, fragmentEntry: passInfo.fragmentEntry },
            passInfo.tags
          );
          shaderPass.setName(passInfo.name);

          const renderStates = passInfo.renderStates;
          const renderState = new RenderState();

          shaderPass._renderState = renderState;
          // Parse const render state
          const constRenderStateInfo = renderStates[0];
          for (let k in constRenderStateInfo) {
            Shader._applyConstRenderStates(renderState, <RenderStateElementKey>parseInt(k), constRenderStateInfo[k]);
          }

          // Parse variable render state
          const variableRenderStateInfo = renderStates[1];
          const renderStateDataMap = {} as Record<number, ShaderProperty>;
          for (let k in variableRenderStateInfo) {
            renderStateDataMap[k] = ShaderProperty.getByName(variableRenderStateInfo[k]);
          }
          shaderPass._renderStateDataMap = renderStateDataMap;

          return shaderPass;
        });

        return new SubShader(subShaderInfo.name, passList, subShaderInfo.tags);
      });

      shader = new Shader(shaderStructInfo.name, subShaderList);
      shaderMap[shaderStructInfo.name] = shader;
      return shader;
    } else {
      if (shaderMap[nameOrShaderSource]) {
        console.error(`Shader named "${nameOrShaderSource}" already exists.`);
        return;
      }
      if (typeof vertexSourceOrShaderPassesOrSubShaders === "string") {
        const shaderPass = new ShaderPass(vertexSourceOrShaderPassesOrSubShaders, fragmentSource);
        shader = new Shader(nameOrShaderSource, [new SubShader("Default", [shaderPass])]);
      } else {
        if (vertexSourceOrShaderPassesOrSubShaders.length > 0) {
          if (vertexSourceOrShaderPassesOrSubShaders[0].constructor === ShaderPass) {
            shader = new Shader(nameOrShaderSource, [
              new SubShader("Default", <ShaderPass[]>vertexSourceOrShaderPassesOrSubShaders)
            ]);
          } else {
            shader = new Shader(nameOrShaderSource, <SubShader[]>vertexSourceOrShaderPassesOrSubShaders.slice());
          }
        } else {
          throw "SubShader or ShaderPass count must large than 0.";
        }
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
