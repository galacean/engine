import { Material, MeshRenderer, Shader, ShaderMacro, Texture2D, UnlitMaterial, WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, expect, it } from "vitest";

let engine: WebGLEngine;
beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});
afterAll(() => engine.destroy());

it("preserves macros, texture slots and ownership when copying shader data to itself", () => {
  const material = new Material(engine, Shader.find("Unlit"));
  const owner = engine.sceneManager.activeScene.createRootEntity();
  owner.addComponent(MeshRenderer).setMaterial(material);
  const texture = new Texture2D(engine, 1, 1);
  const textures = [texture, texture];
  const shaderData = material.shaderData;
  const macro = ShaderMacro.getByName("SELF_COPY_MACRO");
  shaderData.enableMacro(macro);
  shaderData.setTexture("selfCopyTexture", texture);
  shaderData.setTextureArray("selfCopyTextures", textures);
  expect(texture.refCount).toBe(3);

  shaderData.cloneTo(shaderData);

  expect(shaderData.getMacros()).toEqual([macro]);
  expect(shaderData._macroCollection.isEnable(macro)).toBe(true);
  expect(shaderData.getTexture("selfCopyTexture")).toBe(texture);
  expect(shaderData.getTextureArray("selfCopyTextures")).toBe(textures);
  expect(texture.refCount).toBe(3);
  owner.destroy();
  expect(texture.refCount).toBe(0);
  material.destroy();
  texture.destroy();
});

it("can disable the base texture macro after copying a material to itself", () => {
  const material = new UnlitMaterial(engine);
  const texture = new Texture2D(engine, 1, 1);
  const macro = ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE");
  material.baseTexture = texture;
  expect(material.shaderData._macroCollection.isEnable(macro)).toBe(true);

  material.cloneTo(material);
  material.baseTexture = null;

  expect(material.baseTexture).toBeNull();
  expect(material.shaderData._macroCollection.isEnable(macro)).toBe(false);
  material.destroy();
  texture.destroy();
});

it("replaces the previous macro value after copying shader data to itself", () => {
  const material = new Material(engine, Shader.find("Unlit"));
  const shaderData = material.shaderData;
  const previous = ShaderMacro.getByName("SELF_COPY_MODE", "1");
  const next = ShaderMacro.getByName("SELF_COPY_MODE", "2");
  shaderData.enableMacro(previous);

  shaderData.cloneTo(shaderData);
  shaderData.enableMacro(next);

  expect(shaderData.getMacros()).toEqual([next]);
  expect(shaderData._macroCollection.isEnable(previous)).toBe(false);
  expect(shaderData._macroCollection.isEnable(next)).toBe(true);
  material.destroy();
});

it("synchronizes replaced macro values and empty macro sets when copying", () => {
  const material = new Material(engine, Shader.find("Unlit"));
  const targetMaterial = material.clone();
  const source = material.shaderData;
  const target = targetMaterial.shaderData;
  const previous = ShaderMacro.getByName("COPY_MACRO_MODE", "1");
  const next = ShaderMacro.getByName("COPY_MACRO_MODE", "2");
  source.enableMacro(next);
  target.enableMacro(previous);

  source.cloneTo(target);
  expect(target.getMacros()).toEqual([next]);
  expect(target._macroCollection.isEnable(previous)).toBe(false);
  expect(target._macroCollection.isEnable(next)).toBe(true);
  target.disableMacro("COPY_MACRO_MODE");
  expect(target._macroCollection.isEnable(next)).toBe(false);
  expect(source._macroCollection.isEnable(next)).toBe(true);

  source.disableMacro("COPY_MACRO_MODE");
  target.enableMacro(previous);
  source.cloneTo(target);
  expect(target.getMacros()).toEqual([]);
  expect(target._macroCollection.isEnable(previous)).toBe(false);
  expect(target._macroCollection.isEnable(next)).toBe(false);
  material.destroy();
  targetMaterial.destroy();
});

it("updates renderer batching metadata when copying shared texture slots", () => {
  const a = engine.sceneManager.activeScene.createRootEntity();
  const b = engine.sceneManager.activeScene.createRootEntity();
  const source = a.addComponent(MeshRenderer).shaderData;
  const target = b.addComponent(MeshRenderer).shaderData;
  const texture = new Texture2D(engine, 1, 1);
  source.setTexture("cloneRendererTexture", texture);
  target.setTexture("cloneRendererOldTextureA", texture);
  target.setTexture("cloneRendererOldTextureB", texture);
  const targetFields = target["_batchSharedFields"];
  expect(source._matchesRendererBatchShared(target)).toBe(false);
  source.cloneTo(target);
  expect(target["_batchSharedFields"]).toBe(targetFields);
  expect(source._matchesRendererBatchShared(target)).toBe(true);
  expect(texture.refCount).toBe(2);
  source.setTexture("cloneRendererTexture", null);
  source.cloneTo(target);
  expect(target["_batchSharedFields"]).toBe(targetFields);
  expect(source._matchesRendererBatchShared(target)).toBe(true);
  expect(texture.refCount).toBe(0);
  a.destroy();
  b.destroy();
  expect(texture.refCount).toBe(0);
  texture.destroy();
});

it.each(["source", "target"])("keeps batching fields independent when changing the %s after copying", (changedSide) => {
  const entities = [0, 1, 2, 3].map(() => engine.sceneManager.activeScene.createRootEntity());
  const [source, target, unchangedExpected, changedExpected] = entities.map(
    (entity) => entity.addComponent(MeshRenderer).shaderData
  );
  const texture = new Texture2D(engine, 1, 1);
  source.setTexture("cloneIndependentTexture", texture);
  unchangedExpected.setTexture("cloneIndependentTexture", texture);
  source.cloneTo(target);
  expect(source._matchesRendererBatchShared(unchangedExpected)).toBe(true);
  expect(target._matchesRendererBatchShared(unchangedExpected)).toBe(true);

  const changed = changedSide === "source" ? source : target;
  const unchanged = changedSide === "source" ? target : source;
  changed.setTexture("cloneIndependentTexture", null);
  expect(changed._matchesRendererBatchShared(changedExpected)).toBe(true);
  expect(unchanged.getTexture("cloneIndependentTexture")).toBe(texture);
  expect(unchanged._matchesRendererBatchShared(unchangedExpected)).toBe(true);

  changed.setTexture("cloneIndependentAddedTexture", texture);
  changedExpected.setTexture("cloneIndependentAddedTexture", texture);
  expect(changed._matchesRendererBatchShared(changedExpected)).toBe(true);
  expect(unchanged.getTexture("cloneIndependentAddedTexture")).toBeUndefined();
  expect(unchanged._matchesRendererBatchShared(unchangedExpected)).toBe(true);

  entities.forEach((entity) => entity.destroy());
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
