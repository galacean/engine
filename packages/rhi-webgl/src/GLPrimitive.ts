import { IPlatformPrimitive, IPlatformShaderProgram, Logger, Primitive, SubPrimitive } from "@galacean/engine-core";
import { GLBuffer } from "./GLBuffer";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * @internal
 * GL platform primitive.
 */
export class GLPrimitive implements IPlatformPrimitive {
  private _attribLocArray: number[] = [];
  private readonly _primitive: Primitive;

  private _gl: WebGL2RenderingContext;
  private _vaoMap: Map<number, WebGLVertexArrayObject | null> = new Map();

  constructor(rhi: WebGLGraphicDevice, primitive: Primitive) {
    this._primitive = primitive;
    this._gl = rhi.gl;
  }

  /**
   * Draw the primitive.
   */
  draw(shaderProgram: IPlatformShaderProgram, subMesh: SubPrimitive): void {
    const gl = this._gl;
    const primitive = this._primitive;
    const useVao = primitive.enableVAO;

    if (useVao) {
      if (primitive._bufferStructChanged) {
        this._clearVAO();
      }
      if (!this._vaoMap.has(shaderProgram.id)) {
        this._registerVAO(shaderProgram);
      }
      const vao = this._vaoMap.get(shaderProgram.id)!;
      gl.bindVertexArray(vao);
    } else {
      this._bindBufferAndAttrib(shaderProgram);
    }

    const { indexBufferBinding, instanceCount, _glIndexType, _glIndexByteCount } = primitive;
    const { topology, start, count } = subMesh;

    if (!instanceCount) {
      if (indexBufferBinding) {
        if (useVao) {
          gl.drawElements(topology, count, _glIndexType!, start * _glIndexByteCount);
        } else {
          const { _glBuffer } = <GLBuffer>indexBufferBinding.buffer._platformBuffer;
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _glBuffer);
          gl.drawElements(topology, count, _glIndexType!, start * _glIndexByteCount);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
      } else {
        gl.drawArrays(topology, start, count);
      }
    } else {
      if (indexBufferBinding) {
        if (useVao) {
          gl.drawElementsInstanced(topology, count, _glIndexType!, start * _glIndexByteCount, instanceCount);
        } else {
          const { _glBuffer } = <GLBuffer>indexBufferBinding.buffer._platformBuffer;
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _glBuffer);
          gl.drawElementsInstanced(topology, count, _glIndexType!, start * _glIndexByteCount, instanceCount);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
      } else {
        gl.drawArraysInstanced(topology, start, count, instanceCount);
      }
    }

    // Unbind
    if (useVao) {
      gl.bindVertexArray(null);
    } else {
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
        gl.vertexAttribPointer(loc, elementInfo.size, elementInfo.type, elementInfo.normalized, stride, element.offset);
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

  private _registerVAO(shaderProgram: IPlatformShaderProgram): void {
    const gl = this._gl;
    const vao = gl.createVertexArray();

    /** register VAO */
    gl.bindVertexArray(vao);

    const { indexBufferBinding } = this._primitive;
    if (indexBufferBinding) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, (<GLBuffer>indexBufferBinding.buffer._platformBuffer)._glBuffer);
    }
    this._bindBufferAndAttrib(shaderProgram);

    /** unbind */
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this._disableAttrib();

    this._vaoMap.set(shaderProgram.id, vao);
  }

  private _clearVAO(): void {
    const gl = this._gl;
    this._vaoMap.forEach((vao) => {
      gl.deleteVertexArray(vao);
    });
    this._vaoMap.clear();
  }
}
