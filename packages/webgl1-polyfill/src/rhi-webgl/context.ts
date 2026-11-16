import { GLCapabilityType } from "@galacean/engine-core";
import type { WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";
import { WebGL1Extension } from "./WebGL1Extension";

type GLCapability = Pick<WebGLGraphicDevice["capability"], "rhi" | "maxDrawBuffers">;

/** Adapt extension entry points and constants on the existing device context. */
export function adaptContext(capability: GLCapability): void {
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
    colorBufferFloat,
    sRGB
  } = WebGL1Extension;
  function mapExtension(type: string, names: Record<string, string>): void {
    const extension = rhi.requireExtension(type);
    if (!extension) return;
    const context = gl as unknown as Record<string, any>;
    for (const name in names) {
      const value = extension[names[name]];
      context[name] = typeof value === "function" ? value.bind(extension) : value;
    }
  }

  if (rhi.requireExtension(blendMinMax)) {
    const original = patchedBlendEquations.get(gl);
    if (original) {
      gl.blendEquation = original.blendEquation;
      gl.blendEquationSeparate = original.blendEquationSeparate;
      patchedBlendEquations.delete(gl);
    }
    mapExtension(blendMinMax, {
      MIN: "MIN_EXT",
      MAX: "MAX_EXT"
    });
  } else {
    rejectMinMaxBlend(gl);
  }
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
  if (rhi.requireExtension(drawBuffers)) {
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
  mapExtension(GLCapabilityType.colorBufferHalfFloat, {
    RGBA16F: "RGBA16F_EXT"
  });
  mapExtension(colorBufferFloat, {
    RGBA32F: "RGBA32F_EXT"
  });
  mapExtension(sRGB, {
    SRGB8: "SRGB_EXT",
    SRGB8_ALPHA8: "SRGB_ALPHA_EXT"
  });
}

const patchedBlendEquations = new WeakMap<
  WebGLRenderingContext,
  Pick<WebGLRenderingContext, "blendEquation" | "blendEquationSeparate">
>();

function rejectMinMaxBlend(gl: WebGLRenderingContext): void {
  if (patchedBlendEquations.has(gl)) return;

  const min = 0x8007;
  const max = 0x8008;
  Object.assign(gl, { MIN: min, MAX: max });
  const blendEquation = gl.blendEquation;
  const blendEquationSeparate = gl.blendEquationSeparate;
  const validate = (mode: GLenum): void => {
    if (mode === min || mode === max) {
      const operation = mode === min ? "Min" : "Max";
      throw new Error(`BlendOperation.${operation} is not supported in this context`);
    }
  };
  gl.blendEquation = (mode) => {
    validate(mode);
    blendEquation.call(gl, mode);
  };
  gl.blendEquationSeparate = (rgb, alpha) => {
    validate(rgb);
    validate(alpha);
    blendEquationSeparate.call(gl, rgb, alpha);
  };
  patchedBlendEquations.set(gl, { blendEquation, blendEquationSeparate });
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
