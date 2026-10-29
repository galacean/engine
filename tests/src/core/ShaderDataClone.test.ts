import { Material, MeshRenderer, Shader, Texture2D, WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, expect, it } from "vitest";

let engine: WebGLEngine;
beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});
afterAll(() => engine.destroy());

it("updates renderer batching metadata when copying shared texture slots", () => {
  const a = engine.sceneManager.activeScene.createRootEntity();
  const b = engine.sceneManager.activeScene.createRootEntity();
  const source = a.addComponent(MeshRenderer).shaderData;
  const target = b.addComponent(MeshRenderer).shaderData;
  const texture = new Texture2D(engine, 1, 1);
  source.setTexture("cloneRendererTexture", texture);
  expect(source._matchesRendererBatchShared(target)).toBe(false);
  source.cloneTo(target);
  expect(source._matchesRendererBatchShared(target)).toBe(true);
  expect(texture.refCount).toBe(2);
  a.destroy();
  b.destroy();
  expect(texture.refCount).toBe(0);
  texture.destroy();
});

it("replaces referenced texture slots without accumulating ownership", () => {
  const source = new Material(engine, Shader.find("Unlit"));
  const target = source.clone();
  const old = new Texture2D(engine, 1, 1),
    next = new Texture2D(engine, 1, 1);
  target.shaderData.setTexture("cloneTexture", old);
  target.shaderData.setTextureArray("cloneArray", [old, old]);
  source.shaderData.setTexture("cloneTexture", next);
  source.shaderData.setTextureArray("cloneArray", [next, next]);
  const owners = [0, 1].map(() => engine.sceneManager.activeScene.createRootEntity());
  owners.forEach((entity) => entity.addComponent(MeshRenderer).setMaterial(target));
  expect(old.refCount).toBe(6);
  for (let i = 0; i < 3; i++) {
    source.cloneTo(target);
    expect(old.refCount).toBe(0);
    expect(next.refCount).toBe(6);
  }
  target.cloneTo(target);
  expect(next.refCount).toBe(6);
  owners.forEach((entity) => entity.destroy());
  expect(next.refCount).toBe(0);
  source.destroy();
  target.destroy();
  old.destroy();
  next.destroy();
});

it("removes destination-only properties and macros instead of retaining stale authoring", () => {
  const source = new Material(engine, Shader.find("Unlit")),
    target = source.clone();
  const old = new Texture2D(engine, 1, 1);
  target.shaderData.setTexture("removedTexture", old);
  target.shaderData.setFloat("removedFloat", 7);
  target.shaderData.enableMacro("REMOVED_MACRO");
  source.shaderData.enableMacro("CURRENT_MACRO");
  const owner = engine.sceneManager.activeScene.createRootEntity();
  owner.addComponent(MeshRenderer).setMaterial(target);
  source.cloneTo(target);
  expect(old.refCount).toBe(0);
  expect(target.shaderData.getTexture("removedTexture")).toBeUndefined();
  expect(target.shaderData.getFloat("removedFloat")).toBeUndefined();
  expect(target.shaderData.getMacros().map((macro) => macro.name)).toEqual(["CURRENT_MACRO"]);
  target.shaderData.enableMacro("REMOVED_MACRO");
  expect(
    target.shaderData
      .getMacros()
      .map((macro) => macro.name)
      .sort()
  ).toEqual(["CURRENT_MACRO", "REMOVED_MACRO"]);
  owner.destroy();
  source.destroy();
  target.destroy();
  old.destroy();
});
