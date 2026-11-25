import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { templateBaseSeed } from "../WorldTemplateCatalog";
import type { WorldTemplateArtDirection } from "../WorldTemplateArtDirection";
import type { TemplateNode } from "../WorldTemplateGeometry";
import type { TemplateProceduralPlantInstance } from "../WorldTemplateVegetation";

const asset = (file: string) => new URL(`../../assets/low-poly/${file}`, import.meta.url).href;

const cottage = asset("cottage.glb");
const barn = asset("barn.glb");
const oak = asset("oak.glb");
const pine = asset("pine.glb");
const westArch = asset("arch-west.glb");
const eastArch = asset("arch-east.glb");
const wheat = asset("wheat.glb");
const greens = asset("greens.glb");
const boulder = asset("boulder.glb");
const mountain = asset("mountain.glb");
const mountainBlue = asset("mountain-blue.glb");
const NON_COLLIDING_ASSETS = new Set([oak, pine, wheat, greens, westArch, eastArch]);
const treeSpecies = new Map([
  [oak, "oak"],
  [pine, "pine"]
]);

function model(
  id: string,
  assetUrl: string,
  x: number,
  z: number,
  scale: TemplateNode["scale"],
  yaw = 0,
  footprint?: TemplateNode["footprint"],
  assetGroundY?: number,
  collision?: boolean
): TemplateNode {
  const explicitCollision = collision ?? (NON_COLLIDING_ASSETS.has(assetUrl) ? false : undefined);
  const species = treeSpecies.get(assetUrl);
  return {
    id,
    assetUrl,
    ...(species && { vegetation: { kind: "tree" as const, assetId: species, vertexColorParts: true } }),
    position: [x, 0, z],
    scale,
    rotation: [0, yaw, 0],
    grounded: true,
    footprint,
    ...(assetGroundY === undefined ? {} : { assetGroundY }),
    ...(explicitCollision === undefined ? {} : { collision: explicitCollision }),
    ...(assetUrl === mountain || assetUrl === mountainBlue ? { stretchToEnvelope: true } : {})
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointToSegmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 1e-6) return Math.hypot(px - ax, pz - az);
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / lenSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

const BASE_SURROUNDING_MOUNTAINS: readonly [number, number, number, number, number, number][] = [
  [-227, 230, 166, 88, 102, 8],
  [-158, 307, 187, 108, 120, -21],
  [-74, 339, 152, 114, 101, 16],
  [92, 343, 179, 116, 103, 12],
  [178, 311, 187, 94, 100, -18],
  [246, 247, 160, 82, 112, 23],
  [-299, 163, 150, 72, 94, -12],
  [306, 167, 153, 78, 103, 17],
  [-325, 23, 135, 66, 106, 31],
  [328, 24, 129, 66, 105, -22],
  [-308, -118, 160, 78, 112, -12],
  [310, -130, 158, 76, 108, 14],
  [-217, -263, 164, 88, 105, -27],
  [202, -273, 171, 84, 113, 24],
  [-65, -318, 189, 87, 112, 19],
  [78, -329, 163, 93, 105, -18]
];

const BASE_RIDGE_PINES: readonly [number, number, number][] = [
  [-37, 32, 10],
  [-29, 38, 9],
  [-38, 46, 12],
  [-21, 47, 12],
  [-12, 48, 11],
  [-5, 52, 12],
  [5, 49, 11],
  [15, 48, 12],
  [24, 46, 11],
  [34, 50, 12],
  [43, 45, 13],
  [48, 36, 10],
  [-54, 58, 12],
  [-46, 65, 13],
  [-30, 61, 11],
  [-24, 73, 13],
  [-16, 66, 11],
  [-6, 74, 12],
  [8, 72, 12],
  [18, 65, 11],
  [32, 69, 13],
  [49, 65, 12],
  [57, 53, 11],
  [-68, 84, 12],
  [-52, 93, 11],
  [-36, 89, 12],
  [31, 87, 13],
  [49, 93, 11],
  [62, 76, 13],
  [-32, 48, 17],
  [-25, 55, 16],
  [-16, 56, 17],
  [-9, 58, 15],
  [-1, 61, 16],
  [7, 57, 15],
  [15, 59, 17],
  [23, 55, 15],
  [31, 58, 17],
  [39, 57, 16],
  [46, 57, 17],
  [-44, 73, 16],
  [-36, 77, 14],
  [-28, 84, 16],
  [-19, 78, 15],
  [-11, 86, 17],
  [-3, 81, 15],
  [6, 88, 16],
  [14, 82, 15],
  [22, 78, 16],
  [34, 81, 15],
  [43, 83, 17],
  [-15, 10, 11],
  [-19, 17, 13],
  [-23, 24, 12],
  [-32, 18, 13],
  [-41, 25, 13],
  [-47, 35, 15],
  [37, 2, 11],
  [42, 8, 13],
  [39, 15, 10],
  [47, 16, 14],
  [52, 22, 11],
  [58, 30, 15],
  [-58, 101, 13],
  [-47, 105, 16],
  [-29, 105, 14],
  [-17, 111, 15],
  [2, 105, 14],
  [19, 103, 15],
  [36, 104, 16],
  [54, 105, 14],
  [66, 98, 17],
  [-19, -28, 12],
  [-26, -24, 10],
  [-28, -37, 14],
  [-36, -32, 11],
  [-38, -45, 13],
  [-22, -47, 9],
  [-31, -53, 12],
  [-43, -56, 14],
  [-51, -41, 11],
  [-56, -26, 13],
  [-48, -18, 10],
  [-58, -9, 12],
  [-42, -5, 10],
  [-35, 2, 11],
  [-51, 6, 13],
  [16, -36, 9],
  [24, -39, 12],
  [32, -32, 13],
  [41, -27, 10],
  [46, -35, 14],
  [38, -45, 9],
  [28, -51, 12],
  [49, -53, 12],
  [55, -43, 15],
  [57, -27, 12],
  [45, -17, 12],
  [53, -9, 14],
  [60, -16, 11],
  [61, 1, 13],
  [53, 6, 10],
  [-9, -65, 11],
  [6, -67, 10],
  [-17, -77, 12],
  [2, -83, 13],
  [15, -76, 9],
  [-77, -43, 15],
  [-87, -50, 13],
  [-96, -36, 14],
  [-104, -51, 12],
  [-115, -42, 15],
  [-71, -106, 12],
  [-88, -118, 15],
  [-105, -109, 13],
  [-114, -124, 16],
  [-153, -162, 14],
  [-171, -149, 12],
  [-185, -169, 15],
  [-204, -157, 11],
  [-239, -54, 12],
  [-251, -73, 15],
  [-270, -61, 13],
  [-281, -79, 14],
  [-332, -103, 13],
  [-355, -119, 16],
  [-372, -103, 12],
  [-142, 25, 15],
  [-159, 13, 13],
  [-168, 36, 16],
  [-185, 23, 12],
  [-198, 42, 14],
  [-213, 114, 11],
  [-237, 104, 15],
  [-253, 121, 13],
  [-267, 109, 12],
  [-306, 158, 15],
  [-325, 172, 14],
  [-348, 153, 13],
  [83, -60, 14],
  [97, -52, 11],
  [104, -70, 15],
  [121, -59, 14],
  [134, -73, 12],
  [98, -134, 13],
  [115, -147, 15],
  [128, -125, 11],
  [144, -144, 14],
  [209, -147, 15],
  [228, -162, 14],
  [245, -150, 11],
  [260, -168, 16],
  [322, -80, 13],
  [344, -98, 15],
  [368, -84, 14],
  [96, 38, 13],
  [107, 48, 16],
  [120, 37, 13],
  [134, 53, 15],
  [145, 43, 12],
  [186, 82, 16],
  [201, 93, 13],
  [220, 81, 15],
  [235, 100, 12],
  [274, 141, 12],
  [291, 156, 16],
  [312, 140, 14],
  [-62, -225, 14],
  [-77, -241, 12],
  [-95, -230, 15],
  [-111, -251, 13],
  [46, -269, 13],
  [65, -286, 16],
  [86, -271, 12],
  [106, -295, 15],
  [-180, 201, 14],
  [-199, 218, 16],
  [-217, 203, 12],
  [-249, 254, 15],
  [-268, 269, 13],
  [189, 181, 15],
  [209, 197, 13],
  [228, 182, 16],
  [260, 249, 14],
  [281, 262, 12],
  [-151, 319, 13],
  [-177, 339, 15],
  [174, 333, 14],
  [198, 351, 12],
  [-257, -351, 15],
  [-277, -373, 12],
  [214, -357, 16],
  [235, -379, 13],
  [-241, 337, 16],
  [-258, 353, 13],
  [-275, 341, 15],
  [-287, 361, 12],
  [249, 346, 15],
  [264, 359, 13],
  [280, 346, 17],
  [293, 369, 14]
];

export interface ResolvedLowPolyValley {
  readonly models: TemplateNode[];
  readonly water: NonNullable<WorldTemplateArtDirection["water"]>;
  readonly proceduralPlants: TemplateProceduralPlantInstance[];
  readonly view: {
    readonly spawnOffset: [number, number];
    readonly lookAtOffset: [number, number, number];
    readonly frameFraction: number;
  };
}

/**
 * Deterministically composes a varied Low Poly Valley for a given Seed while guaranteeing
 * that the starting camera view always frames buildings, open meadow grass, stones, and water.
 */
export function resolveLowPolyValley(seed: number): ResolvedLowPolyValley {
  const normalizedSeed = seed >>> 0;
  const rand = (key: string) => settlementRandom(normalizedSeed, `low-poly:v2:${key}`);
  const range = (key: string, min: number, max: number) => min + (max - min) * rand(key);

  // 1. Valley handedness: +1 puts the pond on screen-right & hero homestead on screen-left; -1 mirrors them.
  const pondSide = rand("pond-side") < 0.5 ? 1 : -1;

  // 2. Camera vantage variation: varies continuously from valley lane to homestead rise, always angling across toward the pond & village.
  const spawnX = -pondSide * range("camera:vantage-x", -1.2, 7.6);
  const spawnZ = range("camera:z", -33.5, -26.8);

  // 3. Midground village destination & Stone Arch gateway aligned with the road corridor.
  const vcX = range("village:center-x", -6.5, 6.5);
  const vcZ = range("village:center-z", 32.0, 41.5);
  const vcScale = range("village:center-s", 0.94, 1.07);
  const vcYaw = range("village:center-yaw", -15, 15);

  const archZ = range("arch:z", 1.0, 6.8);
  const archScale = range("arch:scale", 1.0, 1.09);
  const archYaw = range("arch:yaw", -6.5, 6.5);
  const roadAtArchX = vcX * (3.2 / Math.max(20, vcZ - archZ));
  const archX = clamp(roadAtArchX + range("arch:x-offset", -0.45, 0.45), -0.8, 0.8);
  const archRad = (archYaw * Math.PI) / 180;
  const archHalfSpan = 3.5 * archScale;
  const westArchX = archX - archHalfSpan * Math.cos(archRad);
  const westArchZ = archZ + archHalfSpan * Math.sin(archRad);
  const eastArchX = archX + archHalfSpan * Math.cos(archRad);
  const eastArchZ = archZ - archHalfSpan * Math.sin(archRad);

  // Aim camera gently toward the pond side so both the pond and opposite hero cottage stay well inside even narrow frames.
  const lookX = clamp(pondSide * range("camera:look-x", 2.0, 2.9), -2.9, 2.9);
  const lookY = range("camera:look-y", 0.45, 1.2);
  const lookZ = range("camera:look-z", -0.5, 2.0);
  const frameFraction = range("camera:frame", 0.61, 0.71);

  // 4. Seeded organic pond in the foreground/midground on `pondSide` (close to the grassy path bank so full water surface gleams in frame).
  const pondBaseRadius = range("pond:radius", 8.6, 10.6);
  const pondInnerEdgeX = range("pond:inner-x", 4.4, 5.8);
  const pondX = pondSide * (pondInnerEdgeX + pondBaseRadius);
  const pondMinZ = Math.max(-10.5, spawnZ + pondBaseRadius + 13.0);
  const pondMaxZ = Math.min(-1.2, archZ - 1.5);
  const pondZ = pondMinZ < pondMaxZ ? range("pond:z", pondMinZ, pondMaxZ) : -4.5;
  const pondDepth = range("pond:depth", 2.2, 3.0);
  const pondAspectX = range("pond:aspect-x", 0.92, 1.06);
  const pondAspectZ = range("pond:aspect-z", 0.86, 1.08);
  const lobe2Amp = range("pond:lobe2", 0.03, 0.08);
  const lobe2Phase = range("pond:phase2", 0, Math.PI * 2);
  const lobe3Amp = range("pond:lobe3", 0.02, 0.05);
  const lobe3Phase = range("pond:phase3", 0, Math.PI * 2);

  const pondRadiusAtAngle = (theta: number) =>
    pondBaseRadius * (1 + lobe2Amp * Math.cos(2 * theta + lobe2Phase) + lobe3Amp * Math.cos(3 * theta + lobe3Phase));

  const shorelineSteps = 60;
  const pondShoreline: [number, number][] = Array.from({ length: shorelineSteps }, (_, i) => {
    const theta = (i * 2 * Math.PI) / shorelineSteps;
    const r = pondRadiusAtAngle(theta);
    const rawX = pondX - Math.cos(theta) * r * pondAspectX;
    const pz = pondZ + Math.sin(theta) * r * pondAspectZ;
    // Near the arch (z >= -12) the road sine envelope narrows to |x| <= 3.1m; further toward spawn keep >= 6.4m.
    const minBankX = pz < -12.0 ? 6.4 : 4.3;
    const px = pondSide > 0 ? Math.max(minBankX, rawX) : Math.min(-minBankX, rawX);
    return [Number(px.toFixed(3)), Number(pz.toFixed(3))];
  });

  // 5. Foreground Hero Cottage on `-pondSide` (always prominently visible across from the pond).
  const heroScale = range("hero:scale", 0.92, 1.04);
  const heroW = 9.2 * heroScale;
  const heroH = 8.4 * heroScale;
  const heroD = 9.2 * heroScale;
  const heroX = -pondSide * range("hero:x", 11.2, 13.8);
  const heroMinZ = Math.max(-9.5, spawnZ + 21.0);
  const heroZ = range("hero:z", heroMinZ, Math.max(heroMinZ + 0.5, -2.5));
  const heroYaw = -pondSide * range("hero:yaw", -30, -10);

  // Flanking village cottages (`village-west` and `village-east`) forming an alpine hamlet around `village-cottage`.
  const vwScale = range("vw:scale", 0.92, 1.05);
  const vwX = vcX - range("vw:dx", 13.2, 17.6);
  const vwZ = vcZ + range("vw:dz", -4.0, 5.0);
  const vwYaw = range("vw:yaw", 6, 22);

  const veScale = range("ve:scale", 0.94, 1.06);
  const veX = vcX + range("ve:dx", 13.2, 17.6);
  const veZ = vcZ + range("ve:dz", -4.5, 4.5);
  const veYaw = range("ve:yaw", -22, -6);

  // Farmstead (`farm-barn` + wheat & greens) tucked visibly in the outer midground valley flank.
  const barnSide = rand("barn:side") < 0.65 ? pondSide : -pondSide;
  const barnScale = range("barn:scale", 0.92, 1.05);
  const barnX = barnSide * range("barn:x", 27.5, 35.5);
  const barnZ = range("barn:z", 21.5, 27.5);
  const barnYaw = -barnSide * range("barn:yaw", 10, 24);

  const cropSide = -barnSide;
  const cropBaseX = cropSide * range("crop:x", 19.5, 24.0);
  const cropBaseZ = range("crop:z", 19.5, 24.0);
  const cropYaw = range("crop:yaw", -14, 14);
  const wheatWestPos: [number, number] = [cropBaseX, cropBaseZ];
  const wheatEastPos: [number, number] = [cropBaseX + cropSide * 7.2, cropBaseZ - 0.8];
  const greensPos: [number, number] = [cropBaseX + cropSide * 14.6, cropBaseZ + 0.6];

  // Track occupied discs so stones, trees, and flowers never overlap buildings, crops, pond, road, or camera.
  const occupied: { x: number; z: number; r: number }[] = [
    { x: spawnX, z: spawnZ, r: 5.5 },
    { x: westArchX, z: westArchZ, r: 1.8 },
    { x: eastArchX, z: eastArchZ, r: 1.8 },
    { x: heroX, z: heroZ, r: Math.hypot(heroW, heroD) * 0.5 + 0.8 },
    { x: vcX, z: vcZ, r: Math.hypot(9.8 * vcScale, 8.8 * vcScale) * 0.5 + 0.8 },
    { x: vwX, z: vwZ, r: Math.hypot(9.4 * vwScale, 8.5 * vwScale) * 0.5 + 0.8 },
    { x: veX, z: veZ, r: Math.hypot(9.8 * veScale, 8.8 * veScale) * 0.5 + 0.8 },
    { x: barnX, z: barnZ, r: Math.hypot(13 * barnScale, 10 * barnScale) * 0.5 + 0.8 },
    { x: wheatWestPos[0], z: wheatWestPos[1], r: 5.0 },
    { x: wheatEastPos[0], z: wheatEastPos[1], r: 5.0 },
    { x: greensPos[0], z: greensPos[1], r: 5.4 }
  ];

  const insidePond = (x: number, z: number, margin: number) => {
    // Exact check against every shoreline vertex & segment plus interior test, so clamped edges never mismatch.
    let inside = false;
    for (let i = 0, j = pondShoreline.length - 1; i < pondShoreline.length; j = i++) {
      const [xi, zi] = pondShoreline[i];
      const [xj, zj] = pondShoreline[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
      if (pointToSegmentDistance(x, z, xi, zi, xj, zj) < margin) return true;
    }
    return inside;
  };

  const inRoadCorridor = (x: number, z: number, margin: number) => {
    if (z <= archZ + 1.5) return Math.abs(x) < 6.2 + margin;
    return pointToSegmentDistance(x, z, 0, archZ - 2.5, vcX, vcZ - 5.5) < 3.6 + margin;
  };

  const inSightlineCorridor = (x: number, z: number, margin: number) =>
    pointToSegmentDistance(x, z, spawnX, spawnZ, archX, archZ) < 5.2 + margin ||
    pointToSegmentDistance(x, z, spawnX, spawnZ, heroX, heroZ) < 4.6 + margin ||
    pointToSegmentDistance(x, z, spawnX, spawnZ, pondX - pondSide * pondBaseRadius * 0.35, pondZ) < 5.0 + margin;

  const isClear = (x: number, z: number, r: number, checkSightline = false) => {
    if (inRoadCorridor(x, z, r)) return false;
    if (insidePond(x, z, r + 1.1)) return false;
    if (checkSightline && inSightlineCorridor(x, z, r)) return false;
    for (const item of occupied) {
      if (Math.hypot(x - item.x, z - item.z) < r + item.r) return false;
    }
    return true;
  };

  // Resolve a guaranteed-clear position by stepping away from obstacles; falls back to an open outer meadow ring.
  const resolveClearSpot = (
    baseX: number,
    baseZ: number,
    r: number,
    stepX: number,
    stepZ: number,
    checkSightline: boolean
  ): [number, number] => {
    let px = baseX;
    let pz = baseZ;
    for (let attempt = 0; attempt < 36; attempt++) {
      if (isClear(px, pz, r, checkSightline)) return [px, pz];
      if (insidePond(px, pz, r + 1.1)) {
        const vx = px - pondX;
        const vz = pz - pondZ;
        const vLen = Math.hypot(vx, vz) || 1;
        px += (vx / vLen) * 1.8;
        pz += (vz / vLen) * 1.8;
      } else if (inRoadCorridor(px, pz, r)) {
        px += (px >= 0 ? 1 : -1) * 1.6;
        pz += stepZ * 0.5;
      } else {
        px += stepX;
        pz += stepZ;
      }
    }
    // Guaranteed fallback outside pond, road, and buildings.
    const safeSide = baseX >= 0 ? 1 : -1;
    for (let ring = 0; ring < 40; ring++) {
      const candidateX = safeSide * (36 + ring * 2.5);
      const candidateZ = clamp(baseZ + (ring % 2 === 0 ? ring : -ring) * 1.5, -45, 85);
      if (isClear(candidateX, candidateZ, r, checkSightline)) return [candidateX, candidateZ];
    }
    return [safeSide * 80, baseZ];
  };

  // 6. 15 Low-Poly Boulders: foreground meadow stones, pond-bank stones, arch stones, and valley accents.
  const boulders: TemplateNode[] = [];
  const placeBoulder = (index: number, baseX: number, baseZ: number, w: number, stepX: number, stepZ: number) => {
    const r = Math.min(1.1, w * 0.45) * 0.8 + 0.45;
    const [bx, bz] = resolveClearSpot(baseX, baseZ, r, stepX, stepZ, false);
    occupied.push({ x: bx, z: bz, r });
    const yaw = Math.round(range(`boulder:yaw:${index}`, 0, 360));
    boulders.push(
      model(`valley-boulder-${index}`, boulder, bx, bz, [w, w * 0.72, w * 0.88], yaw, [
        Math.min(1.1, w * 0.45),
        Math.min(1.1, w * 0.45)
      ])
    );
  };

  // 4 foreground meadow boulders (guaranteed in the lower-to-mid camera view on both sides of the path).
  placeBoulder(
    1,
    -pondSide * range("b1:x", 7.4, 10.2),
    spawnZ + range("b1:dz", 10.0, 14.0),
    range("b1:w", 1.6, 2.5),
    -pondSide * 1.1,
    -0.8
  );
  placeBoulder(
    2,
    pondSide * range("b2:x", 6.8, 9.2),
    Math.min(pondZ - pondBaseRadius * pondAspectZ - 2.4, spawnZ + range("b2:dz", 9.5, 13.0)),
    range("b2:w", 1.15, 1.65),
    pondSide * 1.1,
    -1.0
  );
  placeBoulder(
    3,
    -pondSide * range("b3:x", 8.6, 12.4),
    spawnZ + range("b3:dz", 14.5, 18.5),
    range("b3:w", 1.25, 1.95),
    -pondSide * 1.1,
    0.9
  );
  placeBoulder(
    4,
    pondSide * range("b4:x", 10.2, 14.2),
    Math.min(pondZ - pondBaseRadius * pondAspectZ - 2.2, spawnZ + range("b4:dz", 11.5, 15.0)),
    range("b4:w", 1.3, 2.1),
    pondSide * 1.2,
    -1.0
  );

  // 5 pond-bank boulders placed along the front (-Z), outer, and back (+Z) rim of `valley-pond`, stepping radially outward.
  const bankOffsets: readonly [number, number][] = [
    [-0.35, -1.0],
    [0.25, -1.0],
    [0.85, -0.55],
    [1.0, 0.2],
    [0.35, 1.0]
  ];
  for (let i = 0; i < 5; i++) {
    const [dirSide, dirZ] = bankOffsets[i];
    const dirX = pondSide * dirSide + range(`bank-boulder:jx:${i}`, -0.15, 0.15);
    const dzRaw = dirZ + range(`bank-boulder:jz:${i}`, -0.15, 0.15);
    const norm = Math.hypot(dirX, dzRaw) || 1;
    const ux = dirX / norm;
    const uz = dzRaw / norm;
    const theta = Math.atan2(uz, -ux);
    const shoreR = pondRadiusAtAngle(theta) + range(`bank-boulder:dr:${i}`, 1.8, 2.9);
    const bx = pondX + ux * shoreR * pondAspectX;
    const bz = pondZ + uz * shoreR * pondAspectZ;
    placeBoulder(5 + i, bx, bz, range(`bank-boulder:w:${i}`, 1.35, 2.35), ux * 1.5, uz * 1.5);
  }

  // 2 arch-flanking boulders & 4 valley accent boulders.
  placeBoulder(
    10,
    westArchX - range("b10:dx", 2.3, 3.5),
    westArchZ + range("b10:dz", -1.4, 1.4),
    range("b10:w", 1.6, 2.3),
    -1.0,
    0.4
  );
  placeBoulder(
    11,
    eastArchX + range("b11:dx", 2.3, 3.5),
    eastArchZ + range("b11:dz", -1.4, 1.4),
    range("b11:w", 1.5, 2.2),
    1.0,
    0.4
  );
  placeBoulder(
    12,
    heroX - pondSide * range("b12:dx", 5.5, 7.8),
    heroZ + range("b12:dz", -4.5, -1.5),
    range("b12:w", 1.8, 2.6),
    -pondSide * 1.0,
    -0.8
  );
  placeBoulder(
    13,
    -pondSide * range("b13:x", 21, 27),
    range("b13:z", 24, 32),
    range("b13:w", 2.0, 2.9),
    -pondSide * 1.1,
    1.0
  );
  placeBoulder(
    14,
    pondSide * range("b14:x", 29, 36),
    pondZ + range("b14:dz", 7, 13),
    range("b14:w", 1.9, 2.7),
    pondSide * 1.1,
    1.0
  );
  placeBoulder(
    15,
    barnX + barnSide * range("b15:dx", 8, 12),
    barnZ + range("b15:dz", 3, 8),
    range("b15:w", 2.2, 3.2),
    barnSide * 1.2,
    1.0
  );

  // 7. Framing Oaks & Shore Pines (placed outside sightline corridors so buildings & pond stay unobstructed).
  const placeTree = (
    id: string,
    treeAsset: string,
    baseX: number,
    baseZ: number,
    scale: [number, number, number],
    yaw: number,
    fp: [number, number],
    pushX: number,
    pushZ: number
  ): TemplateNode => {
    const r = Math.hypot(fp[0], fp[1]) * 0.5 + 0.9;
    const [tx, tz] = resolveClearSpot(baseX, baseZ, r, pushX, pushZ, true);
    occupied.push({ x: tx, z: tz, r });
    return model(id, treeAsset, tx, tz, scale, yaw, fp);
  };

  const fgOakSize = range("fg-oak:s", 9.8, 12.2);
  const fgOak = placeTree(
    "foreground-oak",
    oak,
    heroX - pondSide * range("fg-oak:dx", 6.2, 9.0),
    heroZ - range("fg-oak:dz", 6.0, 10.5),
    [fgOakSize, fgOakSize, fgOakSize],
    range("fg-oak:yaw", -35, 35),
    [1.2, 1.2],
    -pondSide * 1.4,
    -0.6
  );
  const cottagePineH = range("cottage-pine:h", 9.5, 12.5);
  const cottagePine = placeTree(
    "cottage-pine",
    pine,
    heroX - pondSide * range("cottage-pine:dx", 6.8, 10.2),
    heroZ + range("cottage-pine:dz", 2.0, 6.5),
    [cottagePineH * 0.52, cottagePineH, cottagePineH * 0.52],
    range("cottage-pine:yaw", 0, 360),
    [1, 1],
    -pondSide * 1.4,
    0.8
  );

  // Pines & oak framing the back/outer bank of `valley-pond` (reflecting in the water without blocking it).
  const pondOuterX = pondX + pondSide * (pondBaseRadius + range("shore-pine:dx", 2.4, 4.8));
  const pondBackZ = pondZ + pondBaseRadius * pondAspectZ + range("shore-pine:dz", 2.2, 5.2);
  const sp1H = range("sp1:h", 10.5, 13.5);
  const shorePine = placeTree(
    "shore-pine",
    pine,
    pondOuterX,
    pondBackZ,
    [sp1H * 0.52, sp1H, sp1H * 0.52],
    range("sp1:yaw", 0, 360),
    [1, 1],
    pondSide * 1.3,
    1.1
  );
  const sp2H = range("sp2:h", 11.2, 14.2);
  const shorePineEast = placeTree(
    "shore-pine-east",
    pine,
    pondOuterX + pondSide * range("sp2:dx", 3.5, 6.0),
    pondBackZ - range("sp2:dz", 1.5, 4.5),
    [sp2H * 0.52, sp2H, sp2H * 0.52],
    range("sp2:yaw", 0, 360),
    [1, 1],
    pondSide * 1.4,
    0.8
  );
  const sp3H = range("sp3:h", 9.6, 12.2);
  const shorePineBack = placeTree(
    "shore-pine-back",
    pine,
    pondX + pondSide * range("sp3:dx", -2.5, 2.5),
    pondBackZ + range("sp3:dz", 2.5, 5.5),
    [sp3H * 0.52, sp3H, sp3H * 0.52],
    range("sp3:yaw", 0, 360),
    [1, 1],
    pondSide * 1.0,
    1.4
  );

  const vOakS = range("voak:s", 6.8, 8.6);
  const villageOak = placeTree(
    "village-oak",
    oak,
    -pondSide * range("voak:x", 9.5, 14.5),
    archZ + range("voak:dz", 9.5, 15.5),
    [vOakS, vOakS * 0.9, vOakS],
    range("voak:yaw", -45, 45),
    [1, 1],
    -pondSide * 1.4,
    1.0
  );
  const bOakS = range("boak:s", 8.0, 10.2);
  const barnOak = placeTree(
    "barn-oak",
    oak,
    barnX + barnSide * range("boak:dx", 8.5, 12.5),
    barnZ + range("boak:dz", 2.0, 7.0),
    [bOakS, bOakS * 0.9, bOakS],
    range("boak:yaw", 0, 360),
    [1.3, 1.3],
    barnSide * 1.5,
    1.0
  );
  const wgOakS = range("wgoak:s", 9.5, 11.8);
  const westGroveOak = placeTree(
    "west-grove-oak",
    oak,
    -pondSide * range("wgoak:x", 25, 32),
    range("wgoak:z", 20, 29),
    [wgOakS, wgOakS * 0.92, wgOakS * 0.92],
    range("wgoak:yaw", -60, 60),
    [1.4, 1.4],
    -pondSide * 1.5,
    1.0
  );
  const pbOakS = range("pboak:s", 7.6, 9.4);
  const pondBankOak = placeTree(
    "pond-bank-oak",
    oak,
    pondX - pondSide * range("pboak:dx", 1.5, 5.0),
    pondBackZ + range("pboak:dz", 1.8, 4.8),
    [pbOakS, pbOakS * 0.88, pbOakS],
    range("pboak:yaw", 0, 360),
    [1.1, 1.1],
    pondSide * 1.2,
    1.4
  );

  // 8. Alpine Foothills & Snow-Capped Mountains: seeded positions, peak heights, and silhouettes.
  const foothills: TemplateNode[] = [
    model(
      "west-green-hill",
      mountainBlue,
      -68 + range("fh1:dx", -16, 16),
      138 + range("fh1:dz", -10, 12),
      [range("fh1:w", 98, 124), range("fh1:h", 31, 48), range("fh1:d", 68, 84)],
      range("fh1:yaw", -32, 32),
      [1, 1]
    ),
    model(
      "arch-blue-peak",
      mountainBlue,
      range("fh2:x", -28, 28),
      186 + range("fh2:dz", -12, 14),
      [range("fh2:w", 102, 132), range("fh2:h", 46, 68), range("fh2:d", 76, 92)],
      range("fh2:yaw", -28, 28),
      [1, 1]
    ),
    model(
      "east-green-hill",
      mountainBlue,
      76 + range("fh3:dx", -16, 16),
      152 + range("fh3:dz", -10, 12),
      [range("fh3:w", 108, 136), range("fh3:h", 33, 50), range("fh3:d", 72, 88)],
      range("fh3:yaw", -32, 32),
      [1, 1]
    )
  ];

  const heroPeaks: TemplateNode[] = [
    model(
      "west-mountain",
      mountain,
      -96 + range("pk1:dx", -20, 20),
      215 + range("pk1:dz", -12, 14),
      [range("pk1:w", 164, 204), range("pk1:h", 74, 112), range("pk1:d", 106, 128)],
      range("pk1:yaw", -28, 28),
      [1, 1]
    ),
    model(
      "center-west-peak",
      mountain,
      range("pk2:x", -34, 28),
      246 + range("pk2:dz", -14, 14),
      [range("pk2:w", 142, 182), range("pk2:h", 82, 122), range("pk2:d", 98, 120)],
      range("pk2:yaw", -28, 28),
      [1, 1]
    ),
    model(
      "east-mountain",
      mountain,
      68 + range("pk3:dx", -22, 22),
      242 + range("pk3:dz", -14, 14),
      [range("pk3:w", 154, 192), range("pk3:h", 84, 124), range("pk3:d", 106, 128)],
      range("pk3:yaw", -28, 28),
      [1, 1]
    ),
    model(
      "far-east-peak",
      mountain,
      162 + range("pk4:dx", -18, 18),
      232 + range("pk4:dz", -12, 12),
      [range("pk4:w", 160, 194), range("pk4:h", 78, 112), range("pk4:d", 106, 126)],
      range("pk4:yaw", -28, 28),
      [1, 1]
    ),
    model(
      "far-mountain",
      mountain,
      range("pk5:x", -26, 26),
      326 + range("pk5:dz", -10, 10),
      [range("pk5:w", 176, 212), range("pk5:h", 82, 118), range("pk5:d", 114, 134)],
      range("pk5:yaw", -35, 35),
      [1, 1]
    )
  ];

  // Outer 360° horizon peaks keep their safe horizontal envelope while varying summit height & yaw per Seed.
  const surroundingMountains = BASE_SURROUNDING_MOUNTAINS.map(([bx, bz, bw, bh, bd, byaw], i) => {
    const w = bw * range(`sm:w:${i}`, 0.86, 1.02);
    const h = bh * range(`sm:h:${i}`, 0.74, 1.3);
    const d = bd * range(`sm:d:${i}`, 0.88, 1.02);
    const yaw = byaw + range(`sm:yaw:${i}`, -14, 14);
    return model(`surrounding-mountain-${i + 1}`, mountain, bx, bz, [w, h, d], yaw, [1, 1]);
  });

  // 9. Valley & Ridge Pine Groves: near-valley pines shift & vary in height while keeping sightlines clear.
  const ridgePines = BASE_RIDGE_PINES.map(([bx, bz, bh], i) => {
    const nearValley = Math.hypot(bx, bz) < 120;
    const h = bh * range(`rp:h:${i}`, 0.78, 1.26);
    const yaw = Math.round(range(`rp:yaw:${i}`, 0, 360));
    let px = nearValley ? bx * pondSide + range(`rp:dx:${i}`, -4.2, 4.2) : bx;
    let pz = nearValley ? bz + range(`rp:dz:${i}`, -4.0, 4.0) : bz;
    if (nearValley) {
      const pushDirX = px >= 0 ? 1.8 : -1.8;
      const pushDirZ = pz >= archZ ? 1.8 : -1.8;
      [px, pz] = resolveClearSpot(px, pz, 1.5, pushDirX, pushDirZ, true);
      occupied.push({ x: px, z: pz, r: 1.4 });
    }
    return model(`ridge-pine-${i + 1}`, pine, px, pz, [h * 0.54, h, h * 0.54], yaw, [1, 1]);
  });

  // 10. 22 Seeded Meadow Wildflower Sprigs along both grassy path verges & foreground stones.
  const proceduralPlants: TemplateProceduralPlantInstance[] = Array.from({ length: 22 }, (_, i) => {
    const side = i < 11 ? -1 : 1;
    const idx = i % 11;
    const t = idx / 10;
    const zMin = spawnZ + 4.5;
    const zMax = archZ - 2.5;
    let fx = side * range(`fl:x:${i}`, 5.8, 9.4);
    let fz = zMin + (zMax - zMin) * t + range(`fl:dz:${i}`, -1.1, 1.1);
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!insidePond(fx, fz, 0.8) && !inRoadCorridor(fx, fz, -0.6)) break;
      fx += side * 1.1;
      fz -= 0.6;
    }
    return {
      id: `roadside-white-flower-${i + 1}`,
      kind: "meadow-flower" as const,
      x: Number(fx.toFixed(2)),
      z: Number(fz.toFixed(2)),
      heightM: Number(range(`fl:h:${i}`, 0.25, 0.33).toFixed(2)),
      yawDegrees: Math.round(range(`fl:yaw:${i}`, 0, 360)),
      variant: i % 4,
      spreadScale: Number(range(`fl:s:${i}`, 0.98, 1.1).toFixed(2))
    };
  });

  const models: TemplateNode[] = [
    model(
      "stone-arch-west",
      westArch,
      westArchX,
      westArchZ,
      [8 * archScale, 6 * archScale, 1.7 * archScale],
      archYaw,
      [1.6, 1.7],
      0
    ),
    model(
      "stone-arch-east",
      eastArch,
      eastArchX,
      eastArchZ,
      [8 * archScale, 6 * archScale, 1.7 * archScale],
      archYaw,
      [1.6, 1.7],
      0
    ),
    model("lakeside-cottage", cottage, heroX, heroZ, [heroW, heroH, heroD], heroYaw),
    model("village-cottage", cottage, vcX, vcZ, [9.8 * vcScale, 8.2 * vcScale, 8.8 * vcScale], vcYaw),
    model("village-west", cottage, vwX, vwZ, [9.4 * vwScale, 7.9 * vwScale, 8.5 * vwScale], vwYaw),
    model("village-east", cottage, veX, veZ, [9.8 * veScale, 8.2 * veScale, 8.8 * veScale], veYaw),
    model("farm-barn", barn, barnX, barnZ, [13 * barnScale, 9.5 * barnScale, 10 * barnScale], barnYaw),
    fgOak,
    cottagePine,
    shorePine,
    shorePineEast,
    shorePineBack,
    villageOak,
    barnOak,
    westGroveOak,
    pondBankOak,
    model("wheat-west", wheat, wheatWestPos[0], wheatWestPos[1], [5.5, 1.75, 7.6], cropYaw + 74),
    model("wheat-east", wheat, wheatEastPos[0], wheatEastPos[1], [5.5, 1.75, 7.6], cropYaw - 14),
    model("vegetable-garden", greens, greensPos[0], greensPos[1], [5.5, 1.65, 8.5], cropYaw - 10),
    ...foothills,
    ...heroPeaks,
    ...surroundingMountains,
    ...boulders,
    ...ridgePines
  ];

  return {
    models,
    water: [
      {
        id: "valley-pond",
        x: pondX,
        z: pondZ,
        radius: pondBaseRadius,
        depth: pondDepth,
        depthTintDistanceM: 0.42,
        color: [38, 145, 168],
        shoreline: pondShoreline
      }
    ],
    proceduralPlants,
    view: {
      spawnOffset: [Number(spawnX.toFixed(3)), Number(spawnZ.toFixed(3))],
      lookAtOffset: [Number(lookX.toFixed(3)), Number(lookY.toFixed(3)), Number(lookZ.toFixed(3))],
      frameFraction: Number(frameFraction.toFixed(3))
    }
  };
}

const DEFAULT_LOW_POLY_VALLEY = resolveLowPolyValley(templateBaseSeed("low-poly"));

/** The valley's layout is in screen space: positive X is right and positive Z is away from the viewer. */
export const LOW_POLY_VALLEY: WorldTemplateArtDirection = {
  reference: "Stone Arch Valley",
  modelLayout: "authored",
  centeredStart: true,
  sharedVertexColorMaterial: "Low Poly vertex colors",
  spawnOffset: DEFAULT_LOW_POLY_VALLEY.view.spawnOffset,
  focus: ["stone-arch-west", "stone-arch-east"],
  frameFraction: DEFAULT_LOW_POLY_VALLEY.view.frameFraction,
  azimuthDegrees: 0,
  lookAtOffset: DEFAULT_LOW_POLY_VALLEY.view.lookAtOffset,
  initialPlanning: {
    landMode: "continuous",
    poiMemberMax: 0,
    wayfinding: { routeCoverage: 0 },
    relief: { reliefNearAmplitudeM: 0.12, reliefAmplitudeM: 0.85, reliefFarAmplitudeM: 18, reliefScaleM: 260 },
    population: { villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 0 }
  },
  generation: {
    enabled: true,
    widthM: 120,
    frontDepthM: 52,
    backDepthM: 66,
    roadWidthM: 4.4,
    roadEndWidthRatio: 0.69,
    roadBendM: 3.7,
    roadWavelengthM: 62,
    destinationId: "village-cottage",
    replacePopulation: true
  },
  models: DEFAULT_LOW_POLY_VALLEY.models,
  water: DEFAULT_LOW_POLY_VALLEY.water,
  proceduralPlants: DEFAULT_LOW_POLY_VALLEY.proceduralPlants,
  resolveModels: (seed) => resolveLowPolyValley(seed).models,
  resolveWater: (seed) => resolveLowPolyValley(seed).water,
  resolveProceduralPlants: (seed) => resolveLowPolyValley(seed).proceduralPlants,
  resolveView: (seed) => resolveLowPolyValley(seed).view,
  grass: ["#2f6e1e", "#98cc32"],
  ground: "#69a434",
  road: "#c97d39",
  foliage: "#6cb322",
  bark: "#57381e",
  flowers: "#ffffff",
  stone: "#beb7ab",
  plantPalette: {
    layers: ["flowers"],
    parts: {
      petals: { color: "#ffffff", intensity: 1.6 },
      stem: { color: "#549423", intensity: 1.0 },
      foliage: { color: "#549423", intensity: 1.0 }
    }
  },
  surfaceTextures: {
    baseUrl: new URL("../../assets/low-poly/meadow-blocks.jpg", import.meta.url).href,
    tileSizeM: 43,
    strength: 0
  },
  grassGroundFusion: false,
  landscape: {
    grassRelativeHeight: 0.22,
    density: 0,
    companionStoneDensity: 0,
    "vegetation.trees": 0,
    "vegetation.shrubs": 0
  },
  initialLandscape: {
    "vegetation.grass": 0.78,
    "vegetation.flowers": 0.35
  },
  flowerCoverage: 0.24,
  weather: {
    cloudCoverage: 0.3,
    cloudBaseAltitudeM: 940,
    cloudThicknessM: 300,
    cloudFeatureSize: 0.5,
    cloudDensityMultiplier: 1.32,
    cloudEnvelopeScale: 0.43,
    cloudTopDensityMultiplier: 0.36,
    cloudDetailNoiseMultiplier: 1.35,
    cloudAmbientFloor: 0.48,
    rainRate: 0,
    snowRate: 0,
    temperatureCelsius: 22,
    relativeHumidity: 0.3
  },
  lighting: {
    timeHours: 14.8,
    northOffsetDegrees: 211,
    sunIntensity: 2.48,
    ambientIntensity: 1.38,
    iblIntensity: 1.1,
    sunColorR: 1.0,
    sunColorG: 0.96,
    sunColorB: 0.88,
    atmosphereThickness: 0.74,
    skyExposure: 0.8,
    skyTintR: 0.214,
    skyTintG: 0.214,
    skyTintB: 0.214,
    customSkyTintStrength: 0.94,
    customSkyZenithR: 0.2,
    customSkyZenithG: 0.7,
    customSkyZenithB: 1.34,
    customSkyHorizonR: 0.5,
    customSkyHorizonG: 1.02,
    customSkyHorizonB: 1.44,
    groundTintR: 0.27,
    groundTintG: 0.45,
    groundTintB: 0.65,
    fogDensity: 0.0005,
    fogExponent: 1.6,
    fogRadianceIntensity: 0.65,
    fogTintR: 0.75,
    fogTintG: 0.88,
    fogTintB: 1.0,
    direct: true,
    environment: true,
    shadows: true,
    shadowStrength: 0.75,
    fog: true
  },
  postProcess: {
    enabled: true,
    tonemapping: true,
    postExposure: 0.44,
    temperature: 4,
    contrast: 13,
    saturation: 11,
    bloom: true,
    bloomThreshold: 0.96,
    bloomIntensity: 0.16,
    bloomScatter: 0.6
  }
};
