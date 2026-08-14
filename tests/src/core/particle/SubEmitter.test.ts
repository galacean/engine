import {
  BoundingBox,
  Burst,
  Camera,
  Color,
  CurveKey,
  Engine,
  GradientAlphaKey,
  GradientColorKey,
  Layer,
  MathUtil,
  ParticleCompositeCurve,
  ParticleCurve,
  ParticleCurveMode,
  ParticleGradient,
  ParticleGradientMode,
  ParticleMaterial,
  ParticleRenderer,
  ParticleSimulationSpace,
  ParticleStopMode,
  ParticleSubEmitterInheritProperty,
  ParticleSubEmitterType,
  Quaternion,
  Scene,
  Shader,
  ShaderMacro,
  ConeShape,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

function updateEngine(engine: Engine, frames: number, deltaTime = 100) {
  //@ts-ignore
  engine._vSyncCount = Infinity;
  //@ts-ignore
  engine._time._lastSystemTime = 0;
  let times = 0;
  performance.now = function () {
    times++;
    return times * deltaTime;
  };
  for (let i = 0; i < frames; i++) {
    engine.update();
  }
  const currentTime = times * deltaTime;
  performance.now = () => currentTime;
}

function readGpuParticleBuffer(renderer: ParticleRenderer, binding: any, ringIndex = 0): Float32Array {
  const gl = (renderer.engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
  gl.finish();
  const floatCount = binding.stride / Float32Array.BYTES_PER_ELEMENT;
  const data = new Float32Array(floatCount);
  binding.buffer.getData(data, ringIndex * binding.stride, 0, floatCount);
  return data;
}

function readFeedbackParticle(renderer: ParticleRenderer, ringIndex = 0): Float32Array {
  return readGpuParticleBuffer(renderer, (renderer.generator as any)._feedbackSimulator.readBinding, ringIndex);
}

function readSubEmitterSpawnState(renderer: ParticleRenderer, ringIndex = 0): Float32Array {
  return readGpuParticleBuffer(
    renderer,
    (renderer.generator as any)._subEmitterSpawnState.simulationBinding,
    ringIndex
  );
}

function enableZeroNoiseFeedback(renderer: ParticleRenderer): void {
  renderer.generator.noise.strengthX.constant = 0;
  renderer.generator.noise.enabled = true;
}

function createParticleRenderer(
  engine: Engine,
  name: string,
  scene = engine.sceneManager.activeScene
): ParticleRenderer {
  const root = scene.getRootEntity() ?? scene.createRootEntity();
  const entity = root.createChild(name);
  const renderer = entity.addComponent(ParticleRenderer);
  const material = new ParticleMaterial(engine);
  material.baseColor = new Color(1, 1, 1, 1);
  renderer.setMaterial(material);

  const generator = renderer.generator;
  generator.useAutoRandomSeed = false;
  generator.main.duration = 5;
  generator.main.isLoop = false;
  generator.main.maxParticles = 1000;
  generator.main.startLifetime.constant = 10;
  generator.emission.rateOverTime.constant = 0;

  return renderer;
}

describe("SubEmitter", () => {
  let engine: Engine;
  let camera: Camera;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");
    const cameraEntity = rootEntity.createChild("Camera");
    camera = cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 10);
    engine.run();
  });

  afterEach(() => {
    camera.cullingMask = Layer.Everything;
  });

  it("Birth runs the target EmissionModule for every live parent", () => {
    const parent = createParticleRenderer(engine, "Parent_Birth");
    const child = createParticleRenderer(engine, "Child_Birth");
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth, undefined, undefined, 99);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(5), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(5);
    expect(child.generator._getAliveParticleCount()).to.equal(25); // 5 parents × 10/s × 0.5s; deathEmitCount is ignored

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("lets a Birth target play independently after its active parent stops", () => {
    const parent = createParticleRenderer(engine, "ActiveRole_Parent");
    const child = createParticleRenderer(engine, "ActiveRole_Child");
    child.generator.emission.rateOverTime.constant = 10;

    const subEmitters = parent.generator.subEmitters;
    subEmitters.enabled = true;
    const slot = subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);
    child.generator.play(false);

    updateEngine(engine, 5);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.play(false);
    updateEngine(engine, 5, 110);

    expect(child.generator._getAliveParticleCount()).to.equal(5);
    expect(subEmitters.subEmitters[0]).to.equal(slot);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("uses a visible Birth target as an independent hierarchy root while its parent is culled", () => {
    const parent = createParticleRenderer(engine, "CulledRole_Parent");
    const child = createParticleRenderer(engine, "CulledRole_Child");
    const grandchild = createParticleRenderer(engine, "CulledRole_Grandchild");
    camera.cullingMask = Layer.Layer0;
    parent.entity.layer = Layer.Layer1;
    child.entity.layer = Layer.Layer0;
    grandchild.entity.layer = Layer.Layer1;
    parent.generator.main.isLoop = true;
    child.generator.emission.rateOverTime.constant = 10;
    grandchild.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    child.generator.subEmitters.enabled = true;
    child.generator.subEmitters.addSubEmitter(grandchild, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    grandchild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 3);
    expect(parent.generator.isAlive).to.equal(true);
    const parentPlayTime = parent.generator._playTime;

    child.generator.play(false);
    updateEngine(engine, 3);
    expect(parent.generator._playTime).to.equal(parentPlayTime);
    expect(child.generator._getAliveParticleCount()).to.be.greaterThan(0);
    expect(grandchild.generator._getAliveParticleCount()).to.be.greaterThan(0);

    parent.entity.destroy();
    child.entity.destroy();
    grandchild.entity.destroy();
  });

  it("updates a culled Birth hierarchy while its root remains visible", () => {
    const parent = createParticleRenderer(engine, "CulledChain_Parent");
    const child = createParticleRenderer(engine, "CulledChain_Child");
    const grandchild = createParticleRenderer(engine, "CulledChain_Grandchild");
    camera.cullingMask = Layer.Layer0;
    parent.entity.layer = Layer.Layer0;
    child.entity.layer = Layer.Layer1;
    grandchild.entity.layer = Layer.Layer1;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    child.generator.subEmitters.enabled = true;
    child.generator.subEmitters.addSubEmitter(grandchild, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    grandchild.generator.emission.rateOverTime.constant = 10;

    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    grandchild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 8);
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    expect(grandchild.generator._getAliveParticleCount()).to.be.greaterThan(1);

    parent.entity.destroy();
    child.entity.destroy();
    grandchild.entity.destroy();
  });

  it("updates a culled Death dependency while its hierarchy root remains visible", () => {
    const parent = createParticleRenderer(engine, "CulledDeath_Parent");
    const child = createParticleRenderer(engine, "CulledDeath_Child");
    camera.cullingMask = Layer.Layer0;
    parent.entity.layer = Layer.Layer0;
    child.entity.layer = Layer.Layer1;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);
    parent.generator.main.isLoop = true;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);

    updateEngine(engine, 3);
    const childPlayTime = child.generator._playTime;
    child.generator.emit(1);
    parent.generator.play(false);
    updateEngine(engine, 3);

    expect(child.generator._playTime).to.be.greaterThan(childPlayTime);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("updates a hierarchy once from the previous frame's camera visibility union", () => {
    const parent = createParticleRenderer(engine, "CameraUnion_Parent");
    const child = createParticleRenderer(engine, "CameraUnion_Child");
    const cameraEntity = parent.entity.scene.createRootEntity("CameraUnion_Camera");
    const secondCamera = cameraEntity.addComponent(Camera);
    camera.cullingMask = Layer.Layer0;
    secondCamera.cullingMask = Layer.Layer1;
    cameraEntity.transform.setPosition(0, 0, 10);
    parent.entity.layer = Layer.Layer1;
    child.entity.layer = Layer.Layer2;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 8);

    expect(parent.generator._playTime).to.be.closeTo(0.8, 1e-6);
    expect(child.generator._getAliveParticleCount()).to.be.greaterThan(1);

    parent.entity.destroy();
    child.entity.destroy();
    cameraEntity.destroy();
  });

  it("Birth random sampling is independent of the particle ring index", () => {
    const sampleStartDelay = (name: string, ringIndex: number): number => {
      const parent = createParticleRenderer(engine, `${name}_Parent`);
      const child = createParticleRenderer(engine, `${name}_Child`);
      parent.generator.randomSeed = 123;
      child.generator.randomSeed = 456;
      child.generator.main.startDelay = new ParticleCompositeCurve(0.2, 0.8);

      const subEmitters = parent.generator.subEmitters;
      subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
      subEmitters._prepareBirthCommandsForParticle(ringIndex, 0, 1, 0, 0, 0);

      const startDelay = (subEmitters as any)._birthStatesByParticle[ringIndex][0].startDelay;
      parent.entity.destroy();
      child.entity.destroy();
      return startDelay;
    };

    expect(sampleStartDelay("BirthRandomFirst", 0)).to.equal(sampleStartDelay("BirthRandomSecond", 17));
  });

  it("Birth Start Delay does not consume the target's standalone random stream", () => {
    const parent = createParticleRenderer(engine, "BirthRandomOwnership_Parent");
    const child = createParticleRenderer(engine, "BirthRandomOwnership_Child");
    const control = createParticleRenderer(engine, "BirthRandomOwnership_Control");
    child.generator.randomSeed = control.generator.randomSeed = 123;
    child.generator.main.startDelay = new ParticleCompositeCurve(0.2, 0.8);
    control.generator.main.startDelay = new ParticleCompositeCurve(0.2, 0.8);

    const subEmitters = parent.generator.subEmitters;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    subEmitters._prepareBirthCommandsForParticle(0, 0, 1, 0, 0, 0);

    expect(child.generator.main._startDelayRand.random()).to.equal(control.generator.main._startDelayRand.random());

    parent.entity.destroy();
    child.entity.destroy();
    control.entity.destroy();
  });

  it("lazily creates Birth state when a Birth slot is added to a live parent", () => {
    const parent = createParticleRenderer(engine, "LazyBirthState_Parent");
    const deathChild = createParticleRenderer(engine, "LazyBirthState_DeathChild");
    const birthChild = createParticleRenderer(engine, "LazyBirthState_BirthChild");
    birthChild.generator.emission.rateOverTime.constant = 10;

    const subEmitters = parent.generator.subEmitters;
    subEmitters.enabled = true;
    subEmitters.addSubEmitter(deathChild, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    birthChild.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 20);
    expect(parent.generator._getAliveParticleCount()).to.equal(1);
    expect((subEmitters as any)._birthStatesByParticle[0]).to.equal(undefined);

    subEmitters.addSubEmitter(birthChild, ParticleSubEmitterType.Birth);
    updateEngine(engine, 5);

    expect(parent.generator._getAliveParticleCount()).to.equal(1);
    expect((subEmitters as any)._birthStatesByParticle[0][1]).to.exist;
    expect(birthChild.generator._getAliveParticleCount()).to.equal(5);

    parent.entity.destroy();
    deathChild.entity.destroy();
    birthChild.entity.destroy();
  });

  it("reuses a retired Birth state across ring slots when no command is pending", () => {
    const parent = createParticleRenderer(engine, "BirthStateReuse_Parent");
    const child = createParticleRenderer(engine, "BirthStateReuse_Child");
    const subEmitters = parent.generator.subEmitters;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    const commands = child.generator._incomingSubEmitterCommands as any[];
    const statesByParticle = (subEmitters as any)._birthStatesByParticle;
    const statePool = (subEmitters as any)._birthStatePool;

    subEmitters._prepareBirthCommandsForParticle(0, 0, 1, 0, 0.1, 0);
    const firstState = statesByParticle[0][0];
    firstState.frameRateTime = 99;
    firstState.currentBurstIndex = 99;

    subEmitters._retireParticle(0);
    expect(statesByParticle[0]).to.have.length(0);
    expect(statePool).to.have.length(1);
    expect(statePool[0]).to.equal(firstState);

    subEmitters._prepareBirthCommandsForParticle(1, 0.1, 1, 0.1, 0.2, 0);

    const reusedState = statesByParticle[1][0];
    expect(reusedState).to.equal(firstState);
    expect(statePool).to.have.length(0);
    expect(reusedState.frameRateTime).to.be.closeTo(0.1, 1e-6);
    expect(reusedState.currentBurstIndex).to.equal(0);
    expect(commands).to.have.length(0);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth evaluates the target Burst separately for every parent", () => {
    const parent = createParticleRenderer(engine, "Parent_NoDouble");
    const child = createParticleRenderer(engine, "Child_NoDouble");

    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(3), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(3);
    expect(child.generator._getAliveParticleCount()).to.equal(12); // 3 parents × Burst 4

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth runs the target Rate Over Time independently for every live parent", () => {
    const child = createParticleRenderer(engine, "SystemRate_Child");
    const parent = createParticleRenderer(engine, "SystemRate_Parent");
    parent.generator.main.startLifetime.constant = 1;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      99
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(2);
    expect(child.generator._getAliveParticleCount()).to.equal(10); // 2 parents × 10/s × 0.5s
    const emissionState = (parent.generator.subEmitters as any)._birthStatesByParticle[0][0];
    expect(emissionState._rateRand).to.equal(undefined);
    expect(emissionState._burstRand).to.equal(undefined);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("emits Birth Rate Over Time only after reaching its first interval", () => {
    const child = createParticleRenderer(engine, "BirthRateBoundary_Child");
    const parent = createParticleRenderer(engine, "BirthRateBoundary_Parent");
    const emitInterval = MathUtil.zeroTolerance * 4;
    const beforeBoundary = MathUtil.zeroTolerance * 3.5;
    child.generator.emission.rateOverTime.constant = 1 / emitInterval;

    const subEmitters = parent.generator.subEmitters;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    const commands = child.generator._incomingSubEmitterCommands as any[];

    subEmitters._prepareBirthCommandsForParticle(0, 0, emitInterval, 0, beforeBoundary, 0);
    expect(commands).to.have.length(0);

    subEmitters._prepareBirthCommandsForParticle(1, 0, emitInterval, 0, emitInterval, 0);
    expect(commands).to.have.length(1);
    expect(commands[0].requestCount).to.equal(1);
    commands.pop().release();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("does not replay disabled Rate Over Time windows", () => {
    const child = createParticleRenderer(engine, "BirthTimeGap_Child");
    const parent = createParticleRenderer(engine, "BirthTimeGap_Parent");
    child.generator.main.duration = 10;
    child.generator.emission.rateOverTime.constant = 10;

    const subEmitters = parent.generator.subEmitters;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    const commands = child.generator._incomingSubEmitterCommands as any[];

    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 0, 0.1, 0);
    expect(commands).to.have.length(1);
    expect(commands[0].requestCount).to.equal(1);
    commands.pop().release();

    child.generator.emission.rateOverTime.constant = 0;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 0.1, 3.1, 0);
    expect(commands).to.have.length(0);

    child.generator.emission.rateOverTime.constant = 10;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 3.1, 3.2, 0);
    expect(commands).to.have.length(1);
    expect(commands[0].requestCount).to.equal(1);
    commands.pop().release();

    child.generator.emission.enabled = false;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 3.2, 4.2, 0);
    expect(commands).to.have.length(0);

    child.generator.emission.enabled = true;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 4.2, 4.3, 0);
    expect(commands).to.have.length(1);
    expect(commands[0].requestCount).to.equal(1);
    commands.pop().release();

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("keeps ordinary transform-feedback state at 24 bytes per particle", () => {
    const renderer = createParticleRenderer(engine, "FeedbackPayload");
    renderer.generator.noise.enabled = true;

    const generator = renderer.generator as any;
    expect(generator._feedbackSimulator.readBinding.stride).to.equal(24);

    const child = createParticleRenderer(engine, "FeedbackPayload_Child");
    generator.subEmitters.enabled = true;
    generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    expect(generator._feedbackSimulator.readBinding.stride).to.equal(48);

    renderer.entity.destroy();
    child.entity.destroy();
  });

  it("does not allocate Birth slot state when an ordinary particle buffer grows", () => {
    const renderer = createParticleRenderer(engine, "OrdinaryGrowth");
    renderer.generator.main.maxParticles = 256;
    renderer.generator.emit(130);

    const generator = renderer.generator as any;
    expect(generator._currentParticleCount).to.equal(256);
    expect(generator.subEmitters._birthStatesByParticle).to.have.length(0);

    renderer.entity.destroy();
  });

  it("keeps simple sub-emitter targets on formula simulation and lazily initializes spawn state", () => {
    const parent = createParticleRenderer(engine, "FormulaTarget_Parent");
    const child = createParticleRenderer(engine, "FormulaTarget_Child");
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 0);
    const childGenerator = child.generator as any;
    expect(childGenerator._feedbackSimulator).to.not.exist;
    expect(childGenerator._subEmitterSpawnState).to.equal(null);

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    expect(childGenerator._subEmitterSpawnState).to.exist;

    const enqueueParentTrajectory = vi.spyOn(childGenerator._subEmitterSpawnState, "enqueueParentTrajectory");
    child.generator.emission.rateOverTime.constant = 0;
    updateEngine(engine, 1);
    expect(enqueueParentTrajectory).not.toHaveBeenCalled();

    enqueueParentTrajectory.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("retains sub-emitter spawn state until particles outlive a removed Birth slot", () => {
    const parent = createParticleRenderer(engine, "RemovedBirthSlot_Parent");
    const child = createParticleRenderer(engine, "RemovedBirthSlot_Child");
    parent.entity.transform.setPosition(3, 0, 0);
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startLifetime.constant = 1;
    child.generator.main.startSpeed.constant = 0;
    child.generator.emission.rateOverTime.constant = 10;

    const subEmitters = parent.generator.subEmitters;
    subEmitters.enabled = true;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    const childGenerator = child.generator as any;
    const spawnState = childGenerator._subEmitterSpawnState;
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    expect(childGenerator._activeSubEmitterParticleCount).to.equal(1);
    expect(readSubEmitterSpawnState(child)[0]).to.be.closeTo(3, 1e-5);

    subEmitters.removeSubEmitterByIndex(0);
    updateEngine(engine, 1);

    expect(child.generator._getAliveParticleCount()).to.equal(1);
    expect(childGenerator._subEmitterSpawnState).to.equal(spawnState);
    expect(childGenerator._activeSubEmitterParticleCount).to.equal(1);
    expect(readSubEmitterSpawnState(child)[0]).to.be.closeTo(3, 1e-5);

    updateEngine(engine, 10);
    expect(child.generator._getAliveParticleCount()).to.equal(0);
    expect(childGenerator._activeSubEmitterParticleCount).to.equal(0);
    expect(childGenerator._subEmitterSpawnState).to.equal(null);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("clears Local Initial-curve shader state after the last sub-emitted particle retires", () => {
    const parent = createParticleRenderer(engine, "ReleasedCurveState_Parent");
    const child = createParticleRenderer(engine, "ReleasedCurveState_Child");
    child.generator.main.startLifetime.constant = 0.5;
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 1))
    );
    child.generator.emission.rateOverTime.constant = 1;

    parent.generator.main.startLifetime.constant = 2;
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false);
    parent.generator.play(false);

    updateEngine(engine, 4, 1000);
    const childGenerator = child.generator as any;
    const initialCurveMacro = ShaderMacro.getByName("RENDERER_INHERIT_VELOCITY_INITIAL_CURVE");
    expect(childGenerator._subEmitterSpawnState).to.exist;
    expect(child.shaderData["_macroCollection"].isEnable(initialCurveMacro)).to.equal(true);

    child.generator.main.startLifetime.constant = 10;
    child.generator.emit(1);
    child.generator.emission.rateOverTime.constant = 0;
    updateEngine(engine, 2, 1000);
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    expect(childGenerator._subEmitterSpawnState).to.equal(null);
    expect(child.shaderData["_macroCollection"].isEnable(initialCurveMacro)).to.equal(false);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("reuses sub-emitter spawn state when retirement and emission share a frame", () => {
    const parent = createParticleRenderer(engine, "SpawnStateReuse_Parent");
    const child = createParticleRenderer(engine, "SpawnStateReuse_Child");
    parent.generator.main.startLifetime.constant = 2;
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.main.startLifetime.constant = 0.1;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    const childGenerator = child.generator as any;
    const spawnState = childGenerator._subEmitterSpawnState;
    const destroy = vi.spyOn(spawnState, "destroy");
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    expect(childGenerator._activeSubEmitterParticleCount).to.equal(1);
    expect(childGenerator._subEmitterSpawnState === spawnState).to.equal(true);
    expect(destroy).not.toHaveBeenCalled();

    destroy.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("rebinds feedback input after an idle sub-emitter target recreates its spawn state", () => {
    const parent = createParticleRenderer(engine, "SpawnStateRecreate_Parent");
    const child = createParticleRenderer(engine, "SpawnStateRecreate_Child");
    parent.entity.transform.setPosition(3, 0, 0);
    parent.generator.main.startLifetime.constant = 2;
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startLifetime.constant = 0.1;
    child.generator.main.startSpeed.constant = 0;
    child.generator.emission.rateOverTime.constant = 10;
    enableZeroNoiseFeedback(child);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    const childGenerator = child.generator as any;
    const firstSpawnState = childGenerator._subEmitterSpawnState;
    expect(readFeedbackParticle(child)[0]).to.be.closeTo(3, 1e-5);

    child.generator.emission.rateOverTime.constant = 0;
    updateEngine(engine, 1);
    expect(childGenerator._subEmitterSpawnState).to.equal(null);

    child.generator.emission.rateOverTime.constant = 10;
    updateEngine(engine, 1);
    expect(childGenerator._subEmitterSpawnState === firstSpawnState).to.equal(false);
    expect(readFeedbackParticle(child, childGenerator._firstActiveElement)[0]).to.be.closeTo(3, 1e-5);
    const gl = (engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
    expect(gl.getError()).to.equal(gl.NO_ERROR);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("does not evaluate Rate over Distance for Birth slots", () => {
    const parent = createParticleRenderer(engine, "BirthDistance_Parent");
    const child = createParticleRenderer(engine, "BirthDistance_Child");
    parent.generator.main.startLifetime.constant = 2;
    parent.generator.main.startSpeed.constant = 10;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.rateOverDistance.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 10);
    expect(child.generator._getAliveParticleCount()).to.equal(0);
    expect((child.generator as any)._subEmitterSpawnState).to.equal(null);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("distinguishes independently emitted particles from sub-emitted particles", () => {
    const parent = createParticleRenderer(engine, "MixedTarget_Parent");
    const child = createParticleRenderer(engine, "MixedTarget_Child");
    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startSpeed.constant = 0;
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 1))
    );
    enableZeroNoiseFeedback(child);
    (child.generator.inheritVelocity as any)._emitterVelocity.set(0, 3, 0);
    child.generator.emit(1);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false);
    parent.generator.play(false);

    updateEngine(engine, 1);

    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    const stride = vertices.length / child.generator._currentParticleCount;
    expect(child.generator._getAliveParticleCount()).to.equal(2);
    expect(vertices[43]).to.equal(3);
    expect(vertices[45]).to.be.greaterThanOrEqual(0);
    expect(vertices[stride + 43]).to.not.equal(0);
    expect(vertices[stride + 45]).to.be.lessThan(0);
    expect(readFeedbackParticle(child)[1]).to.be.closeTo(0.3, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth follows the TF position and keeps full parent speed for Inherit Velocity", () => {
    const child = createParticleRenderer(engine, "SystemVelocity_Child");
    const parent = createParticleRenderer(engine, "SystemVelocity_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 4;
    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startSpeed.constant = 1;
    child.generator.emission.rateOverTime.constant = 10;
    enableZeroNoiseFeedback(child);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      1
    );
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve.constant = 0.5;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    const feedback = readFeedbackParticle(child);
    expect(feedback[2]).to.be.closeTo(-0.4, 1e-4);
    expect(feedback[3]).to.be.closeTo(0, 1e-4);
    expect(feedback[4]).to.be.closeTo(0, 1e-4);
    expect(feedback[5]).to.be.closeTo(-3, 1e-4); // child 1 + parent speed 4 × 0.5

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth velocity inheritance is configured on target generators", () => {
    const firstChild = createParticleRenderer(engine, "TargetVelocity_FirstChild");
    const secondChild = createParticleRenderer(engine, "TargetVelocity_SecondChild");
    const parent = createParticleRenderer(engine, "SlotVelocity_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 4;
    firstChild.generator.main.simulationSpace = ParticleSimulationSpace.World;
    firstChild.generator.main.startSpeed.constant = 0;
    firstChild.generator.emission.rateOverTime.constant = 10;
    firstChild.generator.inheritVelocity.enabled = true;
    firstChild.generator.inheritVelocity.curve.constant = 0.25;
    enableZeroNoiseFeedback(firstChild);
    secondChild.generator.main.simulationSpace = ParticleSimulationSpace.World;
    secondChild.generator.main.startSpeed.constant = 0;
    secondChild.generator.emission.rateOverTime.constant = 10;
    secondChild.generator.inheritVelocity.enabled = true;
    secondChild.generator.inheritVelocity.curve.constant = 0.75;
    enableZeroNoiseFeedback(secondChild);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(firstChild, ParticleSubEmitterType.Birth);
    parent.generator.subEmitters.addSubEmitter(secondChild, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    firstChild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    secondChild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    expect(firstChild.generator._getAliveParticleCount()).to.equal(1);
    expect(secondChild.generator._getAliveParticleCount()).to.equal(1);
    const firstFeedback = readFeedbackParticle(firstChild);
    const secondFeedback = readFeedbackParticle(secondChild);
    expect(firstFeedback[5]).to.be.closeTo(-1, 1e-4);
    expect(secondFeedback[5]).to.be.closeTo(-3, 1e-4);

    parent.entity.destroy();
    firstChild.entity.destroy();
    secondChild.entity.destroy();
  });

  it("Birth applies Initial Inherit Velocity to Local targets", () => {
    const parent = createParticleRenderer(engine, "LocalTargetVelocity_Parent");
    parent.entity.transform.setPosition(2, 0, 0);
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 4;
    parent.generator.subEmitters.enabled = true;
    const children = [
      createParticleRenderer(engine, "LocalTargetVelocity_ConstantChild"),
      createParticleRenderer(engine, "LocalTargetVelocity_CurveChild")
    ];
    children[0].generator.inheritVelocity.curve.constant = 0.5;
    children[1].generator.inheritVelocity.curve = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 0.5), new CurveKey(1, 0.5))
    );
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      child.entity.transform.rotation = new Vector3(90, 0, 0);
      child.generator.main.simulationSpace = ParticleSimulationSpace.Local;
      child.generator.main.startSpeed.constant = 0;
      child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
      child.generator.inheritVelocity.enabled = true;
      enableZeroNoiseFeedback(child);
      parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
      child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    }
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 2);

    const constantFeedback = readFeedbackParticle(children[0]);
    const curveFeedback = readFeedbackParticle(children[1]);
    for (let i = 0; i < 3; i++) {
      expect(curveFeedback[i]).to.be.closeTo(constantFeedback[i], 1e-4);
    }
    const inheritedWorldVelocity = new Vector3(constantFeedback[3], constantFeedback[4], constantFeedback[5]);
    Vector3.transformByQuat(
      inheritedWorldVelocity,
      children[0].entity.transform.worldRotationQuaternion,
      inheritedWorldVelocity
    );
    expect(inheritedWorldVelocity.x).to.be.closeTo(0, 1e-4);
    expect(inheritedWorldVelocity.y).to.be.closeTo(0, 1e-4);
    expect(inheritedWorldVelocity.z).to.be.closeTo(-2, 1e-4);
    expect(curveFeedback[3]).to.be.closeTo(0, 1e-4);
    expect(curveFeedback[4]).to.be.closeTo(0, 1e-4);
    expect(curveFeedback[5]).to.be.closeTo(0, 1e-4);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      expect(child.generator._getAliveParticleCount()).to.equal(1);
      expect(child.bounds.max.x).to.be.greaterThanOrEqual(2);
      expect(child.bounds.min.z).to.be.lessThanOrEqual(-20);
      child.entity.destroy();
    }

    parent.entity.destroy();
  });

  it("applies Local target motion modules once to sub-emitter bounds", () => {
    const parent = createParticleRenderer(engine, "LocalBounds_Parent");
    const child = createParticleRenderer(engine, "LocalBounds_Child");
    const parentGenerator = parent.generator as any;
    const childGenerator = child.generator as any;
    parentGenerator._bounds._sourceBounds = new BoundingBox(new Vector3(), new Vector3());
    parentGenerator._bounds._sourceBoundsFrame = engine.time.frameCount;

    child.generator.main.simulationSpace = ParticleSimulationSpace.Local;
    child.generator.main.startLifetime.constant = 1;
    child.generator.main.startSpeed.constant = 0;
    child.generator.main.startSize.constant = 0;
    child.generator.velocityOverLifetime.enabled = true;
    child.generator.velocityOverLifetime.velocityX.constant = 1;

    childGenerator._bounds.recordSubEmitterEmission(
      0,
      {
        source: parent.generator,
        inheritProperties: ParticleSubEmitterInheritProperty.None
      },
      0
    );
    const bounds = new BoundingBox();
    childGenerator._bounds._updateLocal(bounds);

    expect(bounds.min.x).to.be.closeTo(0, 1e-5);
    expect(bounds.max.x).to.be.closeTo(1, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("applies inherited parent direction speed once to sub-emitter bounds", () => {
    const parent = createParticleRenderer(engine, "DirectionBounds_Parent");
    const child = createParticleRenderer(engine, "DirectionBounds_Child");
    const parentGenerator = parent.generator as any;
    const childGenerator = child.generator as any;
    parentGenerator._bounds._sourceBounds = new BoundingBox(new Vector3(), new Vector3());
    parentGenerator._bounds._sourceBoundsFrame = engine.time.frameCount;

    child.generator.main.simulationSpace = ParticleSimulationSpace.Local;
    child.generator.main.startLifetime.constant = 1;
    child.generator.main.startSpeed.constant = 2;
    child.generator.main.startSize.constant = 0;
    child.generator.main.gravityModifier.constant = 0;

    childGenerator._bounds.recordSubEmitterEmission(
      0,
      {
        source: parent.generator,
        inheritProperties: ParticleSubEmitterInheritProperty.Velocity
      },
      0
    );
    const bounds = new BoundingBox();
    childGenerator._bounds._updateLocal(bounds);

    expect(bounds.min.z).to.be.closeTo(-2, 1e-5);
    expect(bounds.max.z).to.be.closeTo(2, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("keeps inherited sub-particle bounds valid when a Local parent teleports", () => {
    const parent = createParticleRenderer(engine, "TeleportBounds_Parent");
    const child = createParticleRenderer(engine, "TeleportBounds_Child");
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startLifetime.constant = 1;
    child.generator.main.startSpeed.constant = 0;
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve.constant = 1;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    parent.entity.transform.setPosition(100, 0, 0);
    child.generator.emission.rateOverTime.constant = 10;
    updateEngine(engine, 1);

    expect(child.generator._getAliveParticleCount()).to.equal(1);
    expect(child.bounds.max.x).to.be.greaterThanOrEqual(1100);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth preserves a negative target scale in World bounds", () => {
    const child = createParticleRenderer(engine, "WorldTargetScale_Child");
    const parent = createParticleRenderer(engine, "WorldTargetScale_Parent");
    parent.generator.main.startSpeed.constant = 0;
    child.entity.transform.setScale(1, 1, -2);
    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startSpeed.constant = 1;
    child.generator.emission.rateOverTime.constant = 10;
    enableZeroNoiseFeedback(child);
    const shape = new ConeShape();
    shape.angle = 0;
    shape.radius = 0;
    child.generator.emission.shape = shape;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);

    expect(child.generator._getAliveParticleCount()).to.equal(1);
    const feedback = readFeedbackParticle(child);
    expect(feedback[5]).to.be.closeTo(2, 1e-4);
    expect(child.bounds.min.z).to.be.lessThanOrEqual(0);
    expect(child.bounds.max.z).to.be.greaterThanOrEqual(20);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("preserves target trajectory bounds while lazily resolving source bounds", () => {
    const parent = createParticleRenderer(engine, "LazySourceBounds_Parent");
    const child = createParticleRenderer(engine, "LazySourceBounds_Child");
    const parentGenerator = parent.generator as any;
    const childGenerator = child.generator as any;
    parentGenerator._bounds._recordFixedEmission(0, 1, new BoundingBox(new Vector3(-2, -2, -2), new Vector3(2, 2, 2)));
    parentGenerator._isPlaying = true;
    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startLifetime.constant = 1;
    child.generator.main.startSpeed.constant = 10;

    childGenerator._bounds.recordSubEmitterEmission(
      0,
      {
        source: parent.generator,
        inheritProperties: ParticleSubEmitterInheritProperty.None
      },
      0
    );

    expect(childGenerator._bounds._emissionRecords[2]).to.be.lessThan(-10);
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth consumes the post-orbital TF position and finite-difference trajectory velocity", () => {
    const child = createParticleRenderer(engine, "SystemOrbital_Child");
    const parent = createParticleRenderer(engine, "SystemOrbital_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.velocityOverLifetime.enabled = true;
    parent.generator.velocityOverLifetime.orbitalY = new ParticleCompositeCurve(Math.PI / 2);
    parent.generator.velocityOverLifetime.centerOffset.set(-1, 0, 0);

    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startSpeed.constant = 0;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      1
    );
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve.constant = 1;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const parentFeedback = readFeedbackParticle(parent);
    const childFeedback = readSubEmitterSpawnState(child);
    expect(childFeedback[0]).to.be.closeTo(parentFeedback[6], 1e-5);
    expect(childFeedback[1]).to.be.closeTo(parentFeedback[7], 1e-5);
    expect(childFeedback[2]).to.be.closeTo(parentFeedback[8], 1e-5);
    expect(childFeedback[3]).to.be.closeTo(parentFeedback[9], 1e-4);
    expect(childFeedback[4]).to.be.closeTo(parentFeedback[10], 1e-4);
    expect(childFeedback[5]).to.be.closeTo(parentFeedback[11], 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("uses the parent emission point as a World child's orbital origin", () => {
    const child = createParticleRenderer(engine, "ChildOrbitalOrigin_Child");
    const parent = createParticleRenderer(engine, "ChildOrbitalOrigin_Parent");
    parent.entity.transform.setPosition(4, 0, 0);
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));

    const childGenerator = child.generator;
    childGenerator.main.simulationSpace = ParticleSimulationSpace.World;
    childGenerator.main.startSpeed.constant = 0;
    childGenerator.emission.rateOverTime.constant = 10;
    childGenerator.velocityOverLifetime.enabled = true;
    childGenerator.velocityOverLifetime.orbitalY = new ParticleCompositeCurve(Math.PI);
    childGenerator.velocityOverLifetime.centerOffset.set(-1, 0, 0);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    childGenerator.stop(false, ParticleStopMode.StopEmittingAndClear);

    const enableFrustumCulling = camera.enableFrustumCulling;
    camera.enableFrustumCulling = false;
    parent.generator.play(false);
    updateEngine(engine, 3);
    camera.enableFrustumCulling = enableFrustumCulling;

    expect(childGenerator._getAliveParticleCount()).to.be.greaterThan(0);
    const feedback = readFeedbackParticle(child);
    expect(Math.hypot(feedback[0] - 3, feedback[1], feedback[2])).to.be.closeTo(1, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("gathers only requested parent trajectories and keeps the transfer on the GPU", () => {
    const parent = createParticleRenderer(engine, "TrajectoryCopy_Parent");
    const child = createParticleRenderer(engine, "TrajectoryCopy_Child");
    const gl = (engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    while (gl.getError() !== gl.NO_ERROR);
    updateEngine(engine, 1);
    gl.finish();

    expect(child.generator._getAliveParticleCount()).to.equal(2);
    const childGenerator = child.generator as any;
    const sourceBuffer = (parent.generator as any)._feedbackSimulator.readBinding.buffer;
    const spawnState = childGenerator._subEmitterSpawnState;
    const enqueueParentTrajectory = vi.spyOn(spawnState, "enqueueParentTrajectory");
    const gatherDraw = vi.spyOn(spawnState._primitive, "draw");
    const getData = vi.spyOn(sourceBuffer, "getData");

    child.generator.emission.rateOverTime.constant = 0;
    updateEngine(engine, 1);
    expect(enqueueParentTrajectory).not.toHaveBeenCalled();
    expect(gatherDraw).not.toHaveBeenCalled();

    child.generator.emission.rateOverTime.constant = 10;
    updateEngine(engine, 1);
    gl.finish();

    expect(child.generator._getAliveParticleCount()).to.equal(4);
    expect(enqueueParentTrajectory).toHaveBeenCalledTimes(2);
    expect(gatherDraw).toHaveBeenCalledTimes(1);
    expect(getData).not.toHaveBeenCalled();
    expect(gl.getError()).to.equal(gl.NO_ERROR);

    enqueueParentTrajectory.mockRestore();
    gatherDraw.mockRestore();
    getData.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("gathers non-coalesced parent trajectories into matching child slots in one output scope", () => {
    const parent = createParticleRenderer(engine, "TrajectoryWrap_Parent");
    const child = createParticleRenderer(engine, "TrajectoryWrap_Child");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);
    updateEngine(engine, 1);

    const parentGenerator = parent.generator as any;
    const childGenerator = child.generator as any;
    const ringCapacity = parentGenerator._currentParticleCount;
    const sourceBinding = parentGenerator._feedbackSimulator.readBinding;
    const sourceStride = sourceBinding.stride;
    const recordStride = sourceStride / Float32Array.BYTES_PER_ELEMENT;
    const sourceData = new Float32Array(recordStride * ringCapacity);
    sourceData.set([1, 2, 3, 4, 5, 6], (ringCapacity - 1) * recordStride + 6);
    sourceData.set([7, 8, 9, 10, 11, 12], 6);
    sourceBinding.buffer.setData(sourceData);

    const spawnState = childGenerator._subEmitterSpawnState;
    const gatherDraw = vi.spyOn(spawnState._primitive, "draw");
    const beginOutput = vi.spyOn(spawnState._transformFeedback, "begin");
    const endOutput = vi.spyOn(spawnState._transformFeedback, "end");
    spawnState.enqueueParentTrajectory(sourceBinding, ringCapacity - 1, 0, 1);
    spawnState.enqueueParentTrajectory(sourceBinding, 0, 1, 2);
    spawnState.flush();
    const gl = (engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
    gl.finish();

    expect(gatherDraw).toHaveBeenCalledTimes(2);
    expect(beginOutput).toHaveBeenCalledTimes(1);
    expect(endOutput).toHaveBeenCalledTimes(1);
    expect(Array.from(readSubEmitterSpawnState(child, 0))).to.deep.equal([1, 2, 3, 4, 5, 6]);
    expect(Array.from(readSubEmitterSpawnState(child, 1))).to.deep.equal([7, 8, 9, 10, 11, 12]);
    expect(Array.from(readSubEmitterSpawnState(child, 2))).to.deep.equal([7, 8, 9, 10, 11, 12]);
    expect(gl.getError()).to.equal(gl.NO_ERROR);

    gatherDraw.mockRestore();
    beginOutput.mockRestore();
    endOutput.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("reacquires the Gather program after generic shader precompilation", () => {
    const parent = createParticleRenderer(engine, "TrajectoryProgramRestore_Parent");
    const child = createParticleRenderer(engine, "TrajectoryProgramRestore_Child");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);
    updateEngine(engine, 1);

    const parentGenerator = parent.generator as any;
    const childGenerator = child.generator as any;
    const sourceBinding = parentGenerator._feedbackSimulator.readBinding;
    const recordStride = sourceBinding.stride / Float32Array.BYTES_PER_ELEMENT;
    const sourceData = new Float32Array(recordStride * parentGenerator._currentParticleCount);
    sourceData.set([1, 2, 3, 4, 5, 6], 6);
    sourceBinding.buffer.setData(sourceData);

    // Mirrors the shader-program invalidation performed during device restore.
    (Shader as any)._clear(engine);
    (engine as any)._shaderProgramMaps.length = 0;
    Shader.find("Effect/ParticleFeedback").compileVariant(engine, []);

    const gl = (engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
    while (gl.getError() !== gl.NO_ERROR);
    const spawnState = childGenerator._subEmitterSpawnState;
    spawnState.enqueueParentTrajectory(sourceBinding, 0, 0, 1);
    spawnState.flush();
    gl.finish();

    expect(Array.from(readSubEmitterSpawnState(child, 0))).to.deep.equal([1, 2, 3, 4, 5, 6]);
    expect(gl.getError()).to.equal(gl.NO_ERROR);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("duplicates consecutive parent trajectories in child-slot order", () => {
    const parent = createParticleRenderer(engine, "TrajectoryBatch_Parent");
    const child = createParticleRenderer(engine, "TrajectoryBatch_Child");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);
    updateEngine(engine, 1);

    const parentGenerator = parent.generator as any;
    const childGenerator = child.generator as any;
    const sourceBinding = parentGenerator._feedbackSimulator.readBinding;
    const recordStride = sourceBinding.stride / Float32Array.BYTES_PER_ELEMENT;
    const sourceData = new Float32Array(recordStride * 2);
    sourceData.set([1, 2, 3, 4, 5, 6], 6);
    sourceData.set([7, 8, 9, 10, 11, 12], recordStride + 6);
    sourceBinding.buffer.setData(sourceData);

    const spawnState = childGenerator._subEmitterSpawnState;
    const gatherDraw = vi.spyOn(spawnState._primitive, "draw");
    spawnState.enqueueParentTrajectory(sourceBinding, 0, 0, 2);
    spawnState.enqueueParentTrajectory(sourceBinding, 1, 2, 2);
    spawnState.flush();
    const gl = (engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
    gl.finish();

    expect(gatherDraw).toHaveBeenCalledTimes(1);
    expect(Array.from(readSubEmitterSpawnState(child, 0))).to.deep.equal([1, 2, 3, 4, 5, 6]);
    expect(Array.from(readSubEmitterSpawnState(child, 1))).to.deep.equal([1, 2, 3, 4, 5, 6]);
    expect(Array.from(readSubEmitterSpawnState(child, 2))).to.deep.equal([7, 8, 9, 10, 11, 12]);
    expect(Array.from(readSubEmitterSpawnState(child, 3))).to.deep.equal([7, 8, 9, 10, 11, 12]);
    expect(gl.getError()).to.equal(gl.NO_ERROR);

    gatherDraw.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("gathers trajectories from multiple parents sharing one target", () => {
    const parentA = createParticleRenderer(engine, "TrajectoryShared_ParentA");
    const parentB = createParticleRenderer(engine, "TrajectoryShared_ParentB");
    const child = createParticleRenderer(engine, "TrajectoryShared_Child");
    parentA.entity.transform.setPosition(-2, 0, 0);
    parentB.entity.transform.setPosition(3, 0, 0);
    child.generator.emission.rateOverTime.constant = 10;

    for (const parent of [parentA, parentB]) {
      parent.generator.subEmitters.enabled = true;
      parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
      parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
      parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
      parent.generator.play(false);
    }
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(2);
    let positions = [readSubEmitterSpawnState(child, 0)[0], readSubEmitterSpawnState(child, 1)[0]].sort(
      (a, b) => a - b
    );
    expect(positions[0]).to.be.closeTo(-2, 1e-5);
    expect(positions[1]).to.be.closeTo(3, 1e-5);

    const spawnState = (child.generator as any)._subEmitterSpawnState;
    const gatherDraw = vi.spyOn(spawnState._primitive, "draw");
    const beginOutput = vi.spyOn(spawnState._transformFeedback, "begin");
    const endOutput = vi.spyOn(spawnState._transformFeedback, "end");
    updateEngine(engine, 1);

    expect(child.generator._getAliveParticleCount()).to.equal(4);
    expect(gatherDraw).toHaveBeenCalledTimes(2);
    expect(beginOutput).toHaveBeenCalledTimes(1);
    expect(endOutput).toHaveBeenCalledTimes(1);
    positions = [readSubEmitterSpawnState(child, 2)[0], readSubEmitterSpawnState(child, 3)[0]].sort((a, b) => a - b);
    expect(positions[0]).to.be.closeTo(-2, 1e-5);
    expect(positions[1]).to.be.closeTo(3, 1e-5);

    gatherDraw.mockRestore();
    beginOutput.mockRestore();
    endOutput.mockRestore();

    parentA.entity.destroy();
    parentB.entity.destroy();
    child.entity.destroy();
  });

  it("duplicates one parent trajectory across wrapped child slots", () => {
    const parent = createParticleRenderer(engine, "TrajectoryDuplicate_Parent");
    const child = createParticleRenderer(engine, "TrajectoryDuplicate_Child");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);
    updateEngine(engine, 1);

    const parentGenerator = parent.generator as any;
    const childGenerator = child.generator as any;
    const sourceBinding = parentGenerator._feedbackSimulator.readBinding;
    const sourceStride = sourceBinding.stride;
    const sourceData = new Float32Array(sourceStride / Float32Array.BYTES_PER_ELEMENT);
    sourceData.set([1, 2, 3, 4, 5, 6], 6);
    sourceBinding.buffer.setData(sourceData);

    const lastChildIndex = childGenerator._currentParticleCount - 1;
    const spawnState = childGenerator._subEmitterSpawnState;
    const beginOutput = vi.spyOn(spawnState._transformFeedback, "begin");
    const endOutput = vi.spyOn(spawnState._transformFeedback, "end");
    spawnState.enqueueParentTrajectory(sourceBinding, 0, lastChildIndex, 2);
    spawnState.flush();
    const gl = (engine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
    gl.finish();

    expect(beginOutput).toHaveBeenCalledTimes(2);
    expect(endOutput).toHaveBeenCalledTimes(2);
    expect(Array.from(readSubEmitterSpawnState(child, lastChildIndex))).to.deep.equal([1, 2, 3, 4, 5, 6]);
    expect(Array.from(readSubEmitterSpawnState(child, 0))).to.deep.equal([1, 2, 3, 4, 5, 6]);
    expect(gl.getError()).to.equal(gl.NO_ERROR);

    beginOutput.mockRestore();
    endOutput.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("compacts wrapped parent trajectory state for formula rendering", () => {
    const parent = createParticleRenderer(engine, "TrajectoryCompact_Parent");
    const child = createParticleRenderer(engine, "TrajectoryCompact_Child");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);
    updateEngine(engine, 1);

    const parentGenerator = parent.generator as any;
    const childGenerator = child.generator as any;
    expect(childGenerator._feedbackSimulator).to.not.exist;

    const sourceBinding = parentGenerator._feedbackSimulator.readBinding;
    const sourceStride = sourceBinding.stride / Float32Array.BYTES_PER_ELEMENT;
    const sourceData = new Float32Array(sourceStride * 2);
    sourceData.set([1, 2, 3, 4, 5, 6], 6);
    sourceData.set([7, 8, 9, 10, 11, 12], sourceStride + 6);
    sourceBinding.buffer.setData(sourceData);

    const spawnState = childGenerator._subEmitterSpawnState;
    const lastChildIndex = childGenerator._currentParticleCount - 1;
    spawnState.enqueueParentTrajectory(sourceBinding, 0, lastChildIndex, 1);
    spawnState.enqueueParentTrajectory(sourceBinding, 1, 0, 1);
    spawnState.flush();

    childGenerator._firstActiveElement = lastChildIndex;
    childGenerator._firstNewElement = lastChildIndex;
    childGenerator._firstFreeElement = 1;
    childGenerator._addActiveParticlesToVertexBuffer();

    expect(childGenerator._primitive.vertexBufferBindings).to.include(spawnState.renderBinding);
    expect(Array.from(readGpuParticleBuffer(child, spawnState.renderBinding, 0))).to.deep.equal([1, 2, 3, 4, 5, 6]);
    expect(Array.from(readGpuParticleBuffer(child, spawnState.renderBinding, 1))).to.deep.equal([7, 8, 9, 10, 11, 12]);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth uses the current-frame orbital trajectory velocity", () => {
    function simulate(name: string, frames: number, deltaTime: number) {
      const child = createParticleRenderer(engine, name + "_Child");
      const parent = createParticleRenderer(engine, name + "_Parent");
      parent.generator.main.startLifetime.constant = 2;
      parent.generator.main.startSpeed.constant = 0;
      parent.generator.velocityOverLifetime.enabled = true;
      parent.generator.velocityOverLifetime.orbitalY = new ParticleCompositeCurve(Math.PI * 2);
      parent.generator.velocityOverLifetime.centerOffset.set(-1, 0, 0);

      child.generator.main.simulationSpace = ParticleSimulationSpace.World;
      child.generator.main.startSpeed.constant = 0;
      child.generator.emission.rateOverTime.constant = 1;

      parent.generator.subEmitters.enabled = true;
      parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
      child.generator.inheritVelocity.enabled = true;
      child.generator.inheritVelocity.curve.constant = 1;
      parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
      parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
      child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
      parent.generator.play(false);

      updateEngine(engine, frames, deltaTime);

      expect(child.generator._getAliveParticleCount()).to.equal(1);

      const parentFeedback = readFeedbackParticle(parent);
      const childFeedback = readSubEmitterSpawnState(child);
      expect(childFeedback[3]).to.be.closeTo(parentFeedback[9], 1e-4);
      expect(childFeedback[4]).to.be.closeTo(parentFeedback[10], 1e-4);
      expect(childFeedback[5]).to.be.closeTo(parentFeedback[11], 1e-4);

      parent.entity.destroy();
      child.entity.destroy();
      return Math.hypot(childFeedback[3], childFeedback[4], childFeedback[5]);
    }

    const coarseSpeed = simulate("SparseOrbitalCoarse", 10, 100);
    const fineSpeed = simulate("SparseOrbitalFine", 20, 50);
    expect(coarseSpeed).to.be.closeTo(Math.PI * 2, 0.12);
    expect(fineSpeed).to.be.closeTo(Math.PI * 2, 0.04);
    expect(coarseSpeed).to.be.closeTo(fineSpeed, 0.1);
  });

  it("Birth trajectory velocity includes parent Entity motion", () => {
    const child = createParticleRenderer(engine, "EntityMotion_Child");
    const parent = createParticleRenderer(engine, "EntityMotion_Parent");
    parent.generator.main.startLifetime.constant = 2;
    parent.generator.main.startSpeed.constant = 0;
    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startSpeed.constant = 0;
    child.generator.emission.rateOverTime.constant = 5;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve.constant = 1;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    parent.entity.transform.setPosition(1, 0, 0);
    updateEngine(engine, 1);

    expect(child.generator._getAliveParticleCount()).to.equal(1);
    const feedback = readSubEmitterSpawnState(child);
    expect(feedback[0]).to.be.closeTo(1, 1e-4);
    expect(feedback[3]).to.be.closeTo(10, 1e-4);
    expect(feedback[4]).to.be.closeTo(0, 1e-4);
    expect(feedback[5]).to.be.closeTo(0, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("resets the parent trajectory baseline after a culling pause", () => {
    const parent = createParticleRenderer(engine, "CulledTrajectory_Parent");
    const child = createParticleRenderer(engine, "CulledTrajectory_Child");
    camera.cullingMask = Layer.Layer0;
    parent.entity.layer = Layer.Layer0;
    child.entity.layer = Layer.Layer1;
    parent.generator.main.startSpeed.constant = 0;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 2);
    camera.cullingMask = Layer.Layer1;
    updateEngine(engine, 2);
    const pausedPlayTime = parent.generator._playTime;
    parent.entity.transform.setPosition(5, 0, 0);
    updateEngine(engine, 1);
    expect(parent.generator._playTime).to.equal(pausedPlayTime);

    camera.cullingMask = Layer.Layer0;
    updateEngine(engine, 2);

    const feedback = readFeedbackParticle(parent);
    expect(feedback[6]).to.be.closeTo(5, 1e-4);
    expect(feedback[9]).to.be.closeTo(0, 1e-4);
    expect(feedback[10]).to.be.closeTo(0, 1e-4);
    expect(feedback[11]).to.be.closeTo(0, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("resets the parent trajectory baseline while simulation is paused", () => {
    const parent = createParticleRenderer(engine, "PausedTrajectory_Parent");
    const child = createParticleRenderer(engine, "PausedTrajectory_Child");
    parent.generator.main.simulationSpace = ParticleSimulationSpace.Local;
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    parent.generator.main.simulationSpeed = 0;
    parent.entity.transform.setPosition(1, 0, 0);
    updateEngine(engine, 1);
    expect((parent.generator as any)._resetTrajectoryOnNextFeedback).to.equal(true);

    parent.generator.main.simulationSpeed = 1;
    updateEngine(engine, 1);
    const feedback = readFeedbackParticle(parent);
    expect(feedback[9]).to.be.closeTo(0, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth evaluates target Start Delay and Burst", () => {
    const child = createParticleRenderer(engine, "SystemEmission_Child");
    const parent = createParticleRenderer(engine, "SystemEmission_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 1;
    child.generator.main.startDelay.constant = 0.2;
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      1
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 2);
    expect(child.generator._getAliveParticleCount()).to.equal(0);
    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(2);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("ignores a stopped target's standalone Start Delay while simulating Birth dependencies", () => {
    const child = createParticleRenderer(engine, "StandaloneDelay_Child");
    const parent = createParticleRenderer(engine, "StandaloneDelay_Parent");
    child.generator.main.startDelay.constant = 1;
    child.generator.play(false);
    child.generator.main.startDelay.constant = 0;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);

    expect((child.generator as any)._playTime).to.be.closeTo(0.1, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("timestamps Birth events after a parent Start Delay ends mid-frame", () => {
    const child = createParticleRenderer(engine, "ParentDelay_Child");
    const parent = createParticleRenderer(engine, "ParentDelay_Parent");
    parent.generator.main.startDelay.constant = 0.05;
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    const childGenerator = child.generator as any;
    const instanceStride = childGenerator._instanceVertices.length / childGenerator._currentParticleCount;
    const particleOffset = childGenerator._firstActiveElement * instanceStride;
    expect(childGenerator._instanceVertices[particleOffset + 7]).to.be.closeTo(0.05, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth samples target Start Size curves from the parent age including target Start Delay", () => {
    const child = createParticleRenderer(engine, "BirthStartSize_Child");
    const parent = createParticleRenderer(engine, "BirthStartSize_Parent");
    parent.generator.main.startLifetime.constant = 1;
    child.generator.main.duration = 5;
    child.generator.main.startDelay.constant = 0.2;
    child.generator.main.startSize = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 2))
    );
    child.generator.emission.rateOverTime.constant = 2;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 7);

    expect(child.generator._getAliveParticleCount()).to.equal(1);
    expect((child.generator as any)._instanceVertices[12]).to.be.closeTo(1.4, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("shares the target particle capacity across Birth parent timelines", () => {
    const child = createParticleRenderer(engine, "SharedBudget_Child");
    const parent = createParticleRenderer(engine, "SharedBudget_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 10;
    child.generator.main.maxParticles = 3;
    child.generator.emission.rateOverTime.constant = 1000;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(2), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    const addNewParticle = vi.spyOn(child.generator as any, "_addNewParticle");
    updateEngine(engine, 5);

    expect(child.generator._getAliveParticleCount()).to.equal(3);
    expect(addNewParticle).toHaveBeenCalledTimes(child.generator.main.maxParticles);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("advances Birth timelines while the target capacity is zero", () => {
    const child = createParticleRenderer(engine, "ZeroCapacity_Child");
    const parent = createParticleRenderer(engine, "ZeroCapacity_Parent");
    parent.generator.main.startLifetime.constant = 2;
    child.generator.main.maxParticles = 0;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 5);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    child.generator.main.maxParticles = 100;
    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("emits each Birth time window once", () => {
    const child = createParticleRenderer(engine, "BatchQueue_Child");
    const parent = createParticleRenderer(engine, "BatchQueue_Parent");
    parent.generator.main.startLifetime.constant = 1;
    child.generator.emission.rateOverTime.constant = 20;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 5);
    expect(child.generator._getAliveParticleCount()).to.equal(10);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth runtime state follows parent slots through ring-buffer growth", () => {
    const child = createParticleRenderer(engine, "SystemResize_Child");
    const parent = createParticleRenderer(engine, "SystemResize_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.maxParticles = 256;
    child.generator.main.maxParticles = 256;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.None,
      1,
      1
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(130), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    expect(parent.generator._getAliveParticleCount()).to.equal(130);
    expect(child.generator._getAliveParticleCount()).to.equal(130);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("gathers into remapped child slots when Birth grows a wrapped ring", () => {
    const child = createParticleRenderer(engine, "WrappedGrowth_Child");
    const parent = createParticleRenderer(engine, "WrappedGrowth_Parent");
    const childGenerator = child.generator as any;
    child.generator.main.maxParticles = 256;
    child.generator.main.startLifetime.constant = 0.05;
    child.generator.emit(3);
    child.generator.main.startLifetime.constant = 10;
    child.generator.emit(123);
    child.generator.stop(false);

    updateEngine(engine, 1);
    expect(childGenerator._currentParticleCount).to.equal(128);
    expect(childGenerator._firstRetiredElement).to.equal(3);
    expect(childGenerator._firstFreeElement).to.equal(126);
    child.generator.emit(3);
    expect(childGenerator._firstFreeElement).to.equal(1);

    parent.entity.transform.setPosition(7, 0, 0);
    parent.generator.main.startLifetime.constant = 2;
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(5), 1, 0.01));
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    expect(childGenerator._currentParticleCount).to.equal(256);
    expect(childGenerator._firstFreeElement).to.equal(6);
    for (const ringIndex of [1, 2, 3, 4, 5]) {
      expect(readSubEmitterSpawnState(child, ringIndex)[0]).to.be.closeTo(7, 1e-5);
    }

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("preserves both wrapped ring segments when the particle buffer shrinks", () => {
    const child = createParticleRenderer(engine, "WrappedShrink_Child");
    const parent = createParticleRenderer(engine, "WrappedShrink_Parent");
    const generator = parent.generator as any;
    parent.generator.main.maxParticles = 127;
    parent.generator.main.startLifetime.constant = 0.1;
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);

    parent.generator.emit(100);
    updateEngine(engine, 2);
    expect(parent.generator._getAliveParticleCount()).to.equal(0);

    parent.generator.main.startLifetime.constant = 10;
    parent.generator.emit(50);
    updateEngine(engine, 1);
    expect(generator._firstRetiredElement).to.equal(100);
    expect(generator._firstFreeElement).to.equal(22);

    const statesByParticle = generator.subEmitters._birthStatesByParticle;
    const tailState = statesByParticle[100][0];
    const frontState = statesByParticle[0][0];
    const instanceStride = generator._instanceVertices.length / generator._currentParticleCount;
    generator._instanceVertices[100 * instanceStride] = 1000;
    generator._instanceVertices[0] = 2000;

    const feedbackStride = generator._feedbackSimulator.readBinding.stride / 4;
    const feedbackPrimitive = generator._feedbackSimulator._simulator._primitive;
    feedbackPrimitive._readIsA = false;
    const feedbackData = new Float32Array(generator._currentParticleCount * feedbackStride);
    feedbackData[100 * feedbackStride] = 3000;
    feedbackData[0] = 4000;
    generator._feedbackSimulator.readBinding.buffer.setData(feedbackData);

    parent.generator.main.maxParticles = 60;
    generator._resizeInstanceBuffer(61);

    expect(generator._currentParticleCount).to.equal(61);
    expect(generator._firstRetiredElement).to.equal(0);
    expect(generator._firstActiveElement).to.equal(0);
    expect(generator._firstFreeElement).to.equal(50);
    expect(generator._instanceVertices[0]).to.equal(1000);
    expect(generator._instanceVertices[28 * instanceStride]).to.equal(2000);
    const resizedStatesByParticle = generator.subEmitters._birthStatesByParticle;
    expect(resizedStatesByParticle[0][0]).to.equal(tailState);
    expect(resizedStatesByParticle[28][0]).to.equal(frontState);

    const resizedFeedback = new Float32Array(generator._currentParticleCount * feedbackStride);
    expect(feedbackPrimitive._readIsA).to.equal(false);
    generator._feedbackSimulator.readBinding.buffer.getData(resizedFeedback, 0, 0, resizedFeedback.length);
    expect(resizedFeedback[0]).to.equal(3000);
    expect(resizedFeedback[28 * feedbackStride]).to.equal(4000);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death fires sub-emitter when parent particles age out", () => {
    const parent = createParticleRenderer(engine, "Parent_Death");
    const child = createParticleRenderer(engine, "Child_Death");
    parent.generator.main.startLifetime.constant = 0.5;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death, undefined, undefined, 3);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 10);
    expect(parent.generator._getAliveParticleCount()).to.equal(0);
    expect(child.generator._getAliveParticleCount()).to.equal(12); // 4 deaths × deathEmitCount 3

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("dispatches Death when a newly emitted particle expires during same-frame catch-up", () => {
    const parent = createParticleRenderer(engine, "SameFrameDeath_Parent");
    const child = createParticleRenderer(engine, "SameFrameDeath_Child");
    const grandchild = createParticleRenderer(engine, "SameFrameDeath_Grandchild");
    parent.generator.main.startLifetime.constant = 1;
    child.generator.main.startLifetime.constant = 0.05;
    child.generator.main.startSpeed.constant = 2;
    grandchild.generator.main.simulationSpace = ParticleSimulationSpace.World;
    grandchild.generator.main.startSpeed.constant = 0;
    grandchild.generator.inheritVelocity.enabled = true;
    grandchild.generator.inheritVelocity.curve.constant = 1;
    enableZeroNoiseFeedback(grandchild);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    child.generator.subEmitters.enabled = true;
    child.generator.subEmitters.addSubEmitter(grandchild, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    grandchild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);

    expect(child.generator._getAliveParticleCount()).to.equal(0);
    expect(grandchild.generator._getAliveParticleCount()).to.equal(1);
    const feedback = readFeedbackParticle(grandchild);
    expect(feedback[3]).to.be.closeTo(0, 1e-4);
    expect(feedback[4]).to.be.closeTo(0, 1e-4);
    expect(feedback[5]).to.be.closeTo(-2, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
    grandchild.entity.destroy();
  });

  it("retires an expired Birth particle during same-frame catch-up without downstream sub-emitters", () => {
    const parent = createParticleRenderer(engine, "SameFrameRetire_Parent");
    const child = createParticleRenderer(engine, "SameFrameRetire_Child");
    parent.generator.main.startLifetime.constant = 1;
    child.generator.main.startLifetime.constant = 0.01;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    child.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);

    expect(child.generator._getAliveParticleCount()).to.equal(0);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("reuses capacity retired during the trajectory feedback frame", () => {
    const parent = createParticleRenderer(engine, "RetiredCapacity_Parent");
    const child = createParticleRenderer(engine, "RetiredCapacity_Child");
    parent.generator.main.maxParticles = 255;
    parent.generator.main.startLifetime.constant = 0.1;
    parent.generator.emission.rateOverTime.constant = 2550;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);
    expect(parent.generator._getAliveParticleCount()).to.equal(255);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    const resizeInstanceBuffer = vi.spyOn(parent.generator as any, "_resizeInstanceBuffer");
    updateEngine(engine, 1);
    expect(parent.generator._getAliveParticleCount()).to.equal(255);
    expect(child.generator._getAliveParticleCount()).to.equal(255);
    const resizeCount = resizeInstanceBuffer.mock.calls.length;
    expect(resizeCount).to.be.greaterThan(0);

    updateEngine(engine, 1);
    expect(parent.generator._getAliveParticleCount()).to.equal(255);
    expect(child.generator._getAliveParticleCount()).to.equal(510);
    expect(resizeInstanceBuffer).toHaveBeenCalledTimes(resizeCount);

    resizeInstanceBuffer.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death consumes the current transform-feedback position at the particle lifetime", () => {
    const parent = createParticleRenderer(engine, "Parent_DeathCurrentPosition");
    const child = createParticleRenderer(engine, "Child_DeathCurrentPosition");
    parent.generator.main.startLifetime.constant = 0.25;
    parent.generator.main.startSpeed.constant = 20;
    parent.generator.main.gravityModifier.constant = 0;
    child.generator.main.startLifetime.constant = 1;
    child.generator.main.startSpeed.constant = 0;
    child.generator.main.gravityModifier.constant = 0;
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve.constant = 0.5;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 1);
    parent.generator.stop(false);
    updateEngine(engine, 4);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const feedback = readSubEmitterSpawnState(child);
    expect(feedback[0]).to.be.closeTo(0, 1e-5);
    expect(feedback[1]).to.be.closeTo(0, 1e-5);
    expect(feedback[2]).to.be.closeTo(-5, 1e-5);
    expect(child.bounds.min.z).to.be.lessThanOrEqual(-15);
    expect(child.bounds.max.z).to.be.greaterThanOrEqual(-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death uses the target Inherit Velocity module with parent velocity", () => {
    const parent = createParticleRenderer(engine, "DeathVelocity_Parent");
    const child = createParticleRenderer(engine, "DeathVelocity_Child");
    parent.generator.main.startLifetime.constant = 0.25;
    parent.generator.main.startSpeed.constant = 4;
    parent.generator.main.gravityModifier.constant = 0;
    child.generator.main.simulationSpace = ParticleSimulationSpace.World;
    child.generator.main.startSpeed.constant = 0;
    child.generator.inheritVelocity.enabled = true;
    child.generator.inheritVelocity.curve.constant = 0.5;
    enableZeroNoiseFeedback(child);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const feedback = readFeedbackParticle(child);
    expect(feedback[3]).to.be.closeTo(0, 1e-4);
    expect(feedback[4]).to.be.closeTo(0, 1e-4);
    expect(feedback[5]).to.be.closeTo(-2, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death timestamps child particles at the parent lifetime boundary", () => {
    const parent = createParticleRenderer(engine, "Parent_DeathTimestamp");
    const child = createParticleRenderer(engine, "Child_DeathTimestamp");
    parent.generator.main.startLifetime.constant = 0.25;
    parent.generator.main.gravityModifier.constant = 0;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 3);
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[7]).to.be.closeTo(0.25, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death samples target Start Size curves at the end of the parent lifetime", () => {
    const parent = createParticleRenderer(engine, "DeathStartSize_Parent");
    const child = createParticleRenderer(engine, "DeathStartSize_Child");
    parent.generator.main.startLifetime.constant = 0.25;
    child.generator.main.duration = 5;
    child.generator.main.startSize = new ParticleCompositeCurve(
      new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 2))
    );

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 3);

    expect(child.generator._getAliveParticleCount()).to.equal(1);
    expect((child.generator as any)._instanceVertices[12]).to.be.closeTo(2, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("updates surviving and current-frame particles in one feedback pass", () => {
    const parent = createParticleRenderer(engine, "Parent_DeathPartialFeedback");
    const child = createParticleRenderer(engine, "Child_DeathPartialFeedback");
    parent.generator.main.startLifetime.constant = 10;
    parent.generator.main.startSpeed.constant = 2;
    parent.generator.main.gravityModifier.constant = 0;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.emission.addBurst(new Burst(0.15, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    const feedbackUpdate = vi.spyOn((parent.generator as any)._feedbackSimulator, "update");
    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();
    feedbackUpdate.mockClear();
    engine.update();
    performance.now = () => time;

    expect(parent.generator._getAliveParticleCount()).to.equal(2);
    expect(feedbackUpdate).toHaveBeenCalledTimes(1);
    expect(feedbackUpdate.mock.calls[0].slice(2, 5)).to.deep.equal([0, 2, 1]);

    const binding = parent.generator._feedbackSimulator.readBinding;
    const feedbackStride = binding.stride / Float32Array.BYTES_PER_ELEMENT;
    const feedback = new Float32Array(feedbackStride * 2);
    binding.buffer.getData(feedback, 0, 0, feedback.length);
    expect(feedback[2]).to.be.closeTo(-0.4, 1e-5);
    expect(feedback[feedbackStride + 2]).to.be.closeTo(-0.1, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Death slot reconciles transform-feedback on enable (deserialize path)", () => {
    const parent = createParticleRenderer(engine, "Parent_Reconcile");
    const child = createParticleRenderer(engine, "Child_Reconcile");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death, undefined, undefined, 3);

    // Mimic deserialization: a Death slot is present but transform-feedback was never set up
    // (config restored without going through the setters that call _setTransformFeedback).
    (parent.generator as any)._feedbackSimulator.destroy();
    (parent.generator as any)._feedbackSimulator = null;

    // Re-enable runs _onEnable, which reconciles transform-feedback from the current config.
    parent.entity.isActive = false;
    parent.entity.isActive = true;

    expect((parent.generator as any)._feedbackSimulator).to.not.equal(null);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("emitProbability = 0 skips all events", () => {
    const parent = createParticleRenderer(engine, "Parent_Prob");
    const child = createParticleRenderer(engine, "Child_Prob");
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth, undefined, 0);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(20), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(20);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Disabled module does not dispatch", () => {
    const parent = createParticleRenderer(engine, "Parent_Disabled");
    const child = createParticleRenderer(engine, "Child_Disabled");
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = false;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(3), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(parent.generator._getAliveParticleCount()).to.equal(3);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("does not allocate Birth runtime state while its target is disabled", () => {
    const parent = createParticleRenderer(engine, "Parent_DisabledTarget");
    const child = createParticleRenderer(engine, "Child_DisabledTarget");
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    child.enabled = false;

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(3), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    const statesByParticle = (parent.generator.subEmitters as any)._birthStatesByParticle;
    expect(statesByParticle.filter(Boolean)).to.have.length(0);
    expect(child.generator._incomingSubEmitterCommands).to.have.length(0);
    expect(parent.generator._feedbackSimulator?.trajectoryEnabled).to.equal(true);

    child.enabled = true;
    updateEngine(engine, 1);
    expect(statesByParticle.filter(Boolean)).to.have.length(3);
    expect(child.generator._getAliveParticleCount()).to.equal(3);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Color inherit multiplies parent start color into child", () => {
    const parent = createParticleRenderer(engine, "Parent_Color");
    const child = createParticleRenderer(engine, "Child_Color");
    parent.generator.main.startColor.constant = new Color(0.5, 0.25, 1.0, 1.0);
    child.generator.main.startColor.constant = new Color(1.0, 1.0, 1.0, 1.0);
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.Color
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // a_StartColor @ float offsets 8..11 (slot 0 = first emitted slot)
    expect(verts[8]).to.be.closeTo(0.5, 1e-4); // r
    expect(verts[9]).to.be.closeTo(0.25, 1e-4); // g
    expect(verts[10]).to.be.closeTo(1.0, 1e-4); // b

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Self-reference throws at configuration time", () => {
    const parent = createParticleRenderer(engine, "Parent_Self");

    parent.generator.subEmitters.enabled = true;
    expect(() => parent.generator.subEmitters.addSubEmitter(parent, ParticleSubEmitterType.Birth)).to.throw(
      "Sub-emitter would create a cycle"
    );

    parent.entity.destroy();
  });

  it("rejects an empty sub-emitter target", () => {
    const parent = createParticleRenderer(engine, "EmptyTarget_Parent");

    expect(() => parent.generator.subEmitters.addSubEmitter(null, ParticleSubEmitterType.Birth)).to.throw(
      "Sub-emitter target cannot be null"
    );
    expect(parent.generator.subEmitters.subEmitters).to.have.length(0);

    parent.entity.destroy();
  });

  it("rejects destroyed targets while tolerating targets destroyed after configuration", () => {
    const parent = createParticleRenderer(engine, "DestroyedTarget_Parent");
    const liveTarget = createParticleRenderer(engine, "DestroyedTarget_Live");
    const destroyedTarget = createParticleRenderer(engine, "DestroyedTarget_Destroyed");
    destroyedTarget.destroy();

    expect(() => parent.generator.subEmitters.addSubEmitter(destroyedTarget, ParticleSubEmitterType.Birth)).to.throw(
      "Sub-emitter target has been destroyed"
    );

    const slot = parent.generator.subEmitters.addSubEmitter(liveTarget, ParticleSubEmitterType.Birth);
    expect(() => (slot.emitter = destroyedTarget)).to.throw("Sub-emitter target has been destroyed");
    expect(slot.emitter).to.equal(liveTarget);

    parent.generator.subEmitters.enabled = true;
    expect(parent.generator._feedbackSimulator?.trajectoryEnabled).to.equal(true);
    liveTarget.destroy();
    updateEngine(engine, 1);
    expect(parent.generator._feedbackSimulator?.trajectoryEnabled ?? false).to.equal(false);
    parent.generator.subEmitters.enabled = false;
    expect(() => (parent.generator.subEmitters.enabled = true)).not.to.throw();

    parent.entity.destroy();
    liveTarget.entity.destroy();
    destroyedTarget.entity.destroy();
  });

  it("releases trajectory feedback when a sub-emitter target is cleared", () => {
    const parent = createParticleRenderer(engine, "ClearedTarget_Parent");
    const child = createParticleRenderer(engine, "ClearedTarget_Child");
    const slot = parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.subEmitters.enabled = true;

    expect(parent.generator._feedbackSimulator?.trajectoryEnabled).to.equal(true);
    slot.emitter = null;
    expect(parent.generator._feedbackSimulator?.trajectoryEnabled ?? false).to.equal(false);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("rejects sub-emitters from another scene at configuration time", () => {
    const parent = createParticleRenderer(engine, "CrossScene_Parent");
    const secondScene = new Scene(engine, "CrossScene_Target");
    engine.sceneManager.addScene(secondScene);
    const child = createParticleRenderer(engine, "CrossScene_Child", secondScene);
    expect(parent.entity.scene).not.to.equal(child.entity.scene);

    expect(() => parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth)).to.throw(
      "Sub-emitter target must belong to the same scene as its parent particle system"
    );

    parent.entity.destroy();
    child.entity.destroy();
    secondScene.destroy();
  });

  it("rejects assigning an existing sub-emitter to another scene", () => {
    const parent = createParticleRenderer(engine, "CrossSceneAssignment_Parent");
    const child = createParticleRenderer(engine, "CrossSceneAssignment_Child");
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    const secondScene = new Scene(engine, "CrossSceneAssignment_Target");
    engine.sceneManager.addScene(secondScene);
    const target = createParticleRenderer(engine, "CrossSceneAssignment_Target", secondScene);

    expect(() => (parent.generator.subEmitters.subEmitters[0].emitter = target)).to.throw(
      "Sub-emitter target must belong to the same scene as its parent particle system"
    );
    expect(parent.generator.subEmitters.subEmitters[0].emitter).to.equal(child);

    parent.entity.destroy();
    child.entity.destroy();
    target.entity.destroy();
    secondScene.destroy();
  });

  it("skips sub-emitters after their target moves to another scene", () => {
    const parent = createParticleRenderer(engine, "MovedTarget_Parent");
    const child = createParticleRenderer(engine, "MovedTarget_Child");
    parent.generator.main.startLifetime.constant = 0.1;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death, undefined, undefined, 3);
    parent.generator.subEmitters.enabled = true;
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    updateEngine(engine, 1);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.play(false);

    const secondScene = new Scene(engine, "MovedTarget_Scene");
    engine.sceneManager.addScene(secondScene);
    secondScene.addRootEntity(child.entity);
    expect(parent.entity.scene).not.to.equal(child.entity.scene);

    expect(() => updateEngine(engine, 3)).not.to.throw();
    expect(parent.generator._getAliveParticleCount()).to.equal(0);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    parent.entity.destroy();
    child.entity.destroy();
    secondScene.destroy();
  });

  it("caches dependency topology until the graph changes", () => {
    const child = createParticleRenderer(engine, "TopologyCache_Child");
    const parent = createParticleRenderer(engine, "TopologyCache_Parent");
    const manager = (parent.entity.scene as any)._componentsManager._particleSystemManager;
    const rebuild = vi.spyOn(manager, "_rebuildTopology");

    updateEngine(engine, 3);
    expect(rebuild).toHaveBeenCalledTimes(1);

    parent.generator.subEmitters.enabled = true;
    updateEngine(engine, 2);
    expect(rebuild).toHaveBeenCalledTimes(2);

    const slot = parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    updateEngine(engine, 2);
    expect(rebuild).toHaveBeenCalledTimes(3);

    slot.type = ParticleSubEmitterType.Death;
    updateEngine(engine, 2);
    expect(rebuild).toHaveBeenCalledTimes(4);

    parent.generator.subEmitters.removeSubEmitterByIndex(0);
    updateEngine(engine, 2);
    expect(rebuild).toHaveBeenCalledTimes(5);

    slot.type = ParticleSubEmitterType.Birth;
    updateEngine(engine, 2);
    expect(rebuild).toHaveBeenCalledTimes(5);

    const extra = createParticleRenderer(engine, "TopologyCache_Extra");
    updateEngine(engine, 2);
    expect(rebuild).toHaveBeenCalledTimes(6);

    extra.entity.destroy();
    updateEngine(engine, 2);
    expect(rebuild).toHaveBeenCalledTimes(7);

    rebuild.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("schedules a shared target once across multiple sub-emitter slots", () => {
    const child = createParticleRenderer(engine, "SharedTopologyTarget_Child");
    const parent = createParticleRenderer(engine, "SharedTopologyTarget_Parent");
    const subEmitters = parent.generator.subEmitters;
    subEmitters.enabled = true;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);

    updateEngine(engine, 1);

    const ordered = (parent.entity.scene as any)._componentsManager._particleSystemManager
      ._orderedRenderers as ParticleRenderer[];
    expect(ordered.indexOf(parent)).to.be.lessThan(ordered.indexOf(child));
    expect(ordered.filter((renderer) => renderer === child)).to.have.length(1);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Indirect cycle A→B→A throws at configuration time", () => {
    const a = createParticleRenderer(engine, "Cycle_A");
    const b = createParticleRenderer(engine, "Cycle_B");

    // A → B is fine.
    a.generator.subEmitters.enabled = true;
    a.generator.subEmitters.addSubEmitter(b, ParticleSubEmitterType.Birth);

    // B → A would close the cycle A→B→A.
    b.generator.subEmitters.enabled = true;
    expect(() => b.generator.subEmitters.addSubEmitter(a, ParticleSubEmitterType.Birth)).to.throw(
      "Sub-emitter would create a cycle"
    );

    a.entity.destroy();
    b.entity.destroy();
  });

  it("Multi-level Birth chain consumes each target EmissionModule in topological order", () => {
    const c = createParticleRenderer(engine, "Chain_C");
    const b = createParticleRenderer(engine, "Chain_B");
    const a = createParticleRenderer(engine, "Chain_A");
    b.generator.emission.rateOverTime.constant = 10;
    c.generator.emission.rateOverTime.constant = 10;

    a.generator.subEmitters.enabled = true;
    a.generator.subEmitters.addSubEmitter(b, ParticleSubEmitterType.Birth);
    b.generator.subEmitters.enabled = true;
    b.generator.subEmitters.addSubEmitter(c, ParticleSubEmitterType.Birth);

    a.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    a.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    b.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    c.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    a.generator.play(false);

    updateEngine(engine, 3);
    expect(a.generator._getAliveParticleCount()).to.equal(1);
    expect(b.generator._getAliveParticleCount()).to.equal(3);
    expect(c.generator._getAliveParticleCount()).to.equal(3);

    a.entity.destroy();
    b.entity.destroy();
    c.entity.destroy();
  });

  it("Color inherit at Death uses parent's COL-modulated value (matches visible color)", () => {
    // Parent: startColor white, COL fades to (0.5, 0.5, 0.5, 1) at t=1.
    // Child:  startColor white.
    // Death inherit Color → child.a_StartColor = parent.startColor × COL(1) × child.startColor
    //   = (1,1,1,1) × (0.5,0.5,0.5,1) × (1,1,1,1) = (0.5, 0.5, 0.5, 1).
    // Inheriting the visible color (not the raw start color) keeps children
    // consistent with what the parent looked like the moment it died.
    const parent = createParticleRenderer(engine, "Parent_ColorCOL");
    const child = createParticleRenderer(engine, "Child_ColorCOL");

    parent.generator.main.startLifetime.constant = 0.5;
    parent.generator.main.startColor.constant = new Color(1, 1, 1, 1);
    child.generator.main.startColor.constant = new Color(1, 1, 1, 1);

    // Parent COL: white at t=0 → half-grey at t=1.
    const colorKeys = [
      new GradientColorKey(0, new Color(1, 1, 1, 1)),
      new GradientColorKey(1, new Color(0.5, 0.5, 0.5, 1))
    ];
    const alphaKeys = [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)];
    const parentCOL = parent.generator.colorOverLifetime;
    parentCOL.enabled = true;
    parentCOL.color.mode = ParticleGradientMode.Gradient;
    (parentCOL.color as any).gradient = new ParticleGradient(colorKeys, alphaKeys);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Death,
      ParticleSubEmitterInheritProperty.Color
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 10);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // a_StartColor @ float offsets 8..11
    expect(verts[8]).to.be.closeTo(0.5, 1e-3); // r
    expect(verts[9]).to.be.closeTo(0.5, 1e-3); // g
    expect(verts[10]).to.be.closeTo(0.5, 1e-3); // b
    expect(verts[11]).to.be.closeTo(1.0, 1e-3); // a

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Size inherit at Death uses parent's SOL-modulated value (matches visible size)", () => {
    // Parent: startSize 10, SOL Curve ramps 1 → 0.5 across lifetime.
    // Child:  startSize 2.
    // Death inherit Size → child.a_StartSize = parent.startSize × SOL(1) × child.startSize
    //                                        = 10 × 0.5 × 2 = 10.
    const parent = createParticleRenderer(engine, "Parent_SizeSOL");
    const child = createParticleRenderer(engine, "Child_SizeSOL");

    parent.generator.main.startLifetime.constant = 0.5;
    parent.generator.main.startSize.constant = 10;
    child.generator.main.startSize.constant = 2;

    const sizeCurve = new ParticleCurve(new CurveKey(0, 1), new CurveKey(1, 0.5));
    const parentSOL = parent.generator.sizeOverLifetime;
    parentSOL.enabled = true;
    parentSOL.size.mode = ParticleCurveMode.Curve;
    (parentSOL.size as any).curve = sizeCurve;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Death,
      ParticleSubEmitterInheritProperty.Size
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 10);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // a_StartSize @ float offsets 12..14
    expect(verts[12]).to.be.closeTo(10, 1e-3); // x
    expect(verts[13]).to.be.closeTo(10, 1e-3); // y
    expect(verts[14]).to.be.closeTo(10, 1e-3); // z
    expect(child.bounds.max.x).to.be.greaterThanOrEqual(10);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Rotation inherit adds parent start rotation onto child start rotation", () => {
    // Parent: startRotationZ 0.5 rad. Child: startRotationZ 0.25 rad.
    // Birth inherit Rotation → child.a_StartRotation = child.startRotation + parent.startRotation
    //                                                = 0.25 + 0.5 = 0.75 rad.
    const parent = createParticleRenderer(engine, "Parent_Rotation");
    const child = createParticleRenderer(engine, "Child_Rotation");

    parent.generator.main.startRotationZ.constant = 0.5;
    child.generator.main.startRotationZ.constant = 0.25;
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.Rotation
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // 2D rotation mode (default) stores Z rotation in the X slot of a_StartRotation0 (float offset 15).
    expect(verts[15]).to.be.closeTo(0.75, 1e-3);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Rotation inherit at Death adds parent's ROL-accumulated rotation", () => {
    // Parent: startRotationZ 0, ROL.rotationZ rate 2 per second, lifetime 0.5s.
    //   Accumulated rotation at Death (normalizedAge=1) = 2 × 0.5 = 1.0.
    // Child:  startRotationZ 0.25.
    // Death inherit Rotation → child.a_StartRotation
    //   = child.startRotation + (parent.startRotation + cumulative ROL)
    //   = 0.25 + (0 + 1.0) = 1.25.
    const parent = createParticleRenderer(engine, "Parent_RotationROL");
    const child = createParticleRenderer(engine, "Child_RotationROL");

    parent.generator.main.startLifetime.constant = 0.5;
    parent.generator.main.startRotationZ.constant = 0;
    child.generator.main.startRotationZ.constant = 0.25;

    const parentROL = parent.generator.rotationOverLifetime;
    parentROL.enabled = true;
    parentROL.rotationZ.mode = ParticleCurveMode.Constant;
    parentROL.rotationZ.constant = 2;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Death,
      ParticleSubEmitterInheritProperty.Rotation
    );

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 10);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const verts = (child.generator as any)._instanceVertices as Float32Array;
    // a_StartRotation0.x @ float offset 15 (2D mode stores Z rotation here)
    expect(verts[15]).to.be.closeTo(1.25, 1e-3);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("World-space Velocity inherit rotates feedback velocity by the spawn rotation (regression)", () => {
    // World sim, gravity off, cone angle 0 → feedback velocity is exactly (0,0,-1) in the
    // spawn-local frame. That frame persists in the feedback buffer regardless of sim space,
    // so converting to world must use the emitter's spawn rotation, not identity.
    function build(name: string, rotXDeg: number) {
      const parent = createParticleRenderer(engine, name + "_P");
      const child = createParticleRenderer(engine, name + "_C");
      parent.generator.main.simulationSpace = ParticleSimulationSpace.World;
      parent.generator.main.gravityModifier.constant = 0;
      parent.generator.main.startLifetime.constant = 0.5;
      parent.generator.main.startSpeed.constant = 2;
      child.generator.main.startSpeed.constant = 1;
      enableZeroNoiseFeedback(child);
      const shape = new ConeShape();
      shape.angle = 0;
      shape.radius = 0;
      parent.generator.emission.shape = shape;
      parent.entity.transform.rotation = new Vector3(rotXDeg, 0, 0);
      parent.generator.subEmitters.enabled = true;
      parent.generator.subEmitters.addSubEmitter(
        child,
        ParticleSubEmitterType.Death,
        ParticleSubEmitterInheritProperty.Velocity,
        undefined,
        1
      );
      parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
      parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
      child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
      parent.generator.play();
      return { parent, child };
    }
    const straight = build("VelStraight", 0);
    const spun = build("VelSpun", 90);
    updateEngine(engine, 10);

    expect(straight.child.generator._getAliveParticleCount()).to.equal(1);
    const straightFeedback = readFeedbackParticle(straight.child);
    expect(straightFeedback[3]).to.be.closeTo(0, 1e-4);
    expect(straightFeedback[4]).to.be.closeTo(0, 1e-4);
    expect(straightFeedback[5]).to.be.closeTo(-1, 1e-4);

    // Spawn rotation 90° about X maps (0,0,-1) → (0,1,0); under the bug it stayed (0,0,-1).
    const spunFeedback = readFeedbackParticle(spun.child);
    expect(spunFeedback[3]).to.be.closeTo(0, 1e-4);
    expect(spunFeedback[4]).to.be.closeTo(1, 1e-4);
    expect(spunFeedback[5]).to.be.closeTo(0, 1e-4);

    straight.parent.entity.destroy();
    straight.child.entity.destroy();
    spun.parent.entity.destroy();
    spun.child.entity.destroy();
  });

  it("Birth Inherit Velocity uses the parent world trajectory", () => {
    function build(name: string, rotXDeg: number) {
      const parent = createParticleRenderer(engine, name + "_P");
      const child = createParticleRenderer(engine, name + "_C");
      parent.generator.main.startSpeed.constant = 2;
      child.generator.main.simulationSpace = ParticleSimulationSpace.World;
      child.generator.main.startSpeed.constant = 0;
      child.generator.emission.rateOverTime.constant = 10;
      const shape = new ConeShape();
      shape.angle = 0;
      shape.radius = 0;
      parent.generator.emission.shape = shape;
      parent.entity.transform.rotation = new Vector3(rotXDeg, 0, 0);
      parent.generator.subEmitters.enabled = true;
      parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
      child.generator.inheritVelocity.enabled = true;
      child.generator.inheritVelocity.curve.constant = 1;
      parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
      parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
      child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
      parent.generator.play(false);
      return { parent, child };
    }
    const straight = build("BirthVelStraight", 0);
    const spun = build("BirthVelSpun", 90);
    updateEngine(engine, 1);

    expect(straight.child.generator._getAliveParticleCount()).to.equal(1);
    const straightFeedback = readSubEmitterSpawnState(straight.child);
    expect(straightFeedback[3]).to.be.closeTo(0, 1e-4);
    expect(straightFeedback[4]).to.be.closeTo(0, 1e-4);
    expect(straightFeedback[5]).to.be.closeTo(-2, 1e-4);

    const spunFeedback = readSubEmitterSpawnState(spun.child);
    expect(spunFeedback[3]).to.be.closeTo(0, 1e-4);
    expect(spunFeedback[4]).to.be.closeTo(2, 1e-4);
    expect(spunFeedback[5]).to.be.closeTo(0, 1e-4);

    straight.parent.entity.destroy();
    straight.child.entity.destroy();
    spun.parent.entity.destroy();
    spun.child.entity.destroy();
  });

  it("Birth Velocity property follows the parent trajectory direction without inheriting speed", () => {
    const parent = createParticleRenderer(engine, "BirthDirection_Parent");
    const child = createParticleRenderer(engine, "BirthDirection_Child");
    parent.generator.main.startSpeed.constant = 4;
    parent.generator.main.startLifetime.constant = 1;
    parent.entity.transform.rotation = new Vector3(90, 0, 0);
    child.generator.main.startSpeed.constant = 1;
    child.generator.emission.rateOverTime.constant = 10;
    enableZeroNoiseFeedback(child);

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterInheritProperty.Velocity
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    updateEngine(engine, 1);

    expect(child.generator._getAliveParticleCount()).to.equal(1);
    const feedback = readFeedbackParticle(child);
    expect(feedback[3]).to.be.closeTo(0, 1e-4);
    expect(feedback[4]).to.be.closeTo(1, 1e-4);
    expect(feedback[5]).to.be.closeTo(0, 1e-4);
    expect(child.bounds.max.y).to.be.greaterThanOrEqual(10);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth enables transform-feedback to sample the parent trajectory", () => {
    const parent = createParticleRenderer(engine, "Encap_TypeParent");
    const child = createParticleRenderer(engine, "Encap_TypeChild");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    expect((parent.generator as any)._feedbackSimulator).to.not.equal(null);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Changing a slot's emitter to form a cycle throws", () => {
    const a = createParticleRenderer(engine, "Encap_CycleA");
    const b = createParticleRenderer(engine, "Encap_CycleB");
    const c = createParticleRenderer(engine, "Encap_CycleC");
    a.generator.subEmitters.enabled = true;
    b.generator.subEmitters.enabled = true;
    a.generator.subEmitters.addSubEmitter(b, ParticleSubEmitterType.Birth); // A → B
    b.generator.subEmitters.addSubEmitter(c, ParticleSubEmitterType.Birth); // B → C

    // Redirect B's slot from C to A — that closes A → B → A. The setter must reject it.
    const slot = b.generator.subEmitters.subEmitters[0];
    expect(() => {
      slot.emitter = a;
    }).to.throw("Sub-emitter would create a cycle");
    expect(slot.emitter).to.equal(c); // value left unchanged on rejection

    a.entity.destroy();
    b.entity.destroy();
    c.entity.destroy();
  });

  it("Sub-emitter stays inert on WebGL1 instead of crashing on Death", () => {
    const parent = createParticleRenderer(engine, "WebGL1_Parent");
    const child = createParticleRenderer(engine, "WebGL1_Child");
    parent.generator.main.startLifetime.constant = 0.5;

    // Pretend WebGL1 from the start: the whole module must be inert (enabled → false),
    // and no transform-feedback buffer is built, so a parent death never reads a null buffer.
    const hardwareRenderer = (engine as any)._hardwareRenderer;
    const realIsWebGL2 = hardwareRenderer._isWebGL2;
    hardwareRenderer._isWebGL2 = false;
    try {
      parent.generator.subEmitters.enabled = true;
      parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death, undefined, undefined, 3);

      expect(parent.generator.subEmitters.enabled).to.equal(false);
      expect((parent.generator as any)._feedbackSimulator).to.not.exist;

      parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(4), 1, 0.01));
      parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
      child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
      parent.generator.play();
      expect(() => updateEngine(engine, 10)).to.not.throw(); // parent death must not crash
      expect(child.generator._getAliveParticleCount()).to.equal(0); // Death inert on WebGL1
    } finally {
      hardwareRenderer._isWebGL2 = realIsWebGL2;
    }

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Cloned sub-emitter slots re-link to the cloned module", () => {
    const parent = createParticleRenderer(engine, "CloneParent");
    const child = createParticleRenderer(engine, "CloneChild");
    parent.generator.randomSeed = 123;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);

    const cloneEntity = parent.entity.clone();
    engine.sceneManager.activeScene.addRootEntity(cloneEntity);
    const cloneRenderer = cloneEntity.getComponent(ParticleRenderer);
    const cloneSlot = cloneRenderer.generator.subEmitters.subEmitters[0];

    expect((cloneSlot as any)._module).to.equal(cloneRenderer.generator.subEmitters);
    expect((cloneSlot as any)._module).to.not.equal(parent.generator.subEmitters);
    expect((cloneRenderer.generator.subEmitters as any)._probabilityRand.random()).to.equal(
      (parent.generator.subEmitters as any)._probabilityRand.random()
    );
    expect((cloneRenderer.generator.inheritVelocity as any)._curveRand.random()).to.equal(
      (parent.generator.inheritVelocity as any)._curveRand.random()
    );

    expect(() => (cloneSlot.type = ParticleSubEmitterType.Death)).to.not.throw();

    cloneEntity.destroy();
    parent.entity.destroy();
    child.entity.destroy();
  });
});
