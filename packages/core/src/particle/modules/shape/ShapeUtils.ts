import { Rand, Vector2, Vector3 } from "@galacean/engine-math";

/**
 * @internal
 */
export class ShapeUtils {
  static _randomPointUnitArcCircle(arc: number, out: Vector2, rand: Rand): void {
    const angle = rand.random() * arc;
    out.x = Math.cos(angle);
    out.y = Math.sin(angle);
  }

  static _randomPointInsideUnitArcCircle(arc: number, out: Vector2, rand: Rand): void {
    ShapeUtils._randomPointUnitArcCircle(arc, out, rand);
    const range = Math.pow(rand.random(), 1.0 / 2.0);
    out.x = out.x * range;
    out.y = out.y * range;
  }

  static _randomPointUnitCircle(out: Vector2, rand: Rand): void {
    const angle = rand.random() * Math.PI * 2;
    out.x = Math.cos(angle);
    out.y = Math.sin(angle);
  }

  static _randomPointInsideUnitCircle(out: Vector2, rand: Rand): void {
    ShapeUtils._randomPointUnitCircle(out, rand);
    const range = Math.pow(rand.random(), 1.0 / 2.0);
    out.x = out.x * range;
    out.y = out.y * range;
  }

  static _randomPointUnitSphere(out: Vector3, rand: Rand): void {
    const z = (out.z = rand.random() * 2 - 1.0);
    const a = rand.random() * Math.PI * 2;

    const r: number = Math.sqrt(1.0 - z * z);

    out.x = r * Math.cos(a);
    out.y = r * Math.sin(a);
  }

  static _randomPointInsideUnitSphere(out: Vector3, rand: Rand): void {
    ShapeUtils._randomPointUnitSphere(out, rand);
    const range = Math.pow(rand.random(), 1.0 / 3.0);
    out.x = out.x * range;
    out.y = out.y * range;
    out.z = out.z * range;
  }

  static _randomPointInsideHalfUnitBox(out: Vector3, rand: Rand = null): void {
    out.x = rand.random() - 0.5;
    out.y = rand.random() - 0.5;
    out.z = rand.random() - 0.5;
  }
}
