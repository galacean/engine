/** All dimensions are metres. Width is the clear deck width, excluding ropes and towers. */
export interface SuspensionBridgeConfig {
  lengthM: number;
  widthM: number;
  clearanceM: number;
  towerHeightM: number;
  railHeightM: number;
  sagM: number;
}
export type SuspensionBridgeOverrides = Partial<SuspensionBridgeConfig>;
export interface BridgePoint {
  x: number;
  y: number;
  z: number;
}
export interface BridgeTower extends BridgePoint {
  /** Lowest sampled terrain under this post, with a small buried footing. */
  bottomY: number;
  topY: number;
}
export interface CompiledSuspensionBridge {
  config: SuspensionBridgeConfig;
  a: BridgePoint;
  b: BridgePoint;
  deckPath: BridgePoint[];
  /** Translation applied to both ends to satisfy underside clearance. */
  liftM: number;
  towers: BridgeTower[];
}
export const SUSPENSION_BRIDGE_DEFAULTS = Object.freeze({ clearanceM: 1, towerHeightM: 2, railHeightM: 0.95 });
/** Calibrated source-board vertical envelope, retained when changing span and width. */
export const BRIDGE_DECK_THICKNESS_M = 0.22;
export const BRIDGE_PLANK_PITCH_M = 0.4;
export const BRIDGE_TOWER_WIDTH_M = 0.4;
export function resolveSuspensionBridgeConfig(
  lengthM: number,
  widthM: number,
  overrides: SuspensionBridgeOverrides = {}
): SuspensionBridgeConfig {
  const config = { lengthM, widthM, ...SUSPENSION_BRIDGE_DEFAULTS, sagM: Math.min(0.5, lengthM * 0.02), ...overrides };
  for (const [key, value] of Object.entries(config)) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (["lengthM", "widthM", "towerHeightM", "railHeightM"].includes(key) && value === 0)
    )
      throw new Error(`吊桥参数无效：${key}`);
  }
  if (config.towerHeightM < config.railHeightM) throw new Error("吊桥立柱不能低于护绳");
  return config;
}
/** One analytic surface drives source-part placement, navigation and diagnostic geometry. */
export function suspensionBridgePoint(
  bridge: Pick<CompiledSuspensionBridge, "a" | "b" | "config">,
  t: number
): BridgePoint {
  const { a, b, config } = bridge;
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    y: a.y + (b.y - a.y) * t - 4 * config.sagM * t * (1 - t)
  };
}
/** Water/terrain providers return undefined where they impose no lower envelope. */
export function compileSuspensionBridge(
  a: BridgePoint,
  b: BridgePoint,
  config: SuspensionBridgeConfig,
  surface?: (point: BridgePoint) => number | undefined,
  floor?: (point: BridgePoint) => number | undefined
): CompiledSuspensionBridge {
  resolveSuspensionBridgeConfig(config.lengthM, config.widthM, config);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6 || Math.abs(length - config.lengthM) > 1e-4) throw new Error("吊桥跨度与桥头落点不一致");
  const bridge: CompiledSuspensionBridge = {
    a: { ...a },
    b: { ...b },
    config: { ...config },
    deckPath: [],
    liftM: 0,
    towers: []
  };
  const count = Math.max(2, Math.ceil(length / 0.25));
  const nx = -(b.z - a.z) / length,
    nz = (b.x - a.x) / length;
  // Include the full width, both end points and the parabola's exact lowest point.
  const ts = Array.from({ length: count + 1 }, (_, i) => i / count);
  if (config.sagM > 0) ts.push(Math.max(0, Math.min(1, 0.5 - (b.y - a.y) / (8 * config.sagM))));
  let lift = 0;
  for (const t of ts) {
    const point = suspensionBridgePoint(bridge, t);
    for (const side of [-1, 0, 1]) {
      const sample = {
        ...point,
        x: point.x + ((nx * config.widthM) / 2) * side,
        z: point.z + ((nz * config.widthM) / 2) * side
      };
      const water = surface?.(sample),
        ground = floor?.(sample);
      if (water !== undefined) {
        if (!Number.isFinite(water)) throw new Error("吊桥水面高程无效");
        lift = Math.max(lift, water + config.clearanceM + BRIDGE_DECK_THICKNESS_M - point.y);
      }
      // The deck rests on dry banks; its underside may embed in soil there. Only water requires underside clearance.
      if (ground !== undefined) {
        if (!Number.isFinite(ground)) throw new Error("吊桥地面高程无效");
        lift = Math.max(lift, ground + 0.05 - point.y);
      }
    }
  }
  bridge.liftM = Math.max(0, lift);
  bridge.a.y += bridge.liftM;
  bridge.b.y += bridge.liftM;
  bridge.deckPath = Array.from({ length: count + 1 }, (_, i) => suspensionBridgePoint(bridge, i / count));
  bridge.towers = suspensionBridgeTowers(bridge, floor);
  return bridge;
}

/** Sample the entire post footprint, independently on each bank and side. The top stays tied to the deck. */
export function suspensionBridgeTowers(
  bridge: Pick<CompiledSuspensionBridge, "a" | "b" | "config">,
  ground?: (point: BridgePoint) => number | undefined
): BridgeTower[] {
  const { a, b, config } = bridge,
    dx = (b.x - a.x) / config.lengthM,
    dz = (b.z - a.z) / config.lengthM;
  return [a, b].flatMap((end) =>
    [-1, 1].map((side) => {
      const lateral = (config.widthM / 2 + 0.12) * side;
      const p = { x: end.x - dz * lateral, y: end.y, z: end.z + dx * lateral };
      let lowest = Infinity;
      for (const along of [-BRIDGE_TOWER_WIDTH_M / 2, 0, BRIDGE_TOWER_WIDTH_M / 2])
        for (const across of [-BRIDGE_TOWER_WIDTH_M / 2, 0, BRIDGE_TOWER_WIDTH_M / 2]) {
          const height = ground?.({ ...p, x: p.x + dx * along - dz * across, z: p.z + dz * along + dx * across });
          if (height !== undefined) {
            if (!Number.isFinite(height)) throw new Error("吊桥立柱地面高程无效");
            lowest = Math.min(lowest, height);
          }
        }
      return {
        ...p,
        bottomY: Number.isFinite(lowest) ? Math.min(end.y - 0.1, lowest - 0.1) : end.y - 0.36,
        topY: end.y + config.towerHeightM
      };
    })
  );
}

export interface BridgeMeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}
export interface BridgeTemplate {
  planks: BridgeMeshData[];
  tower: BridgeMeshData;
  knot: BridgeMeshData;
}
/** Batch source parts into wood/rope meshes without changing the compiled traversal surface.
 * @param bridge Published bridge geometry, shared by both render levels.
 * @param template Source parts for the requested detail level.
 * @param lod Zero preserves the original geometry; one reduces procedural rope tessellation.
 * @returns Two material batches, with the same plank placements and anchor positions at both levels.
 */
export function suspensionBridgeMeshes(
  bridge: CompiledSuspensionBridge,
  template: BridgeTemplate,
  lod: 0 | 1 = 0
): { wood: BridgeMeshData; rope: BridgeMeshData } {
  const empty = (): BridgeMeshData => ({ positions: [], normals: [], uvs: [], indices: [] });
  const wood = empty(),
    rope = empty();
  const { a, b, config } = bridge,
    dx = (b.x - a.x) / config.lengthM,
    dz = (b.z - a.z) / config.lengthM;
  const append = (
    target: BridgeMeshData,
    source: BridgeMeshData,
    point: BridgePoint,
    sx: number,
    sy: number,
    sz: number,
    slope = 0
  ) => {
    const offset = target.positions.length / 3;
    const c = 1 / Math.sqrt(1 + slope * slope),
      s = slope * c;
    for (let i = 0; i < source.positions.length; i += 3) {
      const x = source.positions[i] * sx,
        y = source.positions[i + 1] * sy,
        z = source.positions[i + 2] * sz;
      const along = c * x - s * y,
        up = s * x + c * y;
      target.positions.push(point.x + dx * along - dz * z, point.y + up, point.z + dz * along + dx * z);
      const nx = source.normals[i] / sx,
        ny = source.normals[i + 1] / sy,
        nz = source.normals[i + 2] / sz;
      const ax = c * nx - s * ny,
        ay = s * nx + c * ny,
        norm = Math.hypot(ax, ay, nz) || 1;
      target.normals.push((dx * ax - dz * nz) / norm, ay / norm, (dz * ax + dx * nz) / norm);
    }
    target.uvs.push(...source.uvs);
    for (const index of source.indices) target.indices.push(offset + index);
  };
  const count = Math.max(1, Math.ceil(config.lengthM / BRIDGE_PLANK_PITCH_M));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count,
      slope = (b.y - a.y - 4 * config.sagM * (1 - 2 * t)) / config.lengthM;
    append(
      wood,
      template.planks[i % template.planks.length],
      suspensionBridgePoint(bridge, t),
      (config.lengthM / count) * 0.96,
      1,
      config.widthM,
      slope
    );
  }
  const sidePoint = (t: number, side: number, height: number): BridgePoint => {
    const point = suspensionBridgePoint(bridge, t),
      lateral = (config.widthM / 2 + 0.12) * side;
    return { x: point.x - dz * lateral, y: point.y + height, z: point.z + dx * lateral };
  };
  const sourceYs = template.tower.positions.filter((_, i) => i % 3 === 1);
  const sourceMinY = Math.min(...sourceYs),
    sourceMaxY = Math.max(...sourceYs);
  for (const tower of bridge.towers) {
    const scale = (tower.topY - tower.bottomY) / (sourceMaxY - sourceMinY || 1);
    append(wood, template.tower, { ...tower, y: tower.bottomY - sourceMinY * scale }, 1, scale, 1);
  }
  for (const t of [0, 1])
    for (const side of [-1, 1]) {
      append(rope, template.knot, sidePoint(t, side, config.towerHeightM * 0.86), 1, 1, 1);
    }
  const tube = (points: BridgePoint[], radius: number) => {
    const base = rope.positions.length / 3,
      sides = lod === 0 ? 8 : 4;
    let arc = 0;
    for (let i = 0; i < points.length; i++) {
      const point = points[i],
        prior = points[Math.max(0, i - 1)],
        next = points[Math.min(points.length - 1, i + 1)];
      if (i) arc += Math.hypot(point.x - prior.x, point.y - prior.y, point.z - prior.z);
      const tangentLength = Math.hypot(next.x - prior.x, next.y - prior.y, next.z - prior.z) || 1;
      const tx = (next.x - prior.x) / tangentLength,
        ty = (next.y - prior.y) / tangentLength,
        tz = (next.z - prior.z) / tangentLength;
      for (let j = 0; j <= sides; j++) {
        const angle = (j / sides) * Math.PI * 2,
          lateral = Math.cos(angle),
          up = Math.sin(angle);
        const nx = -dz * lateral - dx * ty * up,
          ny = (tx * dx + tz * dz) * up,
          nz = dx * lateral - dz * ty * up;
        rope.positions.push(point.x + radius * nx, point.y + radius * ny, point.z + radius * nz);
        rope.normals.push(nx, ny, nz);
        rope.uvs.push(arc * 2, j / sides);
        if (i && j < sides) {
          const v = base + i * (sides + 1) + j;
          rope.indices.push(v - sides - 1, v, v + 1, v - sides - 1, v + 1, v - sides);
        }
      }
    }
  };
  for (const side of [-1, 1]) {
    const samples = Math.max(2, Math.ceil(config.lengthM / (lod === 0 ? 0.25 : 1)));
    for (const upper of [false, true]) {
      const points = Array.from({ length: samples + 1 }, (_, i) => {
        const t = i / samples;
        const height = upper
          ? config.railHeightM + (config.towerHeightM * 0.86 - config.railHeightM) * (2 * t - 1) ** 2
          : -0.04;
        return sidePoint(t, side, height);
      });
      tube(points, upper ? 0.022 : 0.018);
    }
    const hangers = Math.max(1, Math.ceil(config.lengthM / 1.2));
    for (let i = 0; i <= hangers; i++) {
      const t = i / hangers;
      const height = config.railHeightM + (config.towerHeightM * 0.86 - config.railHeightM) * (2 * t - 1) ** 2;
      tube([sidePoint(t, side, -0.04), sidePoint(t, side, height)], 0.014);
    }
  }
  return { wood, rope };
}
