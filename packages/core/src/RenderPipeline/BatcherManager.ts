import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { InstanceBuffer } from "./InstanceBuffer";
import { PrimitiveChunkManager } from "./PrimitiveChunkManager";
import { RenderElement } from "./RenderElement";

/**
 * @internal
 */
export class BatcherManager {
  private _primitiveChunkManager2D: PrimitiveChunkManager;
  private _primitiveChunkManagerMask: PrimitiveChunkManager;
  private _primitiveChunkManagerUI: PrimitiveChunkManager;
  private _instanceBuffer: InstanceBuffer;

  constructor(public engine: Engine) {}

  get instanceBuffer(): InstanceBuffer {
    return (this._instanceBuffer ||= new InstanceBuffer(this.engine));
  }

  get primitiveChunkManager2D(): PrimitiveChunkManager {
    return (this._primitiveChunkManager2D ||= new PrimitiveChunkManager(this.engine));
  }

  get primitiveChunkManagerMask(): PrimitiveChunkManager {
    return (this._primitiveChunkManagerMask ||= new PrimitiveChunkManager(this.engine, 128));
  }

  get primitiveChunkManagerUI(): PrimitiveChunkManager {
    return (this._primitiveChunkManagerUI ||= new PrimitiveChunkManager(this.engine));
  }

  destroy() {
    if (this._primitiveChunkManager2D) {
      this._primitiveChunkManager2D.destroy();
      this._primitiveChunkManager2D = null;
    }
    if (this._primitiveChunkManagerMask) {
      this._primitiveChunkManagerMask.destroy();
      this._primitiveChunkManagerMask = null;
    }
    if (this._primitiveChunkManagerUI) {
      this._primitiveChunkManagerUI.destroy();
      this._primitiveChunkManagerUI = null;
    }
    if (this._instanceBuffer) {
      this._instanceBuffer.destroy();
      this._instanceBuffer = null;
    }
  }

  batch(input: RenderElement[], output: RenderElement[]): void {
    let preElement: RenderElement;
    let preRenderer: Renderer;
    let preConstructor: Function;
    for (let i = 0, n = input.length; i < n; ++i) {
      const curElement = input[i];
      const renderer = curElement.component;
      const constructor = renderer.constructor;
      if (preElement) {
        if (preConstructor === constructor && preRenderer._canBatch(preElement, curElement)) {
          preRenderer._batch(preElement, curElement);
        } else {
          preElement._isBatched = true;
          output.push(preElement);
          preElement = curElement;
          preRenderer = renderer;
          preConstructor = constructor;
          renderer._batch(null, curElement);
        }
      } else {
        preElement = curElement;
        preRenderer = renderer;
        preConstructor = constructor;
        renderer._batch(null, curElement);
      }
    }
    if (preElement) {
      preElement._isBatched = true;
      output.push(preElement);
    }
  }

  uploadBuffer() {
    this._primitiveChunkManager2D?.uploadBuffer();
    this._primitiveChunkManagerMask?.uploadBuffer();
    this._primitiveChunkManagerUI?.uploadBuffer();
  }
}
