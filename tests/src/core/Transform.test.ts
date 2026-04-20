import { deepClone, Entity, Scene, Transform, TransformModifyFlags } from "@galacean/engine-core";
import { Vector2, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { beforeAll, describe, expect, it } from "vitest";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Transform test", function () {
  let engine: WebGLEngine;
  let scene: Scene;
  let entity: Entity;
  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: canvasDOM });
    scene = engine.sceneManager.scenes[0];
    entity = scene.createRootEntity();
  });

  it("World direction", () => {
    const transform = entity.transform;
    transform.position.set(1, -2, 3);
    transform.rotate(0, 45, 0);

    expect(transform.worldForward).to.deep.equal(new Vector3(-0.7071067811865476, -0, -0.7071067811865476));
    expect(transform.worldRight).to.deep.equal(new Vector3(0.7071067811865476, 0, -0.7071067811865476));
    expect(transform.worldUp).to.deep.equal(new Vector3(0, 1, 0));
  });

  it("World Scale", () => {
    const root = scene.createRootEntity();
    root.transform.setScale(1, 2, 3);
    const entity = root.createChild();
    const transform = entity.transform;
    transform.setScale(4, 5, 6);
    transform.setRotation(0, 0, 0);
    expect(transform.lossyWorldScale).to.deep.equal(new Vector3(4, 10, 18));
    transform.setRotation(90, 0, 0);
    expect(transform.lossyWorldScale).to.deep.equal(new Vector3(4, 15, 12));
  });

  it("Parent Dirty", () => {
    const root1 = scene.createRootEntity();
    const root2 = scene.createRootEntity();
    root1.transform.setPosition(1, 1, 1);
    root2.transform.setPosition(0, 0, 0);

    let worldPosition = root2.transform.worldPosition;
    expect(worldPosition.x).to.equal(0);
    expect(worldPosition.y).to.equal(0);
    expect(worldPosition.z).to.equal(0);
    root1.addChild(root2);
    worldPosition = root2.transform.worldPosition;
    expect(worldPosition.x).to.equal(1);
    expect(worldPosition.y).to.equal(1);
    expect(worldPosition.z).to.equal(1);
    scene.addRootEntity(root2);
    worldPosition = root2.transform.worldPosition;
    expect(worldPosition.x).to.equal(0);
    expect(worldPosition.y).to.equal(0);
    expect(worldPosition.z).to.equal(0);

    // Transform
    const parent = new Entity(engine, "parent");
    const child = parent.createChild("child");
    parent.addChild(child);
    const worldMatrix = child.transform.worldMatrix;

    // Replace transform
    parent.addComponent(Transform);

    // Check child transform parent cache
    // @ts-ignore
    expect(parent.transform.instanceId).eq(child.transform._getParentTransform()?.instanceId);
  });

  it("Reparent propagates world matrix dirty to deep descendants after clone", () => {
    // Build source hierarchy: source -> middle -> inner (with local offset)
    const source = new Entity(engine, "source");
    const srcMiddle = source.createChild("middle");
    const srcInner = srcMiddle.createChild("inner");
    srcInner.transform.setPosition(10, 20, 30);

    // Clone (equivalent to PrefabResource.instantiate)
    const clone = source.clone();
    const cloneMiddle = clone.findByName("middle")!;
    const cloneInner = cloneMiddle.findByName("inner")!;

    // Access cloneInner.worldMatrix before adding clone to a positioned parent.
    const worldBeforeReparent = cloneInner.transform.worldMatrix;
    expect(worldBeforeReparent.elements[12]).to.equal(10);
    expect(worldBeforeReparent.elements[13]).to.equal(20);
    expect(worldBeforeReparent.elements[14]).to.equal(30);

    // Reparent the clone under a positioned root — same as `table.addChild(levelNode)`.
    const root = scene.createRootEntity("reparent-root");
    root.transform.setPosition(1000, 2000, 3000);
    root.addChild(clone);

    // cloneInner.worldMatrix must reflect root's offset (deep descendant of moved subtree).
    const worldAfterReparent = cloneInner.transform.worldMatrix;
    expect(worldAfterReparent.elements[12]).to.equal(1010);
    expect(worldAfterReparent.elements[13]).to.equal(2020);
    expect(worldAfterReparent.elements[14]).to.equal(3030);
  });

  it("Reparent invalidates descendant world caches even when parent has all world flags set (engine dirty-flag bug)", () => {
    // Reproduces a Galacean 2.0-alpha.24 engine bug observed in Screw game:
    //   Transform._parentChange() calls _updateAllWorldFlag which early-exits
    //   if `this` already has all target world dirty flags set. This skips
    //   propagation to descendants. After reparent, a descendant whose
    //   WorldMatrix flag was previously cleared keeps returning stale cache.
    const parent = new Entity(engine, "parent");
    const child = parent.createChild("child");
    child.transform.setPosition(10, 20, 30);

    // 1) Access child.worldMatrix to CLEAR child's WorldMatrix dirty flag.
    //    The access also clears parent's WorldMatrix flag (chain compute).
    const cached = child.transform.worldMatrix;
    expect(cached.elements[12]).to.equal(10);

    // 2) Force parent into the failure state:
    //    "all world dirty flags set" (as if never accessed) — simulates the
    //    post-clone / lifecycle state where PARENT's world hasn't been read
    //    but a DESCENDANT's world was.
    // @ts-ignore - white-box access for precise engine bug reproduction
    parent.transform._dirtyFlag |= TransformModifyFlags.WmWpWeWqWsWus;

    // Sanity: child's WorldMatrix is CLEAR, parent has ALL world flags SET.
    // @ts-ignore
    expect(child.transform._dirtyFlag & TransformModifyFlags.WorldMatrix).to.equal(0);
    // @ts-ignore
    expect(parent.transform._dirtyFlag & TransformModifyFlags.WmWpWeWqWsWus).to.equal(TransformModifyFlags.WmWpWeWqWsWus);

    // 3) Reparent `parent` under a positioned root (triggers _parentChange on parent).
    const root = scene.createRootEntity("reparent-root");
    root.transform.setPosition(1000, 2000, 3000);
    root.addChild(parent);

    // 4) Child's worldMatrix MUST now reflect root's offset.
    //    Under the bug: early-exit in _updateAllWorldFlag skips propagation → child's
    //    WorldMatrix flag stays CLEAR → getter returns stale cached (10, 20, 30).
    const afterReparent = child.transform.worldMatrix;
    expect(afterReparent.elements[12]).to.equal(1010);
    expect(afterReparent.elements[13]).to.equal(2020);
    expect(afterReparent.elements[14]).to.equal(3030);
  });

  it("Reparent re-resolves descendant parent cache even when cached as null", () => {
    // Reproduces the second half of the Galacean 2.0-alpha.24 bug: a descendant
    // whose `_parentTransformCache` was resolved to `null` (because
    // `_getParentTransform` was called while its ancestor chain was partially
    // constructed) keeps returning identity worldMatrix even after the
    // ancestor chain is fully wired up.
    const parent = new Entity(engine, "parent");
    const child = parent.createChild("child");
    child.transform.setPosition(10, 20, 30);

    // Force child's parent cache to null with `_isParentDirty = false` —
    // simulates the state observed in Screw where layer-001 had
    // `_parentTransformCache = null, _isParentDirty = false` after clone.
    // @ts-ignore
    child.transform._parentTransformCache = null;
    // @ts-ignore
    child.transform._isParentDirty = false;

    // Add parent under a positioned root. If _parentChange on parent fails to
    // invalidate child's parent cache, child.worldMatrix returns identity.
    const root = scene.createRootEntity("cache-null-root");
    root.transform.setPosition(500, 600, 700);
    root.addChild(parent);

    const after = child.transform.worldMatrix;
    expect(after.elements[12]).to.equal(510); // 500 + 10
    expect(after.elements[13]).to.equal(620); // 600 + 20
    expect(after.elements[14]).to.equal(730); // 700 + 30
  });

  it("Subclasses of Transform", () => {
    // Create by constructor
    const entity0 = new Entity(engine, "entity");
    expect(entity0.transform instanceof Transform).to.equal(true);
    expect(entity0.transform instanceof SubClassOfTransform).to.equal(false);
    entity0.transform.position.set(1, 2, 3);
    entity0.transform.rotation.set(0, 45, 0);
    entity0.transform.scale.set(1, 2, 3);
    const entity1 = new Entity(engine, "entity", SubClassOfTransform);
    expect(entity1.transform instanceof SubClassOfTransform).to.equal(true);
    entity1.transform.position.set(4, 5, 6);
    entity1.transform.rotation.set(0, 90, 0);
    entity1.transform.scale.set(4, 5, 6);
    (entity1.transform as SubClassOfTransform).size.set(100, 100);

    // Created by createChild
    const entity2 = entity0.createChild();
    expect(entity2.transform instanceof Transform).to.equal(true);
    expect(entity2.transform instanceof SubClassOfTransform).to.equal(false);
    const entity3 = entity0.createChild();
    expect(entity3.transform instanceof Transform).to.equal(true);

    // Created by clone
    const entity4 = entity0.clone();
    expect(entity4.transform instanceof Transform).to.equal(true);
    expect(entity4.transform instanceof SubClassOfTransform).to.equal(false);
    expect(entity4.transform.position).to.deep.include({ x: 1, y: 2, z: 3 });
    expect(entity4.transform.rotation).to.deep.include({ x: 0, y: 45, z: 0 });
    expect(entity4.transform.scale).to.deep.include({ x: 1, y: 2, z: 3 });
    const entity5 = entity1.clone();
    expect(entity5.transform instanceof SubClassOfTransform).to.equal(true);
    expect(entity5.transform.position).to.deep.include({ x: 4, y: 5, z: 6 });
    expect(entity5.transform.rotation).to.deep.include({ x: 0, y: 90, z: 0 });
    expect(entity5.transform.scale).to.deep.include({ x: 4, y: 5, z: 6 });
    expect((entity5.transform as SubClassOfTransform).size).to.deep.include({ x: 100, y: 100 });

    // Add component
    const preTransform0 = entity0.transform;
    entity0.addComponent(SubClassOfTransform);
    expect(preTransform0.destroyed).to.equal(true);
    expect(entity0.transform instanceof Transform).to.equal(true);
    expect(entity0.transform instanceof SubClassOfTransform).to.equal(true);

    const preTransform1 = entity1.transform;
    entity1.addComponent(Transform);
    expect(preTransform1.destroyed).to.equal(true);
    expect(entity1.transform instanceof Transform).to.equal(true);
    expect(entity1.transform instanceof SubClassOfTransform).to.equal(false);
  });
});

class SubClassOfTransform extends Transform {
  @deepClone
  size: Vector2 = new Vector2();
}
