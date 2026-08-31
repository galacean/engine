import { BoundingBox, Vector3 } from "@galacean/engine-math";
import { componentOnDisable, componentOnEnable } from "../Component";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer, RendererUpdateFlags } from "../Renderer";
import { TransformModifyFlags } from "../Transform";
import { GLCapabilityType } from "../base/Constant";
import { Logger } from "../base/Logger";
import { ignoreClone } from "../clone/CloneDecorators";
import { ModelMesh } from "../mesh/ModelMesh";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ParticleGenerator } from "./ParticleGenerator";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleSimulationSpace } from "./enums/ParticleSimulationSpace";
import { ParticleStopMode } from "./enums/ParticleStopMode";

/**
 * Particle Renderer Component.
 */
export class ParticleRenderer extends Renderer {
  private static readonly _billboardModeMacro = ShaderMacro.getByName("RENDERER_MODE_SPHERE_BILLBOARD");
  private static readonly _stretchedBillboardModeMacro = ShaderMacro.getByName("RENDERER_MODE_STRETCHED_BILLBOARD");
  private static readonly _horizontalBillboardModeMacro = ShaderMacro.getByName("RENDERER_MODE_HORIZONTAL_BILLBOARD");
  private static readonly _verticalBillboardModeMacro = ShaderMacro.getByName("RENDERER_MODE_VERTICAL_BILLBOARD");
  private static readonly _meshModeMacro = ShaderMacro.getByName("RENDERER_MODE_MESH");

  private static readonly _pivotOffsetProperty = ShaderProperty.getByName("renderer_PivotOffset");
  private static readonly _lengthScale = ShaderProperty.getByName("renderer_StretchedBillboardLengthScale");
  private static readonly _speedScale = ShaderProperty.getByName("renderer_StretchedBillboardSpeedScale");
  private static readonly _currentTime = ShaderProperty.getByName("renderer_CurrentTime");

  /** Particle generator. */
  readonly generator: ParticleGenerator;
  /** Specifies how much particles stretch depending on their velocity. */
  velocityScale = 0;
  /** How much are the particles stretched in their direction of motion, defined as the length of the particle compared to its width. */
  lengthScale = 2;
  /** The pivot of particle. */
  pivot = new Vector3();

  /** @internal */
  @ignoreClone
  _generatorBounds = new BoundingBox();
  /** @internal */
  @ignoreClone
  _transformedBounds = new BoundingBox();
  @ignoreClone
  private _mesh: ModelMesh;

  @ignoreClone
  private _renderMode: ParticleRenderMode = ParticleRenderMode.Billboard;
  @ignoreClone
  private _currentRenderModeMacro: ShaderMacro;
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
      switch (value) {
        case ParticleRenderMode.Billboard:
          renderModeMacro = ParticleRenderer._billboardModeMacro;
          break;
        case ParticleRenderMode.StretchBillboard:
          renderModeMacro = ParticleRenderer._stretchedBillboardModeMacro;
          break;
        case ParticleRenderMode.HorizontalBillboard:
          renderModeMacro = ParticleRenderer._horizontalBillboardModeMacro;
          break;
        case ParticleRenderMode.VerticalBillboard:
          throw "Not implemented";
          renderModeMacro = ParticleRenderer._verticalBillboardModeMacro;
          break;
        case ParticleRenderMode.Mesh:
          renderModeMacro = ParticleRenderer._meshModeMacro;
          break;
      }

      if (this._currentRenderModeMacro !== renderModeMacro) {
        const { shaderData } = this;
        this._currentRenderModeMacro && shaderData.disableMacro(this._currentRenderModeMacro);
        renderModeMacro && shaderData.enableMacro(renderModeMacro);
        this._currentRenderModeMacro = renderModeMacro;
      }

      const wasMeshMode = lastRenderMode === ParticleRenderMode.Mesh;
      const isMeshMode = value === ParticleRenderMode.Mesh;
      if (wasMeshMode !== isMeshMode) {
        this.generator._reorganizeGeometryBuffers();
      }
    }
  }

  /**
   * The mesh shape for rendering each emitted particle.
   * @remarks Only effective when `renderMode` is `ParticleRenderMode.Mesh`.
   */
  get mesh(): ModelMesh {
    return this._mesh;
  }

  set mesh(value: ModelMesh) {
    const lastMesh = this._mesh;
    if (lastMesh !== value) {
      this._mesh = value;
      lastMesh && this._addResourceReferCount(lastMesh, -1);

      if (value) {
        if (value.subMeshes.length !== 1) {
          Logger.error("Particle emit mesh must have only one sub mesh.");
        }

        this._addResourceReferCount(value, 1);
        if (this.renderMode === ParticleRenderMode.Mesh) {
          this.generator._reorganizeGeometryBuffers();
        }
      }
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._onGeneratorParamsChanged = this._onGeneratorParamsChanged.bind(this);
    this.generator = new ParticleGenerator(this);

    this._currentRenderModeMacro = ParticleRenderer._billboardModeMacro;
    this.shaderData.enableMacro(ParticleRenderer._billboardModeMacro);

    this._supportInstancedArrays = this.engine._hardwareRenderer.canIUse(GLCapabilityType.instancedArrays);

    this._onGeneratorParamsChanged();
  }

  /**
   * @internal
   */
  override [componentOnEnable](): void {
    const generator = this.generator;
    generator._setTransformFeedback();
    if (generator.main.playOnEnabled) {
      generator.play(false);
    }
  }

  /**
   * @internal
   */
  override [componentOnDisable](): void {
    this.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
  }

  /**
   * @internal
   */
  override _prepareRender(context: RenderContext): void {
    if (!this._supportInstancedArrays) {
      return;
    }

    super._prepareRender(context);
  }

  /**
   * @internal
   */
  override _updateTransformShaderData(context: RenderContext, onlyMVP: boolean): void {
    //@todo: Don't need to update transform shader data, temp solution
    this._updateWorldSpaceTransformShaderData(context, onlyMVP);
  }
  protected override _updateBounds(worldBounds: BoundingBox): void {
    const { generator } = this;

    // Using `isAlive` instead of `firstActiveElement !== firstFreeElement`
    // Because `firstActiveElement !== firstFreeElement` will cause bounds is merely a point, and cannot be culled forever
    // Must generate bounds even when there is no particle but in play state
    if (!generator.isAlive) {
      const worldPosition = this.entity.transform.worldPosition;
      worldBounds.min.copyFrom(worldPosition);
      worldBounds.max.copyFrom(worldPosition);
      return;
    }
    if (generator.main.simulationSpace === ParticleSimulationSpace.Local) {
      generator._updateBoundsSimulationLocal(worldBounds);
    } else {
      if (this._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)) {
        generator._generateTransformedBounds();
        this._setDirtyFlagFalse(ParticleUpdateFlags.TransformVolume);
      }
      generator._updateBoundsSimulationWorld(worldBounds);
    }
  }

  protected override _update(context: RenderContext): void {
    const generator = this.generator;
    generator._update(this.engine.time.deltaTime);

    // No particles to render
    if (generator._firstActiveElement === generator._firstFreeElement) {
      return;
    }

    const shaderData = this.shaderData;
    shaderData.setFloat(ParticleRenderer._lengthScale, this.lengthScale);
    shaderData.setFloat(ParticleRenderer._speedScale, this.velocityScale);
    shaderData.setFloat(ParticleRenderer._currentTime, this.generator._playTime);
    shaderData.setVector3(ParticleRenderer._pivotOffsetProperty, this.pivot);

    this.generator._updateShaderData(shaderData);

    // Run Transform Feedback simulation after shader data is up to date
    if (generator._useTransformFeedback) {
      generator._updateFeedback(shaderData, this.engine.time.deltaTime * generator.main.simulationSpeed);
    }
  }

  protected override _render(context: RenderContext): void {
    const generator = this.generator;
    // Don't need to render when no particles

    const aliveParticleCount = generator._getAliveParticleCount();
    if (!aliveParticleCount) {
      return;
    }
    // Transform Feedback: render all slots (instance buffer not compacted, dead particles discarded in shader)
    // Non-Transform Feedback: render only alive particles (instance buffer compacted)
    generator._primitive.instanceCount = generator._useTransformFeedback
      ? generator._firstActiveElement <= generator._firstFreeElement
        ? generator._firstFreeElement
        : generator._currentParticleCount
      : aliveParticleCount;

    let material = this.getMaterial();
    if (!material || (this._renderMode === ParticleRenderMode.Mesh && !this._mesh)) {
      return;
    }

    if (material.destroyed || material.shader.destroyed) {
      material = this.engine._basicResources.particleMagentaMaterial;
    }

    const engine = this._engine;
    const renderElement = engine._renderElementPool.get();
    renderElement.set(this, material, generator._primitive, generator._subPrimitive);
    renderElement.priority = this.priority;
    renderElement.distanceForSort = this._distanceForSort;
    context.camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  protected override _onDestroy(): void {
    const mesh = this._mesh;
    if (mesh) {
      mesh.destroyed || this._addResourceReferCount(mesh, -1);
    }
    super._onDestroy();
    this.generator._destroy();
  }

  /**
   * @inheritdoc
   */
  override _onClone(target: ParticleRenderer): void {
    super._onClone(target);
    target.mesh = this._mesh;
    target.renderMode = this._renderMode;
  }

  /**
   * @internal
   */
  _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyUpdateFlag & type) != 0;
  }

  /**
   * @internal
   */
  _setDirtyFlagFalse(type: number): void {
    this._dirtyUpdateFlag &= ~type;
  }

  /**
   * @internal
   */
  _onWorldVolumeChanged(): void {
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  /**
   * @internal
   */
  @ignoreClone
  _onGeneratorParamsChanged(): void {
    this._dirtyUpdateFlag |=
      ParticleUpdateFlags.GeneratorVolume | ParticleUpdateFlags.TransformVolume | RendererUpdateFlags.WorldVolume;
  }

  /**
   * @internal
   */
  @ignoreClone
  override _onTransformChanged(type: TransformModifyFlags): void {
    this._dirtyUpdateFlag |= ParticleUpdateFlags.TransformVolume | RendererUpdateFlags.WorldVolume;
  }
}

/**
 * @internal
 */
export enum ParticleUpdateFlags {
  /** On World Transform Changed */
  TransformVolume = 0x2,
  /** On Generator Bounds Related Params Changed */
  GeneratorVolume = 0x4
}
