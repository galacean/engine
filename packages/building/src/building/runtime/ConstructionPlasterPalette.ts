import { srgbToLinear } from "./MasonryAppearance";
/** Last mip of the eight shipped plaster color layers, in sRGB. Used only
 * for swatches and tint normalization; rendering samples the complete textures. */
export const plasterPalette = [
  [0.698039, 0.466667, 0.4],
  [0.741176, 0.560784, 0.278431],
  [0.462745, 0.54902, 0.592157],
  [0.360784, 0.352941, 0.32549],
  [0.67451, 0.698039, 0.607843],
  [0.498039, 0.568627, 0.45098],
  [0.745098, 0.607843, 0.45098],
  [0.741176, 0.572549, 0.52549]
];
export function parsePlasterHex(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw Error("颜色格式须为 #RRGGBB");
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** Authored plaster RGB is sRGB; both render adapters consume this linear value. */
export function plasterLinearColor(color: readonly number[]): [number, number, number] {
  return [srgbToLinear(color[0]), srgbToLinear(color[1]), srgbToLinear(color[2])];
}
