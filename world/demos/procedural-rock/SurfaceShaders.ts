import { Shader, ShaderFactory } from "@galacean/engine";
import grass from "@galacean/engine-terrain/shaders/Grass.shader?raw";
import rockColor from "./RockSurfaceColor.glsl?raw";
import rockGround from "./RockGrassGround.glsl?raw";

// Borrow production lighting/grass code; keep this experiment's new projection contract private.
const library = import.meta.glob<string>(
  ["/packages/terrain/src/shaders/shared/*.glsl", "/packages/terrain/src/shaders/grass/*.glsl"],
  { as: "raw", eager: true }
);

/** Maps shared shader dependencies to this example's isolated include namespace. */
export function scopeIncludes(source: string): string {
  return source.replace(/#include "((?:shared|grass)\/[^"\n]+)"/g, '#include "ProceduralRock/$1"');
}
/** Registers production helpers with the example's matching rock/grass projection overrides. */
export function registerSurfaceShaders(): void {
  for (const [path, source] of Object.entries(library)) {
    const name = path.split("/shaders/")[1];
    const content =
      name === "shared/RockSurfaceColor.glsl"
        ? rockColor
        : name === "shared/RockGrassGround.glsl"
          ? rockGround
          : source;
    if (!ShaderFactory.includeMap["ProceduralRock/" + name])
      ShaderFactory.registerInclude("ProceduralRock/" + name, scopeIncludes(content));
  }
}
/** Reuses Seed's Grass shader with the same projected substrate as this example's rocks. */
export function rockGrassShader(): Shader {
  registerSurfaceShaders();
  return (
    Shader.find("ProceduralRock/Grass") ??
    Shader.create(scopeIncludes(grass.replace('"Terrain/Grass"', '"ProceduralRock/Grass"')))
  );
}
