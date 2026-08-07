import { GLBufferReadback } from "../../../packages/rhi-webgl/src/GLBufferReadback";
import { describe, expect, it, vi } from "vitest";

function createGL() {
  const sync = {};
  return {
    COPY_READ_BUFFER: 1,
    COPY_WRITE_BUFFER: 2,
    STREAM_READ: 3,
    SYNC_GPU_COMMANDS_COMPLETE: 4,
    ALREADY_SIGNALED: 5,
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    copyBufferSubData: vi.fn(),
    fenceSync: vi.fn(() => sync),
    clientWaitSync: vi.fn(() => 5),
    getBufferSubData: vi.fn(),
    deleteSync: vi.fn()
  };
}

describe("GLBufferReadback", () => {
  it("orphans storage once immediately before a reset readback is reused", () => {
    const gl = createGL();
    const readback = new GLBufferReadback(gl as any, 16);
    const source = { _glBuffer: {} } as any;

    readback.copyFromBuffer(source, 0, 0, 8);
    readback.submit();
    readback.reset();

    expect(gl.bufferData).toHaveBeenCalledTimes(1);

    readback.copyFromBuffer(source, 8, 0, 8);
    readback.copyFromBuffer(source, 0, 8, 8);

    expect(gl.bufferData).toHaveBeenCalledTimes(2);
    expect(gl.bufferData).toHaveBeenLastCalledWith(gl.COPY_WRITE_BUFFER, 16, gl.STREAM_READ);
  });

  it("reuses read storage after completed data is consumed", () => {
    const gl = createGL();
    const readback = new GLBufferReadback(gl as any, 16);
    const source = { _glBuffer: {} } as any;

    readback.copyFromBuffer(source, 0, 0, 8);
    readback.submit();
    readback.getData(new Uint8Array(8));
    readback.reset();
    readback.copyFromBuffer(source, 0, 0, 8);

    expect(gl.bufferData).toHaveBeenCalledTimes(1);
  });
});
