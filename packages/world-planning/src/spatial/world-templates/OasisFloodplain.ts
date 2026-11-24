import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { templateBaseSeed } from "../WorldTemplateCatalog";
import type { WorldTemplateArtDirection } from "../WorldTemplateArtDirection";
import type { TemplateProceduralPlantInstance } from "../runtime/TemplateProceduralPlants";

type Point = [number, number];

// Left cove shore -> open S-curved dry sandbar ridge leading directly onto the flower peninsula -> sheltered right cove -> right bank.
export const OASIS_SHORELINE: Point[] = [
  // Left cove outer & front rim (wrapping behind the foreground leaning snag at x = -23, z = -28)
  [-56, -24],
  [-48, -30],
  [-38, -31],
  [-29, -26],
  // West edge of the dry sandbar ridge & flower peninsula (continuous golden sandbar ridge!)
  [-23.5, -19.5],
  [-22.8, -13.0],
  [-26.8, -7.8],
  [-30.6, -3.4],
  [-30.2, 2.0],
  // North/back shore of the flower peninsula (wide water channel behind the tree)
  [-24.0, 5.6],
  [-14.2, 6.4],
  [-4.5, 5.2],
  [1.2, 1.8],
  // East tip of the flower peninsula & sheltered right cove indenting into the sandbar ridge
  [0.8, -2.6],
  [-4.8, -6.0],
  [-9.8, -10.2],
  [-9.4, -15.2],
  // Right foreground bank stepping down-right while leaving wide dry golden sand in the lower-right foreground!
  [-3.8, -17.6],
  [3.0, -19.8],
  [11.0, -22.2],
  [21.0, -24.8],
  [33.0, -26.8],
  [46.0, -26.0],
  [56.0, -20.0],
  // Far-right & back-right sandy cliff-foot shore + distant canyon river bend through the central gap
  [58.0, -10.0],
  [50.0, 4.0],
  [36.0, 9.5],
  [21.0, 11.2],
  [12.0, 14.0],
  [7.0, 22.0],
  [5.0, 34.0],
  [8.0, 48.0],
  [13.0, 65.0],
  [14.0, 77.0],
  [9.0, 90.0],
  [0.0, 103.0],
  [-8.0, 114.0],
  [-13.0, 116.0],
  [-12.0, 108.0],
  [-5.0, 96.0],
  [2.0, 82.0],
  [3.0, 70.0],
  [-1.0, 56.0],
  [-6.0, 42.0],
  [-8.0, 28.0],
  [-13.0, 20.0],
  [-23.0, 15.0],
  [-37.0, 12.5],
  [-49.0, 8.0],
  [-57.0, 0.0],
  [-60.0, -12.0]
];

// Shallow golden wading sandspit in the right bay (kept well inside the 16:9 viewport at x = 8..24, z = -13.5..-8 so flamingos stay in frame as the second focal point).
export const OASIS_SANDBARS: Point[][] = [
  [
    [8.0, -11.2],
    [10.8, -13.4],
    [16.2, -14.0],
    [21.4, -13.2],
    [23.8, -11.0],
    [21.6, -8.8],
    [16.2, -8.0],
    [10.8, -8.8]
  ]
];

const seed = templateBaseSeed("titan-wasteland:oasis-alluvium");

export const OASIS_BANK_STONES: NonNullable<WorldTemplateArtDirection["stones"]> = [];
export const OASIS_BANK_PLANTS: TemplateProceduralPlantInstance[] = [];

// Left outer cove bank cobbles (leaving the central sandbar ridge x = -24..-10 completely open!).
const leftCoveFans = [
  { x: -45, z: -31.5, radius: 4.2, clast: 1.4 },
  { x: -33, z: -29.0, radius: 3.0, clast: 0.95 }
];
for (const fan of leftCoveFans) {
  const count = Math.ceil(2 * fan.radius);
  for (let i = 0; i < count; i++) {
    const id = `left-cove-fan-${fan.x}-${i}`;
    const sample = (field: string) => settlementRandom(seed, `${id}:${field}`);
    const radial = Math.sqrt(sample("radius"));
    const angle = 2 * Math.PI * sample("bearing");
    const x = fan.x + fan.radius * radial * Math.cos(angle);
    const z = fan.z - fan.radius * 0.5 * (1 + radial * Math.abs(Math.sin(angle)));
    const width = fan.clast * (1.1 - radial * 0.65) * (0.85 + sample("size") * 0.5);
    const height = width * (0.42 + sample("fracture") * 0.25);
    OASIS_BANK_STONES.push({
      id,
      x,
      z,
      width,
      height,
      depth: width * (0.68 + sample("depth") * 0.28),
      y: -height * 0.3,
      yawDegrees: 360 * sample("strike")
    });
  }
}

// Continuous rich belt of silvery-sage bushes & pale talus rocks along BOTH left and right cliff bases (especially the right cliff toe!).
const scrubShelves = [
  { x: -64, z: 11.5, width: 14, depth: 5.5, density: 7 },
  { x: -45, z: 14.5, width: 15, depth: 5.0, density: 9 },
  { x: -30, z: 16.5, width: 10, depth: 4.2, density: 6 },
  { x: 18, z: 14.2, width: 10, depth: 4.2, density: 8 },
  { x: 31, z: 12.8, width: 14, depth: 4.5, density: 11 },
  { x: 46, z: 11.5, width: 15, depth: 5.0, density: 12 }
];
for (const shelf of scrubShelves) {
  for (let i = 0; i < shelf.density; i++) {
    const id = `canyon-scrub-${shelf.x}-${i}`;
    const sample = (field: string) => settlementRandom(seed, `${id}:${field}`);
    const angle = 2 * Math.PI * sample("bearing");
    const radius = Math.sqrt(sample("radius"));
    const x = shelf.x + (Math.cos(angle) * radius * shelf.width) / 2;
    const z = shelf.z + (Math.sin(angle) * radius * shelf.depth) / 2;
    OASIS_BANK_PLANTS.push({
      id,
      kind: "desert-shrub",
      x,
      z,
      heightM: 0.95 + sample("size") * 1.15,
      spreadScale: 1.45 + sample("crown") * 0.55,
      yawDegrees: sample("yaw") * 360
    });
    if (i % 2 === 0) {
      OASIS_BANK_PLANTS.push({
        id: `${id}-grass`,
        kind: i % 4 === 0 ? "plume-grass" : "dry-grass",
        x: x + (sample("gx") - 0.5) * 2.4,
        z: z - 0.8 - sample("gz") * 1.8,
        heightM: 0.45 + sample("gh") * 0.45,
        spreadScale: 1.35,
        yawDegrees: sample("gyaw") * 360
      });
    }
  }
}
