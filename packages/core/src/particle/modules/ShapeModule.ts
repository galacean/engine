import { BaseShape } from "./shape/BaseShape";
import { ConeShape } from "./shape/ConeShape";

/**
 * Shape module of `ParticleGenerator`.
 */
export class ShapeModule {
  /** Specifies whether the Shape Module is enabled or disabled. */
  enabled: boolean = true;
  /** The shape of the emitter. */
  shape: BaseShape = new ConeShape();
}
