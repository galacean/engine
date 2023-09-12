import { Vector3 } from "@galacean/engine-math";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { BlendShapeFrame, BlendShapeFrameDirty } from "./BlendShapeFrame";

/**
 * BlendShape.
 */
export class BlendShape {
  /** Name of BlendShape. */
  name: string;

  /** @internal */
  _useBlendShapeNormal: boolean = true;
  /** @internal */
  _useBlendShapeTangent: boolean = true;
  /** @internal */
  _layoutChangeManager: UpdateFlagManager = new UpdateFlagManager();
  /** @internal */
  _dataChangeManager: UpdateFlagManager = new UpdateFlagManager();

  private _frames: BlendShapeFrame[] = [];

  /**
   * Frames of BlendShape.
   */
  get frames(): Readonly<BlendShapeFrame[]> {
    return this._frames;
  }

  /**
   * Create a BlendShape.
   * @param name - BlendShape name.
   */
  constructor(name: string) {
    this.name = name;
    this._frameDataChangeListener = this._frameDataChangeListener.bind(this);
  }

  /**
   * Add a BlendShapeFrame by weight, deltaPositions, deltaNormals and deltaTangents.
   * @param weight - Weight of BlendShapeFrame
   * @param deltaPositions - Delta positions for the frame being added
   * @param deltaNormals - Delta normals for the frame being added
   * @param deltaTangents - Delta tangents for the frame being added
   */
  addFrame(
    weight: number,
    deltaPositions: Vector3[],
    deltaNormals?: Vector3[],
    deltaTangents?: Vector3[]
  ): BlendShapeFrame;

  /**
   * Add a BlendShapeFrame.
   * @param frame - The BlendShapeFrame.
   */
  addFrame(frame: BlendShapeFrame): void;

  addFrame(
    frameOrWeight: BlendShapeFrame | number,
    deltaPositions?: Vector3[],
    deltaNormals?: Vector3[],
    deltaTangents?: Vector3[]
  ): void | BlendShapeFrame {
    if (typeof frameOrWeight === "number") {
      const frame = new BlendShapeFrame(frameOrWeight, deltaPositions, deltaNormals, deltaTangents);
      this._addFrame(frame);
      return frame;
    } else {
      this._addFrame(frameOrWeight);
    }
  }

  /**
   * Clear all frames.
   */
  clearFrames(): void {
    const frames = this._frames;

    for (let i = 0, n = frames.length; i < n; i++) {
      frames[i]._dataChangeManager.removeListener(this._frameDataChangeListener);
    }
    frames.length = 0;
    this._updateUseNormalAndTangent(true, true);
    this._dataChangeManager.dispatch();
  }

  /**
   * @internal
   */
  _releaseData(): void {
    const frames = this._frames;
    for (let i = 0, n = frames.length; i < n; i++) {
      frames[i]._releaseData();
    }
  }

  private _addFrame(frame: BlendShapeFrame): void {
    const frames = this._frames;
    const frameCount = frames.length;
    if (frameCount > 0 && frame.deltaPositions.length !== frames[frameCount - 1].deltaPositions.length) {
      throw "Frame's deltaPositions length must same with before frame deltaPositions length.";
    }
    this._frames.push(frame);

    this._frameDataChangeListener(BlendShapeFrameDirty.All, frame);
    frame._dataChangeManager.addListener(this._frameDataChangeListener);
  }

  private _updateUseNormalAndTangent(useNormal: boolean, useTangent: boolean): void {
    const useBlendShapeNormal = this._useBlendShapeNormal && useNormal;
    const useBlendShapeTangent = this._useBlendShapeTangent && useTangent;
    if (this._useBlendShapeNormal !== useBlendShapeNormal || this._useBlendShapeTangent !== useBlendShapeTangent) {
      this._useBlendShapeNormal = useBlendShapeNormal;
      this._useBlendShapeTangent = useBlendShapeTangent;
      this._layoutChangeManager.dispatch(0, this);
    }
  }

  private _frameDataChangeListener(type: BlendShapeFrameDirty, frame: BlendShapeFrame): void {
    this._updateUseNormalAndTangent(!!frame.deltaNormals, !!frame.deltaTangents);
    this._dataChangeManager.dispatch();
  }
}
