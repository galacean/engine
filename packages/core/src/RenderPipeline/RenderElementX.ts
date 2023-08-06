import { IndexBufferBinding, VertexBufferBinding } from "oasis-engine";
import { Renderer } from "../Renderer";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { Material } from "../material/Material";
import { ShaderPass } from "../shader/ShaderPass";
import { IPoolElement } from "./IPoolElement";

export class RenderElementX implements IPoolElement {
  component: Renderer;
  material: Material;
  shaderPasses: ReadonlyArray<ShaderPass>;
  geometryData: GeometryData = new GeometryData();

  dispose(): void {
    this.component = null;
    this.material = null;
    this.shaderPasses = null;
    this.geometryData = null;
  }
}

export class GeometryData {
  vertexBufferBindings: VertexBufferBinding[];
  IndexBufferBinding: IndexBufferBinding;
  instanceCount: number;
  start: number;
  count: number;
  topology: MeshTopology;
}
