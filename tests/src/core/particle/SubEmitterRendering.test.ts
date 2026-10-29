import {
  Burst,
  Camera,
  CurveKey,
  Entity,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleInheritVelocityMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  ParticleStopMode,
  ParticleSubEmitterType,
  PrimitiveMesh,
  RenderTarget,
  Texture2D,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Sub-emitter rendering", () => {
  let engine: WebGLEngine;
  let camera: Camera;
  let colorTexture: Texture2D;
  let canvas: HTMLCanvasElement;
  let time: number;

  beforeEach(async () => {
    time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    canvas = document.createElement("canvas");
    engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 } });
    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor.set(0, 0, 0, 1);
    camera = scene.createRootEntity("Camera").addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 10);
    camera.isOrthographic = true;
    camera.orthographicSize = 8;
    camera.enableFrustumCulling = false;
    colorTexture = new Texture2D(engine, 128, 128, undefined, false);
    camera.renderTarget = new RenderTarget(engine, 128, 128, colorTexture);
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
  });

  function tick(frames = 1): void {
    for (let i = 0; i < frames; i++) {
      time += 25;
      engine.update();
    }
  }

  function createRenderer(name: string): ParticleRenderer {
    const entity = new Entity(engine, name);
    const renderer = entity.addComponent(ParticleRenderer);
    renderer.setMaterial(new ParticleMaterial(engine));
    const generator = renderer.generator;
    generator.useAutoRandomSeed = false;
    generator.randomSeed = 42;
    generator.main.playOnEnabled = false;
    generator.main.isLoop = false;
    generator.main.startSpeed.constant = 0;
    generator.main.startLifetime.constant = 10;
    generator.main.startSize.constant = 0.2;
    generator.main.simulationSpace = ParticleSimulationSpace.World;
    generator.emission.rateOverTime.constant = 0;
    generator.emission.shape = null;
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    engine.sceneManager.activeScene.addRootEntity(entity);
    return renderer;
  }

  function visiblePixels(): { count: number; x: number; y: number } {
    const pixels = new Uint8Array(128 * 128 * 4);
    colorTexture.getPixelBuffer(pixels);
    let count = 0;
    let x = 0;
    let y = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 100 || pixels[i + 1] > 100 || pixels[i + 2] > 100) {
        count++;
        x += (i / 4) % 128;
        y += Math.floor(i / 4 / 128);
      }
    }
    return { count, x: x / count + 0.5, y: y / count + 0.5 };
  }

  it("renders textured Mesh children with random Velocity and Force within 16 attributes", () => {
    const parent = createRenderer("Parent");
    const child = createRenderer("Child");
    (parent.getMaterial() as ParticleMaterial).baseColor.set(0, 0, 0, 1);
    child.renderMode = ParticleRenderMode.Mesh;
    child.mesh = PrimitiveMesh.createCuboid(engine);
    child.generator.main.startSize.constant = 0.8;
    const texture = new Texture2D(engine, 1, 1, undefined, false);
    texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
    (child.getMaterial() as ParticleMaterial).baseTexture = texture;
    const { velocityOverLifetime, forceOverLifetime } = child.generator;
    velocityOverLifetime.enabled = true;
    velocityOverLifetime.velocityX = new ParticleCompositeCurve(1, 2);
    velocityOverLifetime.velocityY = new ParticleCompositeCurve(1, 2);
    velocityOverLifetime.velocityZ = new ParticleCompositeCurve(1, 2);
    forceOverLifetime.enabled = true;
    forceOverLifetime.forceX = new ParticleCompositeCurve(1, 2);
    forceOverLifetime.forceY = new ParticleCompositeCurve(1, 2);
    forceOverLifetime.forceZ = new ParticleCompositeCurve(1, 2);
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1)));
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    const gl = canvas.getContext("webgl2")!;
    const linkProgram = vi.spyOn(gl, "linkProgram");
    parent.generator.emit(1);
    tick();

    expect(child.generator.isAlive).to.equal(true);
    expect(visiblePixels().count).to.be.greaterThan(0);
    expect(linkProgram.mock.calls.length).to.be.greaterThan(0);
    for (const [program] of linkProgram.mock.calls) {
      expect(gl.getProgramParameter(program!, gl.LINK_STATUS)).to.equal(true);
      expect(gl.getProgramParameter(program!, gl.ACTIVE_ATTRIBUTES)).to.be.lessThanOrEqual(16);
    }
  });

  for (const space of [ParticleSimulationSpace.World, ParticleSimulationSpace.Local]) {
    for (const feedback of [false, true]) {
      it(`keeps changed Initial curves inside ${ParticleSimulationSpace[space]} bounds (${feedback ? "TF" : "formula"})`, () => {
        const parent = createRenderer("Parent");
        const child = createRenderer("Child");
        (parent.getMaterial() as ParticleMaterial).baseColor.set(0, 0, 0, 1);
        parent.generator.main.startLifetime.constant = 0.05;
        parent.generator.main.startSize.constant = 0;
        parent.generator.velocityOverLifetime.enabled = true;
        parent.generator.velocityOverLifetime.velocityX.constant = 10;
        child.generator.main.simulationSpace = space;
        child.entity.transform.setRotation(0, 0, 90);
        const flatCurve = (value: number) =>
          new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, value), new CurveKey(1, value)));
        child.generator.inheritVelocity.enabled = true;
        child.generator.inheritVelocity.mode = ParticleInheritVelocityMode.Initial;
        child.generator.inheritVelocity.curve = flatCurve(0);
        if (feedback) {
          child.generator.noise.strengthX.constant = 0;
          child.generator.noise.enabled = true;
        }
        child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1)));
        parent.generator.subEmitters.enabled = true;
        parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
        parent.generator.emit(1);
        tick(4);
        expect(parent.generator.isAlive).to.equal(false);

        if (space === ParticleSimulationSpace.Local) {
          child.entity.transform.setRotation(0, 0, 0);
        }
        child.generator.inheritVelocity.curve = flatCurve(2);
        tick(4);
        engine.time.timeScale = 0;
        const pixels = visiblePixels();
        expect(pixels.count).to.be.greaterThan(0);
        const x = (pixels.x / 128 - 0.5) * camera.orthographicSize * 2;
        const y = (pixels.y / 128 - 0.5) * camera.orthographicSize * 2;
        expect(x).to.be.greaterThan(1.5);
        expect(child.bounds.min.x).to.be.lessThanOrEqual(x);
        expect(child.bounds.max.x).to.be.greaterThanOrEqual(x);
        camera.entity.transform.setPosition(x, y, 10);
        camera.orthographicSize = 0.3;
        tick();
        const unculledCount = visiblePixels().count;
        expect(unculledCount).to.be.greaterThan(0);
        camera.enableFrustumCulling = true;
        tick();
        expect(visiblePixels().count).to.equal(unculledCount);
      });
    }
  }
});
