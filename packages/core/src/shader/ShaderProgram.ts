import type { IHardwareRenderer, IPlatformShaderProgram } from "../renderingHardwareInterface";
import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Logger } from "../base/Logger";
import { Texture } from "../texture";
import { ShaderData, ShaderPropertyValueType } from "./ShaderData";
import { ShaderProperty } from "./ShaderProperty";
import { ShaderUniform } from "./ShaderUniform";
import { ShaderUniformBlock } from "./ShaderUniformBlock";
import { ShaderBlockProperty } from "./ShaderBlockProperty";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { InstanceBufferLayout, ShaderFactory } from "./ShaderFactory";

/**
 * Shader program, corresponding to the GPU shader program.
 * @internal
 */
export class ShaderProgram implements IPlatformShaderProgram {
  private static _counter: number = 0;

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

  private static _findValue(
    id: number,
    sceneData: ShaderData | undefined,
    cameraData: ShaderData | undefined,
    rendererData: ShaderData | undefined,
    materialData: ShaderData | undefined,
    renderElementData: ShaderData | undefined
  ): ShaderPropertyValueType | undefined {
    let value: ShaderPropertyValueType | undefined;
    if (renderElementData && (value = renderElementData._propertyValueMap[id]) != null) return value;
    if (rendererData && (value = rendererData._propertyValueMap[id]) != null) return value;
    if (materialData && (value = materialData._propertyValueMap[id]) != null) return value;
    if (cameraData && (value = cameraData._propertyValueMap[id]) != null) return value;
    return sceneData?._propertyValueMap[id];
  }

  id: number;

  readonly sceneUniformBlock: ShaderUniformBlock = new ShaderUniformBlock();
  readonly cameraUniformBlock: ShaderUniformBlock = new ShaderUniformBlock();
  readonly rendererUniformBlock: ShaderUniformBlock = new ShaderUniformBlock();
  readonly materialUniformBlock: ShaderUniformBlock = new ShaderUniformBlock();
  readonly renderElementUniformBlock: ShaderUniformBlock = new ShaderUniformBlock();
  readonly otherUniformBlock: ShaderUniformBlock = new ShaderUniformBlock();
  readonly multiGroupUniformBlock: ShaderUniformBlock = new ShaderUniformBlock();

  /** @internal */
  _uploadRenderCount: number = -1;
  /** @internal */
  _uploadSceneId: number = -1;
  /** @internal */
  _uploadCameraId: number = -1;
  /** @internal */
  _uploadRendererId: number = -1;
  /** @internal */
  _uploadMaterialId: number = -1;

  /** @internal */
  _instanceLayout: InstanceBufferLayout | null = null;
  /** @internal */
  _errorLog: string | null = null;
  /** @internal */
  _ssrFallbackNoVerify: ShaderProgram | null = null;
  /** @internal */
  _ssrFallbackVerify: ShaderProgram | null = null;
  /** @internal */
  _ssrFallbackMaxUnits: number = -1;

  attributeLocation: Record<string, GLint> = Object.create(null);
  uniformBlockIds: number[] = [];

  // @todo: move to RHI.
  private _isValid: boolean = false;
  private _pendingCompilation = false;
  private _parallelCompile: { readonly COMPLETION_STATUS_KHR: number } | null = null;
  private _engine: Engine;
  private _gl: WebGL2RenderingContext;
  private _glProgram: WebGLProgram | null;
  private _fragmentSource: string | null;
  private _activeTextureUint: number = 0;
  private _activeFragmentTextureCount: number = 0;
  private _groupConflictVersion: number = 0;

  /**
   * Whether this shader program is valid.
   */
  get isValid(): boolean {
    return this._isValid;
  }

  /**
   * Number of fragment texture units bound by this shader program.
   * @internal
   */
  get activeTextureCount(): number {
    return this._activeFragmentTextureCount;
  }

  constructor(
    engine: Engine,
    vertexSource: string,
    fragmentSource: string,
    transformFeedbackVaryings?: string[],
    deferCompletion = false
  ) {
    this._engine = engine;
    this._gl = engine._hardwareRenderer.gl;
    this._fragmentSource = fragmentSource;
    if (deferCompletion) this._parallelCompile = this._gl.getExtension("KHR_parallel_shader_compile");
    this._pendingCompilation = !!this._parallelCompile;
    this._glProgram = this._createProgram(vertexSource, fragmentSource, transformFeedbackVaryings);

    if (this._glProgram && !this._pendingCompilation) {
      this._isValid = true;
      this._recordLocation();
    } else if (!this._glProgram) {
      this._pendingCompilation = false;
      this._fragmentSource = null;
    }

    this.id = ShaderProgram._counter++;
  }

  /** @internal Non-blocking completion poll for prewarming; false never queries reflection or link status. */
  _pollReady(): boolean {
    if (!this._pendingCompilation) return true;
    if (this._gl.isContextLost()) {
      this.destroy();
      return true;
    }
    if (!this._gl.getProgramParameter(this._glProgram!, this._parallelCompile!.COMPLETION_STATUS_KHR)) return false;
    this._ensureReady();
    return true;
  }

  /** @internal Normal rendering may synchronously finish a program submitted by prewarming. */
  _ensureReady(): void {
    if (!this._pendingCompilation) return;
    this._pendingCompilation = false;
    const gl = this._gl;
    if (gl.isContextLost() || !gl.getProgramParameter(this._glProgram!, gl.LINK_STATUS)) {
      if (!gl.isContextLost()) {
        const log = this._collectProgramErrorLog(this._glProgram!);
        this._errorLog = log;
        if (Logger.isEnabled) {
          Logger.error(`Could not link WebGL program: ${log}`);
        }
      } else {
        this._errorLog = "context lost";
      }
      this.destroy();
      return;
    }
    try {
      this._recordLocation();
      this._isValid = true;
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /**
   * Upload all shader data in shader uniform block.
   * @param uniformBlock - shader Uniform block
   * @param shaderData - shader data
   */
  uploadAll(uniformBlock: ShaderUniformBlock, shaderData: ShaderData): void {
    this.uploadUniforms(uniformBlock, shaderData);
    this.uploadTextures(uniformBlock, shaderData);
  }

  /**
   * Upload constant shader data in shader uniform block.
   * @param uniformBlock - shader Uniform block
   * @param shaderData - shader data
   */
  uploadUniforms(uniformBlock: ShaderUniformBlock, shaderData: ShaderData): void {
    const propertyValueMap = shaderData._propertyValueMap;
    const constUniforms = uniformBlock.constUniforms;

    for (let i = 0, n = constUniforms.length; i < n; i++) {
      const uniform = constUniforms[i];
      const data = propertyValueMap[uniform.propertyId];
      data != null && uniform.applyFunc(uniform, data);
    }
  }

  /**
   * Upload texture shader data in shader uniform block.
   * @param uniformBlock - shader Uniform block
   * @param shaderData - shader data
   */
  uploadTextures(uniformBlock: ShaderUniformBlock, shaderData: ShaderData): void {
    const propertyValueMap = shaderData._propertyValueMap;
    const textureUniforms = uniformBlock.textureUniforms;
    // textureUniforms property maybe null if ShaderUniformBlock not contain any texture.
    if (textureUniforms) {
      for (let i = 0, n = textureUniforms.length; i < n; i++) {
        const uniform = textureUniforms[i];
        this._uploadTexture(uniform, propertyValueMap[uniform.propertyId]);
      }
    }
  }

  /**
   * Upload uniforms shared by multiple shader data groups.
   */
  uploadMultiGroupUniforms(
    sceneData: ShaderData | undefined,
    cameraData: ShaderData | undefined,
    rendererData: ShaderData | undefined,
    materialData: ShaderData | undefined,
    renderElementData: ShaderData | undefined
  ): void {
    const { constUniforms, textureUniforms } = this.multiGroupUniformBlock;
    for (let i = 0, n = constUniforms.length; i < n; i++) {
      const uniform = constUniforms[i];
      const value = ShaderProgram._findValue(
        uniform.propertyId,
        sceneData,
        cameraData,
        rendererData,
        materialData,
        renderElementData
      );
      value != null && uniform.applyFunc(uniform, value);
    }
    for (let i = 0, n = textureUniforms.length; i < n; i++) {
      const uniform = textureUniforms[i];
      const value = ShaderProgram._findValue(
        uniform.propertyId,
        sceneData,
        cameraData,
        rendererData,
        materialData,
        renderElementData
      );
      this._uploadTexture(uniform, value);
    }
  }

  /**
   * Upload ungroup texture shader data in shader uniform block.
   */
  uploadUnGroupTextures(): void {
    const textureUniforms = this.otherUniformBlock.textureUniforms;
    // textureUniforms property maybe null if ShaderUniformBlock not contain any texture.
    if (textureUniforms) {
      for (let i = 0, n = textureUniforms.length; i < n; i++) {
        const uniform = textureUniforms[i];
        uniform.applyFunc(uniform, uniform.textureDefault);
      }
    }
  }

  /**
   * Regroup uniform blocks when shader property groups change.
   */
  regroupUniformBlocks(): void {
    const conflictVersion = ShaderProperty._groupConflictVersion;
    if (this._groupConflictVersion !== conflictVersion) {
      this._groupConflictVersion = conflictVersion;
      this._regroupUniformBlock(this.sceneUniformBlock, ShaderDataGroup.Scene);
      this._regroupUniformBlock(this.cameraUniformBlock, ShaderDataGroup.Camera);
      this._regroupUniformBlock(this.rendererUniformBlock, ShaderDataGroup.Renderer);
      this._regroupUniformBlock(this.materialUniformBlock, ShaderDataGroup.Material);
      this._regroupUniformBlock(this.renderElementUniformBlock, ShaderDataGroup.RenderElement);
    }
    this._regroupUniformBlock(this.otherUniformBlock, ShaderDataGroup.None);
  }

  /**
   * Bind this shader program.
   * @returns Whether the shader program is switched.
   */
  bind(): boolean {
    const rhi: IHardwareRenderer = this._engine._hardwareRenderer;
    if (rhi._currentBindShaderProgram !== this) {
      this._gl.useProgram(this._glProgram);
      rhi._currentBindShaderProgram = this;
      return true;
    } else {
      return false;
    }
  }

  /**
   * Destroy this shader program.
   */
  destroy(): void {
    const gl = this._gl;
    this._glProgram && gl.deleteProgram(this._glProgram);
    this._glProgram = null;
    this._fragmentSource = null;
    this._pendingCompilation = false;
    this._isValid = false;
  }

  private _regroupUniformBlock(block: ShaderUniformBlock, group: ShaderDataGroup): void {
    const { constUniforms, textureUniforms } = block;
    constUniforms.length > 0 && this._regroupUniforms(constUniforms, group, false);
    textureUniforms.length > 0 && this._regroupUniforms(textureUniforms, group, true);
  }

  private _regroupUniforms(uniforms: ShaderUniform[], group: ShaderDataGroup, isTexture: boolean): void {
    const propertyIdMap = ShaderProperty._propertyIdMap;
    for (let i = uniforms.length - 1; i >= 0; i--) {
      const uniform = uniforms[i];
      const property = propertyIdMap[uniform.propertyId];
      if (property._groups !== group) {
        uniforms.splice(i, 1);
        this._groupingUniform(uniform, property, isTexture);
      }
    }
  }

  private _uploadTexture(uniform: ShaderUniform, value: ShaderPropertyValueType | undefined): void {
    if (
      value &&
      ((<Texture>value).destroyed === false || (Array.isArray(value) && Array.isArray(uniform.textureDefault)))
    ) {
      uniform.applyFunc(uniform, value);
    } else {
      uniform.applyFunc(uniform, uniform.textureDefault);
    }
  }

  private _groupingUniform(uniform: ShaderUniform, property: ShaderProperty, isTexture: boolean): void {
    let block: ShaderUniformBlock;
    switch (property._groups) {
      case ShaderDataGroup.None:
        block = this.otherUniformBlock;
        break;
      case ShaderDataGroup.Scene:
        block = this.sceneUniformBlock;
        break;
      case ShaderDataGroup.Camera:
        block = this.cameraUniformBlock;
        break;
      case ShaderDataGroup.Renderer:
        block = this.rendererUniformBlock;
        break;
      case ShaderDataGroup.Material:
        block = this.materialUniformBlock;
        break;
      case ShaderDataGroup.RenderElement:
        block = this.renderElementUniformBlock;
        break;
      default:
        block = this.multiGroupUniformBlock;
    }
    (isTexture ? block.textureUniforms : block.constUniforms).push(uniform);
  }

  /**
   * Init and link program with shader.
   */
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
    if (!this._pendingCompilation) gl.validateProgram(program);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!this._pendingCompilation && !gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = this._collectProgramErrorLog(program);
      this._errorLog = log;
      if (Logger.isEnabled) {
        Logger.error(
          `Could not link WebGL program\n\n` +
            `Shader error: ${gl.getError()}\n\n` +
            `Validate status: ${gl.getProgramParameter(program, gl.VALIDATE_STATUS)}\n\n` +
            `Program information log: ${log}`
        );
      }
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  private _collectProgramErrorLog(program: WebGLProgram): string {
    const gl = this._gl;
    const parts: string[] = [];
    const programLog = gl.getProgramInfoLog(program)?.trim();
    if (programLog) parts.push(`link: ${programLog}`);
    const attached = gl.getAttachedShaders(program) ?? [];
    for (const shader of attached) {
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const stage = gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER ? "vs" : "fs";
        const shaderLog = gl.getShaderInfoLog(shader)?.trim();
        parts.push(`${stage}: ${shaderLog || "compile failed"}`);
      }
    }
    return parts.join(" | ") || `glError=${gl.getError()}`;
  }

  private _createShader(shaderType: number, shaderSource: string): WebGLShader | null {
    const gl = this._gl;
    const shader = gl.createShader(shaderType);

    if (!shader) {
      return null;
    }

    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);

    if (!this._pendingCompilation && !gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const stage = shaderType == gl.VERTEX_SHADER ? "vs" : "fs";
      const shaderLog = gl.getShaderInfoLog(shader)?.trim() || "compile failed";
      this._errorLog = `${stage}: ${shaderLog}`;
      if (Logger.isEnabled) {
        console.warn(
          `Could not compile WebGL shader\n\n` +
            `Shader type: ${shaderType == gl.VERTEX_SHADER ? "vertex" : "fragment"}\n\n` +
            `Shader information log:\n${shaderLog}\n` +
            `Shader source:\n${ShaderProgram._addLineNum(shaderSource)}`
        );
      }
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * record the location of uniform/attribute.
   */
  private _recordLocation(): void {
    const gl = this._gl;
    const program = this._glProgram!;
    const uniformInfos = this._getUniformInfos();
    const attributeInfos = this._getAttributeInfos();
    const basicResources = this._engine._basicResources;
    let needsUniformBlockReflection = false;
    this._activeFragmentTextureCount = 0;

    let fsStripped: string | null = null;
    const isSamplerUsedInFS = (samplerName: string): boolean => {
      const source = this._fragmentSource;
      if (source === null) {
        return true;
      }
      if (source.indexOf(samplerName) === -1) {
        return false;
      }
      if (fsStripped === null) {
        fsStripped = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, " ").replace(/\buniform\b[^;]*;/g, " ");
      }
      return ShaderProgram._containsIdentifier(fsStripped, samplerName);
    };

    uniformInfos.forEach(({ name, size, type }) => {
      // Query the original reflection name before normalizing the property key.
      const location = gl.getUniformLocation(program, name);
      // Active block members have no individual location. Treat null as a
      // conservative trigger for block reflection, avoiding a potentially
      // blocking block-state query for programs with only default uniforms.
      if (location === null) {
        needsUniformBlockReflection = true;
        return;
      }

      const shaderUniform = new ShaderUniform(this._engine);
      const isArray = name.endsWith("[0]");
      let isTexture = false;
      if (isArray) {
        name = name.substring(0, name.length - 3);
      }

      shaderUniform.name = name;
      const property = ShaderProperty.getByName(name);
      shaderUniform.propertyId = property._uniqueId;
      shaderUniform.location = location;

      switch (type) {
        case gl.FLOAT:
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload1fv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload1f;
            shaderUniform.cacheValue = 0;
          }
          break;
        case gl.FLOAT_VEC2:
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload2fv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload2f;
            shaderUniform.cacheValue = new Vector2(0, 0);
          }
          break;
        case gl.FLOAT_VEC3:
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload3fv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload3f;
            shaderUniform.cacheValue = new Vector3(0, 0, 0);
          }
          break;
        case gl.FLOAT_VEC4:
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload4fv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload4f;
            shaderUniform.cacheValue = new Vector4(0, 0, 0, 0);
          }
          break;
        case gl.BOOL:
        case gl.INT:
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload1iv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload1i;
            shaderUniform.cacheValue = 0;
          }
          break;
        case gl.BOOL_VEC2:
        case gl.INT_VEC2:
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload2iv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload2i;
            shaderUniform.cacheValue = new Vector2(0, 0);
          }
          break;
        case gl.BOOL_VEC3:
        case gl.INT_VEC3:
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload3iv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload3i;
            shaderUniform.cacheValue = new Vector3(0, 0, 0);
          }
          break;
        case gl.BOOL_VEC4:
        case gl.INT_VEC4:
          if (isArray) {
            shaderUniform.applyFunc = shaderUniform.upload4iv;
          } else {
            shaderUniform.applyFunc = shaderUniform.upload4i;
            shaderUniform.cacheValue = new Vector4(0, 0, 0);
          }
          break;
        case gl.FLOAT_MAT2:
          shaderUniform.applyFunc = shaderUniform.uploadMat2;
          break;
        case gl.FLOAT_MAT3:
          shaderUniform.applyFunc = shaderUniform.uploadMat3;
          break;
        case gl.FLOAT_MAT4:
          shaderUniform.applyFunc = isArray ? shaderUniform.uploadMat4v : shaderUniform.uploadMat4;
          break;
        case gl.FLOAT_MAT2x3:
          shaderUniform.applyFunc = shaderUniform.uploadMat2x3;
          break;
        case gl.FLOAT_MAT2x4:
          shaderUniform.applyFunc = shaderUniform.uploadMat2x4;
          break;
        case gl.FLOAT_MAT3x2:
          shaderUniform.applyFunc = shaderUniform.uploadMat3x2;
          break;
        case gl.FLOAT_MAT3x4:
          shaderUniform.applyFunc = shaderUniform.uploadMat3x4;
          break;
        case gl.FLOAT_MAT4x2:
          shaderUniform.applyFunc = shaderUniform.uploadMat4x2;
          break;
        case gl.FLOAT_MAT4x3:
          shaderUniform.applyFunc = shaderUniform.uploadMat4x3;
          break;
        case gl.SAMPLER_2D:
        case gl.SAMPLER_CUBE:
        case gl.UNSIGNED_INT_SAMPLER_2D:
        case gl.SAMPLER_2D_ARRAY:
        case gl.SAMPLER_2D_SHADOW:
          let defaultTexture: Texture;
          switch (type) {
            case gl.SAMPLER_2D:
              defaultTexture = basicResources.whiteTexture2D;
              break;
            case gl.SAMPLER_CUBE:
              defaultTexture = basicResources.whiteTextureCube;
              break;
            case gl.UNSIGNED_INT_SAMPLER_2D:
              defaultTexture = basicResources.uintWhiteTexture2D;
              break;
            case gl.SAMPLER_2D_ARRAY:
              defaultTexture = basicResources.whiteTexture2DArray;
              break;
            case gl.SAMPLER_2D_SHADOW:
              defaultTexture = this._engine._depthTexture2D;
              shaderUniform.textureUseCompareMode = true;
              break;
          }

          isTexture = true;
          if (isSamplerUsedInFS(name)) {
            this._activeFragmentTextureCount += isArray ? size : 1;
          }
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

      this._groupingUniform(shaderUniform, property, isTexture);
    });
    this._groupConflictVersion = ShaderProperty._groupConflictVersion;

    attributeInfos.forEach(({ name }) => {
      this.attributeLocation[name] = gl.getAttribLocation(program, name);
    });

    // Record uniform block indices and bind binding points
    if (needsUniformBlockReflection) {
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

    this._fragmentSource = null;
  }

  private _getUniformInfos(): WebGLActiveInfo[] {
    const gl = this._gl;
    const program = this._glProgram!;
    // uniformCount is `null` when context lost.
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) ?? 0;

    const uniformInfos = new Array<WebGLActiveInfo>(uniformCount);
    for (let i = 0; i < uniformCount; ++i) {
      const info = gl.getActiveUniform(program, i)!;
      uniformInfos[i] = info;
    }

    return uniformInfos;
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

  private static _isIdentChar(code: number): boolean {
    return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
  }

  private static _isWhitespace(code: number): boolean {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
  }

  private static _containsIdentifier(source: string, identifier: string): boolean {
    const len = identifier.length;
    const sourceLen = source.length;
    let idx = source.indexOf(identifier);
    while (idx !== -1) {
      const beforeOk = idx === 0 || !ShaderProgram._isIdentChar(source.charCodeAt(idx - 1));
      const afterIdx = idx + len;
      const afterOk = afterIdx >= sourceLen || !ShaderProgram._isIdentChar(source.charCodeAt(afterIdx));
      if (beforeOk && afterOk) {
        let prev = idx - 1;
        while (prev >= 0 && ShaderProgram._isWhitespace(source.charCodeAt(prev))) {
          prev--;
        }
        if (prev < 0 || source.charCodeAt(prev) !== 46 /* '.' */) {
          return true;
        }
      }
      idx = source.indexOf(identifier, idx + 1);
    }
    return false;
  }
}
