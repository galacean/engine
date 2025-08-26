import { WebGLEngine } from "@galacean/engine";
import {
  UICanvas,
  HorizontalAlignmentFlags,
  UITransform,
  VerticalAlignmentFlags,
} from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("UITransform", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  const webCanvas = engine.canvas;
  webCanvas.width = 750;
  webCanvas.height = 1334;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  // Parent with UITransform (via UICanvas), children created under it will inherit UITransform automatically
  const canvasEntity = root.createChild("canvas");
  canvasEntity.addComponent(UICanvas);

  it("size & pivot get/set and dispatch", () => {
    // Use an isolated parent to avoid affecting other cases
    const dispatchEntity = root.createChild("parent-for-dispatch");
    dispatchEntity.addComponent(UICanvas);
    const t = dispatchEntity.transform as UITransform;

    // Defaults
    expect(t.size.x).to.eq(100);
    expect(t.size.y).to.eq(100);
    expect(t.pivot.x).to.eq(0.5);
    expect(t.pivot.y).to.eq(0.5);

    // Listen entity update flags
    // @ts-ignore
    const updateFlagMgr = dispatchEntity._updateFlagManager as any;
    const events: number[] = [];
    const listener = (type?: number) => {
      if (typeof type === "number") events.push(type);
    };
    updateFlagMgr.addListener(listener);

    // Change size -> should dispatch Size flag
    t.size.set(200, 150);
    // Ensure getter reflects
    expect(t.size.x).to.eq(200);
    expect(t.size.y).to.eq(150);
    // Has dispatch
    expect(events.some((e) => (e & UITransformModifyFlags.Size) !== 0)).to.eq(true);

    // Clear and change pivot -> should dispatch Pivot flag
    events.length = 0;
    t.pivot.set(0.2, 0.8);
    expect(t.pivot.x).to.eq(0.2);
    expect(t.pivot.y).to.eq(0.8);
    expect(events.some((e) => (e & UITransformModifyFlags.Pivot) !== 0)).to.eq(true);

    updateFlagMgr.removeListener(listener);
  });

  describe("widget alignment", () => {
    it("horizontal alignment updates position (default parent size/pivot)", () => {
      const child = canvasEntity.createChild("child");
      const t = child.transform as UITransform;

      // Parent default size (100,100), pivot (0.5,0.5)
      t.horizontalAlignment = HorizontalAlignmentFlags.Left;
      t.left = 10;
      expect(t.position.x).to.eq(10);

      t.horizontalAlignment = HorizontalAlignmentFlags.Center;
      t.center = 5;
      expect(t.position.x).to.eq(5);

      t.horizontalAlignment = HorizontalAlignmentFlags.Right;
      t.right = 7;
      expect(t.position.x).to.eq(-7);
    });

    it("horizontal alignment updates position (custom parent size/pivot)", () => {
      // Isolated parent with custom size/pivot
      const customParent = root.createChild("custom-parent");
      customParent.addComponent(UICanvas);
      const customPT = customParent.transform as UITransform;
      customPT.size.set(200, 150);
      customPT.pivot.set(0.2, 0.8);

      const child = customParent.createChild("child");
      const t = child.transform as UITransform;

      t.horizontalAlignment = HorizontalAlignmentFlags.Left;
      t.left = 10;
      expect(t.position.x).to.eq(20);

      t.horizontalAlignment = HorizontalAlignmentFlags.Center;
      t.center = 5;
      expect(t.position.x).to.eq(65);

      t.horizontalAlignment = HorizontalAlignmentFlags.Right;
      t.right = 7;
      expect(t.position.x).to.eq(103);
    });
  });

  describe("widget vertical alignment", () => {
    it("vertical alignment updates position (default parent size/pivot)", () => {
      const child = canvasEntity.createChild("child-vert");
      const t = child.transform as UITransform;

      t.verticalAlignment = VerticalAlignmentFlags.Top;
      t.top = 10;
      expect(t.position.y).to.eq(-10);

      t.verticalAlignment = VerticalAlignmentFlags.Middle;
      t.middle = 3;
      expect(t.position.y).to.eq(3);

      t.verticalAlignment = VerticalAlignmentFlags.Bottom;
      t.bottom = 8;
      expect(t.position.y).to.eq(8);
    });

    it("vertical alignment updates position (custom parent size/pivot)", () => {
      const customParent = root.createChild("custom-parent-vert");
      customParent.addComponent(UICanvas);
      const customPT = customParent.transform as UITransform;
      customPT.size.set(200, 150);
      customPT.pivot.set(0.2, 0.8);

      const child = customParent.createChild("child-vert");
      const t = child.transform as UITransform;

      t.verticalAlignment = VerticalAlignmentFlags.Top;
      t.top = 10;
      expect(t.position.y).to.eq(-30);

      t.verticalAlignment = VerticalAlignmentFlags.Middle;
      t.middle = 3;
      expect(t.position.y).to.eq(-42);

      t.verticalAlignment = VerticalAlignmentFlags.Bottom;
      t.bottom = 8;
      expect(t.position.y).to.eq(-62);
    });
  });

  describe("stretch (LeftAndRight / TopAndBottom)", () => {
    it("affects size and position (default parent size/pivot)", () => {
      const child = canvasEntity.createChild("child-stretch");
      const t = child.transform as UITransform;

      t.horizontalAlignment = HorizontalAlignmentFlags.LeftAndRight;
      t.left = 10;
      t.right = 20;
      expect(t.size.x).to.eq(70);
      expect(t.position.x).to.eq(-5);

      t.verticalAlignment = VerticalAlignmentFlags.TopAndBottom;
      t.top = 10;
      t.bottom = 20;
      expect(t.size.y).to.eq(70);
      expect(t.position.y).to.eq(5);
    });

    it("affects size and position (custom parent size/pivot)", () => {
      const customParent = root.createChild("custom-parent-stretch");
      customParent.addComponent(UICanvas);
      const customPT = customParent.transform as UITransform;
      customPT.size.set(200, 150);
      customPT.pivot.set(0.2, 0.8);

      const child = customParent.createChild("child-stretch");
      const t = child.transform as UITransform;

      t.horizontalAlignment = HorizontalAlignmentFlags.LeftAndRight;
      t.left = 10;
      t.right = 20;
      expect(t.size.x).to.eq(170);
      expect(t.position.x).to.eq(55);

      t.verticalAlignment = VerticalAlignmentFlags.TopAndBottom;
      t.top = 10;
      t.bottom = 20;
      expect(t.size.y).to.eq(120);
      expect(t.position.y).to.eq(-40);
    });
  });
  describe("setRectDirty propagation", () => {
    it("updates own aligned position when pivot changes", () => {
      const parent = root.createChild("rect-parent-a");
      parent.addComponent(UICanvas);
      const child = parent.createChild("rect-child-a");
      const t = child.transform as UITransform;
      t.horizontalAlignment = HorizontalAlignmentFlags.Left;
      t.left = 10;
      expect(t.position.x).to.eq(10);
      t.pivot.set(0.2, 0.5);
      expect(t.position.x).to.eq(-20);
    });

    it("updates own aligned position when size changes", () => {
      const parent = root.createChild("rect-parent-b");
      parent.addComponent(UICanvas);
      const child = parent.createChild("rect-child-b");
      const t = child.transform as UITransform;
      t.horizontalAlignment = HorizontalAlignmentFlags.Left;
      t.left = 10;
      expect(t.position.x).to.eq(10);
      t.size.set(200, 100);
      expect(t.position.x).to.eq(60);
    });

    it("updates child aligned position when parent size changes", () => {
      const parent = root.createChild("rect-parent-c");
      parent.addComponent(UICanvas);
      const pt = parent.transform as UITransform;
      const child = parent.createChild("rect-child-c");
      const t = child.transform as UITransform;

      t.horizontalAlignment = HorizontalAlignmentFlags.Left;
      t.left = 10;
      expect(t.position.x).to.eq(10);
      pt.size.set(200, 100);
      expect(t.position.x).to.eq(-40);
    });

    it("updates child aligned position when parent pivot changes", () => {
      const parent = root.createChild("rect-parent-d");
      parent.addComponent(UICanvas);
      const pt = parent.transform as UITransform;
      const child = parent.createChild("rect-child-d");
      const t = child.transform as UITransform;
      t.horizontalAlignment = HorizontalAlignmentFlags.Left;
      t.left = 10;
      expect(t.position.x).to.eq(10);
      pt.pivot.set(0.2, 0.5);
      expect(t.position.x).to.eq(40);
    });
  });
  describe("setRectDirty with stretch", () => {
    it("parent size change updates child's size and position in LeftAndRight", () => {
      const parent = root.createChild("rect-parent-stretch-a");
      parent.addComponent(UICanvas);
      const pt = parent.transform as UITransform;
      const child = parent.createChild("rect-child-stretch-a");
      const t = child.transform as UITransform;
      t.horizontalAlignment = HorizontalAlignmentFlags.LeftAndRight;
      t.left = 10;
      t.right = 20;
      expect(t.size.x).to.eq(70);
      expect(t.position.x).to.eq(-5);
      pt.size.set(200, 100);
      expect(t.size.x).to.eq(170);
      expect(t.position.x).to.eq(-5);
    });

    it("parent size change updates child's size and position in TopAndBottom", () => {
      const parent = root.createChild("rect-parent-stretch-b");
      parent.addComponent(UICanvas);
      const pt = parent.transform as UITransform;
      const child = parent.createChild("rect-child-stretch-b");
      const t = child.transform as UITransform;
      t.verticalAlignment = VerticalAlignmentFlags.TopAndBottom;
      t.top = 10;
      t.bottom = 20;
      expect(t.size.y).to.eq(70);
      expect(t.position.y).to.eq(5);
      pt.size.set(100, 150);
      expect(t.size.y).to.eq(120);
      expect(t.position.y).to.eq(5);
    });
  });



  it("widget changes reflect in worldPosition when parent moves", () => {
    // Use default parent canvasEntity for deterministic base
    const child = canvasEntity.createChild("child-world");
    const t = child.transform as UITransform;

    t.horizontalAlignment = HorizontalAlignmentFlags.Center;
    t.center = 5;
    t.verticalAlignment = VerticalAlignmentFlags.Bottom;
    t.bottom = 8;

    // Move parent, worldPosition should offset accordingly (no rotation/scale applied)
    const pt = canvasEntity.transform as UITransform;
    pt.position.set(100, 200, 0);

    const pos = t.position;
    const worldPos = t.worldPosition;
    expect(worldPos.x).to.eq(pos.x + pt.worldPosition.x);
    expect(worldPos.y).to.eq(pos.y + pt.worldPosition.y);
    expect(worldPos.z).to.eq(pos.z + pt.worldPosition.z);
  });
});

enum UITransformModifyFlags {
  LocalEuler = 0x1,
  LocalQuat = 0x2,
  WorldPosition = 0x4,
  LocalMatrix = 0x40,
  WorldMatrix = 0x80,
  Size = 0x200,
  Pivot = 0x400,
  LocalPosition = 0x800,
  Rect = 0x1000,

  LsLr = Size | Rect,
  /** Local matrix | local position. */
  LmLp = LocalMatrix | LocalPosition,
  /** World matrix | world position. */
  WmWp = WorldMatrix | WorldPosition,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale */
  WmWpWeWqWs = 0xbc,
  /** WorldMatrix | WorldPosition | WorldEuler | WorldQuat | WorldScale | WorldUniformScaling */
  WmWpWeWqWsWus = 0x1bc,
}