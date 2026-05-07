import { Camera, Font, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Text, UICanvas, UITransform } from "@galacean/engine-ui";
import { afterAll, describe, expect, it } from "vitest";

const DIRTY_LOCAL_POSITION_BOUNDS = 0x8;
const DIRTY_WORLD_POSITION = 0x10;

function readTextPosFloats(text: any): number[] {
  const result: number[] = [];
  for (const chunk of text._textChunks) {
    const subChunk = chunk.subChunk;
    if (!subChunk) continue;
    const vertices = subChunk.chunk.vertices;
    let vo = subChunk.vertexArea.start;
    const numVerts = subChunk.vertexArea.size / 9;
    for (let i = 0; i < numVerts; i++, vo += 9) {
      result.push(vertices[vo + 0], vertices[vo + 1], vertices[vo + 2]);
    }
  }
  return result;
}

describe("Text", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const webCanvas = engine.canvas;
  webCanvas.width = 750;
  webCanvas.height = 1334;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  const canvasEntity = root.createChild("canvas");
  const label = canvasEntity.addComponent(Text);

  it("Constructor", () => {
    expect(label instanceof Text).to.eq(true);
    expect(label.text == "").to.eq(true);
    expect(label.fontSize).to.eq(24);
    expect(label.lineSpacing).to.eq(0);
    expect(label.enableWrapping).to.eq(false);
  });

  it("set text", () => {
    label.text = "hello world";
    expect(label.text).to.eq("hello world");
  });

  it("set fontSize", () => {
    label.fontSize = 30;
    expect(label.fontSize).to.eq(30);
  });

  it("set lineSpacing", () => {
    label.lineSpacing = 1;
    expect(label.lineSpacing).to.eq(1);
  });

  it("set enableWrapping", () => {
    label.enableWrapping = true;
    expect(label.enableWrapping).to.eq(true);
  });

  it("get bounds", () => {
    const textWithoutCanvas = root.addComponent(Text);
    textWithoutCanvas.text = "hello world";
    const bounds = textWithoutCanvas.bounds;
    expect(bounds.min).to.deep.include({ x: -50, y: -50, z: 0 });
    expect(bounds.max).to.deep.include({ x: 50, y: 50, z: 0 });

    const labelBounds = label.bounds;
    expect(labelBounds.min).to.deep.include({ x: -50, y: -50, z: 0 });
    expect(labelBounds.max).to.deep.include({ x: 50, y: 50, z: 0 });
    label.text = "hello world";
    const labelBounds2 = label.bounds;
    expect(labelBounds2.min).to.deep.include({ x: -50, y: -50, z: 0 });
    expect(labelBounds2.max).to.deep.include({ x: 50, y: 50, z: 0 });
    (<UITransform>label.entity.transform).size.x = 200;
    const labelBounds3 = label.bounds;
    expect(labelBounds3.min).to.deep.include({ x: -100, y: -50, z: 0 });
    expect(labelBounds3.max).to.deep.include({ x: 100, y: 50, z: 0 });
  });

  it("emoji", () => {
    const textEntity = canvasEntity.createChild("text");

    const label1 = textEntity.addComponent(Text);
    label1.text = "͞**͟";
    const label2 = textEntity.addComponent(Text);
    label2.text = "😋月😜狮😝😋🌹❤️😘🎉🤪😍🎊🎵🇧🇸";
    const label3 = textEntity.addComponent(Text);
    label3.text = "️我们" + "️" + "hello";
    const label4 = textEntity.addComponent(Text);
    label4.text = "Ajkq趚喥嘟説孒汾掱湜徳弗里凘諴萉\n汸荖djp溮哋看琺湜獨竝房簡湜汏琺溮哋汸鉽哋汸";
  });

  it("wrap", () => {
    const textEntity = canvasEntity.createChild("text");

    const label1 = textEntity.addComponent(Text);
    const transform1 = <UITransform>label1.entity.transform;
    const size1 = transform1.size;
    size1.x = 2;
    size1.y = 3;
    label1.enableWrapping = true;
    label1.text = "helloworld dfd                       dlfgds    dd df\n    ds f";
    const label2 = textEntity.addComponent(Text);
    const transform2 = <UITransform>label2.entity.transform;
    const size2 = transform2.size;
    size2.x = 2;
    size2.y = 3;
    label2.enableWrapping = true;
    label2.text = "a a a a a a a a a b    a    a";
    const label3 = textEntity.addComponent(Text);
    const transform3 = <UITransform>label3.entity.transform;
    const size3 = transform3.size;
    size3.x = 2;
    size3.y = 3;
    label3.enableWrapping = true;
    label3.text = "hello world\nddl\nsdfjdslfsdfdssdfsdf";
  });

  it("set font to null should not throw", () => {
    const textEntity = canvasEntity.createChild("text-null-font");
    const text = textEntity.addComponent(Text);
    text.text = "test";
    text.font = null;

    // Test that accessing bounds does not throw when font is null.
    expect(() => text.bounds).not.to.throw();

    // Test that bounds remains valid when font is null.
    const { bounds } = text;
    expect(bounds).to.not.be.undefined;
  });

  it("Clone", () => {
    const textEntity = canvasEntity.createChild("Image");
    const text = textEntity.addComponent(Text);
    text.text = "hello world";
    text.fontSize = 30;
    text.lineSpacing = 1;
    text.enableWrapping = true;
    text.font = Font.createFromOS(engine, "AlibabaSans");

    const cloneEntity = textEntity.clone();
    const cloneText = cloneEntity.getComponent(Text);

    expect(cloneText.text).to.eq("hello world");
    expect(cloneText.fontSize).to.eq(30);
    expect(cloneText.lineSpacing).to.eq(1);
    expect(cloneText.enableWrapping).to.eq(true);
    expect(cloneText.font).to.eq(text.font);
  });
});

describe("Text - bounds-getter slot residue regression", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  const webCanvas = engine.canvas;
  webCanvas.width = 750;
  webCanvas.height = 1334;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("regression-root");

  const cameraEntity = root.createChild("Camera");
  cameraEntity.addComponent(Camera);

  const uiCanvasEntity = root.createChild("UICanvas");
  const uiCanvas = uiCanvasEntity.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  uiCanvas.referenceResolutionPerUnit = 100;

  it("_updateLocalData must leave WorldPosition dirty so downstream _updatePosition runs", () => {
    const e = uiCanvasEntity.createChild("dirty-flag-invariant");
    const t = e.addComponent(Text);
    t.text = "AB";
    void t.bounds;

    (t as any)._dirtyUpdateFlag = 0;
    (t as any)._updateLocalData();

    expect((t as any)._dirtyUpdateFlag & DIRTY_WORLD_POSITION).to.eq(DIRTY_WORLD_POSITION);
  });

  it("bounds getter must re-write vertex pos when only LocalPositionBounds is dirty (corrupted-slot)", () => {
    const e = uiCanvasEntity.createChild("bounds-getter-rewrite");
    const t = e.addComponent(Text);
    t.text = "CD";
    (e.transform as UITransform).setPosition(123, -45, 0);
    void t.bounds;

    const before = readTextPosFloats(t);
    expect(before.length).to.be.greaterThan(0);

    const chunks = (t as any)._textChunks;
    const v = chunks[0].subChunk.chunk.vertices;
    let vo = chunks[0].subChunk.vertexArea.start;
    const numVerts = chunks[0].subChunk.vertexArea.size / 9;
    for (let i = 0; i < numVerts; i++, vo += 9) {
      v[vo + 0] = 99999;
      v[vo + 1] = 99999;
      v[vo + 2] = 99999;
    }

    (t as any)._dirtyUpdateFlag = DIRTY_LOCAL_POSITION_BOUNDS;

    void t.bounds;

    const after = readTextPosFloats(t);
    expect(after.length).to.eq(before.length);
    for (let i = 0; i < after.length; i++) {
      expect(after[i]).to.be.closeTo(before[i], 0.001);
    }
  });

  it("vertex pos remains correct after sibling chunk is destroyed (full slot-reuse repro)", () => {
    const leadEntity = uiCanvasEntity.createChild("repro-lead");
    const lead = leadEntity.addComponent(Text);
    (leadEntity.transform as UITransform).setPosition(-300, -100, 0);
    lead.text = "ab";
    void lead.bounds;

    const stableEntity = uiCanvasEntity.createChild("repro-stable");
    const stable = stableEntity.addComponent(Text);
    (stableEntity.transform as UITransform).setPosition(50, 100, 0);
    stable.text = "cd";
    void stable.bounds;

    const before = readTextPosFloats(stable);
    expect(before.length).to.be.greaterThan(0);

    leadEntity.destroy();

    (stable as any)._dirtyUpdateFlag = DIRTY_LOCAL_POSITION_BOUNDS;

    void stable.bounds;

    const after = readTextPosFloats(stable);
    expect(after.length).to.eq(before.length);
    for (let i = 0; i < after.length; i++) {
      expect(after[i]).to.be.closeTo(before[i], 0.001);
    }
  });

  afterAll(() => {
    engine.destroy();
  });
});
