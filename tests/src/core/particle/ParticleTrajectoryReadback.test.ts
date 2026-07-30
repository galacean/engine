import { WebGLEngine } from "@galacean/engine";
import { ParticleBufferUtils } from "@galacean/engine-core/src/particle/ParticleBufferUtils";
import { ParticleTrajectoryReadback } from "@galacean/engine-core/src/particle/ParticleTrajectoryReadback";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

function createPlatformReadback() {
  return {
    copyFromBuffer: vi.fn(),
    submit: vi.fn(),
    isReady: vi.fn(() => true),
    getData: vi.fn(),
    reset: vi.fn(),
    destroy: vi.fn()
  };
}

function createCommand(ringIndex = 0) {
  return {
    ringIndex,
    target: { _renderer: { destroyed: true } },
    resolveTrajectory: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn()
  };
}

describe("ParticleTrajectoryReadback", () => {
  let engine: WebGLEngine;
  let source: any;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    source = {
      stride: ParticleBufferUtils.feedbackTrajectoryStateVertexStride,
      buffer: { _platformBuffer: {} }
    };
  });

  afterEach(() => {
    gcReadbackPool();
  });

  function createReadback(): ParticleTrajectoryReadback {
    return new ParticleTrajectoryReadback({ _renderer: { engine, _particleSystemManager: null } } as any);
  }

  function gcReadbackPool(): void {
    (engine as any)._bufferReadbackPool.gc();
  }

  it("keeps a failed platform allocation owned until teardown", () => {
    const graphicResources = (engine.resourceManager as any)._graphicResourcePool;
    const resourceCount = Object.keys(graphicResources).length;
    const createPlatformBufferReadback = vi
      .spyOn((engine as any)._hardwareRenderer, "createPlatformBufferReadback")
      .mockImplementation(() => {
        throw new Error("platform allocation failed");
      });
    const readback = createReadback();
    const command = createCommand();
    readback.getPendingCommands(0, 1).push(command as any);

    let error: Error | undefined;
    try {
      readback.submitPending(source);
    } catch (caughtError) {
      error = caughtError as Error;
    }
    readback.destroy();
    gcReadbackPool();
    createPlatformBufferReadback.mockRestore();

    expect(error?.message).to.equal("platform allocation failed");
    expect(command.release).toHaveBeenCalledTimes(1);
    expect(Object.keys(graphicResources)).to.have.length(resourceCount);
  });

  it("keeps a failed submission owned until teardown", () => {
    const platformReadback = createPlatformReadback();
    platformReadback.submit.mockImplementation(() => {
      throw new Error("submit failed");
    });
    const createPlatformBufferReadback = vi
      .spyOn((engine as any)._hardwareRenderer, "createPlatformBufferReadback")
      .mockReturnValue(platformReadback);
    const readback = createReadback();
    const command = createCommand();
    readback.getPendingCommands(0, 1).push(command as any);

    let error: Error | undefined;
    try {
      readback.submitPending(source);
    } catch (caughtError) {
      error = caughtError as Error;
    }
    readback.destroy();
    gcReadbackPool();
    createPlatformBufferReadback.mockRestore();

    expect(error?.message).to.equal("submit failed");
    expect(command.release).toHaveBeenCalledTimes(1);
    expect(platformReadback.reset).toHaveBeenCalledTimes(1);
    expect(platformReadback.destroy).toHaveBeenCalledTimes(1);
  });

  it("reuses staging buffers after multiple readbacks complete together", () => {
    const platformReadbacks: ReturnType<typeof createPlatformReadback>[] = [];
    const createPlatformBufferReadback = vi
      .spyOn((engine as any)._hardwareRenderer, "createPlatformBufferReadback")
      .mockImplementation(() => {
        const platformReadback = createPlatformReadback();
        platformReadbacks.push(platformReadback);
        return platformReadback;
      });
    const readback = createReadback();
    const commands = [];
    for (let i = 0; i < 3; i++) {
      const command = createCommand();
      commands.push(command);
      readback.getPendingCommands(0, 1).push(command as any);
      readback.submitPending(source);
    }

    readback.processReady();
    readback.destroy();

    const nextReadback = createReadback();
    for (let i = 0; i < 3; i++) {
      nextReadback.getPendingCommands(0, 1).push(createCommand() as any);
      nextReadback.submitPending(source);
    }

    expect(platformReadbacks).to.have.length(3);
    expect(platformReadbacks.every((platformReadback) => platformReadback.destroy.mock.calls.length === 0)).to.equal(
      true
    );

    nextReadback.processReady();
    nextReadback.destroy();
    gcReadbackPool();
    createPlatformBufferReadback.mockRestore();

    expect(commands.every((command) => command.release.mock.calls.length === 1)).to.equal(true);
    expect(platformReadbacks.every((platformReadback) => platformReadback.destroy.mock.calls.length === 1)).to.equal(
      true
    );
  });

  it("reuses the smallest sufficient staging buffer", () => {
    const platformReadbacks: ReturnType<typeof createPlatformReadback>[] = [];
    const createPlatformBufferReadback = vi
      .spyOn((engine as any)._hardwareRenderer, "createPlatformBufferReadback")
      .mockImplementation(() => {
        const platformReadback = createPlatformReadback();
        platformReadbacks.push(platformReadback);
        return platformReadback;
      });
    const readback = createReadback();
    readback.getPendingCommands(0, 2).push(createCommand(0) as any);
    readback.submitPending(source);
    readback.getPendingCommands(0, 2).push(createCommand(0) as any, createCommand(1) as any);
    readback.submitPending(source);
    readback.processReady();
    readback.destroy();

    const nextReadback = createReadback();
    nextReadback.getPendingCommands(0, 2).push(createCommand(0) as any);
    nextReadback.submitPending(source);

    expect(platformReadbacks).to.have.length(2);
    expect(platformReadbacks[0].submit).toHaveBeenCalledTimes(2);
    expect(platformReadbacks[1].submit).toHaveBeenCalledTimes(1);

    nextReadback.processReady();
    nextReadback.destroy();
    gcReadbackPool();
    createPlatformBufferReadback.mockRestore();

    expect(platformReadbacks.every((platformReadback) => platformReadback.destroy.mock.calls.length === 1)).to.equal(
      true
    );
  });

  it("replaces an undersized idle staging buffer when capacity grows", () => {
    const platformReadbacks: ReturnType<typeof createPlatformReadback>[] = [];
    const createPlatformBufferReadback = vi
      .spyOn((engine as any)._hardwareRenderer, "createPlatformBufferReadback")
      .mockImplementation(() => {
        const platformReadback = createPlatformReadback();
        platformReadbacks.push(platformReadback);
        return platformReadback;
      });
    const readback = createReadback();
    readback.getPendingCommands(0, 2).push(createCommand(0) as any);
    readback.submitPending(source);
    readback.processReady();
    readback.destroy();

    const nextReadback = createReadback();
    nextReadback.getPendingCommands(0, 2).push(createCommand(0) as any, createCommand(1) as any);
    nextReadback.submitPending(source);

    expect(platformReadbacks).to.have.length(2);
    expect(platformReadbacks[0].destroy).toHaveBeenCalledTimes(1);
    expect(platformReadbacks[1].destroy).toHaveBeenCalledTimes(0);

    nextReadback.processReady();
    nextReadback.destroy();
    gcReadbackPool();
    createPlatformBufferReadback.mockRestore();

    expect(platformReadbacks[1].destroy).toHaveBeenCalledTimes(1);
  });

  it("releases only idle staging buffers during resource garbage collection", () => {
    const platformReadback = createPlatformReadback();
    const createPlatformBufferReadback = vi
      .spyOn((engine as any)._hardwareRenderer, "createPlatformBufferReadback")
      .mockReturnValue(platformReadback);
    const readback = createReadback();
    readback.getPendingCommands(0, 1).push(createCommand() as any);
    readback.submitPending(source);

    engine.resourceManager.gc();
    expect(platformReadback.destroy).toHaveBeenCalledTimes(0);

    readback.processReady();
    readback.destroy();
    engine.resourceManager.gc();
    createPlatformBufferReadback.mockRestore();

    expect(platformReadback.destroy).toHaveBeenCalledTimes(1);
  });
});
