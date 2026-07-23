import {
  WaterLocalModifierChannel,
  resetWaterLocalFieldSample,
  type WaterLocalFieldProvider,
  type WaterLocalFieldSample
} from "./WaterLocalFieldProvider";
import type {
  RectangularWaterHeightField,
  RectangularWaterHeightFieldSample,
  WaterHeightFieldCoordinate
} from "./RectangularWaterHeightField";

/** Zero-copy adapter over the interactive pool's authoritative CPU deformation field. */
export class RectangularWaterDeformationProvider implements WaterLocalFieldProvider {
  readonly channels = WaterLocalModifierChannel.DisplacementY;

  private readonly _fieldSample: RectangularWaterHeightFieldSample = {
    height: 0,
    verticalVelocity: 0,
    gradientLocalX: 0,
    gradientLocalZ: 0
  };
  private readonly _worldGradient: WaterHeightFieldCoordinate = { x: 0, z: 0 };

  constructor(readonly field: RectangularWaterHeightField) {}

  /** The exact solver buffer; consumers must treat it as read-only. */
  get heightBuffer(): Float32Array {
    return this.field.heightCurrent;
  }

  /** The exact solver velocity buffer; consumers must treat it as read-only. */
  get verticalVelocityBuffer(): Float32Array {
    return this.field.verticalVelocity;
  }

  sampleLocalField(worldX: number, worldZ: number, outSample: WaterLocalFieldSample): boolean {
    resetWaterLocalFieldSample(outSample);
    if (!this.field.sampleWorld(worldX, worldZ, this._fieldSample)) return false;
    const fieldSample = this._fieldSample;
    this.field.localGradientToWorld(fieldSample.gradientLocalX, fieldSample.gradientLocalZ, this._worldGradient);
    outSample.displacementY = fieldSample.height;
    outSample.surfaceVelocityY = fieldSample.verticalVelocity;
    outSample.gradientX = this._worldGradient.x;
    outSample.gradientZ = this._worldGradient.z;
    return true;
  }
}
