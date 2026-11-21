import { Camera } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Image, UICanvas } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

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

  it("disabling or destroying outer root over 3-level nested canvases keeps single root", () => {
    const outerEntity = root.createChild("outer");
    const midEntity = outerEntity.createChild("mid");
    const midCanvas = midEntity.addComponent(UICanvas);
    const innerEntity = midEntity.createChild("inner");
    const innerCanvas = innerEntity.addComponent(UICanvas);
    const imageEntity = innerEntity.createChild("image");
    const image = imageEntity.addComponent(Image);

    // Enable outerCanvas above mid -> inner; innerCanvas enters outer._disorderedElements before midCanvas.
    const outerCanvas = outerEntity.addComponent(UICanvas);
    // @ts-ignore
    expect(outerCanvas._isRootCanvas).to.be.true;
    // @ts-ignore
    expect(midCanvas._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.false;

    // Disable outerCanvas: only midCanvas should become root, innerCanvas must re-root to midCanvas.
    outerCanvas.enabled = false;
    // @ts-ignore
    expect(outerCanvas._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(midCanvas._isRootCanvas).to.be.true;
    // @ts-ignore
    expect(midCanvas._getRootCanvas()).to.be.null;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(innerCanvas._getRootCanvas()).to.eq(midCanvas);
    // @ts-ignore
    midCanvas._getRenderers();
    // @ts-ignore
    expect(image._getRootCanvas()).to.eq(midCanvas);

    // Round-trip re-enable then destroy outerCanvas.
    outerCanvas.enabled = true;
    // @ts-ignore
    expect(outerCanvas._isRootCanvas).to.be.true;
    // @ts-ignore
    expect(midCanvas._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.false;

    outerCanvas.destroy();
    // @ts-ignore
    expect(midCanvas._isRootCanvas).to.be.true;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(innerCanvas._getRootCanvas()).to.eq(midCanvas);

    outerEntity.destroy();
  });

  it("disabling outer root after swap-remove reorders _disorderedElements keeps single root", () => {
    const outerEntity = root.createChild("outer");
    const outerCanvas = outerEntity.addComponent(UICanvas);
    const spacerEntity = outerEntity.createChild("spacer");
    const spacer = spacerEntity.addComponent(Image);
    // Collect spacer into outerCanvas._disorderedElements[0] before mid & inner.
    // @ts-ignore
    outerCanvas._getRenderers();

    const midEntity = outerEntity.createChild("mid");
    const midCanvas = midEntity.addComponent(UICanvas);
    const innerEntity = midEntity.createChild("inner");
    const innerCanvas = innerEntity.addComponent(UICanvas);

    // Disabling spacer swaps the last element (innerCanvas) into index 0 before midCanvas.
    spacer.enabled = false;
    outerCanvas.enabled = false;

    // @ts-ignore
    expect(midCanvas._isRootCanvas).to.be.true;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(innerCanvas._getRootCanvas()).to.eq(midCanvas);

    outerEntity.destroy();
  });

  it("reparenting a nested-canvas subtree out of a root canvas promotes only the highest canvas", () => {
    const outerEntity = root.createChild("outer");
    const outerCanvas = outerEntity.addComponent(UICanvas);
    const wrapperEntity = outerEntity.createChild("wrapper");
    const midEntity = wrapperEntity.createChild("mid");
    const midCanvas = midEntity.addComponent(UICanvas);
    const innerEntity = midEntity.createChild("inner");
    const innerCanvas = innerEntity.addComponent(UICanvas);

    // @ts-ignore
    expect(midCanvas._getRootCanvas()).to.eq(outerCanvas);
    // @ts-ignore
    expect(innerCanvas._getRootCanvas()).to.eq(outerCanvas);

    // UpdateFlagManager dispatches listeners in reverse order (inner before mid).
    wrapperEntity.parent = root;
    // @ts-ignore
    expect(midCanvas._isRootCanvas).to.be.true;
    // @ts-ignore
    expect(midCanvas._getRootCanvas()).to.be.null;
    // @ts-ignore
    expect(innerCanvas._isRootCanvas).to.be.false;
    // @ts-ignore
    expect(innerCanvas._getRootCanvas()).to.eq(midCanvas);

    wrapperEntity.destroy();
    outerEntity.destroy();
  });

  it("unregisters listeners from dropped ancestor entities when listening chain shrinks", () => {
    const outerEntity = root.createChild("outer");
    const midEntity = outerEntity.createChild("mid");
    const midCanvas = midEntity.addComponent(UICanvas);
    const imageEntity = midEntity.createChild("image");
    const image = imageEntity.addComponent(Image);

    // While midCanvas is root, it listens on [outer, root].
    // @ts-ignore
    expect(root._modifyFlagManager._listeners).to.include(midCanvas._rootCanvasListener);

    // Enabling outerCanvas shrinks midCanvas's listening chain to [outer], dropping root.
    const outerCanvas = outerEntity.addComponent(UICanvas);
    // @ts-ignore
    expect(root._modifyFlagManager._listeners).to.not.include(midCanvas._rootCanvasListener);

    // Image collected under outerCanvas listens on [image, mid, outer].
    // @ts-ignore
    outerCanvas._getRenderers();
    // @ts-ignore
    expect(outerEntity._modifyFlagManager._listeners).to.include(image._rootCanvasListener);
    // @ts-ignore
    expect(outerEntity._modifyFlagManager._listeners).to.include(image._groupListener);

    // Disabling outerCanvas and re-homing image to midCanvas shrinks its chain to [image, mid], dropping outer.
    outerCanvas.enabled = false;
    // @ts-ignore
    midCanvas._getRenderers();
    // @ts-ignore
    expect(outerEntity._modifyFlagManager._listeners).to.not.include(image._rootCanvasListener);
    // @ts-ignore
    expect(outerEntity._modifyFlagManager._listeners).to.not.include(image._groupListener);

    outerEntity.destroy();
  });
});
