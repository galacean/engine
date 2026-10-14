/** Color channels used by a Spine skeleton or slot. */
export interface ISpineColor {
  r: number;
  g: number;
  b: number;
  a: number;
  set(r: number, g: number, b: number, a: number): this;
}
