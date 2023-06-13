import { ParticleShaderDeclaration } from "./ParticleShaderDeclaration";
import { ParticleMesh } from "./ParticleMesh";
import { MeshRenderer } from "../mesh";
import { Entity } from "../Entity";
import { BoundingBox, Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { ParticleMaterial } from "./ParticleMaterial";
import { Material } from "../material";
import { Texture2D } from "../texture";
import { ParticleCurveMode, ParticleRenderMode, ParticleScaleMode, ParticleSimulationSpace } from "./enum";
import { RenderContext } from "../RenderPipeline/RenderContext";

/**
 * Particle Renderer
 */
export class ParticleRenderer extends MeshRenderer {
  private static _OneVec3 = new Vector3(1, 1, 1);

  private _finalGravity: Vector3 = new Vector3();
  private _dragConstant: Vector2 = new Vector2();
  private _renderMode: ParticleRenderMode;
  private _particleMesh: ParticleMesh;
  private _particleMaterial: ParticleMaterial;

  /** Specifies how much particles stretch depending on their velocity. */
  velocityScale: number = 0;
  /** How much are the particles stretched in their direction of motion, defined as the length of the particle compared to its width. */
  lengthScale: number = 2;

  /**
   * Particle Mesh
   */
  get particleMesh(): ParticleMesh {
    return this._particleMesh;
  }

  /**
   * Base color.
   */
  get baseColor(): Color {
    return this._particleMaterial.baseColor;
  }

  set baseColor(value: Color) {
    this._particleMaterial.baseColor = value;
  }

  /**
   * Base texture.
   */
  get baseTexture(): Texture2D {
    return this._particleMaterial.baseTexture;
  }

  set baseTexture(value: Texture2D) {
    this._particleMaterial.baseTexture = value;
  }

  /**
   * Tiling and offset of main textures.
   */
  get tilingOffset(): Vector4 {
    return this._particleMaterial.tilingOffset;
  }

  set tilingOffset(value: Vector4) {
    this._particleMaterial.tilingOffset = value;
  }

  /**
   * Specifies how the system draws particles.
   */
  get renderMode(): ParticleRenderMode {
    return this._renderMode;
  }

  set renderMode(value: ParticleRenderMode) {
    if (this._renderMode !== value) {
      const shaderData = this.shaderData;
      switch (this._renderMode) {
        case ParticleRenderMode.Billboard:
          shaderData.disableMacro(ParticleShaderDeclaration.RENDERMODE_BILLBOARD);
          break;
        case ParticleRenderMode.Stretch:
          shaderData.disableMacro(ParticleShaderDeclaration.RENDERMODE_STRETCHED_BILLBOARD);
          break;
        case ParticleRenderMode.HorizontalBillboard:
          shaderData.disableMacro(ParticleShaderDeclaration.RENDERMODE_HORIZONTAL_BILLBOARD);
          break;
        case ParticleRenderMode.VerticalBillboard:
          shaderData.disableMacro(ParticleShaderDeclaration.RENDERMODE_VERTICAL_BILLBOARD);
          break;
        case ParticleRenderMode.Mesh:
          shaderData.disableMacro(ParticleShaderDeclaration.RENDERMODE_MESH);
          break;
      }
      this._renderMode = value;
      switch (value) {
        case ParticleRenderMode.Billboard:
          shaderData.enableMacro(ParticleShaderDeclaration.RENDERMODE_BILLBOARD);
          break;
        case ParticleRenderMode.Stretch:
          shaderData.enableMacro(ParticleShaderDeclaration.RENDERMODE_STRETCHED_BILLBOARD);
          break;
        case ParticleRenderMode.HorizontalBillboard:
          shaderData.enableMacro(ParticleShaderDeclaration.RENDERMODE_HORIZONTAL_BILLBOARD);
          break;
        case ParticleRenderMode.VerticalBillboard:
          shaderData.enableMacro(ParticleShaderDeclaration.RENDERMODE_VERTICAL_BILLBOARD);
          break;
        case ParticleRenderMode.Mesh:
          shaderData.enableMacro(ParticleShaderDeclaration.RENDERMODE_MESH);
          break;
      }
      this._particleMesh._initBuffer();
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this._particleMesh = new ParticleMesh(this);
    this._particleMaterial = new ParticleMaterial(entity.engine);
    this.setMaterial(0, this._particleMaterial);
    // used to map quaternion;
    this.shaderData.setVector4(ParticleShaderDeclaration.WORLD_ROTATION, new Vector4());
    this.renderMode = ParticleRenderMode.Billboard;
  }

  /**
   * @internal
   */
  override update(deltaTime: number): void {
    this._particleMesh._prepareRender(deltaTime / 1000);
    this._renderUpdate();
  }

  /**
   * @internal
   */
  override _render(context: RenderContext): void {
    if (this._renderMode !== ParticleRenderMode.None) {
      const mesh = this._particleMesh;
      const subMeshes = mesh.subMeshes;
      const renderPipeline = context.camera._renderPipeline;
      const meshRenderDataPool = this._engine._meshRenderDataPool;
      const material = this._particleMaterial;
      for (let i = 0, n = subMeshes.length; i < n; i++) {
        const subMesh = subMeshes[i];
        if (subMesh.count > 0) {
          const renderData = meshRenderDataPool.getFromPool();
          renderData.set(this, material, mesh, subMeshes[i]);
          renderPipeline.pushRenderData(context, renderData);
        }
      }
    }
  }

  private _renderUpdate(): void {
    const particleSystem = this._particleMesh;
    const shaderData = this.shaderData;
    const transform = this.entity.transform;
    switch (particleSystem.simulationSpace) {
      case ParticleSimulationSpace.World:
        break;
      case ParticleSimulationSpace.Local:
        shaderData.setVector3(ParticleShaderDeclaration.WORLD_POSITION, transform.worldPosition);
        shaderData.getVector4(ParticleShaderDeclaration.WORLD_ROTATION).copyFrom(transform.worldRotationQuaternion);
        break;
    }

    switch (particleSystem.scalingMode) {
      case ParticleScaleMode.Hierarchy:
        const scale: Vector3 = transform.lossyWorldScale;
        shaderData.setVector3(ParticleShaderDeclaration.POSITION_SCALE, scale);
        shaderData.setVector3(ParticleShaderDeclaration.SIZE_SCALE, scale);
        break;
      case ParticleScaleMode.Local:
        const localScale: Vector3 = transform.scale;
        shaderData.setVector3(ParticleShaderDeclaration.POSITION_SCALE, localScale);
        shaderData.setVector3(ParticleShaderDeclaration.SIZE_SCALE, localScale);
        break;
      case ParticleScaleMode.World:
        shaderData.setVector3(ParticleShaderDeclaration.POSITION_SCALE, transform.lossyWorldScale);
        shaderData.setVector3(ParticleShaderDeclaration.SIZE_SCALE, ParticleRenderer._OneVec3);
        break;
    }

    switch (particleSystem.dragType) {
      case ParticleCurveMode.Constant:
        this._dragConstant.set(particleSystem.dragSpeedConstantMin, particleSystem.dragSpeedConstantMin);
        shaderData.setVector2(ParticleShaderDeclaration.DRAG, this._dragConstant);
        break;
      case ParticleCurveMode.TwoConstants:
        this._dragConstant.set(particleSystem.dragSpeedConstantMin, particleSystem.dragSpeedConstantMax);
        shaderData.setVector2(ParticleShaderDeclaration.DRAG, this._dragConstant);
        break;
      default:
        this._dragConstant.set(0, 0);
        break;
    }

    Vector3.scale(this.engine.physicsManager.gravity, particleSystem.gravityModifier, this._finalGravity);
    shaderData.setVector3(ParticleShaderDeclaration.GRAVITY, this._finalGravity);
    shaderData.setInt(ParticleShaderDeclaration.SIMULATION_SPACE, particleSystem.simulationSpace);
    if (particleSystem.startRotation3D) {
      shaderData.setInt(ParticleShaderDeclaration.THREED_START_ROTATION, 0);
    } else {
      shaderData.setInt(ParticleShaderDeclaration.THREED_START_ROTATION, 1);
    }
    shaderData.setInt(ParticleShaderDeclaration.SCALING_MODE, particleSystem.scalingMode);
    shaderData.setFloat(ParticleShaderDeclaration.STRETCHED_BILLBOARD_LENGTH_SCALE, this.lengthScale);
    shaderData.setFloat(ParticleShaderDeclaration.STRETCHED_BILLBOARD_SPEED_SCALE, this.velocityScale);
    shaderData.setFloat(ParticleShaderDeclaration.CURRENT_TIME, particleSystem._currentTime);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const particleSystem = this._particleMesh;
    if (particleSystem._useCustomBounds) {
      worldBounds.copyFrom(particleSystem.customBounds);
      worldBounds.transform(this.entity.transform.worldMatrix);
    } else if (particleSystem._simulationSupported()) {
      particleSystem._generateBounds();
      worldBounds.copyFrom(particleSystem.bounds);
      worldBounds.transform(this.entity.transform.worldMatrix);
      // 在世界坐标下考虑重力影响
      if (particleSystem.gravityModifier != 0) {
        const { min, max } = this._bounds;
        const gravityOffset: Vector2 = particleSystem._gravityOffset;
        max.y -= gravityOffset.x;
        min.y -= gravityOffset.y;
      }
    } else {
      const { min, max } = worldBounds;
      min.set(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);
      max.set(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
    }
  }

  override setMaterial(indexOrMaterial: number | Material, material: Material = null): void {
    throw "can't set self-defined material for particle renderer!";
  }
}
