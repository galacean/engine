import { Vector3 } from "@oasis-engine/math";

/**
 * BlendShapeFrame.
 */
export class BlendShapeFrame {
  /** Weight of BlendShapeFrame. */
  readonly weight: number;
  /** Delta positions for the frame being added. */
  readonly deltaPositions: Readonly<Readonly<Vector3>[]>;
  /** Delta normals for the frame being added. */
  readonly deltaNormals: Readonly<Readonly<Vector3[]> | null>;
  /** Delta tangents for the frame being added. */
  readonly deltaTangents: Readonly<Readonly<Vector3[]> | null>;

  /**
   * Create a BlendShapeFrame.
   * @param weight - Weight of BlendShapeFrame
   * @param deltaPositions - Delta positions for the frame being added
   * @param deltaNormals - Delta normals for the frame being added
   * @param deltaTangents - Delta tangents for the frame being added
   */
  constructor(
    weight: number,
    deltaPositions: Vector3[],
    deltaNormals: Vector3[] | null,
    deltaTangents: Vector3[] | null
  ) {
    if (deltaNormals && deltaNormals.length !== deltaPositions.length) {
      throw "deltaNormals length must same with deltaPositions length.";
    }

    if (deltaTangents && deltaTangents.length !== deltaPositions.length) {
      throw "deltaTangents length must same with deltaPositions length.";
    }

    this.weight = weight;
    this.deltaPositions = deltaPositions;
    this.deltaNormals = deltaNormals;
    this.deltaTangents = deltaTangents;
  }
}
