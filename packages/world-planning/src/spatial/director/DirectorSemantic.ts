import type { PlanningScenePart } from "../../semantic-study/WorldPlanningScene";

/** Stable category IDs are data, independent of display colours and POI roles. */
export const DIRECTOR_CATEGORIES = [
  { id: 0, key: "sky", label: "天空", color: "#ffffff" },
  { id: 1, key: "terrain", label: "地表", color: "#d6aa4e" },
  { id: 2, key: "water", label: "水域", color: "#18cadd" },
  { id: 3, key: "vegetation", label: "植被", color: "#40bd58" },
  { id: 4, key: "rock", label: "岩体", color: "#9952d6" },
  { id: 5, key: "building", label: "建筑", color: "#ef8838" },
  { id: 6, key: "unknown", label: "未分类", color: "#ff00ff" }
] as const;
const categories: Record<string, number> = {
  land: 1,
  ocean: 2,
  "surface-water": 2,
  tree: 3,
  rock: 4,
  "landscape-rock": 4,
  building: 5,
  bridge: 5
};
/** Helpers are excluded explicitly; unknown solid kinds remain measurable, never become sky. */
export function directorCategory(part: PlanningScenePart): number | null {
  if (
    part.lines ||
    part.pickOnly ||
    part.selectionOnly ||
    ["spawn", "entrance", "ports", "teleport"].includes(part.layer)
  )
    return null;
  return categories[part.layer] ?? 6;
}
export const DIRECTOR_DEPTH_BANDS = { nearM: 20, middleM: 80, farM: 12000 } as const;
/** Decode a GPU statistics target: class, relationship bits, and 16-bit linear camera depth. */
export function summarizeDirectorPixels(pixels: Uint8Array, width: number, height: number) {
  if (pixels.length !== width * height * 4 || !width || !height) throw Error("诊断像素尺寸不匹配");
  // The engine blit to an offscreen target yields top-left scanlines in this readback.
  const counts = DIRECTOR_CATEGORIES.map(() => 0),
    horizontal = Array.from({ length: 3 }, () => DIRECTOR_CATEGORIES.map(() => 0)),
    depthBands = [0, 0, 0],
    compositionGrid = Array.from({ length: 9 }, () => DIRECTOR_CATEGORIES.map(() => 0));
  let targetProjected = 0,
    targetVisible = 0,
    blocked = 0,
    originVisible = 0,
    raisedTerrain = 0;
  for (let p = 0; p < width * height; p++) {
    const i = p * 4,
      category = pixels[i] <= 6 ? pixels[i] : 6,
      flags = pixels[i + 1];
    counts[category]++;
    // Horizontal director camera: only terrain above the optical horizon contributes to enclosure.
    if (category === 1 && Math.floor(p / width) < height / 2) raisedTerrain++;
    const column = Math.min(2, Math.floor(((p % width) * 3) / width)),
      row = Math.min(2, Math.floor((Math.floor(p / width) * 3) / height));
    compositionGrid[row * 3 + column][category]++;
    horizontal[Math.min(2, Math.floor(((p % width) * 3) / width))][category]++;
    if (flags & 1) targetProjected++;
    if (flags & 2) blocked++;
    if (flags & 4) targetVisible++;
    if (flags & 8) originVisible++;
    if (category) {
      const distance = ((pixels[i + 2] + pixels[i + 3] * 256) / 65535) * DIRECTOR_DEPTH_BANDS.farM;
      depthBands[distance < DIRECTOR_DEPTH_BANDS.nearM ? 0 : distance < DIRECTOR_DEPTH_BANDS.middleM ? 1 : 2]++;
    }
  }
  const total = width * height;
  return {
    categories: Object.fromEntries(DIRECTOR_CATEGORIES.map((c) => [c.key, counts[c.id] / total])),
    solidScreen: (counts[4] + counts[5] + raisedTerrain) / total,
    raisedTerrain: raisedTerrain / total,
    counts,
    pixels: total,
    width,
    height,
    horizontal,
    depthBands,
    compositionGrid,
    skyOpenings: skyOpenings(pixels, width, height),
    targetProjected: targetProjected / total,
    targetVisible: targetVisible / total,
    originVisible: originVisible / total,
    blockedScreen: blocked / total,
    targetOcclusion: targetProjected ? blocked / targetProjected : null,
    depthPolicy: DIRECTOR_DEPTH_BANDS
  };
}
export type DirectorSemanticReport = ReturnType<typeof summarizeDirectorPixels> & {
  frame: number;
  sampledAt: number;
  receivedAt: number;
  position: number[];
  rotation: number[];
};

/** Connected sky apertures, with screen-normalized bounds measured from the top left. */
function skyOpenings(pixels: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  const openings: { pixels: number; area: number; bounds: number[] }[] = [];
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || pixels[start * 4] !== 0) continue;
    let head = 0,
      tail = 1,
      minX = width,
      minY = height,
      maxX = 0,
      maxY = 0;
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const at = queue[head++],
        x = at % width,
        y = Math.floor(at / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const next of [
        x ? at - 1 : -1,
        x + 1 < width ? at + 1 : -1,
        y ? at - width : -1,
        y + 1 < height ? at + width : -1
      ])
        if (next >= 0 && !visited[next] && pixels[next * 4] === 0) {
          visited[next] = 1;
          queue[tail++] = next;
        }
    }
    openings.push({
      pixels: tail,
      area: tail / (width * height),
      bounds: [minX / width, minY / height, (maxX + 1) / width, (maxY + 1) / height]
    });
  }
  return openings.sort((a, b) => b.pixels - a.pixels);
}
