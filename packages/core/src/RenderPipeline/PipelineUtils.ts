import { Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material";
import { ShaderProperty } from "../shader";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { RenderBufferStoreAction } from "./enums/RenderBufferStoreAction";

/**
 * @internal
 */
export class PipelineUtils {
  private static _blitTextureProperty = ShaderProperty.getByName("renderer_BlitTexture");
  private static _blitMipLevelProperty = ShaderProperty.getByName("renderer_BlitMipLevel");
  private static _blitTexelSizeProperty = ShaderProperty.getByName("renderer_texelSize"); // x: 1/width, y: 1/height, z: width, w: height

  private static _rendererShaderData = new ShaderData(ShaderDataGroup.Renderer);
  private static _texelSize = new Vector4();

  static readonly defaultViewport = new Vector4(0, 0, 1, 1);

  /**
   * Recreate texture if needed.
   * @param engine - Engine
   * @param currentTexture - Current texture
   * @param width - Need texture width
   * @param height - Need texture height
   * @param format - Need texture format
   * @param mipmap - Need texture mipmap
   * @param textureWrapMode - Texture wrap mode
   * @param textureFilterMode - Texture filter mode
   * @returns Texture
   */
  static recreateTextureIfNeeded(
    engine: Engine,
    currentTexture: Texture2D | null,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    textureWrapMode: TextureWrapMode,
    textureFilterMode: TextureFilterMode
  ): Texture2D {
    if (currentTexture) {
      if (
        currentTexture.width !== width ||
        currentTexture.height !== height ||
        currentTexture.format !== format ||
        currentTexture.mipmapCount > 1 !== mipmap
      ) {
        currentTexture.destroy(true);
        currentTexture = new Texture2D(engine, width, height, format, mipmap);
        currentTexture.isGCIgnored = true;
      }
    } else {
      currentTexture = new Texture2D(engine, width, height, format, mipmap);
      currentTexture.isGCIgnored = true;
    }

    currentTexture.wrapModeU = currentTexture.wrapModeV = textureWrapMode;
    currentTexture.filterMode = textureFilterMode;

    return currentTexture;
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
   * @param textureWrapMode - Texture wrap mode
   * @param textureFilterMode - Texture filter mode
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
    antiAliasing: number,
    textureWrapMode: TextureWrapMode,
    textureFilterMode: TextureFilterMode
  ): RenderTarget {
    const currentColorTexture = <Texture2D>currentRenderTarget?.getColorTexture(0);
    const colorTexture = colorFormat
      ? PipelineUtils.recreateTextureIfNeeded(
          engine,
          currentColorTexture,
          width,
          height,
          colorFormat,
          mipmap,
          textureWrapMode,
          textureFilterMode
        )
      : null;

    if (needDepthTexture) {
      const currentDepthTexture = <Texture2D>currentRenderTarget?.depthTexture;
      const needDepthTexture = depthFormat
        ? PipelineUtils.recreateTextureIfNeeded(
            engine,
            currentDepthTexture,
            width,
            height,
            depthFormat,
            mipmap,
            textureWrapMode,
            textureFilterMode
          )
        : null;

      if (currentColorTexture !== colorTexture || currentDepthTexture !== needDepthTexture) {
        currentRenderTarget?.destroy(true);
        currentRenderTarget = new RenderTarget(engine, width, height, colorTexture, needDepthTexture, antiAliasing);
        currentRenderTarget.isGCIgnored = true;
      }
    } else {
      if (
        currentColorTexture !== colorTexture ||
        currentRenderTarget?._depthFormat !== depthFormat ||
        currentRenderTarget.antiAliasing !== antiAliasing
      ) {
        currentRenderTarget?.destroy(true);
        currentRenderTarget = new RenderTarget(engine, width, height, colorTexture, depthFormat, antiAliasing);
        currentRenderTarget.isGCIgnored = true;
      }
    }

    return currentRenderTarget;
  }

  /**
   * Blit texture to destination render target using a triangle.
   * @param engine - Engine
   * @param source - Source texture
   * @param destination - Destination render target
   * @param mipLevel - Mip level to blit
   * @param viewport - Viewport
   * @param material - The material to use when blitting
   * @param passIndex - Pass index to use of the provided material
   * @param renderBufferStoreAction - This enum describes what should be done on the render target when the GPU is done rendering into it.
   */
  static blitTexture(
    engine: Engine,
    source: Texture2D,
    destination: RenderTarget | null,
    mipLevel: number = 0,
    viewport: Vector4 = PipelineUtils.defaultViewport,
    material: Material = null,
    passIndex = 0,
    renderBufferStoreAction = RenderBufferStoreAction.DontCare
  ): void {
    const basicResources = engine._basicResources;
    const blitMesh = destination ? basicResources.flipYBlitMesh : basicResources.blitMesh;
    const blitMaterial = material || basicResources.blitMaterial;
    const rhi = engine._hardwareRenderer;
    const context = engine._renderContext;

    // We not use projection matrix when blit, but we must modify flipProjection to make front face correct
    context.flipProjection = !!destination;

    rhi.activeRenderTarget(destination, viewport, context.flipProjection, 0);

    const rendererShaderData = PipelineUtils._rendererShaderData;

    rendererShaderData.setTexture(PipelineUtils._blitTextureProperty, source);
    rendererShaderData.setFloat(PipelineUtils._blitMipLevelProperty, mipLevel);
    PipelineUtils._texelSize.set(1 / source.width, 1 / source.height, source.width, source.height);
    rendererShaderData.setVector4(PipelineUtils._blitTexelSizeProperty, PipelineUtils._texelSize);

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

    if (renderBufferStoreAction === RenderBufferStoreAction.BlitMSAA) {
      destination?._blitRenderTarget();
    }
  }
}
