import { Color } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Layer } from "../Layer";
import { Material } from "../material/Material";
import { RenderTarget } from "../texture/RenderTarget";
import { RenderQueue } from "./RenderQueue";

let passNum = 0;

/**
 * RenderPass.
 */
class RenderPass {
  public name: string;
  public enabled: boolean;
  public priority: number;
  public renderTarget: RenderTarget;
  public replaceMaterial: Material;
  public mask: Layer;
  public renderOverride: boolean;
  public clearFlags: CameraClearFlags | undefined;
  public clearColor: Color | undefined;

  /**
   * Create a RenderPass.
   * @param name - Pass name
   * @param priority - Priority, less than 0 before the default pass, greater than 0 after the default pass
   * @param renderTarget - The specified Render Target
   * @param replaceMaterial - Replaced material
   * @param mask - Perform bit and operations with Entity.Layer to filter the objects that this Pass needs to render
   */
  constructor(
    name = `RENDER_PASS${passNum++}`,
    priority = 0,
    renderTarget = null,
    replaceMaterial = null,
    mask = null
  ) {
    this.name = name;
    this.enabled = true;
    this.priority = priority;
    this.renderTarget = renderTarget;
    this.replaceMaterial = replaceMaterial;
    this.mask = mask || Layer.Everything;
    this.renderOverride = false; // If renderOverride is set to true, you need to implement the render method
  }

  /**
   * Rendering callback, will be executed if renderOverride is set to true.
   * @param camera - Camera
   * @param opaqueQueue - Opaque queue
   * @param alphaTestQueue - Alpha test queue
   * @param transparentQueue - Transparent queue
   */
  render(camera: Camera, opaqueQueue: RenderQueue, alphaTestQueue: RenderQueue, transparentQueue: RenderQueue) {}

  /**
   * Post rendering callback.
   * @param camera - Camera
   * @param opaqueQueue - Opaque queue
   * @param alphaTestQueue - Alpha test queue
   * @param transparentQueue - Transparent queue
   */
  preRender(camera: Camera, opaqueQueue: RenderQueue, alphaTestQueue: RenderQueue, transparentQueue: RenderQueue) {}

  /**
   * Post rendering callback.
   * @param camera - Camera
   * @param opaqueQueue - Opaque queue
   * @param alphaTestQueue - Alpha test queue
   * @param transparentQueue - Transparent queue
   */
  postRender(camera: Camera, opaqueQueue: RenderQueue, alphaTestQueue: RenderQueue, transparentQueue: RenderQueue) {}
}

export { RenderPass };
