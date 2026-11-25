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
import { describe, expect, it, vi } from "vitest";

function getMacroAtWord(minWordIndex: number, label: string): ShaderMacro {
  let i = 0;
  while (true) {
    const candidate = ShaderMacro.getByName(`TEST_MACRO_${label}_${i++}`);
    if (candidate._maskIndex >= minWordIndex) {
      return candidate;
    }
  }
}

describe("ShaderMacroCollection", () => {
  const lowMacro = ShaderMacro.getByName("TEST_MACRO_LOW");
  const midMacro = getMacroAtWord(lowMacro._maskIndex + 1, "MID");
  const highMacro = getMacroAtWord(lowMacro._maskIndex + 3, "HIGH");
  const otherHighMacro = ShaderMacro.getByName("TEST_MACRO_OTHER_HIGH");

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

  it("trims the highest shared word when its enabled macros do not overlap", () => {
    expect(otherHighMacro._maskIndex).to.equal(highMacro._maskIndex);
    const left = new ShaderMacroCollection();
    const right = new ShaderMacroCollection();
    const expected = new ShaderMacroCollection();

    left.enable(lowMacro);
    left.enable(highMacro);
    right.enable(lowMacro);
    right.enable(otherHighMacro);
    expected.enable(lowMacro);

    left.intersectionCollection(right);

    expect(left.isEqual(expected)).to.be.true;
  });

  it("restores MeshRenderer WebGL2 instancing after disabling a high-word macro", async () => {
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    try {
      const gl = canvas.getContext("webgl2")!;
      const drawElements = vi.spyOn(gl, "drawElements");
      const drawElementsInstanced = vi.spyOn(gl, "drawElementsInstanced");
      const root = engine.sceneManager.activeScene.createRootEntity("macro-batch-root");
      const cameraEntity = root.createChild("camera");
      cameraEntity.transform.setPosition(0, 0, 10);
      cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
      const camera = cameraEntity.addComponent(Camera);
      camera.cullingMask = Layer.Layer13;

      const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      const material = new UnlitMaterial(engine);
      const untouchedEntity = root.createChild("untouched");
      const toggledEntity = root.createChild("toggled");
      untouchedEntity.layer = toggledEntity.layer = Layer.Layer13;
      const untouched = untouchedEntity.addComponent(MeshRenderer);
      const toggled = toggledEntity.addComponent(MeshRenderer);
      untouched.mesh = toggled.mesh = mesh;
      untouched.setMaterial(material);
      toggled.setMaterial(material);

      const batchHighMacro = getMacroAtWord(untouched.shaderData._macroCollection._length + 2, "BATCH_HIGH");
      toggled.shaderData.enableMacro(batchHighMacro);
      camera.render();
      expect(drawElements).toHaveBeenCalledTimes(2);
      expect(drawElementsInstanced).not.toHaveBeenCalled();

      toggled.shaderData.disableMacro(batchHighMacro);
      drawElements.mockClear();
      camera.render();
      expect(drawElements).not.toHaveBeenCalled();
      expect(drawElementsInstanced).toHaveBeenCalledTimes(1);
      expect(drawElementsInstanced.mock.calls[0][4]).to.equal(2);
    } finally {
      engine.destroy();
    }
  });
});
