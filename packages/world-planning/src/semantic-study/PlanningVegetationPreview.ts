import {
  Shader,
  ShaderFactory,
  Texture2D,
  TextureFormat,
  TextureWrapMode,
  Vector4,
  type Engine,
  type Material
} from "@galacean/engine";
import terrainShader from "@galacean/engine-terrain/shaders/Terrain.shader?raw";
import { vegetationCoverage, type VegetationCoverage } from "../spatial/ecology/VegetationCoverage";
import type { IslandPlan } from "./IslandPlanModel";

const sources = import.meta.glob("../../shaders/**/*.glsl", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;
const overlay = `
 sampler2D planning_VegetationCoverage;
 vec4 planning_CoverageDomain;
 void PlanningCoverageFragment(Varyings v) {
  TerrainFragment(v);
  vec2 uv = (v.positionWS.xz / planning_CoverageDomain.xy * (planning_CoverageDomain.z - 1.0) + .5) / planning_CoverageDomain.z;
  float coverage = texture2D(planning_VegetationCoverage, uv).r;
  vec2 grid = abs(fract(v.positionWS.xz)-.5);
  float line = step(.46,max(grid.x,grid.y));
  // Flat diagnostic tint only. It does not become a material weight, collision or vegetation geometry.
  vec3 tint = mix(vec3(.68,.24,.49),vec3(.35,.12,.25),line*.3);
  gl_FragColor.rgb = mix(gl_FragColor.rgb,tint,coverage*.8);
 }
`;
/** Whitebox-only visual adapter. Reuses every production Terrain pass and its vertex path;
 * only wraps the forward fragment with an independent ecological coverage preview.
 */
export class PlanningVegetationPreview {
  private texture?: Texture2D;
  private current?: VegetationCoverage;
  constructor(
    private engine: Engine,
    private material: Material
  ) {
    const name = "Planning/TerrainCoverage";
    let shader = Shader.find(name);
    if (!shader) {
      for (const [path, source] of Object.entries(sources)) {
        const name = path.replace("../../shaders/", "");
        if (!ShaderFactory.includeMap[name]) ShaderFactory.registerInclude(name, source);
      }
      shader = Shader.create(
        terrainShader
          .replace('"Terrain/Terrain"', `"${name}"`)
          .replace("FragmentShader = TerrainFragment;", "FragmentShader = PlanningCoverageFragment;")
          .replace(
            '#include "terrain/TerrainForwardPass.glsl"',
            '#include "terrain/TerrainForwardPass.glsl"\n' + overlay
          )
      )!;
    }
    material.shader = shader;
  }
  /** Refresh only vegetation pixels; no Terrain height, layer residency or material weights are rebuilt. */
  setPlan(plan: IslandPlan, visibility: Readonly<Record<string, boolean>>): void {
    const data = vegetationCoverage(plan, visibility);
    if (data === this.current) return;
    const texture = new Texture2D(this.engine, data.resolution, data.resolution, TextureFormat.R8G8B8A8, false, false);
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    const pixels = new Uint8Array(data.flowers.length * 4);
    for (let i = 0; i < data.flowers.length; i++) {
      pixels[i * 4] = data.flowers[i];
      pixels[i * 4 + 3] = 255;
    }
    texture.setPixelBuffer(pixels);
    this.material.shaderData.setTexture("planning_VegetationCoverage", texture);
    this.material.shaderData.setVector4(
      "planning_CoverageDomain",
      new Vector4(data.width, data.depth, data.resolution, 0)
    );
    this.texture?.destroy();
    this.texture = texture;
    this.current = data;
  }
  /** Release the ecological texture independently of Terrain residency. */
  dispose(): void {
    this.texture?.destroy();
  }
}
