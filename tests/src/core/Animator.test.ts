import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Animator, Camera } from "@galacean/engine-core";
import { Quaternion } from "@galacean/engine-math";
import { GLTFResource } from "@galacean/engine-loader";
import chai, { expect } from "chai";
import spies from "chai-spies";
import { glbResource } from "./model";

chai.use(spies);

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Animator test", function () {
  let animator: Animator;
  let resource: GLTFResource;
  let engine: WebGLEngine;

  before(async () => {
    engine = await WebGLEngine.create({ canvas: canvasDOM });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();
    rootEntity.addComponent(Camera);

    resource = await engine.resourceManager.load<GLTFResource>(glbResource);
    const defaultSceneRoot = resource.defaultSceneRoot;
    rootEntity.addChild(defaultSceneRoot);
    animator = defaultSceneRoot.getComponent(Animator);

    engine.run();
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

    animator.play("Run");

    let animatorLayerData = animator["_animatorLayersData"];
    const srcPlayData = animatorLayerData[0]?.srcPlayData;

    animator.cullingMode = 1;
    expect(animator.cullingMode).to.eq(1);
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
    animator.update(1);

    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;
    const animatorLayerData = animator["_animatorLayersData"];
    const layerState = animatorLayerData[layerIndex].layerState;

    // current animator layerState should be CrossFading(2)
    expect(layerState).to.eq(2);
  });

  it("animation fix cross fade", () => {
    animator.play("Walk");
    animator.update(1);
    animator.crossFade("Survey", 5);
    animator.crossFade("Run", 0.5);
    animator.update(10);

    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;
    const animatorLayerData = animator["_animatorLayersData"];
    const layerState = animatorLayerData[layerIndex].layerState;

    // current animator layerState should be FixedCrossFading(3)
    expect(layerState).to.eq(3);
  });
});
