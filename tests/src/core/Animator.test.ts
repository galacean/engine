import {
  AnimationClip,
  AnimationEvent,
  AnimationFloatCurve,
  Animator,
  AnimatorConditionMode,
  AnimatorControllerLayer,
  AnimatorLayerBlendingMode,
  AnimatorLayerMask,
  AnimatorStateMachine,
  AnimatorStateTransition,
  Camera,
  Keyframe,
  Script,
  Transform,
  AnimatorController,
  WrapMode,
  StateMachineScript,
  AnimatorState
} from "@galacean/engine-core";
import { GLTFResource } from "@galacean/engine-loader";
import { Quaternion } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import chai, { expect } from "chai";
import spies from "chai-spies";
import { glbResource } from "./model/fox";

chai.use(spies);

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Animator test", function () {
  let animator: Animator;
  let resource: GLTFResource;
  let engine: WebGLEngine;

  before(async function () {
    engine = await WebGLEngine.create({ canvas: canvasDOM });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();
    rootEntity.addComponent(Camera);

    resource = await engine.resourceManager.load<GLTFResource>(glbResource);
    const defaultSceneRoot = resource.defaultSceneRoot;
    rootEntity.addChild(defaultSceneRoot);
    animator = defaultSceneRoot.getComponent(Animator);
  });

  after(function () {
    animator.destroy();
    engine.destroy();
  });

  afterEach(function () {
    animator.speed = 1;
    // @ts-ignore
    animator._reset();
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
    let lastFrameTime = srcPlayData.frameTime;
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(5);
    expect(animator.speed).to.eq(expectedSpeed);
    expect(srcPlayData.frameTime).to.eq(lastFrameTime + 5 * expectedSpeed);
    expectedSpeed = speed * 2;
    animator.speed = expectedSpeed;
    lastFrameTime = srcPlayData.frameTime;
    animator.update(10);
    expect(animator.speed).to.eq(expectedSpeed);
    expect(srcPlayData.frameTime).to.eq(lastFrameTime + 10 * expectedSpeed);
    expectedSpeed = speed * 0;
    animator.speed = expectedSpeed;
    lastFrameTime = srcPlayData.frameTime;
    animator.update(15);
    expect(animator.speed).to.eq(expectedSpeed);
    expect(srcPlayData.frameTime).to.eq(lastFrameTime + 15 * expectedSpeed);
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
    const onDisableSpy = chai.spy.on(animator, "_onDisable");
    const onEnableSpy = chai.spy.on(animator, "_onEnable");
    const onUpdateSpy = chai.spy.on(animator, "update");

    animator.enabled = false;
    expect(animator["_enabled"]).to.eq(false);
    expect(onDisableSpy).to.have.been.called.exactly(1);
    engine.update();
    expect(onUpdateSpy).to.have.been.called.exactly(0);

    animator.enabled = true;
    expect(animator["_enabled"]).to.eq(true);
    expect(onEnableSpy).to.have.been.called.exactly(1);
    engine.update();
    expect(onUpdateSpy).to.have.been.called.exactly(1);
  });

  it("find animator state", () => {
    const stateName = "Survey";
    const expectedStateName = "Run";
    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;

    animator.play(stateName);
    const currentAnimatorState = animator.getCurrentAnimatorState(layerIndex);
    let animatorState = animator.findAnimatorState(stateName, layerIndex);
    expect(animatorState).to.eq(currentAnimatorState);

    animator.play(expectedStateName);
    animatorState = animator.findAnimatorState(expectedStateName, layerIndex);
    expect(animatorState).not.to.eq(currentAnimatorState);
    expect(animatorState.name).to.eq(expectedStateName);
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

  it("animation cross fade by transition", () => {
    const walkState = animator.findAnimatorState("Walk");
    const runState = animator.findAnimatorState("Run");
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
    mask.setPathMaskActive("_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/b_Neck_04", false, true);
    additiveLayer.mask = mask;
    additiveLayer.blendingMode = AnimatorLayerBlendingMode.Additive;
    animatorController.addLayer(additiveLayer);
    const clip = animator.findAnimatorState("Run").clip;
    const newState = animatorStateMachine.addState("Run");
    newState.clipStartTime = 1;
    newState.clip = clip;

    animator.play("Walk", 0);
    animator.play("Run", 1);

    const parentEntity = animator.entity.findByPath("_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/");
    const targetEntity = animator.entity.findByPath(
      "_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/b_Neck_04"
    );
    const childEntity = animator.entity.findByPath(
      "_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/b_Neck_04/b_Head_05"
    );

    let layerData = animator["_animatorLayersData"][1];
    const layerCurveOwner = layerData.curveOwnerPool[targetEntity.transform.instanceId]["rotationQuaternion"];
    const parentLayerCurveOwner = layerData.curveOwnerPool[parentEntity.transform.instanceId]["rotationQuaternion"];

    let childLayerCurveOwner = layerData.curveOwnerPool[childEntity.transform.instanceId]["rotationQuaternion"];

    expect(layerCurveOwner.isActive).to.eq(false);
    expect(parentLayerCurveOwner.isActive).to.eq(true);
    expect(childLayerCurveOwner.isActive).to.eq(false);

    animator.animatorController.removeLayer(1);
    mask.removePathMask("_rootJoint/b_Root_00/b_Hip_01/b_Spine01_02/b_Spine02_03/b_Neck_04/b_Head_05");
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
    TestScript.prototype.event0 = chai.spy(TestScript.prototype.event0);

    animator.entity.addComponent(TestScript);

    const event0 = new AnimationEvent();
    event0.functionName = "event0";
    event0.time = 0;

    const state = animator.findAnimatorState("Walk");
    state.clip.addEvent(event0);
    animator.update(10);
    expect(TestScript.prototype.event0).to.have.been.called.exactly(1);
  });

  it("stateMachine", () => {
    animator.animatorController.addParameter("playerSpeed", 1);
    const stateMachine = animator.animatorController.layers[0].stateMachine;
    const idleState = animator.findAnimatorState("Survey");
    idleState.clearTransitions();
    const walkState = animator.findAnimatorState("Walk");
    walkState.clearTransitions();
    const runState = animator.findAnimatorState("Run");
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
    toWalkTransition.addCondition(AnimatorConditionMode.Greater, "playerSpeed", 0);
    idleState.addTransition(toWalkTransition);
    idleToWalkTime =
      //@ts-ignore
      toWalkTransition.exitTime * idleState._getDuration() + toWalkTransition.duration * walkState._getDuration();

    const exitTransition = idleState.addExitTransition();
    exitTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
    // to walk state
    const toRunTransition = new AnimatorStateTransition();
    toRunTransition.destinationState = runState;
    toRunTransition.duration = 0.3;
    toRunTransition.exitTime = 0.9;
    toRunTransition.addCondition(AnimatorConditionMode.Greater, "playerSpeed", 0.5);
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
    toIdleTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
    walkState.addTransition(toIdleTransition);
    walkToIdleTime =
      //@ts-ignore
      (toIdleTransition.exitTime - toRunTransition.duration) * walkState._getDuration() +
      //@ts-ignore
      toIdleTransition.duration * idleState._getDuration();

    // to run state
    const runToWalkTransition = new AnimatorStateTransition();
    runToWalkTransition.destinationState = walkState;
    runToWalkTransition.duration = 0.3;
    runToWalkTransition.exitTime = 0.9;
    runToWalkTransition.addCondition(AnimatorConditionMode.Less, "playerSpeed", 0.5);
    runState.addTransition(runToWalkTransition);
    runToWalkTime =
      //@ts-ignore
      (runToWalkTransition.exitTime - toRunTransition.duration) * runState._getDuration() +
      //@ts-ignore
      runToWalkTransition.duration * walkState._getDuration();

    stateMachine.addEntryStateTransition(idleState);

    const anyTransition = stateMachine.addAnyStateTransition(idleState);
    anyTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
    anyTransition.duration = 0.3;
    anyTransition.exitTime = 0.9;
    let anyToIdleTime =
      // @ts-ignore
      (anyTransition.exitTime - toIdleTransition.duration) * walkState._getDuration() +
      // @ts-ignore
      anyTransition.duration * idleState._getDuration();

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

    animator.animatorController.setParameterValue("playerSpeed", 0.4);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(runToWalkTime - 0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Run");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");

    animator.animatorController.setParameterValue("playerSpeed", 0);
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
    //@ts-ignore
    stateMachine._entryTransitions.length = 0;
    //@ts-ignore
    stateMachine._anyStateTransitions.length = 0;

    const idleState = animator.findAnimatorState("Survey");
    idleState.clearTransitions();
    const walkState = animator.findAnimatorState("Walk");
    walkState.clearTransitions();
    const runState = animator.findAnimatorState("Run");
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
    toWalkTransition.addCondition(AnimatorConditionMode.Greater, "playerSpeed", 0);
    idleState.addTransition(toWalkTransition);
    idleToWalkTime =
      //@ts-ignore
      (1 - toWalkTransition.exitTime) * idleState._getDuration() + toWalkTransition.duration * walkState._getDuration();

    const exitTransition = idleState.addExitTransition();
    exitTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
    // to walk state
    const toRunTransition = new AnimatorStateTransition();
    toRunTransition.destinationState = runState;
    toRunTransition.duration = 0.3;
    toRunTransition.exitTime = 0.1;
    toRunTransition.addCondition(AnimatorConditionMode.Greater, "playerSpeed", 0.5);
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
    toIdleTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
    walkState.addTransition(toIdleTransition);
    walkToIdleTime =
      //@ts-ignore
      (1 - toIdleTransition.exitTime - toRunTransition.duration) * walkState._getDuration() +
      //@ts-ignore
      toIdleTransition.duration * idleState._getDuration();

    // to run state
    const runToWalkTransition = new AnimatorStateTransition();
    runToWalkTransition.destinationState = walkState;
    runToWalkTransition.duration = 0.3;
    runToWalkTransition.exitTime = 0.1;
    runToWalkTransition.addCondition(AnimatorConditionMode.Less, "playerSpeed", 0.5);
    runState.addTransition(runToWalkTransition);
    runToWalkTime =
      //@ts-ignore
      (1 - runToWalkTransition.exitTime - toRunTransition.duration) * runState._getDuration() +
      //@ts-ignore
      runToWalkTransition.duration * walkState._getDuration();

    stateMachine.addEntryStateTransition(idleState);

    const anyTransition = stateMachine.addAnyStateTransition(idleState);
    anyTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
    anyTransition.duration = 0.3;
    anyTransition.exitTime = 0.1;
    let anyToIdleTime =
      // @ts-ignore
      (1 - anyTransition.exitTime - toIdleTransition.duration) * walkState._getDuration() +
      // @ts-ignore
      anyTransition.duration * idleState._getDuration();

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

    animator.animatorController.setParameterValue("playerSpeed", 0.4);
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(runToWalkTime - 0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Run");
    // @ts-ignore
    animator.engine.time._frameCount++;
    animator.update(0.001);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");

    animator.animatorController.setParameterValue("playerSpeed", 0);
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

  it("change state in one update", () => {
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
    let updateRotation;
    let exitRotation;
    state1.addStateMachineScript(
      class extends StateMachineScript {
        onStateEnter(animator) {
          enterRotation = animator.entity.transform.rotation.x;
        }
        onStateUpdate(animator) {
          updateRotation = animator.entity.transform.rotation.x;
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
    expect(updateRotation).to.eq(90);
    expect(exitRotation).to.eq(90);
    expect(animator.entity.transform.rotation.x).to.eq(0);
    expect(animator.entity.transform.position.x).to.eq(5);
  });
});
