/** Uniform metre calibration of authored geometry; see assets/CROP-SCALE.md.
 * Foliage may overhang a plot: the gameplay grid must not shrink mature plants.
 */
export const FARM_CROP_SCALES: Readonly<Record<string, number>> = Object.freeze({
  tomato: 0.45,
  beetroot: 0.33,
  cabbage: 0.65,
  canola: 0.9,
  carrot: 0.33,
  grapevine: 1,
  melon: 0.75,
  potato: 0.32,
  pumpkin: 0.583,
  radish: 0.22,
  sunflower: 0.75,
  watermelon: 0.7,
  wheat: 0.7,
  rice: 1
});
