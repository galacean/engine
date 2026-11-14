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
    const vertexBuffer = this._vertexBuffer;
    const indices = mesh.accessible ? mesh.getIndices() : null;
    let generated: PrimitiveMeshBuilder | undefined;
    // Only regenerate owned buffers; readable data includes changes made after creation
    for (const binding of mesh.vertexBufferBindings) {
      const buffer = binding?.buffer;
      if (!buffer) {
        continue;
      }
      if (buffer.readable) {
        buffer.setData(buffer.data!);
      } else if (buffer === vertexBuffer) {
        generated ??= this._generateData();
        buffer.setData(generated.vertices);
      } else if (buffer === this._tangentBuffer) {
        generated ??= this._generateData();
        const vertexData = vertexBuffer.readable ? vertexBuffer.data : null;
        const vertices = vertexData
          ? new Float32Array(vertexData.buffer, vertexData.byteOffset, vertexBuffer.byteLength / 4)
          : generated.vertices;
        buffer.setData(MeshTangentUtils.calculateTangentsFromBuffer(vertices, indices ?? generated.indices));
      }
    }
    const indexBuffer = mesh._primitive.indexBufferBinding?._buffer;
    if (indexBuffer) {
      if (indices) {
        indexBuffer.setData(indices);
      } else if (indexBuffer === this._indexBuffer) {
        generated ??= this._generateData();
        indexBuffer.setData(generated.indices);
      }
    }
  }

  private _generateData(): PrimitiveMeshBuilder {
    const data = this._generate(...this._args);
    data.trim();
    return data;
  }
}
