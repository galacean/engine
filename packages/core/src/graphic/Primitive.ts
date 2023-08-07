import { MeshTopology } from "../graphic/enums/MeshTopology";
import { IndexBufferBinding } from "./IndexBufferBinding";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";

/**
 * Primitive.
 */
export class Primitive {
  vertexElements: VertexElement[] = [];
  vertexBufferBindings: VertexBufferBinding[] = [];
  indexBufferBinding: IndexBufferBinding;
  instanceCount: number;
  start: number;
  count: number;
  topology: MeshTopology;
}
