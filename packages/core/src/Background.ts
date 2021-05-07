import { Color } from "@oasis-engine/math";
import { BackgroundMode } from "./enums/BackgroundMode";
import { Sky } from "./sky/Sky";

/**
 * Background of scene.
 */
export class Background {
  /**
   * Background mode.
   * @defaultValue `BackgroundMode.Sky`
   * @remarks If the material or the mesh of the is not defined, it will downgrade to `BackgroundMode.SolidColor`.
   */
  mode: BackgroundMode = BackgroundMode.Sky;

  /**
   * Background solid color.
   * @defaultValue `new Color(0.25, 0.25, 0.25, 1.0)`
   * @remarks When `mode` is `BackgroundMode.SolidColor`, the property will take effects.
   */
  solidColor: Color = new Color(0.25, 0.25, 0.25, 1.0);

  /**
   * Background sky.
   * @remarks When `mode` is `BackgroundMode.Sky`, the property will take effects.
   */
  readonly sky: Sky = new Sky();
}
