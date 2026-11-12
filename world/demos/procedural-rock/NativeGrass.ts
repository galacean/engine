import { rockGrassShader } from "./SurfaceShaders";
import { BoundingBox, Color, Engine, Entity, Material, MeshRenderer, Vector3 } from "@galacean/engine";
import type { CliffEnvironment } from "./Environment";
import type { GrassCoveredSurface } from "./GrassCoverage";
import { bindRockGrassGroundMaterial } from "./RockMaterial";
import { smoothstep } from "./GrassCoverage";
import { bindSeedWorldGrassColorField } from "@galacean/engine-vegetation/world/SeedWorldGrassColorFieldUniforms";
import { bindSeedWorldGrassTerrainMaterial } from "@galacean/engine-world-planning/runtime/SeedWorldGrassTerrainSurface";
import {
  createNativeGrassInstancedMesh,
  NATIVE_GRASS_TRANSFORM_FLOATS,
  type NativeGrassInstancedMesh
} from "./NativeGrassBindings";

const MIN_SUPPORT_UP = 0.05;
const MAX_INSTANCES = 20000;
const ROOT_LIFT = 0.015;
const ROOT_OFFSETS = [
  [0.06, 0],
  [-0.06, 0],
  [0, 0.06],
  [0, -0.06]
] as const;

interface Triangle {
  a: number;
  b: number;
  c: number;
  nx: number;
  ny: number;
  nz: number;
  denominator: number;
}

interface SurfaceHit {
  y: number;
  triangle: Triangle;
}
interface SampledRoots {
  transforms: Float32Array;
  appearance: Float32Array;
}

/** Authored Seed grass rooted in an exposed rock's final world-space geometry. */
export class NativeRockGrass {
  private batchRoot?: Entity;
  private resources: NativeGrassInstancedMesh[] = [];
  private materials: Material[] = [];
  private visible = true;
  private textureScale = 1;
  private readonly stoneColor = new Vector3(1, 1, 1);
  /** Number of grass instances, shared by all authored renderer primitives. */
  count = 0;
  /** Actual submitted triangle count across all authored renderer primitives. */
  triangles = 0;

  /**
   * @param engine GPU resource owner.
   * @param root Identity-transform world parent; surface positions are already transformed.
   * @param environment Borrowed native Seed grass primitives and shared colour field.
   */
  constructor(
    private readonly engine: Engine,
    private readonly root: Entity,
    private readonly environment: CliffEnvironment
  ) {}

  /**
   * Replaces grass using deterministic area sampling of exposed, supported platforms.
   * @param surface Final rendered world-space rock geometry, including its grounded placement.
   * @param density Candidate instances per square metre; zero clears all grass.
   * @param seed Deterministic sampling seed.
   */
  rebuild(surface: GrassCoveredSurface, density: number, seed: number): void {
    this.dispose();
    density = Number.isFinite(density) ? Math.max(0, density) : 0;
    if (!density || surface.indices.length < 3) return;
    const { transforms, appearance } = sampleRoots(surface, density, seed);
    this.count = transforms.length / NATIVE_GRASS_TRANSFORM_FLOATS;
    if (!this.count) return;

    const batchRoot = (this.batchRoot = this.root.createChild("Native Seed rock grass"));
    batchRoot.isActive = this.visible;
    try {
      for (const binding of this.environment.grass) {
        // Source-local transforms and the authored scale also determine conservative culling bounds.
        const authored = new BoundingBox();
        BoundingBox.transform(binding.mesh.bounds, binding.localMatrix, authored);
        const radius =
          Math.hypot(
            Math.max(Math.abs(authored.min.x), Math.abs(authored.max.x)),
            Math.max(Math.abs(authored.min.y), Math.abs(authored.max.y)),
            Math.max(Math.abs(authored.min.z), Math.abs(authored.max.z))
          ) *
            1.1 +
          1;
        const bounds = new BoundingBox(
          new Vector3(surface.bounds[0][0] - radius, surface.bounds[0][1] - radius, surface.bounds[0][2] - radius),
          new Vector3(surface.bounds[1][0] + radius, surface.bounds[1][1] + radius, surface.bounds[1][2] + radius)
        );
        const resource = createNativeGrassInstancedMesh(this.engine, binding.mesh, transforms, appearance, bounds);
        this.resources.push(resource);
        const material = binding.material.clone();
        material.shader = rockGrassShader();
        this.materials.push(material);
        material.shaderData.enableMacro("MATERIAL_GRASS_SHARED_COLOR_FIELD");
        material.shaderData.setFloat("material_GrassDistanceFadeEnable", 0);
        bindSeedWorldGrassColorField(material.shaderData, "material", this.environment.field);
        bindRockGrassGroundMaterial(this.engine, material, {
          textureScale: this.textureScale,
          colorBlend: { color: [this.stoneColor.x, this.stoneColor.y, this.stoneColor.z] }
        });
        // Native rock-appearance contact borrows terrain resources without using ground-grass placement.
        bindSeedWorldGrassTerrainMaterial(material, this.environment.terrain.material);
        // This laboratory's rock material has no terrain-contact blend; its attached grass must agree.
        material.shaderData.disableMacro("MATERIAL_TERRAIN_HEIGHT_FIELD");
        const renderer = batchRoot.createChild("Authored grass batch").addComponent(MeshRenderer);
        renderer.mesh = resource.mesh;
        renderer.setMaterial(material);
        renderer.castShadows = false;
        renderer.receiveShadows = true;
        renderer.enableVertexColor = binding.enableVertexColor;
        renderer.shaderData.enableMacro("RENDERER_SEED_WORLD_DETAIL_COMPACT");
        renderer.shaderData.enableMacro("RENDERER_SURFACE_GRASS_ATTACHMENT");
        renderer.shaderData.enableMacro("RENDERER_ROCK_GRASS_GROUND");
        renderer.shaderData.enableMacro("RENDERER_GRASS_ROCK_APPEARANCE");
        renderer.shaderData.setMatrix("renderer_DetailLocalMatrix", binding.localMatrix);
        renderer.shaderData.setMatrix("renderer_DetailLocalNormalMat", binding.localNormalMatrix);
        this.triangles += binding.mesh.subMeshes.reduce((sum, subMesh) => sum + subMesh.count / 3, 0) * this.count;
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Attached roots sample the owning rock’s shared texture with its own tint and tiling. */
  setStoneSurface(hex: string, textureScale: number): void {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    const rgb = Number.parseInt(hex.slice(1), 16);
    this.stoneColor.set(
      Color.sRGBToLinearSpace((rgb >>> 16) / 255),
      Color.sRGBToLinearSpace(((rgb >>> 8) & 255) / 255),
      Color.sRGBToLinearSpace((rgb & 255) / 255)
    );
    this.textureScale = textureScale;
    for (const material of this.materials)
      bindRockGrassGroundMaterial(this.engine, material, {
        textureScale,
        colorBlend: { color: [this.stoneColor.x, this.stoneColor.y, this.stoneColor.z] }
      });
  }

  /** Changes visibility immediately and preserves that choice through future rebuilds. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.batchRoot) this.batchRoot.isActive = visible;
  }

  /** Releases owned batches, cloned materials and buffers; borrowed Prefab/field resources survive. */
  dispose(): void {
    this.batchRoot?.destroy();
    this.batchRoot = undefined;
    for (const resource of this.resources) {
      resource.mesh.destroy();
      resource.instanceBuffer.destroy();
      resource.indexBuffer?.destroy();
      resource.appearanceBuffer.destroy();
    }
    for (const material of this.materials) material.destroy();
    this.resources = [];
    this.materials = [];
    this.count = this.triangles = 0;
  }
}

export function sampleRoots(surface: GrassCoveredSurface, density: number, seed: number): SampledRoots {
  const { positions: p, normals, indices, bounds, grassCoverage } = surface;
  const cellSize = Math.max(0.5, Math.min(4, Math.max(bounds[1][0] - bounds[0][0], bounds[1][2] - bounds[0][2]) / 24));
  const grid = new Map<string, Triangle[]>(),
    eligible: Triangle[] = [],
    cumulative: number[] = [];
  let area = 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (ny <= 1e-10 || length <= 1e-10) continue;
    const triangle: Triangle = {
      a,
      b,
      c,
      nx: nx / length,
      ny: ny / length,
      nz: nz / length,
      denominator: (p[b + 2] - p[c + 2]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 2] - p[c + 2])
    };
    const loX = Math.floor(Math.min(p[a], p[b], p[c]) / cellSize),
      hiX = Math.floor(Math.max(p[a], p[b], p[c]) / cellSize);
    const loZ = Math.floor(Math.min(p[a + 2], p[b + 2], p[c + 2]) / cellSize),
      hiZ = Math.floor(Math.max(p[a + 2], p[b + 2], p[c + 2]) / cellSize);
    for (let x = loX; x <= hiX; x++)
      for (let z = loZ; z <= hiZ; z++) {
        const key = `${x},${z}`;
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(triangle);
      }
    if (
      triangle.ny <= MIN_SUPPORT_UP ||
      Math.max(p[a + 1], p[b + 1], p[c + 1]) <= 0.1 ||
      Math.max(grassCoverage[a / 3], grassCoverage[b / 3], grassCoverage[c / 3]) <= 0.25
    )
      continue;
    area += length * 0.5;
    eligible.push(triangle);
    cumulative.push(area);
  }
  if (!area) return { transforms: new Float32Array(), appearance: new Float32Array() };

  function topAt(x: number, z: number): SurfaceHit | undefined {
    let highest: SurfaceHit | undefined;
    const list = grid.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`);
    if (list)
      for (const triangle of list) {
        const { a, b, c, denominator } = triangle;
        const u = ((p[b + 2] - p[c + 2]) * (x - p[c]) + (p[c] - p[b]) * (z - p[c + 2])) / denominator;
        const v = ((p[c + 2] - p[a + 2]) * (x - p[c]) + (p[a] - p[c]) * (z - p[c + 2])) / denominator;
        if (u < -0.000001 || v < -0.000001 || u + v > 1.000001) continue;
        const y = u * p[a + 1] + v * p[b + 1] + (1 - u - v) * p[c + 1];
        if (!highest || y > highest.y) highest = { y, triangle };
      }
    return highest;
  }

  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
  const records: number[] = [],
    appearance: number[] = [];
  const candidates = Math.min(MAX_INSTANCES * 4, Math.round(area * density));
  for (
    let attempt = 0;
    attempt < candidates && records.length / NATIVE_GRASS_TRANSFORM_FLOATS < MAX_INSTANCES;
    attempt++
  ) {
    const target = random() * area;
    let lo = 0,
      hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const triangle = eligible[lo],
      { a, b, c, nx, ny, nz } = triangle;
    const u = Math.sqrt(random()),
      v = random(),
      wb = u * (1 - v),
      wc = u * v,
      wa = 1 - u;
    const x = wa * p[a] + wb * p[b] + wc * p[c];
    const y = wa * p[a + 1] + wb * p[b + 1] + wc * p[c + 1];
    const z = wa * p[a + 2] + wb * p[b + 2] + wc * p[c + 2];
    // Material, density, blade height and contact all interpolate this same coverage field.
    const normalX = wa * normals[a] + wb * normals[b] + wc * normals[c];
    const normalY = wa * normals[a + 1] + wb * normals[b + 1] + wc * normals[c + 1];
    const normalZ = wa * normals[a + 2] + wb * normals[b + 2] + wc * normals[c + 2];
    const normalLength = Math.hypot(normalX, normalY, normalZ);
    const up = normalLength > 1e-10 ? normalY / normalLength : ny;
    const coverage = wa * grassCoverage[a / 3] + wb * grassCoverage[b / 3] + wc * grassCoverage[c / 3];
    // Native GrassSurface.ts: blades finish before bare stone and shrink to zero in the fringe.
    const edgeScale = smoothstep(0.25, 0.7, coverage);
    if (y <= 0.1 || edgeScale === 0 || random() >= coverage) continue;
    const hit = topAt(x, z);
    if (!hit || Math.abs(hit.y - y) > 0.015) continue;
    let supported = true;
    for (const [dx, dz] of ROOT_OFFSETS) {
      const edge = topAt(x + dx, z + dz);
      const planeY = y - (nx * dx + nz * dz) / ny;
      if (!edge || edge.triangle.ny <= MIN_SUPPORT_UP || Math.abs(edge.y - planeY) > 0.06) {
        supported = false;
        break;
      }
    }
    if (!supported) continue;
    const scale = 0.6 + random() * 0.5;
    records.push(
      x + nx * ROOT_LIFT,
      y + ny * ROOT_LIFT,
      z + nz * ROOT_LIFT,
      random() * Math.PI * 2,
      scale * edgeScale,
      scale * (0.55 + 0.45 * Math.sqrt(coverage)) * edgeScale,
      scale * edgeScale,
      coverage,
      1,
      1, // Per-rock material owns tiling; all roots borrow the same projected base.
      normalLength > 1e-10 ? normalX / normalLength : nx,
      up,
      normalLength > 1e-10 ? normalZ / normalLength : nz
    );
    // The sampled face is already the exact supporting triangle; no secondary nearest-face search.
    for (const vertex of [a, b, c]) appearance.push(p[vertex], p[vertex + 1], p[vertex + 2], grassCoverage[vertex / 3]);
    for (const vertex of [a, b, c]) {
      const length = Math.hypot(normals[vertex], normals[vertex + 1], normals[vertex + 2]);
      appearance.push(
        length > 1e-10 ? normals[vertex] / length : nx,
        length > 1e-10 ? normals[vertex + 1] / length : ny,
        length > 1e-10 ? normals[vertex + 2] / length : nz,
        p[vertex + 1]
      ); // The laboratory's authoritative flat terrain is y=0.
    }
    appearance.push(1, 1, 1, 0); // Local tiling fallback, textured meadow, enabled, reserved.
  }
  return { transforms: new Float32Array(records), appearance: new Float32Array(appearance) };
}
