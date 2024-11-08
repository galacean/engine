import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Camera, ParticleRenderer, ModelMesh, Scene, ParticleRenderMode } from "@galacean/engine-core";
import { beforeAll, describe, expect, it } from "vitest";

describe("ParticleRenderer", () => {
  let engine: WebGLEngine;
  let scene: Scene;

  beforeAll(async function () {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas")
    });
    engine.canvas.resizeByClientSize();

    scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");

    const cameraEntity = rootEntity.createChild("Camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 10);

    engine.run();
  });

  it("ParticleRenderer lengthScale", () => {
    const renderer = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    renderer.lengthScale = 1;
    expect(renderer.lengthScale).to.eq(1);
    renderer.lengthScale = -0.333333;
    expect(renderer.lengthScale).to.eq(-0.333333);
    renderer.lengthScale = 0;
    expect(renderer.lengthScale).to.eq(0);
  });

  it("ParticleRenderer velocityScale", () => {
    const renderer = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    renderer.velocityScale = 1.333393;
    expect(renderer.velocityScale).to.eq(1.333393);
    renderer.velocityScale = -0.333333;
    expect(renderer.velocityScale).to.eq(-0.333333);
    renderer.velocityScale = 0;
    expect(renderer.velocityScale).to.eq(0);
  });

  it("ParticleRenderer renderMode", () => {
    const renderer = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    renderer.renderMode = ParticleRenderMode.None;
    expect(renderer.renderMode).to.eq(ParticleRenderMode.None);
    renderer.renderMode = ParticleRenderMode.Billboard;
    expect(renderer.renderMode).to.eq(ParticleRenderMode.Billboard);
    renderer.renderMode = ParticleRenderMode.StretchBillboard;
    expect(renderer.renderMode).to.eq(ParticleRenderMode.StretchBillboard);
    expect(() => {
      renderer.renderMode = ParticleRenderMode.HorizontalBillboard;
    }).to.throw("Not implemented");
    expect(() => {
      renderer.renderMode = ParticleRenderMode.Mesh;
    }).to.throw("Not implemented");
    expect(() => {
      renderer.renderMode = ParticleRenderMode.VerticalBillboard;
    }).to.throw("Not implemented");
  });

  it("refCount", () => {
    const renderer1 = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    const mesh = new ModelMesh(engine, "mesh");
    renderer1.mesh = mesh;
    expect(mesh.refCount).to.eq(1);
    renderer1.mesh = null;
    expect(mesh.refCount).to.eq(0);
    renderer1.mesh = mesh;
    expect(mesh.refCount).to.eq(1);
    renderer1.mesh = undefined;
    expect(mesh.refCount).to.eq(0);
    renderer1.mesh = mesh;
    expect(mesh.refCount).to.eq(1);
    renderer1.destroy();
    expect(mesh.refCount).to.eq(0);

    const entity2 = scene.createRootEntity("entity2");
    entity2.addComponent(ParticleRenderer).mesh = mesh;
    entity2.destroy();
    expect(mesh.refCount).to.eq(0);

    const renderer2 = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
    renderer2.mesh = mesh;

    mesh.destroy();
    expect(mesh.refCount).to.eq(1);

    mesh.destroy(true);
    expect(mesh.refCount).to.eq(0);
  });
});
