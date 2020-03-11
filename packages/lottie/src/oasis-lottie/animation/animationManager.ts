import { AnimationManagerFactory } from "../../lottie-core/animation/AnimationManagerFactory";
import { AnimationItem } from "./animationItem";

const AnimationManager = AnimationManagerFactory(AnimationItem);

AnimationManager.loadAnimation = (engine, params) => {
  const animItem = new AnimationItem(engine);
  AnimationManager.setupAnimation(animItem, null);
  animItem.setParams(params);
  return animItem;
};

export { AnimationManager };
