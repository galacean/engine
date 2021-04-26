import { Color } from "@oasis-engine/math";
import { Sky } from "./sky/Sky";

/**
 * The Background mode enumeration.
 */
export enum BackgroundMode {
  /* Solid color. */
  Color,
  /* Sky. */
  Sky
}

/**
 * Background of scene.
 */
export class Background {
  /**
   * Background mode.
   * @defaultValue `BackgroundMode.Sky`
   */
  mode: BackgroundMode = BackgroundMode.Sky;
  /**
   * Background color.
   * @defaultValue `new Color(0.25, 0.25, 0.25, 1.0)`
   */
  color: Color = new Color(0.25, 0.25, 0.25, 1.0);
  /*
   * Background sky.
   */
  readonly sky: Sky = new Sky();
}
