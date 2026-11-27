import { Shader, ShaderFactory } from "@galacean/engine";
import farmLand from "@galacean/engine-farming/farming/shaders/FarmLand.shader?raw";

const name = "Farming/PlannerLandBlend";
const includes = import.meta.glob("../../../../../../../packages/terrain/src/shaders/**/*.glsl", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

/** Explicit ground-pass entry; grass and farmland share shading, climate and fog in GrassForwardPass.glsl. */
export const PLANNING_FARM_LAND_SHADER = farmLand;

export function getPlanningFarmLandShader(): Shader {
  const existing = Shader.find(name);
  if (existing) return existing;
  for (const [path, source] of Object.entries(includes)) {
    const include = path.replace("../../../../../../../packages/terrain/src/shaders/", "");
    if (!ShaderFactory.includeMap[include]) ShaderFactory.registerInclude(include, source);
  }
  return Shader.create(PLANNING_FARM_LAND_SHADER)!;
}
