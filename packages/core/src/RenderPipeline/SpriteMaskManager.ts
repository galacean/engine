import { SpriteMask, SpriteMaskInteraction, SpriteRenderer } from "../2d";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { Buffer, BufferBindFlag, BufferUsage, IndexFormat, VertexElement, VertexElementFormat } from "../graphic";
import { BufferMesh } from "../mesh";

export class SpriteMaskManager {
  private static _instance: SpriteMaskManager = null;
  static get instance(): SpriteMaskManager {
    if (!SpriteMaskManager._instance) {
      SpriteMaskManager._instance = new SpriteMaskManager();
    }

    return SpriteMaskManager._instance;
  }

  private _masks: DisorderedArray<SpriteMask> = new DisorderedArray();
  private _mesh: BufferMesh = null;
  private _vertexBuffer: Buffer = null;
  private _indiceBuffer: Buffer = null;

  init(engine: Engine) {
    const mesh = this._mesh = new BufferMesh(engine, `SpriteMaskMesh`);

    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0)
    ];
    const vertexStride = 20;

    // vertices
    this._vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      16 * vertexStride,
      BufferUsage.Dynamic
    );
    // indices
    this._indiceBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      12,
      BufferUsage.Dynamic
    );
    mesh.setVertexBufferBinding(this._vertexBuffer, vertexStride);
    mesh.setIndexBufferBinding(this._indiceBuffer, IndexFormat.UInt16);
    mesh.setVertexElements(vertexElements);
  }

  addMask(mask: SpriteMask): void {
    this._masks.add(mask);
  }

  removeMask(mask: SpriteMask): void {
    this._masks.delete(mask);
  }

  preRender(renderer: SpriteRenderer): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return ;
    }
  }

  postRender(renderer: SpriteRenderer): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return ;
    }
  }
}
