import { Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material";
import { ShaderProperty } from "../shader";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { RenderTarget, Texture2D } from "../texture";
import { PipelineUtils } from "./PipelineUtils";

export class Blitter {
  private static _blitTextureProperty = ShaderProperty.getByName("renderer_BlitTexture");
  private static _blitMipLevelProperty = ShaderProperty.getByName("renderer_BlitMipLevel");
  private static _blitTexelSizeProperty = ShaderProperty.getByName("renderer_texelSize"); // x: 1/width, y: 1/height, z: width, w: height

  private static _rendererShaderData = new ShaderData(ShaderDataGroup.Renderer);
  private static _texelSize = new Vector4();
  /**
   * Blit texture to destination render target using a triangle.
   * @param engine - Engine
   * @param source - Source texture
   * @param destination - Destination render target
   * @param mipLevel - Mip level to blit
   * @param viewport - Viewport
   * @param material - The material to use when blit
   * @param passIndex - Pass index to use of the provided material
   */
  static blitTexture(
    engine: Engine,
    source: Texture2D,
    destination: RenderTarget | null,
    mipLevel: number = 0,
    viewport: Vector4 = PipelineUtils.defaultViewport,
    material: Material = null,
    passIndex = 0
  ): void {
    const basicResources = engine._basicResources;
    const blitMesh = destination ? basicResources.flipYBlitMesh : basicResources.blitMesh;
    const blitMaterial = material || basicResources.blitMaterial;
    const rhi = engine._hardwareRenderer;
    const context = engine._renderContext;

    // We not use projection matrix when blit, but we must modify flipProjection to make front face correct
    context.flipProjection = !!destination;

    rhi.activeRenderTarget(destination, viewport, context.flipProjection, 0);

    const rendererShaderData = Blitter._rendererShaderData;

    rendererShaderData.setTexture(Blitter._blitTextureProperty, source);
    rendererShaderData.setFloat(Blitter._blitMipLevelProperty, mipLevel);
    Blitter._texelSize.set(1 / source.width, 1 / source.height, source.width, source.height);
    rendererShaderData.setVector4(Blitter._blitTexelSizeProperty, Blitter._texelSize);

    const pass = blitMaterial.shader.subShaders[0].passes[passIndex];
    const compileMacros = Shader._compileMacros;

    ShaderMacroCollection.unionCollection(
      context.camera._globalShaderMacro,
      blitMaterial.shaderData._macroCollection,
      compileMacros
    );
    const program = pass._getShaderProgram(engine, compileMacros);

    program.bind();
    program.groupingOtherUniformBlock();
    program.uploadAll(program.rendererUniformBlock, rendererShaderData);
    program.uploadAll(program.materialUniformBlock, blitMaterial.shaderData);
    program.uploadUnGroupTextures();

    (pass._renderState || blitMaterial.renderState)._applyStates(
      engine,
      false,
      pass._renderStateDataMap,
      blitMaterial.shaderData
    );

    rhi.drawPrimitive(blitMesh._primitive, blitMesh.subMesh, program);
  }
}
