import { compileRecipe } from "../geometry/V2Compiler";
import { DEFAULT_V2_BUDGET, V2BudgetExceeded, V2Meter } from "../geometry/V2Budget";
import { isSimplePolygon, pointInPolygon, segmentDistance } from "../geometry/V2Geometry";
import type { V2Box, V2Point, ValidationReport, WorldRecipe, WorldSnapshot } from "../spatial/V2Model.ts";
import type {
  StudyBinding,
  StudyCompileResult,
  StudyControl,
  StudyDefinition,
  StudyMass,
  StudyMassStats
} from "./StudyModel";

/** Fixed budget shared by polygon conversion and the existing native recipe compiler. */
export const STUDY_COMPILE_BUDGET = Object.freeze({ ...DEFAULT_V2_BUDGET });

const MAX_STUDY_MASSES = 64;
const MAX_OUTLINE_POINTS = 128;
const MAX_HOLES = 32;
const MAX_CANDIDATE_CELLS = 32768;
const MAX_NATIVE_BOXES = 2048;
const MIN_INTERSECTION_AREA = 1e-10;
const FORBIDDEN_PATH_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Convert authored polygonal masses to native whiteboxes, then compile one explicit bounded transaction.
 * @param definition Shared input for baseline, parameter changes, negative controls, and restoration.
 * @param previous Last published snapshot retained when conversion or native compilation fails.
 * @returns Concrete native recipe, native outcome, and measured mass conversion; no physical passage is implied.
 */
export function compileStudy(definition: StudyDefinition, previous?: WorldSnapshot | null): StudyCompileResult {
  const started = performance.now(),
    meter = new V2Meter(STUDY_COMPILE_BUDGET),
    recipe = structuredClone(definition.recipe),
    massStats: StudyMassStats[] = [];
  try {
    if (definition.masses.length > MAX_STUDY_MASSES) throw new Error(`最多支持 ${MAX_STUDY_MASSES} 个独立轮廓`);
    const ids = nativeIds(recipe);
    const referencedIds = collectReferencedIds(recipe, meter);
    let candidateCells = 0;
    for (const mass of definition.masses) {
      validateMass(mass, recipe.size, meter);
      if (ids.has(mass.id)) throw new Error(`轮廓 ID 与原生对象重复：${mass.id}`);
      ids.add(mass.id);
      const bounds = polygonBounds(mass.outline),
        holes = (mass.holes ?? []).map((outline) => ({ outline, bounds: polygonBounds(outline) })),
        holeArea = holes.reduce((area, hole) => area + polygonArea(hole.outline), 0),
        width = bounds.maxX - bounds.minX,
        depth = bounds.maxZ - bounds.minZ,
        columnsX = Math.ceil(width / mass.cellSize),
        columnsZ = Math.ceil(depth / mass.cellSize);
      candidateCells += columnsX * columnsZ;
      if (!Number.isFinite(candidateCells) || candidateCells > MAX_CANDIDATE_CELLS)
        throw new V2BudgetExceeded(`轮廓离散超过 ${MAX_CANDIDATE_CELLS} 个候选格；保留原始 cellSize，不自动降精度`);
      const generated: V2Box[] = [];
      let footprintArea = 0,
        holeSkippedCells = 0;
      for (let iz = 0; iz < columnsZ; iz++)
        for (let ix = 0; ix < columnsX; ix++) {
          meter.spend(mass.outline.length * 8 + 32);
          const x0 = bounds.minX + ix * mass.cellSize,
            x1 = Math.min(bounds.maxX, x0 + mass.cellSize),
            z0 = bounds.minZ + iz * mass.cellSize,
            z1 = Math.min(bounds.maxZ, z0 + mass.cellSize);
          const clipped = clipToCell(mass.outline, x0, x1, z0, z1);
          if (clipped.length < 3 || polygonArea(clipped) <= MIN_INTERSECTION_AREA) continue;
          const cell = polygonBounds(clipped);
          const intersectsHole = holes.some((hole) => {
            meter.spend(8);
            if (
              cell.maxX <= hole.bounds.minX ||
              cell.minX >= hole.bounds.maxX ||
              cell.maxZ <= hole.bounds.minZ ||
              cell.minZ >= hole.bounds.maxZ
            )
              return false;
            meter.spend(hole.outline.length * 8 + 32);
            return (
              polygonArea(clipToCell(hole.outline, cell.minX, cell.maxX, cell.minZ, cell.maxZ)) > MIN_INTERSECTION_AREA
            );
          });
          if (intersectsHole) {
            holeSkippedCells++;
            continue;
          }
          const centerX = (cell.minX + cell.maxX) / 2,
            height = mass.height * sampleProfile(mass.profile, (centerX - bounds.minX) / width);
          if (height === 0) continue;
          if (recipe.boxes.length + generated.length >= MAX_NATIVE_BOXES)
            throw new V2BudgetExceeded(`轮廓支柱与原有体量合计超过 ${MAX_NATIVE_BOXES} 个；未静默删除任何体量`);
          const id = `${mass.id}:column:${ix}:${iz}`;
          if (ids.has(id)) throw new Error(`生成支柱 ID 与原生对象重复：${id}`);
          ids.add(id);
          const sizeX = cell.maxX - cell.minX,
            sizeZ = cell.maxZ - cell.minZ;
          footprintArea += sizeX * sizeZ;
          generated.push({
            id,
            label: mass.label,
            center: { x: centerX, z: (cell.minZ + cell.maxZ) / 2 },
            sizeX,
            sizeY: height,
            sizeZ,
            yaw: 0,
            elevation: mass.baseY,
            appearance: "rock",
            locked: true,
            collision: true,
            occlusion: true
          });
        }
      // Merge only aligned equal-height neighbours. The footprint union, holes and height remain unchanged.
      const compacted = compactColumns(generated, referencedIds, meter),
        members = compacted.map((column) => column.id);
      recipe.boxes.push(...compacted);
      (recipe.groups ??= []).push({
        id: mass.id,
        label: mass.label,
        memberIds: members,
        pivot: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
        translation: { x: 0, z: 0 },
        yaw: 0,
        scale: 1
      });
      massStats.push({
        id: mass.id,
        columnCount: members.length,
        sourceColumnCount: generated.length,
        polygonArea: polygonArea(mass.outline) - holeArea,
        holeArea,
        holeSkippedCells,
        maximumHoleExpansion: holeSkippedCells ? Math.SQRT2 * mass.cellSize : 0,
        columnFootprintArea: footprintArea,
        maximumBoundaryExpansion: members.length ? Math.SQRT2 * mass.cellSize : 0
      });
    }
    meter.checkpoint();
    const remaining = {
      ...STUDY_COMPILE_BUDGET,
      operations: STUDY_COMPILE_BUDGET.operations - meter.operations,
      maxMilliseconds: STUDY_COMPILE_BUDGET.maxMilliseconds - (performance.now() - started)
    };
    const result = compileRecipe(recipe, previous, remaining);
    result.report.operations += meter.operations;
    result.report.durationMs = performance.now() - started;
    return { ...result, recipe, massStats };
  } catch (error) {
    const report: ValidationReport = {
      status: error instanceof V2BudgetExceeded ? "not-found-within-budget" : "invalid-input",
      published: false,
      intentSatisfied: false,
      checks: [],
      messages: [error instanceof Error ? error.message : String(error)],
      operations: meter.operations,
      searchExpansions: 0,
      durationMs: performance.now() - started,
      candidateCount: 0,
      adjusted: [],
      impact: { changedIds: [], affectedIds: [], bounds: null, changedHeightSamples: 0, totalHeightSamples: 0 }
    };
    return { recipe, snapshot: previous ?? null, candidate: null, report, massStats };
  }
}

/** Keep every explicitly referenced source column intact, including targets and support columns. */
function collectReferencedIds(recipe: WorldRecipe, meter: V2Meter): Set<string> {
  const ids = new Set<string>(),
    seen = new Set<object>();
  const visit = (value: unknown): void => {
    meter.spend();
    if (typeof value === "string") ids.add(value);
    else if (value && typeof value === "object" && !seen.has(value)) {
      seen.add(value);
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(recipe);
  return ids;
}

/** Reduce interior grid seams by joining exact rectangular unions; never bridge a gap or hole. */
function compactColumns(columns: V2Box[], referencedIds: Set<string>, meter: V2Meter): V2Box[] {
  let result = columns;
  // Three bounded axis pairs are sufficient to collapse strips without adding a new layout search.
  for (let pass = 0; pass < 3; pass++) {
    const count = result.length;
    result = mergeAlongAxis(mergeAlongAxis(result, "z", referencedIds, meter), "x", referencedIds, meter);
    if (result.length === count) break;
  }
  return result;
}

/** Merge face-adjacent boxes with the same perpendicular extent and exact elevation/height. */
function mergeAlongAxis(columns: V2Box[], axis: "x" | "z", referencedIds: Set<string>, meter: V2Meter): V2Box[] {
  const other = axis === "x" ? "z" : "x",
    size = axis === "x" ? "sizeX" : "sizeZ",
    otherSize = axis === "x" ? "sizeZ" : "sizeX",
    alignedTolerance = 1e-6,
    groups = new Map<string, V2Box[]>(),
    result: V2Box[] = [];
  for (const column of columns) {
    meter.spend();
    if (referencedIds.has(column.id)) {
      result.push(column);
      continue;
    }
    const key = [column.center[other].toFixed(6), column[otherSize].toFixed(6), column.sizeY, column.elevation].join(
      ":"
    );
    const group = groups.get(key) ?? [];
    group.push(column);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    meter.spend(Math.ceil(group.length * Math.log2(group.length + 1)));
    group.sort((a, b) => a.center[axis] - b.center[axis]);
    let previous: V2Box | undefined;
    for (const column of group) {
      meter.spend();
      const gap = previous
        ? column.center[axis] - column[size] / 2 - previous.center[axis] - previous[size] / 2
        : Infinity;
      if (
        previous &&
        Math.abs(gap) <= alignedTolerance &&
        Math.abs(previous.center[other] - column.center[other]) <= alignedTolerance &&
        Math.abs(previous[otherSize] - column[otherSize]) <= alignedTolerance &&
        previous.sizeY === column.sizeY &&
        previous.elevation === column.elevation
      ) {
        const minimum = previous.center[axis] - previous[size] / 2,
          maximum = column.center[axis] + column[size] / 2;
        previous.center[axis] = (minimum + maximum) / 2;
        previous[size] = maximum - minimum;
      } else {
        previous = { ...column, center: { ...column.center } };
        result.push(previous);
      }
    }
  }
  return result;
}

/**
 * Read a semantic control from its first bound numeric field instead of maintaining duplicate parameter state.
 * @param definition Current authored values.
 * @param controlId Stable control identity.
 * @returns The field value with its binding scale and offset reversed.
 * @throws If the control, path, or numeric binding is invalid.
 */
export function getStudyControlValue(definition: StudyDefinition, controlId: string): number {
  const control = findControl(definition, controlId),
    binding = control.bindings[0],
    slot = bindingSlot(definition, binding);
  return (slot.value - (binding.offset ?? 0)) / (binding.scale ?? 1);
}

/**
 * Apply every binding of one control to an independent definition copy.
 * @param definition Input retained unchanged for restoration and comparison.
 * @param controlId Stable control identity.
 * @param value Finite semantic value; UI ranges do not clamp explicit negative controls.
 * @returns New definition with all linked actual fields updated atomically.
 * @throws If any binding is invalid or an assigned value is non-finite; no input field is modified.
 */
export function setStudyControl(definition: StudyDefinition, controlId: string, value: number): StudyDefinition {
  if (!Number.isFinite(value)) throw new Error("控件值必须为有限数值");
  const control = findControl(definition, controlId),
    copy = structuredClone(definition);
  for (const binding of control.bindings) {
    const slot = bindingSlot(copy, binding),
      nextValue = value * (binding.scale ?? 1) + (binding.offset ?? 0);
    if (!Number.isFinite(nextValue)) throw new Error(`控件 ${controlId} 的绑定结果不是有限数值`);
    slot.owner[slot.key] = nextValue;
  }
  return copy;
}

function findControl(definition: StudyDefinition, id: string): StudyControl {
  const matches = definition.controls.filter((control) => control.id === id);
  if (matches.length !== 1 || !matches[0].bindings.length) throw new Error(`控件缺失、重复或没有绑定：${id}`);
  return matches[0];
}

function bindingSlot(
  definition: StudyDefinition,
  binding: StudyBinding
): {
  owner: Record<string | number, unknown>;
  key: string | number;
  value: number;
} {
  const path = binding.path,
    scale = binding.scale ?? 1,
    offset = binding.offset ?? 0;
  if (
    path.length < 2 ||
    !["recipe", "masses", "viewpoints"].includes(String(path[0])) ||
    !Number.isFinite(scale) ||
    scale === 0 ||
    !Number.isFinite(offset)
  )
    throw new Error("无效参数路径或线性绑定");
  let owner: unknown = definition;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (
      (typeof key !== "string" && typeof key !== "number") ||
      FORBIDDEN_PATH_KEYS.has(String(key)) ||
      (typeof key === "number" && (!Number.isInteger(key) || key < 0)) ||
      !owner ||
      typeof owner !== "object" ||
      !Object.prototype.hasOwnProperty.call(owner, key)
    )
      throw new Error(`参数路径不存在或不可写：${path.join(".")}`);
    const record = owner as Record<string | number, unknown>,
      value = record[key];
    if (i === path.length - 1) {
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error(`参数路径不是有限数值：${path.join(".")}`);
      return { owner: record, key, value };
    }
    owner = value;
  }
  throw new Error("参数路径为空");
}

function nativeIds(recipe: WorldRecipe): Set<string> {
  return new Set(
    [
      ...recipe.elevations,
      ...recipe.riverNodes,
      ...recipe.rivers,
      ...recipe.lakes,
      ...recipe.canyons,
      ...recipe.boxes,
      ...recipe.pois,
      ...recipe.routes,
      ...recipe.views,
      ...(recipe.routeNodes ?? []),
      ...(recipe.groups ?? [])
    ].map((feature) => feature.id)
  );
}

function validateMass(mass: StudyMass, size: number, meter: V2Meter): void {
  if (
    !mass.id ||
    !Number.isFinite(mass.height) ||
    mass.height < 0 ||
    !Number.isFinite(mass.baseY) ||
    !Number.isFinite(mass.cellSize) ||
    mass.cellSize <= 0 ||
    !Array.isArray(mass.outline) ||
    mass.outline.length > MAX_OUTLINE_POINTS ||
    !mass.outline.every(
      (point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.z) &&
        Math.abs(point.x) <= size / 2 &&
        Math.abs(point.z) <= size / 2
    )
  )
    throw new Error(`轮廓 ${mass.id} 的高度、分辨率或边界无效`);
  meter.spend(mass.outline.length * mass.outline.length);
  if (!isSimplePolygon(mass.outline)) throw new Error(`轮廓 ${mass.id} 必须是具有面积的简单多边形`);
  if (mass.holes !== undefined && (!Array.isArray(mass.holes) || mass.holes.length > MAX_HOLES))
    throw new Error(`轮廓 ${mass.id} 最多支持 ${MAX_HOLES} 个显式孔洞`);
  const holes = mass.holes ?? [];
  for (let index = 0; index < holes.length; index++) {
    const hole = holes[index];
    if (
      !Array.isArray(hole) ||
      hole.length > MAX_OUTLINE_POINTS ||
      !hole.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
    )
      throw new Error(`轮廓 ${mass.id} 的孔洞 ${index} 顶点无效`);
    meter.spend(hole.length * hole.length + hole.length * mass.outline.length * 8);
    if (!isSimplePolygon(hole) || !pointInPolygon(hole[0], mass.outline) || boundariesMeet(hole, mass.outline))
      throw new Error(`轮廓 ${mass.id} 的孔洞 ${index} 必须为严格位于外轮廓内的简单多边形`);
    for (let previous = 0; previous < index; previous++) {
      const other = holes[previous];
      meter.spend(hole.length * other.length * 8);
      if (pointInPolygon(hole[0], other) || pointInPolygon(other[0], hole) || boundariesMeet(hole, other))
        throw new Error(`轮廓 ${mass.id} 的孔洞不能重叠、相切或嵌套`);
    }
  }
  if (
    mass.profile &&
    (!mass.profile.length ||
      mass.profile.length > MAX_OUTLINE_POINTS ||
      mass.profile.some((height) => !Number.isFinite(height) || height < 0))
  )
    throw new Error(`轮廓 ${mass.id} 的高度剖面必须为非负有限倍率`);
}

function boundariesMeet(a: V2Point[], b: V2Point[]): boolean {
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      if (segmentDistance(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]) <= 1e-7) return true;
  return false;
}

function polygonBounds(points: V2Point[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function polygonArea(points: V2Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area) / 2;
}

function clipToCell(polygon: V2Point[], x0: number, x1: number, z0: number, z1: number): V2Point[] {
  let points = polygon;
  for (const [axis, boundary, sign] of [
    ["x", x0, 1],
    ["x", x1, -1],
    ["z", z0, 1],
    ["z", z1, -1]
  ] as const) {
    const result: V2Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        insideA = (a[axis] - boundary) * sign >= 0,
        insideB = (b[axis] - boundary) * sign >= 0;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (boundary - a[axis]) / (b[axis] - a[axis]);
        result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    points = result;
    if (!points.length) break;
  }
  return points;
}

function sampleProfile(profile: number[] | undefined, t: number): number {
  if (!profile) return 1;
  const index = Math.max(0, Math.min(1, t)) * (profile.length - 1),
    left = Math.floor(index),
    right = Math.min(profile.length - 1, left + 1),
    blend = index - left;
  return profile[left] * (1 - blend) + profile[right] * blend;
}
