import { GLCapabilityType, Logger, type Primitive, type SubPrimitive } from "@galacean/engine-core";
import type { GLPrimitive as HostGLPrimitive } from "@galacean/engine-rhi-webgl";
import { Mixin, Overwrite, Shadow } from "@/override";

type ShaderProgram = Parameters<HostGLPrimitive["draw"]>[0];

@Mixin("GLPrimitive", function () {
  const rhi = this._primitive.engine._hardwareRenderer;
  return !rhi.canIUse(GLCapabilityType.vertexArrayObject) || !rhi.canIUse(GLCapabilityType.instancedArrays);
})
export class GLPrimitive {
  @Shadow declare _gl: WebGL2RenderingContext;
  @Shadow declare _primitive: Primitive;
  @Shadow declare _attribLocArray: number[];
  @Shadow declare _vaoMap: Map<number, WebGLVertexArrayObject | null>;
  declare _registerVAO: (shaderProgram: ShaderProgram) => void;
  declare _clearVAO: () => void;
  declare _disableAttrib: () => void;

  @Overwrite
  draw(shaderProgram: ShaderProgram, subMesh: SubPrimitive) {
    const rhi = this._primitive.engine._hardwareRenderer;
    const supportsVAO = rhi.canIUse(GLCapabilityType.vertexArrayObject);
    const supportsInstancing = rhi.canIUse(GLCapabilityType.instancedArrays);

    const gl = this._gl;
    const primitive = this._primitive;
    const useVao = supportsVAO && primitive.enableVAO;
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
          const { _glBuffer } = indexBufferBinding.buffer._platformBuffer as unknown as { _glBuffer: WebGLBuffer };
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _glBuffer);
          gl.drawElements(topology, count, _glIndexType!, start * _glIndexByteCount);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
      } else {
        gl.drawArrays(topology, start, count);
      }
    } else {
      if (supportsInstancing) {
        if (indexBufferBinding) {
          if (useVao) {
            gl.drawElementsInstanced(topology, count, _glIndexType!, start * _glIndexByteCount, instanceCount);
          } else {
            const { _glBuffer } = indexBufferBinding.buffer._platformBuffer as unknown as { _glBuffer: WebGLBuffer };
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, _glBuffer);
            gl.drawElementsInstanced(topology, count, _glIndexType!, start * _glIndexByteCount, instanceCount);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
          }
        } else {
          gl.drawArraysInstanced(topology, start, count, instanceCount);
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
  @Overwrite
  _bindBufferAndAttrib(shaderProgram: ShaderProgram) {
    const rhi = this._primitive.engine._hardwareRenderer;
    const supportsInstancing = rhi.canIUse(GLCapabilityType.instancedArrays);

    const gl = this._gl;
    const primitive = this._primitive;
    const vertexBufferBindings = primitive.vertexBufferBindings;
    this._attribLocArray.length = 0;
    const attributeLocation = shaderProgram.attributeLocation;
    const attributes = primitive._vertexElementMap;
    let vbo;
    let lastBoundVbo;
    for (const name in attributeLocation) {
      const loc = attributeLocation[name];
      if (loc === -1) continue;
      const element = attributes[name];
      if (element) {
        const { buffer, stride } = vertexBufferBindings[element.bindingIndex]!;
        vbo = (buffer._platformBuffer as unknown as { _glBuffer: WebGLBuffer })._glBuffer;
        // prevent binding the vbo which already bound at the last loop, e.g. a buffer with multiple attributes.
        if (lastBoundVbo !== vbo) {
          lastBoundVbo = vbo;
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        }
        gl.enableVertexAttribArray(loc);
        const elementInfo = element._formatMetaInfo;
        gl.vertexAttribPointer(loc, elementInfo.size, elementInfo.type, elementInfo.normalized, stride, element.offset);
        if (supportsInstancing) {
          gl.vertexAttribDivisor(loc, element.instanceStepRate);
        }
        this._attribLocArray.push(loc);
      } else {
        Logger.warn("vertex attribute not found: " + name);
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  @Overwrite
  destroy() {
    const rhi = this._primitive.engine._hardwareRenderer;
    const supportsVAO = rhi.canIUse(GLCapabilityType.vertexArrayObject);

    supportsVAO && this._clearVAO();
  }
}
