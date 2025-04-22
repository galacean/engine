import {
  AnimationClip,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  AssetPromise,
  Logger
} from "@galacean/engine-core";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.AnimatorController)
export class GLTFAnimatorControllerParser extends GLTFParser {
  parse(context: GLTFParserContext): AssetPromise<AnimatorController> {
    if (!context.needAnimatorController) {
      return AssetPromise.resolve(null);
    }

    return context
      .get<AnimationClip>(GLTFParserType.Animation)
      .then((animations) => {
        const animatorController = this._createAnimatorController(context, animations);
        return AssetPromise.resolve(animatorController);
      })
      .catch((e) => {
        Logger.error("GLTFAnimatorControllerParser: animator controller error", e);
      });
  }

  private _createAnimatorController(context: GLTFParserContext, animations: AnimationClip[]): AnimatorController {
    const { glTFResource } = context;
    const engine = glTFResource.engine;
    const animatorController = new AnimatorController(engine);
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
