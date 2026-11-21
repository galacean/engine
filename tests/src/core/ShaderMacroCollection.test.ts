import {
  Camera,
  Layer,
  MeshRenderer,
  PrimitiveMesh,
  ShaderMacro,
  ShaderMacroCollection,
  UnlitMaterial
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function getMacroAtWord(minWordIndex: number, label: string): ShaderMacro {
  let i = 0;
  while (true) {
    const candidate = ShaderMacro.getByName(`TEST_MACRO_${label}_${i++}`);
    if (candidate._maskIndex >= minWordIndex) {
      return candidate;
    }
  }
}

describe("ShaderMacroCollection", async () => {
  const lowMacro = ShaderMacro.getByName("TEST_MACRO_LOW");
  const midMacro = getMacroAtWord(lowMacro._maskIndex + 1, "MID");
  const highMacro = getMacroAtWord(lowMacro._maskIndex + 3, "HIGH");

  it("trims all trailing zero words on disable so isEqual matches canonical collections", () => {
    const toggled = new ShaderMacroCollection();
    const canonical = new ShaderMacroCollection();

    toggled.enable(lowMacro);
    canonical.enable(lowMacro);
    expect(toggled.isEqual(canonical)).to.be.true;

    // Cross multiple zero words to highMacro, then disable it.
    toggled.enable(highMacro);
    expect(toggled._length).to.equal(highMacro._maskIndex + 1);
    expect(toggled.isEqual(canonical)).to.be.false;

    toggled.disable(highMacro);
    expect(toggled._length).to.equal(canonical._length);
    expect(toggled.isEqual(canonical)).to.be.true;
    expect(canonical.isEqual(toggled)).to.be.true;

    // Disabling an interior word first and then the highest word trims down through interior zeros.
    toggled.enable(midMacro);
    toggled.enable(highMacro);
    toggled.disable(midMacro);
    toggled.disable(highMacro);
    expect(toggled._length).to.equal(canonical._length);
    expect(toggled.isEqual(canonical)).to.be.true;

    // Disabling the last remaining macro trims _length to 0.
    toggled.disable(lowMacro);
    expect(toggled._length).to.equal(0);
    expect(toggled.isEqual(new ShaderMacroCollection())).to.be.true;
  });

  it("trims trailing zero words on complementaryCollection and ignores stale words in intersectionCollection", () => {
    const a = new ShaderMacroCollection();
    const b = new ShaderMacroCollection();
    const canonical = new ShaderMacroCollection();

    a.enable(lowMacro);
    a.enable(highMacro);
    b.enable(highMacro);
    canonical.enable(lowMacro);

    a.complementaryCollection(b);
    expect(a._length).to.equal(canonical._length);
    expect(a.isEqual(canonical)).to.be.true;

    // Leave stale non-zero bits in b's _mask beyond b._length via clear().
    const stale = new ShaderMacroCollection();
    stale.enable(highMacro);
    stale.clear();

    a.enable(highMacro);
    a.intersectionCollection(stale);
    expect(a._length).to.equal(0);
    expect(a.isEqual(new ShaderMacroCollection())).to.be.true;

    // Partial intersection across different lengths must ignore trailing dirty bits and trim zeros.
    stale.enable(lowMacro);
    a.enable(lowMacro);
    a.enable(highMacro);
    a.intersectionCollection(stale);
    expect(a._length).to.equal(canonical._length);
    expect(a.isEqual(canonical)).to.be.true;
  });

  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  afterAll(() => {
    engine.destroy();
  });

  it("keeps MeshRenderer WebGL2 instanced batching intact after enabling and disabling a high-word macro", () => {
    if (!(engine as any)._hardwareRenderer.isWebGL2) return;

    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("macro-batch-root");
    const camEntity = root.createChild("cam");
    camEntity.transform.setPosition(0, 0, 10);
    camEntity.transform.lookAt(new Vector3(0, 0, 0));
    const camera = camEntity.addComponent(Camera);
    camera.enabled = false;
    camera.cullingMask = Layer.Layer13;

    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const mat = new UnlitMaterial(engine);

    const e1 = root.createChild("mr-untouched");
    e1.layer = Layer.Layer13;
    const mr1 = e1.addComponent(MeshRenderer);
    mr1.mesh = mesh;
    mr1.setMaterial(mat);

    const e2 = root.createChild("mr-high-macro-toggled");
    e2.layer = Layer.Layer13;
    const mr2 = e2.addComponent(MeshRenderer);
    mr2.mesh = mesh;
    mr2.setMaterial(mat);

    // Toggle a high-word macro on only mr2 (simulating picking / temporary highlight).
    const batchHighMacro = getMacroAtWord(
      Math.max(mr1.shaderData._macroCollection._length + 2, highMacro._maskIndex),
      "BATCH_HIGH"
    );
    mr2.shaderData.enableMacro(batchHighMacro);
    mr2.shaderData.disableMacro(batchHighMacro);

    engine.pause();
    try {
      camera.render();
      // @ts-ignore
      const opaqueQueue = camera._renderPipeline._cullingResults.opaqueQueue;
      expect(opaqueQueue.elements.length).to.equal(2);
      expect(opaqueQueue.batchedElements.length).to.equal(1);
      expect(opaqueQueue.batchedElements[0].instancedRenderers.length).to.equal(2);
    } finally {
      root.destroy();
      engine.resume();
    }
  });
});
