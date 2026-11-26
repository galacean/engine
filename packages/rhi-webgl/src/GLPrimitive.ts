import {
  IPlatformPrimitive,
  IPlatformShaderProgram,
  Logger,
  Primitive,
  SubPrimitive,
  VertexElementFormat
} from "@galacean/engine-core";
import type { GLPrimitiveFormats } from "./GLPrimitiveFormats";
import { GLBuffer } from "./GLBuffer";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * @internal
 * GL platform primitive.
 */
export class GLPrimitive implements IPlatformPrimitive {
  private _attribLocArray: number[] = [];
  private readonly _primitive: Primitive;

  private readonly _rhi: WebGLGraphicDevice;
  private readonly _gl: WebGL2RenderingContext;
  private readonly _formats: GLPrimitiveFormats;
  private _vaoMap: Map<number, WebGLVertexArrayObject | null> = new Map();

  constructor(rhi: WebGLGraphicDevice, primitive: Primitive) {
    this._rhi = rhi;
    this._primitive = primitive;
    this._gl = rhi.gl;
    this._formats = rhi._primitiveFormats;
  }

  /**
   * Draw the primitive.
   */
  draw(shaderProgram: IPlatformShaderProgram, subMesh: SubPrimitive): void {
    const gl = this._gl;
    const rhi = this._rhi;
    const primitive = this._primitive;
    const useVao = primitive.enableVAO;

    if (useVao) {
      if (primitive._bufferStructChanged) {
        this._clearVAO();
      }
      const vaoKey = shaderProgram.id * 16 + primitive._vaoSlotKey;
      let vao = this._vaoMap.get(vaoKey);
      if (vao === undefined) {
        vao = this._registerVAO(shaderProgram, vaoKey);
      }
      rhi._bindVertexArray(vao);
    } else {
      rhi._bindVertexArray(null);
      this._bindBufferAndAttrib(shaderProgram);
    }

    const { indexBufferBinding, instanceCount } = primitive;
    const { start, count } = subMesh;
    const topology = this._formats.topology[subMesh.topology];
    if (indexBufferBinding) {
      const { type, bytes } = this._formats.index[indexBufferBinding.format];
      if (!useVao) {
        const buffer = indexBufferBinding.buffer._platformBuffer as GLBuffer;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer._glBuffer);
      }
      if (instanceCount) gl.drawElementsInstanced(topology, count, type, start * bytes, instanceCount);
      else gl.drawElements(topology, count, type, start * bytes);
      if (!useVao) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    } else if (instanceCount) {
      gl.drawArraysInstanced(topology, start, count, instanceCount);
    } else {
      gl.drawArrays(topology, start, count);
    }

    // Non-VAO path leaves attribute arrays enabled; VAO stays cached on rhi until changed or unbound.
    if (!useVao) {
      this._disableAttrib();
    }
  }

  destroy(): void {
    this._clearVAO();
  }

  /**
   * Bind buffer and attribute.
   */
  private _bindBufferAndAttrib(shaderProgram: IPlatformShaderProgram): void {
    const gl = this._gl;
    const primitive = this._primitive;
    const vertexBufferBindings = primitive.vertexBufferBindings;

    this._attribLocArray.length = 0;
    const attributeLocation = shaderProgram.attributeLocation;
    const attributes = primitive._vertexElementMap;

    let vbo: WebGLBuffer | null;
    let lastBoundVbo: WebGLBuffer | null | undefined;

    for (const name in attributeLocation) {
      const loc = attributeLocation[name];
      if (loc === -1) continue;

      const element = attributes[name];
      if (element) {
        const { buffer, stride } = vertexBufferBindings[element.bindingIndex]!;
        vbo = (<GLBuffer>buffer._platformBuffer)._glBuffer;
        // prevent binding the vbo which already bound at the last loop, e.g. a buffer with multiple attributes.
        if (lastBoundVbo !== vbo) {
          lastBoundVbo = vbo;
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        }

        gl.enableVertexAttribArray(loc);
        const elementInfo = element._formatMetaInfo;
        const type = this._formats.vertexType[elementInfo.type];
        if (elementInfo.integer || element.format === VertexElementFormat.UInt4) {
          gl.vertexAttribIPointer(loc, elementInfo.size, type, stride, element.offset);
        } else {
          gl.vertexAttribPointer(loc, elementInfo.size, type, elementInfo.normalized, stride, element.offset);
        }
        gl.vertexAttribDivisor(loc, element.instanceStepRate);
        this._attribLocArray.push(loc);
      } else {
        Logger.warn("vertex attribute not found: " + name);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private _disableAttrib() {
    const gl = this._gl;
    for (let i = 0, l = this._attribLocArray.length; i < l; i++) {
      gl.disableVertexAttribArray(this._attribLocArray[i]);
    }
  }

  private _registerVAO(shaderProgram: IPlatformShaderProgram, vaoKey: number): WebGLVertexArrayObject | null {
    const gl = this._gl;
    const rhi = this._rhi;
    const vao = gl.createVertexArray();

    /** register VAO */
    rhi._bindVertexArray(vao);

    const { indexBufferBinding } = this._primitive;
    if (indexBufferBinding) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, (<GLBuffer>indexBufferBinding.buffer._platformBuffer)._glBuffer);
    }
    this._bindBufferAndAttrib(shaderProgram);

    /** unbind */
    rhi._bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this._disableAttrib();

    this._vaoMap.set(vaoKey, vao);
    return vao;
  }

  private _clearVAO(): void {
    const gl = this._gl;
    const rhi = this._rhi;
    this._vaoMap.forEach((vao) => {
      if (rhi._currentBindVAO === vao) {
        rhi._bindVertexArray(null);
      }
      gl.deleteVertexArray(vao);
    });
    this._vaoMap.clear();
  }
}
