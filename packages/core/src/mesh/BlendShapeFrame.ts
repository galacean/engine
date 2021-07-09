import { Vector3 } from "@oasis-engine/math";
import { UpdateFlagManager } from "../UpdateFlagManager";

/**
 * BlendShapeFrame.
 */
export class BlendShapeFrame {
  /** Weight of BlendShapeFrame. */
  weight: number;
  /** Delta positions for the frame being added. */
  deltaPositions: Vector3[];
  /** Delta normals for the frame being added. */
  deltaNormals: Vector3[] | null;
  /** Delta tangents for the frame being added. */
  deltaTangents: Vector3[] | null;

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
    this.weight = weight;
    this.deltaPositions = deltaPositions;
    this.deltaNormals = deltaNormals;
    this.deltaTangents = deltaTangents;
  }
}
