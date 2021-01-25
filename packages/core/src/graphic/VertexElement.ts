import { VertexElementFormat } from "./enums/VertexElementFormat";
import { ElementInfo, BufferUtil } from "./BufferUtil";

/**
 * Vertex element.
 */
export class VertexElement {
  public readonly normalized = false;

  _glElementInfo: ElementInfo;

  private _semantic: string;
  private _offset: number;
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
   * Vertex data byte offset.
   */
  get offset(): number {
    return this._offset;
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
    this._offset = offset;
    this._format = format;
    this._bindingIndex = bindingIndex;
    this._glElementInfo = BufferUtil._getElementInfo(this.format);
    this._instanceStepRate = Math.floor(instanceStepRate);
  }

  /**
   * @deprecated
   */
  get elementInfo(): ElementInfo {
    return this._glElementInfo;
  }
}
