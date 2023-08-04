import { Renderer } from "../Renderer";
import { ModelMesh } from "../mesh/ModelMesh";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ParticleSystem } from "./ParticleSystem";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";

/**
 * Particle Renderer Component.
 */
export class ParticleRenderer extends Renderer {
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
}
