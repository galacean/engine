import { unionRectangles } from "../semantic-study/ComposedShape";
import type { V2Box, V2Point } from "../spatial/V2Model.ts";
import { ROCK_ATOMS, compileRockAtom, type RockAtom, type AtomKind } from "./RockAtoms";
import { DEFAULT_LANDFORM_METRICS, type LandformMetrics } from "./LandformMetrics";
/** Initial composition library. */
export type LandformKind = "canyon" | "cliff" | "plateau" | "peaks" | "pass";
/** Metric reference passage: not a physical road or water shape. */
export interface Passage {
  points: V2Point[];
  width: number;
  label: string;
}
/** Shared output consumed by plan and 45-degree orthographic views. */
export interface Landform {
  kind: LandformKind;
  label: string;
  description: string;
  atoms: RockAtom[];
  boxes: V2Box[];
  outlines: V2Point[][];
  passages: Passage[];
  marks: { text: string; x: number; z: number }[];
  lengthM: number;
  walkSeconds: number;
  runSeconds: number;
  footprintAreaM2: number;
  maxHeightM: number;
  detailPitchM: number;
}
const labels: Record<LandformKind, [string, string]> = {
  canyon: ["峡谷", "开阔入口 → 错位窄口 → 转折展开"],
  cliff: ["断崖", "连续崖面 · 背侧支撑 · 崖脚留白"],
  plateau: ["台地", "中央承托面 · 周缘落差 · 外侧山肩"],
  peaks: ["峰群", "主峰与次峰 · 鞍部间隔 · 山脚过渡"],
  pass: ["山口", "两侧抬高 · 中间低口 · 前后展开"]
};
/** Build one landform using pacing-derived spacing and the shared atomic catalog.
 * Durations set passage length; exposure time sets atom pitch; height affects body
 * depth and therefore placement setbacks. No contour fixture or seed branch is used.
 * @param kind Composition responsibility.
 * @param overrides Internal metrics, not UI semantic controls.
 * @param catalog Shared shape definitions used by every placement.
 * @returns Metric OBB composition and derived footprint rings, including disjoint parts.
 */
export function buildLandform(
  kind: LandformKind,
  overrides: Partial<LandformMetrics> = {},
  catalog = ROCK_ATOMS,
  variation?: { seed: number; amount: number }
): Landform {
  const m = { ...DEFAULT_LANDFORM_METRICS, ...overrides };
  const amount = Math.max(0, Math.min(1, variation?.amount ?? 0));
  const noise = (key: string) => {
    let h = (variation?.seed ?? 0) >>> 0;
    for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967295;
  };
  const vary = (key: string, span: number) => 1 + (noise(key) * 2 - 1) * amount * span;

  if (
    [
      m.walkSpeedMps,
      m.runSpeedMps,
      m.atomExposureSeconds,
      m.referenceHeightM,
      m.maxAtoms,
      m.cliffSeconds,
      m.plateauSeconds,
      m.peaksSeconds,
      m.passSeconds,
      ...m.canyonSeconds
    ].some((v) => !Number.isFinite(v) || v <= 0)
  )
    throw new Error("Invalid landform metrics");
  const duration =
    kind === "canyon" ? m.canyonSeconds.reduce((a, b) => a + b, 0) : m[`${kind}Seconds` as "cliffSeconds"];
  const lengthM = duration * m.walkSpeedMps,
    pitch = m.walkSpeedMps * m.atomExposureSeconds;
  const atoms: RockAtom[] = [],
    passages: Passage[] = [],
    marks: Landform["marks"] = [];
  // Taller bodies get deeper support without scaling the passage length or width.
  const support = Math.sqrt(m.referenceHeightM / DEFAULT_LANDFORM_METRICS.referenceHeightM);
  const dimensions = (role: AtomKind, scale = 1) => ({
    width: pitch * catalog[role].widthFactor * scale,
    depth: pitch * catalog[role].widthFactor * catalog[role].depthPerWidth * scale * support,
    height: m.referenceHeightM * catalog[role].heightFactor * scale
  });
  const add = (
    role: AtomKind,
    x: number,
    z: number,
    yaw = 0,
    scale = 1,
    baseY = 0,
    override: Partial<{ width: number; depth: number; height: number }> = {}
  ) => {
    if (atoms.length >= m.maxAtoms)
      throw new Error("Atom budget exceeded; increase exposure interval or authoring budget");
    const size = { ...dimensions(role, scale), ...override };
    // XY variations only contract the authored envelope: the passage remains reserved.
    if (variation) {
      const key = `${role}:${atoms.length}`;
      size.width *= 1 - noise(key + "w") * amount * 0.16;
      size.depth *= 1 - noise(key + "d") * amount * 0.2;
      size.height *= vary(key + "h", 0.18);
    }

    const atom = compileRockAtom({ id: `${kind}-${atoms.length}`, kind: role, x, z, yaw, baseY, ...size }, catalog);
    atoms.push(atom);
    return atom;
  };
  if (kind === "canyon") {
    const turnAngles = [0, -0.5 * vary("bend-b", 0.3), 0.38 * vary("bend-c", 0.3)],
      widths = [
        pitch * 1.35 * vary("entry", 0.12),
        pitch * 0.58 * vary("throat", 0.12),
        pitch * 1.65 * vary("release", 0.12)
      ];
    let origin = { x: -lengthM * 0.45, z: 0 };
    for (let stage = 0; stage < 3; stage++) {
      const a = turnAngles[stage],
        c = Math.cos(a),
        s = Math.sin(a),
        segmentLength = m.canyonSeconds[stage] * m.walkSpeedMps;
      const end = { x: origin.x + c * segmentLength, z: origin.z + s * segmentLength };
      passages.push({
        points: [origin, end],
        width: widths[stage],
        label: ["A 开阔入口", "B 错位窄口", "C 转折展开"][stage]
      });
      const count = Math.max(2, Math.ceil(segmentLength / pitch)),
        step = segmentLength / count;
      for (const side of [-1, 1])
        for (let i = 0; i < count; i++) {
          const t = (i + 0.5) * step,
            role: AtomKind =
              stage === 0 && i === 0
                ? "buttress/shoulder"
                : stage === 2 && i === count - 1 && side === 1
                  ? "terrace/cap"
                  : "wall";
          const d = dimensions(role),
            push = stage === 1 ? ((i + Number(side === 1)) % 2 === 0 ? pitch * 0.02 : pitch * 0.3) : 0;
          const offset = widths[stage] / 2 + d.depth / 2 + push;
          const atom = add(role, origin.x + c * t - s * offset * side, origin.z + s * t + c * offset * side, a, 1, 0, {
            width: Math.min(d.width, step * 1.15),
            height: d.height * (1 + m.heightVariation * Math.sin(i * 1.8 + side + stage))
          });
          if (i % 3 === 1) {
            const outward = offset + d.depth * 0.8;
            add(
              "buttress/shoulder",
              origin.x + c * t - s * outward * side,
              origin.z + s * t + c * outward * side,
              a + (side * Math.PI) / 2,
              0.85
            );
          }
          if (stage === 2 && i === count - 2 && side === -1)
            add("crown", atom.x - s * side * d.depth, atom.z + c * side * d.depth, a, 0.85);
        }
      marks.push({ text: ["A", "B", "C"][stage], x: (origin.x + end.x) / 2, z: (origin.z + end.z) / 2 });
      origin = end;
    }
  } else if (kind === "cliff") {
    const count = Math.max(3, Math.ceil(lengthM / pitch)),
      step = lengthM / count;
    for (let i = 0; i < count; i++) {
      const x = -lengthM / 2 + (i + 0.5) * step,
        z = Math.sin(i * 0.8) * pitch * 0.16,
        d = dimensions("wall");
      add("wall", x, z, 0, 1, 0, { width: step * 1.1, height: d.height * (1 + m.heightVariation * Math.sin(i * 1.7)) });
      if (i % 2 === 0) add("buttress/shoulder", x, z + d.depth, Math.PI / 2, 1);
      if (i % 3 === 1) add("skirt", x, z - d.depth, -Math.PI / 2, 0.65);
    }
    passages.push({
      points: [
        { x: -lengthM / 2, z: -pitch },
        { x: lengthM / 2, z: -pitch }
      ],
      width: 4,
      label: "崖脚留白"
    });
    marks.push({ text: "崖面", x: 0, z: -pitch * 0.6 }, { text: "背侧山肩", x: 0, z: pitch * 1.7 });
  } else if (kind === "plateau") {
    const w = lengthM * 0.8,
      d = Math.max(pitch * 2, lengthM * 0.58),
      h = m.referenceHeightM * 0.8;
    add("terrace/cap", 0, 0, 0, 1, 0, { width: w, depth: d, height: h });
    const count = Math.max(3, Math.ceil(w / pitch));
    for (const side of [-1, 1])
      for (let i = 0; i < count; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / count;
        add("wall", x, (side * d) / 2, 0, 0.7, 0, { width: (w / count) * 1.1, height: h * (0.8 + 0.1 * Math.sin(i)) });
        if (i % 2 === 0) add("buttress/shoulder", x, side * (d / 2 + pitch * 0.7), (side * Math.PI) / 2, 0.7);
      }
    for (const side of [-1, 1]) add("buttress/shoulder", (side * w) / 2, 0, side === 1 ? 0 : Math.PI, 1.2);
    marks.push({ text: "宽顶承托面", x: 0, z: 0 });
    passages.push({
      points: [
        { x: -lengthM / 2, z: -d * 0.85 },
        { x: lengthM / 2, z: -d * 0.85 }
      ],
      width: 4,
      label: "地貌尺度参考"
    });
  } else if (kind === "peaks") {
    const count = Math.max(3, Math.ceil(lengthM / (pitch * 2.1))),
      step = lengthM / count;
    for (let i = 0; i < count; i++) {
      const x = -lengthM / 2 + (i + 0.5) * step,
        z = Math.sin(i * 1.3) * pitch * 0.55,
        scale = i === Math.floor(count / 2) ? 1.35 : 0.68 + 0.14 * (i % 3);
      add("crown", x, z, i * 0.37, scale);
      add("buttress/shoulder", x - pitch * 0.45, z + pitch * 0.45, Math.PI * 0.8, scale * 0.9);
      add("skirt", x + pitch * 0.6, z - pitch * 0.4, -0.4, scale);
      // The saddle is the unfilled interval between neighbouring peak bodies.
    }
    marks.push({ text: "主峰", x: 0, z: -pitch * 1.7 });
    passages.push({
      points: [
        { x: -lengthM / 2, z: -pitch * 2 },
        { x: lengthM / 2, z: -pitch * 2 }
      ],
      width: 4,
      label: "山脚尺度参考"
    });
  } else {
    const gap = pitch * 0.65,
      d = dimensions("crown"),
      width = d.width;
    // Two independent grounded peaks frame a clear passage; no saddle primitive.
    for (const side of [-1, 1]) {
      add("crown", (side * (gap + width)) / 2, 0, 0, 1, 0, {
        width,
        depth: d.depth,
        height: m.referenceHeightM * (side === 1 ? 1.45 : 1.1)
      });
      const count = Math.max(2, Math.ceil(lengthM / (pitch * 2)));
      for (let i = 0; i < count; i++) {
        const z = -lengthM / 2 + ((i + 0.5) * lengthM) / count,
          offset = gap / 2 + pitch * 0.5 + (Math.abs(z) / lengthM) * pitch;
        if (Math.abs(z) < d.depth * 0.6) continue;
        add("buttress/shoulder", side * offset, z, side === 1 ? 0 : Math.PI, 0.9);
        add("skirt", side * (offset + pitch * 0.8), z, side === 1 ? 0 : Math.PI, 0.8);
      }
    }
    passages.push({
      points: [
        { x: 0, z: -lengthM / 2 },
        { x: 0, z: lengthM / 2 }
      ],
      width: gap,
      label: "两峰之间留白"
    });
    marks.push({ text: "鞍部低口", x: 0, z: -pitch });
  }
  const boxes = atoms.flatMap((a) => a.boxes),
    outlines = unionRectangles(
      boxes.map((b) => ({
        id: b.id,
        x: b.center.x,
        z: b.center.z,
        width: b.sizeX,
        length: b.sizeZ,
        yaw: (b.yaw * 180) / Math.PI
      })),
      1e-8
    );
  const signed = (r: V2Point[]) =>
    r.reduce((a, p, i) => {
      const q = r[(i + 1) % r.length];
      return a + p.x * q.z - q.x * p.z;
    }, 0) / 2;
  return {
    kind,
    label: labels[kind][0],
    description: labels[kind][1],
    atoms,
    boxes,
    outlines,
    passages,
    marks,
    lengthM,
    walkSeconds: lengthM / m.walkSpeedMps,
    runSeconds: lengthM / m.runSpeedMps,
    footprintAreaM2: Math.abs(outlines.reduce((sum, r) => sum + signed(r), 0)),
    maxHeightM: Math.max(...boxes.map((b) => (b.elevation ?? 0) + b.sizeY)),
    detailPitchM: pitch
  };
}
