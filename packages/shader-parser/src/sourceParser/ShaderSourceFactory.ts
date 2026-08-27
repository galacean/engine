import type { IRenderStates, IShaderPassSource, IShaderSource, ISubShaderSource } from "@galacean/engine-design";

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
      contentScopeStarts: [],
      isUsePass: false,
      tags: {},
      renderStates: this.createRenderStates(),
      contents: "",
      vertexEntry: "",
      fragmentEntry: ""
    };
  }

  static createUsePass(name: string): IShaderPassSource {
    return {
      name,
      pendingContents: [],
      contentScopeStarts: [],
      isUsePass: true,
      tags: {},
      renderStates: this.createRenderStates(),
      contents: "",
      vertexEntry: "",
      fragmentEntry: ""
    };
  }
}
