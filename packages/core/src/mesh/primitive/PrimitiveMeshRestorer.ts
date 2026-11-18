import { ContentRestorer } from "../../asset/ContentRestorer";
import { Buffer } from "../../graphic/Buffer";
import { ModelMesh } from "../ModelMesh";
import { MeshTangentUtils } from "../MeshTangentUtils";
import { PrimitiveMeshBuilder } from "./PrimitiveMeshBuilder";

/**
 * @internal
 */
export class PrimitiveMeshRestorer<T extends unknown[]> extends ContentRestorer<ModelMesh> {
  private _vertexBuffer: Buffer;
  private _tangentBuffer: Buffer | undefined;
  private _indexBuffer: Buffer;

  constructor(
    mesh: ModelMesh,
    private _generate: (...args: T) => PrimitiveMeshBuilder,
    private _args: T
  ) {
    super(mesh);
    this._vertexBuffer = mesh.vertexBufferBindings[0]!.buffer;
    this._tangentBuffer = mesh.vertexBufferBindings[1]?.buffer;
    this._indexBuffer = mesh._primitive.indexBufferBinding!._buffer;
  }

  override restoreContent(): void {
    const mesh = this.resource;
    const data = this._generate(...this._args);
    data.trim();
    for (const binding of mesh.vertexBufferBindings) {
      const buffer = binding?.buffer;
      if (!buffer) {
        continue;
      }
      if (buffer === this._vertexBuffer) {
        buffer.setData(data.vertices);
      } else if (buffer === this._tangentBuffer) {
        buffer.setData(MeshTangentUtils.calculateTangentsFromBuffer(data.vertices, data.indices));
      }
    }
    const indexBuffer = mesh._primitive.indexBufferBinding?._buffer;
    if (indexBuffer === this._indexBuffer) {
      indexBuffer.setData(data.indices);
    }
  }
}
