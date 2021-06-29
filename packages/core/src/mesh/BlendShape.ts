import { BlendShapeFrame } from "./BlendShapeFrame";
import { Vector3 } from "@oasis-engine/math";

/**
 * BlendShape.
 */
export class BlendShape {
  /** Name of BlendShape. */
  name: string;

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
  }

  /**
   * Add a BlendShapeFrame.
   * @param frame - The BlendShapeFrame.
   */
  addFrame(frame: BlendShapeFrame): void;

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
    deltaNormals: Vector3[] | null,
    deltaTangents: Vector3[] | null
  ): BlendShapeFrame;

  addFrame(
    frameOrWeight: BlendShapeFrame | number,
    deltaPositions?: Vector3[],
    deltaNormals?: Vector3[] | null,
    deltaTangents?: Vector3[] | null
  ): void | BlendShapeFrame {
    if (typeof frameOrWeight === "number") {
      const frame = new BlendShapeFrame(frameOrWeight, deltaPositions, deltaNormals, deltaTangents);
      this._frames.push(frame);
      return frame;
    } else {
      this._frames.push(frameOrWeight);
    }
  }

  /**
   * Clear all frames.
   */
  clearFrames(): void {
    this._frames.length = 0;
  }
}
