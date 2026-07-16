import { Camera, Entity, Ray, Texture2D, Vector3, WebGLEngine } from "@galacean/engine";
import { getSpineRuntime, SpineAnimationRenderer, SpineResource } from "@galacean/engine-spine";
import "@galacean/engine-spine-core-4.2";
import { CanvasRenderMode, RectMask2D, UICanvas, UIGroup, UITransform } from "@galacean/engine-ui";
import { beforeAll, describe, expect, it } from "vitest";

// Legacy-format atlas text (also parsed by the 4.2 parser): one 4x4 page with one region.
const ATLAS_TEXT = `
page.png
size: 4,4
format: RGBA8888
filter: Linear,Linear
repeat: none
region
  rotate: false
  xy: 0, 0
  size: 4, 4
  orig: 4, 4
  offset: 0, 0
  index: -1
`;

const SKELETON_JSON = JSON.stringify({
  skeleton: { spine: "4.2.0" },
  bones: [{ name: "root" }],
  slots: [{ name: "slot0", bone: "root", attachment: "region" }],
  skins: [{ name: "default", attachments: { slot0: { region: { width: 4, height: 4 } } } }],
  animations: { idle: {} }
});

function createSpineResource(engine: WebGLEngine): SpineResource {
  const runtime = getSpineRuntime();
  const texture = new Texture2D(engine, 4, 4);
  const atlas = runtime.createTextureAtlas(ATLAS_TEXT, [texture]);
  const skeletonData = runtime.createSkeletonData(SKELETON_JSON, atlas, 1);
  return new SpineResource(engine, skeletonData, "test.json");
}

function pump(engine: WebGLEngine, times = 2): void {
  for (let i = 0; i < times; i++) {
    engine.update();
  }
}

describe("SpineAnimationRenderer inside UICanvas", () => {
  let engine: WebGLEngine;
  let rootEntity: Entity;
  let camera: Camera;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const scene = engine.sceneManager.scenes[0];
    rootEntity = scene.createRootEntity("root");
    const cameraEntity = rootEntity.createChild("camera");
    camera = cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 20);
  });

  function createCanvas(renderMode: CanvasRenderMode): { canvasEntity: Entity; canvas: UICanvas } {
    const canvasEntity = rootEntity.createChild("canvas");
    const canvas = canvasEntity.addComponent(UICanvas);
    canvas.renderMode = renderMode;
    if (renderMode === CanvasRenderMode.ScreenSpaceCamera) {
      canvas.renderCamera = camera;
    }
    return { canvasEntity, canvas };
  }

  function worldRendererCount(): number {
    // @ts-ignore
    return engine.sceneManager.scenes[0]._componentsManager._renderers.length;
  }

  it("is collected by a world-space canvas and pushes one render element per sub-primitive", () => {
    const { canvasEntity, canvas } = createCanvas(CanvasRenderMode.WorldSpace);
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    renderer.state.setAnimation(0, "idle", true);
    pump(engine);

    const renderElements = (canvas as any)._renderElements;
    expect(renderElements.length).to.equal(1);
    expect(renderElements[0].component).to.equal(renderer);
    expect(renderElements[0].primitive).to.equal((renderer as any)._primitive);
    expect(renderElements[0].subShader).to.not.be.undefined;
    canvasEntity.destroy();
  });

  it("does not join the camera pipeline's renderer list while hosted", () => {
    const before = worldRendererCount();
    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    const spineEntity = canvasEntity.createChild("spine");
    spineEntity.addComponent(SpineAnimationRenderer);
    expect(worldRendererCount()).to.equal(before);
    canvasEntity.destroy();
  });

  it("renders through the camera pipeline when not under a canvas", () => {
    const before = worldRendererCount();
    const spineEntity = rootEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    expect(worldRendererCount()).to.equal(before + 1);
    expect((renderer as any).globalAlpha).to.equal(1);
    spineEntity.destroy();
    expect(worldRendererCount()).to.equal(before);
  });

  it("renders in the screen-space overlay pass with subShader assigned", () => {
    const { canvasEntity, canvas } = createCanvas(CanvasRenderMode.ScreenSpaceOverlay);
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    pump(engine);

    const renderElements = (canvas as any)._renderElements;
    expect(renderElements.length).to.equal(1);
    expect(renderElements[0].component).to.equal(renderer);
    expect(renderElements[0].subShader).to.equal(renderElements[0].material.shader.subShaders[0]);
    canvasEntity.destroy();
  });

  it("re-homes between world and canvas hosting when reparented", () => {
    const before = worldRendererCount();
    const { canvasEntity, canvas } = createCanvas(CanvasRenderMode.WorldSpace);
    const spineEntity = rootEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    // World-hosted at first: registered in the camera pipeline.
    expect(worldRendererCount()).to.equal(before + 1);
    pump(engine);
    expect((canvas as any)._renderElements.length).to.equal(0);

    // Move under the canvas: leaves the camera pipeline, collected by the canvas.
    canvasEntity.addChild(spineEntity);
    expect(worldRendererCount()).to.equal(before);
    pump(engine);
    expect((canvas as any)._renderElements.length).to.equal(1);
    expect((canvas as any)._renderElements[0].component).to.equal(renderer);

    // Move back out: joins the camera pipeline again, canvas stops collecting it.
    rootEntity.addChild(spineEntity);
    expect(worldRendererCount()).to.equal(before + 1);
    pump(engine);
    expect((canvas as any)._renderElements.length).to.equal(0);

    spineEntity.destroy();
    canvasEntity.destroy();
  });

  it("folds UIGroup alpha into vertex colors on every rebuild", () => {
    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    const group = canvasEntity.addComponent(UIGroup);
    group.alpha = 0.5;
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    pump(engine);

    // Vertex layout without tintBlack: [x, y, z, r, g, b, a, u, v] — alpha at float 6.
    const vertices = (renderer as any)._vertices as Float32Array;
    expect(vertices[6]).to.be.closeTo(0.5, 1e-5);
    // Straight alpha keeps rgb unscaled.
    expect(vertices[3]).to.be.closeTo(1, 1e-5);

    // Alpha is re-applied every frame because vertices fully rebuild.
    group.alpha = 0.25;
    pump(engine, 1);
    expect(vertices[6]).to.be.closeTo(0.25, 1e-5);
    canvasEntity.destroy();
  });

  it("premultiplies group alpha into rgb when premultipliedAlpha is enabled", () => {
    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    const group = canvasEntity.addComponent(UIGroup);
    group.alpha = 0.5;
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.premultipliedAlpha = true;
    renderer.resource = createSpineResource(engine);
    pump(engine);

    const vertices = (renderer as any)._vertices as Float32Array;
    expect(vertices[6]).to.be.closeTo(0.5, 1e-5);
    expect(vertices[3]).to.be.closeTo(0.5, 1e-5);
    canvasEntity.destroy();
  });

  it("skips pushing render elements when the group alpha is 0", () => {
    const { canvasEntity, canvas } = createCanvas(CanvasRenderMode.WorldSpace);
    const group = canvasEntity.addComponent(UIGroup);
    group.alpha = 0;
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    pump(engine);

    expect((canvas as any)._renderElements.length).to.equal(0);
    canvasEntity.destroy();
  });

  it("toggles the rect-clip shader macro with hosting", () => {
    const spineEntity = rootEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    const isMacroEnabled = () =>
      // @ts-ignore
      renderer.shaderData._macroCollection.isEnable(
        // @ts-ignore
        (SpineAnimationRenderer as any)._uiRectClipMacro
      );
    expect(isMacroEnabled()).to.be.false;

    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    canvasEntity.addChild(spineEntity);
    expect(isMacroEnabled()).to.be.true;

    rootEntity.addChild(spineEntity);
    expect(isMacroEnabled()).to.be.false;

    spineEntity.destroy();
    canvasEntity.destroy();
  });

  it("receives rect masks from the canvas walk and enables the clip state", () => {
    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    const maskEntity = canvasEntity.createChild("mask");
    maskEntity.addComponent(RectMask2D);
    const spineEntity = maskEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    pump(engine);

    expect((renderer as any)._rectMasks.length).to.equal(1);
    expect(renderer.shaderData.getFloat("renderer_UIRectClipEnabled")).to.equal(1);
    canvasEntity.destroy();
  });

  it("hit-tests against the skeleton world bounds when raycastEnabled", () => {
    const { canvasEntity, canvas } = createCanvas(CanvasRenderMode.WorldSpace);
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    pump(engine);

    const out = {
      entity: null,
      distance: 0,
      point: new Vector3(),
      normal: new Vector3(),
      component: null
    };
    // The 4x4 region attachment centered at the origin: a ray down +z at (0,0) hits it.
    const hitRay = new Ray(new Vector3(0, 0, 10), new Vector3(0, 0, -1));
    const missRay = new Ray(new Vector3(100, 100, 10), new Vector3(0, 0, -1));

    expect((canvas as any)._raycast(hitRay, out)).to.be.false;
    renderer.raycastEnabled = true;
    expect((canvas as any)._raycast(hitRay, out)).to.be.true;
    expect(out.component).to.equal(renderer);
    expect((canvas as any)._raycast(missRay, out)).to.be.false;
    canvasEntity.destroy();
  });

  it("computes bounds from the skeleton for canvas culling", () => {
    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    pump(engine);

    const bounds = renderer.bounds;
    expect(bounds.max.x - bounds.min.x).to.be.closeTo(4, 1e-4);
    expect(bounds.max.y - bounds.min.y).to.be.closeTo(4, 1e-4);
    canvasEntity.destroy();
  });

  it("clones under a canvas with a fresh skeleton/state and copied config", () => {
    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    renderer.zSpacing = 0.01;
    renderer.defaultConfig.animationName = "idle";

    const cloneEntity = spineEntity.clone();
    canvasEntity.addChild(cloneEntity);
    const cloneRenderer = cloneEntity.getComponent(SpineAnimationRenderer);
    expect(cloneRenderer.skeleton).to.not.be.undefined;
    expect(cloneRenderer.skeleton).to.not.equal(renderer.skeleton);
    expect(cloneRenderer.skeleton.data).to.equal(renderer.skeleton.data);
    expect(cloneRenderer.state).to.not.equal(renderer.state);
    expect(cloneRenderer.zSpacing).to.equal(0.01);
    expect(cloneRenderer.defaultConfig.animationName).to.equal("idle");
    expect(cloneRenderer.defaultConfig).to.not.equal(renderer.defaultConfig);
    canvasEntity.destroy();
  });

  it("re-homes when a canvas is enabled on an ancestor at runtime", () => {
    const before = worldRendererCount();
    const holder = rootEntity.createChild("holder");
    const spineEntity = holder.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    expect(worldRendererCount()).to.equal(before + 1);
    pump(engine);

    const canvas = holder.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.WorldSpace;
    pump(engine);
    expect(worldRendererCount()).to.equal(before);
    expect((canvas as any)._renderElements.length).to.equal(1);
    expect((canvas as any)._renderElements[0].component).to.equal(renderer);
    holder.destroy();
  });

  it("does not throw when an overlay canvas is enabled above a world-space spine", () => {
    const before = worldRendererCount();
    const holder = rootEntity.createChild("holder");
    const spineEntity = holder.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    pump(engine);

    const canvas = holder.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    expect(() => pump(engine)).to.not.throw();
    expect(worldRendererCount()).to.equal(before);
    expect((canvas as any)._renderElements.length).to.equal(1);
    holder.destroy();
  });

  it("falls back to world rendering when its root canvas is disabled and returns on re-enable", () => {
    const before = worldRendererCount();
    const { canvasEntity, canvas } = createCanvas(CanvasRenderMode.WorldSpace);
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    expect(worldRendererCount()).to.equal(before);
    pump(engine);

    canvas.enabled = false;
    pump(engine);
    expect(worldRendererCount()).to.equal(before + 1);

    canvas.enabled = true;
    expect(() => pump(engine)).to.not.throw();
    expect(worldRendererCount()).to.equal(before);
    expect((canvas as any)._renderElements.length).to.equal(1);
    canvasEntity.destroy();
  });

  it("switches to world rendering when reparented out in the frame it was enabled", () => {
    const before = worldRendererCount();
    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    expect(worldRendererCount()).to.equal(before);

    // Reparent before any engine.update runs.
    rootEntity.addChild(spineEntity);
    expect(worldRendererCount()).to.equal(before + 1);
    pump(engine);
    expect(worldRendererCount()).to.equal(before + 1);

    spineEntity.destroy();
    canvasEntity.destroy();
  });

  it("re-homes when an ancestor subtree is moved under a canvas", () => {
    const before = worldRendererCount();
    const { canvasEntity, canvas } = createCanvas(CanvasRenderMode.WorldSpace);
    const holder = rootEntity.createChild("holder");
    const spineEntity = rootEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    expect(worldRendererCount()).to.equal(before + 1);

    holder.addChild(spineEntity);
    expect(worldRendererCount()).to.equal(before + 1);
    canvasEntity.addChild(holder);
    expect(worldRendererCount()).to.equal(before);
    pump(engine);
    expect((canvas as any)._renderElements.length).to.equal(1);

    holder.destroy();
    canvasEntity.destroy();
  });

  it("unregisters listeners from ancestors dropped by a shorter listening chain", () => {
    const modifyListenerCount = (entity: Entity): number =>
      // @ts-ignore
      entity._modifyFlagManager?._listeners.length ?? 0;
    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    const a = rootEntity.createChild("a");
    const b = a.createChild("b");
    const spineEntity = b.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    expect(modifyListenerCount(a)).to.equal(1);
    pump(engine);

    // The listening chain shrinks from [spine, b, a, root] to [spine, canvasEntity].
    canvasEntity.addChild(spineEntity);
    pump(engine);
    expect(modifyListenerCount(a)).to.equal(0);
    expect(modifyListenerCount(b)).to.equal(0);

    // A leaked listener would fire on the destroyed component when its ex-ancestors move.
    spineEntity.destroy();
    const elsewhere = rootEntity.createChild("elsewhere");
    expect(() => {
      elsewhere.addChild(a);
      pump(engine);
    }).to.not.throw();
    elsewhere.destroy();
    canvasEntity.destroy();
  });

  it("does not hit regions a RectMask2D clips away", () => {
    const { canvasEntity, canvas } = createCanvas(CanvasRenderMode.WorldSpace);
    const maskEntity = canvasEntity.createChild("mask");
    const mask = maskEntity.addComponent(RectMask2D);
    (maskEntity.transform as UITransform).size.set(2, 8);
    const spineEntity = maskEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    renderer.raycastEnabled = true;
    pump(engine);

    const out = {
      entity: null,
      distance: 0,
      point: new Vector3(),
      normal: new Vector3(),
      component: null
    };
    // The 4x4 skeleton spans x in [-2, 2]; the mask rect spans x in [-1, 1].
    const insideRay = new Ray(new Vector3(0, 0, 10), new Vector3(0, 0, -1));
    const clippedRay = new Ray(new Vector3(1.5, 0, 10), new Vector3(0, 0, -1));
    expect((canvas as any)._raycast(insideRay, out)).to.be.true;
    expect(out.component).to.equal(renderer);
    expect((canvas as any)._raycast(clippedRay, out)).to.be.false;

    // Disabled masks stop clipping the hit test.
    mask.enabled = false;
    expect((canvas as any)._raycast(clippedRay, out)).to.be.true;
    canvasEntity.destroy();
  });

  it("destroy while hosted removes its cached materials and releases the primitive", () => {
    const { canvasEntity } = createCanvas(CanvasRenderMode.WorldSpace);
    const spineEntity = canvasEntity.createChild("spine");
    const renderer = spineEntity.addComponent(SpineAnimationRenderer);
    renderer.resource = createSpineResource(engine);
    pump(engine);

    const material = renderer.getMaterial() as any;
    expect(material._cacheKey).to.be.a("string");
    expect(SpineAnimationRenderer._materialCacheMap.has(material._cacheKey)).to.be.true;
    expect(() => spineEntity.destroy()).to.not.throw();
    expect(SpineAnimationRenderer._materialCacheMap.has(material._cacheKey)).to.be.false;
    expect((renderer as any)._primitive).to.be.null;
    canvasEntity.destroy();
  });
});
