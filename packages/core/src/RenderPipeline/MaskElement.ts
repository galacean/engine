import { StencilOperation } from "../shader";
import { RenderElement } from "./RenderElement";

export class MaskElement extends RenderElement {
  stencilOperation: StencilOperation;
}
