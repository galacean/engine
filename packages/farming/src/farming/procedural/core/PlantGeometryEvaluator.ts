import { generatePlantGrowthGeometry, ICOSAHEDRON_POINTS, type PlantGeometry } from "./PlantGrowthGeometry";
import { freezePlantContent } from "./immutable";
import { growthEase, mixPlantAngle, sampleScalarCurve, type GrowthCurve } from "./curves";
import { DEFAULT_PLANT_SHAPE, type PlantGrowthRecipe, type PlantShape, type PlantAnchor } from "./PlantGrowthRecipe";
import { writeMeshOrganPoint } from "./PlantMeshOrgan";
import { validatePlantGrowthRecipe, isImmutablePlantGrowthRecipe } from "./validation";

const initialGeometryCache = new WeakMap<PlantGrowthRecipe, PlantGeometry>();

type Point = [number, number, number];
type MutableGeometry = { -readonly [K in keyof PlantGeometry]: PlantGeometry[K] };

/** A reusable cursor; sampling does not allocate tuples, maps or result objects. */
class Curve<T> {
  a!: T;
  b!: T;
  t = 0;
  constructor(readonly keys: GrowthCurve<T>) {
    this.at(0);
  }
  at(age: number): this {
    let upper = 0;
    while (upper < this.keys.length - 1 && age > this.keys[upper].age) upper++;
    const high = this.keys[upper],
      low = this.keys[Math.max(0, upper - 1)];
    if (age >= high.age || age <= low.age || high === low) {
      this.a = this.b = age >= high.age ? high.value : low.value;
      this.t = 0;
    } else {
      this.a = low.value;
      this.b = high.value;
      this.t = growthEase((age - low.age) / (high.age - low.age));
    }
    return this;
  }
}
interface Anchor {
  definition: PlantAnchor;
  curve: Curve<PlantAnchor["poses"][number]["value"]>;
  parent?: Anchor;
  position: Point;
  angle: number;
}
const interpolate = (a: number, b: number, t: number) => a + (b - a) * t;

/** Compiles connections and topology once. update() mutates this instance's stable geometry arrays. */
export class PlantGeometryEvaluator {
  private anchorOffsets = new Map<string, Point>();
  readonly geometry: MutableGeometry;
  private readonly anchors: Anchor[] = [];
  private readonly stems;
  private readonly leaves;
  private readonly volumes;
  private readonly meshes;
  private readonly positions: Point[];
  private readonly normals: Point[];
  private readonly smoothIndexCount: number;
  private readonly smoothVertexCount: number;

  constructor(readonly recipe: PlantGrowthRecipe) {
    validatePlantGrowthRecipe(recipe);
    const shared = isImmutablePlantGrowthRecipe(recipe);
    let initial = shared ? initialGeometryCache.get(recipe) : undefined;
    if (!initial) {
      initial = generatePlantGrowthGeometry(recipe, 0);
      if (shared) {
        for (const key of ["uvs", "indices", "tintMask", "organs"] as const) freezePlantContent(initial[key]);
        initialGeometryCache.set(recipe, initial);
      }
    }
    // Positions, normals and bounds belong to the instance; static topology can be shared.
    this.geometry = {
      ...initial,
      positions: initial.positions.map((p) => [...p]),
      normals: initial.normals.map((n) => [...n]),
      bounds: { min: [...initial.bounds.min], max: [...initial.bounds.max] }
    };
    this.positions = this.geometry.positions as Point[];
    this.normals = this.geometry.normals as Point[];
    const byId = new Map<string, Anchor>();
    const compile = (id: string): Anchor => {
      const cached = byId.get(id);
      if (cached) return cached;
      const definition = recipe.anchors.find((item) => item.id === id)!;
      const parent = definition.parent ? compile(definition.parent) : undefined;
      const anchor: Anchor = { definition, parent, curve: new Curve(definition.poses), position: [0, 0, 0], angle: 0 };
      byId.set(id, anchor);
      this.anchors.push(anchor);
      return anchor;
    };
    for (const anchor of recipe.anchors) compile(anchor.id);
    const range = (id: string) => this.geometry.organs.find((organ) => organ.id === id)!;
    this.stems = recipe.stems.map((definition) => ({
      definition,
      start: range(definition.id).start,
      path: definition.path.map((id) => byId.get(id)!),
      curve: new Curve(definition.radii),
      cos: Array.from({ length: definition.sides }, (_, i) => Math.cos((i / definition.sides) * Math.PI * 2)),
      sin: Array.from({ length: definition.sides }, (_, i) => Math.sin((i / definition.sides) * Math.PI * 2))
    }));
    this.leaves = recipe.leaves.map((definition) => ({
      definition,
      start: range(definition.id).start,
      anchor: byId.get(definition.anchor)!,
      surface: recipe.surfaces.find((s) => s.id === definition.surface)!,
      curve: new Curve(definition.poses),
      length: 0
    }));
    this.meshes = (recipe.meshes ?? []).map((definition) => ({
      definition,
      start: range(definition.id).start,
      anchor: byId.get(definition.anchor)!,
      curve: new Curve(definition.poses)
    }));
    this.volumes = recipe.volumes.map((definition) => {
      const leaf = definition.followLeaf
        ? this.leaves.find((leaf) => leaf.definition.id === definition.followLeaf!.id)!
        : undefined;
      let referenceLength = 0;
      if (leaf) {
        const age = definition.followLeaf!.untilAge,
          cursor = leaf.curve.at(age),
          index = leaf.surface.lengthSample;
        referenceLength =
          Math.hypot(
            interpolate(cursor.a[index][0], cursor.b[index][0], cursor.t),
            interpolate(cursor.a[index][1], cursor.b[index][1], cursor.t),
            interpolate(cursor.a[index][2], cursor.b[index][2], cursor.t)
          ) * (leaf.definition.scale ? sampleScalarCurve(leaf.definition.scale, age) : 1);
      }
      return {
        definition,
        start: range(definition.id).start,
        anchor: byId.get(definition.anchor)!,
        curve: new Curve(definition.poses),
        leaf,
        referenceLength
      };
    });
    this.smoothVertexCount = this.volumes[0]?.start ?? this.positions.length;
    this.smoothIndexCount = this.geometry.indices.length - this.volumes.length * 60;
  }

  /** Validation is read-only, including when this evaluator backs shared mature geometry. */
  validateAnchorOffsets(offsets: ReadonlyMap<string, readonly [number, number, number]>): void {
    for (const [id, offset] of offsets) {
      if (
        !this.anchors.some((anchor) => anchor.definition.id === id) ||
        offset.length !== 3 ||
        !offset.every(Number.isFinite)
      )
        throw new Error("无效植物锚点位移");
    }
  }

  /** Instance-local displacement in parent-anchor coordinates; immutable authoring content stays intact. */
  setAnchorOffsets(offsets: ReadonlyMap<string, readonly [number, number, number]>): boolean {
    this.validateAnchorOffsets(offsets);
    if (
      offsets.size === this.anchorOffsets.size &&
      [...offsets].every(([id, value]) => {
        const old = this.anchorOffsets.get(id);
        return old && value.every((v, i) => v === old[i]);
      })
    )
      return false;
    this.anchorOffsets = new Map([...offsets].map(([id, value]) => [id, [...value]]));
    return true;
  }

  update(value: number, shape: PlantShape = DEFAULT_PLANT_SHAPE): PlantGeometry {
    if (!Number.isFinite(value)) throw new Error("生长进度必须是有限数值");
    if (
      !Number.isFinite(shape.leafSpread) ||
      shape.leafSpread < 0.5 ||
      shape.leafSpread > 1.5 ||
      !Number.isFinite(shape.stemBend) ||
      shape.stemBend < 0 ||
      shape.stemBend > 2 ||
      !Number.isFinite(shape.fruitScale) ||
      shape.fruitScale < 0.5 ||
      shape.fruitScale > 1.5
    )
      throw new Error("株型参数超出范围");
    const age = Math.max(0, Math.min(1, value)),
      positions = this.positions,
      normals = this.normals;
    for (const anchor of this.anchors) {
      const { a, b, t } = anchor.curve.at(age),
        parent = anchor.parent;
      const offset = this.anchorOffsets.get(anchor.definition.id);
      const x = interpolate(a.offset[0], b.offset[0], t) + (offset?.[0] ?? 0),
        y = interpolate(a.offset[1], b.offset[1], t) + (offset?.[1] ?? 0),
        z = interpolate(a.offset[2], b.offset[2], t) + (offset?.[2] ?? 0);
      const c = Math.cos(parent?.angle ?? 0),
        s = Math.sin(parent?.angle ?? 0),
        p = anchor.position;
      p[0] = parent ? parent.position[0] + (x * c - z * s) * shape.stemBend : x;
      p[1] = (parent?.position[1] ?? 0) + y;
      p[2] = parent ? parent.position[2] + (x * s + z * c) * shape.stemBend : z;
      anchor.angle = (parent?.angle ?? 0) + mixPlantAngle(a.azimuth, b.azimuth, t);
    }
    for (const stem of this.stems) {
      const { a, b, t } = stem.curve.at(age),
        { path, definition, start } = stem;
      for (let i = 0; i < path.length; i++) {
        const p = path[i].position,
          prev = path[Math.max(0, i - 1)].position,
          next = path[Math.min(path.length - 1, i + 1)].position;
        const direction = i === 0 ? definition.startDirection : undefined;
        let tx = direction ? direction[0] : next[0] - prev[0],
          ty = direction ? direction[1] : next[1] - prev[1],
          tz = direction ? direction[2] : next[2] - prev[2];
        let n = Math.hypot(tx, ty, tz);
        if (n <= 1e-12) {
          tx = 0;
          ty = 1;
          tz = 0;
          n = 1;
        }
        tx /= n;
        ty /= n;
        tz /= n;
        let rx = Math.abs(ty) > 0.95 ? ty : -tz,
          ry = Math.abs(ty) > 0.95 ? -tx : 0,
          rz = Math.abs(ty) > 0.95 ? 0 : tx;
        n = Math.hypot(rx, ry, rz);
        rx /= n;
        ry /= n;
        rz /= n;
        const ux = ry * tz - rz * ty,
          uy = rz * tx - rx * tz,
          uz = rx * ty - ry * tx,
          radius = interpolate(a[i], b[i], t);
        for (let side = 0; side < definition.sides; side++) {
          const out = positions[start + i * definition.sides + side],
            c = stem.cos[side],
            s = stem.sin[side];
          out[0] = p[0] + (rx * c + ux * s) * radius;
          out[1] = p[1] + (ry * c + uy * s) * radius;
          out[2] = p[2] + (rz * c + uz * s) * radius;
        }
      }
      for (let cap = 0; cap < 2; cap++) {
        const out = positions[start + path.length * definition.sides + cap],
          p = path[cap === 0 ? 0 : path.length - 1].position;
        out[0] = p[0];
        out[1] = p[1];
        out[2] = p[2];
      }
    }
    let leafCount = 0;
    for (const leaf of this.leaves) {
      const { a, b, t } = leaf.curve.at(age),
        scale = leaf.definition.scale ? sampleScalarCurve(leaf.definition.scale, age) : 1;
      if (scale > 1e-5) leafCount++;
      const origin = leaf.anchor.position,
        c = Math.cos(leaf.anchor.angle),
        s = Math.sin(leaf.anchor.angle);
      for (let i = 0; i < a.length; i++) {
        const x = interpolate(a[i][0], b[i][0], t) * scale,
          y = interpolate(a[i][1], b[i][1], t) * scale,
          z = interpolate(a[i][2], b[i][2], t) * scale;
        const out = positions[leaf.start + i];
        out[0] = origin[0] + (x * c - z * s) * shape.leafSpread;
        out[1] = origin[1] + y;
        out[2] = origin[2] + (x * s + z * c) * shape.leafSpread;
        if (i === leaf.surface.lengthSample) leaf.length = Math.hypot(x, y, z);
      }
    }
    let meshFruitCount = 0;
    for (const mesh of this.meshes) {
      const { a, b, t } = mesh.curve.at(age),
        def = mesh.definition;
      if (a.scale.some((v, i) => interpolate(v, b.scale[i], t) > 1e-5)) {
        if (def.kind === "leaf") leafCount++;
        if (def.kind === "fruit") meshFruitCount++;
      }
      for (let i = 0; i < def.positions.length; i++)
        writeMeshOrganPoint(
          positions[mesh.start + i],
          def.positions[i],
          a,
          b,
          t,
          mesh.anchor.position,
          mesh.anchor.angle,
          def.kind === "leaf" ? shape.leafSpread : 1,
          def.kind === "fruit" ? shape.fruitScale : 1
        );
    }
    for (let i = 0; i < this.smoothVertexCount; i++) {
      const n = normals[i];
      n[0] = n[1] = n[2] = 0;
    }
    const indices = this.geometry.indices;
    for (let i = 0; i < this.smoothIndexCount; i += 3) {
      const ai = indices[i],
        bi = indices[i + 1],
        ci = indices[i + 2],
        a = positions[ai],
        b = positions[bi],
        c = positions[ci];
      const x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2],
        u = c[0] - a[0],
        v = c[1] - a[1],
        w = c[2] - a[2];
      const nx = y * w - z * v,
        ny = z * u - x * w,
        nz = x * v - y * u;
      for (let j = 0; j < 3; j++) {
        const n = normals[indices[i + j]];
        n[0] += nx;
        n[1] += ny;
        n[2] += nz;
      }
    }
    for (let i = 0; i < this.smoothVertexCount; i++) {
      const n = normals[i],
        length = Math.hypot(n[0], n[1], n[2]);
      if (length > 1e-12) {
        n[0] /= length;
        n[1] /= length;
        n[2] /= length;
      } else {
        n[0] = 0;
        n[1] = 1;
        n[2] = 0;
      }
    }
    let fruitCount = meshFruitCount;
    for (const volume of this.volumes) {
      const { a, b, t } = volume.curve.at(age),
        def = volume.definition;
      const offsetScale =
        volume.leaf && age < def.followLeaf!.untilAge && volume.referenceLength > 1e-6
          ? volume.leaf.length / volume.referenceLength
          : 1;
      const x = interpolate(a.offset[0], b.offset[0], t) * offsetScale,
        y = interpolate(a.offset[1], b.offset[1], t) * offsetScale,
        z = interpolate(a.offset[2], b.offset[2], t) * offsetScale;
      const c = Math.cos(volume.anchor.angle),
        s = Math.sin(volume.anchor.angle),
        spread = volume.leaf ? shape.leafSpread : 1,
        origin = volume.anchor.position;
      const cx = origin[0] + (x * c - z * s) * spread,
        cy = origin[1] + y,
        cz = origin[2] + (x * s + z * c) * spread;
      const rx = interpolate(a.radii[0], b.radii[0], t),
        ry = interpolate(a.radii[1], b.radii[1], t),
        rz = interpolate(a.radii[2], b.radii[2], t);
      const scale = (def.scale ? sampleScalarCurve(def.scale, age) : 1) * (def.kind === "fruit" ? shape.fruitScale : 1);
      if (def.kind === "fruit" && scale > 1e-5 && (rx > 1e-5 || ry > 1e-5 || rz > 1e-5)) fruitCount++;
      for (let i = 0; i < ICOSAHEDRON_POINTS.length; i++) {
        const p = ICOSAHEDRON_POINTS[i],
          out = positions[volume.start + i],
          n = normals[volume.start + i];
        out[0] = cx + p[0] * rx * scale;
        out[1] = cy + p[1] * ry * scale;
        out[2] = cz + p[2] * rz * scale;
        n[0] = p[0] / Math.max(1e-12, rx);
        n[1] = p[1] / Math.max(1e-12, ry);
        n[2] = p[2] / Math.max(1e-12, rz);
        const length = Math.hypot(n[0], n[1], n[2]);
        n[0] /= length;
        n[1] /= length;
        n[2] /= length;
      }
    }
    const min = this.geometry.bounds.min as Point,
      max = this.geometry.bounds.max as Point;
    min[0] = min[1] = min[2] = Infinity;
    max[0] = max[1] = max[2] = -Infinity;
    for (const p of positions)
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], p[axis]);
        max[axis] = Math.max(max[axis], p[axis]);
      }
    this.geometry.age = age;
    this.geometry.maturity = sampleScalarCurve(this.recipe.maturity, age);
    this.geometry.leafCount = leafCount;
    this.geometry.fruitCount = fruitCount;
    return this.geometry;
  }
}
