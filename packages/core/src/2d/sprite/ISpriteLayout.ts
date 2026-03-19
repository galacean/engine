import { Vector2 } from "@galacean/engine-math";

/**
 * Geometry input for sprite assemblers.
 */
export interface ISpriteLayout {
  readonly width: number;
  readonly height: number;
  readonly pivot: Vector2;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly referenceResolutionPerUnit: number | undefined;
}
