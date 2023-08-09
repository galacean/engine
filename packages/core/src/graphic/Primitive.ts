import { IPlatformPrimitive } from "@galacean/engine-design";
import { RenderData } from "../RenderPipeline/RenderData";
import { ShaderProgram } from "../shader/ShaderProgram";
import { IndexBufferBinding } from "./IndexBufferBinding";
import { SubPrimitive } from "./SubPrimitive";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";
import { Engine } from "../Engine";
import { BufferUtil } from "./BufferUtil";

/**
 * @internal
 * Primitive.
 */
export class Primitive {
  vertexElements: VertexElement[] = [];
  vertexBufferBindings: VertexBufferBinding[] = [];

  instanceCount: number;

  /** @internal */
  _vertexElementMap: Record<string, VertexElement> = {};
  /** @internal */
  _bufferStructChanged: boolean = false;
  /** @internal */
  _enableVAO: boolean = true;

  /** @internal */
  _glIndexType: number;
  /** @internal */
  _glIndexByteCount: number;

  private _indexBufferBinding: IndexBufferBinding;
  private _platformPrimitive: IPlatformPrimitive;

  get indexBufferBinding(): IndexBufferBinding {
    return this._indexBufferBinding;
  }

  set indexBufferBinding(value: IndexBufferBinding) {
    const lastBinding = this._indexBufferBinding;
    if (lastBinding !== value) {
      this._indexBufferBinding = value;
      if (value) {
        this._glIndexType = BufferUtil._getGLIndexType(value.format);
        this._glIndexByteCount = BufferUtil._getGLIndexByteCount(value.format);
      } else {
        this._glIndexType = undefined;
      }
      this._bufferStructChanged = lastBinding?.buffer !== value?.buffer;
    }
  }

  constructor(engine: Engine) {
    this._platformPrimitive = engine._hardwareRenderer.createPlatformPrimitive(this);
  }

  draw(shaderProgram: ShaderProgram, subMesh: SubPrimitive): void {
    this._platformPrimitive.draw(shaderProgram, subMesh);
    this._bufferStructChanged = false;
  }

  destroy(): void {
    this._platformPrimitive.destroy();
    this._vertexElementMap = null;
  }
}
