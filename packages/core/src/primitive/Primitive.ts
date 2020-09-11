import { AssetObject } from "../asset/AssetObject";
import { DrawMode } from "../base/Constant";
import { BoundingSphere } from "../bounding-info/BoudingSphere";
import { OBB } from "../bounding-info/OBB";
import { IndexBuffer, VertexElements, VertexElement } from "../geometry";
import { VertexBufferBinding } from "../geometry/graphic/VertexBufferBinding";

// TODO Destroy VAO and Buffer，ref to rhi refactor

let primitiveID = 0;

/**
 * primitive(triangles, lines) data, vbo+indices, equal glTF meshes.primitives define
 * @private
 */
export class Primitive extends AssetObject {
  readonly id: number;
  mode: DrawMode = DrawMode.TRIANGLES;
  vertexAttributes: VertexElements = {};

  vertexElements: VertexElement[] = [];
  vertexOffset: number = 0;
  vertexCount: number = 0;

  indexBuffer: IndexBuffer;
  indexOffset: number = 0;
  indexCount: number = 0;

  material = null;
  materialIndex: number;
  targets: any[] = [];
  boundingBox: OBB = null;
  boundingSphere: BoundingSphere = null;
  isInFrustum: boolean = true;

  isInstanced: boolean = false;
  instancedCount: number;

  private _vertexBufferBindings: VertexBufferBinding[] = [];

  get attributes() {
    return this.vertexAttributes;
  }

  get vertexBufferBindings(): Readonly<VertexBufferBinding[]> {
    return this._vertexBufferBindings;
  }

  constructor(name?: string) {
    super();
    this.id = primitiveID++;
    this.name = name;
  }

  addVertexBuffer(vertexBufferBinding: VertexBufferBinding): void {
    this._vertexBufferBindings.push(vertexBufferBinding);
  }

  addVertexElement(element: VertexElement): void {
    const { semantic, instanceDivisor } = element;
    this.vertexAttributes[semantic] = element;
    this.vertexElements.push(element);
    if (instanceDivisor) {
      this.isInstanced = true;
    }
  }

  updateWeightsIndices(indices: number[]) {
    if (this.targets.length !== indices.length || indices.length === 0) {
      return;
    }
    for (let i = 0; i < indices.length; i++) {
      const currentIndex = indices[i];
      Object.keys(this.targets[i]).forEach((key: string) => {
        const semantic = this.targets[i][key].name;
        const index = this.targets[currentIndex][key].vertexBufferIndex;
        // this.updateAttribBufferIndex(semantic, index);
      });
    }
  }

  // updateAttribBufferIndex(semantic: string, index: number) {
  //   this.vertexAttributes[semantic].vertexBufferIndex = index;
  // }

  destroy() {}

  reset() {
    this.mode = DrawMode.TRIANGLES;
    this.vertexAttributes = {};
    this._vertexBufferBindings = [];
    this.vertexCount = 0;

    this.indexBuffer = null;
    this.indexOffset = 0;
    this.indexCount = 0;

    this.material = null;
    this.materialIndex = null;
    this.targets = [];
    this.boundingBox = null;
    this.boundingSphere = null;
    this.isInFrustum = true;

    this.isInstanced = false;
    this.instancedCount = null;
  }
}
