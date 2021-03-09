import { Vector4 } from "@oasis-engine/math";
import { ClearMode } from "../base/Constant";
import { Camera } from "../Camera";
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
  public clearMode;
  private _clearParam;

  /**
   * Create a RenderPass.
   * @param name - Pass name
   * @param priority - Priority, less than 0 before the default pass, greater than 0 after the default pass
   * @param renderTarget - The specified Render Target
   * @param replaceMaterial -  Replaced material
   * @param mask - Perform bit and operations with Entity.Layer to filter the objects that this Pass needs to render
   * @param clearParam - Clear the background color of renderTarget
   */
  constructor(
    name = `RENDER_PASS${passNum++}`,
    priority = 0,
    renderTarget = null,
    replaceMaterial = null,
    mask = null,
    clearParam = new Vector4(0, 0, 0, 0)
  ) {
    this.name = name;
    this.enabled = true;
    this.priority = priority;
    this.renderTarget = renderTarget;
    this.replaceMaterial = replaceMaterial;
    this.mask = mask || Layer.Everything;
    this.renderOverride = false; // If renderOverride is set to true, you need to implement the render method

    this.clearMode = ClearMode.SOLID_COLOR;
    this._clearParam = clearParam; // PASS use render target's clearParam
  }

  /**
   * Canvas clear parameters, the default is to use the clearColor of RenderTarget.
   */
  get clearParam() {
    return this._clearParam;
  }

  set clearParam(v) {
    this._clearParam = v;
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
