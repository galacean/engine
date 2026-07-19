import {
  Animator,
  AnimatorController,
  AudioClip,
  AudioSource,
  Camera,
  Entity,
  MeshRenderer,
  MeshShape,
  ModelMesh,
  ParticleRenderer,
  RenderTarget,
  Sprite,
  SpriteMask,
  SpriteRenderer,
  Texture2D
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Slot-ownership contract: a component top-level field sharing a ref-counted resource owns one
 * reference — acquired by the setter (user path) or the clone gate (clone path), transferred by
 * setter churn (-old/+new), and released by the component's destroy path.
 * Every suite below asserts the full lifecycle: baseline → clone +1 → churn → destroy release.
 */
describe("RefCount slot-ownership contract", () => {
  let engine: WebGLEngine;
  let rootEntity: Entity;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    rootEntity = engine.sceneManager.activeScene.createRootEntity();
    engine.run();
  });

  describe("Camera.renderTarget", () => {
    it("clone acquires, setter churn transfers, destroy releases", () => {
      const rtA = new RenderTarget(engine, 4, 4, new Texture2D(engine, 4, 4));
      const rtB = new RenderTarget(engine, 4, 4, new Texture2D(engine, 4, 4));
      const entity = rootEntity.createChild("cameraSlot");
      entity.addComponent(Camera).renderTarget = rtA;
      expect(rtA.refCount).eq(1);

      const clone = entity.clone();
      rootEntity.addChild(clone);
      expect(rtA.refCount).eq(2);

      clone.getComponent(Camera).renderTarget = rtB;
      expect(rtA.refCount).eq(1);
      expect(rtB.refCount).eq(1);

      clone.destroy();
      expect(rtB.refCount).eq(0);
      expect(rtA.refCount).eq(1);

      entity.destroy();
      expect(rtA.refCount).eq(0);
    });
  });

  describe("Animator.animatorController", () => {
    it("clone acquires, setter churn transfers, destroy releases", () => {
      const controllerA = new AnimatorController(engine);
      const controllerB = new AnimatorController(engine);
      const entity = rootEntity.createChild("animatorSlot");
      entity.addComponent(Animator).animatorController = controllerA;
      expect(controllerA.refCount).eq(1);

      const clone = entity.clone();
      rootEntity.addChild(clone);
      expect(controllerA.refCount).eq(2);

      clone.getComponent(Animator).animatorController = controllerB;
      expect(controllerA.refCount).eq(1);
      expect(controllerB.refCount).eq(1);

      clone.destroy();
      expect(controllerB.refCount).eq(0);
      expect(controllerA.refCount).eq(1);

      entity.destroy();
      expect(controllerA.refCount).eq(0);
    });
  });

  describe("AudioSource.clip", () => {
    it("clone acquires, setter churn transfers, destroy releases", () => {
      const clipA = new AudioClip(engine, "clipA");
      const clipB = new AudioClip(engine, "clipB");
      const entity = rootEntity.createChild("audioSlot");
      entity.addComponent(AudioSource).clip = clipA;
      expect(clipA.refCount).eq(1);

      const clone = entity.clone();
      rootEntity.addChild(clone);
      expect(clipA.refCount).eq(2);

      clone.getComponent(AudioSource).clip = clipB;
      expect(clipA.refCount).eq(1);
      expect(clipB.refCount).eq(1);

      clone.destroy();
      expect(clipB.refCount).eq(0);
      expect(clipA.refCount).eq(1);

      entity.destroy();
      expect(clipA.refCount).eq(0);
    });
  });

  describe("SpriteRenderer.sprite", () => {
    it("clone acquires, setter churn transfers, destroy releases", () => {
      const spriteA = new Sprite(engine, new Texture2D(engine, 1, 1));
      const spriteB = new Sprite(engine, new Texture2D(engine, 1, 1));
      const entity = rootEntity.createChild("spriteRendererSlot");
      entity.addComponent(SpriteRenderer).sprite = spriteA;
      expect(spriteA.refCount).eq(1);

      const clone = entity.clone();
      rootEntity.addChild(clone);
      expect(spriteA.refCount).eq(2);

      clone.getComponent(SpriteRenderer).sprite = spriteB;
      expect(spriteA.refCount).eq(1);
      expect(spriteB.refCount).eq(1);

      clone.destroy();
      expect(spriteB.refCount).eq(0);
      expect(spriteA.refCount).eq(1);

      entity.destroy();
      expect(spriteA.refCount).eq(0);
    });
  });

  describe("SpriteMask.sprite", () => {
    it("clone acquires, setter churn transfers, destroy releases", () => {
      const spriteA = new Sprite(engine, new Texture2D(engine, 1, 1));
      const spriteB = new Sprite(engine, new Texture2D(engine, 1, 1));
      const entity = rootEntity.createChild("spriteMaskSlot");
      entity.addComponent(SpriteMask).sprite = spriteA;
      expect(spriteA.refCount).eq(1);

      const clone = entity.clone();
      rootEntity.addChild(clone);
      expect(spriteA.refCount).eq(2);

      clone.getComponent(SpriteMask).sprite = spriteB;
      expect(spriteA.refCount).eq(1);
      expect(spriteB.refCount).eq(1);

      clone.destroy();
      expect(spriteB.refCount).eq(0);
      expect(spriteA.refCount).eq(1);

      entity.destroy();
      expect(spriteA.refCount).eq(0);
    });
  });

  describe("MeshRenderer.mesh (setter-mode slot)", () => {
    it("clone acquires via the setter in _cloneTo, churn transfers, destroy releases", () => {
      const meshA = new ModelMesh(engine);
      const meshB = new ModelMesh(engine);
      const entity = rootEntity.createChild("meshRendererSlot");
      entity.addComponent(MeshRenderer).mesh = meshA;
      expect(meshA.refCount).eq(1);

      const clone = entity.clone();
      rootEntity.addChild(clone);
      expect(meshA.refCount).eq(2);

      clone.getComponent(MeshRenderer).mesh = meshB;
      expect(meshA.refCount).eq(1);
      expect(meshB.refCount).eq(1);

      clone.destroy();
      expect(meshB.refCount).eq(0);
      expect(meshA.refCount).eq(1);

      entity.destroy();
      expect(meshA.refCount).eq(0);
    });
  });

  describe("Particle MeshShape.mesh", () => {
    function createShapeMesh(): ModelMesh {
      const mesh = new ModelMesh(engine);
      mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.setNormals([new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1)]);
      mesh.uploadData(false);
      return mesh;
    }

    it("setter churn transfers the count", () => {
      const meshA = createShapeMesh();
      const meshB = createShapeMesh();
      const shape = new MeshShape();
      shape.mesh = meshA;
      expect(meshA.refCount).eq(1);

      shape.mesh = meshB;
      expect(meshA.refCount).eq(0);
      expect(meshB.refCount).eq(1);

      shape.mesh = null;
      expect(meshB.refCount).eq(0);
    });

    it("destroying the hosting renderer releases the shape's mesh", () => {
      const mesh = createShapeMesh();
      const shape = new MeshShape();
      shape.mesh = mesh;
      const entity = rootEntity.createChild("particleShapeSlot");
      entity.addComponent(ParticleRenderer).generator.emission.shape = shape;
      expect(mesh.refCount).eq(1);

      entity.destroy();
      expect(mesh.refCount).eq(0);
    });

    it("clone acquires via the shape's _cloneTo, destroy releases", () => {
      const mesh = createShapeMesh();
      const shape = new MeshShape();
      shape.mesh = mesh;
      const entity = rootEntity.createChild("particleShapeClone");
      entity.addComponent(ParticleRenderer).generator.emission.shape = shape;
      expect(mesh.refCount).eq(1);

      const clone = entity.clone();
      rootEntity.addChild(clone);
      expect(mesh.refCount).eq(2);

      clone.destroy();
      expect(mesh.refCount).eq(1);

      entity.destroy();
      expect(mesh.refCount).eq(0);
    });
  });

  describe("Template-marked source", () => {
    it("each clone counts the template resource; the suppressed template itself never does", () => {
      const template = engine.createEntity("template");
      const templateResource = new Texture2D(engine, 1, 1);
      (template as any)._markAsTemplate(templateResource);
      expect(templateResource.refCount).eq(0);

      const instA = template.clone();
      rootEntity.addChild(instA);
      expect(templateResource.refCount).eq(1);

      const instB = template.clone();
      expect(templateResource.refCount).eq(2);

      instA.destroy();
      instB.destroy();
      expect(templateResource.refCount).eq(0);

      template.destroy();
      expect(templateResource.refCount).eq(0);
    });
  });
});
