import type { Entity } from "@galacean/engine";

export type ProducePiece = (
  name: string,
  position: number[],
  size: number[],
  color: number[],
  delay?: number,
  cone?: boolean
) => Entity;
const colors: Record<string, [number, number, number]> = {
  tomato: [0.82, 0.09, 0.025],
  carrot: [0.98, 0.36, 0.035],
  potato: [0.6, 0.39, 0.17],
  grapevine: [0.29, 0.075, 0.42],
  cabbage: [0.37, 0.63, 0.19],
  melon: [0.75, 0.66, 0.22],
  pumpkin: [0.98, 0.34, 0.025],
  watermelon: [0.07, 0.32, 0.1],
  radish: [0.85, 0.08, 0.2],
  beetroot: [0.38, 0.04, 0.12],
  wheat: [0.78, 0.57, 0.16],
  rice: [0.82, 0.74, 0.43],
  canola: [0.16, 0.12, 0.05],
  sunflower: [0.12, 0.1, 0.065]
};
export const HARVEST_PRODUCE_IDS = Object.freeze(Object.keys(colors));

/** One procedural recipe shared by held feedback and persistent warehouse cargo. */
export function buildHarvestProduce(root: Entity, id: string, count: number, piece: ProducePiece): void {
  const c = colors[id];
  if (!c) throw new Error(`Unsupported harvest product: ${id}`);
  const green = [0.16, 0.38, 0.055];
  if (id === "wheat") {
    piece("wheat sheaf", [0, 0, 0], [1, 1, 1], [1, 1, 1]);
  } else if (id === "rice") {
    for (let stem = 0; stem < 3; stem++) {
      piece("straw", [stem * 0.015 - 0.015, 0, 0], [0.005, 0.13, 0.005], c);
      for (let i = 0; i < 6; i++)
        piece(
          "grain",
          [stem * 0.015 - 0.015 + (i % 2 ? -0.009 : 0.009), 0, 0.015 + i * 0.012],
          [0.014, 0.023, 0.012],
          c
        );
    }
  } else if (id === "canola" || id === "sunflower") {
    piece("seed pouch", [0, 0, -0.006], [0.1, 0.018, 0.085], [0.56, 0.4, 0.2]);
    for (let i = 0; i < 18; i++)
      piece(
        "seed",
        [((i % 6) - 2.5) * 0.013, (Math.floor(i / 6) - 1) * 0.02, 0.005],
        id === "canola" ? [0.009, 0.009, 0.009] : [0.008, 0.02, 0.01],
        c
      );
  } else if (id === "grapevine") {
    for (let i = 0; i < 12; i++)
      piece(
        "grape",
        [((i % 3) - 1) * 0.028, ((Math.floor(i / 3) % 2) - 0.5) * 0.03, Math.floor(i / 3) * 0.021],
        [0.04, 0.04, 0.04],
        c
      );
    piece("stem", [0, 0, 0.08], [0.005, 0.045, 0.005], green);
  } else if (id === "carrot" || id === "radish" || id === "beetroot") {
    const body = root.createChild("root vegetable");
    const vegetable = piece(
      "root",
      [0, 0, 0],
      id === "carrot" ? [0.047, 0.17, 0.047] : [0.08, 0.115, 0.075],
      c,
      0,
      id === "carrot"
    );
    body.addChild(vegetable);
    for (let i = 0; i < 3; i++) body.addChild(piece("leaf", [(i - 1) * 0.012, 0, 0.09], [0.014, 0.07, 0.009], green));
    body.transform.setRotation(0, 58, 12);
  } else if (id === "potato") {
    for (let i = 0; i < count; i++)
      piece("tuber", [(i - (count - 1) / 2) * 0.052, 0, 0], [0.073, 0.06, 0.048], c, i * 0.075);
  } else if (id === "pumpkin") {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      piece("pumpkin lobe", [Math.cos(a) * 0.033, Math.sin(a) * 0.033, 0], [0.098, 0.115, 0.098], c);
    }
    piece("stalk", [0, 0, 0.062], [0.015, 0.028, 0.015], green);
  } else if (id === "cabbage") {
    piece("cabbage heart", [0, 0, 0], [0.15, 0.13, 0.15], c);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      piece(
        "folded leaf",
        [Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.015],
        [0.1, 0.095, 0.1],
        [0.26 + i * 0.025, 0.48 + i * 0.02, 0.12]
      );
    }
  } else {
    const size = id === "watermelon" ? [0.19, 0.13, 0.14] : id === "melon" ? [0.14, 0.13, 0.14] : [0.1, 0.085, 0.1];
    piece("fruit", [0, 0, 0], size, c);
    if (id === "watermelon")
      for (let i = 0; i < 5; i++)
        piece("rind stripe", [(i - 2) * 0.023, 0, 0.006], [0.011, 0.133, 0.139], [0.18, 0.46, 0.08]);
    if (id === "tomato")
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        piece("calyx", [Math.cos(a) * 0.012, Math.sin(a) * 0.012, 0.04], [0.035, 0.006, 0.013], green);
      }
  }
}
