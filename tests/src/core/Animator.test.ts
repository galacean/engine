import {
  AnimationEvent,
  Animator,
  AnimatorConditionMode,
  AnimatorControllerLayer,
  AnimatorLayerBlendingMode,
  AnimatorLayerMask,
  AnimatorStateMachine,
  AnimatorStateTransition,
  Camera,
  Script
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
    animator.update(walkState.clip.length - 0.1);
    animator.update(0.1);

    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;
    const animatorLayerData = animator["_animatorLayersData"];
    const layerState = animatorLayerData[layerIndex].layerState;

    // current animator layerState should be CrossFading(2)
    expect(layerState).to.eq(2);
  });

  it("animation fix cross fade", () => {
    animator.play("Walk");
    animator.update(0.1);
    animator.crossFade("Survey", 5);
    animator.crossFade("Run", 0.5);
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

    {
      // handle idle state
      const toWalkTransition = new AnimatorStateTransition();
      toWalkTransition.destinationState = walkState;
      toWalkTransition.exitTime = 0.5;
      toWalkTransition.duration = 0.3;
      toWalkTransition.addCondition(AnimatorConditionMode.Greater, "playerSpeed", 0);
      idleState.addTransition(toWalkTransition);

      const exitTransition = idleState.addExitTransition();
      exitTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
    }
    {
      // handle walk state
      const toRunTransition = new AnimatorStateTransition();
      toRunTransition.destinationState = runState;
      toRunTransition.duration = 0.3;
      toRunTransition.addCondition(AnimatorConditionMode.Greater, "playerSpeed", 0.5);
      walkState.addTransition(toRunTransition);

      const toIdleTransition = new AnimatorStateTransition();
      toIdleTransition.destinationState = idleState;
      toIdleTransition.duration = 0.3;
      toIdleTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
      walkState.addTransition(toIdleTransition);
    }
    {
      // handle run state
      const toWalkTransition = new AnimatorStateTransition();
      toWalkTransition.destinationState = walkState;
      toWalkTransition.duration = 0.3;
      toWalkTransition.addCondition(AnimatorConditionMode.Less, "playerSpeed", 0.5);
      runState.addTransition(toWalkTransition);
    }

    stateMachine.addEntryStateTransition(idleState);

    const anyTransition = stateMachine.addAnyStateTransition(idleState);
    anyTransition.addCondition(AnimatorConditionMode.Equals, "playerSpeed", 0);
    anyTransition.duration = 0.3;

    animator.update(10);
    expect(animator.getCurrentAnimatorState(0).name).to.eq("Run");

    animator.animatorController.setParameterValue("playerSpeed", 0.4);
    animator.update(10);

    expect(animator.getCurrentAnimatorState(0).name).to.eq("Walk");

    animator.animatorController.setParameterValue("playerSpeed", 0);
    animator.update(10);

    expect(animator.getCurrentAnimatorState(0).name).to.eq("Survey");
  });
});
