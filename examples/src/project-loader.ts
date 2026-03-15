/**
 * @title Project Loader
 * @category Advance
 */
import { AssetType, Logger, WebGLEngine } from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { registerIncludes } from "@galacean/engine-shader";

Logger.enable();

const shaderLab = new ShaderLab();
registerIncludes();

WebGLEngine.create({
  canvas: document.getElementById("canvas") as HTMLCanvasElement,
  shaderLab
}).then((engine) => {
  engine.canvas.resizeByClientSize();

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*fdQBRJIBfBsAAAAAQMAAAAgAekp5AQ/project.json",
      type: AssetType.Project
    })
    .then(() => {
      console.log("Project loaded");
      engine.run();
    })
    .catch((e) => {
      console.error("Failed to load project", e);
    });
});
