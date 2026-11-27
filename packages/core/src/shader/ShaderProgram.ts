import type { IShaderUniformBlock } from "@galacean/engine-design";
import type { IPlatformShaderProgram, IPlatformShaderSource, IPlatformUniform } from "../renderingHardwareInterface";
import type { Engine } from "../Engine";
import type { Camera } from "../Camera";
import type { Material } from "../material/Material";
import type { Renderer } from "../Renderer";
import { Texture } from "../texture";
import { ShaderTextureLayout } from "./ShaderTextureLayout";
import { ShaderData, ShaderPropertyValueType } from "./ShaderData";
import { ShaderProperty } from "./ShaderProperty";
import { ShaderUniformBlock } from "./ShaderUniformBlock";
import { GlobalUniformBlock } from "./GlobalUniformBlock";
import { ConstantBufferBindingPoint } from "./enums/ConstantBufferBindingPoint";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import type { InstanceBufferLayout } from "./ShaderFactory";

/** Resolves ShaderData ownership and submits compiler-defined ranges to a native program. */
export class ShaderProgram {
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

  _errorLog: string | null = null;
  _ssrFallbackMaxUnits = -1;
  _ssrFallbackNoVerify: ShaderProgram | null = null;
  _ssrFallbackVerify: ShaderProgram | null = null;
  private _released = false;
  private _setupCompleted = false;
  private _pendingUniformBlocks?: readonly IShaderUniformBlock[];
  private _pendingInstanceBindingName?: string;
  private _pendingReflection?: IPlatformShaderSource["reflection"];
  activeTextureCount = 0;

  _pollReady(): boolean {
    if (this._setupCompleted || this._released) return true;
    const platform = this._platformProgram;
    if (platform.pollReady && !platform.pollReady()) return false;
    this._finishPlatformSetup();
    return true;
  }

  _ensureReady(): void {
    if (this._setupCompleted || this._released) return;
    this._platformProgram.ensureReady?.();
    this._finishPlatformSetup();
  }

  readonly _platformProgram: IPlatformShaderProgram;
  get id(): number {
    return this._platformProgram.id;
  }
  get attributeLocation(): Record<string, number> {
    return this._platformProgram.attributeLocation;
  }
  get uniformBlockIds(): readonly number[] {
    return this._platformProgram.uniformBlockIds;
  }
  get isValid(): boolean {
    return this._platformProgram.isValid;
  }
  /** @internal Transform feedback layout configured for this program's output buffer. */
  _feedbackVaryings?: readonly string[];
  private _groupConflictVersion = 0;
  private _uniformBlocks?: GlobalUniformBlock[];
  /** @internal Floating-point sampler inputs that can also read unfilterable resources. */
  readonly _textureLayout?: ShaderTextureLayout;

  constructor(
    private _engine: Engine,
    source: IPlatformShaderSource,
    uniformBlocks?: readonly IShaderUniformBlock[],
    instanceBindingName?: string
  ) {
    const platform = (this._platformProgram = _engine._hardwareRenderer.createPlatformShaderProgram(_engine, source));
    if (
      source.reflection &&
      (source.reflection.requiresTextureKeys ||
        source.reflection.requiresSamplerKeys ||
        source.reflection.textures.some((texture) => texture.sampleType === "float"))
    ) {
      this._textureLayout = new ShaderTextureLayout(_engine._hardwareRenderer, source.reflection, platform);
    }
    this._pendingUniformBlocks = uniformBlocks;
    this._pendingInstanceBindingName = instanceBindingName;
    this._pendingReflection = source.reflection;
    if (source.deferCompletion && platform.pollReady && !platform.isValid && !platform.errorLog) {
      return;
    }
    this._finishPlatformSetup();
  }

  private _finishPlatformSetup(): void {
    if (this._setupCompleted || this._released) return;
    this._setupCompleted = true;
    const platform = this._platformProgram;
    const reflection = this._pendingReflection;
    let uniformBlocks = this._pendingUniformBlocks;
    const instanceBindingName = this._pendingInstanceBindingName;
    this._pendingReflection = undefined;
    this._pendingUniformBlocks = undefined;
    this._pendingInstanceBindingName = undefined;

    if (platform.errorLog) {
      this._errorLog = platform.errorLog;
    }
    this.activeTextureCount = reflection
      ? new Set(reflection.textures.filter((t) => t.visibility & 2).map((t) => t.group + ":" + t.textureBinding)).size
      : platform.uniforms.filter((u) => u.isTexture).length;
    if (!platform.isValid) return;
    let initialized = false;
    try {
      // WGSL reflection also describes blocks recovered from historical .shaderc assets.
      if (reflection) {
        uniformBlocks = reflection.uniformBlocks
          .filter((block) => block.name !== "Instance")
          .sort((a, b) => a.physicalBinding - b.physicalBinding) as IShaderUniformBlock[];
      }
      if (uniformBlocks) this._bindGlobalBlockLayouts(uniformBlocks);
      if (instanceBindingName)
        platform.bindUniformBlock(instanceBindingName, ConstantBufferBindingPoint.RendererInstance);
      for (const uniform of platform.uniforms) {
        this._groupingUniform(uniform, ShaderProperty._propertyIdMap[uniform.propertyId], uniform.isTexture);
      }
      this._groupConflictVersion = ShaderProperty._groupConflictVersion;
      initialized = true;
    } finally {
      if (!initialized) this.destroy();
    }
  }

  /** Bind the native program and update the loose uniform and texture inputs actually used by this draw. */
  bindForDraw(
    camera: Camera,
    renderer: Renderer,
    material: Material,
    renderElementShaderData: ShaderData | undefined,
    isInstanced: boolean
  ): void {
    const switchProgram = this.bind();
    if (!this._platformProgram.uniforms.length) return;
    const renderCount = this._engine._renderCount;
    const { instanceId: cameraId, shaderData: cameraData } = camera;
    const { instanceId: sceneId, shaderData: sceneData } = camera.scene!;
    const { instanceId: rendererId, shaderData: rendererData } = renderer;
    const { instanceId: materialId, shaderData: materialData } = material;
    const switchRenderCount = renderCount !== this._uploadRenderCount;

    // Upload uniforms (cache-aware per block). Renderer block carries plain samplers/arrays
    // even on the instanced path (GLSL forbids them in UBOs); `_canBatch` ensures the whole
    // batch agrees on those, so the leader's values are correct for the draw call
    if (switchRenderCount) {
      this.regroupUniformBlocks();
      this.uploadAll(this.sceneUniformBlock, sceneData);
      this.uploadAll(this.cameraUniformBlock, cameraData);
      this.uploadAll(this.rendererUniformBlock, rendererData);
      this._uploadRendererId = isInstanced ? -1 : rendererId;
      this.uploadAll(this.materialUniformBlock, materialData);
      renderElementShaderData && this.uploadAll(this.renderElementUniformBlock, renderElementShaderData);
      // UnGroup textures should upload default value, texture uint maybe change by logic of texture bind
      this.uploadUnGroupTextures();
      this._uploadSceneId = sceneId;
      this._uploadCameraId = cameraId;
      this._uploadMaterialId = materialId;
      this._uploadRenderCount = renderCount;
    } else {
      if (this._uploadSceneId !== sceneId) {
        this.uploadAll(this.sceneUniformBlock, sceneData);
        this._uploadSceneId = sceneId;
      } else if (switchProgram) {
        this.uploadTextures(this.sceneUniformBlock, sceneData);
      }

      if (this._uploadCameraId !== cameraId) {
        this.uploadAll(this.cameraUniformBlock, cameraData);
        this._uploadCameraId = cameraId;
      } else if (switchProgram) {
        this.uploadTextures(this.cameraUniformBlock, cameraData);
      }

      if (isInstanced) {
        // Different batches may have different leaders, re-upload every time
        this.uploadAll(this.rendererUniformBlock, rendererData);
        this._uploadRendererId = -1;
      } else if (this._uploadRendererId !== rendererId) {
        this.uploadAll(this.rendererUniformBlock, rendererData);
        this._uploadRendererId = rendererId;
      } else if (switchProgram) {
        this.uploadTextures(this.rendererUniformBlock, rendererData);
      }

      if (this._uploadMaterialId !== materialId) {
        this.uploadAll(this.materialUniformBlock, materialData);
        this._uploadMaterialId = materialId;
      } else if (switchProgram) {
        this.uploadTextures(this.materialUniformBlock, materialData);
      }

      renderElementShaderData && this.uploadAll(this.renderElementUniformBlock, renderElementShaderData);

      // We only consider switchProgram case, because UnGroup texture's value is always default
      if (switchProgram) {
        this.uploadUnGroupTextures();
      }
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
      data != null && uniform.apply(data);
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
   * Bind global blocks and resolve uniforms shared by multiple shader data groups.
   */
  uploadSharedUniforms(
    sceneData: ShaderData,
    cameraData: ShaderData,
    rendererData?: ShaderData,
    materialData?: ShaderData,
    renderElementData?: ShaderData
  ): void {
    this.bindUniformBlocks(sceneData, cameraData, rendererData, materialData, renderElementData);
    const { constUniforms, textureUniforms } = this.multiGroupUniformBlock;
    for (let i = 0, n = constUniforms.length; i < n; i++) {
      const uniform = constUniforms[i];
      const value = ShaderData._findValue(
        uniform.propertyId,
        sceneData,
        cameraData,
        rendererData,
        materialData,
        renderElementData
      );
      value != null && uniform.apply(value);
    }
    for (let i = 0, n = textureUniforms.length; i < n; i++) {
      const uniform = textureUniforms[i];
      const value = ShaderData._findValue(
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

  /** Bind the compiler-selected ranges for a draw or a renderer-only transform-feedback step. */
  bindUniformBlocks(
    scene: ShaderData | undefined,
    camera: ShaderData | undefined,
    renderer?: ShaderData,
    material?: ShaderData,
    element?: ShaderData
  ): void {
    const blocks = this._uniformBlocks;
    if (blocks) {
      for (let i = 0; i < blocks.length; ++i) blocks[i].bind(scene, camera, renderer, material, element);
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
        uniform.apply(uniform.textureDefault!);
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

  bind(): boolean {
    if (!this._setupCompleted) this._ensureReady();
    return this._platformProgram.bind();
  }

  destroy(): void {
    if (this._released) return;
    this._released = true;
    if (this._uniformBlocks) {
      for (const block of this._uniformBlocks) block.release();
      this._uniformBlocks = undefined;
    }
    this._platformProgram.destroy();
  }

  private _regroupUniformBlock(block: ShaderUniformBlock, group: ShaderDataGroup): void {
    const { constUniforms, textureUniforms } = block;
    constUniforms.length > 0 && this._regroupUniforms(constUniforms, group, false);
    textureUniforms.length > 0 && this._regroupUniforms(textureUniforms, group, true);
  }

  private _regroupUniforms(uniforms: IPlatformUniform[], group: ShaderDataGroup, isTexture: boolean): void {
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

  private _uploadTexture(uniform: IPlatformUniform, value: ShaderPropertyValueType | undefined): void {
    if (
      value &&
      ((<Texture>value).destroyed === false || (Array.isArray(value) && Array.isArray(uniform.textureDefault)))
    ) {
      uniform.apply(value);
    } else {
      uniform.apply(uniform.textureDefault!);
    }
  }

  private _groupingUniform(uniform: IPlatformUniform, property: ShaderProperty, isTexture: boolean): void {
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

  private _bindGlobalBlockLayouts(layouts: readonly IShaderUniformBlock[]): void {
    let nextAutoBinding = ConstantBufferBindingPoint.Auto;
    const used = new Set<number>();
    for (const layout of layouts) {
      const binding = layout.name === "Auto" ? nextAutoBinding++ : ConstantBufferBindingPoint[layout.name];
      if (layout.bindingName === "RealtimeIBLSphericalHarmonics") {
        this._platformProgram.bindUniformBlock(
          layout.bindingName,
          ConstantBufferBindingPoint.RealtimeIBLSphericalHarmonics
        );
        continue;
      }
      if (!this._platformProgram.bindUniformBlock(layout.bindingName ?? layout.name, binding)) continue;
      if (used.has(binding)) {
        throw new Error(`Duplicate global uniform block '${layout.name}'.`);
      }
      used.add(binding);
      (this._uniformBlocks ??= []).push(GlobalUniformBlock.acquire(this._engine, layout, binding));
    }
  }
}
