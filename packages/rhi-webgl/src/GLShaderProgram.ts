import {
  Engine,
  Logger,
  ShaderBlockProperty,
  ShaderFactory,
  ShaderProperty,
  Texture,
  type IPlatformShaderProgram,
  type IPlatformShaderSource
} from "@galacean/engine-core";
import type { IShaderUniformVariable } from "@galacean/engine-design";
import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { GLShaderUniform } from "./GLShaderUniform";
import type { WebGLGraphicDevice } from "./WebGLGraphicDevice";

export class GLShaderProgram implements IPlatformShaderProgram {
  private static _counter: number = 0;
  private static _legacyUniformTypes?: Record<number, string>;

  private static _addLineNum(str: string) {
    const lines = str.split("\n");
    const limitLength = (lines.length + 1).toString().length + 6;
    let prefix;
    return lines
      .map((line, index) => {
        prefix = `0:${index + 1}`;
        if (prefix.length >= limitLength) return prefix.substring(0, limitLength) + line;

        for (let i = 0; i < limitLength - prefix.length; i++) prefix += " ";

        return prefix + line;
      })
      .join("\n");
  }

  readonly id = GLShaderProgram._counter++;
  readonly attributeLocation: Record<string, number> = Object.create(null);
  readonly uniforms: GLShaderUniform[] = [];
  readonly uniformBlockIds: number[] = [];
  isValid: boolean = false;
  errorLog: string | null = null;
  private readonly _gl: WebGL2RenderingContext;
  private _glProgram: WebGLProgram | null;
  private _vertexShader: WebGLShader | null = null;
  private _fragmentShader: WebGLShader | null = null;
  private _vertexSource: string | null = null;
  private _fragmentSource: string | null = null;
  private _looseUniforms?: readonly IShaderUniformVariable[];
  private _pendingCompilation = false;
  private _parallelCompile: { readonly COMPLETION_STATUS_KHR: number } | null = null;
  private _activeTextureUint = 0;

  constructor(
    private _device: WebGLGraphicDevice,
    private _engine: Engine,
    source: IPlatformShaderSource
  ) {
    this._gl = _device.gl;
    if (source.deferCompletion) {
      this._parallelCompile = this._gl.getExtension("KHR_parallel_shader_compile");
    }
    this._pendingCompilation = !!this._parallelCompile;
    this._vertexSource = source.vertexSource;
    this._fragmentSource = source.fragmentSource;
    this._looseUniforms = source.looseUniforms;
    this._glProgram = this._createProgram(source.vertexSource, source.fragmentSource, source.feedbackVaryings);
    if (this._glProgram && !this._pendingCompilation) {
      this._finalizeProgram();
    } else if (!this._glProgram) {
      this._pendingCompilation = false;
      this._releasePendingShaders();
    }
  }

  pollReady(): boolean {
    if (!this._pendingCompilation) return true;
    if (!this._glProgram || this._gl.isContextLost()) {
      this.errorLog = "context lost";
      this.destroy();
      return true;
    }
    if (!this._gl.getProgramParameter(this._glProgram, this._parallelCompile!.COMPLETION_STATUS_KHR)) {
      return false;
    }
    this.ensureReady();
    return true;
  }

  ensureReady(): void {
    if (!this._pendingCompilation) return;
    this._pendingCompilation = false;
    if (!this._glProgram || this._gl.isContextLost()) {
      this.errorLog = "context lost";
      this.destroy();
      return;
    }
    this._finalizeProgram();
  }

  bind(): boolean {
    if (this._pendingCompilation) this.ensureReady();
    if (this._device._currentBindShaderProgram === this) return false;
    this._gl.useProgram(this._glProgram);
    this._device._currentBindShaderProgram = this;
    return true;
  }

  bindUniformBlock(name: string, binding: number): boolean {
    if (this._pendingCompilation) this.ensureReady();
    return this._device.tryBindUniformBlock(this._glProgram!, name, binding);
  }

  destroy(): void {
    this._pendingCompilation = false;
    this.isValid = false;
    this._releasePendingShaders();
    if (this._glProgram) {
      if (this._device._currentBindShaderProgram === this) {
        this._device._currentBindShaderProgram = null;
      }
      this._gl.deleteProgram(this._glProgram);
      this._glProgram = null;
    }
  }

  private _releasePendingShaders(): void {
    const gl = this._gl;
    if (this._vertexShader) {
      gl.deleteShader(this._vertexShader);
      this._vertexShader = null;
    }
    if (this._fragmentShader) {
      gl.deleteShader(this._fragmentShader);
      this._fragmentShader = null;
    }
    this._vertexSource = null;
    this._fragmentSource = null;
    this._looseUniforms = undefined;
  }

  private _finalizeProgram(): void {
    const gl = this._gl;
    const program = this._glProgram;
    if (!program) return;
    const linked = !gl.isContextLost() && gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
      if (!gl.isContextLost()) {
        const parts: string[] = [];
        if (this._vertexShader && !gl.getShaderParameter(this._vertexShader, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(this._vertexShader) ?? "";
          parts.push(`vertex: ${log}`);
          if (Logger.isEnabled && this._vertexSource !== null) {
            Logger.error(`Could not compile vertex shader\n${log}\n${GLShaderProgram._addLineNum(this._vertexSource)}`);
          }
        }
        if (this._fragmentShader && !gl.getShaderParameter(this._fragmentShader, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(this._fragmentShader) ?? "";
          parts.push(`fragment: ${log}`);
          if (Logger.isEnabled && this._fragmentSource !== null) {
            Logger.error(
              `Could not compile fragment shader\n${log}\n${GLShaderProgram._addLineNum(this._fragmentSource)}`
            );
          }
        }
        const progLog = gl.getProgramInfoLog(program) ?? "";
        if (progLog) parts.push(progLog);
        this.errorLog = parts.join("\n") || "Could not link WebGL program";
        if (Logger.isEnabled) {
          Logger.error(`Could not link WebGL program\n${progLog}`);
        }
      } else {
        this.errorLog = "context lost";
      }
      this.destroy();
      return;
    }
    const looseUniforms = this._looseUniforms;
    this._releasePendingShaders();
    let initialized = false;
    try {
      this._recordLocation(looseUniforms);
      this.isValid = true;
      initialized = true;
    } finally {
      if (!initialized) this.destroy();
    }
  }

  private _createProgram(
    vertexSource: string,
    fragmentSource: string,
    transformFeedbackVaryings?: string[]
  ): WebGLProgram | null {
    const gl = this._gl;

    // Create and compile shader
    const vertexShader = this._createShader(gl.VERTEX_SHADER, vertexSource);
    if (!vertexShader) {
      return null;
    }

    const fragmentShader = this._createShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      return null;
    }

    // Create program and link shader
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    // Set Transform Feedback varyings before linking
    if (transformFeedbackVaryings?.length) {
      gl.transformFeedbackVaryings(program, transformFeedbackVaryings, gl.INTERLEAVED_ATTRIBS);
    }

    gl.linkProgram(program);
    this._vertexShader = vertexShader;
    this._fragmentShader = fragmentShader;
    return program;
  }

  private _createShader(shaderType: number, shaderSource: string): WebGLShader | null {
    const gl = this._gl;
    const shader = gl.createShader(shaderType);

    if (!shader) {
      return null;
    }

    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);

    return shader;
  }

  /**
   * record the location of uniform/attribute.
   */
  private _recordLocation(looseUniforms?: readonly IShaderUniformVariable[]): void {
    const gl = this._gl;
    const program = this._glProgram!;
    const uniformInfos = looseUniforms ?? this._getUniformInfos();
    const attributeInfos = this._getAttributeInfos();
    const basicResources = this._engine._basicResources;

    uniformInfos.forEach(({ name, arrayLength, type }) => {
      // Numeric loose arrays can defer a GLSL-only constant bound to the driver.
      const isArray = arrayLength !== 0;
      const size = arrayLength;
      let isTexture = false;

      const location = gl.getUniformLocation(program, name);
      // UBO members have no individual location, skip them
      if (location === null) return;

      const shaderUniform = new GLShaderUniform(this._device);
      shaderUniform.name = name;
      const property = ShaderProperty.getByName(name);
      shaderUniform.propertyId = property._uniqueId;
      shaderUniform.location = location;

      switch (type) {
        case "float":
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload1fv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload1f;
            shaderUniform.cacheValue = 0;
          }
          break;
        case "vec2":
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload2fv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload2f;
            shaderUniform.cacheValue = new Vector2(0, 0);
          }
          break;
        case "vec3":
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload3fv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload3f;
            shaderUniform.cacheValue = new Vector3(0, 0, 0);
          }
          break;
        case "vec4":
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload4fv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload4f;
            shaderUniform.cacheValue = new Vector4(0, 0, 0, 0);
          }
          break;
        case "bool":
        case "int":
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload1iv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload1i;
            shaderUniform.cacheValue = 0;
          }
          break;
        case "bvec2":
        case "ivec2":
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload2iv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload2i;
            shaderUniform.cacheValue = new Vector2(0, 0);
          }
          break;
        case "bvec3":
        case "ivec3":
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload3iv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload3i;
            shaderUniform.cacheValue = new Vector3(0, 0, 0);
          }
          break;
        case "bvec4":
        case "ivec4":
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload4iv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload4i;
            shaderUniform.cacheValue = new Vector4(0, 0, 0);
          }
          break;
        case "mat2":
          shaderUniform.applyFunc = shaderUniform.uploadMat2;
          break;
        case "mat3":
          shaderUniform.applyFunc = shaderUniform.uploadMat3;
          break;
        case "mat4":
          shaderUniform.applyFunc = isArray ? shaderUniform.uploadMat4v : shaderUniform.uploadMat4;
          break;
        case "mat2x3":
          shaderUniform.applyFunc = shaderUniform.uploadMat2x3;
          break;
        case "mat2x4":
          shaderUniform.applyFunc = shaderUniform.uploadMat2x4;
          break;
        case "mat3x2":
          shaderUniform.applyFunc = shaderUniform.uploadMat3x2;
          break;
        case "mat3x4":
          shaderUniform.applyFunc = shaderUniform.uploadMat3x4;
          break;
        case "mat4x2":
          shaderUniform.applyFunc = shaderUniform.uploadMat4x2;
          break;
        case "mat4x3":
          shaderUniform.applyFunc = shaderUniform.uploadMat4x3;
          break;
        case "sampler2D":
        case "samplerCube":
        case "usampler2D":
        case "sampler2DArray":
        case "sampler2DShadow":
          let defaultTexture: Texture;
          switch (type) {
            case "sampler2D":
              defaultTexture = basicResources.whiteTexture2D;
              break;
            case "samplerCube":
              defaultTexture = basicResources.whiteTextureCube;
              break;
            case "usampler2D":
              defaultTexture = basicResources.uintWhiteTexture2D;
              break;
            case "sampler2DArray":
              defaultTexture = basicResources.whiteTexture2DArray;
              break;
            case "sampler2DShadow":
              defaultTexture = this._engine._depthTexture2D;
              shaderUniform.textureUseCompareMode = true;
              break;
          }

          isTexture = true;
          if (isArray) {
            const defaultTextures = new Array<Texture>(size);
            const textureIndices = new Int32Array(size);
            const glTextureIndices = new Array<number>(size);

            for (let i = 0; i < size; i++) {
              defaultTextures[i] = defaultTexture;
              textureIndices[i] = this._activeTextureUint;
              glTextureIndices[i] = gl.TEXTURE0 + this._activeTextureUint++;
            }
            shaderUniform.textureDefault = defaultTextures;
            shaderUniform.textureIndex = glTextureIndices;
            shaderUniform.applyFunc = shaderUniform.uploadTextureArray;
            this.bind();
            gl.uniform1iv(location, textureIndices);
          } else {
            const glTextureIndex = gl.TEXTURE0 + this._activeTextureUint;
            shaderUniform.textureDefault = defaultTexture;
            shaderUniform.textureIndex = glTextureIndex;
            shaderUniform.applyFunc = shaderUniform.uploadTexture;
            this.bind();
            gl.uniform1i(location, this._activeTextureUint++);
          }
          break;
        default:
          throw new Error("Unsupported uniform type");
      }

      shaderUniform.isTexture = isTexture;
      this.uniforms.push(shaderUniform);
    });

    attributeInfos.forEach(({ name }) => {
      this.attributeLocation[name] = gl.getAttribLocation(program, name);
    });

    // Compiled variants already assigned every block from their layout, including instancing.
    if (looseUniforms) return;
    // Record historical uniform block indices and bind legacy binding points.
    const bindingMap = ShaderFactory.uniformBlockBindingMap;
    const blockCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS) ?? 0;
    for (let i = 0; i < blockCount; i++) {
      const id = ShaderBlockProperty.getByName(gl.getActiveUniformBlockName(program, i)!)._uniqueId;
      this.uniformBlockIds[i] = id;
      const bindingPoint = bindingMap[id];
      if (bindingPoint !== undefined) {
        gl.uniformBlockBinding(program, i, bindingPoint);
      }
    }
  }

  private _getUniformInfos(): IShaderUniformVariable[] {
    const gl = this._gl;
    const program = this._glProgram!;
    // Only historical assets require driver enumeration. Their types are converted
    // once to the same representation as compiler-reflected sampler and loose fields.
    const types = (GLShaderProgram._legacyUniformTypes ??= {
      [gl.FLOAT]: "float",
      [gl.FLOAT_VEC2]: "vec2",
      [gl.FLOAT_VEC3]: "vec3",
      [gl.FLOAT_VEC4]: "vec4",
      [gl.BOOL]: "bool",
      [gl.INT]: "int",
      [gl.BOOL_VEC2]: "bvec2",
      [gl.INT_VEC2]: "ivec2",
      [gl.BOOL_VEC3]: "bvec3",
      [gl.INT_VEC3]: "ivec3",
      [gl.BOOL_VEC4]: "bvec4",
      [gl.INT_VEC4]: "ivec4",
      [gl.FLOAT_MAT2]: "mat2",
      [gl.FLOAT_MAT3]: "mat3",
      [gl.FLOAT_MAT4]: "mat4",
      [gl.FLOAT_MAT2x3]: "mat2x3",
      [gl.FLOAT_MAT2x4]: "mat2x4",
      [gl.FLOAT_MAT3x2]: "mat3x2",
      [gl.FLOAT_MAT3x4]: "mat3x4",
      [gl.FLOAT_MAT4x2]: "mat4x2",
      [gl.FLOAT_MAT4x3]: "mat4x3",
      [gl.SAMPLER_2D]: "sampler2D",
      [gl.SAMPLER_CUBE]: "samplerCube",
      [gl.UNSIGNED_INT_SAMPLER_2D]: "usampler2D",
      [gl.SAMPLER_2D_ARRAY]: "sampler2DArray",
      [gl.SAMPLER_2D_SHADOW]: "sampler2DShadow"
    });
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) ?? 0;
    const infos: IShaderUniformVariable[] = [];
    for (let i = 0; i < count; ++i) {
      const { name, size, type } = gl.getActiveUniform(program, i)!;
      const isArray = name.endsWith("[0]");
      infos.push({ name: isArray ? name.slice(0, -3) : name, type: types[type], arrayLength: isArray ? size : 0 });
    }
    return infos;
  }

  private _getAttributeInfos(): WebGLActiveInfo[] {
    const gl = this._gl;
    const program = this._glProgram!;
    const attributeInfos = new Array<WebGLActiveInfo>();

    // attributeCount is `null` when context lost.
    const attributeCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) ?? 0;
    for (let i = 0; i < attributeCount; ++i) {
      const info = gl.getActiveAttrib(program, i)!;
      attributeInfos[i] = info;
    }

    return attributeInfos;
  }
}
