import { Vector3 } from "@oasis-engine/math";

/**
 * BlendShapeFrame.
 */
export class BlendShapeFrame {
  /** Weight of BlendShapeFrame. */
  readonly weight: number;

  /** @internal */
  _dirty: BlendShapeDirty = BlendShapeDirty.All;

  private _deltaPositions: Vector3[];
  private _deltaNormals: Vector3[];
  private _deltaTangents: Vector3[];

  /**
   * Delta positions for the frame being added.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get deltaPositions(): Vector3[] {
    return this._deltaPositions;
  }

  set deltaPositions(value: Vector3[]) {
    this._deltaPositions = value;
    this._dirty |= BlendShapeDirty.Position;
  }

  /**
   * Delta normals for the frame being added.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get deltaNormals(): Vector3[] {
    return this._deltaNormals;
  }

  set deltaNormals(value: Vector3[]) {
    this._deltaNormals = value;
    this._dirty |= BlendShapeDirty.Normal;
  }

  /**
   * Delta tangents for the frame being added.
   * @remarks Need to re-assign after modification to ensure that the modification takes effect.
   */
  get deltaTangents(): Vector3[] {
    return this._deltaTangents;
  }

  set deltaTangents(value: Vector3[]) {
    this._deltaTangents = value;
    this._dirty |= BlendShapeDirty.Tangent;
  }

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
    deltaNormals: Vector3[] = null,
    deltaTangents: Vector3[] = null
  ) {
    if (deltaNormals && deltaNormals.length !== deltaPositions.length) {
      throw "deltaNormals length must same with deltaPositions length.";
    }

    if (deltaTangents && deltaTangents.length !== deltaPositions.length) {
      throw "deltaTangents length must same with deltaPositions length.";
    }

    this.weight = weight;
    this._deltaPositions = deltaPositions;
    this._deltaNormals = deltaNormals;
    this._deltaTangents = deltaTangents;
  }

  /**
   * @internal
   */
  _releaseData(): void {
    this._deltaPositions = null;
    this._deltaNormals = null;
    this._deltaTangents = null;
  }
}

enum BlendShapeDirty {
  Position = 0x1,
  Normal = 0x2,
  Tangent = 0x4,
  All = 0x7
}
