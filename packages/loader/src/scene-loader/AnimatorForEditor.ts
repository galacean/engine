import { Entity, AnimatorController, Animator } from "@oasis-engine/core";

/**
 * @deprecated
 * Temporarily only for editor use.
 * Remove when editor finish change from gltf to prefab.
 */
export class AnimatorForEditor extends Animator {
  private _speed: number = 1;
  private animator: Animator;

  get animatorController(): AnimatorController {
    return this._animatorController;
  }

  set animatorController(animatorController: AnimatorController) {
    const { animator } = this;
    this._animatorController = animatorController;
    if (this.animator) {
      animator.animatorController = animatorController;
      this.playDefaultState();
    } else {
      this.initAnimator();
    }
  }

  get speed(): number {
    return this._speed;
  }

  set speed(val: number) {
    const { animator } = this;
    this._speed = val;
    if (animator) {
      animator.speed = val;
    } else {
      this.initAnimator();
    }
  }

  update() {
    if (this._animatorController?.isDirty) {
      this.playDefaultState();
      return;
    }
    if (this._speed && this.animator) {
      this.animator.speed = this._speed;
    }
  }

  initAnimator() {
    const { _animatorController: animatorController, _speed: speed } = this;
    const { children } = this.entity;
    let gltfAnimator: Animator;
    for (let i = 0, length = children.length; i < length; ++i) {
      const child = children[i];
      const animator = child.getComponent(Animator);
      if (animator) {
        gltfAnimator = animator;
        break;
      }
    }
    if (gltfAnimator) {
      gltfAnimator.speed = speed;
      this.animator = gltfAnimator;
      this.animator.animatorController = animatorController;
      this.playDefaultState();
    }
  }

  playDefaultState() {
    const { _animatorController: animatorController, animator } = this;
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
