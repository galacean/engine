import {
  AnimationClip,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine
} from "@galacean/engine-core";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.AnimatorController)
export class GLTFAnimatorControllerParser extends GLTFParser {
  parse(context: GLTFParserContext): Promise<AnimatorController> {
    return context.get<AnimationClip>(GLTFParserType.Animation).then((animations) => {
      if (context.needAnimatorController) {
        const animatorController = this._createAnimatorController(animations);
        return Promise.resolve(animatorController);
      } else {
        return Promise.resolve(null);
      }
    });
  }

  private _createAnimatorController(animations: AnimationClip[]): AnimatorController {
    const animatorController = new AnimatorController();
    const layer = new AnimatorControllerLayer("layer");
    const animatorStateMachine = new AnimatorStateMachine();
    animatorController.addLayer(layer);
    layer.stateMachine = animatorStateMachine;
    if (animations) {
      for (let i = 0; i < animations.length; i++) {
        const animationClip = animations[i];
        const name = animationClip.name;
        const uniqueName = animatorStateMachine.makeUniqueStateName(name);
        if (uniqueName !== name) {
          console.warn(`AnimatorState name is existed, name: ${name} reset to ${uniqueName}`);
        }
        const animatorState = animatorStateMachine.addState(uniqueName);
        animatorState.clip = animationClip;
      }
    }

    return animatorController;
  }
}
