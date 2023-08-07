import { RenderData } from "../RenderPipeline/RenderData";
import { IndexBufferBinding } from "./IndexBufferBinding";
import { SubPrimitive } from "./SubPrimitive";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";

/**
 * Primitive.
 */
export class Primitive extends RenderData {
  vertexElements: VertexElement[] = [];
  vertexBufferBindings: VertexBufferBinding[] = [];
  indexBufferBinding: IndexBufferBinding;
  instanceCount: number;
  subPrimitives: SubPrimitive[] = [];
}
