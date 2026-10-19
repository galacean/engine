import { SpineAnimationRenderer, SpineResource, SpineSkeleton, SpineAnimationState } from "@galacean/engine-spine";
declare const renderer: SpineAnimationRenderer;
declare const resource: SpineResource;
const skeleton: SpineSkeleton = renderer.skeleton;
const state: SpineAnimationState = renderer.state;
// @ts-expect-error Backend handles are not part of the public API.
resource.skeletonData._native;
// @ts-expect-error Resources are loaded, not constructed from backend handles.
new SpineResource();
skeleton.setSkinByName("default");
skeleton.setSlotsToSetupPose();
const composite = resource.createSkin("custom");
const skin = resource.skeletonData.findSkin("alt");
if (skin) composite.addSkin(skin);
if (skin) skeleton.setSkin(skin);
const bone = skeleton.findBone("root");
if (bone) bone.rotation += 10;
const entry = state.setAnimation(0, "idle", true);
entry.listener = {
  complete(track) {
    const time: number = track.trackTime;
  }
};
state.addListener({
  event(track, event) {
    const name: string = event.data.name;
  }
});
resource.stateData.setMix("idle", "walk", 0.2);
if (renderer.physics?.supported) {
  renderer.physics.value.physicsTranslate(1, 2);
  renderer.physics.value.physicsConstraints.forEach((c) => c.reset());
}
// @ts-expect-error Physics is a capability, not an unconditional skeleton method.
skeleton.physicsTranslate(1, 2);
// @ts-expect-error Unknown calls must not become any through a missing declaration dependency.
state.methodThatDoesNotExist();
// @ts-expect-error No capability value before narrowing support.
renderer.physics.value.physicsTranslate(1, 2);
// @ts-expect-error Playback names must be strings.
state.setAnimation(0, 123, true);
