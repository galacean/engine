import type {
  IComputeKernelSource,
  IRenderStates,
  IShaderPassSource,
  IShaderSource,
  ISubShaderSource
} from "@galacean/engine-design";

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
      kind: "raster",
      subShaders: [],
      pendingContents: [] as IShaderPassSource["pendingContents"],
      renderStates: this.createRenderStates()
    };
  }

  static createComputeShaderSource(name: string): IShaderSource {
    return {
      name,
      kind: "compute",
      subShaders: [],
      computeKernels: [],
      tags: {},
      pendingContents: [] as IShaderPassSource["pendingContents"],
      renderStates: this.createRenderStates()
    };
  }

  static createComputeKernelSource(name: string): IComputeKernelSource {
    return {
      name,
      entry: "",
      workgroupSize: [1, 1, 1],
      tags: {},
      pendingContents: [],
      contents: "",
      contentScopeStarts: []
    };
  }

  static createSubShaderSource(name: string): ISubShaderSource {
    return {
      name,
      passes: [],
      pendingContents: [] as IShaderPassSource["pendingContents"],
      tags: {},
      renderStates: this.createRenderStates()
    };
  }

  static createShaderPassSource(name: string): IShaderPassSource {
    return {
      name,
      pendingContents: [] as IShaderPassSource["pendingContents"],
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
      pendingContents: [] as IShaderPassSource["pendingContents"],
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
