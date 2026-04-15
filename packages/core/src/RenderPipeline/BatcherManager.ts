import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { InstanceBatch } from "./InstanceBatch";
import { PrimitiveChunkManager } from "./PrimitiveChunkManager";
import { RenderQueue } from "./RenderQueue";
import { RenderElement } from "./RenderElement";

/**
 * @internal
 */
export class BatcherManager {
  private _primitiveChunkManager2D: PrimitiveChunkManager;
  private _primitiveChunkManagerMask: PrimitiveChunkManager;
  private _primitiveChunkManagerUI: PrimitiveChunkManager;
  private _instanceBatch: InstanceBatch;

  constructor(public engine: Engine) {}

  get instanceBatch(): InstanceBatch {
    return (this._instanceBatch ||= new InstanceBatch(this.engine));
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
    if (this._instanceBatch) {
      this._instanceBatch.destroy();
      this._instanceBatch = null;
    }
  }

  batch(renderQueue: RenderQueue): void {
    const { elements, batchedElements } = renderQueue;

    let preElement: RenderElement;
    let preRenderer: Renderer;
    let preConstructor: Function;
    for (let i = 0, n = elements.length; i < n; ++i) {
      const curElement = elements[i];
      const renderer = curElement.component;
      const constructor = renderer.constructor;
      if (preElement) {
        if (preConstructor === constructor && preRenderer._canBatch(preElement, curElement)) {
          preRenderer._batch(preElement, curElement);
          preElement.batched = true;
        } else {
          batchedElements.push(preElement);
          preElement = curElement;
          preRenderer = renderer;
          preConstructor = constructor;
          renderer._batch(null, curElement);
          curElement.batched = false;
        }
      } else {
        preElement = curElement;
        preRenderer = renderer;
        preConstructor = constructor;
        renderer._batch(null, curElement);
        curElement.batched = false;
      }
    }
    preElement && batchedElements.push(preElement);
  }

  uploadBuffer() {
    this._primitiveChunkManager2D?.uploadBuffer();
    this._primitiveChunkManagerMask?.uploadBuffer();
    this._primitiveChunkManagerUI?.uploadBuffer();
  }
}
