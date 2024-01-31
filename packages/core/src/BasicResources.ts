import { Engine } from "./Engine";
import { Buffer } from "./graphic/Buffer";
import { VertexElement } from "./graphic/VertexElement";
import { BufferBindFlag } from "./graphic/enums/BufferBindFlag";
import { BufferUsage } from "./graphic/enums/BufferUsage";
import { MeshTopology } from "./graphic/enums/MeshTopology";
import { VertexElementFormat } from "./graphic/enums/VertexElementFormat";
import { Material } from "./material";
import { ModelMesh } from "./mesh";
import { Shader } from "./shader/Shader";

/**
 * @internal
 */
export class BasicResources {
  readonly blitMesh: ModelMesh;
  readonly blitMaterial: Material;

  constructor(engine: Engine) {
    // prettier-ignore
    const vertices = new Float32Array([
      -1, -1, 0, 0, // left-bottom
      1, -1, 1, 0,  // right-bottom
      -1, 1, 0, 1,  // left-top
      1, 1, 1, 1]); // right-top

    const mesh = new ModelMesh(engine);
    mesh._addReferCount(1);
    mesh.setVertexElements([new VertexElement("POSITION_UV", 0, VertexElementFormat.Vector4, 0)]);
    mesh.setVertexBufferBinding(new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static), 16);
    mesh.addSubMesh(0, 4, MeshTopology.TriangleStrip);

    this.blitMesh = mesh;
    this.blitMaterial = new Material(engine, Shader.find("blit"));
  }
}
