import { Vector3, BoundingBox } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer, RendererUpdateFlags } from "../Renderer";
import { GLCapabilityType } from "../base/Constant";
import { deepClone, shallowClone } from "../clone/CloneManager";
import { ModelMesh } from "../mesh/ModelMesh";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleStopMode } from "./enums/ParticleStopMode";
import { ParticleGenerator } from "./ParticleGenerator";

/**
 * Particle Renderer Component.
 */
export class ParticleRenderer extends Renderer {
  private static readonly _billboardModeMacro = ShaderMacro.getByName("RENDERER_MODE_SPHERE_BILLBOARD");
  private static readonly _stretchedBillboardModeMacro = ShaderMacro.getByName("RENDERER_MODE_STRETCHED_BILLBOARD");
  private static readonly _horizontalBillboardModeMacro = ShaderMacro.getByName("RENDERER_MODE_HORIZONTAL_BILLBOARD");
  private static readonly _verticalBillboardModeMacro = ShaderMacro.getByName("RENDERER_MODE_VERTICAL_BILLBOARD");
  private static readonly _renderModeMeshMacro = ShaderMacro.getByName("RENDERER_MODE_MESH");

  private static readonly _pivotOffsetProperty = ShaderProperty.getByName("renderer_PivotOffset");
  private static readonly _lengthScale = ShaderProperty.getByName("renderer_StretchedBillboardLengthScale");
  private static readonly _speedScale = ShaderProperty.getByName("renderer_StretchedBillboardSpeedScale");
  private static readonly _currentTime = ShaderProperty.getByName("renderer_CurrentTime");

  /** Particle generator. */
  @deepClone
  readonly generator = new ParticleGenerator(this);
  /** Specifies how much particles stretch depending on their velocity. */
  velocityScale = 0;
  /** How much are the particles stretched in their direction of motion, defined as the length of the particle compared to its width. */
  lengthScale = 2;
  /** The pivot of particle. */
  @shallowClone
  pivot = new Vector3();

  private _renderMode: ParticleRenderMode;
  private _currentRenderModeMacro: ShaderMacro;
  private _mesh: ModelMesh;
  private _supportInstancedArrays: boolean;

  /**
   * Specifies how particles are rendered.
   */
  get renderMode(): ParticleRenderMode {
    return this._renderMode;
  }

  set renderMode(value: ParticleRenderMode) {
    if (this._renderMode !== value) {
      const lastRenderMode = this._renderMode;
      this._renderMode = value;

      let renderModeMacro = <ShaderMacro>null;
      const shaderData = this.shaderData;
      switch (value) {
        case ParticleRenderMode.Billboard:
          renderModeMacro = ParticleRenderer._billboardModeMacro;
          break;
        case ParticleRenderMode.StretchBillboard:
          renderModeMacro = ParticleRenderer._stretchedBillboardModeMacro;
          break;
        case ParticleRenderMode.HorizontalBillboard:
          throw "Not implemented";
          renderModeMacro = ParticleRenderer._horizontalBillboardModeMacro;
          break;
        case ParticleRenderMode.VerticalBillboard:
          throw "Not implemented";
          renderModeMacro = ParticleRenderer._verticalBillboardModeMacro;
          break;
        case ParticleRenderMode.Mesh:
          throw "Not implemented";
          renderModeMacro = ParticleRenderer._renderModeMeshMacro;
          break;
      }

      if (this._currentRenderModeMacro !== renderModeMacro) {
        this._currentRenderModeMacro && shaderData.disableMacro(this._currentRenderModeMacro);
        renderModeMacro && shaderData.enableMacro(renderModeMacro);
        this._currentRenderModeMacro = renderModeMacro;
      }

      // @ts-ignore
      if ((lastRenderMode !== ParticleRenderMode.Mesh) !== (value === ParticleRenderMode.Mesh)) {
        this.generator._reorganizeGeometryBuffers();
      }
    }
  }

  /**
   * The mesh of particle.
   * @remarks Valid when `renderMode` is `Mesh`.
   */
  get mesh(): ModelMesh {
    return this._mesh;
  }

  set mesh(value: ModelMesh) {
    const lastMesh = this._mesh;
    if (lastMesh !== value) {
      this._mesh = value;
      lastMesh && this._addResourceReferCount(lastMesh, -1);
      value && this._addResourceReferCount(value, 1);
      if (this.renderMode === ParticleRenderMode.Mesh) {
        this.generator._reorganizeGeometryBuffers();
      }
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);

    this._currentRenderModeMacro = ParticleRenderer._billboardModeMacro;
    this.shaderData.enableMacro(ParticleRenderer._billboardModeMacro);

    this._supportInstancedArrays = this.engine._hardwareRenderer.canIUse(GLCapabilityType.instancedArrays);
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  /**
   * @internal
   */
  override _onEnable(): void {
    if (this.generator.main.playOnEnabled) {
      this.generator.play(false);
    }
  }

  /**
   * @internal
   */
  override _onDisable(): void {
    this.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
  }

  /**
   * @internal
   */
  override _prepareRender(context: RenderContext): void {
    if (!this._supportInstancedArrays) {
      return;
    }

    const generator = this.generator;
    generator._update(this.engine.time.deltaTime);

    // No particles to render
    if (generator._firstActiveElement === generator._firstFreeElement) {
      return;
    }

    super._prepareRender(context);
  }

  /**
   * @internal
   */
  protected override _updateBounds(worldBounds: BoundingBox): void {
    worldBounds.min.set(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);
    worldBounds.max.set(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
  }

  /**
   * @internal
   */
  override _updateShaderData(context: RenderContext, _: boolean): void {
    const shaderData = this.shaderData;
    shaderData.setFloat(ParticleRenderer._lengthScale, this.lengthScale);
    shaderData.setFloat(ParticleRenderer._speedScale, this.velocityScale);
    shaderData.setFloat(ParticleRenderer._currentTime, this.generator._playTime);
    shaderData.setVector3(ParticleRenderer._pivotOffsetProperty, this.pivot);

    this.generator._updateShaderData(shaderData);
  }

  protected override _render(context: RenderContext): void {
    const generator = this.generator;
    generator._primitive.instanceCount = generator._getAliveParticleCount();

    let material = this.getMaterial();
    if (!material) {
      return;
    }

    if (material.destroyed || material.shader.destroyed) {
      material = this.engine._particleMagentaMaterial;
    }

    const renderData = this._engine._renderDataPool.getFromPool();
    renderData.setX(this, material, generator._primitive, generator._subPrimitive);
    context.camera._renderPipeline.pushRenderData(context, renderData);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    const mesh = this._mesh;
    if (mesh) {
      mesh.destroyed || this._addResourceReferCount(mesh, -1);
    }
    this.generator._destroy();
  }
}
