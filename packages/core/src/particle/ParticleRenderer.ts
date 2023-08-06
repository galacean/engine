import { Vector3, Vector4 } from "@galacean/engine-math";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer } from "../Renderer";
import { ModelMesh } from "../mesh/ModelMesh";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ParticleSystem } from "./ParticleSystem";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleStopMode } from "./enums/ParticleStopMode";
import { ParticleBufferDefinition } from "./ParticleBufferUtils";

/**
 * Particle Renderer Component.
 */
export class ParticleRenderer extends Renderer {
  /** @internal */
  private static _tempVector30: Vector3 = new Vector3();
  /** @internal */
  private static _tempVector40: Vector4 = new Vector4();
  /** @internal */
  private static _vector3One: Vector3 = new Vector3(1, 1, 1);

  /**@internal */
  static renderModeBillboardMacro = ShaderMacro.getByName("RENDERER_MODE_SPHERE_BILLBOARD");
  /**@internal */
  static renderModeStretchedBillboardMode = ShaderMacro.getByName("RENDERER_MODE_STRETCHED_BILLBOARD");
  /**@internal */
  static renderModeHorizontalBillboardMacro = ShaderMacro.getByName("RENDERER_MODE_HORIZONTAL_BILLBOARD");
  /**@internal */
  static renderModeVerticalBillboardMacro = ShaderMacro.getByName("RENDERER_MODE_VERTICAL_BILLBOARD");
  /**@internal */
  static renderModeMeshMacro = ShaderMacro.getByName("RENDERER_MODE_MESH");

  private _renderMode: ParticleRenderMode;
  private _currentRenderModeMacro: ShaderMacro;
  private _mesh: ModelMesh;

  /** Particle system. */
  readonly particleSystem: ParticleSystem = new ParticleSystem(this);

  /** Specifies how much particles stretch depending on their velocity. */
  velocityScale: number = 0;
  /** How much are the particles stretched in their direction of motion, defined as the length of the particle compared to its width. */
  lengthScale: number = 2;

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
        this.particleSystem._reorganizeGeometryBuffers();
      }
    }
  }

  /**
   * Specifies how the system draws particles.
   */
  get renderMode(): ParticleRenderMode {
    return this._renderMode;
  }

  set renderMode(value: ParticleRenderMode) {
    if (this._renderMode !== value) {
      const lastRenderMode = this._renderMode;
      const lastRenderModeMacro = this._currentRenderModeMacro;

      this._renderMode = value;

      const shaderData = this.shaderData;
      lastRenderModeMacro && shaderData.disableMacro(lastRenderModeMacro);

      switch (value) {
        case ParticleRenderMode.Billboard:
          this._currentRenderModeMacro = ParticleRenderer.renderModeBillboardMacro;
          break;
        case ParticleRenderMode.Stretch:
          this._currentRenderModeMacro = ParticleRenderer.renderModeStretchedBillboardMode;
          break;
        case ParticleRenderMode.HorizontalBillboard:
          this._currentRenderModeMacro = ParticleRenderer.renderModeHorizontalBillboardMacro;
          break;
        case ParticleRenderMode.VerticalBillboard:
          this._currentRenderModeMacro = ParticleRenderer.renderModeVerticalBillboardMacro;
          break;
        case ParticleRenderMode.Mesh:
          this._currentRenderModeMacro = ParticleRenderer.renderModeMeshMacro;
          break;
      }
      shaderData.enableMacro(this._currentRenderModeMacro);
      if ((lastRenderMode !== ParticleRenderMode.Mesh) !== (value === ParticleRenderMode.Mesh)) {
        this.particleSystem._reorganizeGeometryBuffers();
      }
    }
  }

  /**
   * Play the particle system.
   * @param withChildren - Whether to play the particle system of the child entity
   */
  play(withChildren: boolean): void {}

  /**
   * Stop the particle system.
   * @param withChildren - Whether to stop the particle system of the child entity
   * @param stopMode - Stop mode
   */
  stop(withChildren: boolean, stopMode: ParticleStopMode): void {}

  /**
   * @internal
   */
  protected override _render(context: RenderContext): void {
    const particleSystem = this.particleSystem;
    const shaderData = this.shaderData;
    const transform = this.entity.transform;

    switch (particleSystem.main.simulationSpace) {
      case 0: //World
        break;
      case 1: //Local
        shaderData.setVector3(ParticleBufferDefinition.WORLDPOSITION, transform.worldPosition);
        const worldRotation = transform.worldRotationQuaternion;
        const worldRotationV4 = ParticleRenderer._tempVector40;
        worldRotationV4.copyFrom(worldRotation);
        shaderData.setVector4(ParticleBufferDefinition.WORLDROTATION, worldRotationV4);
        break;
      default:
        throw new Error("ShurikenParticleMaterial: SimulationSpace value is invalid.");
    }

    switch (particleSystem.main.scalingMode) {
      case 0:
        var scale = transform.lossyWorldScale;
        shaderData.setVector3(ParticleBufferDefinition.POSITIONSCALE, scale);
        shaderData.setVector3(ParticleBufferDefinition.SIZESCALE, scale);
        break;
      case 1:
        var scale = transform.scale;
        shaderData.setVector3(ParticleBufferDefinition.POSITIONSCALE, scale);
        shaderData.setVector3(ParticleBufferDefinition.SIZESCALE, scale);
        break;
      case 2:
        shaderData.setVector3(ParticleBufferDefinition.POSITIONSCALE, transform.lossyWorldScale);
        shaderData.setVector3(ParticleBufferDefinition.SIZESCALE, ParticleRenderer._vector3One);
        break;
    }

    const particleGravity = ParticleRenderer._tempVector30;
    const gravityModifierValue = particleSystem.main.gravityModifier.evaluate(undefined, undefined);
    Vector3.scale(this.scene.physics.gravity, gravityModifierValue, particleGravity);
    shaderData.setVector3(ParticleBufferDefinition.GRAVITY, particleGravity);
    shaderData.setInt(ParticleBufferDefinition.SIMULATIONSPACE, particleSystem.main.simulationSpace);
    shaderData.setFloat(ParticleBufferDefinition.THREEDSTARTROTATION, +particleSystem.main.startRotation3D);
    shaderData.setInt(ParticleBufferDefinition.SCALINGMODE, particleSystem.main.scalingMode);
    shaderData.setFloat(ParticleBufferDefinition.STRETCHEDBILLBOARDLENGTHSCALE, this.lengthScale);
    shaderData.setFloat(ParticleBufferDefinition.STRETCHEDBILLBOARDSPEEDSCALE, this.velocityScale);
    shaderData.setFloat(ParticleBufferDefinition.CURRENTTIME, particleSystem._playTime);
  }
}
