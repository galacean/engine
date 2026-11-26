import { expect, it } from "vitest";
import { AssetType, Material, Shader, WebGLEngine } from "@galacean/engine";
import billboardURL from "../../../packages/terrain/src/data/seed-world/public/Shader/Billboard.shaderc?url";

it("links the shipped billboard forward and shadow programs with mesh and instance layouts", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const shader = await engine.resourceManager.load<Shader>({ type: AssetType.Shader, url: billboardURL });
    const passes = shader.subShaders[0].passes;
    expect(passes.map((pass) => pass.getTagValue("pipelineStage"))).toEqual(["Forward", "ShadowCaster"]);
    const material = new Material(engine, shader);
    const data = material.shaderData;
    for (const macro of [
      "RENDERER_HAS_UV",
      "RENDERER_HAS_NORMAL",
      "RENDERER_HAS_TANGENT",
      "MATERIAL_HAS_BASETEXTURE",
      "MATERIAL_HAS_NORMALTEXTURE",
      "MATERIAL_ENABLE_WIND",
      "RENDERER_LOD_DITHER",
      "RENDERER_IS_RECEIVE_SHADOWS",
      "SCENE_VOLUMETRIC_CLOUD_SHADOW"
    ]) {
      data.enableMacro(macro);
    }
    data.enableMacro("SCENE_DIRECT_LIGHT_COUNT", "1");
    data.enableMacro("SCENE_POINT_LIGHT_COUNT", "1");
    data.enableMacro("SCENE_SPOT_LIGHT_COUNT", "1");
    data.enableMacro("SCENE_SHADOW_TYPE", "1");
    data.enableMacro("SCENE_SHADOW_CASCADED_COUNT", "1");
    for (const layout of [
      [],
      ["RENDERER_BILLBOARD_INSTANCE"],
      ["RENDERER_ASSET_ASSEMBLY_INSTANCE"],
      ["RENDERER_ASSET_ASSEMBLY_INSTANCE", "RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE"],
      ["RENDERER_ASSET_ASSEMBLY_INSTANCE", "RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE"]
    ]) {
      for (const macro of layout) data.enableMacro(macro);
      for (const pass of passes) {
        const program = pass._getShaderProgram(engine, data._macroCollection);
        expect(program.isValid, `${pass.name}, ${layout.join(" ") || "mesh"}`).toBe(true);
      }
      for (const macro of layout) data.disableMacro(macro);
    }
  } finally {
    engine.destroy();
  }
});
