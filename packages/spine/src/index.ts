import * as LoaderObject from "./loader";
import * as RendererObject from "./renderer";
import { Loader } from "@galacean/engine";

for (const key in RendererObject) {
  Loader.registerClass(key, RendererObject[key]);
}
for (const key in LoaderObject) {
  Loader.registerClass(key, LoaderObject[key]);
}

export * from "./loader/index";
export * from "./renderer/index";
export { SpineSkeleton } from "./SpineSkeleton";
export { SpineBone } from "./SpineBone";
export { SpineSlot } from "./SpineSlot";
export { SpineSkin } from "./SpineSkin";
export { SpineSkeletonData } from "./SpineSkeletonData";
export { SpineAnimationStateData } from "./SpineAnimationStateData";
export { SpineAnimationState } from "./SpineAnimationState";
export { SpineTrackEntry } from "./SpineTrackEntry";
export { SpinePhysics } from "./SpinePhysics";
export { SpinePhysicsConstraint } from "./SpinePhysicsConstraint";
export type { SpineAnimation } from "./SpineAnimation";
export type { SpineAnimationStateListener, SpineEvent } from "./SpineAnimationStateListener";
export type { SpinePhysicsSupport } from "./SpinePhysics";

export const version = `__buildVersion`;
console.log(`Galacean spine version: ${version}`);
