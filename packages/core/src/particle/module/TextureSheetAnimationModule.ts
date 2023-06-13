import { FrameOverTime } from "./FrameOverTime";
import { StartFrame } from "./StartFrame";
import { IClone } from "@oasis-engine/design";
import { ParticleAnimationRowMode, ParticleAnimationType } from "../enum";

/**
 * This module allows you to add animations to your particle textures.
 */
export class TextureSheetAnimationModule implements IClone {
  /** Specifies the animation type.*/
  animation = ParticleAnimationType.WholeSheet;
  /** Specifies how many times the animation loops during the lifetime of the particle. */
  cyclesCount: number = 1;
  /** Specifies whether the TextureSheetAnimationModule is enabled or disabled. */
  enable: boolean = false;
  /** A curve to control which frame of the Texture sheet animation to play. */
  frameOverTime: FrameOverTime;
  /** Defines the tiling of the Texture in the x-axis. */
  numTilesX = 1;
  /** Defines the tiling of the texture in the y-axis. */
  numTilesY = 1;
  /** Explicitly select which row of the Texture sheet to use.  */
  rowIndex: number = 0;
  /** Select how particles choose which row of a Texture Sheet Animation to use. */
  rowMode = ParticleAnimationRowMode.Random;
  /** Define a random starting frame for the Texture sheet animation. */
  startFrame: StartFrame;

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destTextureSheetAnimation: TextureSheetAnimationModule): void {
    destTextureSheetAnimation.numTilesX = this.numTilesX;
    destTextureSheetAnimation.numTilesY = this.numTilesY;
    destTextureSheetAnimation.animation = this.animation;
    destTextureSheetAnimation.rowMode = this.rowMode;
    destTextureSheetAnimation.rowIndex = this.rowIndex;
    destTextureSheetAnimation.cyclesCount = this.cyclesCount;
    destTextureSheetAnimation.enable = this.enable;
    this.startFrame.cloneTo(destTextureSheetAnimation.startFrame);
    this.frameOverTime.cloneTo(destTextureSheetAnimation.frameOverTime);
  }

  /**
   * @override
   * @inheritDoc
   */
  clone(): TextureSheetAnimationModule {
    let destFrame: FrameOverTime;
    switch (this.frameOverTime.mode) {
      case 0:
        destFrame = FrameOverTime.createByConstant(this.frameOverTime.constant);
        break;
      case 1:
        destFrame = FrameOverTime.createByOverTime(this.frameOverTime.frameOverTimeData.clone());
        break;
      case 2:
        destFrame = FrameOverTime.createByRandomTwoConstant(
          this.frameOverTime.constantMin,
          this.frameOverTime.constantMax
        );
        break;
      case 3:
        destFrame = FrameOverTime.createByRandomTwoOverTime(
          this.frameOverTime.frameOverTimeDataMin.clone(),
          this.frameOverTime.frameOverTimeDataMax.clone()
        );
        break;
    }

    let destStartFrame: StartFrame;
    switch (this.startFrame.mode) {
      case 0:
        destStartFrame = StartFrame.createByConstant(this.startFrame.constant);
        break;
      case 1:
        destStartFrame = StartFrame.createByRandomTwoConstant(this.startFrame.constantMin, this.startFrame.constantMax);
        break;
    }

    const destTextureSheetAnimation = new TextureSheetAnimationModule();
    this.cloneTo(destTextureSheetAnimation);
    return destTextureSheetAnimation;
  }
}
