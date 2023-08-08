import { IPlatformPrimitive } from "@galacean/engine-design";
import { RenderData } from "../RenderPipeline/RenderData";
import { ShaderProgram } from "../shader/ShaderProgram";
import { IndexBufferBinding } from "./IndexBufferBinding";
import { SubPrimitive } from "./SubPrimitive";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";
import { Engine } from "../Engine";

/**
 * @internal
 * Primitive.
 */
export class Primitive extends RenderData {
  vertexElements: VertexElement[] = [];
  vertexBufferBindings: VertexBufferBinding[] = [];
  indexBufferBinding: IndexBufferBinding;
  instanceCount: number;

  /** @internal */
  _vertexElementMap: Record<string, VertexElement> = {};
  /** @internal */
  _bufferStructChanged: boolean;
  /** @internal */
  _enableVAO: boolean = true;
  
  /** @internal */
  _glIndexType: number;
  /** @internal */
  _glIndexByteCount: number;

  private _platformPrimitive: IPlatformPrimitive;

  constructor(engine: Engine) {
    super();
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
