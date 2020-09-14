import { GLCapabilityType, Logger, Primitive } from "@alipay/o3-core";
import { GLAsset } from "./GLAsset";
import { GLTechnique } from "./GLTechnique";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * Primtive 相关的 GL 资源管理，主要是 WebGLBuffer 对象
 * @private
 */
export class GLPrimitive extends GLAsset {
  protected readonly _primitive: Primitive;
  protected attribLocArray: number[];
  protected readonly canUseInstancedArrays: boolean;

  constructor(rhi: WebGLRenderer, primitive: Primitive) {
    super(rhi, primitive);
    this._primitive = primitive;
    this.canUseInstancedArrays = this.rhi.canIUse(GLCapabilityType.instancedArrays);
  }

  /**
   * 绑定 Buffer 和 attribute
   */
  protected bindBufferAndAttrib(tech: GLTechnique) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;
    const vertexBufferBindings = primitive.vertexBufferBindings;

    this.attribLocArray = [];
    const techAttributes = tech.attributes;
    const attributes = primitive.attributes;

    let vbo: WebGLBuffer;
    let lastBoundVbo: WebGLBuffer;

    for (const name in techAttributes) {
      const loc = techAttributes[name].location;
      if (loc === -1) continue;

      const semantic = techAttributes[name].semantic;
      const element = attributes[semantic];
      if (element) {
        const { buffer, stride } = vertexBufferBindings[element.vertexBufferIndex];
        vbo = buffer._nativeBuffer;
        // prevent binding the vbo which already bound at the last loop, e.g. a buffer with multiple attributes.
        if (lastBoundVbo !== vbo) {
          lastBoundVbo = vbo;
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        }

        gl.enableVertexAttribArray(loc);
        const { size, type } = element._glElementInfo;
        gl.vertexAttribPointer(loc, size, type, element.normalized, stride, element.offset);
        if (this.canUseInstancedArrays) {
          gl.vertexAttribDivisor(loc, element.instanceDivisor);
        }
        this.attribLocArray.push(loc);
      } else {
        Logger.warn("vertex attribute not found: " + name);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * 执行绘制操作。
   */
  draw(tech: GLTechnique) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;

    // 绑定 Buffer 和 attribute
    this.bindBufferAndAttrib(tech);

    // draw
    const {
      primitiveTopology,
      indexBufferBinding,
      drawOffset,
      drawCount,
      vertexCount,
      instancedCount,
      _glIndexType
    } = primitive;
    const indexBuffer = indexBufferBinding.buffer;
    const { _nativeBuffer } = indexBuffer;
    if (!instancedCount) {
      if (indexBuffer) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _nativeBuffer);
        gl.drawElements(primitiveTopology, drawCount, _glIndexType, drawOffset);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      } else {
        gl.drawArrays(primitiveTopology, drawOffset, vertexCount);
      }
    } else {
      if (this.canUseInstancedArrays) {
        if (indexBuffer) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _nativeBuffer);
          gl.drawElementsInstanced(primitiveTopology, drawCount, _glIndexType, drawOffset, instancedCount);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        } else {
          gl.drawArraysInstanced(primitiveTopology, drawOffset, vertexCount, instancedCount);
        }
      } else {
        Logger.error("ANGLE_instanced_arrays extension is not supported");
      }
    }

    /** unbind */
    this.disableAttrib();
  }

  protected disableAttrib() {
    const gl = this.rhi.gl;
    for (let i = 0, l = this.attribLocArray.length; i < l; i++) {
      gl.disableVertexAttribArray(this.attribLocArray[i]);
    }
  }

  /**
   * 释放 GL 资源
   */
  finalize() {
    const primitive = this._primitive;
    const vertexBufferBindings = primitive.vertexBufferBindings;
    const indexBuffer = primitive.indexBuffer;

    if (vertexBufferBindings.length > 0) {
      for (let i = 0; i < vertexBufferBindings.length; i++) {
        const vertexBuffer = vertexBufferBindings[i].vertexBuffer;
        vertexBuffer.destroy();
      }
    }

    if (indexBuffer) {
      indexBuffer.destroy();
      primitive.indexBuffer = null;
    }
  }
}
