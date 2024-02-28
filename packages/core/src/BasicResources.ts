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
  readonly flipYBlitMesh: ModelMesh;
  readonly blitMaterial: Material;

  constructor(engine: Engine) {
    // prettier-ignore
    const vertices = new Float32Array([
      -1, -1, 0, 1, // left-bottom
      1, -1, 1, 1,  // right-bottom
      -1, 1, 0, 0,  // left-top
      1, 1, 1, 0]); // right-top

    // prettier-ignore
    const flipYVertices = new Float32Array([
      1, -1, 1, 0,  // right-bottom
      -1, -1, 0, 0, // left-bottom
      1, 1, 1, 1,   // right-top
      -1, 1, 0, 1]); // left-top

    const blitMaterial = new Material(engine, Shader.find("blit"));
    blitMaterial.renderState.depthState.enabled = false;
    blitMaterial.renderState.depthState.writeEnabled = false;

    this.blitMesh = this._createBlitMesh(engine, vertices);
    this.flipYBlitMesh = this._createBlitMesh(engine, flipYVertices);
    this.blitMaterial = blitMaterial;
  }

  private _createBlitMesh(engine: Engine, vertices: Float32Array): ModelMesh {
    const mesh = new ModelMesh(engine);
    mesh._addReferCount(1);
    mesh.setVertexElements([new VertexElement("POSITION_UV", 0, VertexElementFormat.Vector4, 0)]);
    mesh.setVertexBufferBinding(new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static), 16);
    mesh.addSubMesh(0, 4, MeshTopology.TriangleStrip);
    return mesh;
  }
}
