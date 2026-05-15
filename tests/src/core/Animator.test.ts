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
import { Quaternion, Vector3 } from "@galacean/engine-math";
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
    animator.destroy();
    engine.destroy();
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

    // 清理各状态的 transitions 并恢复默认属性 (mutate shared AnimatorStateDef)
    const stateNames = ["Survey", "Walk", "Run"];
    for (const name of stateNames) {
      const view = animator.findAnimatorState(name);
      if (view) {
        const def = view.def;
        def.clearTransitions();
        def.speed = 1;
        def.clipStartTime = 0;
        def.clipEndTime = 1;
        def.wrapMode = WrapMode.Loop;
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
    const srcRuntime = animatorLayerData[0]?.srcRuntime;

    const speed = 1;
    let expectedSpeed = speed * 0.5;
    animator.speed = expectedSpeed;
    let playedTime = srcRuntime.playedTime;
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(5);
    expect(animator.speed).to.eq(expectedSpeed);
    expect(srcRuntime.playedTime).to.eq(playedTime + 5 * expectedSpeed);
    expectedSpeed = speed * 2;
    animator.speed = expectedSpeed;
    playedTime = srcRuntime.playedTime;
    animator.update(10);
    expect(animator.speed).to.eq(expectedSpeed);
    expect(srcRuntime.playedTime).to.eq(playedTime + 10 * expectedSpeed);
    expectedSpeed = speed * 0;
    animator.speed = expectedSpeed;
    playedTime = srcRuntime.playedTime;
    animator.update(15);
    expect(animator.speed).to.eq(expectedSpeed);
    expect(srcRuntime.playedTime).to.eq(playedTime + 15 * expectedSpeed);
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
    const srcRuntime = animatorLayerData[0]?.srcRuntime;
    animator.update(5);
    const curveOwner = srcRuntime.stateData.curveLayerOwner[0].curveOwner;
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
    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;

    animator.play(stateName);
    const currentAnimatorState = animator.getCurrentAnimatorState(layerIndex);
    let animatorState = animator.findAnimatorState(stateName, layerIndex);
    expect(animatorState.def).to.eq(currentAnimatorState);

    animator.play(expectedStateName);
    animatorState = animator.findAnimatorState(expectedStateName, layerIndex);
    expect(animatorState.def).not.to.eq(currentAnimatorState);
    expect(animatorState.def.name).to.eq(expectedStateName);
  });

  it("animation getCurrentAnimatorState", () => {
    //get random animation element from gltf resource
    const min = 0;
    const max = resource.animations.length - 1;
    const index = Math.floor(Math.random() * (max - min + 1)) + min;

    //play animation and get current animator state
    const expectedStateName = resource.animations[index].name;
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

  it("cross fade in fixed time", () => {
    const runState = animator.findAnimatorState("Run");
    animator.play("Walk");
    animator.crossFadeInFixedDuration("Run", 0.3, 0, 0.1);
    // @ts-ignore
    animator.engine.time._frameCount++;
    // @ts-ignore
    animator.update(0.3);

    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    const srcRuntime = layerData.srcRuntime;
    expect(srcRuntime.state.name).to.eq("Run");
    expect(srcRuntime.playedTime).to.eq(0.3);
    // @ts-ignore
    expect(srcRuntime.clipTime).to.eq(0.3 + 0.1 * runState.def._getDuration());
  });

  it("animation cross fade by transition", () => {
    const walkState = animator.findAnimatorState("Walk");
    const runState = animator.findAnimatorState("Run");
    const transition = new AnimatorStateTransition();
    transition.destinationState = runState.def;
    transition.duration = 1;
    transition.exitTime = 1;
    walkState.def.addTransition(transition);

    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.def.clip.length - 0.1);
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
    const clip = animator.findAnimatorState("Run").def.clip;
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
    const layerCurveOwner = layerData.curveOwnerPool[targetEntity.transform.instanceId]["rotationQuaternion"];
    const parentLayerCurveOwner = layerData.curveOwnerPool[parentEntity.transform.instanceId]["rotationQuaternion"];

    let childLayerCurveOwner = layerData.curveOwnerPool[childEntity.transform.instanceId]["rotationQuaternion"];

    expect(layerCurveOwner.isActive).to.eq(false);
    expect(parentLayerCurveOwner.isActive).to.eq(true);
    expect(childLayerCurveOwner.isActive).to.eq(false);

    animator.animatorController.removeLayer(1);
    mask.removePathMask("root/_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/b_Neck_04/b_Head_05");
    animator.animatorController.addLayer(additiveLayer);
    animator.play("Run", 1);
    layerData = animator["_animatorLayersData"][1];
    childLayerCurveOwner = layerData.curveOwnerPool[childEntity.transform.instanceId]["rotationQuaternion"];
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

    const state = animator.findAnimatorState("Walk");
    state.clip.addEvent(event0);
    animator.update(10);
    expect(testScriptSpy).toHaveBeenCalledTimes(1);
  });

  it("stateMachine", () => {
    animator.animatorController.addParameter("playerSpeed", 1);
    const stateMachine = animator.animatorController.layers[0].stateMachine;
    const idleState = animator.findAnimatorState("Survey");
    const idleSpeed = 2;
    idleState.speed = idleSpeed;
    idleState.def.clearTransitions();
    const walkState = animator.findAnimatorState("Walk");
    walkState.def.clearTransitions();
    const runState = animator.findAnimatorState("Run");
    runState.def.clearTransitions();
    let idleToWalkTime = 0;
    let walkToRunTime = 0;
    let runToWalkTime = 0;
    let walkToIdleTime = 0;

    // handle idle state
    const toWalkTransition = new AnimatorStateTransition();
    toWalkTransition.destinationState = walkState.def;
    toWalkTransition.duration = 0.2;
    toWalkTransition.exitTime = 0.9;
    toWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0);
    idleState.def.addTransition(toWalkTransition);
    idleToWalkTime =
      //@ts-ignore
      (toWalkTransition.exitTime * idleState.def._getDuration()) / idleSpeed +
      //@ts-ignore
      toWalkTransition.duration * walkState.def._getDuration();

    const exitTransition = idleState.def.addExitTransition();
    exitTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    // to walk state
    const toRunTransition = new AnimatorStateTransition();
    toRunTransition.destinationState = runState.def;
    toRunTransition.duration = 0.3;
    toRunTransition.exitTime = 0.9;
    toRunTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0.5);
    walkState.def.addTransition(toRunTransition);
    walkToRunTime =
      //@ts-ignore
      (toRunTransition.exitTime - toWalkTransition.duration) * walkState.def._getDuration() +
      //@ts-ignore
      toRunTransition.duration * runState.def._getDuration();
    const toIdleTransition = new AnimatorStateTransition();
    toIdleTransition.destinationState = idleState.def;
    toIdleTransition.duration = 0.3;
    toIdleTransition.exitTime = 0.9;
    toIdleTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    walkState.def.addTransition(toIdleTransition);
    walkToIdleTime =
      //@ts-ignore
      (toIdleTransition.exitTime - toRunTransition.duration) * walkState.def._getDuration() +
      //@ts-ignore
      (toIdleTransition.duration * idleState.def._getDuration()) / idleSpeed;

    // to run state
    const runToWalkTransition = new AnimatorStateTransition();
    runToWalkTransition.destinationState = walkState.def;
    runToWalkTransition.duration = 0.3;
    runToWalkTransition.exitTime = 0.9;
    runToWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Less, 0.5);
    runState.def.addTransition(runToWalkTransition);
    runToWalkTime =
      //@ts-ignore
      (runToWalkTransition.exitTime - toRunTransition.duration) * runState.def._getDuration() +
      //@ts-ignore
      runToWalkTransition.duration * walkState.def._getDuration();

    stateMachine.addEntryStateTransition(idleState.def);

    const anyTransition = stateMachine.addAnyStateTransition(idleState.def);
    anyTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    anyTransition.duration = 0.3;
    anyTransition.hasExitTime = true;
    anyTransition.exitTime = 0.7;
    let anyToIdleTime =
      // @ts-ignore
      (anyTransition.exitTime - toIdleTransition.duration) * walkState.def._getDuration() +
      // @ts-ignore
      (anyTransition.duration * idleState.def._getDuration()) / idleSpeed;

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

    const idleState = animator.findAnimatorState("Survey");
    const idleSpeed = 2;
    idleState.speed = idleSpeed;
    idleState.def.clearTransitions();
    const walkState = animator.findAnimatorState("Walk");
    walkState.def.clearTransitions();
    const runState = animator.findAnimatorState("Run");
    runState.def.clearTransitions();
    let idleToWalkTime = 0;
    let walkToRunTime = 0;
    let runToWalkTime = 0;
    let walkToIdleTime = 0;

    // handle idle state
    const toWalkTransition = new AnimatorStateTransition();
    toWalkTransition.destinationState = walkState.def;
    toWalkTransition.duration = 0.2;
    toWalkTransition.exitTime = 0.1;
    toWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0);
    idleState.def.addTransition(toWalkTransition);
    idleToWalkTime =
      //@ts-ignore
      ((1 - toWalkTransition.exitTime) * idleState.def._getDuration()) / idleSpeed +
      //@ts-ignore
      toWalkTransition.duration * walkState.def._getDuration();

    const exitTransition = idleState.def.addExitTransition();
    exitTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    // to walk state
    const toRunTransition = new AnimatorStateTransition();
    toRunTransition.destinationState = runState.def;
    toRunTransition.duration = 0.3;
    toRunTransition.exitTime = 0.1;
    toRunTransition.addCondition("playerSpeed", AnimatorConditionMode.Greater, 0.5);
    walkState.def.addTransition(toRunTransition);
    walkToRunTime =
      //@ts-ignore
      (1 - toRunTransition.exitTime - toWalkTransition.duration) * walkState.def._getDuration() +
      //@ts-ignore
      toRunTransition.duration * runState.def._getDuration();
    const toIdleTransition = new AnimatorStateTransition();
    toIdleTransition.destinationState = idleState.def;
    toIdleTransition.duration = 0.3;
    toIdleTransition.exitTime = 0.1;
    toIdleTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    walkState.def.addTransition(toIdleTransition);
    walkToIdleTime =
      //@ts-ignore
      (1 - toIdleTransition.exitTime - toRunTransition.duration) * walkState.def._getDuration() +
      //@ts-ignore
      (toIdleTransition.duration * idleState.def._getDuration()) / idleSpeed;

    // to run state
    const runToWalkTransition = new AnimatorStateTransition();
    runToWalkTransition.destinationState = walkState.def;
    runToWalkTransition.duration = 0.3;
    runToWalkTransition.exitTime = 0.1;
    runToWalkTransition.addCondition("playerSpeed", AnimatorConditionMode.Less, 0.5);
    runState.def.addTransition(runToWalkTransition);
    runToWalkTime =
      //@ts-ignore
      (1 - runToWalkTransition.exitTime - toRunTransition.duration) * runState.def._getDuration() +
      //@ts-ignore
      runToWalkTransition.duration * walkState.def._getDuration();

    stateMachine.addEntryStateTransition(idleState.def);

    const anyTransition = stateMachine.addAnyStateTransition(idleState.def);
    anyTransition.addCondition("playerSpeed", AnimatorConditionMode.Equals, 0);
    anyTransition.duration = 0.3;
    anyTransition.hasExitTime = true;
    anyTransition.exitTime = 0.3;
    let anyToIdleTime =
      // @ts-ignore
      (1 - anyTransition.exitTime - toIdleTransition.duration) * walkState.def._getDuration() +
      // @ts-ignore
      (anyTransition.duration * idleState.def._getDuration()) / idleSpeed;

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
    const walkState = animator.findAnimatorState("Walk");
    walkState.def.clearTransitions();
    const runState = animator.findAnimatorState("Run");
    runState.def.clearTransitions();
    const toRunTransition = walkState.def.addTransition(runState.def);
    toRunTransition.exitTime = 0;
    toRunTransition.duration = 1;
    toRunTransition.offset = 0.5;
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.01);

    const destRuntime = animator["_animatorLayersData"][0].destRuntime;
    const destState = destRuntime.state;
    const transitionDuration = toRunTransition.duration * destState._getDuration();
    const crossWeight = animator["_animatorLayersData"][0].destRuntime.playedTime / transitionDuration;
    expect(crossWeight).to.lessThan(0.01);
  });

  it("clipStartTime crossFade", () => {
    const walkState = animator.findAnimatorState("Walk");
    walkState.def.wrapMode = WrapMode.Once;
    walkState.def.clipStartTime = 0.8;
    walkState.def.clearTransitions();
    const runState = animator.findAnimatorState("Run");
    runState.def.clearTransitions();
    const toRunTransition = walkState.def.addTransition(runState.def);
    toRunTransition.exitTime = 0.5;
    toRunTransition.duration = 1;
    runState.def.clipStartTime = 0.5;
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    const destRuntime = animator["_animatorLayersData"][0].destRuntime;
    expect(destRuntime.state?.name).to.eq("Run");
  });

  it("transition to exit but no entry", () => {
    const animatorLayerData = animator["_animatorLayersData"];

    const walkState = animator.findAnimatorState("Walk");
    walkState.def.wrapMode = WrapMode.Once;
    walkState.def.clearTransitions();
    walkState.def.addExitTransition();
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
    const walkState = animator.findAnimatorState("Run");
    // For test clipStartTime is not 0 and transition duration is 0
    walkState.def.clipStartTime = 0.5;
    walkState.def.addStateMachineScript(
      class extends StateMachineScript {
        onStateEnter(animator) {
          animator.setParameterValue("playRun", 0);
        }
      }
    );
    const transition = stateMachine.addAnyStateTransition(animator.findAnimatorState("Run").def);
    transition.addCondition("playRun", AnimatorConditionMode.Equals, 1);
    // For test clipStartTime is not 0 and transition duration is 0
    transition.duration = 0;
    animator.setParameterValue("playRun", 1);

    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.5);

    expect(layerData.srcRuntime.state.name).to.eq("Run");
    expect(layerData.srcRuntime.playedTime).to.eq(0.5);
    expect(layerData.srcRuntime.clipTime).to.eq(walkState.def.clip.length * 0.5 + 0.5);
  });

  it("hasExitTime", () => {
    const { animatorController } = animator;
    animatorController.addParameter("triggerIdle", false);
    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    const stateMachine = animatorController.layers[0].stateMachine;
    stateMachine.clearEntryStateTransitions();
    stateMachine.clearAnyStateTransitions();
    const idleState = animator.findAnimatorState("Survey");
    idleState.speed = 1;
    idleState.def.clearTransitions();
    const walkState = animator.findAnimatorState("Walk");
    walkState.def.clipStartTime = 0;
    walkState.def.clearTransitions();
    const runState = animator.findAnimatorState("Run");
    runState.def.clearTransitions();
    const walkToRunTransition = walkState.def.addTransition(runState.def);
    walkToRunTransition.hasExitTime = true;
    walkToRunTransition.exitTime = 0.5;
    walkToRunTransition.duration = 0;

    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.def.clip.length * 0.5);
    expect(layerData.destRuntime.state.name).to.eq("Run");
    expect(layerData.destRuntime.playedTime).to.eq(0);
    const anyToIdleTransition = stateMachine.addAnyStateTransition(idleState.def);
    anyToIdleTransition.hasExitTime = false;
    anyToIdleTransition.duration = 0.2;
    anyToIdleTransition.addCondition("triggerIdle", AnimatorConditionMode.If, true);
    animator.setParameterValue("triggerIdle", true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);
    expect(layerData.srcRuntime.state.name).to.eq("Run");
    expect(layerData.srcRuntime.playedTime).to.eq(0.1);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(idleState.def.clip.length * 0.2 - 0.1);
    expect(layerData.srcRuntime.state.name).to.eq("Survey");
    expect(layerData.srcRuntime.clipTime).to.eq(idleState.def.clip.length * 0.2);
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
    const walkState = animator.findAnimatorState("Walk");
    walkState.def.clearTransitions();
    const runState = animator.findAnimatorState("Run");
    runState.def.clipStartTime = 0;
    runState.def.clearTransitions();
    const walkToRunTransition = walkState.def.addTransition(runState.def);
    walkToRunTransition.hasExitTime = false;
    walkToRunTransition.duration = 0.1;
    walkToRunTransition.addCondition("triggerRun", AnimatorConditionMode.If, true);

    const runToWalkTransition = runState.def.addTransition(walkState.def);
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
    expect(layerData.srcRuntime.state.name).to.eq("Walk");
    expect(layerData.srcRuntime.playedTime).to.eq(0.1);
    expect(layerData.destRuntime.state.name).to.eq("Run");
    expect(layerData.destRuntime.playedTime).to.eq(0.1);
    expect(animator.getParameterValue("triggerRun")).to.eq(false);
    expect(animator.getParameterValue("triggerWalk")).to.eq(true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(runState.def.clip.length * 0.1 - 0.1);
    expect(layerData.srcRuntime.state.name).to.eq("Run");
    expect(layerData.srcRuntime.playedTime).to.eq(runState.def.clip.length * 0.1);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(runState.def.clip.length * 0.6);
    expect(layerData.destRuntime.state.name).to.eq("Walk");
    expect(layerData.destRuntime.playedTime).to.eq(0);
    expect(animator.getParameterValue("triggerWalk")).to.eq(false);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.def.clip.length * 0.3);
    expect(layerData.srcRuntime.state.name).to.eq("Walk");
    expect(layerData.srcRuntime.playedTime).to.eq(walkState.def.clip.length * 0.3);
  });

  it("fixedDuration", () => {
    const { animatorController } = animator;
    animatorController.addTriggerParameter("triggerRun");
    animatorController.addTriggerParameter("triggerWalk");
    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    const walkState = animator.findAnimatorState("Walk");
    walkState.def.clearTransitions();
    const runState = animator.findAnimatorState("Run");
    runState.def.clipStartTime = runState.def.clipEndTime = 0;
    runState.def.clearTransitions();
    const walkToRunTransition = walkState.def.addTransition(runState.def);
    walkToRunTransition.hasExitTime = false;
    walkToRunTransition.isFixedDuration = true;
    walkToRunTransition.duration = 0.1;
    walkToRunTransition.addCondition("triggerRun", AnimatorConditionMode.If, true);
    animator.play("Walk");
    animator.activateTriggerParameter("triggerRun");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);
    expect(layerData.srcRuntime.state.name).to.eq("Run");
    expect(layerData.srcRuntime.playedTime).to.eq(0.1);
    expect(layerData.srcRuntime.clipTime).to.eq(0);
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
    expect(animatorLayerData[0]?.srcRuntime.state.name).to.eq("state1");

    transition2.mute = false;
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.3);
    expect(animatorLayerData[0]?.srcRuntime.state.name).to.eq("state2");
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

  it("anyState transition interrupts crossFade", () => {
    const { animatorController } = animator;
    animatorController.addParameter("interrupt", false);
    const stateMachine = animatorController.layers[0].stateMachine;
    const idleState = animator.findAnimatorState("Survey");

    // AnyState -> Idle (can interrupt)
    const anyToIdle = stateMachine.addAnyStateTransition(idleState.def);
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
    expect(layerData.destRuntime.state.name).to.eq("Run");

    // Trigger interrupt during crossFade
    animator.setParameterValue("interrupt", true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // Should have interrupted to Idle
    expect(layerData.destRuntime.state.name).to.eq("Survey");
  });

  it("noExitTime transition scan should ignore exitTime transitions", () => {
    const { animatorController } = animator;
    animatorController.addParameter("goRun", true);
    animatorController.addParameter("never", false);

    const walkState = animator.findAnimatorState("Walk");
    const runState = animator.findAnimatorState("Run");
    const idleState = animator.findAnimatorState("Survey");

    walkState.def.clipStartTime = 0;
    walkState.def.clipEndTime = 1;
    walkState.def.clearTransitions();

    // A noExitTime transition that fails (ensures noExitTimeCount > 0).
    const noExitFailTransition = walkState.def.addTransition(idleState.def);
    noExitFailTransition.hasExitTime = false;
    noExitFailTransition.duration = 0;
    noExitFailTransition.addCondition("never", AnimatorConditionMode.If, true);

    // A hasExitTime transition whose conditions are true, but should not fire until exitTime.
    const exitTimeTransition = new AnimatorStateTransition();
    exitTimeTransition.exitTime = 0.5;
    exitTimeTransition.duration = 0;
    exitTimeTransition.destinationState = runState.def;
    exitTimeTransition.addCondition("goRun", AnimatorConditionMode.If, true);
    walkState.def.addTransition(exitTimeTransition);

    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);
    animator.play("Walk");

    // Update before exitTime, should still be in Walk and not start transitioning to Run.
    const preExitDeltaTime = walkState.def.clip.length * 0.25;
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(preExitDeltaTime);
    expect(layerData.srcRuntime.state.name).to.eq("Walk");
    expect(layerData.destRuntime).to.be.null;

    // Update past exitTime, should transition to Run.
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.def.clip.length * 0.5);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Run");
  });

  it("anyState transition interrupts FixedCrossFading", () => {
    const { animatorController } = animator;
    animatorController.addParameter("interrupt", false);
    const stateMachine = animatorController.layers[0].stateMachine;
    const idleState = animator.findAnimatorState("Survey");
    const walkState = animator.findAnimatorState("Walk");

    // AnyState -> Idle (can interrupt)
    const anyToIdle = stateMachine.addAnyStateTransition(idleState.def);
    anyToIdle.hasExitTime = false;
    anyToIdle.duration = 0.2;
    anyToIdle.addCondition("interrupt", AnimatorConditionMode.If, true);

    // Play Walk with Once mode, let it finish to reach Finished state
    walkState.def.wrapMode = WrapMode.Once;
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(walkState.def.clip.length + 0.1);

    // @ts-ignore
    const layerData = animator._getAnimatorLayerData(0);

    expect(layerData.layerState).to.eq(LayerState.Finished);

    // CrossFade from Finished state → FixedCrossFading
    animator.crossFade("Run", 1.0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    expect(layerData.layerState).to.eq(LayerState.FixedCrossFading);
    expect(layerData.destRuntime.state.name).to.eq("Run");

    // Trigger interrupt during FixedCrossFading
    animator.setParameterValue("interrupt", true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // Should have interrupted to Idle
    expect(layerData.destRuntime.state.name).to.eq("Survey");
  });

  it("anyState interrupt should skip transition to same destination state", () => {
    const { animatorController } = animator;
    animatorController.addParameter("alwaysTrue", true);
    const stateMachine = animatorController.layers[0].stateMachine;
    const runState = animator.findAnimatorState("Run");

    // AnyState -> Run (always true, noExitTime)
    const anyToRun = stateMachine.addAnyStateTransition(runState.def);
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
    expect(layerData.destRuntime.state.name).to.eq("Run");

    // Update again - anyState -> Run should be skipped because dest is already Run
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // Should still be CrossFading to Run (not interrupted/reset)
    expect(layerData.layerState).to.eq(LayerState.CrossFading);
    expect(layerData.destRuntime.state.name).to.eq("Run");
  });

  it("zero-duration crossFade should not be interrupted by anyState transition", () => {
    const { animatorController } = animator;
    animatorController.addParameter("interrupt", true);
    const stateMachine = animatorController.layers[0].stateMachine;
    const idleState = animator.findAnimatorState("Survey");

    // AnyState -> Idle (always true, noExitTime)
    const anyToIdle = stateMachine.addAnyStateTransition(idleState.def);
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
    expect(layerData.srcRuntime.state.name).to.eq("Run");
  });

  it("toggle hasExitTime should maintain correct noExitTimeCount", () => {
    const walkState = animator.findAnimatorState("Walk");
    const runState = animator.findAnimatorState("Run");
    const idleState = animator.findAnimatorState("Survey");
    walkState.def.clearTransitions();

    // Add a noExitTime transition
    const t1 = walkState.def.addTransition(runState.def);
    t1.hasExitTime = false;

    // Add a hasExitTime transition
    const t2 = walkState.def.addTransition(idleState.def);
    t2.hasExitTime = true;
    t2.exitTime = 0.5;

    // @ts-ignore
    const collection = walkState.def._transitionCollection;
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

  it("findAnimatorState lazy-creates handle for unplayed state", () => {
    // Clone yields a fresh animator with no PlayData populated
    const cloneEntity = animator.entity.clone();
    const cloneAnimator = cloneEntity.getComponent(Animator);

    const survey = cloneAnimator.findAnimatorState("Survey");
    expect(survey).to.not.eq(null);
    expect(survey.name).to.eq("Survey");
    expect(survey.speed).to.eq(survey.def.speed); // live-bound default

    // Same handle returned on subsequent calls (verifies caching)
    expect(cloneAnimator.findAnimatorState("Survey")).to.eq(survey);
  });

  it("per-instance speed set before play applies on first play", () => {
    const handle = animator.findAnimatorState("Survey");
    handle.speed = 0.5;
    animator.play("Survey");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);

    // Same handle observed via getCurrentAnimatorState
    expect(animator.getCurrentAnimatorState(0)).to.eq(handle);
    expect(handle.speed).to.eq(0.5);
  });

  it("per-instance speed survives crossFade out and back", () => {
    animator.findAnimatorState("Survey").speed = 0.5;
    animator.play("Survey");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);

    // crossFade out (fixed 0.05s duration)
    animator.crossFadeInFixedDuration("Walk", 0.05, 0, 0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1); // complete crossfade
    // crossFade back
    animator.crossFadeInFixedDuration("Survey", 0.05, 0, 0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // @ts-ignore
    const srcRuntime = animator._animatorLayersData[0].srcRuntime;
    expect(srcRuntime.state.name).to.eq("Survey"); // ensure crossfade actually completed back to Survey
    expect(animator.findAnimatorState("Survey").speed).to.eq(0.5);
    expect(srcRuntime.speed).to.eq(0.5);
  });

  it("per-instance speed is per-Animator (clone isolation)", () => {
    const cloneEntity = animator.entity.clone();
    const cloneAnimator = cloneEntity.getComponent(Animator);
    expect(cloneAnimator.animatorController).to.eq(animator.animatorController);

    animator.findAnimatorState("Survey").speed = 0.5;

    expect(animator.findAnimatorState("Survey").speed).to.eq(0.5);
    expect(cloneAnimator.findAnimatorState("Survey").speed).to.eq(1); // shared default
    // shared asset not mutated
    const sharedSurvey = animator.animatorController.layers[0].stateMachine.findStateByName("Survey");
    expect(sharedSurvey.speed).to.eq(1);
  });

  it("crossFade phase uses runtime.speed for time progression", () => {
    // Set high per-instance speed on src state
    animator.findAnimatorState("Survey").speed = 4;
    animator.play("Survey");
    // @ts-ignore — Animator.update short-circuits to dt=0 if _playFrameCount===frameCount
    animator.engine.time._frameCount++;
    animator.update(0.001);

    // @ts-ignore
    const layerData = animator._animatorLayersData[0];
    const srcPlayedBefore = layerData.srcRuntime.playedTime;

    // Start crossFade — during crossFade, src should still advance per runtime.speed=4
    animator.crossFade("Walk", 0.5, 0, 0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.05); // 50ms of crossfade

    const srcPlayedAfter = layerData.srcRuntime.playedTime;
    const advanced = srcPlayedAfter - srcPlayedBefore;
    // With runtime.speed=4 and dt=0.05, expect ~0.2 (4 * 0.05). With state.speed=1 it'd be ~0.05.
    expect(advanced).to.be.closeTo(0.2, 0.05);
  });

  it("findAnimatorState rebuilds handle when state identity changes (remove/re-add same name)", () => {
    const sm = animator.animatorController.layers[0].stateMachine;
    const oldSurvey = animator.findAnimatorState("Survey");
    expect(oldSurvey).not.to.eq(null);
    const oldStateRef = oldSurvey.def;
    const originalIndex = sm.states.indexOf(oldStateRef);

    // Simulate dynamic controller mutation: remove and re-add same-name state
    sm.removeState(oldStateRef);
    const newStateRef = sm.addState("Survey");
    expect(newStateRef).not.to.eq(oldStateRef);

    const newHandle = animator.findAnimatorState("Survey");
    expect(newHandle).not.to.eq(null);
    expect(newHandle.def).to.eq(newStateRef);
    expect(newHandle).not.to.eq(oldSurvey);

    // Restore original Survey state so subsequent tests still see the
    // clip-bound state. Drop the barebones replacement and reinsert the
    // original at its previous index in the states list/map.
    sm.removeState(newStateRef);
    sm.states.splice(originalIndex, 0, oldStateRef);
    // @ts-ignore — _statesMap is private but rebuild requires direct access
    sm._statesMap["Survey"] = oldStateRef;
    // Reset cached layer data so the next findAnimatorState rebuilds against
    // the restored state.
    // @ts-ignore
    animator._reset();
  });

  it("rebuilds curve owners and event handlers when state identity changes via remove/re-add", () => {
    const localEntity = new Entity(engine);
    const localAnimator = localEntity.addComponent(Animator);
    const controller = new AnimatorController(engine);
    const layer = new AnimatorControllerLayer("layer");
    controller.addLayer(layer);

    // Old state binds rotation.x: 0 → 90 over 1s
    const oldState = layer.stateMachine.addState("X");
    const oldClip = new AnimationClip("oldClip");
    const rotationCurve = new AnimationFloatCurve();
    const rk1 = new Keyframe<number>();
    rk1.time = 0;
    rk1.value = 0;
    const rk2 = new Keyframe<number>();
    rk2.time = 1;
    rk2.value = 90;
    rotationCurve.addKey(rk1);
    rotationCurve.addKey(rk2);
    oldClip.addCurveBinding("", Transform, "rotation.x", rotationCurve);
    oldState.clip = oldClip;
    oldState.wrapMode = WrapMode.Loop;

    localAnimator.animatorController = controller;
    localAnimator.play("X");
    // @ts-ignore
    localAnimator.engine.time._frameCount++;
    localAnimator.update(0.5);

    // First play populates stateData cache keyed by name "X" pointing at oldState's owners.
    expect(localEntity.transform.rotation.x).to.be.closeTo(45, 1);

    // Remove + re-add same-name state with a clip targeting a *different* property.
    layer.stateMachine.removeState(oldState);
    const newState = layer.stateMachine.addState("X");
    const newClip = new AnimationClip("newClip");
    const positionCurve = new AnimationFloatCurve();
    const pk1 = new Keyframe<number>();
    pk1.time = 0;
    pk1.value = 0;
    const pk2 = new Keyframe<number>();
    pk2.time = 1;
    pk2.value = 5;
    positionCurve.addKey(pk1);
    positionCurve.addKey(pk2);
    newClip.addCurveBinding("", Transform, "position.x", positionCurve);
    newState.clip = newClip;
    newState.wrapMode = WrapMode.Loop;

    // Reset transform so any stale binding shows up as a wrong-property mutation.
    localEntity.transform.position = new Vector3(0, 0, 0);
    localEntity.transform.rotation = new Vector3(0, 0, 0);

    // @ts-ignore — internal layer data, verify cached state BEFORE second play to confirm stale.
    const layerDataBeforeSecondPlay = localAnimator._animatorLayersData[0];
    const stateDataBefore = layerDataBeforeSecondPlay.animatorStateDataMap["X"];
    expect(stateDataBefore, "stateData should exist after first play").to.not.eq(undefined);
    expect(stateDataBefore.state, "first-play stateData.state must be oldState").to.eq(oldState);

    localAnimator.play("X");

    // @ts-ignore — internal layer data
    const layerData = localAnimator._animatorLayersData[0];
    const stateData = layerData.animatorStateDataMap["X"];
    // stateData must rebuild against newState identity, not stay aliased to oldState.
    expect(stateData.state, "second-play stateData.state must be newState").to.eq(newState);
    // The cached curveLayerOwner must point at position.x owner now, not the stale rotation.x owner.
    const firstOwnerProp = (stateData.curveLayerOwner[0] as any)?.curveOwner?.property;
    expect(firstOwnerProp).to.eq("position.x");

    // @ts-ignore
    localAnimator.engine.time._frameCount++;
    localAnimator.update(0.5);

    // After rebuild: position.x ≈ 2.5, rotation.x stays at 0.
    // Without rebuild (stale stateData): curveLayerOwner[0] still points at rotation.x owner,
    // so position curve value would be applied to rotation.x and position.x would never change.
    expect(localEntity.transform.position.x).to.be.closeTo(2.5, 0.5);
    expect(localEntity.transform.rotation.x).to.eq(0);

    localEntity.destroy();
  });

  it("findAnimatorState resets stale layer data after controller mutation", () => {
    // Ensure layerData[0] is populated
    const handle1 = animator.findAnimatorState("Survey");
    expect(handle1).not.to.eq(null);

    // Mutate the controller — this dispatches the update flag
    const controller = animator.animatorController;
    const dummyLayer = new AnimatorControllerLayer("__dummy__");
    controller.addLayer(dummyLayer);

    // findAnimatorState should reset stale layerData and rebuild
    const handle2 = animator.findAnimatorState("Survey");
    expect(handle2).not.to.eq(null);
    expect(handle2).not.to.eq(handle1); // fresh handle after reset

    // Cleanup
    controller.removeLayer(controller.layers.indexOf(dummyLayer));
  });

  it("destroy detaches stateData clipChangedListeners from surviving AnimatorState", () => {
    // Build a controller whose AnimatorState we can keep alive after the animator is destroyed.
    const controller = new AnimatorController(engine);
    const layer = new AnimatorControllerLayer("layer");
    controller.addLayer(layer);
    const sharedState = layer.stateMachine.addState("Y");
    const clip = new AnimationClip("yClip");
    const curve = new AnimationFloatCurve();
    const k1 = new Keyframe<number>();
    k1.time = 0;
    k1.value = 0;
    const k2 = new Keyframe<number>();
    k2.time = 1;
    k2.value = 90;
    curve.addKey(k1);
    curve.addKey(k2);
    clip.addCurveBinding("", Transform, "rotation.x", curve);
    sharedState.clip = clip;

    // @ts-ignore — inspect listener attachment on the shared state directly.
    const listenersBefore = sharedState._updateFlagManager._listeners.length;

    const localEntity = new Entity(engine);
    const localAnimator = localEntity.addComponent(Animator);
    localAnimator.animatorController = controller;
    localAnimator.play("Y");
    // @ts-ignore
    expect(sharedState._updateFlagManager._listeners.length).to.eq(listenersBefore + 1);

    // Destroying only the Animator (controller + state still alive) must
    // detach the clipChangedListener it installed; otherwise the closure
    // keeps a destroyed entity reachable through state.clip.dispatch().
    localAnimator.destroy();
    localEntity.destroy();

    // @ts-ignore
    expect(sharedState._updateFlagManager._listeners.length).to.eq(listenersBefore);
  });

  it("_reset detaches stateData clipChangedListeners so they do not accumulate on the AnimatorState", () => {
    const survey = animator.findAnimatorState("Survey");
    expect(survey).not.to.eq(null);
    const surveyState = survey.def;
    // @ts-ignore — read internal listener list size
    const listenersBefore = surveyState._updateFlagManager._listeners.length;

    // First play: registers one clipChangedListener for Survey on this layer.
    animator.play("Survey");
    // @ts-ignore
    const listenersAfterFirstPlay = surveyState._updateFlagManager._listeners.length;
    expect(listenersAfterFirstPlay).to.eq(listenersBefore + 1);

    // Three controller mutations → three _reset() calls → without cleanup
    // each reset would leave its prior listener attached and the next play
    // would register a fresh one on top of it.
    for (let i = 0; i < 3; i++) {
      const dummy = new AnimatorControllerLayer(`__dummy_${i}__`);
      animator.animatorController.addLayer(dummy);
      animator.play("Survey");
      // @ts-ignore
      const count = surveyState._updateFlagManager._listeners.length;
      expect(count, `listener count after iteration ${i + 1}`).to.eq(listenersBefore + 1);
      animator.animatorController.removeLayer(animator.animatorController.layers.indexOf(dummy));
    }
  });

  it("crossFade to current state is no-op (avoids src/dest PlayData alias)", () => {
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // @ts-ignore
    const layerData = animator._animatorLayersData[0];
    const srcBefore = layerData.srcRuntime;
    const playedBefore = srcBefore.playedTime;

    // crossFade to the same state — should be ignored
    animator.crossFade("Walk", 0.3, 0, 0);

    expect(layerData.srcRuntime).to.eq(srcBefore);
    expect(layerData.srcRuntime.playedTime).to.eq(playedBefore);
    expect(layerData.destRuntime).to.eq(null);
  });

  it("crossFade to currently-fading dest state is no-op", () => {
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    animator.crossFade("Run", 0.5, 0, 0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.05);

    // @ts-ignore
    const layerData = animator._animatorLayersData[0];
    const destBefore = layerData.destRuntime;
    const destPlayedBefore = destBefore.playedTime;

    // crossFade to the in-flight dest state — should be ignored
    animator.crossFade("Run", 0.3, 0, 0);

    expect(layerData.destRuntime).to.eq(destBefore);
    expect(layerData.destRuntime.playedTime).to.eq(destPlayedBefore);
  });

  it("state-machine self-transition is also a no-op (alias-guard policy)", () => {
    const walk = animator.findAnimatorState("Walk");
    walk.def.clearTransitions();
    animator.animatorController.addParameter("restart", false);

    const selfTransition = walk.def.addTransition(walk.def);
    selfTransition.hasExitTime = false;
    selfTransition.duration = 0.1;
    selfTransition.addCondition("restart", AnimatorConditionMode.If, true);

    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.05);

    // @ts-ignore
    const layerData = animator._animatorLayersData[0];
    const srcBefore = layerData.srcRuntime;
    const playedBefore = srcBefore.playedTime;

    // Trigger the self-transition
    animator.setParameterValue("restart", true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.05);

    // Self-transition is intentionally a no-op (one persistent PlayData per state).
    // src should keep advancing as if no transition happened, dest stays null.
    expect(layerData.srcRuntime).to.eq(srcBefore);
    expect(layerData.srcRuntime.state.name).to.eq("Walk");
    expect(layerData.srcRuntime.playedTime).to.be.greaterThan(playedBefore);
    expect(layerData.destRuntime).to.eq(null);
  });

  it("play during crossFade clears stale destRuntime", () => {
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    animator.crossFade("Run", 0.5, 0, 0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.05);

    // Interrupt the in-flight crossFade with a play()
    animator.play("Survey");

    // @ts-ignore
    const layerData = animator._animatorLayersData[0];
    expect(layerData.destRuntime).to.eq(null);
    expect(layerData.crossFadeTransition).to.eq(null);

    // A subsequent crossFade to the previously-fading state should now succeed —
    // the stale dest slot must not block it via the alias guard.
    animator.crossFade("Run", 0.3, 0, 0);
    expect(layerData.destRuntime?.state.name).to.eq("Run");
  });

  it("crossFade to nonexistent state is a safe no-op", () => {
    animator.play("Walk");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    const before = animator.getCurrentAnimatorState(0);
    animator.crossFade("MissingState", 0.3, 0, 0);
    const after = animator.getCurrentAnimatorState(0);

    expect(after).to.eq(before);
    // @ts-ignore — verify no junk layerData was written at array index -1.
    expect(animator._animatorLayersData[-1]).to.eq(undefined);
  });

  it("findAnimatorState with out-of-range layerIndex returns null", () => {
    expect(animator.findAnimatorState("Survey", 99)).to.eq(null);
    expect(animator.findAnimatorState("Survey", -2)).to.eq(null);
  });

  it("play / crossFade with out-of-range layerIndex are safe no-ops", () => {
    animator.play("Survey");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);

    const stateBefore = animator.getCurrentAnimatorState(0);

    expect(() => animator.play("Walk", 99)).not.to.throw();
    expect(() => animator.crossFade("Run", 0.3, 99, 0)).not.to.throw();

    expect(animator.getCurrentAnimatorState(0)).to.eq(stateBefore);
    // @ts-ignore — verify no junk layerData created at index -1 / 99
    expect(animator._animatorLayersData[-1]).to.eq(undefined);
    // @ts-ignore
    expect(animator._animatorLayersData[99]).to.eq(undefined);
  });

  it("transition out of a state with per-instance speed 0 does not produce NaN", () => {
    const survey = animator.findAnimatorState("Survey");
    survey.speed = 0; // pause this state per-instance
    animator.play("Survey");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // crossFade out — destination state should still progress despite src speed=0
    animator.crossFade("Walk", 0.3, 0, 0);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // @ts-ignore
    const layerData = animator._animatorLayersData[0];
    expect(Number.isNaN(layerData.srcRuntime.playedTime)).to.eq(false);
    expect(Number.isNaN(layerData.destRuntime?.playedTime ?? 0)).to.eq(false);
    // Walk dest should have progressed
    expect(layerData.destRuntime?.playedTime).to.be.greaterThan(0);
  });

  it("no-exit transition out of speed=0 source preserves remaining deltaTime and avoids NaN", () => {
    const survey = animator.findAnimatorState("Survey");
    const walk = animator.findAnimatorState("Walk");
    survey.def.clearTransitions();
    walk.def.clearTransitions();
    animator.animatorController.addParameter("goWalk", false);

    survey.speed = 0; // pause source per-instance

    const transition = survey.def.addTransition(walk.def);
    transition.hasExitTime = false;
    transition.duration = 0.3;
    transition.addCondition("goWalk", AnimatorConditionMode.If, true);

    animator.play("Survey");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.05);

    animator.setParameterValue("goWalk", true);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.1);

    // @ts-ignore
    const layerData = animator._animatorLayersData[0];
    expect(Number.isNaN(layerData.srcRuntime.playedTime)).to.eq(false);
    expect(Number.isNaN(layerData.destRuntime?.playedTime ?? 0)).to.eq(false);
    expect(layerData.destRuntime?.state.name).to.eq("Walk");
    // dest should have advanced from the remaining deltaTime that was
    // preserved by the playSpeed===0 guard
    expect(layerData.destRuntime?.playedTime).to.be.greaterThan(0);
  });
});
