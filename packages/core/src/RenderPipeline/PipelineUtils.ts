import { Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { ShaderProperty } from "../shader";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { RenderTarget, Texture2D, TextureFormat } from "../texture";

/**
 * @internal
 */
export class PipelineUtils {
  private static _blitTextureProperty = ShaderProperty.getByName("renderer_BlitTexture");
  private static _blitMipLevelProperty = ShaderProperty.getByName("renderer_BlitMipLevel");

  private static _rendererShaderData = new ShaderData(ShaderDataGroup.Renderer);

  static readonly defaultViewport = new Vector4(0, 0, 1, 1);

  /**
   * Recreate texture if needed.
   * @param engine - Engine
   * @param currentTexture - Current texture
   * @param width - Need texture width
   * @param height - Need texture height
   * @param format - Need texture format
   * @param mipmap - Need texture mipmap
   * @returns Texture
   */
  static recreateTextureIfNeeded(
    engine: Engine,
    currentTexture: Texture2D | null,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean
  ): Texture2D {
    if (currentTexture) {
      if (
        currentTexture.width !== width ||
        currentTexture.height !== height ||
        currentTexture.format !== format ||
        currentTexture.mipmapCount > 1 !== mipmap
      ) {
        currentTexture.destroy(true);
        const texture = new Texture2D(engine, width, height, format, mipmap);
        texture.isGCIgnored = true;
        return texture;
      } else {
        return currentTexture;
      }
    } else {
      const texture = new Texture2D(engine, width, height, format, mipmap);
      texture.isGCIgnored = true;
      return texture;
    }
  }

  /**
   * Recreate render target if needed.
   * @param engine - Engine
   * @param currentRenderTarget - Current render target
   * @param width - Need render target width
   * @param height - Need render target height
   * @param colorFormat - Need render target color format
   * @param depthFormat - Need render target depth format
   * @param mipmap - Need render target mipmap
   * @param antiAliasing - Need render target anti aliasing
   * @returns Render target
   */
  static recreateRenderTargetIfNeeded(
    engine: Engine,
    currentRenderTarget: RenderTarget | null,
    width: number,
    height: number,
    colorFormat: TextureFormat | null,
    depthFormat: TextureFormat | null,
    needDepthTexture: boolean,
    mipmap: boolean,
    antiAliasing: number
  ): RenderTarget {
    const currentColorTexture = <Texture2D>currentRenderTarget?.getColorTexture(0);
    const colorTexture = colorFormat
      ? PipelineUtils.recreateTextureIfNeeded(engine, currentColorTexture, width, height, colorFormat, mipmap)
      : null;

    if (needDepthTexture) {
      const currentDepthTexture = <Texture2D>currentRenderTarget?.depthTexture;
      const needDepthTexture = depthFormat
        ? PipelineUtils.recreateTextureIfNeeded(engine, currentDepthTexture, width, height, depthFormat, mipmap)
        : null;

      if (currentColorTexture !== colorTexture || currentDepthTexture !== needDepthTexture) {
        currentRenderTarget?.destroy(true);
        currentRenderTarget = new RenderTarget(engine, width, height, colorTexture, needDepthTexture, antiAliasing);
        currentRenderTarget.isGCIgnored = true;
      }
    } else {
      const needDepthFormat = depthFormat;

      if (currentColorTexture !== colorTexture || currentRenderTarget?._depthFormat !== needDepthFormat) {
        currentRenderTarget?.destroy(true);
        currentRenderTarget = new RenderTarget(engine, width, height, colorTexture, needDepthFormat, antiAliasing);
        currentRenderTarget.isGCIgnored = true;
      }
    }

    return currentRenderTarget;
  }

  /**
   * Blit texture to destination render target.
   * @param engine - Engine
   * @param source - Source texture
   * @param destination - Destination render target
   * @param mipLevel - Mip level to blit
   * @param viewport - Viewport
   */
  static blitTexture(
    engine: Engine,
    source: Texture2D,
    destination: RenderTarget | null,
    mipLevel: number = 0,
    viewport?: Vector4
  ): void {
    const basicResources = engine._basicResources;
    const blitMesh = destination ? basicResources.flipYBlitMesh : basicResources.blitMesh;
    const blitMaterial = basicResources.blitMaterial;
    const rhi = engine._hardwareRenderer;

    const context = engine._renderContext;
    // We not use projection matrix when blit, but we must modify flipProjection to make front face correct
    context.flipProjection = destination ? true : false;

    rhi.activeRenderTarget(destination, viewport ?? PipelineUtils.defaultViewport, context.flipProjection, 0);

    const rendererShaderData = PipelineUtils._rendererShaderData;
    const pass = blitMaterial.shader.subShaders[0].passes[0];
    const program = pass._getShaderProgram(engine, Shader._compileMacros);

    rendererShaderData.setTexture(PipelineUtils._blitTextureProperty, source);
    rendererShaderData.setFloat(PipelineUtils._blitMipLevelProperty, mipLevel);

    program.bind();
    program.groupingOtherUniformBlock();
    program.uploadAll(program.rendererUniformBlock, rendererShaderData);
    program.uploadAll(program.materialUniformBlock, blitMaterial.shaderData);
    program.uploadUnGroupTextures();

    (pass._renderState || blitMaterial.renderState)._apply(
      engine,
      false,
      pass._renderStateDataMap,
      blitMaterial.shaderData
    );

    rhi.drawPrimitive(blitMesh._primitive, blitMesh.subMesh, program);
  }
}
