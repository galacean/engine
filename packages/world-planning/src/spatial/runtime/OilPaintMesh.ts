import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Color,
  ContentRestorer,
  Material,
  MeshRenderer,
  ModelMesh,
  Shader,
  ShaderFactory,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3,
  Vector4,
  VertexElement,
  VertexElementFormat,
  type Engine,
  type Entity
} from "@galacean/engine";
import instancing from "@galacean/engine-terrain/shaders/shared/Instancing.glsl?raw";
import lodDither from "@galacean/engine-terrain/shaders/shared/LodDither.glsl?raw";
import proceduralTreeWind from "@galacean/engine-terrain/shaders/shared/ProceduralTreeWind.glsl?raw";
import groundWindField from "@galacean/engine-terrain/shaders/shared/GroundWindField.glsl?raw";
import shadow from "@galacean/engine-terrain/shaders/shared/Shadow.glsl?raw";
import {
  configureProceduralPlantWindMaterial,
  PROCEDURAL_TREE_WIND_PARAMS
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyRuntime";
import type { LandscapeBounds } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { roadGap, settlementRandom } from "../../semantic-study/SettlementGeometry";
import { compositionPoint } from "../SpatialCompositionGeometry";
import { spatialCompositionParameters } from "../SpatialCompositionParameters";
import type { OilPaintPigment, WorldTemplateArtDirection } from "../WorldTemplateArtDirection";
import { templateBaseSeed, templateLinearColor } from "../WorldTemplateCatalog";
import oilPaintShader from "./OilPaint.shader?raw";
import oilPaintWind from "./OilPaintWind.glsl?raw";
import { createOilPaintBrushData, oilBrushUV, oilUnderpaintUV } from "./OilPaintBrush";

type Point = [number, number, number];
/** Two palette indices and paint load, packed in the existing colour attribute. */
type Pigment = readonly [index: number, load: number, secondIndex: number];
type OilPaint = NonNullable<WorldTemplateArtDirection["oilPaint"]>;
type Ground = (x: number, z: number) => number | undefined;
type PaintWind = {
  kind: "tree" | "leaf" | "grass";
  root: Point;
  hinge?: Point;
  axis?: Point;
  progress: number | ((point: Point) => number);
};

const TAU = Math.PI * 2;
const palette = (swatches: readonly OilPaintPigment[], offset = 0): Pigment[] =>
  swatches.map((_, index) => [offset + index, 1, offset + index]);
const swatch = (colors: readonly Pigment[], t: number) =>
  colors[Math.min(colors.length - 1, Math.floor(Math.max(0, t) * colors.length))];
const scaled = (color: Pigment, gain: number): Pigment => [color[0], color[1] * gain, color[2]];

function paintNoise(seed: number, x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const u = smooth(x - ix),
    v = smooth(z - iz);
  const at = (dx: number, dz: number) => settlementRandom(seed, `paint-field:${ix + dx}:${iz + dz}`);
  return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v;
}

/** Brush UVs are shared by forward shading, shadow casting and depth. */
class PaintMesh {
  private readonly positions: Vector3[] = [];
  private readonly colors: Color[] = [];
  private readonly uv: Vector2[] = [];
  private readonly indices: number[] = [];
  private readonly authoredNormals: (Point | undefined)[] = [];
  private readonly wind: number[] = [];
  private windMargin = 0;

  face(
    points: readonly Point[],
    coordinates: readonly Vector2[],
    pigment: Pigment,
    seed: number,
    normals?: readonly Point[],
    wind?: PaintWind
  ) {
    const first = this.positions.length;
    for (const [i, point] of points.entries()) {
      this.positions.push(new Vector3(...point));
      this.colors.push(new Color(...pigment, seed));
      this.uv.push(coordinates[i]);
      this.authoredNormals.push(normals?.[i]);
      const progress = wind
        ? Math.max(0, Math.min(1, typeof wind.progress === "number" ? wind.progress : wind.progress(point)))
        : 0;
      const root = wind?.root ?? [0, 0, 0];
      const hinge = wind?.hinge ?? root;
      this.wind.push(...(wind?.axis ?? [0, 0, 0]), progress, ...root, ...hinge);
      if (wind && progress > 0) {
        const radius = Math.hypot(...point.map((value, axis) => value - root[axis]));
        // Bound angular travel, not an arbitrary padding. Ground authoring may
        // change its bend angle at runtime, so contain the full blade rotation.
        let travel =
          wind.kind === "grass"
            ? 2 * radius
            : 2 * radius * Math.sin(PROCEDURAL_TREE_WIND_PARAMS.maximumWholeTreeBendRadians / 2);
        if (wind.kind === "leaf") {
          const leafRadius = Math.hypot(...point.map((value, axis) => value - hinge[axis]));
          travel += 2 * leafRadius * Math.sin(PROCEDURAL_TREE_WIND_PARAMS.maximumLeafFlutterRadians / 2);
        }
        this.windMargin = Math.max(this.windMargin, travel);
      }
    }
    for (let i = 1; i + 1 < points.length; i++) this.indices.push(first, first + i, first + i + 1);
  }

  stroke(
    center: Point,
    along: Point,
    across: Point,
    pigment: Pigment,
    seed: number,
    ground?: Ground,
    wind?: PaintWind
  ) {
    // Face the ground and the outside of bark: across x along is the
    // outward normal for the stroke frames supplied by both generators.
    const outline = [
      [-1, -1],
      [-1, 1],
      [1, 1],
      [1, -1]
    ];
    const points: Point[] = outline.map(([u, v]) => {
      const x = center[0] + along[0] * u + across[0] * v;
      const z = center[2] + along[2] * u + across[2] * v;
      const y = ground?.(x, z) ?? center[1] + along[1] * u + across[1] * v;
      return [x, y, z];
    });
    this.face(
      points,
      outline.map(([u, v]) => new Vector2(...oilBrushUV(v * 0.5 + 0.5, u * 0.5 + 0.5, seed))),
      pigment,
      seed,
      undefined,
      wind
    );
  }

  upload(engine: Engine, name: string): ModelMesh | undefined {
    if (!this.indices.length) return;
    const mesh = new ModelMesh(engine, name);
    mesh.bounds.min.set(Infinity, Infinity, Infinity);
    mesh.bounds.max.set(-Infinity, -Infinity, -Infinity);
    for (const point of this.positions) {
      Vector3.min(mesh.bounds.min, point, mesh.bounds.min);
      Vector3.max(mesh.bounds.max, point, mesh.bounds.max);
    }
    const margin = new Vector3(this.windMargin, this.windMargin, this.windMargin);
    mesh.bounds.min.subtract(margin);
    mesh.bounds.max.add(margin);
    // Keep topology alongside the brush UVs and pigment indices; all passes
    // read it, and ordinary native GPU instances continue sharing this mesh.
    mesh.setVertexElements([
      new VertexElement("PLANT_WIND", 0, VertexElementFormat.Vector4, 0),
      new VertexElement("PAINT_ROOT", 16, VertexElementFormat.Vector3, 0),
      new VertexElement("PAINT_HINGE", 28, VertexElementFormat.Vector3, 0)
    ]);
    mesh.setVertexBufferBinding(
      new Buffer(engine, BufferBindFlag.VertexBuffer, new Float32Array(this.wind), BufferUsage.Static, true),
      40,
      0
    );
    mesh.setPositions(this.positions);
    // Area-weighted normals follow the actual triangulated surface, including
    // ground strokes draped over slopes. Build once, rather than per fragment.
    const normals = this.positions.map(() => new Vector3());
    const ab = new Vector3(),
      ac = new Vector3(),
      normal = new Vector3();
    for (let i = 0; i < this.indices.length; i += 3) {
      const a = this.indices[i],
        b = this.indices[i + 1],
        c = this.indices[i + 2];
      Vector3.subtract(this.positions[b], this.positions[a], ab);
      Vector3.subtract(this.positions[c], this.positions[a], ac);
      Vector3.cross(ab, ac, normal);
      normals[a].add(normal);
      normals[b].add(normal);
      normals[c].add(normal);
    }
    for (const [i, normal] of normals.entries()) {
      const authored = this.authoredNormals[i];
      if (authored) normal.set(...authored);
      normal.normalize();
    }
    mesh.setNormals(normals);
    mesh.setColors(this.colors);
    mesh.setUVs(this.uv);
    mesh.setIndices(this.positions.length <= 65536 ? Uint16Array.from(this.indices) : Uint32Array.from(this.indices));
    mesh.addSubMesh(0, this.indices.length);
    mesh.uploadData(true);
    return mesh;
  }
}

const brushTextures = new WeakMap<Engine, Texture2D>();
class BrushRestorer extends ContentRestorer<Texture2D> {
  restoreContent(): void {
    this.resource.setPixelBuffer(createOilPaintBrushData().pixels);
    this.resource.generateMipmaps();
  }
}
function brushTexture(engine: Engine): Texture2D {
  let texture = brushTextures.get(engine);
  if (!texture || texture.destroyed) {
    const { width, height, pixels } = createOilPaintBrushData();
    texture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, true, false);
    texture.name = "Oil paint brush normals, pigment and coverage";
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.filterMode = TextureFilterMode.Trilinear;
    texture.anisoLevel = 4;
    texture.setPixelBuffer(pixels);
    texture.generateMipmaps();
    engine.resourceManager.addContentRestorer(new BrushRestorer(texture));
    brushTextures.set(engine, texture);
  }
  return texture;
}

export function oilPaintMaterial(
  engine: Engine,
  pigments: readonly OilPaintPigment[],
  base?: string,
  leafTransmittance = 0
): Material {
  let shader = Shader.find("Planning/OilPaint");
  if (!shader) {
    for (const [name, source] of Object.entries({
      "shared/Instancing.glsl": instancing,
      "shared/LodDither.glsl": lodDither,
      "shared/ProceduralTreeWind.glsl": proceduralTreeWind,
      "shared/GroundWindField.glsl": groundWindField,
      "shared/Shadow.glsl": shadow,
      "planning/OilPaintWind.glsl": oilPaintWind
    })) {
      if (!ShaderFactory.includeMap[name]) ShaderFactory.registerInclude(name, source);
    }
    shader = Shader.create(oilPaintShader);
  }
  const material = new Material(engine, shader);
  material.name = base ? "Painted tree pigment" : "Painted woodland floor";
  material.shaderData.setTexture("material_BaseTexture", brushTexture(engine));
  material.shaderData.setColor("material_BaseColor", new Color(1, 1, 1, 1));
  material.shaderData.setFloat("material_AlphaCutoff", 0.3);
  material.shaderData.enableMacro("MATERIAL_HAS_BASETEXTURE");
  material.shaderData.enableMacro("MATERIAL_IS_ALPHA_CUTOFF");
  material.shaderData.enableMacro("MATERIAL_OIL_PAINT_PALETTE_SIZE", String(pigments.length));
  material.shaderData.setFloat("material_GrowthStart", pigments.length);
  for (const [index, name] of ["Shade", "HalfTone", "Sunlight"].entries()) {
    material.shaderData.setFloatArray(
      `material_${name}Pigments`,
      new Float32Array(pigments.flatMap((pigment) => [...pigment[index]]))
    );
  }
  if (base) {
    material.shaderData.enableMacro("MATERIAL_OIL_PAINT_TREE");
    material.shaderData.setVector4("material_PigmentBase", new Vector4(...templateLinearColor(base), 1));
    configureProceduralPlantWindMaterial(material, leafTransmittance > 0);
  } else {
    material.shaderData.enableMacro("MATERIAL_ENABLE_WIND");
    material.shaderData.enableMacro("MATERIAL_WIND_GRASS_FLOWER_FIELD");
  }
  if (leafTransmittance > 0) {
    material.shaderData.enableMacro("MATERIAL_OIL_PAINT_LEAF");
    material.shaderData.setFloat("material_LeafTransmittance", leafTransmittance);
  }
  return material;
}

/** Cover the published composition with metre-sized strokes. Detail is concentrated
 * around the navigable trail and partitioned into cullable terrain tiles. */
export function mountOilPaintGround(
  parent: Entity,
  plan: IslandPlan,
  anchor: Point,
  ground: Ground,
  art: OilPaint,
  material: Material
): ModelMesh[] {
  const q = spatialCompositionParameters(plan.parameters.spatialComposition);
  if (!q.enabled) return [];
  const floorPigments = palette(art.groundPigments),
    trailPigments = palette(art.trailPigments, floorPigments.length),
    growthPigments = palette(art.growthPigments, floorPigments.length + trailPigments.length);
  material.shaderData.setFloat("material_GrowthStart", floorPigments.length + trailPigments.length);
  const routes = plan.routes;
  const tileSize = 32;
  const paintHeight = 0.024;
  const sample = (x: number, z: number) => {
    const height = ground(x + anchor[0], z + anchor[2]);
    return height === undefined ? undefined : height - anchor[1] + paintHeight;
  };
  const meshes: ModelMesh[] = [];
  const seed = plan.parameters.seed;
  for (let z0 = -q.frontDepthM; z0 < q.backDepthM; z0 += tileSize) {
    for (let x0 = -q.widthM / 2; x0 < q.widthM / 2; x0 += tileSize) {
      const endX = Math.min(x0 + tileSize, q.widthM / 2);
      const endZ = Math.min(z0 + tileSize, q.backDepthM);
      const center = compositionPoint(q, (x0 + endX) / 2, (z0 + endZ) / 2);
      const gap = roadGap(center, routes);
      // A stroke seen from across several tiles occupies fewer pixels. Use
      // larger, sparser strokes there instead of drawing subpixel texture.
      const step = art.groundStrokeM * (1 + Math.min(Math.max(gap, 0) / tileSize, 1) * 1.5);
      const paint = new PaintMesh();
      for (let row = 0, z = z0; z < endZ; row++, z += step) {
        for (let column = 0, x = x0; x < endX; column++, x += step) {
          const id = `floor:${x0}:${z0}:${column}:${row}`;
          const roll = (field: string) => settlementRandom(seed, id + field);
          const point = compositionPoint(
            q,
            x + Math.min(step, endX - x) * roll("x"),
            z + Math.min(step, endZ - z) * roll("z")
          );
          const localX = point.x - anchor[0],
            localZ = point.z - anchor[2];
          const y = sample(localX, localZ);
          if (y === undefined) continue;
          const gap = roadGap(point, routes);
          const onTrail = gap < 0;
          const angle = (roll("angle") - 0.5) * Math.PI + (q.headingDegrees * Math.PI) / 180;
          const cos = Math.cos(angle),
            sin = Math.sin(angle);
          // Overlapping loaded marks cover the ground; the ragged ends expose
          // other pigment instead of large bare patches of the terrain below.
          const length = step * (0.75 + roll("length") * 1.1);
          const width = step * (0.3 + roll("width") * 0.55);
          const rank = roll("pigment");
          // Source litter drifts: gold / orange / russet / brown occur in
          // patches, with occasional moss and bare earth on the actual trail.
          const patch =
            paintNoise(seed, point.x / 13, point.z / 13) * 1.9 + paintNoise(seed, point.x / 3.7, point.z / 3.7) * 0.5;
          const litter = (chance: number, variation: number): Pigment => {
            if (onTrail && chance < 0.62) return trailPigments[0];
            if ((chance * 7.31) % 1 < paintNoise(seed, point.x / 23, point.z / 23) * 0.1) return floorPigments[4];
            const mix = (patch + variation + 1) % 1;
            return floorPigments[mix < 0.42 ? 0 : mix < 0.7 ? 1 : mix < 0.84 ? 2 : 3];
          };
          const color = litter(rank, (roll("patch") - 0.5) * 0.3);
          const second = litter(roll("second-pigment"), 0.2 + (roll("second-patch") - 0.5) * 0.5);
          const thickness = rank * paintHeight * 0.55;
          paint.stroke(
            [localX, y + thickness, localZ],
            [cos * length, 0, sin * length],
            [-sin * width, 0, cos * width],
            [color[0], 1, second[0]],
            roll("bristle"),
            (x, z) => {
              const height = sample(x, z);
              return height === undefined ? undefined : height + thickness;
            }
          );
        }
      }
      // The source's green, gold and rust undergrowth shares this tile, brush
      // texture and draw call with the litter. Keep it outside the real road.
      const spacing = art.growthSpacingM;
      for (let z = z0; z < endZ; z += spacing) {
        for (let x = x0; x < endX; x += spacing) {
          const roll = (field: string) => settlementRandom(seed, `growth:${x}:${z}:${field}`);
          const point = compositionPoint(q, x + roll("x") * spacing, z + roll("z") * spacing);
          if (roadGap(point, routes) <= 0) continue;
          const drift = paintNoise(seed, point.x / 37, point.z / 37);
          const u = Math.max(0, Math.min(1, (drift - 0.46) / (0.7 - 0.46)));
          if (roll("chance") > 0.05 + 0.8 * u * u * (3 - 2 * u)) continue;
          const px = point.x - anchor[0],
            pz = point.z - anchor[2];
          const y = sample(px, pz);
          if (y === undefined) continue;
          const grass = roll("grass") < 0.22;
          const kind = (roll("kind") * 3.7 + Math.floor(paintNoise(seed, point.x / 14, point.z / 14) * 3) * 0.33) % 1;
          const pigment = growthPigments[grass ? 0 : kind < 0.45 ? 1 : kind < 0.75 ? 2 : 3];
          for (let blade = 0; blade < 6; blade++) {
            const angle = ((blade + roll(`turn:${blade}`)) / 6) * TAU;
            const dx = Math.cos(angle),
              dz = Math.sin(angle);
            const height = (0.45 + 0.4 * roll(`height:${blade}`)) * (grass ? 1 : 0.72);
            const lean = grass ? 0.12 + 0.4 * roll(`lean:${blade}`) : 0.9 + 1.3 * roll(`lean:${blade}`);
            const width = (grass ? 0.04 : 0.17) * (0.8 + 0.5 * roll(`width:${blade}`));
            const along: Point = [(dx * lean * height) / 2, height / 2, (dz * lean * height) / 2];
            paint.stroke(
              [px + along[0], y + along[1], pz + along[2]],
              along,
              [(-dz * width) / 2, 0, (dx * width) / 2],
              pigment,
              roll(`brush:${blade}`),
              undefined,
              { kind: "grass", root: [px, y, pz], progress: (point) => (point[1] - y) / height }
            );
          }
        }
      }
      const mesh = paint.upload(parent.engine, "Ground pigment tile");
      if (!mesh) continue;
      meshes.push(mesh);
      const renderer = parent.createChild("Ground pigment tile").addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      renderer.castShadows = false;
      renderer.receiveShadows = true;
    }
  }
  return meshes;
}

const woodUV = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1]
].map(([u, v]) => new Vector2(...oilUnderpaintUV(u, v)));

function paintBranch(
  mesh: PaintMesh,
  centers: readonly Point[],
  radii: readonly number[],
  sides: number,
  pigments: readonly Pigment[],
  random: (key: string) => number,
  wind: PaintWind
) {
  const start = new Vector3(...centers[0]),
    end = new Vector3(...centers[centers.length - 1]);
  const direction = end.subtract(start).normalize();
  const side =
    Math.hypot(direction.x, direction.z) > Number.EPSILON
      ? new Vector3(direction.z, 0, -direction.x).normalize()
      : new Vector3(1, 0, 0);
  const across = new Vector3();
  Vector3.cross(direction, side, across);
  across.normalize();
  const spin = random("spin") * TAU;
  const radial = (angle: number, radius: number): Point => [
    (side.x * Math.cos(angle) + across.x * Math.sin(angle)) * radius,
    (side.y * Math.cos(angle) + across.y * Math.sin(angle)) * radius,
    (side.z * Math.cos(angle) + across.z * Math.sin(angle)) * radius
  ];
  const rings = centers.map((center, ring) =>
    Array.from({ length: sides }, (_, facet) => {
      const angle = spin + (facet * TAU) / sides;
      const r = radial(angle, radii[ring] * (0.85 + random(`radius:${facet}`) * 0.3));
      return center.map((value, axis) => value + r[axis]) as Point;
    })
  );
  for (let face = 0; face < sides; face++) {
    const next = (face + 1) % sides;
    // Pigment variation is intrinsic to the bark; illumination comes from
    // the scene light, not a baked direction that rotates with each tree.
    const underpaint = swatch(pigments, random(`underpaint:${face}`));
    for (let ring = 1; ring < rings.length; ring++) {
      const grain = random(`bark:${face}:${ring}`);
      const corners = [rings[ring - 1][face], rings[ring - 1][next], rings[ring][next], rings[ring][face]];
      // A low-sided cylinder still has a round normal field. Separate paint
      // faces must not turn the trunk into disconnected, flat-shaded boards.
      const normals = corners.map(
        (point, index) => point.map((value, axis) => value - centers[index < 2 ? ring - 1 : ring][axis]) as Point
      );
      mesh.face(corners, woodUV, [underpaint[0], -1, underpaint[2]], grain, normals, wind);
      // Lay a second knife stroke on each facet, with staggered lengths
      // and a narrow exposed edge of the dark underpainting.
      const at = (u: number, v: number) =>
        corners[0].map(
          (p, axis) =>
            (1 - u) * (p * (1 - v) + corners[1][axis] * v) + u * (corners[3][axis] * (1 - v) + corners[2][axis] * v)
        ) as Point;
      const center = at(0.41 + grain * 0.2, 0.47);
      const offset = radial(spin + ((face + 0.5) * TAU) / sides, radii[ring - 1] * 0.014);
      const lower = at(0.09, 0.47),
        left = at(0.5, 0.15);
      const along = at(0.89, 0.47).map((v, axis) => (v - lower[axis]) * (0.35 + grain * 0.25)) as Point;
      const width = at(0.5, 0.85).map((v, axis) => (v - left[axis]) * (0.31 + grain * 0.27)) as Point;
      mesh.stroke(
        center.map((v, axis) => v + offset[axis]) as Point,
        along,
        width,
        swatch(pigments, grain),
        grain,
        undefined,
        wind
      );
    }
  }
}

/** Species share placement bounds with native vegetation. Tree shape and stroke
 * locations stay fixed as LOD replaces fine brushwork with fewer, broader dabs. */
export function buildOilPaintTree(engine: Engine, asset: string, bounds: LandscapeBounds, lod: number, art: OilPaint) {
  const bark = new PaintMesh(),
    canopy = new PaintMesh();
  const leafPigments = palette(art.canopyPigments);
  const seed = templateBaseSeed(asset);
  const random = (key: string) => settlementRandom(seed, key);
  // Bark families belong to a whole tree, as in the source. Mixing pale
  // birch paint into every trunk made all species look like grey stripes.
  const woodPigments = [swatch(palette(art.barkPigments), random("bark-family"))];
  const height = bounds.max[1] - bounds.min[1];
  const rx = (bounds.max[0] - bounds.min[0]) * 0.5,
    rz = (bounds.max[2] - bounds.min[2]) * 0.5;
  const width = Math.sqrt(rx * rz);
  const bend = (random("bend") - 0.5) * width * 0.24;
  const stem = (t: number): Point => [
    (bounds.min[0] + bounds.max[0]) / 2 + bend * t * t,
    bounds.min[1] + height * t,
    (bounds.min[2] + bounds.max[2]) / 2 - bend * t * (1 - t)
  ];
  const radius = Math.min(height * (0.017 + random("trunk") * 0.012), width * 0.23);
  const knots = [0, 0.06, 0.18, 0.32, 0.47, 0.61, 0.76, 0.91];
  paintBranch(
    bark,
    knots.map(stem),
    knots.map((t) => radius * (1 - t) * (t === 0 ? 1.48 : 1)),
    8,
    woodPigments,
    random,
    { kind: "tree", root: stem(0), progress: (point) => (point[1] - bounds.min[1]) / height }
  );
  const limbCount = 9;
  const dabsPerLimb = [50, 22, 10][Math.min(lod, 2)];
  // Twice as many finer marks, but two triangles per mark instead of five.
  const leafScale = [1, 1.29, 1.69][Math.min(lod, 2)] / Math.sqrt(2);
  const turn = Math.PI * (3 - Math.sqrt(5));
  for (let limb = 0; limb < limbCount; limb++) {
    const roll = (key: string) => random(`limb:${limb}:${key}`);
    const t = limb / (limbCount - 1);
    const base = stem(0.43 + t * 0.34 + roll("height") * 0.045);
    const angle = limb * turn + roll("turn") * 0.57;
    const spread = (1 - t * 0.75) * (0.53 + roll("spread") * 0.36);
    const offsetX = Math.cos(angle) * rx * spread,
      offsetZ = Math.sin(angle) * rz * spread;
    const rise = height * (0.105 + roll("rise") * 0.085);
    const tip: Point = [base[0] + offsetX, base[1] + rise, base[2] + offsetZ];
    const elbow: Point = [base[0] + offsetX * 0.63, base[1] + rise * 0.36, base[2] + offsetZ * 0.63];
    const branchRadius = radius * (0.48 - t * 0.26);
    paintBranch(
      bark,
      [base, elbow, tip],
      [branchRadius, branchRadius * 0.64, branchRadius * 0.13],
      5,
      woodPigments,
      roll,
      { kind: "tree", root: stem(0), progress: (base[1] - bounds.min[1]) / height }
    );

    const clusterTone = roll("tone");
    for (let dab = 0; dab < dabsPerLimb; dab++) {
      const pick = (key: string) => roll(`dab:${dab}:${key}`);
      const azimuth = pick("azimuth") * TAU,
        y = pick("up") * 2 - 1;
      const r = Math.cbrt(pick("radius")) * Math.sqrt(1 - y * y);
      const center: Point = [
        tip[0] + r * Math.cos(azimuth) * rx * 0.48,
        Math.min(bounds.max[1] - height * 0.035, tip[1] + y * height * 0.102),
        tip[2] + r * Math.sin(azimuth) * rz * 0.48
      ];
      const size = leafScale * Math.max(width * 0.145, height * 0.034) * (0.61 + pick("size") * 0.74);
      const yaw = azimuth + pick("yaw");
      const tilt = pick("tilt") - 0.5;
      const along: Point = [Math.cos(yaw) * size, tilt * size, Math.sin(yaw) * size];
      const across: Point = [-Math.sin(yaw) * size * tilt, size * 0.42, Math.cos(yaw) * size * tilt];
      const tone = Math.min(0.999, clusterTone * 0.48 + pick("pigment") * 0.46 + 0.065);
      const color = scaled(swatch(leafPigments, tone), 0.72 + pick("load") * 0.42 + (y + 1) * 0.12);
      canopy.stroke(center, along, across, color, pick("grain"), undefined, {
        kind: "leaf",
        root: stem(0),
        hinge: center.map((value, axis) => value - along[axis]) as Point,
        axis: across,
        progress: (base[1] - bounds.min[1]) / height
      });
    }
  }
  return {
    bark: bark.upload(engine, asset + " painted bark")!,
    leaf: canopy.upload(engine, asset + " painted crown")!
  };
}
