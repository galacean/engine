import { Rand, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Hemisphere emitter
 */
export class HemisphereShape extends BaseShape {
  /** Radius of the shape to emit particles from. */
  radius: number = 1.0;
  /** Whether emit from shell */
  emitFromShell: boolean = false;

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Hemisphere;
  }

  override _generatePositionAndDirection(rand: Rand, position: Vector3, direction: Vector3): void {
    if (this.emitFromShell) {
      ShapeUtils._randomPointUnitSphere(position, rand);
    } else {
      ShapeUtils._randomPointInsideUnitSphere(position, rand);
    }

    Vector3.scale(position, this.radius, position);

    const z = position.z;
    z < 0.0 && (position.z = z * -1.0);

    if (this.randomDirectionAmount) {
      ShapeUtils._randomPointUnitSphere(direction, rand);
    } else {
      direction.copyFrom(position);
    }
    // reverse to default direction
    direction.z *= -1.0;
  }

  override cloneTo(destShape: HemisphereShape): void {
    super.cloneTo(destShape);
    destShape.radius = this.radius;
    destShape.emitFromShell = this.emitFromShell;
    destShape.randomDirectionAmount = this.randomDirectionAmount;
  }

  override clone(): HemisphereShape {
    const destShape = new HemisphereShape();
    this.cloneTo(destShape);
    return destShape;
  }
}
