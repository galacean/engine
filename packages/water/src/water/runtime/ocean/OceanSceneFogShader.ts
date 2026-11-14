/** Shared live scene-fog GLSL used by the detailed and horizon Ocean materials. */
import oceanSceneFogDeclarationsShader from "../../shaders/library/ocean/OceanSceneFogDeclarations.glsl?raw";
import oceanSceneFogApplicationShaderTemplate from "../../shaders/library/ocean/OceanSceneFogApplication.glsl?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";

export const OCEAN_SCENE_FOG_ENABLED_PROPERTY = "material_OceanSceneFogEnabled";

export function createOceanSceneFogDeclarations(): string {
  return oceanSceneFogDeclarationsShader;
}

export function createOceanSceneFogApplication(colorExpression: string): string {
  return renderWaterShaderTemplate(oceanSceneFogApplicationShaderTemplate, {
    COLOR_EXPRESSION: colorExpression
  });
}
