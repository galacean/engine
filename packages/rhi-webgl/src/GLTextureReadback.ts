/** WebGL2 readback owns its PBO/fence and never leaves a binding changed across a yield. */
export function readTexturePixelsAsync(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number,
  out: Uint8Array,
  destroyed: () => boolean,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer: WebGLBuffer | null = null,
      framebuffer: WebGLFramebuffer | null = null;
    let fence: WebGLSync | null = null,
      timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (fence) gl.deleteSync(fence);
      if (buffer) gl.deleteBuffer(buffer);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      error === undefined ? resolve() : reject(error);
    };
    const abort = () => finish(signal?.reason ?? new Error("Texture readback aborted"));
    if (signal?.aborted) {
      abort();
      return;
    }
    if (destroyed() || gl.isContextLost()) {
      finish(new Error("Texture or device is unavailable"));
      return;
    }
    const previousFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const previousBuffer = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
    const packNames = [gl.PACK_ALIGNMENT, gl.PACK_ROW_LENGTH, gl.PACK_SKIP_PIXELS, gl.PACK_SKIP_ROWS];
    const packValues = packNames.map((name) => gl.getParameter(name));
    try {
      buffer = gl.createBuffer();
      framebuffer = gl.createFramebuffer();
      if (!buffer || !framebuffer) throw new Error("Cannot allocate texture readback resources");
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error("Texture readback framebuffer is incomplete");
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, width * height * 4, gl.STREAM_READ);
      packNames.forEach((name, index) => gl.pixelStorei(name, index === 0 ? 1 : 0));
      // Offset overload queues a GPU-to-buffer copy. No client-memory readPixels here.
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!fence) throw new Error("Cannot create texture readback fence");
      gl.flush();
    } catch (error) {
      finish(error);
    } finally {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousFramebuffer);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previousBuffer);
      packNames.forEach((name, index) => gl.pixelStorei(name, packValues[index]));
    }
    if (settled) return;
    signal?.addEventListener("abort", abort, { once: true });
    const poll = () => {
      try {
        if (destroyed() || gl.isContextLost()) throw new Error("Texture or device was destroyed during readback");
        const state = gl.clientWaitSync(fence!, 0, 0);
        if (state === gl.TIMEOUT_EXPIRED) {
          timer = setTimeout(poll, 16);
          return;
        }
        if (state === gl.WAIT_FAILED) throw new Error("Texture readback fence failed");
        const previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
        try {
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
          gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out, 0, width * height * 4);
        } finally {
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous);
        }
        finish();
      } catch (error) {
        finish(error);
      }
    };
    // Yield before inspecting the fence; spinning here would defeat asynchronous readback.
    timer = setTimeout(poll, 0);
  });
}
