import { GLRenderHardware } from "./GLRenderHardware";
import { GLCapabilityType, Logger } from "@alipay/o3-base";

export class GLBufferRenderer {
  private readonly _rhi: GLRenderHardware;
  constructor(rhi: GLRenderHardware) {
    this._rhi = rhi;
  }

  get rhi() {
    return this._rhi;
  }

  render(primitive, indexBuffer) {
    const gl = this.rhi.gl;
    if (indexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.drawElements(primitive.mode, primitive.indexCount, primitive.indexType, primitive.indexOffset);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    } else {
      gl.drawArrays(primitive.mode, primitive.vertexOffset, primitive.vertexCount);
    }
  }

  renderInstances(primitive, indexBuffer) {
    const gl = this.rhi.gl;
    if (this.rhi.canIUse(GLCapabilityType.instancedArrays)) {
      if (indexBuffer) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.drawElementsInstanced(
          primitive.mode,
          primitive.indexCount,
          primitive.indexType,
          primitive.indexOffset,
          primitive.instancedCount
        );
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      } else {
        gl.drawArraysInstanced(primitive.mode, primitive.vertexOffset, primitive.vertexCount, primitive.instancedCount);
      }
    } else {
      Logger.error("ANGLE_instanced_arrays extension is not supported");
    }
  }
}
