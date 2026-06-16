import {
  AnimationClip,
  AnimationEvent,
  AnimationFloatCurve,
  Animator,
  AnimatorConditionMode,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorLayerBlendingMode,
  AnimatorLayerMask,
  AnimatorStateMachine,
  AnimatorStateTransition,
  Camera,
  Entity,
  Keyframe,
  Script,
  StateMachineScript,
  Transform,
  WrapMode
} from "@galacean/engine-core";
import "@galacean/engine-loader";
import type { GLTFResource } from "@galacean/engine-loader";
import { Quaternion } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { glbResource } from "./model/fox";
const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

// Mirror of internal LayerState enum (not exported from @galacean/engine-core)
const LayerState = {
  Standby: 0,
  Playing: 1,
  CrossFading: 2,
  FixedCrossFading: 3,
  Finished: 4
} as const;

describe("Animator test", function () {
  let animator: Animator;
  let resource: GLTFResource;
  let engine: WebGLEngine;

  const findSharedState = (stateName: string) =>
    animator.animatorController.layers[0].stateMachine.findStateByName(stateName);
  const createLoopAnimator = () => {
    const entity = new Entity(engine);
    const localAnimator = entity.addComponent(Animator);
    const controller = new AnimatorController(engine);
    const layer = new AnimatorControllerLayer("Base Layer");
    controller.addLayer(layer);

    const state = layer.stateMachine.addState("loop");
    state.wrapMode = WrapMode.Loop;

    const clip = new AnimationClip("loop-clip");
    const curve = new AnimationFloatCurve();
    const start = new Keyframe<number>();
    const end = new Keyframe<number>();
    start.time = 0;
    start.value = 0;
    end.time = 1;
    end.value = 1;
    curve.addKey(start);
    curve.addKey(end);
    clip.addCurveBinding("", Transform, "position.x", curve);
    state.clip = clip;

    localAnimator.animatorController = controller;
    return { entity, animator: localAnimator, clip };
  };
  const updateAnimator = (target: Animator, deltaTime: number) => {
    // @ts-ignore
    target.engine.time._frameCount++;
    target.update(deltaTime);
  };

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: canvasDOM });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();
    rootEntity.addComponent(Camera);

    resource = await engine.resourceManager.load<GLTFResource>(glbResource);
    const defaultSceneRoot = resource.defaultSceneRoot;
    rootEntity.addChild(defaultSceneRoot);
    animator = defaultSceneRoot.getComponent(Animator);
  });

  afterAll(function () {
    animator?.destroy();
    engine?.destroy();
  });

  afterEach(function () {
    animator.speed = 1;
    // @ts-ignore
    animator._reset();
    animator.animatorController.clearParameters();

    // 清理 state machine transitions
    const stateMachine = animator.animatorController.layers[0].stateMachine;
    stateMachine.clearAnyStateTransitions();
    stateMachine.clearEntryStateTransitions();

    // 清理各状态的 transitions 并恢复默认属性
    const stateNames = ["Survey", "Walk", "Run"];
    for (const name of stateNames) {
      const state = findSharedState(name);
      if (state) {
        state.clearTransitions();
        state.speed = 1;
        state.clipStartTime = 0;
        state.clipEndTime = 1;
        state.wrapMode = WrapMode.Loop;
        state.clip?.clearEvents();
      }
    }
  });
  it("constructor", () => {
    // Test default values
    expect(animator).not.to.be.undefined;
    expect(animator.cullingMode).to.eq(0);
    expect(animator["_awoken"]).to.eq(true);
    expect(animator["_enabled"]).to.eq(true);
    expect(animator["_onUpdateIndex"]).to.eq(0);
    expect(animator["_phasedActive"]).to.eq(true);

    // Test _tempAnimatorStateInfo default layerIndex values
    expect(animator["_tempAnimatorStateInfo"].layerIndex).to.eq(-1);
  });

  it("animator speed value", () => {
    // Test animator speed.
    animator.play("Run");

    let animatorLayerData = animator["_animatorLayersData"];
    const srcPlayData = animatorLayerData[0]?.srcPlayData;

    const speed = 1;
    let expectedSpeed = speed * 0.5;
    animator.speed = expectedSpeed;
    let playedTime = srcPlayData.playedTime;
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(5);
    expect(animator.speed).to.eq(expectedSpeed);
    expect(srcPlayData.playedTime).to.eq(playedTime + 5 * expectedSpeed);
    expectedSpeed = speed * 2;
    animator.speed = expectedSpeed;
    playedTime = srcPlayData.playedTime;
    animator.update(10);
    expect(animator.speed).to.eq(expectedSpeed);
    expect(srcPlayData.playedTime).to.eq(playedTime + 10 * expectedSpeed);
    expectedSpeed = speed * 0;
    animator.speed = expectedSpeed;
    playedTime = srcPlayData.playedTime;
    animator.update(15);
    expect(animator.speed).to.eq(expectedSpeed);
    expect(srcPlayData.playedTime).to.eq(playedTime + 15 * expectedSpeed);
  });

  it("play animation", () => {
    // Test animator play.
    const layerIndex = 0;
    const normalizedTimeOffset = 0.5;
    animator.play("Run");
    expect(animator["_tempAnimatorStateInfo"].layerIndex).to.eq(layerIndex);

    let animatorState = animator.getCurrentAnimatorState(layerIndex);
    expect(animatorState.name).to.eq("Run");
    expect(animatorState.speed).to.eq(1);
    expect(animatorState.wrapMode).to.eq(1);

    // Test animator change play state.
    animator.play("Walk", layerIndex, normalizedTimeOffset);
    animatorState = animator.getCurrentAnimatorState(layerIndex);
    expect(animatorState.name).to.eq("Walk");
  });

  it("animator cullingMode", () => {
    // Test animator cullingMode.
    //@ts-ignore
    animator._controlledRenderers.forEach((renderer) => {
      // mock entity is culled
      renderer._renderFrameCount = Infinity;
    });

    animator.cullingMode = 1;
    expect(animator.cullingMode).to.eq(1);

    animator.play("Run");

    let animatorLayerData = animator["_animatorLayersData"];
    const srcPlayData = animatorLayerData[0]?.srcPlayData;
    animator.update(5);
    const curveOwner = srcPlayData.stateData.curveLayerOwner[0].curveOwner;
    const initValue = curveOwner.defaultValue;
    const currentValue = curveOwner.referenceTargetValue;
    expect(Quaternion.equals(initValue, currentValue)).to.eq(true);

    animator.cullingMode = 0;
    expect(animator.cullingMode).to.eq(0);
    animator.update(5);
    expect(Quaternion.equals(initValue, currentValue)).to.eq(false);
  });

  it("animation enabled", () => {
    // Test animator play.
    animator.play("Survey");
    // @ts-ignore
    const onDisableSpy = vi.spyOn(animator, "_onDisable");
    // @ts-ignore
    const onEnableSpy = vi.spyOn(animator, "_onEnable");
    const onUpdateSpy = vi.spyOn(animator, "update");

    animator.enabled = false;
    expect(animator["_enabled"]).to.eq(false);
    expect(onDisableSpy).toHaveBeenCalledTimes(1);
    engine.update();
    expect(onUpdateSpy).toHaveBeenCalledTimes(0);

    animator.enabled = true;
    expect(animator["_enabled"]).to.eq(true);
    expect(onEnableSpy).toHaveBeenCalledTimes(1);
    engine.update();
    expect(onUpdateSpy).toHaveBeenCalledTimes(1);
  });

  it("find animator state", () => {
    const stateName = "Survey";
    const expectedStateName = "Run";
    const layerIndex = 0;

    animator.play(stateName, layerIndex);
    const currentAnimatorState = animator.getCurrentAnimatorState(layerIndex);
    let animatorState = animator.findAnimatorState(stateName, layerIndex);
    expect(animatorState).to.eq(currentAnimatorState);

    animator.play(expectedStateName, layerIndex);
    animatorState = animator.findAnimatorState(expectedStateName, layerIndex);
    expect(animatorState).not.to.eq(currentAnimatorState);
    expect(animatorState.name).to.eq(expectedStateName);
  });

  it("findAnimatorState returns a stable per-state instance for states that are not currently playing", () => {
    animator.play("Walk");
    const walkInstance = animator.getCurrentAnimatorState(0);
    const runInstance = animator.findAnimatorState("Run", 0);
    const sharedRunState = findSharedState("Run");

    expect(runInstance).not.to.eq(null);
    expect(runInstance).not.to.eq(walkInstance);
    expect(runInstance.name).to.eq("Run");

    runInstance.speed = 0.5;

    expect(sharedRunState.speed).to.eq(1);

    animator.play("Run");
    expect(animator.getCurrentAnimatorState(0)).to.eq(runInstance);
    expect(animator.getCurrentAnimatorState(0).speed).to.eq(0.5);
  });

  it("findAnimatorState remains stable after crossFade play slots are reused", () => {
    const walkState = findSharedState("Walk");
    const runState = findSharedState("Run");

    animator.play("Walk");
    const walkInstance = animator.getCurrentAnimatorState(0);
    const runInstance = animator.findAnimatorState("Run", 0);
    walkInstance.speed = 2;
    runInstance.speed = 0.5;

    animator.crossFade("Run", 0.1, 0);
    updateAnimator(animator, runState._getDuration());

    expect(animator.getCurrentAnimatorState(0)).to.eq(runInstance);
    expect(animator.getCurrentAnimatorState(0).speed).to.eq(0.5);
    expect(animator.findAnimatorState("Walk", 0)).to.eq(walkInstance);
    expect(animator.findAnimatorState("Walk", 0).speed).to.eq(2);
    expect(animator.findAnimatorState("Walk", 0)._state).to.eq(walkState);
  });

  it("crossFade to the active state is a no-op", () => {
    animator.play("Walk");
    const currentInstance = animator.getCurrentAnimatorState(0);
    updateAnimator(animator, 0.1);

    const layerData = animator["_animatorLayersData"][0];
    const playedBefore = layerData.srcPlayData.playedTime;

    animator.crossFade("Walk", 0.1, 0);

    expect(layerData.destPlayData).to.eq(null);
    expect(layerData.crossFadeTransition).to.eq(null);
    expect(animator.getCurrentAnimatorState(0)).to.eq(currentInstance);
    expect(layerData.srcPlayData.playedTime).to.eq(playedBefore);
  });

  it("play, crossFade, and state lookup ignore out-of-range layers without throwing", () => {
    animator.play("Walk");
    const before = animator.getCurrentAnimatorState(0);

    expect(() => animator.play("Run", 99)).not.to.throw();
    expect(() => animator.crossFade("Run", 0.1, 99)).not.to.throw();
    expect(animator.findAnimatorState("Run", 99)).to.eq(null);
    expect(animator.findAnimatorState("Run", -2)).to.eq(null);
    expect(animator.getCurrentAnimatorState(99)).to.eq(null);
    expect(animator.getCurrentAnimatorState(0)).to.eq(before);
  });

  it("animation getCurrentAnimatorState", () => {
    //play animation and get current animator state
    const expectedStateName = resource.animations[0].name;
    animator.play(expectedStateName);
    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;
    const currentAnimatorState = animator.getCurrentAnimatorState(layerIndex);
    expect(currentAnimatorState.name).to.eq(expectedStateName);
  });

  it("animation cross fade", () => {
    animator.play("Walk");
    animator.crossFade("Run", 0.5);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;
    const animatorLayerData = animator["_animatorLayersData"];
    const layerState = animatorLayerData[layerIndex].layerState;

    // current animator layerState should be CrossFading(2)
    expect(layerState).to.eq(2);
  });

  it("crossFade advances with per-instance playData speed instead of shared AnimatorState speed", () => {
    const sharedStates = animator.animatorController.layers[0].stateMachine.states;
    const sharedWalkState = sharedStates.find((state) => state.name === "Walk");
    const sharedRunState = sharedStates.find((state) => state.name === "Run");
    const oldWalkSpeed = sharedWalkState.speed;
    const oldRunSpeed = sharedRunState.speed;

    try {
      animator.play("Walk");
      animator.crossFade("Run", 1.0, 0);

      const layerData = animator["_animatorLayersData"][0];
      layerData.srcPlayData.speed = 0.25;
      layerData.destPlayData.speed = 0.25;
      sharedWalkState.speed = 10;
      sharedRunState.speed = 10;

      const srcPlayedTime = layerData.srcPlayData.playedTime;
      const destPlayedTime = layerData.destPlayData.playedTime;
      // @ts-ignore
      animator.engine.time._frameCount++;
      animator.update(0.2);

      expect(layerData.srcPlayData.playedTime - srcPlayedTime).toBeCloseTo(0.05, 5);
      expect(layerData.destPlayData.playedTime - destPlayedTime).toBeCloseTo(0.05, 5);
    } finally {
      sharedWalkState.speed = oldWalkSpeed;
      sharedRunState.speed = oldRunSpeed;
    }
  });

  it("playData wrapMode overrides shared AnimatorState wrapMode per instance", () => {
    const sharedWalkState = animator.animatorController.layers[0].stateMachine.states.find(
      (state) => state.name === "Walk"
    );
    const oldWrapMode = sharedWalkState.wrapMode;

    try {
      sharedWalkState.wrapMode = WrapMode.Loop;
      animator.play("Walk");

      const layerData = animator["_animatorLayersData"][0];
      const playData = layerData.srcPlayData;
      playData.wrapMode = WrapMode.Once;

      expect(sharedWalkState.wrapMode).to.eq(WrapMode.Loop);

      // @ts-ignore
      animator.engine.time._frameCount++;
      animator.update(playData.state.clip.length + 0.1);

      expect(layerData.layerState).to.eq(LayerState.Finished);
    } finally {
      sharedWalkState.wrapMode = oldWrapMode;
    }
  });

  it("playData wrapMode does not leak between animators sharing one controller", () => {
    const sharedWalkState = animator.animatorController.layers[0].stateMachine.states.find(
      (state) => state.name === "Walk"
    );
    const oldWrapMode = sharedWalkState.wrapMode;
    const otherEntity = new Entity(engine);
    const otherAnimator = otherEntity.addComponent(Animator);
    otherAnimator.animatorController = animator.animatorController;

    try {
      sharedWalkState.wrapMode = WrapMode.Loop;
      animator.play("Walk");
      otherAnimator.play("Walk");

      const playData = animator["_animatorLayersData"][0].srcPlayData;
      const otherPlayData = otherAnimator["_animatorLayersData"][0].srcPlayData;
      playData.wrapMode = WrapMode.Once;

      expect(otherPlayData.wrapMode).to.eq(WrapMode.Loop);
      expect(sharedWalkState.wrapMode).to.eq(WrapMode.Loop);
    } finally {
      sharedWalkState.wrapMode = oldWrapMode;
      otherEntity.destroy();
    }
  });

  it("cross fade in fixed time", () => {
    const runState = findSharedState("Run");
    animator.play("Walk");
    animator.crossFadeInFixedDuration("Run", 0.3, 0, 0.1);
    // @ts-ignore
    animator.engine.time._frameCount++;
    // @ts-ignore
    animator.update(0.3);

    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    const srcPlayData = layerData.srcPlayData;
    expect(srcPlayData.state.name).to.eq("Run");
    expect(srcPlayData.playedTime).to.eq(0.3);
    // @ts-ignore
    expect(srcPlayData.clipTime).to.eq(0.3 + 0.1 * runState._getDuration());
  });

  it("animation cross fade by transition", () => {
    const walkState = findSharedState("Walk");
    const runState = findSharedState("Run");
    const transition = new AnimatorStateTransition();
    transition.destinationState = runState;
    transition.duration = 1;
    transition.exitTime = 1;
    walkState.addTransition(transition);

    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.clip.length - 0.1);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;
    const animatorLayerData = animator["_animatorLayersData"];
    const layerState = animatorLayerData[layerIndex].layerState;

    // current animator layerState should be CrossFading(2)
    expect(layerState).to.eq(2);
  });

  it("animation fix cross fade", () => {
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);
    animator.crossFade("Survey", 5);
    animator.crossFade("Run", 0.5);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;
    const animatorLayerData = animator["_animatorLayersData"];
    const layerState = animatorLayerData[layerIndex].layerState;

    // current animator layerState should be FixedCrossFading(3)
    expect(layerState).to.eq(3);
  });

  it("animation layer mask", () => {
    const { animatorController } = animator;

    const animatorStateMachine = new AnimatorStateMachine();
    const additiveLayer = new AnimatorControllerLayer("additiveLayer");
    additiveLayer.stateMachine = animatorStateMachine;
    const mask = AnimatorLayerMask.createByEntity(animator.entity);
    mask.setPathMaskActive("root/_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/b_Neck_04", false, true);
    additiveLayer.mask = mask;
    additiveLayer.blendingMode = AnimatorLayerBlendingMode.Additive;
    animatorController.addLayer(additiveLayer);
    const clip = findSharedState("Run").clip;
    const newState = animatorStateMachine.addState("Run");
    newState.clipStartTime = 1;
    newState.clip = clip;

    animator.play("Walk", 0);
    animator.play("Run", 1);

    const parentEntity = animator.entity.findByPath("root/_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/");
    const targetEntity = animator.entity.findByPath(
      "root/_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/b_Neck_04"
    );
    const childEntity = animator.entity.findByPath(
      "root/_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/b_Neck_04/b_Head_05"
    );

    let layerData = animator["_animatorLayersData"][1];
    const layerCurveOwner = layerData.curveOwnerPool.get(targetEntity.transform)["rotationQuaternion"];
    const parentLayerCurveOwner = layerData.curveOwnerPool.get(parentEntity.transform)["rotationQuaternion"];

    let childLayerCurveOwner = layerData.curveOwnerPool.get(childEntity.transform)["rotationQuaternion"];

    expect(layerCurveOwner.isActive).to.eq(false);
    expect(parentLayerCurveOwner.isActive).to.eq(true);
    expect(childLayerCurveOwner.isActive).to.eq(false);

    animator.animatorController.removeLayer(1);
    mask.removePathMask("root/_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/b_Neck_04/b_Head_05");
    animator.animatorController.addLayer(additiveLayer);
    animator.play("Run", 1);
    layerData = animator["_animatorLayersData"][1];
    childLayerCurveOwner = layerData.curveOwnerPool.get(childEntity.transform)["rotationQuaternion"];
    expect(childLayerCurveOwner.isActive).to.eq(true);
  });

  it("animation event", () => {
    animator.play("Walk");

    class TestScript extends Script {
      event0(): void {}
    }

    const testScript = animator.entity.addComponent(TestScript);
    const testScriptSpy = vi.spyOn(testScript, "event0");

    const event0 = new AnimationEvent();
    event0.functionName = "event0";
    event0.time = 0;

    const state = findSharedState("Walk");
    state.clip.addEvent(event0);
    animator.update(10);
    expect(testScriptSpy).toHaveBeenCalledTimes(1);
  });

  it("animation events bind scripts added after play", () => {
    const state = findSharedState("Walk");
    const event0 = new AnimationEvent();
    event0.functionName = "event0";
    event0.time = 0;
    state.clip.addEvent(event0);

    animator.play("Walk");

    class TestScript extends Script {
      event0(): void {}
    }

    const testScript = animator.entity.addComponent(TestScript);
    const testScriptSpy = vi.spyOn(testScript, "event0");

    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    expect(testScriptSpy).toHaveBeenCalledTimes(1);
  });

  it("animation events added after play rebuild handlers lazily", () => {
    const { entity, animator: loopAnimator, clip } = createLoopAnimator();

    class TestScript extends Script {
      event0(): void {}
    }

    const testScript = entity.addComponent(TestScript);
    const testScriptSpy = vi.spyOn(testScript, "event0");

    try {
      loopAnimator.play("loop");
      updateAnimator(loopAnimator, 0.05);
      expect(testScriptSpy).not.toHaveBeenCalled();

      const event0 = new AnimationEvent();
      event0.functionName = "event0";
      event0.time = 0.1;
      clip.addEvent(event0);

      updateAnimator(loopAnimator, 0.1);
      expect(testScriptSpy).toHaveBeenCalledTimes(1);
    } finally {
      entity.destroy();
    }
  });

  it("fireEvents gates AnimationEvent dispatch without consuming the event", () => {
    animator.play("Walk");

    class TestScript extends Script {
      event0(): void {}
    }

    const testScript = animator.entity.addComponent(TestScript);
    const testScriptSpy = vi.spyOn(testScript, "event0");

    const event0 = new AnimationEvent();
    event0.functionName = "event0";
    event0.time = 0;

    const state = findSharedState("Walk");
    state.clip.addEvent(event0);

    animator.fireEvents = false;
    animator.update(0);
    expect(testScriptSpy).not.toHaveBeenCalled();

    animator.fireEvents = true;
    animator.update(0.1);
    expect(testScriptSpy).toHaveBeenCalledTimes(1);
  });

  it("fires animation events across forward loop wrap", () => {
    const { entity, animator: loopAnimator, clip } = createLoopAnimator();

    class TestScript extends Script {
      event0(): void {}
      event1(): void {}
    }

    const testScript = entity.addComponent(TestScript);
    const event0Spy = vi.spyOn(testScript, "event0");
    const event1Spy = vi.spyOn(testScript, "event1");

    const event0 = new AnimationEvent();
    event0.functionName = "event0";
    event0.time = 0.1;
    const event1 = new AnimationEvent();
    event1.functionName = "event1";
    event1.time = 0.75;
    clip.addEvent(event0);
    clip.addEvent(event1);

    try {
      loopAnimator.play("loop");
      updateAnimator(loopAnimator, 1.25);

      expect(event0Spy).toHaveBeenCalledTimes(2);
      expect(event1Spy).toHaveBeenCalledTimes(1);
    } finally {
      entity.destroy();
    }
  });

  it("fires animation events across backward loop wrap", () => {
    const { entity, animator: loopAnimator, clip } = createLoopAnimator();

    class TestScript extends Script {
      event0(): void {}
      event1(): void {}
      event2(): void {}
    }

    const testScript = entity.addComponent(TestScript);
    const event0Spy = vi.spyOn(testScript, "event0");
    const event1Spy = vi.spyOn(testScript, "event1");
    const event2Spy = vi.spyOn(testScript, "event2");

    const event0 = new AnimationEvent();
    event0.functionName = "event0";
    event0.time = 0.1;
    const event2 = new AnimationEvent();
    event2.functionName = "event2";
    event2.time = 0.6;
    const event1 = new AnimationEvent();
    event1.functionName = "event1";
    event1.time = 0.75;
    clip.addEvent(event0);
    clip.addEvent(event2);
    clip.addEvent(event1);

    try {
      loopAnimator.play("loop");
      updateAnimator(loopAnimator, 0.25);
      expect(event0Spy).toHaveBeenCalledTimes(1);
      expect(event1Spy).not.toHaveBeenCalled();
      expect(event2Spy).not.toHaveBeenCalled();

      event0Spy.mockClear();
      event1Spy.mockClear();
      event2Spy.mockClear();
      loopAnimator.speed = -1;
      updateAnimator(loopAnimator, 0.5);

      expect(event0Spy).toHaveBeenCalledTimes(1);
      expect(event1Spy).toHaveBeenCalledTimes(1);
      expect(event2Spy).not.toHaveBeenCalled();

      event0Spy.mockClear();
      event1Spy.mockClear();
      event2Spy.mockClear();
      updateAnimator(loopAnimator, 0.25);

      expect(event0Spy).not.toHaveBeenCalled();
      expect(event1Spy).not.toHaveBeenCalled();
      expect(event2Spy).toHaveBeenCalledTimes(1);
    } finally {
      entity.destroy();
    }
  });

  it("does not refire animation events when a once clip reaches the end", () => {
    const entity = new Entity(engine);
    const onceAnimator = entity.addComponent(Animator);
    const controller = new AnimatorController(engine);
    const layer = new AnimatorControllerLayer("Base Layer");
    controller.addLayer(layer);

    const state = layer.stateMachine.addState("once");
    state.wrapMode = WrapMode.Once;

    const clip = new AnimationClip("once-clip");
    const curve = new AnimationFloatCurve();
    const start = new Keyframe<number>();
    const end = new Keyframe<number>();
    start.time = 0;
    start.value = 0;
    end.time = 1;
    end.value = 1;
    curve.addKey(start);
    curve.addKey(end);
    clip.addCurveBinding("", Transform, "position.x", curve);

    class TestScript extends Script {
      event0(): void {}
    }

    const event0 = new AnimationEvent();
    event0.functionName = "event0";
    event0.time = 0.5;
    clip.addEvent(event0);
    state.clip = clip;
    onceAnimator.animatorController = controller;

    const testScript = entity.addComponent(TestScript);
    const testScriptSpy = vi.spyOn(testScript, "event0");

    try {
      onceAnimator.play("once");
      // @ts-ignore
      onceAnimator.engine.time._frameCount++;
      onceAnimator.update(0.75);
      expect(testScriptSpy).toHaveBeenCalledTimes(1);

      // @ts-ignore
      onceAnimator.engine.time._frameCount++;
      onceAnimator.update(0.5);
      expect(testScriptSpy).toHaveBeenCalledTimes(1);
    } finally {
      entity.destroy();
    }
  });

  it("stateMachine", () => {
    animator.animatorController.addParameter("playerSpeed", 1);
    const stateMachine = animator.animatorController.layers[0].stateMachine;
    const idleState = findSharedState("Survey");
    const idleSpeed = 2;
    idleState.speed = idleSpeed;
    idleState.clearTransitions();
    const walkState = findSharedState("Walk");
    walkState.clearTransitions();
    const runState = findSharedState("Run");
    runState.clearTransitions();
    let idleToWalkTime = 0;
    let walkToRunTime = 0;
    let runToWalkTime = 0;
    let walkToIdleTime = 0;

    // handle idle state
    const toWalkTransition = new AnimatorStateTransition();
    toWalkTransition.destinationState = walkState;
    toWalkTransition.duration = 0.2;
    toWalkTransition.exitTime = 0.9;
    toWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0);
    idleState.addTransition(toWalkTransition);
    idleToWalkTime =
      //@ts-ignore
      (toWalkTransition.exitTime * idleState._getDuration()) / idleSpeed +
      //@ts-ignore
      toWalkTransition.duration * walkState._getDuration();

    const exitTransition = idleState.addExitTransition();
    exitTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    // to walk state
    const toRunTransition = new AnimatorStateTransition();
    toRunTransition.destinationState = runState;
    toRunTransition.duration = 0.3;
    toRunTransition.exitTime = 0.9;
    toRunTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0.5);
    walkState.addTransition(toRunTransition);
    walkToRunTime =
      //@ts-ignore
      (toRunTransition.exitTime - toWalkTransition.duration) * walkState._getDuration() +
      //@ts-ignore
      toRunTransition.duration * runState._getDuration();
    const toIdleTransition = new AnimatorStateTransition();
    toIdleTransition.destinationState = idleState;
    toIdleTransition.duration = 0.3;
    toIdleTransition.exitTime = 0.9;
    toIdleTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    walkState.addTransition(toIdleTransition);
    walkToIdleTime =
      //@ts-ignore
      (toIdleTransition.exitTime - toRunTransition.duration) * walkState._getDuration() +
      //@ts-ignore
      (toIdleTransition.duration * idleState._getDuration()) / idleSpeed;

    // to run state
    const runToWalkTransition = new AnimatorStateTransition();
    runToWalkTransition.destinationState = walkState;
    runToWalkTransition.duration = 0.3;
    runToWalkTransition.exitTime = 0.9;
    runToWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Less, 0.5);
    runState.addTransition(runToWalkTransition);
    runToWalkTime =
      //@ts-ignore
      (runToWalkTransition.exitTime - toRunTransition.duration) * runState._getDuration() +
      //@ts-ignore
      runToWalkTransition.duration * walkState._getDuration();

    stateMachine.addEntryStateTransition(idleState);

    const anyTransition = stateMachine.addAnyStateTransition(idleState);
    anyTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    anyTransition.duration = 0.3;
    anyTransition.hasExitTime = true;
    anyTransition.exitTime = 0.7;
    let anyToIdleTime =
      // @ts-ignore
      (anyTransition.exitTime - toIdleTransition.duration) * walkState._getDuration() +
      // @ts-ignore
      (anyTransition.duration * idleState._getDuration()) / idleSpeed;

    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(idleToWalkTime - 0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Survey");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");

    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkToRunTime - 0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Run");

    animator.setParameterValue("playerSpeed", 0.4);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(runToWalkTime - 0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Run");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");

    animator.setParameterValue("playerSpeed", 0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(anyToIdleTime - 0.001);
    // apply any transition not walk to idle
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Survey");
  });

  it("stateMachine backwards", () => {
    animator.animatorController.addParameter("playerSpeed", 1);
    animator.speed = -1;
    const stateMachine = animator.animatorController.layers[0].stateMachine;
    stateMachine.clearEntryStateTransitions();
    stateMachine.clearAnyStateTransitions();

    const idleState = findSharedState("Survey");
    const idleSpeed = 2;
    idleState.speed = idleSpeed;
    idleState.clearTransitions();
    const walkState = findSharedState("Walk");
    walkState.clearTransitions();
    const runState = findSharedState("Run");
    runState.clearTransitions();
    let idleToWalkTime = 0;
    let walkToRunTime = 0;
    let runToWalkTime = 0;
    let walkToIdleTime = 0;

    // handle idle state
    const toWalkTransition = new AnimatorStateTransition();
    toWalkTransition.destinationState = walkState;
    toWalkTransition.duration = 0.2;
    toWalkTransition.exitTime = 0.1;
    toWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0);
    idleState.addTransition(toWalkTransition);
    idleToWalkTime =
      //@ts-ignore
      ((1 - toWalkTransition.exitTime) * idleState._getDuration()) / idleSpeed +
      //@ts-ignore
      toWalkTransition.duration * walkState._getDuration();

    const exitTransition = idleState.addExitTransition();
    exitTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    // to walk state
    const toRunTransition = new AnimatorStateTransition();
    toRunTransition.destinationState = runState;
    toRunTransition.duration = 0.3;
    toRunTransition.exitTime = 0.1;
    toRunTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0.5);
    walkState.addTransition(toRunTransition);
    walkToRunTime =
      //@ts-ignore
      (1 - toRunTransition.exitTime - toWalkTransition.duration) * walkState._getDuration() +
      //@ts-ignore
      toRunTransition.duration * runState._getDuration();
    const toIdleTransition = new AnimatorStateTransition();
    toIdleTransition.destinationState = idleState;
    toIdleTransition.duration = 0.3;
    toIdleTransition.exitTime = 0.1;
    toIdleTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    walkState.addTransition(toIdleTransition);
    walkToIdleTime =
      //@ts-ignore
      (1 - toIdleTransition.exitTime - toRunTransition.duration) * walkState._getDuration() +
      //@ts-ignore
      (toIdleTransition.duration * idleState._getDuration()) / idleSpeed;

    // to run state
    const runToWalkTransition = new AnimatorStateTransition();
    runToWalkTransition.destinationState = walkState;
    runToWalkTransition.duration = 0.3;
    runToWalkTransition.exitTime = 0.1;
    runToWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Less, 0.5);
    runState.addTransition(runToWalkTransition);
    runToWalkTime =
      //@ts-ignore
      (1 - runToWalkTransition.exitTime - toRunTransition.duration) * runState._getDuration() +
      //@ts-ignore
      runToWalkTransition.duration * walkState._getDuration();

    stateMachine.addEntryStateTransition(idleState);

    const anyTransition = stateMachine.addAnyStateTransition(idleState);
    anyTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    anyTransition.duration = 0.3;
    anyTransition.hasExitTime = true;
    anyTransition.exitTime = 0.3;
    let anyToIdleTime =
      // @ts-ignore
      (1 - anyTransition.exitTime - toIdleTransition.duration) * walkState._getDuration() +
      // @ts-ignore
      (anyTransition.duration * idleState._getDuration()) / idleSpeed;

    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(idleToWalkTime - 0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Survey");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");

    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkToRunTime - 0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Run");

    animator.setParameterValue("playerSpeed", 0.4);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(runToWalkTime - 0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Run");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");

    animator.setParameterValue("playerSpeed", 0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(anyToIdleTime - 0.001);
    // apply any transition not walk to idle
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Survey");
  });

  it("transitionOffset", () => {
    const walkState = findSharedState("Walk");
    walkState.clearTransitions();
    const runState = findSharedState("Run");
    runState.clearTransitions();
    const toRunTransition = walkState.addTransition(runState);
    toRunTransition.exitTime = 0;
    toRunTransition.duration = 1;
    toRunTransition.offset = 0.5;
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.01);

    const destPlayData = animator["_animatorLayersData"][0].destPlayData;
    const destState = destPlayData.state;
    const transitionDuration = toRunTransition.duration * destState._getDuration();
    const crossWeight = animator["_animatorLayersData"][0].destPlayData.playedTime / transitionDuration;
    expect(crossWeight).to.lessThan(0.01);
  });

  it("clipStartTime crossFade", () => {
    const walkState = findSharedState("Walk");
    walkState.wrapMode = WrapMode.Once;
    walkState.clipStartTime = 0.8;
    walkState.clearTransitions();
    const runState = findSharedState("Run");
    runState.clearTransitions();
    const toRunTransition = walkState.addTransition(runState);
    toRunTransition.exitTime = 0.5;
    toRunTransition.duration = 1;
    runState.clipStartTime = 0.5;
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    const destPlayData = animator["_animatorLayersData"][0].destPlayData;
    expect(destPlayData.state?.name).to.eq("Run");
  });

  it("transition to exit but no entry", () => {
    const animatorLayerData = animator["_animatorLayersData"];

    const walkState = findSharedState("Walk");
    walkState.wrapMode = WrapMode.Once;
    walkState.clearTransitions();
    walkState.addExitTransition();
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(1);
    const transition = animatorLayerData[0]?.crossFadeTransition;

    expect(transition).to.be.oneOf([null, undefined]);
  });

  it("change state in one update", () => {
    const entity = new Entity(engine);
    const animator = entity.addComponent(Animator);
    const animatorController = new AnimatorController(engine);
    const layer = new AnimatorControllerLayer("layer");
    animatorController.addLayer(layer);
    const state1 = layer.stateMachine.addState("state1");
    const state2 = layer.stateMachine.addState("state2");
    state1.wrapMode = WrapMode.Once;
    state2.wrapMode = WrapMode.Once;
    const clip1 = new AnimationClip("clip1");
    const rotationCurve = new AnimationFloatCurve();
    const key1 = new Keyframe<number>();
    const key2 = new Keyframe<number>();
    key1.time = 0;
    key1.value = 0;
    key2.time = 1;
    key2.value = 90;
    rotationCurve.addKey(key1);
    rotationCurve.addKey(key2);
    clip1.addCurveBinding("", Transform, "rotation.x", rotationCurve);

    const clip2 = new AnimationClip("clip2");
    const positionCurve = new AnimationFloatCurve();
    const key3 = new Keyframe<number>();
    const key4 = new Keyframe<number>();
    key3.time = 0;
    key3.value = 0;
    key4.time = 1;
    key4.value = 5;
    positionCurve.addKey(key3);
    positionCurve.addKey(key4);
    clip2.addCurveBinding("", Transform, "position.x", positionCurve);
    state1.clip = clip1;
    state2.clip = clip2;

    const transition = new AnimatorStateTransition();
    transition.destinationState = state2;
    transition.exitTime = 1;
    transition.duration = 1;
    state1.addTransition(transition);

    animator.animatorController = animatorController;
    let enterRotation;
    let exitRotation;
    state1.addStateMachineScript(
      class extends StateMachineScript {
        onStateEnter(animator) {
          enterRotation = animator.entity.transform.rotation.x;
        }
        onStateExit(animator) {
          exitRotation = animator.entity.transform.rotation.x;
        }
      }
    );
    animator.play("state1");

    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(3);
    expect(enterRotation).to.eq(90);
    expect(exitRotation).to.eq(90);
    expect(animator.entity.transform.rotation.x).to.eq(0);
    expect(animator.entity.transform.position.x).to.eq(5);
  });

  it("parameter rename", () => {
    animator.animatorController.addParameter("oldName", 1);
    const param = animator.getParameter("oldName");
    param.name = "newName";
    const value = animator.getParameterValue("newName");
    expect(value).to.eq(1);
    const newParam = animator.animatorController.addParameter("oldName", 2);
    expect(newParam.defaultValue).to.eq(2);
    const newParam2 = animator.animatorController.addParameter("oldName", 2);
    expect(newParam2).to.eq(null);
  });

  it("stateMachineScript", () => {
    const entity = new Entity(engine);
    const animator = entity.addComponent(Animator);
    const animatorController = new AnimatorController(engine);
    const layer = new AnimatorControllerLayer("layer");
    animatorController.addLayer(layer);
    const state1 = layer.stateMachine.addState("state1");
    const state2 = layer.stateMachine.addState("state2");
    state1.wrapMode = WrapMode.Once;
    state2.wrapMode = WrapMode.Once;
    const clip1 = new AnimationClip("clip1");
    const rotationCurve = new AnimationFloatCurve();
    const key1 = new Keyframe<number>();
    const key2 = new Keyframe<number>();
    key1.time = 0;
    key1.value = 0;
    key2.time = 1;
    key2.value = 90;
    rotationCurve.addKey(key1);
    rotationCurve.addKey(key2);
    clip1.addCurveBinding("", Transform, "rotation.x", rotationCurve);

    const clip2 = new AnimationClip("clip2");
    const positionCurve = new AnimationFloatCurve();
    const key3 = new Keyframe<number>();
    const key4 = new Keyframe<number>();
    key3.time = 0;
    key3.value = 0;
    key4.time = 1;
    key4.value = 5;
    positionCurve.addKey(key3);
    positionCurve.addKey(key4);
    clip2.addCurveBinding("", Transform, "position.x", positionCurve);
    state1.clip = clip1;
    state2.clip = clip2;

    const transition = new AnimatorStateTransition();
    transition.destinationState = state2;
    transition.exitTime = 1;
    transition.duration = 1;
    state1.addTransition(transition);

    animator.animatorController = animatorController;

    class TestScript extends StateMachineScript {
      onStateEnter(animator) {}
      onStateExit(animator) {}
    }

    const testScript = state1.addStateMachineScript(TestScript);
    const testScript2 = state2.addStateMachineScript(TestScript);

    const onStateEnterSpy = vi.spyOn(testScript, "onStateEnter");
    const onStateExitSpy = vi.spyOn(testScript, "onStateExit");
    const onStateEnter2Spy = vi.spyOn(testScript2, "onStateEnter");
    const onStateExit2Spy = vi.spyOn(testScript2, "onStateExit");

    animator.play("state1");

    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(3);

    expect(onStateEnterSpy).toHaveBeenCalledTimes(1);
    expect(onStateExitSpy).toHaveBeenCalledTimes(1);
    expect(onStateEnter2Spy).toHaveBeenCalledTimes(1);
    expect(onStateExit2Spy).toHaveBeenCalledTimes(1);
  });

  it("anyTransition", () => {
    const { animatorController } = animator;
    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    animatorController.addParameter("playRun", 0);
    const stateMachine = animatorController.layers[0].stateMachine;
    stateMachine.clearEntryStateTransitions();
    stateMachine.clearAnyStateTransitions();
    const walkState = findSharedState("Run");
    // For test clipStartTime is not 0 and transition duration is 0
    walkState.clipStartTime = 0.5;
    walkState.addStateMachineScript(
      class extends StateMachineScript {
        onStateEnter(animator) {
          animator.setParameterValue("playRun", 0);
        }
      }
    );
    const transition = stateMachine.addAnyStateTransition(findSharedState("Run"));
    transition.addCondition("playRun", AnimatorConditionMode.Equals, 1);
    // For test clipStartTime is not 0 and transition duration is 0
    transition.duration = 0;
    animator.setParameterValue("playRun", 1);

    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.5);

    expect(layerData.srcPlayData.state.name).to.eq("Run");
    expect(layerData.srcPlayData.playedTime).to.eq(0.5);
    expect(layerData.srcPlayData.clipTime).to.eq(walkState.clip.length * 0.5 + 0.5);
  });

  it("hasExitTime", () => {
    const { animatorController } = animator;
    animatorController.addParameter("triggerIdle", false);
    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    const stateMachine = animatorController.layers[0].stateMachine;
    stateMachine.clearEntryStateTransitions();
    stateMachine.clearAnyStateTransitions();
    const idleState = findSharedState("Survey");
    idleState.speed = 1;
    idleState.clearTransitions();
    const walkState = findSharedState("Walk");
    walkState.clipStartTime = 0;
    walkState.clearTransitions();
    const runState = findSharedState("Run");
    runState.clearTransitions();
    const walkToRunTransition = walkState.addTransition(runState);
    walkToRunTransition.hasExitTime = true;
    walkToRunTransition.exitTime = 0.5;
    walkToRunTransition.duration = 0;

    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.clip.length * 0.5);
    expect(layerData.destPlayData.state.name).to.eq("Run");
    expect(layerData.destPlayData.playedTime).to.eq(0);
    const anyToIdleTransition = stateMachine.addAnyStateTransition(idleState);
    anyToIdleTransition.hasExitTime = false;
    anyToIdleTransition.duration = 0.2;
    anyToIdleTransition.addCondition("triggerIdle", AnimatorConditionMode.If, true);
    animator.setParameterValue("triggerIdle", true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);
    expect(layerData.srcPlayData.state.name).to.eq("Run");
    expect(layerData.srcPlayData.playedTime).to.eq(0.1);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(idleState.clip.length * 0.2 - 0.1);
    expect(layerData.srcPlayData.state.name).to.eq("Survey");
    expect(layerData.srcPlayData.clipTime).to.eq(idleState.clip.length * 0.2);
  });

  it("setTriggerParameter", () => {
    const { animatorController } = animator;
    animatorController.addTriggerParameter("triggerRun");
    animatorController.addTriggerParameter("triggerWalk");
    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    const stateMachine = animatorController.layers[0].stateMachine;
    stateMachine.clearEntryStateTransitions();
    stateMachine.clearAnyStateTransitions();
    const walkState = findSharedState("Walk");
    walkState.clearTransitions();
    const runState = findSharedState("Run");
    runState.clipStartTime = 0;
    runState.clearTransitions();
    const walkToRunTransition = walkState.addTransition(runState);
    walkToRunTransition.hasExitTime = false;
    walkToRunTransition.duration = 0.1;
    walkToRunTransition.addCondition("triggerRun", AnimatorConditionMode.If, true);

    const runToWalkTransition = runState.addTransition(walkState);
    runToWalkTransition.hasExitTime = true;
    runToWalkTransition.exitTime = 0.7;
    runToWalkTransition.duration = 0.3;
    runToWalkTransition.addCondition("triggerWalk", AnimatorConditionMode.If, true);

    animator.play("Walk");
    animator.activateTriggerParameter("triggerRun");
    animator.activateTriggerParameter("triggerWalk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);
    expect(layerData.srcPlayData.state.name).to.eq("Walk");
    expect(layerData.srcPlayData.playedTime).to.eq(0.1);
    expect(layerData.destPlayData.state.name).to.eq("Run");
    expect(layerData.destPlayData.playedTime).to.eq(0.1);
    expect(animator.getParameterValue("triggerRun")).to.eq(false);
    expect(animator.getParameterValue("triggerWalk")).to.eq(true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(runState.clip.length * 0.1 - 0.1);
    expect(layerData.srcPlayData.state.name).to.eq("Run");
    expect(layerData.srcPlayData.playedTime).to.eq(runState.clip.length * 0.1);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(runState.clip.length * 0.6);
    expect(layerData.destPlayData.state.name).to.eq("Walk");
    expect(layerData.destPlayData.playedTime).to.eq(0);
    expect(animator.getParameterValue("triggerWalk")).to.eq(false);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.clip.length * 0.3);
    expect(layerData.srcPlayData.state.name).to.eq("Walk");
    expect(layerData.srcPlayData.playedTime).to.eq(walkState.clip.length * 0.3);
  });

  it("fixedDuration", () => {
    const { animatorController } = animator;
    animatorController.addTriggerParameter("triggerRun");
    animatorController.addTriggerParameter("triggerWalk");
    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    const walkState = findSharedState("Walk");
    walkState.clearTransitions();
    const runState = findSharedState("Run");
    runState.clipStartTime = runState.clipEndTime = 0;
    runState.clearTransitions();
    const walkToRunTransition = walkState.addTransition(runState);
    walkToRunTransition.hasExitTime = false;
    walkToRunTransition.isFixedDuration = true;
    walkToRunTransition.duration = 0.1;
    walkToRunTransition.addCondition("triggerRun", AnimatorConditionMode.If, true);
    animator.play("Walk");
    animator.activateTriggerParameter("triggerRun");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);
    expect(layerData.srcPlayData.state.name).to.eq("Run");
    expect(layerData.srcPlayData.playedTime).to.eq(0.1);
    expect(layerData.srcPlayData.clipTime).to.eq(0);
  });

  it("transitionIndex", () => {
    const entity = new Entity(engine);
    const animator = entity.addComponent(Animator);
    const animatorController = new AnimatorController(engine);
    animator.animatorController = animatorController;
    const layer = new AnimatorControllerLayer("layer");
    animatorController.addLayer(layer);
    const state1 = layer.stateMachine.addState("state1");
    const state2 = layer.stateMachine.addState("state2");
    state1.wrapMode = WrapMode.Once;
    state2.wrapMode = WrapMode.Once;
    const clip1 = new AnimationClip("clip1");
    const rotationCurve = new AnimationFloatCurve();
    const key1 = new Keyframe<number>();
    const key2 = new Keyframe<number>();
    key1.time = 0;
    key1.value = 0;
    key2.time = 1;
    key2.value = 90;
    rotationCurve.addKey(key1);
    rotationCurve.addKey(key2);
    clip1.addCurveBinding("", Transform, "rotation.x", rotationCurve);

    const clip2 = new AnimationClip("clip2");
    const positionCurve = new AnimationFloatCurve();
    const key3 = new Keyframe<number>();
    const key4 = new Keyframe<number>();
    key3.time = 0;
    key3.value = 0;
    key4.time = 0.1;
    key4.value = 5;
    positionCurve.addKey(key3);
    positionCurve.addKey(key4);
    clip2.addCurveBinding("", Transform, "position.x", positionCurve);
    state1.clip = clip1;
    state2.clip = clip2;

    const transition = state1.addTransition(state2);
    transition.exitTime = 1;
    transition.duration = 0.5;
    transition.mute = true;

    const transition2 = state1.addTransition(state2);
    transition2.hasExitTime = false;
    transition2.duration = 0.5;
    transition2.mute = true;

    const transition3 = state1.addTransition(state2);
    transition3.exitTime = 0.2;
    transition3.duration = 0.5;
    transition3.mute = true;

    animator.play("state1");

    let animatorLayerData = animator["_animatorLayersData"];
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.6);
    expect(animatorLayerData[0]?.srcPlayData.state.name).to.eq("state1");

    transition2.mute = false;
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.3);
    expect(animatorLayerData[0]?.srcPlayData.state.name).to.eq("state2");
  });

  it("removing a default state prevents it from being auto-played", () => {
    const entity = new Entity(engine);
    const localAnimator = entity.addComponent(Animator);
    const controller = new AnimatorController(engine);
    const layer = new AnimatorControllerLayer("layer");
    controller.addLayer(layer);

    const removedState = layer.stateMachine.addState("removed");
    const clip = new AnimationClip("removed-clip");
    const curve = new AnimationFloatCurve();
    const start = new Keyframe<number>();
    const end = new Keyframe<number>();
    start.time = 0;
    start.value = 0;
    end.time = 1;
    end.value = 1;
    curve.addKey(start);
    curve.addKey(end);
    clip.addCurveBinding("", Transform, "position.x", curve);
    removedState.clip = clip;
    layer.stateMachine.defaultState = removedState;
    layer.stateMachine.removeState(removedState);
    localAnimator.animatorController = controller;

    try {
      localAnimator.update(0.1);
      expect(localAnimator.getCurrentAnimatorState(0)).to.eq(null);
    } finally {
      entity.destroy();
    }
  });

  it("Clone", () => {
    expect(animator.entity.clone().getComponent(Animator).animatorController).to.eq(animator.animatorController);
  });

  it("samples self-name-prefixed curve paths on wrapped roots", () => {
    const wrappedRoot = new Entity(engine, "GLTF_ROOT");
    const hips = new Entity(engine, "mixamorig:Hips");
    const spine = new Entity(engine, "mixamorig:Spine");
    hips.parent = wrappedRoot;
    spine.parent = hips;

    const clip = new AnimationClip("idle");
    const hipsCurve = new AnimationFloatCurve();
    const spineCurve = new AnimationFloatCurve();
    const hipsStart = new Keyframe<number>();
    const hipsEnd = new Keyframe<number>();
    hipsStart.time = 0;
    hipsStart.value = 0;
    hipsEnd.time = 0.1;
    hipsEnd.value = 1;
    hipsCurve.addKey(hipsStart);
    hipsCurve.addKey(hipsEnd);

    const spineStart = new Keyframe<number>();
    const spineEnd = new Keyframe<number>();
    spineStart.time = 0;
    spineStart.value = 0;
    spineEnd.time = 0.1;
    spineEnd.value = 1;
    spineCurve.addKey(spineStart);
    spineCurve.addKey(spineEnd);

    clip.addCurveBinding("mixamorig:Hips", Transform, "position.x", hipsCurve);
    clip.addCurveBinding("mixamorig:Hips/mixamorig:Spine", Transform, "position.y", spineCurve);

    expect(wrappedRoot.findByPath("mixamorig:Hips")).to.eq(hips);
    expect(wrappedRoot.findByPath("mixamorig:Hips/mixamorig:Spine")).to.eq(spine);

    // @ts-ignore
    clip._sampleAnimation(wrappedRoot, 0.1);

    expect(wrappedRoot.transform.position.x).to.eq(0);
    expect(hips.transform.position.x).to.eq(1);
    expect(spine.transform.position.y).to.eq(1);
  });

  it("sampleAnimation samples clip curves without firing AnimationEvents", () => {
    const entity = new Entity(engine, "sample-root");
    const clip = new AnimationClip("sample");
    const curve = new AnimationFloatCurve();
    const start = new Keyframe<number>();
    const end = new Keyframe<number>();
    start.time = 0;
    start.value = 0;
    end.time = 1;
    end.value = 3;
    curve.addKey(start);
    curve.addKey(end);
    clip.addCurveBinding("", Transform, "position.x", curve);

    class TestScript extends Script {
      event0(): void {}
    }

    const script = entity.addComponent(TestScript);
    const eventSpy = vi.spyOn(script, "event0");
    const event0 = new AnimationEvent();
    event0.functionName = "event0";
    event0.time = 0;
    clip.addEvent(event0);

    try {
      clip.sampleAnimation(entity, 1);
      expect(entity.transform.position.x).to.eq(3);
      expect(eventSpy).not.toHaveBeenCalled();
    } finally {
      entity.destroy();
    }
  });

  it("anyState transition interrupts crossFade", () => {
    const { animatorController } = animator;
    animatorController.addParameter("interrupt", false);
    const stateMachine = animatorController.layers[0].stateMachine;
    const idleState = findSharedState("Survey");

    // AnyState -> Idle (can interrupt)
    const anyToIdle = stateMachine.addAnyStateTransition(idleState);
    anyToIdle.hasExitTime = false;
    anyToIdle.duration = 0.2;
    anyToIdle.addCondition("interrupt", AnimatorConditionMode.If, true);

    // Start crossFade using crossFade method
    animator.play("Walk");
    animator.crossFade("Run", 1.0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // Get layerData after update (layerData is recreated after _reset in afterEach)
    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);

    expect(layerData.layerState).to.eq(LayerState.CrossFading);
    expect(layerData.destPlayData.state.name).to.eq("Run");

    // Trigger interrupt during crossFade
    animator.setParameterValue("interrupt", true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // Should have interrupted to Idle
    expect(layerData.destPlayData.state.name).to.eq("Survey");
  });

  it("noExitTime transition scan should ignore exitTime transitions", () => {
    const { animatorController } = animator;
    animatorController.addParameter("goRun", true);
    animatorController.addParameter("never", false);

    const walkState = findSharedState("Walk");
    const runState = findSharedState("Run");
    const idleState = findSharedState("Survey");

    walkState.clipStartTime = 0;
    walkState.clipEndTime = 1;
    walkState.clearTransitions();

    // A noExitTime transition that fails (ensures noExitTimeCount > 0).
    const noExitFailTransition = walkState.addTransition(idleState);
    noExitFailTransition.hasExitTime = false;
    noExitFailTransition.duration = 0;
    noExitFailTransition.addCondition("never", AnimatorConditionMode.If, true);

    // A hasExitTime transition whose conditions are true, but should not fire until exitTime.
    const exitTimeTransition = new AnimatorStateTransition();
    exitTimeTransition.exitTime = 0.5;
    exitTimeTransition.duration = 0;
    exitTimeTransition.destinationState = runState;
    exitTimeTransition.addCondition("goRun", AnimatorConditionMode.If, true);
    walkState.addTransition(exitTimeTransition);

    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    animator.play("Walk");

    // Update before exitTime, should still be in Walk and not start transitioning to Run.
    const preExitDeltaTime = walkState.clip.length * 0.25;
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(preExitDeltaTime);
    expect(layerData.srcPlayData.state.name).to.eq("Walk");
    expect(layerData.destPlayData).to.be.null;

    // Update past exitTime, should transition to Run.
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.clip.length * 0.5);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Run");
  });

  it("anyState transition interrupts FixedCrossFading", () => {
    const { animatorController } = animator;
    animatorController.addParameter("interrupt", false);
    const stateMachine = animatorController.layers[0].stateMachine;
    const idleState = findSharedState("Survey");
    const walkState = findSharedState("Walk");

    // AnyState -> Idle (can interrupt)
    const anyToIdle = stateMachine.addAnyStateTransition(idleState);
    anyToIdle.hasExitTime = false;
    anyToIdle.duration = 0.2;
    anyToIdle.addCondition("interrupt", AnimatorConditionMode.If, true);

    // Play Walk with Once mode, let it finish to reach Finished state
    walkState.wrapMode = WrapMode.Once;
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.clip.length + 0.1);

    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);

    expect(layerData.layerState).to.eq(LayerState.Finished);

    // CrossFade from Finished state → FixedCrossFading
    animator.crossFade("Run", 1.0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    expect(layerData.layerState).to.eq(LayerState.FixedCrossFading);
    expect(layerData.destPlayData.state.name).to.eq("Run");

    // Trigger interrupt during FixedCrossFading
    animator.setParameterValue("interrupt", true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // Should have interrupted to Idle
    expect(layerData.destPlayData.state.name).to.eq("Survey");
  });

  it("anyState interrupt should skip transition to same destination state", () => {
    const { animatorController } = animator;
    animatorController.addParameter("alwaysTrue", true);
    const stateMachine = animatorController.layers[0].stateMachine;
    const runState = findSharedState("Run");

    // AnyState -> Run (always true, noExitTime)
    const anyToRun = stateMachine.addAnyStateTransition(runState);
    anyToRun.hasExitTime = false;
    anyToRun.duration = 0.2;
    anyToRun.addCondition("alwaysTrue", AnimatorConditionMode.If, true);

    // Start crossFade Walk -> Run
    animator.play("Walk");
    animator.crossFade("Run", 1.0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);

    // Should be in CrossFading state, dest = Run
    expect(layerData.layerState).to.eq(LayerState.CrossFading);
    expect(layerData.destPlayData.state.name).to.eq("Run");

    // Update again - anyState -> Run should be skipped because dest is already Run
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // Should still be CrossFading to Run (not interrupted/reset)
    expect(layerData.layerState).to.eq(LayerState.CrossFading);
    expect(layerData.destPlayData.state.name).to.eq("Run");
  });

  it("zero-duration crossFade should not be interrupted by anyState transition", () => {
    const { animatorController } = animator;
    animatorController.addParameter("interrupt", true);
    const stateMachine = animatorController.layers[0].stateMachine;
    const idleState = findSharedState("Survey");

    // AnyState -> Idle (always true, noExitTime)
    const anyToIdle = stateMachine.addAnyStateTransition(idleState);
    anyToIdle.hasExitTime = false;
    anyToIdle.duration = 0.2;
    anyToIdle.addCondition("interrupt", AnimatorConditionMode.If, true);

    // Start crossFade with duration = 0 (instant transition)
    animator.play("Walk");
    animator.crossFade("Run", 0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);

    // Zero-duration crossFade completes instantly, should be Playing Run (not interrupted to Survey)
    expect(layerData.srcPlayData.state.name).to.eq("Run");
  });

  it("toggle hasExitTime should maintain correct noExitTimeCount", () => {
    const walkState = findSharedState("Walk");
    const runState = findSharedState("Run");
    const idleState = findSharedState("Survey");
    walkState.clearTransitions();

    // Add a noExitTime transition
    const t1 = walkState.addTransition(runState);
    t1.hasExitTime = false;

    // Add a hasExitTime transition
    const t2 = walkState.addTransition(idleState);
    t2.hasExitTime = true;
    t2.exitTime = 0.5;

    // @ts-ignore
    const collection = walkState._transitionCollection;
    expect(collection.noExitTimeCount).to.eq(1);
    expect(collection.count).to.eq(2);

    // Toggle noExitTime -> hasExitTime
    t1.hasExitTime = true;
    t1.exitTime = 0.8;
    expect(collection.noExitTimeCount).to.eq(0);
    expect(collection.count).to.eq(2);

    // Toggle hasExitTime -> noExitTime
    t2.hasExitTime = false;
    expect(collection.noExitTimeCount).to.eq(1);
    expect(collection.count).to.eq(2);

    // Verify array order: [t2(noExitTime), t1(exitTime=0.8)]
    expect(collection.get(0)).to.eq(t2);
    expect(collection.get(1)).to.eq(t1);
  });
});
