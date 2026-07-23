import { Vector3 } from "@galacean/engine-math";
import type { WaterSurfaceProvider, WaterSurfaceSample } from "../query/WaterSurfaceProvider";
import type {
  RectangularWaterHeightField,
  RectangularWaterHeightFieldSample,
  WaterHeightFieldCoordinate
} from "./RectangularWaterHeightField";

/** Combines the existing River surface with one shared interactive pool height field. */
export class InteractivePoolSurfaceProvider implements WaterSurfaceProvider {
  sampleCount = 0;

  private readonly _fieldSample: RectangularWaterHeightFieldSample = {
    height: 0,
    verticalVelocity: 0,
    gradientLocalX: 0,
    gradientLocalZ: 0
  };
  private readonly _worldGradient: WaterHeightFieldCoordinate = { x: 0, z: 0 };

  constructor(
    private readonly _baseProvider: WaterSurfaceProvider,
    readonly heightField: RectangularWaterHeightField
  ) {}

  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
    this.sampleCount++;
    if (!this._baseProvider.sampleSurface(worldPosition, outSample)) return false;
    if (!this.heightField.sampleWorld(worldPosition.x, worldPosition.z, this._fieldSample)) return true;

    const fieldSample = this._fieldSample;
    outSample.surfacePosition.y += fieldSample.height;
    outSample.waterVelocity.y += fieldSample.verticalVelocity;
    outSample.waterDepth = Math.max(0, outSample.waterDepth + fieldSample.height);
    this.heightField.localGradientToWorld(fieldSample.gradientLocalX, fieldSample.gradientLocalZ, this._worldGradient);
    const normal = outSample.surfaceNormal;
    normal.set(normal.x - this._worldGradient.x, normal.y, normal.z - this._worldGradient.z);
    const normalLength = normal.length();
    if (!Number.isFinite(normalLength) || normalLength <= Number.EPSILON) normal.set(0, 1, 0);
    else Vector3.scale(normal, 1 / normalLength, normal);
    return true;
  }
}
