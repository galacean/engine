import { Engine } from "../Engine";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Material } from "../material";
import { ColorWriteMask, CompareFunction, RenderQueueType, StencilOperation } from "../shader";
import { DisorderedArray } from "../utils/DisorderedArray";
import { RenderContext } from "./RenderContext";
import { RenderQueue } from "./RenderQueue";
import { SubRenderElement } from "./SubRenderElement";

export class StencilManager {
  private static _stencilRenderQueue: RenderQueue;

  static getStencilRenderQueue(): RenderQueue {
    return (StencilManager._stencilRenderQueue ||= new RenderQueue(RenderQueueType.Transparent));
  }

  private _stencilWriteSubElements = new DisorderedArray<SubRenderElement>();
  private _colorWriteMasks = new DisorderedArray<ColorWriteMask>();
  private _hasSuspendStencil = false;
  private _isResuming = false;

  get hasSuspendStencil(): boolean {
    return this._hasSuspendStencil;
  }

  get isResuming(): boolean {
    return this._isResuming;
  }

  checkStencilAccess(material: Material): StencilAccess {
    const stencilState = material.renderState.stencilState;
    let stencilAccess = StencilAccess.None;

    if (stencilState.enabled) {
      const { compareFunctionFront, compareFunctionBack } = stencilState;
      if (
        (compareFunctionFront !== CompareFunction.Always && compareFunctionFront !== CompareFunction.Never) ||
        (compareFunctionBack !== CompareFunction.Always && compareFunctionBack !== CompareFunction.Never)
      ) {
        stencilAccess |= StencilAccess.Readable;
      }

      const stencilOperation = StencilOperation.Keep;
      if (
        stencilState.passOperationFront !== stencilOperation ||
        stencilState.passOperationBack !== stencilOperation ||
        stencilState.failOperationFront !== stencilOperation ||
        stencilState.failOperationBack !== stencilOperation ||
        stencilState.zFailOperationFront !== stencilOperation ||
        stencilState.zFailOperationBack !== stencilOperation
      ) {
        stencilAccess |= StencilAccess.Writable;
      }
    }

    return stencilAccess;
  }

  addStencilWriteSubElement(subElement: SubRenderElement): void {
    this._stencilWriteSubElements.add(subElement);
    this._colorWriteMasks.add(subElement.material.renderState.blendState.targetBlendState.colorWriteMask);
  }

  suspendStencil(engine: Engine): void {
    engine._hardwareRenderer.clearRenderTarget(engine, CameraClearFlags.Stencil, null);
    this._hasSuspendStencil = true;
  }

  resumeStencil(context: RenderContext, pipelineStageTagValue: string): void {
    const stencilWriteSubElements = this._stencilWriteSubElements;
    const stencilLen = stencilWriteSubElements.length;
    if (stencilLen === 0) {
      return;
    }

    this._isResuming = true;
    const stencilRenderQueue = StencilManager.getStencilRenderQueue();
    stencilRenderQueue.clear();

    for (let i = 0; i < stencilLen; ++i) {
      const subElement = stencilWriteSubElements.get(i);
      stencilRenderQueue.batchedSubElements.push(subElement);
      subElement.material.renderState.blendState.targetBlendState.colorWriteMask = ColorWriteMask.None;
    }
    stencilRenderQueue.render(context, pipelineStageTagValue);
    const colorWriteMasks = this._colorWriteMasks;
    for (let i = 0; i < stencilLen; ++i) {
      const subElement = stencilWriteSubElements.get(i);
      subElement.material.renderState.blendState.targetBlendState.colorWriteMask = colorWriteMasks.get(i);
    }

    this._hasSuspendStencil = false;
    this._isResuming = false;
  }

  clearStencil(): void {
    const { _stencilWriteSubElements: stencilWriteSubElements, _colorWriteMasks: colorWriteMasks } = this;
    stencilWriteSubElements.length = 0;
    stencilWriteSubElements.garbageCollection();
    colorWriteMasks.length = 0;
    colorWriteMasks.garbageCollection();
  }

  destroy(): void {
    this.clearStencil();
  }
}

export enum StencilAccess {
  None = 0x0,
  Writable = 0x1,
  Readable = 0x2,
  All = StencilAccess.Writable | StencilAccess.Readable
}
