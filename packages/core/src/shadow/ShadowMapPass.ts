import { Color } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Layer } from "../Layer";
import { Light } from "../lighting/Light";
import { Material } from "../material/Material";
import { RenderPass } from "../RenderPipeline/RenderPass";
import { RenderQueue } from "../RenderPipeline/RenderQueue";
import { Shader } from "../shader/Shader";
import { RenderTarget } from "../texture/RenderTarget";

/**
 * RenderPass for rendering shadow map.
 */
export class ShadowMapPass extends RenderPass {
  private static _viewMatFromLightProperty = Shader.getPropertyByName("u_viewMatFromLight");
  private static _projMatFromLightProperty = Shader.getPropertyByName("u_projMatFromLight");

  readonly light: Light;

  /**
   * Constructor.
   * @param light  - The light that the shadow belongs to
   */
  constructor(
    name: string,
    priority: number,
    renderTarget: RenderTarget,
    replaceMaterial: Material,
    mask: Layer,
    light: Light
  ) {
    super(name, priority, renderTarget, replaceMaterial, mask);
    this.light = light;
    this.clearColor = new Color(1, 1, 1, 1);
  }

  /**
   * @override
   */
  preRender(camera: Camera, queue: RenderQueue) {
    // The viewProjection matrix from the light.
    const shaderData = this.replaceMaterial.shaderData;
    shaderData.setMatrix(ShadowMapPass._viewMatFromLightProperty, this.light.viewMatrix);
    shaderData.setMatrix(ShadowMapPass._projMatFromLightProperty, (this.light as any).shadow.projectionMatrix);
  }
}
