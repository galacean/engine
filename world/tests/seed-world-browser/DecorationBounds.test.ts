import { Matrix, WebGLEngine } from "@galacean/engine";
import { expect, it } from "vitest";
import { MountedDecorationRenderer } from "../../../packages/building/src/building/runtime/MountedDecorationRenderer";
import { RigidDecorationRenderer } from "../../../packages/building/src/building/runtime/RigidDecorationRenderer";

it("updates attachment bounds between culling and picking in the same frame", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const root = engine.sceneManager.activeScene.createRootEntity();
    let source = root.createChild();
    const binding = {
      id: "attachment",
      inverseBind: Array.from(new Matrix().elements),
      min: [-1, -1, -1],
      max: [1, 1, 1]
    };
    const mounted = root.createChild().addComponent(MountedDecorationRenderer);
    const rigid = root.createChild().addComponent(RigidDecorationRenderer);
    mounted.configure(binding, () => source);
    rigid.configure([binding], () => source);
    const check = (expected: number) => {
      expect(mounted.bounds.max.x).toBe(expected);
      expect(rigid.bounds.max.x).toBe(expected);
    };
    check(1);
    source.transform.setPosition(10, 0, 0);
    check(11);
    source.isActive = false;
    check(0);
    source = root.createChild();
    source.transform.setPosition(-4, 0, 0);
    check(-3);
  } finally {
    engine.destroy();
  }
});
