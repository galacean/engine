import { GLCapabilityType, Logger, Mesh, SubMesh } from "@galacean/engine-core";
import { IPlatformPrimitive } from "@galacean/engine-design";
import { WebGLExtension } from "./type";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * Improvement of VAO:
 * 1) WebGL2.0 must support VAO, almost all devices support vao extensions in webgl1.0, we can use PollyFill,only keep VAO mode.
 */

/**
 * @internal
 * GL platform primitive.
 */
export class GLPrimitive implements IPlatformPrimitive {
  private _attribLocArray: number[] = [];
  private readonly _primitive: Mesh;
  private readonly _canUseInstancedArrays: boolean;

  private _gl: (WebGLRenderingContext & WebGLExtension) | WebGL2RenderingContext;
  private _vaoMap: Map<number, WebGLVertexArrayObject> = new Map();
  private readonly _useVao: boolean;

  constructor(rhi: WebGLGraphicDevice, primitive: Mesh) {
    this._primitive = primitive;
    this._canUseInstancedArrays = rhi.canIUse(GLCapabilityType.instancedArrays);
    this._useVao = rhi.canIUse(GLCapabilityType.vertexArrayObject);
    this._gl = rhi.gl;
  }

  /**
   * Draw the primitive.
   */
  draw(shaderProgram: any, subMesh: SubMesh): void {
    const gl = this._gl;
    const primitive = this._primitive;
    // @ts-ignore
    const useVao = this._useVao && primitive._enableVAO;

    if (useVao) {
      // @ts-ignore
      if (primitive._bufferStructChanged) {
        this._clearVAO();
      }
      if (!this._vaoMap.has(shaderProgram.id)) {
        this._registerVAO(shaderProgram);
      }
      const vao = this._vaoMap.get(shaderProgram.id);
      gl.bindVertexArray(vao);
    } else {
      this._bindBufferAndAttrib(shaderProgram);
    }

    // @ts-ignore
    const { _indexBufferBinding, _instanceCount, _glIndexType, _glIndexByteCount } = primitive;
    const { topology, start, count } = subMesh;

    if (!_instanceCount) {
      if (_indexBufferBinding) {
        if (useVao) {
          gl.drawElements(topology, count, _glIndexType, start * _glIndexByteCount);
        } else {
          const { _glBuffer } = _indexBufferBinding.buffer._platformBuffer;
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _glBuffer);
          gl.drawElements(topology, count, _glIndexType, start * _glIndexByteCount);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
      } else {
        gl.drawArrays(topology, start, count);
      }
    } else {
      if (this._canUseInstancedArrays) {
        if (_indexBufferBinding) {
          if (useVao) {
            gl.drawElementsInstanced(topology, count, _glIndexType, start * _glIndexByteCount, _instanceCount);
          } else {
            const { _glBuffer } = _indexBufferBinding.buffer._platformBuffer;
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _glBuffer);
            gl.drawElementsInstanced(topology, count, _glIndexType, start * _glIndexByteCount, _instanceCount);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
          }
        } else {
          gl.drawArraysInstanced(topology, start, count, _instanceCount);
        }
      } else {
        Logger.error("ANGLE_instanced_arrays extension is not supported");
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
    this._useVao && this._clearVAO();
  }

  /**
   * Bind buffer and attribute.
   */
  private _bindBufferAndAttrib(shaderProgram: any): void {
    const gl = this._gl;
    const primitive = this._primitive;
    // @ts-ignore
    const vertexBufferBindings = primitive._vertexBufferBindings;

    this._attribLocArray.length = 0;
    const attributeLocation = shaderProgram.attributeLocation;
    // @ts-ignore
    const attributes = primitive._vertexElementMap;

    let vbo: WebGLBuffer;
    let lastBoundVbo: WebGLBuffer;

    for (const name in attributeLocation) {
      const loc = attributeLocation[name];
      if (loc === -1) continue;

      const element = attributes[name];
      if (element) {
        const { buffer, stride } = vertexBufferBindings[element.bindingIndex];
        vbo = buffer._platformBuffer._glBuffer;
        // prevent binding the vbo which already bound at the last loop, e.g. a buffer with multiple attributes.
        if (lastBoundVbo !== vbo) {
          lastBoundVbo = vbo;
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        }

        gl.enableVertexAttribArray(loc);
        const elementInfo = element._glElementInfo;
        gl.vertexAttribPointer(loc, elementInfo.size, elementInfo.type, elementInfo.normalized, stride, element.offset);
        if (this._canUseInstancedArrays) {
          gl.vertexAttribDivisor(loc, element.instanceStepRate);
        }
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

  private _registerVAO(shaderProgram: any): void {
    const gl = this._gl;
    const vao = gl.createVertexArray();

    /** register VAO */
    gl.bindVertexArray(vao);

    // @ts-ignore
    const { _indexBufferBinding } = this._primitive;
    if (_indexBufferBinding) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _indexBufferBinding.buffer._platformBuffer._glBuffer);
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
