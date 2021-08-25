import { Animator, AnimatorController } from "@oasis-engine/core";

/**
 * @deprecated
 * Temporarily only for editor use.
 * Remove when editor finish change from glTF to prefab.
 */
export class AnimatorForEditor extends Animator {
  private _animator: Animator;

  get animatorController(): AnimatorController {
    return this._animatorController;
  }

  set animatorController(animatorController: AnimatorController) {
    const { _animator: animator } = this;
    this._animatorController = animatorController;
    if (this._animator) {
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
    const { _animator: animator } = this;
    this._speed = value;
    if (animator) {
      animator.speed = value;
    } else {
      this.initAnimator();
    }
  }

  update(deltaTime: number) {
    if (this._controllerUpdateFlag.flag) {
      this.playDefaultState();
      return;
    }
    this._animator.speed = this._speed;
    super.update(deltaTime);
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
      this._animator = glTFAnimator;
      this._animator.animatorController = animatorController;
      this.playDefaultState();
    }
  }

  playDefaultState() {
    const { _animatorController: animatorController, _animator: animator } = this;
    if (!animator) return;
    if (animatorController) {
      const { layers } = animatorController;
      for (let i = 0, length = layers.length; i < length; ++i) {
        const startStateName = layers[i]?.stateMachine?.states[0]?.name;
        console.log(animatorController, startStateName);
        startStateName && animator.play(startStateName, i);
      }
    }
  }
}
