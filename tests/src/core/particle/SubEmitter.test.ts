import {
  Burst,
  Camera,
  Color,
  CurveKey,
  Engine,
  GradientAlphaKey,
  GradientColorKey,
  Layer,
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
  Scene,
  ConeShape,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

function getInFlightTrajectoryReadbackBatches(generator: object): Array<{ readback: any; commands: any[] }> {
  return (generator as any)._trajectoryReadback?._inFlightBatches ?? [];
}

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
  const resolveReadbacks = () => {
    for (const scene of engine.sceneManager.scenes) {
      const renderers = (scene as any)._componentsManager._particleSystemManager._renderers as ParticleRenderer[];
      for (const renderer of renderers) {
        const batches = getInFlightTrajectoryReadbackBatches(renderer.generator);
        for (let i = 0, n = batches.length; i < n; i++) {
          batches[i].readback._platformReadback.isReady = () => true;
        }
      }
    }
  };
  for (let i = 0; i < frames; i++) {
    engine.update();
    resolveReadbacks();
  }
  const currentTime = times * deltaTime;
  performance.now = () => currentTime;
  engine.update();
  resolveReadbacks();
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
    (engine as any)._bufferReadbackPool.gc();
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
    updateEngine(engine, 5);

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
      subEmitters._prepareBirthCommandsForParticle(ringIndex, 0, 1, 0, 0, 0, 0, []);

      const startDelay = (subEmitters as any)._birthStatesByParticle[ringIndex][0].startDelay;
      parent.entity.destroy();
      child.entity.destroy();
      return startDelay;
    };

    expect(sampleStartDelay("BirthRandomFirst", 0)).to.equal(sampleStartDelay("BirthRandomSecond", 17));
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
    const commands: any[] = [];
    const statesByParticle = (subEmitters as any)._birthStatesByParticle;
    const statePool = (subEmitters as any)._birthStatePool;

    subEmitters._prepareBirthCommandsForParticle(0, 0, 1, 0, 0.1, 0, 0.1, commands);
    const firstState = statesByParticle[0][0];
    firstState.emissionState.distanceAccumulator = 1;
    firstState.emissionState.setLastEmitPosition(new Vector3(1, 0, 0));
    firstState.resetDistanceOnNextFeedback = true;

    subEmitters._retireParticle(0);
    expect(statesByParticle[0]).to.have.length(0);
    expect(statePool).to.have.length(1);
    expect(statePool[0]).to.equal(firstState);

    subEmitters._prepareBirthCommandsForParticle(1, 0.1, 1, 0.1, 0.2, 0.1, 0.2, commands);

    const reusedState = statesByParticle[1][0];
    expect(reusedState).to.equal(firstState);
    expect(statePool).to.have.length(0);
    expect(reusedState.resetDistanceOnNextFeedback).to.equal(true);
    expect(reusedState.emissionState.distanceAccumulator).to.equal(0);
    expect(reusedState.emissionState.hasLastEmitPosition).to.equal(false);
    expect(commands).to.have.length(0);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("isolates a retired Birth state while its pending Command completes", () => {
    const parent = createParticleRenderer(engine, "BirthStateOverlap_Parent");
    const child = createParticleRenderer(engine, "BirthStateOverlap_Child");
    child.generator.emission.rateOverTime.constant = 10;
    const subEmitters = parent.generator.subEmitters;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    const commands: any[] = [];
    const statesByParticle = (subEmitters as any)._birthStatesByParticle;
    const statePool = (subEmitters as any)._birthStatePool;

    subEmitters._prepareBirthCommandsForParticle(0, 0, 1, 0, 0.1, 0, 0.1, commands);
    const pendingCommand = commands.pop();
    const firstState = pendingCommand.state;
    firstState.emissionState.distanceAccumulator = 1;

    subEmitters._retireParticle(0);
    expect(statesByParticle[0]).to.have.length(0);
    expect(statePool).to.have.length(0);
    child.generator.emission.rateOverTime.constant = 0;
    subEmitters._prepareBirthCommandsForParticle(0, 0.1, 1, 0.1, 0.2, 0.1, 0.2, commands);

    const replacementState = statesByParticle[0][0];
    expect(replacementState).not.to.equal(firstState);
    expect(pendingCommand.state).to.equal(firstState);
    expect(firstState.emissionState.distanceAccumulator).to.equal(1);
    expect(replacementState.emissionState.distanceAccumulator).to.equal(0);
    expect(statePool).to.have.length(0);

    pendingCommand.release();
    expect(statePool).to.have.length(1);

    subEmitters._prepareBirthCommandsForParticle(1, 0.2, 1, 0.2, 0.3, 0.2, 0.3, commands);
    expect(statesByParticle[1][0]).to.equal(firstState);
    expect(statePool).to.have.length(0);
    expect(commands).to.have.length(0);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("removes released Birth commands from their target index", () => {
    const parent = createParticleRenderer(engine, "BirthCommandIndex_Parent");
    const child = createParticleRenderer(engine, "BirthCommandIndex_Child");
    child.generator.emission.rateOverTime.constant = 10;
    const subEmitters = parent.generator.subEmitters;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    const commands: any[] = [];

    subEmitters._prepareBirthCommandsForParticle(0, 0, 1, 0, 0.1, 0, 0.1, commands);
    subEmitters._prepareBirthCommandsForParticle(1, 0, 1, 0, 0.1, 0, 0.1, commands);
    const firstCommand = commands[0];
    const secondCommand = commands[1];
    const targetCommands = (child.generator as any)._pendingBirthSubEmitterCommands;
    expect(targetCommands).to.deep.equal([firstCommand, secondCommand]);

    firstCommand.release();
    expect(targetCommands).to.deep.equal([secondCommand]);

    secondCommand.release();
    expect(targetCommands).to.have.length(0);

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

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("skips Birth feedback readback until an emission request is due", () => {
    const child = createParticleRenderer(engine, "BirthReadback_Child");
    const parent = createParticleRenderer(engine, "BirthReadback_Parent");
    parent.generator.main.startLifetime.constant = 2;
    child.generator.emission.rateOverTime.constant = 1;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    const createReadback = vi.spyOn((engine as any)._hardwareRenderer, "createPlatformBufferReadback");
    updateEngine(engine, 9);
    expect(createReadback).not.toHaveBeenCalled();

    updateEngine(engine, 1);
    expect(createReadback).toHaveBeenCalledTimes(1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    createReadback.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("does not replay skipped Rate Over Time windows", () => {
    const child = createParticleRenderer(engine, "BirthTimeGap_Child");
    const parent = createParticleRenderer(engine, "BirthTimeGap_Parent");
    child.generator.main.duration = 10;
    child.generator.emission.rateOverTime.constant = 10;

    const subEmitters = parent.generator.subEmitters;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    const commands: any[] = [];

    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 0, 0.1, 0, 0.1, commands);
    expect(commands).to.have.length(1);
    expect(commands[0].requestCount).to.equal(1);
    commands.pop().release();

    child.generator.emission.rateOverTime.constant = 0;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 0.1, 3.1, 0.1, 3.1, commands);
    expect(commands).to.have.length(0);

    child.generator.emission.rateOverTime.constant = 10;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 3.1, 3.2, 3.1, 3.2, commands);
    expect(commands).to.have.length(1);
    expect(commands[0].requestCount).to.equal(1);
    commands.pop().release();

    child.generator.emission.enabled = false;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 3.2, 4.2, 3.2, 4.2, commands);
    expect(commands).to.have.length(0);

    child.generator.emission.enabled = true;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 4.2, 4.3, 4.2, 4.3, commands);
    expect(commands).to.have.length(1);
    expect(commands[0].requestCount).to.equal(1);
    commands.pop().release();

    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 6.2, 6.3, 6.2, 6.3, commands);
    expect(commands).to.have.length(1);
    expect(commands[0].requestCount).to.equal(1);
    commands.pop().release();

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("resets Rate Over Distance across inactive windows", () => {
    const child = createParticleRenderer(engine, "BirthDistanceGap_Child");
    const parent = createParticleRenderer(engine, "BirthDistanceGap_Parent");
    child.generator.emission.rateOverDistance.constant = 10;

    const subEmitters = parent.generator.subEmitters;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    const commands: any[] = [];

    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 0, 0.1, 0, 0.1, commands);
    const initialCommand = commands.pop();
    initialCommand.resolveTrajectory(new Vector3(0.1, 0, 0), new Vector3(1, 0, 0));
    initialCommand.finalizeRequests(Infinity);
    expect(initialCommand.requestCount).to.equal(1);
    initialCommand.release();

    child.generator.emission.rateOverDistance.constant = 0;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 0.1, 1.1, 0.1, 1.1, commands);
    expect(commands).to.have.length(0);

    child.generator.emission.rateOverDistance.constant = 10;
    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 1.1, 1.2, 1.1, 1.2, commands);
    const resumedCommand = commands.pop();
    resumedCommand.resolveTrajectory(new Vector3(1.2, 0, 0), new Vector3(1, 0, 0));
    resumedCommand.finalizeRequests(Infinity);
    expect(resumedCommand.requestCount).to.equal(0);
    resumedCommand.release();

    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 1.2, 1.3, 1.2, 1.3, commands);
    const nextCommand = commands.pop();
    nextCommand.resolveTrajectory(new Vector3(1.3, 0, 0), new Vector3(1, 0, 0));
    nextCommand.finalizeRequests(Infinity);
    expect(nextCommand.requestCount).to.equal(1);
    nextCommand.release();

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("bounds deferred Rate Over Distance requests by target capacity", () => {
    const child = createParticleRenderer(engine, "BirthDistanceCapacity_Child");
    const parent = createParticleRenderer(engine, "BirthDistanceCapacity_Parent");
    child.generator.emission.rateOverDistance.constant = 1000;

    const subEmitters = parent.generator.subEmitters;
    subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    const commands: any[] = [];

    subEmitters._prepareBirthCommandsForParticle(0, 0, 10, 0, 0.1, 0, 0.1, commands);
    const command = commands.pop();
    command.resolveTrajectory(new Vector3(1, 0, 0), new Vector3(10, 0, 0));
    command.finalizeRequests(2);

    expect(command.requestCount).to.equal(2);
    expect(command.requests).to.have.length(2);
    command.release();

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("queues later Birth windows while an earlier GPU fence is pending", () => {
    const child = createParticleRenderer(engine, "AsyncReadback_Child");
    const parent = createParticleRenderer(engine, "AsyncReadback_Parent");
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();

    const generator = parent.generator as any;
    const batches = getInFlightTrajectoryReadbackBatches(generator);
    const firstReadback = batches[0].readback;
    const firstRead = vi.spyOn(firstReadback, "getData");
    firstReadback._platformReadback.isReady = () => false;
    engine.update();
    expect(batches).to.have.length(2);
    const secondReadback = batches[1].readback;
    expect(secondReadback).not.to.equal(firstReadback);
    const secondRead = vi.spyOn(secondReadback, "getData");
    secondReadback._platformReadback.isReady = () => false;
    expect(firstRead).not.toHaveBeenCalled();
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    firstReadback._platformReadback.isReady = () => true;
    engine.update();
    expect(firstRead).toHaveBeenCalledTimes(1);
    expect(secondRead).not.toHaveBeenCalled();
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("keeps updating while trajectory readbacks are pending", () => {
    const child = createParticleRenderer(engine, "PendingReadback_Child");
    const parent = createParticleRenderer(engine, "PendingReadback_Parent");
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();

    const generator = parent.generator as any;
    const batches = getInFlightTrajectoryReadbackBatches(generator);
    batches[0].readback._platformReadback.isReady = () => false;
    const initialPlayTime = generator._playTime;
    for (let i = 1; i < 5; i++) {
      engine.update();
      batches[i].readback._platformReadback.isReady = () => false;
    }
    expect(batches).to.have.length(5);
    expect(generator._playTime - initialPlayTime).to.be.closeTo(0.4, 1e-6);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("delivers a resolved Birth command after its original target already updated", () => {
    const originalChild = createParticleRenderer(engine, "LateBirth_OriginalChild");
    const parent = createParticleRenderer(engine, "LateBirth_Parent");
    const replacementChild = createParticleRenderer(engine, "LateBirth_ReplacementChild");
    originalChild.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    const slot = parent.generator.subEmitters.addSubEmitter(originalChild, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    originalChild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    replacementChild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();

    const readback = getInFlightTrajectoryReadbackBatches(parent.generator)[0].readback;
    readback._platformReadback.isReady = () => false;
    slot.emitter = replacementChild;
    originalChild.generator.play(false);
    engine.update();
    expect(originalChild.generator._getAliveParticleCount()).to.equal(0);

    readback._platformReadback.isReady = () => true;
    engine.update();
    expect(originalChild.generator._getAliveParticleCount()).to.equal(0);

    engine.update();
    expect(originalChild.generator._getAliveParticleCount()).to.equal(1);

    parent.entity.destroy();
    originalChild.entity.destroy();
    replacementChild.entity.destroy();
  });

  it("cancels a resolved Birth command after its target moves to another scene", () => {
    const child = createParticleRenderer(engine, "MovedPendingBirth_Child");
    const parent = createParticleRenderer(engine, "MovedPendingBirth_Parent");
    child.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();

    const readback = getInFlightTrajectoryReadbackBatches(parent.generator)[0].readback;
    readback._platformReadback.isReady = () => false;
    const secondScene = new Scene(engine, "MovedPendingBirth_Scene");
    engine.sceneManager.addScene(secondScene);
    secondScene.addRootEntity(child.entity);
    child.generator.play(false);
    engine.update();
    expect(child.generator._getAliveParticleCount()).to.equal(1);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);

    readback._platformReadback.isReady = () => true;
    engine.update();
    engine.update();
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    parent.entity.destroy();
    child.entity.destroy();
    secondScene.destroy();
  });

  it("keeps queued Birth commands valid when the parent ring buffer grows", () => {
    const child = createParticleRenderer(engine, "ReadbackResize_Child");
    const parent = createParticleRenderer(engine, "ReadbackResize_Parent");
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();

    const generator = parent.generator as any;
    const batches = getInFlightTrajectoryReadbackBatches(generator);
    batches[0].readback._platformReadback.isReady = () => false;
    const particleBufferSize = generator._currentParticleCount;
    parent.generator.emit(150);
    expect(generator._currentParticleCount).to.be.greaterThan(particleBufferSize);

    engine.update();
    expect(batches).to.have.length(2);
    for (const batch of batches) {
      batch.readback._platformReadback.isReady = () => true;
    }
    engine.update();
    expect(child.generator._getAliveParticleCount()).to.equal(152);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("keeps static Rate Over Distance readback asynchronous", () => {
    const child = createParticleRenderer(engine, "DistanceReadback_Child");
    const parent = createParticleRenderer(engine, "DistanceReadback_Parent");
    child.generator.emission.rateOverDistance.constant = 10;
    parent.generator.main.startSpeed.constant = 0;
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();

    const generator = parent.generator as any;
    const readback = getInFlightTrajectoryReadbackBatches(generator)[0].readback;
    const read = vi.spyOn(readback, "getData");
    readback._platformReadback.isReady = () => false;
    engine.update();
    expect(read).not.toHaveBeenCalled();

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

  it("returns pending readback resources when the generator is destroyed", () => {
    const child = createParticleRenderer(engine, "ReadbackDestroy_Child");
    const parent = createParticleRenderer(engine, "ReadbackDestroy_Parent");
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    performance.now = () => 100;
    engine.update();

    const generator = parent.generator as any;
    const readback = getInFlightTrajectoryReadbackBatches(generator)[0].readback;
    const resetReadback = vi.spyOn(readback, "reset");
    const destroyReadback = vi.spyOn(readback, "destroy");
    parent.entity.destroy();
    expect(resetReadback).toHaveBeenCalledTimes(1);
    expect(destroyReadback).toHaveBeenCalledTimes(0);

    engine.resourceManager.gc();
    expect(destroyReadback).toHaveBeenCalledTimes(1);

    child.entity.destroy();
  });

  it("tracks staging buffer memory through the readback lifetime", () => {
    const child = createParticleRenderer(engine, "ReadbackMemory_Child");
    const parent = createParticleRenderer(engine, "ReadbackMemory_Parent");
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    const memoryBeforeReadback = engine.renderingStatistics.bufferMemory;
    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    performance.now = () => 100;
    engine.update();

    const generator = parent.generator as any;
    const readback = getInFlightTrajectoryReadbackBatches(generator)[0].readback;
    expect(engine.renderingStatistics.bufferMemory).to.equal(memoryBeforeReadback + readback.byteLength);

    generator._trajectoryReadback.destroy();
    expect(engine.renderingStatistics.bufferMemory).to.equal(memoryBeforeReadback + readback.byteLength);

    engine.resourceManager.gc();
    expect(engine.renderingStatistics.bufferMemory).to.equal(memoryBeforeReadback);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("recycles a stale readback without polling after device content loss", () => {
    const child = createParticleRenderer(engine, "ReadbackRestore_Child");
    const parent = createParticleRenderer(engine, "ReadbackRestore_Parent");
    child.generator.emission.rateOverTime.constant = 10;
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    performance.now = () => 100;
    engine.update();

    const generator = parent.generator as any;
    const readback = getInFlightTrajectoryReadbackBatches(generator)[0].readback;
    const isReady = vi.spyOn(readback, "isReady");
    const resetReadback = vi.spyOn(readback._platformReadback, "reset");
    const destroyReadback = vi.spyOn(readback._platformReadback, "destroy");
    generator._instanceVertexBufferBinding._buffer._isContentLost = true;
    engine.update();

    expect(isReady).not.toHaveBeenCalled();
    expect(resetReadback).toHaveBeenCalledTimes(1);
    expect(destroyReadback).toHaveBeenCalledTimes(0);
    expect(generator._trajectoryReadback).to.equal(null);

    engine.resourceManager.gc();
    expect(destroyReadback).toHaveBeenCalledTimes(1);

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
    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[29]).to.be.closeTo(-0.4, 1e-4); // current TF parent position
    expect(vertices[6]).to.be.closeTo(-1, 1e-4);
    expect(vertices[18]).to.be.closeTo(3, 1e-4); // child 1 + complete parent speed 4 × 0.5

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
    secondChild.generator.main.simulationSpace = ParticleSimulationSpace.World;
    secondChild.generator.main.startSpeed.constant = 0;
    secondChild.generator.emission.rateOverTime.constant = 10;
    secondChild.generator.inheritVelocity.enabled = true;
    secondChild.generator.inheritVelocity.curve.constant = 0.75;

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
    expect((firstChild.generator as any)._instanceVertices[18]).to.be.closeTo(1, 1e-4);
    expect((secondChild.generator as any)._instanceVertices[18]).to.be.closeTo(3, 1e-4);

    parent.entity.destroy();
    firstChild.entity.destroy();
    secondChild.entity.destroy();
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

    const parentFeedback = new Float32Array(6);
    parent.generator._feedbackSimulator.readBinding.buffer.getData(parentFeedback, 0, 0, parentFeedback.length);
    const childVertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(childVertices[27]).to.be.closeTo(parentFeedback[0], 1e-5);
    expect(childVertices[28]).to.be.closeTo(parentFeedback[1], 1e-5);
    expect(childVertices[29]).to.be.closeTo(parentFeedback[2], 1e-5);

    const childSpeed = childVertices[18];
    expect(childVertices[4] * childSpeed).to.be.closeTo(parentFeedback[0] / 0.1, 1e-4);
    expect(childVertices[5] * childSpeed).to.be.closeTo(parentFeedback[1] / 0.1, 1e-4);
    expect(childVertices[6] * childSpeed).to.be.closeTo(parentFeedback[2] / 0.1, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth uses the current-frame orbital velocity after sparse feedback readback", () => {
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

      const feedback = new Float32Array(12);
      (parent.generator as any)._feedbackSimulator.readBinding.buffer.getData(feedback, 0, 0, feedback.length);
      const vertices = (child.generator as any)._instanceVertices as Float32Array;
      const childSpeed = vertices[18];
      expect(vertices[4] * childSpeed).to.be.closeTo(feedback[9], 1e-4);
      expect(vertices[5] * childSpeed).to.be.closeTo(feedback[10], 1e-4);
      expect(vertices[6] * childSpeed).to.be.closeTo(feedback[11], 1e-4);

      parent.entity.destroy();
      child.entity.destroy();
      return childSpeed;
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
    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[27]).to.be.closeTo(1, 1e-4);
    expect(vertices[4] * vertices[18]).to.be.closeTo(10, 1e-4);
    expect(vertices[5] * vertices[18]).to.be.closeTo(0, 1e-4);
    expect(vertices[6] * vertices[18]).to.be.closeTo(0, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("drains pending Birth feedback after the hierarchy is culled", () => {
    const child = createParticleRenderer(engine, "SystemOrder_Child");
    const parent = createParticleRenderer(engine, "SystemOrder_Parent");
    parent.entity.transform.setPosition(100000, 0, 0);
    child.entity.transform.setPosition(100000, 0, 0);
    parent.generator.main.startLifetime.constant = 1;
    child.generator.emission.rateOverTime.constant = 10;

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

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();

    const readback = getInFlightTrajectoryReadbackBatches(parent.generator)[0].readback;
    readback._platformReadback.isReady = () => false;
    engine.update();

    readback._platformReadback.isReady = () => true;
    engine.update();
    expect(parent.generator._getAliveParticleCount()).to.equal(1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const parentPlayTime = parent.generator._playTime;
    const childPlayTime = child.generator._playTime;
    engine.update();
    engine.update();
    expect(parent.generator._playTime).to.equal(parentPlayTime);
    expect(child.generator._playTime).to.equal(childPlayTime);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("keeps a Birth target claimed while parent trajectory feedback is pending", () => {
    const parent = createParticleRenderer(engine, "PendingRole_Parent");
    const child = createParticleRenderer(engine, "PendingRole_Child");
    const sibling = createParticleRenderer(engine, "PendingRole_Sibling");
    parent.generator.main.duration = 0.1;
    parent.generator.main.startLifetime.constant = 0.1;
    child.generator.emission.rateOverTime.constant = 10;
    sibling.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    sibling.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();
    const batches = getInFlightTrajectoryReadbackBatches(parent.generator);
    for (let i = 0, n = batches.length; i < n; i++) {
      batches[i].readback._platformReadback.isReady = () => false;
    }
    engine.update();
    const pendingBatches = getInFlightTrajectoryReadbackBatches(parent.generator);
    for (let i = 0, n = pendingBatches.length; i < n; i++) {
      pendingBatches[i].readback._platformReadback.isReady = () => false;
    }

    expect(parent.generator.isAlive).to.equal(false);
    expect(pendingBatches.length).to.be.greaterThan(0);
    parent.generator.subEmitters.addSubEmitter(sibling, ParticleSubEmitterType.Birth);
    child.generator.play(false);
    sibling.generator.play(false);
    engine.update();
    expect(child.generator._getAliveParticleCount()).to.equal(0);
    expect(sibling.generator._getAliveParticleCount()).to.equal(1);

    parent.entity.destroy();
    child.entity.destroy();
    sibling.entity.destroy();
  });

  it("does not claim a Birth target for pending Death feedback", () => {
    const parent = createParticleRenderer(engine, "PendingDeathRole_Parent");
    const deathTarget = createParticleRenderer(engine, "PendingDeathRole_DeathTarget");
    const birthTarget = createParticleRenderer(engine, "PendingDeathRole_BirthTarget");
    parent.generator.main.duration = 0.1;
    parent.generator.main.startLifetime.constant = 0.1;
    birthTarget.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(deathTarget, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    deathTarget.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    birthTarget.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();
    engine.update();

    const pendingBatches = getInFlightTrajectoryReadbackBatches(parent.generator);
    expect(parent.generator.isAlive).to.equal(false);
    expect(pendingBatches.length).to.be.greaterThan(0);
    for (let i = 0, n = pendingBatches.length; i < n; i++) {
      pendingBatches[i].readback._platformReadback.isReady = () => false;
    }

    parent.generator.subEmitters.addSubEmitter(birthTarget, ParticleSubEmitterType.Birth);
    birthTarget.generator.play(false);
    engine.update();
    expect(birthTarget.generator._getAliveParticleCount()).to.equal(1);

    parent.entity.destroy();
    deathTarget.entity.destroy();
    birthTarget.entity.destroy();
  });

  it("Birth evaluates target Start Delay, Burst, and Rate Over Distance", () => {
    const child = createParticleRenderer(engine, "SystemEmission_Child");
    const parent = createParticleRenderer(engine, "SystemEmission_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 1;
    child.generator.main.startDelay.constant = 0.2;
    child.generator.emission.rateOverDistance.constant = 10;
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
    expect(child.generator._getAliveParticleCount()).to.equal(3);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("shares the target particle capacity across Birth parent timelines", () => {
    const child = createParticleRenderer(engine, "SharedBudget_Child");
    const parent = createParticleRenderer(engine, "SharedBudget_Parent");
    parent.generator.main.startLifetime.constant = 1;
    parent.generator.main.startSpeed.constant = 10;
    child.generator.main.maxParticles = 3;
    child.generator.emission.rateOverDistance.constant = 1000;

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

  it("emits each deferred Birth time window once", () => {
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

    const feedbackStride = generator._feedbackSimulator.vertexStride / 4;
    const feedbackData = new Float32Array(generator._currentParticleCount * feedbackStride);
    feedbackData[100 * feedbackStride] = 3000;
    feedbackData[0] = 4000;
    generator._feedbackSimulator.readBinding.buffer.setData(feedbackData);

    parent.generator.main.maxParticles = 60;
    generator._resizeInstanceBuffer(false);

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

  it("Death reads feedback only when a parent particle retires", () => {
    const parent = createParticleRenderer(engine, "DeathReadback_Parent");
    const child = createParticleRenderer(engine, "DeathReadback_Child");
    parent.generator.main.startLifetime.constant = 0.5;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    const createReadback = vi.spyOn((engine as any)._hardwareRenderer, "createPlatformBufferReadback");
    updateEngine(engine, 4);
    expect(createReadback).not.toHaveBeenCalled();
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    updateEngine(engine, 1);
    expect(createReadback).toHaveBeenCalledTimes(1);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    createReadback.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("snapshots Death emission intent before feedback becomes ready", () => {
    const parent = createParticleRenderer(engine, "DeathIntent_Parent");
    const child = createParticleRenderer(engine, "DeathIntent_Child");
    parent.generator.main.startLifetime.constant = 0.1;
    const parentColor = parent.generator.colorOverLifetime;
    parentColor.enabled = true;
    parentColor.color.mode = ParticleGradientMode.Gradient;
    (parentColor.color as any).gradient = new ParticleGradient(
      [new GradientColorKey(0, new Color(1, 0, 0, 1)), new GradientColorKey(1, new Color(1, 0, 0, 1))],
      [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)]
    );

    parent.generator.subEmitters.enabled = true;
    const deathSlot = parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Death,
      ParticleSubEmitterInheritProperty.Color,
      1,
      2
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();
    engine.update();

    const batch = getInFlightTrajectoryReadbackBatches(parent.generator)[0];
    batch.readback._platformReadback.isReady = () => false;
    deathSlot.deathEmitCount = 5;
    (parentColor.color as any).gradient = new ParticleGradient(
      [new GradientColorKey(0, new Color(0, 0, 1, 1)), new GradientColorKey(1, new Color(0, 0, 1, 1))],
      [new GradientAlphaKey(0, 1), new GradientAlphaKey(1, 1)]
    );
    engine.update();
    expect(parent.generator._getAliveParticleCount()).to.equal(0);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    batch.readback._platformReadback.isReady = () => true;
    engine.update();

    expect(child.generator._getAliveParticleCount()).to.equal(2);
    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[8]).to.be.closeTo(1, 1e-5);
    expect(vertices[9]).to.be.closeTo(0, 1e-5);
    expect(vertices[10]).to.be.closeTo(0, 1e-5);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("queues later Death events while an earlier feedback request is pending", () => {
    const parent = createParticleRenderer(engine, "AsyncDeath_Parent");
    const child = createParticleRenderer(engine, "AsyncDeath_Child");
    parent.generator.main.maxParticles = 1;
    parent.generator.main.startLifetime.constant = 0.1;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();
    engine.update();

    const generator = parent.generator as any;
    const batches = getInFlightTrajectoryReadbackBatches(generator);
    batches[0].readback._platformReadback.isReady = () => false;
    expect(parent.generator._getAliveParticleCount()).to.equal(0);

    parent.generator.emit(1);
    expect(parent.generator._getAliveParticleCount()).to.equal(1);
    engine.update();
    engine.update();
    expect(batches).to.have.length(2);

    for (const batch of batches) {
      batch.readback._platformReadback.isReady = () => true;
    }
    engine.update();
    expect(child.generator._getAliveParticleCount()).to.equal(2);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("delivers a resolved Death command after its original target already updated", () => {
    const originalChild = createParticleRenderer(engine, "LateDeath_OriginalChild");
    const parent = createParticleRenderer(engine, "LateDeath_Parent");
    const replacementChild = createParticleRenderer(engine, "LateDeath_ReplacementChild");
    parent.generator.main.startLifetime.constant = 0.1;

    parent.generator.subEmitters.enabled = true;
    const slot = parent.generator.subEmitters.addSubEmitter(originalChild, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    originalChild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    replacementChild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();
    engine.update();

    const readback = getInFlightTrajectoryReadbackBatches(parent.generator)[0].readback;
    readback._platformReadback.isReady = () => false;
    slot.emitter = replacementChild;
    engine.update();

    readback._platformReadback.isReady = () => true;
    engine.update();
    expect(originalChild.generator._getAliveParticleCount()).to.equal(0);

    engine.update();
    expect(originalChild.generator._getAliveParticleCount()).to.equal(1);

    parent.entity.destroy();
    originalChild.entity.destroy();
    replacementChild.entity.destroy();
  });

  it("skips Death feedback when no Death event is accepted", () => {
    const parent = createParticleRenderer(engine, "DeathProbability_Parent");
    const child = createParticleRenderer(engine, "DeathProbability_Child");
    parent.generator.main.startLifetime.constant = 0.1;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(
      child,
      ParticleSubEmitterType.Death,
      ParticleSubEmitterInheritProperty.None,
      0
    );
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    const createReadback = vi.spyOn((engine as any)._hardwareRenderer, "createPlatformBufferReadback");
    updateEngine(engine, 2);

    expect(createReadback).not.toHaveBeenCalled();
    expect(parent.generator._getAliveParticleCount()).to.equal(0);
    expect(child.generator._getAliveParticleCount()).to.equal(0);

    createReadback.mockRestore();
    parent.entity.destroy();
    child.entity.destroy();
  });

  it("shares one feedback request between Birth and Death from the same simulation pass", () => {
    const parent = createParticleRenderer(engine, "UnifiedFeedback_Parent");
    const birthChild = createParticleRenderer(engine, "UnifiedFeedback_BirthChild");
    const deathChild = createParticleRenderer(engine, "UnifiedFeedback_DeathChild");
    parent.generator.main.startLifetime.constant = 0.2;
    birthChild.generator.emission.rateOverTime.constant = 10;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(birthChild, ParticleSubEmitterType.Birth);
    parent.generator.subEmitters.addSubEmitter(deathChild, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    birthChild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    deathChild.generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play(false);

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();

    const generator = parent.generator as any;
    const batches = getInFlightTrajectoryReadbackBatches(generator);
    batches[0].readback._platformReadback.isReady = () => true;
    engine.update();

    expect(batches).to.have.length(1);
    expect(batches[0].commands.map((command) => command.type)).to.deep.equal([
      ParticleSubEmitterType.Birth,
      ParticleSubEmitterType.Death
    ]);

    parent.entity.destroy();
    birthChild.entity.destroy();
    deathChild.entity.destroy();
  });

  it("Death consumes the current transform-feedback position at the particle lifetime", () => {
    const parent = createParticleRenderer(engine, "Parent_DeathCurrentPosition");
    const child = createParticleRenderer(engine, "Child_DeathCurrentPosition");
    parent.generator.main.startLifetime.constant = 0.25;
    parent.generator.main.startSpeed.constant = 2;
    parent.generator.main.gravityModifier.constant = 0;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);

    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[0]).to.be.closeTo(0, 1e-5);
    expect(vertices[1]).to.be.closeTo(0, 1e-5);
    expect(vertices[2]).to.be.closeTo(-0.5, 1e-5);

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

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    updateEngine(engine, 5);
    expect(child.generator._getAliveParticleCount()).to.equal(1);

    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[6]).to.be.closeTo(-1, 1e-4);
    expect(vertices[18]).to.be.closeTo(2, 1e-4);

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

  it("catches a delayed Death particle up in the target's single feedback pass", () => {
    const parent = createParticleRenderer(engine, "DeathCatchUp_Parent");
    const child = createParticleRenderer(engine, "DeathCatchUp_Child");
    parent.generator.main.startLifetime.constant = 0.1;
    parent.generator.main.startSpeed.constant = 0;
    child.generator.main.startSpeed.constant = 1;
    child.generator.limitVelocityOverLifetime.enabled = true;
    child.generator.limitVelocityOverLifetime.dampen = 0;
    child.generator.limitVelocityOverLifetime.speed.constant = 100;

    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Death);
    parent.generator.emission.addBurst(new Burst(0, new ParticleCompositeCurve(1), 1, 0.01));
    parent.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    child.generator.stop(true, ParticleStopMode.StopEmittingAndClear);
    parent.generator.play();

    (engine as any)._vSyncCount = Infinity;
    (engine as any)._time._lastSystemTime = 0;
    let time = 0;
    performance.now = () => (time += 100);
    engine.update();
    engine.update();

    const batch = getInFlightTrajectoryReadbackBatches(parent.generator)[0];
    batch.readback._platformReadback.isReady = () => false;
    engine.update();
    engine.update();
    batch.readback._platformReadback.isReady = () => true;
    engine.update();
    performance.now = () => time;

    expect(child.generator._getAliveParticleCount()).to.equal(1);
    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    const particleAge = child.generator._playTime - vertices[7];
    expect(particleAge).to.be.greaterThan(engine.time.deltaTime * 2);

    const feedback = new Float32Array(6);
    child.generator._feedbackSimulator.readBinding.buffer.getData(feedback, 0, 0, feedback.length);
    expect(feedback[2]).to.be.closeTo(-particleAge, 1e-5);

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
    (parent.generator as any)._useTransformFeedback = false;
    (parent.generator as any)._feedbackSimulator = null;

    // Re-enable runs _onEnable, which reconciles transform-feedback from the current config.
    parent.entity.isActive = false;
    parent.entity.isActive = true;

    expect((parent.generator as any)._useTransformFeedback).to.equal(true);
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
    liveTarget.destroy();
    parent.generator.subEmitters.enabled = false;
    expect(() => (parent.generator.subEmitters.enabled = true)).not.to.throw();

    parent.entity.destroy();
    liveTarget.entity.destroy();
    destroyedTarget.entity.destroy();
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
    // Parent: startSize 1, SOL Curve ramps 1 → 0.5 across lifetime.
    // Child:  startSize 2.
    // Death inherit Size → child.a_StartSize = parent.startSize × SOL(1) × child.startSize
    //                                        = 1 × 0.5 × 2 = 1.0.
    const parent = createParticleRenderer(engine, "Parent_SizeSOL");
    const child = createParticleRenderer(engine, "Child_SizeSOL");

    parent.generator.main.startLifetime.constant = 0.5;
    parent.generator.main.startSize.constant = 1;
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
    expect(verts[12]).to.be.closeTo(1.0, 1e-3); // x
    expect(verts[13]).to.be.closeTo(1.0, 1e-3); // y
    expect(verts[14]).to.be.closeTo(1.0, 1e-3); // z

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

    // a_DirectionTime @ float offset 4..6 holds the child's (normalized) emission direction.
    const s = (straight.child.generator as any)._instanceVertices as Float32Array;
    expect(straight.child.generator._getAliveParticleCount()).to.equal(1);
    expect(s[4]).to.be.closeTo(0, 1e-4);
    expect(s[5]).to.be.closeTo(0, 1e-4);
    expect(s[6]).to.be.closeTo(-1, 1e-4);

    // Spawn rotation 90° about X maps (0,0,-1) → (0,1,0); under the bug it stayed (0,0,-1).
    const r = (spun.child.generator as any)._instanceVertices as Float32Array;
    expect(r[4]).to.be.closeTo(0, 1e-4);
    expect(r[5]).to.be.closeTo(1, 1e-4);
    expect(r[6]).to.be.closeTo(0, 1e-4);

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

    const s = (straight.child.generator as any)._instanceVertices as Float32Array;
    expect(straight.child.generator._getAliveParticleCount()).to.equal(1);
    expect(s[4]).to.be.closeTo(0, 1e-4);
    expect(s[5]).to.be.closeTo(0, 1e-4);
    expect(s[6]).to.be.closeTo(-1, 1e-4);
    expect(s[18]).to.be.closeTo(2, 1e-4);

    const r = (spun.child.generator as any)._instanceVertices as Float32Array;
    expect(r[4]).to.be.closeTo(0, 1e-4);
    expect(r[5]).to.be.closeTo(1, 1e-4);
    expect(r[6]).to.be.closeTo(0, 1e-4);
    expect(r[18]).to.be.closeTo(2, 1e-4);

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
    const vertices = (child.generator as any)._instanceVertices as Float32Array;
    expect(vertices[4]).to.be.closeTo(0, 1e-4);
    expect(vertices[5]).to.be.closeTo(1, 1e-4);
    expect(vertices[6]).to.be.closeTo(0, 1e-4);
    expect(vertices[18]).to.be.closeTo(1, 1e-4);

    parent.entity.destroy();
    child.entity.destroy();
  });

  it("Birth enables transform-feedback to sample the parent trajectory", () => {
    const parent = createParticleRenderer(engine, "Encap_TypeParent");
    const child = createParticleRenderer(engine, "Encap_TypeChild");
    parent.generator.subEmitters.enabled = true;
    parent.generator.subEmitters.addSubEmitter(child, ParticleSubEmitterType.Birth);
    expect((parent.generator as any)._useTransformFeedback).to.equal(true);
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
      expect((parent.generator as any)._useTransformFeedback).to.equal(false);
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

    expect(() => (cloneSlot.type = ParticleSubEmitterType.Death)).to.not.throw();

    cloneEntity.destroy();
    parent.entity.destroy();
    child.entity.destroy();
  });
});
