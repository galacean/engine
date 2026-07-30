import { WebGLEngine } from "@galacean/engine";
import { ParticleBufferUtils } from "@galacean/engine-core/src/particle/ParticleBufferUtils";
import { ParticleTrajectoryReadback } from "@galacean/engine-core/src/particle/ParticleTrajectoryReadback";
import { beforeAll, describe, expect, it, vi } from "vitest";

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

function createCommand() {
  return {
    ringIndex: 0,
    target: { _renderer: { destroyed: true } },
    resolveTrajectory: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn()
  };
}

describe("ParticleTrajectoryReadback", () => {
  let engine: WebGLEngine;
  let simulator: any;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    simulator = {
      vertexStride: ParticleBufferUtils.feedbackTrajectoryStateVertexStride,
      readBinding: { buffer: { _platformBuffer: {} } }
    };
  });

  function createReadback(): ParticleTrajectoryReadback {
    return new ParticleTrajectoryReadback({ _renderer: { engine, _particleSystemManager: null } } as any);
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
      readback.submit(simulator);
    } catch (caughtError) {
      error = caughtError as Error;
    }
    readback.destroy();
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
      readback.submit(simulator);
    } catch (caughtError) {
      error = caughtError as Error;
    }
    readback.destroy();
    createPlatformBufferReadback.mockRestore();

    expect(error?.message).to.equal("submit failed");
    expect(command.release).toHaveBeenCalledTimes(1);
    expect(platformReadback.reset).toHaveBeenCalledTimes(1);
    expect(platformReadback.destroy).toHaveBeenCalledTimes(1);
  });

  it("retains only the latest completed staging buffer as a spare", () => {
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
      readback.submit(simulator);
    }

    readback.process();
    const destroyCountsBeforeTeardown = platformReadbacks.map(
      (platformReadback) => platformReadback.destroy.mock.calls.length
    );
    readback.destroy();
    createPlatformBufferReadback.mockRestore();

    expect(commands.every((command) => command.release.mock.calls.length === 1)).to.equal(true);
    expect(destroyCountsBeforeTeardown).to.deep.equal([1, 1, 0]);
    expect(platformReadbacks[2].destroy).toHaveBeenCalledTimes(1);
  });
});
