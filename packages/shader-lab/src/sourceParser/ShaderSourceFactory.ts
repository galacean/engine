import { IRenderStates, IShaderPassSource, IShaderSource, ISubShaderSource } from "@galacean/engine-design";

export class ShaderSourceFactory {
  static createRenderStates(): IRenderStates {
    return {
      constantMap: {},
      variableMap: {}
    };
  }

  static createShaderSource(name: string): IShaderSource {
    return {
      name,
      subShaders: [],
      pendingContents: [],
      renderStates: this.createRenderStates()
    };
  }

  static createSubShaderSource(name: string): ISubShaderSource {
    return {
      name,
      passes: [],
      pendingContents: [],
      tags: {},
      renderStates: this.createRenderStates()
    };
  }

  static createShaderPassSource(name: string): IShaderPassSource {
    return {
      name,
      pendingContents: [],
      tags: {},
      renderStates: this.createRenderStates()
    } as IShaderPassSource;
  }

  static createUsePass(name: string): IShaderPassSource {
    return {
      name,
      pendingContents: [],
      isUsePass: true,
      tags: {},
      renderStates: this.createRenderStates()
    } as IShaderPassSource;
  }
}
