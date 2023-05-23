import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Animator, Camera, ignoreClone } from "@galacean/engine-core";
import { expect } from "chai";
import { GLTFResource } from "@galacean/engine-loader";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Animator test", function () {
  let animator: Animator;
  let resource: GLTFResource;

  before(async () => {
    const engine = await WebGLEngine.create({ canvas: canvasDOM });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();
    rootEntity.addComponent(Camera);

    resource = await engine.resourceManager.load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb")
    const defaultSceneRoot = resource.defaultSceneRoot;
    rootEntity.addChild(defaultSceneRoot);
    animator = defaultSceneRoot.getComponent(Animator);

    engine.run();
  });

  it("constructor", () => {
    // Test default values
    expect(animator).not.to.be.undefined;
    expect(animator.cullingMode).to.eq(0);
    expect(animator.speed).to.eq(1);

    expect(animator["_awoken"]).to.eq(true);
    expect(animator["_enabled"]).to.eq(true);
    expect(animator["_onUpdateIndex"]).to.eq(0);
    expect(animator["_phasedActive"]).to.eq(true);

    // Test _tempAnimatorStateInfo default layerIndex values
    expect(animator["_tempAnimatorStateInfo"].layerIndex).to.eq(-1);
  });

  it("animator property value", () => {
    // Test animator cullingMode.
    const cullingMode = 0;
    const expectedCullingMode = 1;
    animator.cullingMode = expectedCullingMode;
    expect(animator.cullingMode).to.eq(expectedCullingMode);
    animator.cullingMode = cullingMode;
    expect(animator.cullingMode).to.eq(cullingMode);

    // Test animator speed.
    const speed = 1;
    let expectedSpeed = speed * 0.5;
    animator.speed = expectedSpeed;
    expect(animator.speed).to.eq(expectedSpeed);
    expectedSpeed = speed * 2;
    animator.speed = expectedSpeed;
    expect(animator.speed).to.eq(expectedSpeed);
    expectedSpeed = speed * 0;
    animator.speed = expectedSpeed;
    expect(animator.speed).to.eq(expectedSpeed);
    animator.speed = speed;
  });

  it("play animation", () => {
    // Test animator play.
    const layerIndex = 0;
    const normalizedTimeOffset = 0.5;
    //animator.crossFade('headShake',1);
    animator.play('run');
    expect(animator["_tempAnimatorStateInfo"].layerIndex).to.eq(layerIndex);

    let animatorState = animator.getCurrentAnimatorState(layerIndex);
    expect(animatorState.name).to.eq('run');
    expect(animatorState.speed).to.eq(1);
    expect(animatorState.wrapMode).to.eq(1);

    // Test animator change play state.
    animator.play('walk',layerIndex,normalizedTimeOffset);
    animatorState = animator.getCurrentAnimatorState(layerIndex);
    expect(animatorState.name).to.eq('walk');
  });

  it("animation enabled", () => {
    // Test animator play.
    animator.play('idle');

    animator.enabled = false;
    expect(animator["_enabled"]).to.eq(false);
    animator.enabled = true;
    expect(animator["_enabled"]).to.eq(true);
  });

  it("find animator state", () => {
    const stateName = 'idle'; 
    const expectedStateName = 'sad_pose';
    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;

    const currentAnimatorState = animator.getCurrentAnimatorState(layerIndex);
    let animatorState = animator.findAnimatorState(stateName,layerIndex);
    expect(animatorState).to.deep.eq(currentAnimatorState);

    animator.play(expectedStateName);
    animatorState = animator.findAnimatorState(expectedStateName,layerIndex);
    expect(animatorState).not.to.deep.eq(currentAnimatorState);
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
    //@ts-ignore
    animator._reset();
    animator.play('agree');
    animator.update(1);
    animator.crossFade('sneak_pose', 0.5);

    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;
    const animatorLayerData = animator["_animatorLayersData"];
    const layerState = animatorLayerData[layerIndex].layerState;
    
    // current animator layerState should be CrossFading(2)
    expect(layerState).to.eq(2);
  });

  it("animation fix cross fade", () => {
    //@ts-ignore
    animator._reset();
    animator.play('agree');
    animator.update(1);
    animator.crossFade('agree', 5);
    animator.crossFade('sneak_pose', 0.5);

    const layerIndex = animator["_tempAnimatorStateInfo"].layerIndex;
    const animatorLayerData = animator["_animatorLayersData"];
    const layerState = animatorLayerData[layerIndex].layerState;

    // current animator layerState should be FixedCrossFading(3)
    expect(layerState).to.eq(3);
  });
});