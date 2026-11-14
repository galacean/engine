import { composeCanyonBanks } from "./CanyonBanks";
import { PLANNING_REFERENCE } from "../planning-data/PlanningReference";
import { ROCK_ATOMS, compileRockAtom, type AtomKind, type RockAtom } from "./RockAtoms";
import type { Landform } from "./Landforms";
import { unionRectangles } from "../semantic-study/ComposedShape";
/** Stage-one composition presets; openings are combinations, not rock atoms. */
export const STUDY_PRESETS = {
  atom: "单个原子",
  peaks: "主次峰群",
  ridge: "连续山脊",
  canyon: "曲折峡谷",
  plateau: "退台高地"
} as const;
/** Metre geometry and adjustable pacing; exploratory controls, not production semantic UI. */
export interface StudyConfig {
  preset: keyof typeof STUDY_PRESETS;
  shape: AtomKind;
  walk: number;
  run: number;
  seconds: number;
  detailSeconds: number;
  width: number;
  depthRatio: number;
  height: number;
  topRatio: number;
  peakX: number;
  peakZ: number;
  bend: number;
  spread: number;
  variation: number;
  yaw: number;
}
/** Defaults are examples, not fixed requirements for a rock or a formation. */
export const STUDY_DEFAULTS: StudyConfig = {
  preset: "peaks",
  shape: "crown",
  walk: 2,
  run: 8,
  seconds: 70,
  detailSeconds: 12,
  width: 24,
  depthRatio: 0.8,
  height: 40,
  topRatio: 0.25,
  peakX: 0,
  peakZ: 0,
  bend: 0.35,
  spread: 30,
  variation: 0.4,
  yaw: 0
};
/** Named composition starting points. All subsequent changes use the same parameter schema. */
export function presetConfig(preset: StudyConfig["preset"]): StudyConfig {
  const shape: AtomKind = ["ridge", "saw", "branch", "cliff", "canyon"].includes(preset)
    ? "wall"
    : ["plateau", "terraces"].includes(preset)
      ? "terrace/cap"
      : "crown";
  return {
    ...STUDY_DEFAULTS,
    ...shapeDefaults(shape),
    preset,
    shape,
    seconds: preset === "canyon" ? 120 : 70,
    height: preset === "plateau" ? 24 : shapeDefaults(shape).height,
    width: preset === "plateau" ? 65 : shapeDefaults(shape).width,
    spread: 30
  };
}
/** Role-specific starting dimensions and profile. Variations retain the same role. */
export function shapeDefaults(shape: AtomKind) {
  const defaults = PLANNING_REFERENCE.rockShapes;
  return { ...defaults[shape] };
}
/** Generate variable normalized parts for one solid. The high section can move in
 * X and Z while remaining supported by the previous section. No saddle primitive.
 * @param kind Shape responsibility selected for this instance.
 * @param p Shape parameters; world transform is applied separately.
 * @returns Shared catalog entry with parameterized profile parts.
 */
export function variableShape(kind: AtomKind, p: StudyConfig) {
  if (kind === "saddle/notch") throw new Error("鞍部是组合，不是单块原子");
  const parts: [number, number, number, number, number, number][] = [];
  const layer = (bottom: number, top: number, w: number, d: number) =>
    parts.push([p.peakX * (1 - w), p.peakZ * (1 - d), bottom, w, d, top - bottom]);
  switch (kind) {
    case "mass":
      layer(0, 1, 1, 1);
      break;
    case "spire":
      layer(0, 0.22, 1, 1);
      layer(0.22, 0.5, 0.4 + 0.6 * p.topRatio, 0.4 + 0.6 * p.topRatio);
      layer(0.5, 0.78, 0.15 + 0.85 * p.topRatio, 0.15 + 0.85 * p.topRatio);
      layer(0.78, 1, p.topRatio, p.topRatio);
      break;
    case "crown":
      layer(0, 0.25, 1, 1);
      layer(0.25, 0.6, 0.55 + 0.45 * p.topRatio, 0.55 + 0.45 * p.topRatio);
      layer(0.6, 1, p.topRatio, p.topRatio);
      break;
    case "crown/spire":
      layer(0, 0.22, 1, 1);
      layer(0.22, 0.5, 0.72, 0.72);
      layer(0.5, 0.78, 0.43, 0.43);
      layer(0.78, 1, p.topRatio * 0.42 + 0.08, p.topRatio * 0.42 + 0.08);
      break;
    case "wall":
      layer(0, 0.82, 1, 1);
      layer(0.82, 1, p.topRatio, 0.82);
      break;
    case "terrace/cap":
      layer(0, 0.22, 1, 1);
      layer(0.22, 0.4, 0.5 + 0.5 * p.topRatio, 0.5 + 0.5 * p.topRatio);
      layer(0.4, 1, p.topRatio, p.topRatio);
      break;
    case "buttress/shoulder":
      layer(0, 0.23, 1, 1);
      layer(0.23, 0.58, 0.5 + 0.5 * p.topRatio, 0.94);
      layer(0.58, 1, p.topRatio, 0.85);
      break;
    case "skirt":
      layer(0, 0.14, 1, 1);
      layer(0.14, 0.4, 0.5 + 0.5 * p.topRatio, 0.92);
      layer(0.4, 0.7, 0.2 + 0.8 * p.topRatio, 0.82);
      layer(0.7, 1, p.topRatio, 0.7);
      break;
  }

  return { ...ROCK_ATOMS[kind], parts };
}
/** Compose metric atoms from a preset and continuous parameters. Output and selection
 * remain shared between the 90- and 45-degree views. Count budget failures are explicit.
 * @param p Complete research configuration.
 * @returns Resolved geometry; no terrain, asset placement or traversal claim is implied.
 */
export function composeStudy(p: StudyConfig): Landform {
  const limits: Record<string, [number, number]> = {
    walk: [0.5, 6],
    run: [1, 16],
    seconds: [10, 180],
    detailSeconds: [4, 30],
    width: [6, 80],
    depthRatio: [0.2, 2],
    height: [4, 100],
    topRatio: [0.1, 1],
    peakX: [-0.45, 0.45],
    peakZ: [-0.45, 0.45],
    bend: [0, 1],
    spread: [4, 80],
    variation: [0, 0.8],
    yaw: [-180, 180]
  };
  if (!Object.hasOwn(STUDY_PRESETS, p.preset) || !Object.hasOwn(ROCK_ATOMS, p.shape) || p.shape === "saddle/notch")
    throw new Error("不支持的地貌或单块形状");
  for (const [key, [min, max]] of Object.entries(limits)) {
    const n = p[key as keyof StudyConfig];
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new Error(`参数 ${key} 超出支持区间`);
  }
  const length = p.walk * p.seconds,
    pitch = p.walk * p.detailSeconds;
  const n = Math.max(2, Math.ceil(length / pitch)),
    atoms: RockAtom[] = [],
    marks: Landform["marks"] = [],
    passages: Landform["passages"] = [];
  const phase = (p.yaw * Math.PI) / 180,
    cs = Math.cos(phase),
    sn = Math.sin(phase);
  const transform = (x: number, z: number) => ({ x: cs * x - sn * z, z: sn * x + cs * z });
  const catalog = { ...ROCK_ATOMS };
  for (const kind of Object.keys(catalog) as AtomKind[])
    if (kind !== "saddle/notch")
      catalog[kind] = variableShape(
        kind,
        p.preset === "atom" && kind === p.shape ? p : { ...p, ...shapeDefaults(kind) }
      );
  const add = (
    kind: AtomKind,
    x: number,
    z: number,
    yaw = 0,
    scale = 1,
    width = p.width,
    depth = width * p.depthRatio,
    baseY = 0
  ) => {
    if (atoms.length >= 192) throw new Error("超过 192 个原子的研究预算，请增加单岩间隔或缩短通过时间");
    const pos = transform(x, z),
      height =
        p.height *
        scale *
        (p.preset === "atom" ? 1 : kind === "skirt" ? 0.15 : kind === "buttress/shoulder" ? 0.55 : 1);
    const localCatalog =
      p.preset === "atom"
        ? catalog
        : {
            ...catalog,
            [kind]: variableShape(kind, {
              ...p,
              ...shapeDefaults(kind),
              topRatio: shapeDefaults(kind).topRatio * (1 + p.variation * 0.12 * Math.sin(atoms.length * 2.3)),
              peakX: shapeDefaults(kind).peakX + p.variation * 0.08 * Math.cos(atoms.length * 1.7)
            })
          };
    const a = compileRockAtom(
      { id: `study-${atoms.length}`, kind, x: pos.x, z: pos.z, yaw: yaw + phase, baseY, width, depth, height },
      localCatalog
    );
    atoms.push(a);
    return a;
  };
  const path = (points: { x: number; z: number }[], width: number, label: string) =>
    passages.push({ points: points.map((v) => transform(v.x, v.z)), width, label });
  const curve = (t: number) => ({ x: (t - 0.5) * length, z: Math.sin(t * Math.PI * 2) * p.bend * length * 0.14 });
  const tangent = (t: number) => Math.atan2(Math.cos(t * Math.PI * 2) * p.bend * 0.28 * Math.PI, 1);
  const h = (i: number) => 1 - p.variation * 0.55 + p.variation * 0.55 * Math.cos(i * 1.7);
  if (p.preset === "atom") add(p.shape, 0, 0);
  else if (p.preset === "peaks") {
    // Unequal clusters: a dominant summit, a lower counterweight and a receding tail.
    const count = Math.max(3, n),
      step = length / count;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count,
        pos = curve(t),
        dominance = 0.48 + 0.52 * Math.exp(-Math.pow((t - 0.38) / 0.24, 2));
      const z = pos.z + Math.sin(i * 2.4) * p.spread * 0.32;
      const w = Math.min(step * 1.18, pitch * 1.2) * (1 + p.variation * 0.18 * Math.sin(i * 2.1));
      add(
        i === Math.floor(count * 0.38) ? "spire" : "crown",
        pos.x,
        z,
        tangent(t),
        i === Math.floor(count * 0.38) ? 1.15 : dominance * h(i) * 0.8,
        w,
        w * 0.8
      );
      add("buttress/shoulder", pos.x + w * 0.24, z + w * 0.36, tangent(t) + Math.PI / 2, dominance, w * 1.35, w * 0.9);
    }
  } else if (p.preset === "ridge") {
    const step = length / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n,
        pos = curve(t),
        a = tangent(t),
        crest = 0.45 + 0.4 * Math.sin(Math.PI * t);
      const depth = p.spread * (0.65 + 0.2 * Math.sin(i * 1.9));
      add("wall", pos.x, pos.z, a, crest * h(i), step * 1.2, depth);
      if (i % 3 === 1) add("crown", pos.x, pos.z, a, crest * 1.35, step * 0.8, depth * 0.9);
      if (i % 2 === 0) add("buttress/shoulder", pos.x, pos.z + depth * 0.55, a + Math.PI / 2, crest, depth * 1.4, step);
    }
  } else if (p.preset === "canyon") {
    for (const atom of composeCanyonBanks({
      lengthM: length,
      pitchM: pitch,
      spreadM: p.spread,
      variation: p.variation,
      frame: (t) => ({ position: curve(t), yaw: tangent(t) })
    }))
      add(atom.kind, atom.center.x, atom.center.z, atom.yaw, atom.heightScale, atom.width, atom.depth);
    for (const [t, text] of [
      [0.16, "A 开阔入口"],
      [0.46, "B 错位收束"],
      [0.8, "C 转折展开"]
    ] as const) {
      const pos = transform(curve(t).x, curve(t).z);
      marks.push({ ...pos, text });
    }
    path(
      Array.from({ length: 21 }, (_, i) => curve(i / 20)),
      2,
      "空间顺序参考"
    );
  } else if (p.preset === "plateau") {
    const w = length * 0.55,
      d = p.spread * 1.5;
    add("terrace/cap", -length * 0.12, 0, 0, 1, w, d);
    add("terrace/cap", length * 0.23, d * 0.12, p.variation * 0.2, 0.55 + p.variation * 0.2, length * 0.32, d * 0.78);
    add("buttress/shoulder", -length * 0.3, d * 0.44, Math.PI / 2, 0.85, d * 1.3, length * 0.28);
    add("buttress/shoulder", length * 0.36, d * 0.25, 0, 0.6, length * 0.3, d * 0.8);
  }
  const boxes = atoms.flatMap((a) => a.boxes);
  // Contained tiers add no footprint boundary; omit them before edge arrangement.
  const footprintBoxes = atoms.flatMap((a) =>
    a.boxes.filter(
      (b, i) =>
        !a.boxes.some((outer, j) => {
          if (i === j) return false;
          const dx = b.center.x - outer.center.x,
            dz = b.center.z - outer.center.z;
          const contained =
            Math.abs(dx * Math.cos(b.yaw) + dz * Math.sin(b.yaw)) + b.sizeX / 2 <= outer.sizeX / 2 + 1e-9 &&
            Math.abs(-dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw)) + b.sizeZ / 2 <= outer.sizeZ / 2 + 1e-9;
          return contained && (outer.sizeX * outer.sizeZ > b.sizeX * b.sizeZ + 1e-9 || j < i);
        })
    )
  );
  const outlines = unionRectangles(
    footprintBoxes.map((b) => ({
      id: b.id,
      x: b.center.x,
      z: b.center.z,
      width: b.sizeX,
      length: b.sizeZ,
      yaw: (b.yaw * 180) / Math.PI
    })),
    1e-8
  );
  const area = Math.abs(
    outlines.reduce(
      (sum, r) =>
        sum +
        r.reduce((v, a, i) => {
          const b = r[(i + 1) % r.length];
          return v + a.x * b.z - b.x * a.z;
        }, 0) /
          2,
      0
    )
  );
  return {
    kind: "peaks",
    label: STUDY_PRESETS[p.preset],
    description: "参数化白盒研究",
    atoms,
    boxes,
    outlines,
    passages,
    marks,
    lengthM: length,
    walkSeconds: p.seconds,
    runSeconds: length / p.run,
    footprintAreaM2: area,
    maxHeightM: Math.max(...boxes.map((b) => (b.elevation ?? 0) + b.sizeY)),
    detailPitchM: pitch
  };
}

/** Shared five-family profiles used by the atlas and the world planner. */
export function planningAtomCatalog() {
  const catalog = { ...ROCK_ATOMS };
  for (const shape of ["crown", "wall", "buttress/shoulder", "terrace/cap", "skirt"] as const)
    catalog[shape] = variableShape(shape, { ...presetConfig("atom"), shape, ...shapeDefaults(shape) });
  return catalog;
}
