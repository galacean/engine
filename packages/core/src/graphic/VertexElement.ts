import { BufferUtil, ElementInfo } from "./BufferUtil";
import { VertexElementFormat } from "./enums/VertexElementFormat";

/**
 * Vertex element.
 */
export class VertexElement {
  _glElementInfo: ElementInfo;

  /** Vertex data byte offset. */
  offset: number;

  private _semantic: string;

  private _format: VertexElementFormat;
  private _bindingIndex: number;
  private _instanceStepRate: number;

  /**
   * Vertex semantic.
   */
  get semantic(): string {
    return this._semantic;
  }

  /**
   * Vertex data format.
   */
  get format(): VertexElementFormat {
    return this._format;
  }

  /**
   * Vertex buffer binding index.
   */
  get bindingIndex(): number {
    return this._bindingIndex;
  }

  /**
   * Instance cadence, the number of instances drawn for each vertex in the buffer, non-instance elements must be 0.
   */
  get instanceStepRate(): number {
    return this._instanceStepRate;
  }

  /**
   * Create vertex element.
   * @param semantic - Input vertex semantic
   * @param offset - Vertex data byte offset
   * @param format - Vertex data format
   * @param bindingIndex - Vertex buffer binding index
   * @param instanceStepRate - Instance cadence, the number of instances drawn for each vertex in the buffer, non-instance elements must be 0.
   */
  constructor(
    semantic: string,
    offset: number,
    format: VertexElementFormat,
    bindingIndex: number,
    instanceStepRate: number = 0
  ) {
    this._semantic = semantic;
    this.offset = offset;
    this._format = format;
    this._bindingIndex = bindingIndex;
    this._glElementInfo = BufferUtil._getElementInfo(this.format);
    this._instanceStepRate = Math.floor(instanceStepRate);
  }
}
