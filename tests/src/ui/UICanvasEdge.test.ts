import { Camera } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Image, UICanvas } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

// Adversarial edge cases for the enable-order change (claim-before-broadcast).
// These assert observable outcomes only, so they must pass under BOTH the
// successor-threaded implementation and the reordered implementation.
describe("UICanvasEdge", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  const cameraEntity = root.createChild("camera");
  cameraEntity.addComponent(Camera);

  it("enabler nested under an existing root keeps descendants on the higher root", () => {
    const aEntity = root.createChild("a");
    const canvasA = aEntity.addComponent(UICanvas); // existing higher root
    const bEntity = aEntity.createChild("b");
    const cEntity = bEntity.createChild("c");
    const canvasC = cEntity.addComponent(UICanvas); // nested under A while B has no canvas

    // @ts-ignore
    expect(canvasC._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(canvasC._getRootCanvas()).to.eq(canvasA);

    // Enable a canvas between A and C — it cannot become root, C must stay on A
    const canvasB = bEntity.addComponent(UICanvas);
    // @ts-ignore
    expect(canvasB._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(canvasC._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(canvasC._getRootCanvas()).to.eq(canvasA);

    aEntity.destroy();
  });

  it("disabling the outer root promotes the inner canvas back and re-homes elements", () => {
    const outerEntity = root.createChild("outer");
    const innerEntity = outerEntity.createChild("inner");
    const innerCanvas = innerEntity.addComponent(UICanvas);
    const imageEntity = innerEntity.createChild("image");
    const image = imageEntity.addComponent(Image);
    // @ts-ignore
    innerCanvas._getRenderers();
    // @ts-ignore
    expect(image._getRootCanvas()).to.eq(innerCanvas);

    const outerCanvas = outerEntity.addComponent(UICanvas);
    // @ts-ignore
    expect(outerCanvas._isRootCanvas).to.be.true;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.false;

    // Demote the outer root — the inner canvas must reclaim root status
    outerCanvas.enabled = false;
    // @ts-ignore
    expect(outerCanvas._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.true;
    // @ts-ignore
    innerCanvas._getRenderers();
    // @ts-ignore
    expect(image._getRootCanvas()).to.eq(innerCanvas);

    outerEntity.destroy();
  });

  it("survives a disable/enable round-trip of the outer root", () => {
    const outerEntity = root.createChild("outer");
    const innerEntity = outerEntity.createChild("inner");
    const innerCanvas = innerEntity.addComponent(UICanvas);

    const outerCanvas = outerEntity.addComponent(UICanvas);
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.false;

    outerCanvas.enabled = false;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.true;

    outerCanvas.enabled = true;
    // @ts-ignore
    expect(outerCanvas._isRootCanvas).to.be.true;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(innerCanvas._getRootCanvas()).to.eq(outerCanvas);

    outerEntity.destroy();
  });
});
