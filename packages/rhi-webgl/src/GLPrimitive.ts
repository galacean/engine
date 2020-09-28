import { GLCapabilityType, Logger, Primitive } from "@alipay/o3-core";
import { PrimitiveGroup } from "@alipay/o3-core/types/graphic/PrimitiveGroup";
import { GLAsset } from "./GLAsset";
import { GLTechnique } from "./GLTechnique";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * 关于 VAO 的改进方案
 * 1）VAO WebGL2.0 一定支持，在 WebGL1.0 下亦为支持率最高的扩展之一，所以我们可以结合 VAO 的 PollyFill 直接删除非 VAO 的实现,精简代码
 * 2）VAO 目前存在隐藏 BUG , 更换 IndexBuffer、VertexBuffer、VertexElements 需要更新对应 VAO
 */

/**
 * Primtive 相关的 GL 资源管理，主要是 WebGLBuffer 对象
 * @private
 */
export class GLPrimitive extends GLAsset {
  protected readonly _primitive: Primitive;
  protected attribLocArray: number[];
  protected readonly canUseInstancedArrays: boolean;

  private vao: Map<number, WebGLVertexArrayObject> = new Map();
  private readonly _useVao: boolean;

  constructor(rhi: WebGLRenderer, primitive: Primitive) {
    super(rhi, primitive);
    this._primitive = primitive;
    this.canUseInstancedArrays = this.rhi.canIUse(GLCapabilityType.instancedArrays);
    this._useVao = rhi.canIUse(GLCapabilityType.vertexArrayObject);
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
    const attributes = primitive._vertexElementMap;

    let vbo: WebGLBuffer;
    let lastBoundVbo: WebGLBuffer;

    for (const name in techAttributes) {
      const loc = techAttributes[name].location;
      if (loc === -1) continue;

      const semantic = techAttributes[name].semantic;
      const element = attributes[semantic];
      if (element) {
        const { buffer, stride } = vertexBufferBindings[element.bindingIndex];
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
  draw(tech: GLTechnique, group: PrimitiveGroup) {
    const gl = this.rhi.gl;
    const primitive = this._primitive;

    if (this._useVao) {
      if (!this.vao.has(tech.cacheID)) {
        this.registerVAO(tech);
      }
      const vao = this.vao.get(tech.cacheID);
      gl.bindVertexArray(vao);
    } else {
      this.bindBufferAndAttrib(tech);
    }

    const { indexBufferBinding, instanceCount, _glIndexType } = primitive;
    const { topology, start, count } = group;

    if (!instanceCount) {
      if (indexBufferBinding) {
        if (this._useVao) {
          gl.drawElements(topology, count, _glIndexType, start);
        } else {
          const { _nativeBuffer } = indexBufferBinding.buffer;
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _nativeBuffer);
          gl.drawElements(topology, count, _glIndexType, start);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
      } else {
        gl.drawArrays(topology, start, count);
      }
    } else {
      if (this.canUseInstancedArrays) {
        if (indexBufferBinding) {
          if (this._useVao) {
            gl.drawElementsInstanced(topology, count, _glIndexType, start, instanceCount);
          } else {
            const { _nativeBuffer } = indexBufferBinding.buffer;
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _nativeBuffer);
            gl.drawElementsInstanced(topology, count, _glIndexType, start, instanceCount);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
          }
        } else {
          gl.drawArraysInstanced(topology, start, count, instanceCount);
        }
      } else {
        Logger.error("ANGLE_instanced_arrays extension is not supported");
      }
    }

    // unbind
    if (this._useVao) {
      gl.bindVertexArray(null);
    } else {
      this.disableAttrib();
    }
  }

  protected disableAttrib() {
    const gl = this.rhi.gl;
    for (let i = 0, l = this.attribLocArray.length; i < l; i++) {
      gl.disableVertexAttribArray(this.attribLocArray[i]);
    }
  }

  private registerVAO(tech: GLTechnique): void {
    const gl = this.rhi.gl;
    const vao = gl.createVertexArray();

    /** register VAO */
    gl.bindVertexArray(vao);

    const { indexBufferBinding } = this._primitive;
    if (indexBufferBinding) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferBinding.buffer._nativeBuffer);
    }
    this.bindBufferAndAttrib(tech);

    /** unbind */
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this.disableAttrib();

    this.vao.set(tech.cacheID, vao);
  }

  /**
   * 释放 GL 资源
   */
  finalize() {
    const primitive = this._primitive;
    const vertexBufferBindings = primitive.vertexBufferBindings;
    const indexBuffer = primitive.indexBufferBinding.buffer;

    if (vertexBufferBindings.length > 0) {
      for (let i = 0; i < vertexBufferBindings.length; i++) {
        const vertexBuffer = vertexBufferBindings[i].buffer;
        vertexBuffer.destroy();
      }
    }

    if (indexBuffer) {
      indexBuffer.destroy();
      // primitive.indexBufferBinding.buffer = null;
    }

    if (this._useVao) {
      const gl = this.rhi.gl;
      this.vao.forEach((vao) => {
        gl.deleteVertexArray(vao);
      });
    }
  }
}
