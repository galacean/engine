import { Vector3, Vector4 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer } from "../Renderer";
import { deepClone, ignoreClone, shallowClone } from "../clone/CloneManager";
import { ModelMesh } from "../mesh/ModelMesh";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ParticleGenerator } from "./ParticleGenerator";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleScaleMode } from "./enums/ParticleScaleMode";
import { ParticleSimulationSpace } from "./enums/ParticleSimulationSpace";
import { ParticleStopMode } from "./enums/ParticleStopMode";

/**
 * Particle Renderer Component.
 */
export class ParticleRenderer extends Renderer {
  private static _tempVector40 = new Vector4();
  private static _vector3One = new Vector3(1, 1, 1);

  private static readonly _renderModeBillboardMacro = ShaderMacro.getByName("RENDERER_MODE_SPHERE_BILLBOARD");
  private static readonly _renderModeStretchedBillboardMode = ShaderMacro.getByName(
    "RENDERER_MODE_STRETCHED_BILLBOARD"
  );
  private static readonly _renderModeHorizontalBillboardMacro = ShaderMacro.getByName(
    "RENDERER_MODE_HORIZONTAL_BILLBOARD"
  );
  private static readonly _renderModeVerticalBillboardMacro = ShaderMacro.getByName("RENDERER_MODE_VERTICAL_BILLBOARD");
  private static readonly _renderModeMeshMacro = ShaderMacro.getByName("RENDERER_MODE_MESH");

  private static readonly _pivotOffsetProperty = ShaderProperty.getByName("renderer_PivotOffset");
  private static readonly _worldPosition = ShaderProperty.getByName("u_WorldPosition");
  private static readonly _worldRotation = ShaderProperty.getByName("u_WorldRotation");
  private static readonly _positionScale = ShaderProperty.getByName("u_PositionScale");
  private static readonly _sizeScale = ShaderProperty.getByName("u_SizeScale");
  private static readonly _scaleMode = ShaderProperty.getByName("u_ScalingMode");
  private static readonly _gravity = ShaderProperty.getByName("u_Gravity");
  private static readonly _startRotation3D = ShaderProperty.getByName("u_ThreeDStartRotation");
  private static readonly _lengthScale = ShaderProperty.getByName("u_StretchedBillboardLengthScale");
  private static readonly _speedScale = ShaderProperty.getByName("u_StretchedBillboardSpeedScale");
  private static readonly _simulationSpace = ShaderProperty.getByName("u_SimulationSpace");
  private static readonly _currentTime = ShaderProperty.getByName("u_CurrentTime");

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

  @ignoreClone
  private _gravity = new Vector3();
  private _renderMode: ParticleRenderMode;
  private _currentRenderModeMacro: ShaderMacro;
  private _mesh: ModelMesh;

  /**
   * Specifies how the system draws particles.
   */
  get renderMode(): ParticleRenderMode {
    return this._renderMode;
  }

  set renderMode(value: ParticleRenderMode) {
    if (this._renderMode !== value) {
      const lastRenderMode = this._renderMode;
      this._renderMode = value;

      const shaderData = this.shaderData;
      shaderData.disableMacro(this._currentRenderModeMacro);
      switch (value) {
        case ParticleRenderMode.Billboard:
          this._currentRenderModeMacro = ParticleRenderer._renderModeBillboardMacro;
          break;
        case ParticleRenderMode.Stretch:
          this._currentRenderModeMacro = ParticleRenderer._renderModeStretchedBillboardMode;
          break;
        case ParticleRenderMode.HorizontalBillboard:
          this._currentRenderModeMacro = ParticleRenderer._renderModeHorizontalBillboardMacro;
          break;
        case ParticleRenderMode.VerticalBillboard:
          this._currentRenderModeMacro = ParticleRenderer._renderModeVerticalBillboardMacro;
          break;
        case ParticleRenderMode.Mesh:
          this._currentRenderModeMacro = ParticleRenderer._renderModeMeshMacro;
          break;
      }
      shaderData.enableMacro(this._currentRenderModeMacro);

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
      lastMesh?._addReferCount(-1);
      value?._addReferCount(1);
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
    this.shaderData.enableMacro(ParticleRenderer._renderModeBillboardMacro);
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
    const particleSystem = this.generator;
    particleSystem._update(this.engine.time.deltaTime);

    // No particles to render
    if (particleSystem._firstActiveElement === particleSystem._firstFreeElement) {
      return;
    }

    super._prepareRender(context);
  }

  /**
   * @internal
   */
  protected override _updateShaderData(context: RenderContext): void {
    const particleSystem = this.generator;
    const shaderData = this.shaderData;
    const transform = this.entity.transform;

    switch (particleSystem.main.simulationSpace) {
      case ParticleSimulationSpace.Local:
        shaderData.setVector3(ParticleRenderer._worldPosition, transform.worldPosition);
        const worldRotation = transform.worldRotationQuaternion;
        const worldRotationV4 = ParticleRenderer._tempVector40;
        worldRotationV4.copyFrom(worldRotation);
        shaderData.setVector4(ParticleRenderer._worldRotation, worldRotationV4);
        break;
      case ParticleSimulationSpace.World:
        break;
      default:
        throw new Error("ParticleRenderer: SimulationSpace value is invalid.");
    }

    switch (particleSystem.main.scalingMode) {
      case ParticleScaleMode.Hierarchy:
        var scale = transform.lossyWorldScale;
        shaderData.setVector3(ParticleRenderer._positionScale, scale);
        shaderData.setVector3(ParticleRenderer._sizeScale, scale);
        break;
      case ParticleScaleMode.Local:
        var scale = transform.scale;
        shaderData.setVector3(ParticleRenderer._positionScale, scale);
        shaderData.setVector3(ParticleRenderer._sizeScale, scale);
        break;
      case ParticleScaleMode.World:
        shaderData.setVector3(ParticleRenderer._positionScale, transform.lossyWorldScale);
        shaderData.setVector3(ParticleRenderer._sizeScale, ParticleRenderer._vector3One);
        break;
    }

    const particleGravity = this._gravity;
    const gravityModifierValue = particleSystem.main.gravityModifier.evaluate(undefined, undefined);
    Vector3.scale(this.scene.physics.gravity, gravityModifierValue, particleGravity);
    shaderData.setVector3(ParticleRenderer._gravity, particleGravity);
    shaderData.setInt(ParticleRenderer._simulationSpace, particleSystem.main.simulationSpace);
    shaderData.setFloat(ParticleRenderer._startRotation3D, +particleSystem.main.startRotation3D);
    shaderData.setInt(ParticleRenderer._scaleMode, particleSystem.main.scalingMode);
    shaderData.setFloat(ParticleRenderer._lengthScale, this.lengthScale);
    shaderData.setFloat(ParticleRenderer._speedScale, this.velocityScale);
    shaderData.setFloat(ParticleRenderer._currentTime, particleSystem._playTime);

    // @todo: mesh is not simple pivot
    shaderData.setVector3(ParticleRenderer._pivotOffsetProperty, this.pivot);

    this.generator._updateShaderData(shaderData);
  }

  protected override _render(context: RenderContext): void {
    const particleSystem = this.generator;
    const primitive = particleSystem._primitive;

    if (particleSystem._firstActiveElement < particleSystem._firstFreeElement) {
      primitive.instanceCount = particleSystem._firstFreeElement - particleSystem._firstActiveElement;
    } else {
      let instanceCount = particleSystem._currentParticleCount - particleSystem._firstActiveElement;
      if (particleSystem._firstFreeElement > 0) {
        instanceCount += particleSystem._firstFreeElement;
      }
      primitive.instanceCount = instanceCount;
    }

    const material = this.getMaterial();
    const generator = this.generator;
    const renderData = this._engine._renderDataPool.getFromPool();
    renderData.setX(this, material, generator._primitive, generator._subPrimitive);
    context.camera._renderPipeline.pushRenderData(context, renderData);

    // console.log(
    //   "Retired:" +
    //     particleSystem._firstRetiredElement +
    //     " Active:" +
    //     particleSystem._firstActiveElement +
    //     " New:" +
    //     particleSystem._firstNewElement +
    //     " Free:" +
    //     particleSystem._firstFreeElement +
    //     " InstanceCount:" +
    //     primitive.instanceCount
    // );
  }

  protected override _onDestroy(): void {
    this.generator._destroy();
  }
}
