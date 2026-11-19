import { Camera, dependentComponents, DependentMode, Entity, MeshRenderer, Script } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, expect, it } from "vitest";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Component dependencies test", function () {
  let entity: Entity;
  let camera: Camera;
  beforeAll(async function () {
    const engine = await WebGLEngine.create({ canvas: canvasDOM });
    entity = engine.sceneManager.activeScene.createRootEntity();
    camera = entity.addComponent(Camera);
  });

  it("Super dependencies add check", () => {
    expect(() => {
      entity.addComponent(CustomScriptB);
    }).throw("Should add MeshRenderer before adding CustomScriptA");
  });

  it("Super dependencies remove check", () => {
    expect(() => {
      const meshRenderer = entity.addComponent(MeshRenderer);
      entity.addComponent(CustomScriptB);
      meshRenderer.destroy();
    }).throw("Should remove CustomScriptA before remove MeshRenderer");
  });

  it("reorders unsatisfied dependencies in Entity constructor without duplicating AutoAdd components", () => {
    const ordered = new Entity(entity.engine, "ordered", CustomAutoAddScript, Camera);
    expect(ordered.getComponents(Camera, [])).toHaveLength(1);
    expect(ordered.getComponents(CustomAutoAddScript, [])).toHaveLength(1);
    expect(ordered._components.indexOf(ordered.getComponent(Camera)!)).toBeLessThan(
      ordered._components.indexOf(ordered.getComponent(CustomAutoAddScript)!)
    );
    expect(() => ordered.destroy()).not.toThrow();

    const checkOnly = new Entity(entity.engine, "check-only", CustomScriptB, MeshRenderer);
    expect(checkOnly.getComponents(MeshRenderer, [])).toHaveLength(1);
    expect(checkOnly.getComponents(CustomScriptB, [])).toHaveLength(1);
    expect(() => checkOnly.destroy()).not.toThrow();
  });

  it("preserves exact component slot mapping when cloning an entity with extra dependency instances after a dependent", () => {
    const source = new Entity(entity.engine, "clone-source");
    const first = source.addComponent(MeshRenderer);
    const dependent = source.addComponent(CustomScriptA);
    const second = source.addComponent(MeshRenderer);
    first.priority = 1;
    second.priority = 2;

    const clone = source.clone();
    const clonedRenderers = clone.getComponents(MeshRenderer, []);
    expect(clonedRenderers).toHaveLength(2);
    expect(clonedRenderers[0].priority).toBe(1);
    expect(clonedRenderers[1].priority).toBe(2);
    expect(clone._components.indexOf(clonedRenderers[0])).toBe(source._components.indexOf(first));
    expect(clone._components.indexOf(clone.getComponent(CustomScriptA)!)).toBe(source._components.indexOf(dependent));
    expect(clone._components.indexOf(clonedRenderers[1])).toBe(source._components.indexOf(second));
    source.destroy();
    clone.destroy();
  });
});

@dependentComponents(MeshRenderer, DependentMode.CheckOnly)
export class CustomScriptA extends Script {}

export class CustomScriptB extends CustomScriptA {}

@dependentComponents(Camera, DependentMode.AutoAdd)
class CustomAutoAddScript extends Script {}
