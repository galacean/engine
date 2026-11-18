import type { Shader } from "@galacean/engine";
import type { StylizedVegetationGeometry } from "./StylizedTerrainMaterial";

export const terrainShader: Parameters<typeof Shader._createFromPrecompiled>[0];
export const grassShader: typeof terrainShader;
export const flowerShader: typeof terrainShader;
export const grassGeometry: StylizedVegetationGeometry;
export const grassMaterialData: Record<
  string,
  { type: "Float" | "Color" | "Vector4"; value: number | Record<string, number> }
>;
export const flowerPresets: Record<
  "flowers-1" | "flowers-2",
  {
    geometry: StylizedVegetationGeometry;
    material: {
      name: string;
      macros: { name: string }[];
      shaderData: Record<string, { type: string; value: string | number | Record<string, number> }>;
    };
  }
>;
