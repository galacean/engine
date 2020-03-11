import { entryFactory } from "../lottie-core/entryFactory";
import { AnimationManager } from "./animation/animationManager";

const lottie = entryFactory(AnimationManager);
lottie.loadAnimation = (engine, params) => {
  return AnimationManager.loadAnimation(engine, params);
};

export { lottie };
