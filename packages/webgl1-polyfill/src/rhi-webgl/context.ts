import type { GLCapabilityType } from "@galacean/engine-core";
import type { WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";
type GLCapability = WebGLGraphicDevice["capability"];
type CapabilityType = GLCapabilityType;
type CapabilityTypes = typeof GLCapabilityType;

/** Adapt extension entry points and constants on the existing device context. */
export function adaptContext(capability: GLCapability, types: CapabilityTypes): void {
  const { rhi } = capability;
  patchBufferSubData(rhi.gl);
  const { gl } = rhi;
  const {
    blendMinMax,
    depthTexture,
    vertexArrayObject,
    instancedArrays,
    drawBuffers,
    textureHalfFloat,
    colorBufferHalfFloat,
    WEBGL_colorBufferFloat,
    sRGB
  } = types;
  function mapExtension(type: CapabilityType, names: Record<string, string>): void {
    const extension = rhi.requireExtension(type);
    if (!extension) return;
    const context = gl as unknown as Record<string, any>;
    for (const name in names) {
      const value = extension[names[name]];
      context[name] = typeof value === "function" ? value.bind(extension) : value;
    }
  }

  mapExtension(blendMinMax, {
    MIN: "MIN_EXT",
    MAX: "MAX_EXT"
  });
  mapExtension(depthTexture, {
    UNSIGNED_INT_24_8: "UNSIGNED_INT_24_8_WEBGL"
  });
  mapExtension(vertexArrayObject, {
    createVertexArray: "createVertexArrayOES",
    deleteVertexArray: "deleteVertexArrayOES",
    isVertexArray: "isVertexArrayOES",
    bindVertexArray: "bindVertexArrayOES"
  });
  mapExtension(instancedArrays, {
    drawArraysInstanced: "drawArraysInstancedANGLE",
    drawElementsInstanced: "drawElementsInstancedANGLE",
    vertexAttribDivisor: "vertexAttribDivisorANGLE"
  });
  mapExtension(drawBuffers, {
    MAX_DRAW_BUFFERS: "MAX_DRAW_BUFFERS_WEBGL"
  });
  const items: Record<string, string> = {};
  if (capability.canIUse(drawBuffers)) {
    const maxDrawBuffers = capability.maxDrawBuffers;
    for (let i = 0; i < maxDrawBuffers; i++) {
      i != 0 && (items[`COLOR_ATTACHMENT${i}`] = `COLOR_ATTACHMENT${i}_WEBGL`);
      items[`DRAW_BUFFER${i}`] = `DRAW_BUFFER${i}_WEBGL`;
    }
    mapExtension(drawBuffers, {
      drawBuffers: "drawBuffersWEBGL",
      ...items
    });
  }
  mapExtension(textureHalfFloat, {
    HALF_FLOAT: "HALF_FLOAT_OES"
  });
  mapExtension(colorBufferHalfFloat, {
    RGBA16F: "RGBA16F_EXT"
  });
  mapExtension(WEBGL_colorBufferFloat, {
    RGBA32F: "RGBA32F_EXT"
  });
  mapExtension(sRGB, {
    SRGB8: "SRGB_EXT",
    SRGB8_ALPHA8: "SRGB_ALPHA_EXT"
  });
}

const patchedBuffers = new WeakSet<WebGLRenderingContext>();

function patchBufferSubData(gl: WebGLRenderingContext): void {
  if (patchedBuffers.has(gl)) return;
  const bufferSubData = gl.bufferSubData;
  gl.bufferSubData = function (
    target: number,
    byteOffset: number,
    data: ArrayBuffer | ArrayBufferView | null,
    sourceOffset?: number,
    length?: number
  ): void {
    if (sourceOffset !== undefined && data && ArrayBuffer.isView(data)) {
      const elementSize = "BYTES_PER_ELEMENT" in data ? (data.BYTES_PER_ELEMENT as number) : 1;
      const sourceByteOffset = sourceOffset * elementSize;
      const byteLength = length ? length * elementSize : data.byteLength - sourceByteOffset;
      data = new Uint8Array(data.buffer, data.byteOffset + sourceByteOffset, byteLength);
    }
    bufferSubData.call(gl, target, byteOffset, data);
  };
  patchedBuffers.add(gl);
}
