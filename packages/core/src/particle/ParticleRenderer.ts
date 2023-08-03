
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

  /** Particle system. */
  readonly particleSystem: ParticleSystem = new ParticleSystem(this);

  /**
   * The mesh of particle.
   * @remarks Valid when `renderMode` is `Mesh`.
   */
  mesh: ModelMesh;

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
          shaderData.disableMacro(ParticleRenderer.renderModeBillboardMacro);
          break;
        case ParticleRenderMode.Stretch:
          shaderData.disableMacro(ParticleRenderer.renderModeStretchedBillboardMode);
          break;
        case ParticleRenderMode.HorizontalBillboard:
          shaderData.disableMacro(ParticleRenderer.renderModeHorizontalBillboardMacro);
          break;
        case ParticleRenderMode.VerticalBillboard:
          shaderData.disableMacro(ParticleRenderer.renderModeVerticalBillboardMacro);
          break;
        case ParticleRenderMode.Mesh:
          shaderData.disableMacro(ParticleRenderer.renderModeMeshMacro);
          break;
      }
      this._renderMode = value;
      switch (value) {
        case ParticleRenderMode.Billboard:
          shaderData.enableMacro(ParticleRenderer.renderModeBillboardMacro);
          break;
        case ParticleRenderMode.Stretch:
          shaderData.enableMacro(ParticleRenderer.renderModeStretchedBillboardMode);
          break;
        case ParticleRenderMode.HorizontalBillboard:
          shaderData.enableMacro(ParticleRenderer.renderModeHorizontalBillboardMacro);
          break;
        case ParticleRenderMode.VerticalBillboard:
          shaderData.enableMacro(ParticleRenderer.renderModeVerticalBillboardMacro);
          break;
        case ParticleRenderMode.Mesh:
          shaderData.enableMacro(ParticleRenderer.renderModeMeshMacro);
          break;
      }
      //   this._particleMesh._initBuffer();
    }
  }
}
