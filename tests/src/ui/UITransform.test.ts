import { WebGLEngine } from "@galacean/engine";
import {
  HorizontalAlignmentMode,
  UICanvas,
  UITransform,
  VerticalAlignmentMode,
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
      t.horizontalAlignment = HorizontalAlignmentMode.Left;
      t.alignLeft = 10;
      expect(t.position.x).to.eq(10);

      t.horizontalAlignment = HorizontalAlignmentMode.Center;
      t.alignCenter = 5;
      expect(t.position.x).to.eq(5);

      t.horizontalAlignment = HorizontalAlignmentMode.Right;
      t.alignRight = 7;
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

      t.horizontalAlignment = HorizontalAlignmentMode.Left;
      t.alignLeft = 10;
      expect(t.position.x).to.eq(20);

      t.horizontalAlignment = HorizontalAlignmentMode.Center;
      t.alignCenter = 5;
      expect(t.position.x).to.eq(65);

      t.horizontalAlignment = HorizontalAlignmentMode.Right;
      t.alignRight = 7;
      expect(t.position.x).to.eq(103);
    });
  });

  describe("widget vertical alignment", () => {
    it("vertical alignment updates position (default parent size/pivot)", () => {
      const child = canvasEntity.createChild("child-vert");
      const t = child.transform as UITransform;

      t.verticalAlignment = VerticalAlignmentMode.Top;
      t.alignTop = 10;
      expect(t.position.y).to.eq(-10);

      t.verticalAlignment = VerticalAlignmentMode.Middle;
      t.alignMiddle = 3;
      expect(t.position.y).to.eq(3);

      t.verticalAlignment = VerticalAlignmentMode.Bottom;
      t.alignBottom = 8;
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

      t.verticalAlignment = VerticalAlignmentMode.Top;
      t.alignTop = 10;
      expect(t.position.y).to.eq(-30);

      t.verticalAlignment = VerticalAlignmentMode.Middle;
      t.alignMiddle = 3;
      expect(t.position.y).to.eq(-42);

      t.verticalAlignment = VerticalAlignmentMode.Bottom;
      t.alignBottom = 8;
      expect(t.position.y).to.eq(-62);
    });
  });

  describe("stretch (LeftAndRight / TopAndBottom)", () => {
    it("affects size and position (default parent size/pivot)", () => {
      const child = canvasEntity.createChild("child-stretch");
      const t = child.transform as UITransform;

      t.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
      t.alignLeft = 10;
      t.alignRight = 20;
      expect(t.size.x).to.eq(70);
      expect(t.position.x).to.eq(-5);

      t.verticalAlignment = VerticalAlignmentMode.TopAndBottom;
      t.alignTop = 10;
      t.alignBottom = 20;
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

      t.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
      t.alignLeft = 10;
      t.alignRight = 20;
      expect(t.size.x).to.eq(170);
      expect(t.position.x).to.eq(55);

      t.verticalAlignment = VerticalAlignmentMode.TopAndBottom;
      t.alignTop = 10;
      t.alignBottom = 20;
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
      t.horizontalAlignment = HorizontalAlignmentMode.Left;
      t.alignLeft = 10;
      expect(t.position.x).to.eq(10);
      t.pivot.set(0.2, 0.5);
      expect(t.position.x).to.eq(-20);
    });

    it("updates own aligned position when size changes", () => {
      const parent = root.createChild("rect-parent-b");
      parent.addComponent(UICanvas);
      const child = parent.createChild("rect-child-b");
      const t = child.transform as UITransform;
      t.horizontalAlignment = HorizontalAlignmentMode.Left;
      t.alignLeft = 10;
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

      t.horizontalAlignment = HorizontalAlignmentMode.Left;
      t.alignLeft = 10;
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
      t.horizontalAlignment = HorizontalAlignmentMode.Left;
      t.alignLeft = 10;
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
      t.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
      t.alignLeft = 10;
      t.alignRight = 20;
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
      t.verticalAlignment = VerticalAlignmentMode.TopAndBottom;
      t.alignTop = 10;
      t.alignBottom = 20;
      expect(t.size.y).to.eq(70);
      expect(t.position.y).to.eq(5);
      pt.size.set(100, 150);
      expect(t.size.y).to.eq(120);
      expect(t.position.y).to.eq(5);
    });

    describe("alignment overrides manual transforms", () => {
      it("position/worldPosition/localMatrix/worldMatrix setters do not break aligned position", () => {
        const parent = root.createChild("align-parent-manual");
        parent.addComponent(UICanvas);
        const child = parent.createChild("align-child-manual");
        const t = child.transform as UITransform;

        // Enable alignment so x is driven by layout
        t.horizontalAlignment = HorizontalAlignmentMode.Left;
        t.alignLeft = 10;
        const x0 = t.position.x;
        expect(x0).to.eq(10);

        // Try to set position manually
        t.position.set(123, 456, 0);
        expect(t.position.x).to.eq(10);

        // Try to set worldPosition via parent move (world change) + direct worldPosition
        const pt = parent.transform as UITransform;
        pt.position.set(50, 0, 0);
        const before = t.position.x;
        // worldPosition should still reflect layout for local x
        const wp = t.worldPosition;
        t.worldPosition.set(wp.x + 100, wp.y, wp.z);
        expect(t.position.x).to.eq(before);

        // Set localMatrix directly: modify translation.x in elements[12]
        const lm = t.localMatrix.clone();
        lm.elements[12] = 777;
        t.localMatrix = lm;
        expect(t.position.x).to.eq(before);

        // Set worldMatrix directly: modify translation.x
        const wm = t.worldMatrix.clone();
        wm.elements[12] = wm.elements[12] + 888;
        t.worldMatrix = wm;
        expect(t.position.x).to.eq(before);
      });
    });

    describe("stretch keeps size driven by layout", () => {
      it("setting size manually is overridden in LeftAndRight/TopAndBottom", () => {
        const parent = root.createChild("stretch-parent-manual");
        parent.addComponent(UICanvas);
        const pt = parent.transform as UITransform;
        pt.size.set(200, 150);

        const child = parent.createChild("stretch-child-manual");
        const t = child.transform as UITransform;
        t.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
        t.alignLeft = 10; t.alignRight = 20;
        t.verticalAlignment = VerticalAlignmentMode.TopAndBottom;
        t.alignTop = 5; t.alignBottom = 15;

        // Layout-driven size
        expect(t.size.x).to.eq(170);
        expect(t.size.y).to.eq(130);

        // Attempt to override size manually
        t.size.set(999, 888);
        // Still layout-driven values after internal recomputation
        expect(t.size.x).to.eq(170);
        expect(t.size.y).to.eq(130);
      });
    });

  });

  it("widget changes reflect in worldPosition when parent moves", () => {
    // Use default parent canvasEntity for deterministic base
    const child = canvasEntity.createChild("child-world");
    const t = child.transform as UITransform;

    t.horizontalAlignment = HorizontalAlignmentMode.Center;
    t.alignCenter = 5;
    t.verticalAlignment = VerticalAlignmentMode.Bottom;
    t.alignBottom = 8;

    // Move parent, worldPosition should offset accordingly (no rotation/scale applied)
    const pt = canvasEntity.transform as UITransform;
    pt.position.set(100, 200, 0);

    const pos = t.position;
    const worldPos = t.worldPosition;
    expect(worldPos.x).to.eq(pos.x + pt.worldPosition.x);
    expect(worldPos.y).to.eq(pos.y + pt.worldPosition.y);
    expect(worldPos.z).to.eq(pos.z + pt.worldPosition.z);
  });

  describe("clone", () => {
    it("clones basic properties correctly", () => {
      const parent = root.createChild("clone-parent");
      parent.addComponent(UICanvas);
      const original = parent.createChild("original");
      const originalTransform = original.transform as UITransform;

      originalTransform.size.set(200, 150);
      originalTransform.pivot.set(0.3, 0.7);
      originalTransform.position.set(10, 20, 5);
      originalTransform.rotation.set(45, 30, 60);
      originalTransform.scale.set(1.5, 2.0, 1.2);

      const cloned = original.clone();
      const clonedTransform = cloned.transform as UITransform;

      expect(clonedTransform.size.x).to.eq(200);
      expect(clonedTransform.size.y).to.eq(150);
      expect(clonedTransform.pivot.x).to.eq(0.3);
      expect(clonedTransform.pivot.y).to.eq(0.7);
      expect(clonedTransform.position.x).to.eq(10);
      expect(clonedTransform.position.y).to.eq(20);
      expect(clonedTransform.position.z).to.eq(5);
      expect(clonedTransform.rotation.x).to.eq(45);
      expect(clonedTransform.rotation.y).to.eq(30);
      expect(clonedTransform.rotation.z).to.eq(60);
      expect(clonedTransform.scale.x).to.eq(1.5);
      expect(clonedTransform.scale.y).to.eq(2.0);
      expect(clonedTransform.scale.z).to.eq(1.2);
    });

    it("clones alignment properties correctly", () => {
      const parent = root.createChild("clone-alignment-parent");
      parent.addComponent(UICanvas);
      const original = parent.createChild("original-alignment");
      const originalTransform = original.transform as UITransform;

      originalTransform.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
      originalTransform.alignLeft = 10;
      originalTransform.alignRight = 20;
      originalTransform.alignCenter = 5;
      
      originalTransform.verticalAlignment = VerticalAlignmentMode.TopAndBottom;
      originalTransform.alignTop = 15;
      originalTransform.alignBottom = 25;
      originalTransform.alignMiddle = 8;

      const cloned = original.clone();
      const clonedTransform = cloned.transform as UITransform;

      expect(clonedTransform.horizontalAlignment).to.eq(HorizontalAlignmentMode.LeftAndRight);
      expect(clonedTransform.alignLeft).to.eq(10);
      expect(clonedTransform.alignRight).to.eq(20);
      expect(clonedTransform.alignCenter).to.eq(5);
      
      expect(clonedTransform.verticalAlignment).to.eq(VerticalAlignmentMode.TopAndBottom);
      expect(clonedTransform.alignTop).to.eq(15);
      expect(clonedTransform.alignBottom).to.eq(25);
      expect(clonedTransform.alignMiddle).to.eq(8);
    });

    it("cloned transform is independent from original", () => {
      const parent = root.createChild("clone-independent-parent");
      parent.addComponent(UICanvas);
      const original = parent.createChild("original-independent");
      const originalTransform = original.transform as UITransform;

      originalTransform.size.set(100, 100);
      originalTransform.pivot.set(0.5, 0.5);

      const cloned = original.clone();
      const clonedTransform = cloned.transform as UITransform;

      originalTransform.size.set(200, 150);
      originalTransform.pivot.set(0.2, 0.8);
      originalTransform.alignLeft = 30;

      expect(clonedTransform.size.x).to.eq(100);
      expect(clonedTransform.size.y).to.eq(100);
      expect(clonedTransform.pivot.x).to.eq(0.5);
      expect(clonedTransform.pivot.y).to.eq(0.5);
      expect(clonedTransform.alignLeft).to.eq(0);
    });

    it("cloned transform with alignment behaves correctly", () => {
      const parent = root.createChild("clone-behavior-parent");
      parent.addComponent(UICanvas);
      const parentTransform = parent.transform as UITransform;
      parentTransform.size.set(300, 200);
      
      const original = parent.createChild("original-behavior");
      const originalTransform = original.transform as UITransform;
      
      originalTransform.horizontalAlignment = HorizontalAlignmentMode.Left;
      originalTransform.alignLeft = 20;
      
      const cloned = original.clone();
      parent.addChild(cloned);
      const clonedTransform = cloned.transform as UITransform;

      expect(clonedTransform.horizontalAlignment).to.eq(HorizontalAlignmentMode.Left);
      expect(clonedTransform.alignLeft).to.eq(20);
      expect(clonedTransform.position.x).to.eq(originalTransform.position.x);
    });
  });
});

enum UITransformModifyFlags {
  Size = 0x200,
  Pivot = 0x400
}