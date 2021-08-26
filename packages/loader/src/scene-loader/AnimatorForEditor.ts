import { Animator, AnimatorController } from "@oasis-engine/core";

/**
 * @deprecated
 * Temporarily only for editor use.
 * Remove when editor finish change from glTF to prefab.
 */
export class AnimatorForEditor extends Animator {
  // The animator component in runtime.
  runTimeAnimator: Animator;

  get animatorController(): AnimatorController {
    return this._animatorController;
  }

  set animatorController(animatorController: AnimatorController) {
    const { runTimeAnimator: animator } = this;
    if (animatorController !== this._animatorController) {
      this._controllerUpdateFlag && this._controllerUpdateFlag.destroy();
      //@ts-ignore
      console.log(4444, animatorController)
      this._controllerUpdateFlag = animatorController && animatorController._registerChangeFlag();
      this._animatorController = animatorController;
      console.warn("The animatorController has changed, Please call play method again.");
    }
    if (animator) {
      animator.animatorController = animatorController;
      this.playDefaultState();
    } else {
      this.initAnimator();
    }
  }

  get speed(): number {
    return this._speed;
  }

  set speed(value: number) {
    const { runTimeAnimator: animator } = this;
    this._speed = value;
    if (animator) {
      animator.speed = value;
    } else {
      this.initAnimator();
    }
  }

  update() {
    if (this.runTimeAnimator) {
      if (this._controllerUpdateFlag?.flag) {
        this.playDefaultState();
        console.warn("The animatorController is modified, please call play()/crossFade() method again.");
        return;
      }
      // Avoid be modfied by GLTFModel.
      this.runTimeAnimator.speed = this._speed;
    }
  }

  initAnimator() {
    const { _animatorController: animatorController, _speed: speed } = this;
    const { children } = this.entity;
    let glTFAnimator: Animator;
    for (let i = 0, length = children.length; i < length; ++i) {
      const child = children[i];
      const animator = child.getComponent(Animator);
      if (animator) {
        glTFAnimator = animator;
        break;
      }
    }
    if (glTFAnimator) {
      glTFAnimator.speed = speed;
      this.runTimeAnimator = glTFAnimator;
      this.runTimeAnimator.animatorController = animatorController;
      this.playDefaultState();
    }
  }

  playDefaultState() {
    const { _animatorController: animatorController, runTimeAnimator: animator } = this;
    if (!animator) return;
    if (this._controllerUpdateFlag?.flag) {
      this._controllerUpdateFlag.flag = false;
    }
    if (animatorController) {
      const { layers } = animatorController;
      for (let i = 0, length = layers.length; i < length; ++i) {
        const startStateName = layers[i]?.stateMachine?.states[0]?.name;
        startStateName && animator.play(startStateName, i);
      }
    }
  }
}
