import { AnimationClip, AnimatorController, AssetPromise, AssetType, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let engine: WebGLEngine;

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});

afterAll(() => {
  engine.destroy();
});

describe("AnimatorControllerLoader", () => {
  it("constructs AnimatorController atomically after clips load and skips instantiation on cancel", async () => {
    const resourceManager = engine.resourceManager;
    const ctrlUrl = "mock/anim/hero.animCtrl";
    const cancelUrl = "mock/anim/canceled.animCtrl";
    let resolveClip!: (clip: AnimationClip) => void;
    let resolveCancelClip!: (clip: AnimationClip) => void;

    const schema = {
      layers: [
        {
          name: "base",
          blendingMode: 0,
          weight: 1,
          stateMachine: {
            states: [
              {
                id: "s0",
                name: "idle",
                speed: 1,
                wrapMode: 1,
                clipStartNormalizedTime: 0,
                clipEndNormalizedTime: 1,
                clip: { url: "mock/anim/idle.anim" },
                scripts: [],
                transitions: []
              }
            ],
            transitions: [],
            entryTransitions: [],
            anyTransitions: []
          }
        }
      ],
      parameters: [
        { name: "triggerA", isTrigger: true, defaultValue: false },
        { name: "speed", isTrigger: false, defaultValue: 1.5 }
      ]
    };

    const requestSpy = vi.spyOn(resourceManager as any, "_requestByRemoteUrl").mockImplementation((url: string) => {
      if (url === ctrlUrl || url === cancelUrl) {
        return AssetPromise.resolve(schema);
      }
      return AssetPromise.reject(new Error(`Unexpected request: ${url}`));
    });

    let clipCall = 0;
    const refSpy = vi.spyOn(resourceManager, "getResourceByRef").mockImplementation(() => {
      clipCall++;
      return new AssetPromise<AnimationClip>((resolve) => {
        if (clipCall === 1) {
          resolveClip = resolve;
        } else {
          resolveCancelClip = resolve;
        }
      });
    });

    try {
      const countBefore = resourceManager.findResourcesByType(AnimatorController).length;
      const pending = resourceManager.load<AnimatorController>({ url: ctrlUrl, type: AssetType.AnimatorController });
      await Promise.resolve();
      await Promise.resolve();

      // Half-loaded AnimatorController must not be instantiated or exposed before clips finish
      expect(resourceManager.findResourcesByType(AnimatorController).length).to.equal(countBefore);

      const clip = new AnimationClip("idle");
      resolveClip(clip);
      const controller = await pending;
      expect(controller.destroyed).to.be.false;
      expect(resourceManager.findResourcesByType(AnimatorController)).to.include(controller);
      expect(controller.layers[0].stateMachine.states[0].clip).to.equal(clip);
      expect(controller.getParameter("triggerA")?._isTrigger).to.be.true;
      expect(controller.getParameter("speed")?.defaultValue).to.equal(1.5);

      // Canceling while clip is pending must not instantiate an AnimatorController when clip later settles
      const countAfterLoad = resourceManager.findResourcesByType(AnimatorController).length;
      const canceledTask = resourceManager.load<AnimatorController>({
        url: cancelUrl,
        type: AssetType.AnimatorController
      });
      await Promise.resolve();
      await Promise.resolve();
      const cancelResult = canceledTask.catch((e) => e);
      canceledTask.cancel();
      expect(await cancelResult).to.equal("canceled");

      resolveCancelClip(new AnimationClip("late"));
      await Promise.resolve();
      await Promise.resolve();
      expect(resourceManager.findResourcesByType(AnimatorController).length).to.equal(countAfterLoad);

      // Canceling while JSON config request is still pending must cancel request and skip construction
      let resolvePendingJson!: (data: any) => void;
      const pendingJsonUrl = "mock/anim/pending-json.animCtrl";
      requestSpy.mockImplementationOnce(
        () =>
          new AssetPromise((resolve) => {
            resolvePendingJson = resolve;
          })
      );
      const earlyCanceled = resourceManager.load<AnimatorController>({
        url: pendingJsonUrl,
        type: AssetType.AnimatorController
      });
      const earlyResult = earlyCanceled.catch((e) => e);
      earlyCanceled.cancel();
      expect(await earlyResult).to.equal("canceled");
      resolvePendingJson(schema);
      await Promise.resolve();
      expect(resourceManager.findResourcesByType(AnimatorController).length).to.equal(countAfterLoad);

      controller.destroy();
      resourceManager.gc();
    } finally {
      requestSpy.mockRestore();
      refSpy.mockRestore();
    }
  });
});
