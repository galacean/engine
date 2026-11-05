import { WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer, SpineResource, SpineSkeleton, SpineAnimationState } from "@galacean/engine-spine";
declare const renderer: SpineAnimationRenderer;
declare const resource: SpineResource;
const skeleton: SpineSkeleton = renderer.skeleton;
const state: SpineAnimationState = renderer.state;
renderer.onBeforeApply.on((source) => source.skeleton.setBonesToSetupPose());
renderer.onUpdateLocal.on((source) => {
  const bone = source.skeleton.findBone("root");
  if (bone) bone.rotation += 10;
});
renderer.onUpdateWorld.once((source) => {
  const skeleton: SpineSkeleton = source.skeleton;
});
renderer.onUpdateComplete.on((source) => {
  const current: SpineAnimationState = source.state;
});
// @ts-expect-error Pose signals supply the renderer, not a delta time.
renderer.onUpdateLocal.on((delta: number) => {});
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

// @ts-expect-error Runtime registration is not part of the public API.
import { registerSpineRuntime } from "@galacean/engine-spine";
import type { SpineLoader } from "@galacean/engine-spine/types/loader/SpineLoader";
declare const spineLoader: SpineLoader;
// @ts-expect-error The editor registration hook is stripped from published types.
spineLoader._registerRuntime;
// @ts-expect-error Application code cannot retrieve backend handles.
import { getSpineRuntime } from "@galacean/engine-spine";
// @ts-expect-error Render integration is not part of the application API.
import { ISpineRenderTarget } from "@galacean/engine-spine";
// @ts-expect-error Vertex layout is an implementation detail.
import { SpineVertexStride } from "@galacean/engine-spine";

// @ts-expect-error Spine assets use straight alpha; there is no instance rendering mode.
renderer.premultipliedAlpha = true;

// @ts-expect-error Engine creation accepts a backend instance, not a version string.
WebGLEngine.create({ canvas: "canvas", spine: "4.2" });
