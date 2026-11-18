import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { templateBaseSeed } from "../WorldTemplateCatalog";
import type { WorldTemplateArtDirection } from "../WorldTemplateArtDirection";
import type { TemplateProceduralPlantInstance } from "../runtime/TemplateProceduralPlants";

type Point = [number, number];

// Looking downstream from the overlook. The convex tongue stays open on the way to the flowering island.
const nearBank: Point[] = [
  [-56, -26], [-49, -32], [-40, -35], [-31, -31], [-25, -25], [-21, -19],
  [-16, -15], [-11, -13], [-6, -14], [-1, -18], [4, -24], [10, -29],
  [18, -34], [28, -39], [41, -42], [53, -38], [59, -30]
];

// Both branches and the distant bend share a single level, bed and reflection surface.
export const OASIS_SHORELINE: Point[] = [
  ...nearBank, [61, -17], [56, -4], [46, 5], [33, 9], [19, 11], [12, 14],
  [7, 22], [5, 34], [8, 48], [13, 65], [14, 77], [9, 90], [0, 103], [-8, 114],
  [-13, 116], [-12, 108], [-5, 96], [2, 82], [3, 70], [-1, 56], [-6, 42],
  [-8, 28], [-13, 20], [-22, 15], [-37, 12], [-49, 8], [-57, 0], [-60, -13]
];

// A shallow ford separates the flowering island from the tongue. Birds wade around the second, lower shoal.
export const OASIS_SANDBARS: Point[][] = [
  [[-31, -3], [-27, -6], [-22, -7], [-17, -9], [-13, -10], [-9, -7], [-4, -5], [1, -1],
    [0, 2], [-5, 5], [-13, 7], [-20, 6], [-26, 4], [-30, 1]],
  [[10, -13], [13, -16], [20, -18], [27, -17], [34, -14], [32, -12], [25, -10], [18, -9], [12, -10]]
];

// Deposit radii and clast sizes are in metres. Finer grains collect at the outside of each fan.
const fans = [
  { x: -46, radius: 5, clast: 1.5 }, { x: -31, radius: 3, clast: 0.85 },
  { x: -8, radius: 2.2, clast: 0.6 }, { x: 5, radius: 4, clast: 2.3 },
  { x: 12, radius: 5, clast: 3.8 }, { x: 20, radius: 6, clast: 3.2 }, { x: 33, radius: 5, clast: 2.1 },
  { x: 48, radius: 4, clast: 1.6 }
];
const seed = templateBaseSeed("titan-wasteland:oasis-alluvium");

/** Interpolate the authored bank and step inland along its local normal. */
function onBank(x: number, setback: number): Point {
  const end = nearBank.findIndex((p) => p[0] >= x);
  const [ax, az] = nearBank[end - 1], [bx, bz] = nearBank[end];
  const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
  return [x + dz / length * setback, az + (x - ax) / dx * dz - dx / length * setback];
}

export const OASIS_BANK_STONES: NonNullable<WorldTemplateArtDirection["stones"]> = [];
export const OASIS_BANK_PLANTS: TemplateProceduralPlantInstance[] = [];
for (const fan of fans) {
  // The exposed head of a fan has a few jointed blocks, followed by the sorted fragments below.
  for (let i = 0; i < Math.floor(fan.clast); i++) {
    const id = `alluvial-head-${fan.x}-${i}`;
    const width = fan.clast * (0.95 + settlementRandom(seed, id) * 0.42);
    const [x, z] = onBank(fan.x + (i - (Math.floor(fan.clast) - 1) / 2) * width * 0.76, width * 0.58);
    OASIS_BANK_STONES.push({
      id, x, z, width, depth: width * 0.82, height: width * 0.68, y: -width * 0.14,
      yawDegrees: 360 * settlementRandom(seed, id + ":strike"), collision: false
    });
  }
  const count = Math.ceil(2 * fan.radius);
  for (let i = 0; i < count; i++) {
    const id = `alluvial-fan-${fan.x}-${i}`;
    const sample = (field: string) => settlementRandom(seed, `${id}:${field}`);
    const radial = Math.sqrt(sample("radius"));
    const angle = 2 * Math.PI * sample("bearing");
    const station = fan.x + fan.radius * radial * Math.cos(angle);
    const inland = fan.radius * (1 + radial * Math.sin(angle)) / 2;
    const [x, z] = onBank(station, inland);
    const width = fan.clast * (1.15 - radial) * (0.85 + sample("size"));
    const height = width * (0.36 + sample("fracture") * 0.29);
    OASIS_BANK_STONES.push({
      id, x, z, width, height, depth: width * (0.61 + sample("depth") * 0.35),
      y: -height * 0.22, yawDegrees: 360 * sample("strike"), collision: false
    });
    // Wind seeds settle in the lee of each fan, with taller seed heads at its moist toe.
    const [px, pz] = onBank(station, inland + width);
    OASIS_BANK_PLANTS.push({
      id: `${id}-grass`, kind: inland < fan.radius / 3 ? "plume-grass" : "dry-grass",
      x: px, z: pz, heightM: 0.22 + sample("grass") * 0.39, spreadScale: 1.5, yawDegrees: 360 * sample("yaw")
    });
  }
}

// Pockets of sage take root in the sandy aprons between the cliff toes and the back bank.
const scrubShelves = [
  { x: -68, z: 10, width: 14, depth: 7 }, { x: -43, z: 14, width: 13, depth: 5 },
  { x: -31, z: 16, width: 8, depth: 4 }, { x: 22, z: 16, width: 10, depth: 5 },
  { x: 48, z: 15, width: 16, depth: 7 }, { x: 74, z: 14, width: 18, depth: 8 }
];
for (const shelf of scrubShelves) {
  const count = Math.ceil(shelf.width * shelf.depth / 12);
  for (let i = 0; i < count; i++) {
    const id = `canyon-scrub-${shelf.x}-${i}`;
    const sample = (field: string) => settlementRandom(seed, `${id}:${field}`);
    const angle = 2 * Math.PI * sample("bearing"), radius = Math.sqrt(sample("radius"));
    OASIS_BANK_PLANTS.push({
      id, kind: "desert-shrub", x: shelf.x + Math.cos(angle) * radius * shelf.width / 2,
      z: shelf.z + Math.sin(angle) * radius * shelf.depth / 2, heightM: 0.65 + sample("size") * 0.85,
      spreadScale: 1.55 + sample("crown") * 0.55, yawDegrees: sample("yaw") * 360
    });
  }
}
