import { Color } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { RenderTarget, Texture2D, TextureFormat } from "../texture";

/**
 * @internal
 */
export class PipelineUtils {
  private static _blitClearColor = new Color(0, 0, 0, 1);
  private static _rendererShaderData = new ShaderData(ShaderDataGroup.Renderer);

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
        currentTexture.destroy();
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
   * @returns Render target
   */
  static recreateRenderTargetIfNeeded(
    engine: Engine,
    currentRenderTarget: RenderTarget | null,
    width: number,
    height: number,
    colorFormat: TextureFormat | null,
    depthFormat: TextureFormat | null,
    mipmap: boolean
  ): RenderTarget {
    const currentColorTexture = <Texture2D>currentRenderTarget?.getColorTexture(0);
    const currentDepthTexture = <Texture2D>currentRenderTarget?.depthTexture;
    const colorTexture = colorFormat
      ? PipelineUtils.recreateTextureIfNeeded(engine, currentColorTexture, width, height, colorFormat, mipmap)
      : null;

    const depthTexture = depthFormat
      ? PipelineUtils.recreateTextureIfNeeded(engine, currentDepthTexture, width, height, depthFormat, mipmap)
      : null;

    if (currentColorTexture !== colorTexture || currentDepthTexture !== depthTexture) {
      currentRenderTarget?.destroy();
      currentRenderTarget = new RenderTarget(engine, width, height, colorTexture, depthTexture);
      currentRenderTarget.isGCIgnored = true;
    }

    return currentRenderTarget;
  }

  /**
   * Blit texture
   * @param engine
   * @param source
   * @param destination
   * @param material
   * @param passIndex
   */
  static blitTexture(engine: Engine, source: Texture2D, destination: RenderTarget | null): void {
    const { blitMesh, blitMaterial } = engine._basicResources;
    const rhi = engine._hardwareRenderer;

    let bufferWidth: number, bufferHeight: number;
    if (destination) {
      bufferWidth = destination.width;
      bufferHeight = destination.height;
    } else {
      bufferWidth = rhi.getMainFrameBufferWidth();
      bufferHeight = rhi.getMainFrameBufferHeight();
    }

    rhi.activeRenderTargetX(destination);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, this._blitClearColor);
    rhi.viewport(0, 0, bufferWidth, bufferHeight);
    rhi.scissor(0, 0, bufferWidth, bufferHeight);

    const rendererShaderData = PipelineUtils._rendererShaderData;
    const pass = blitMaterial.shader.subShaders[0].passes[0];
    const program = pass._getShaderProgram(engine, Shader._compileMacros);

    rendererShaderData.setTexture("renderer_BlitTexture", source);

    program.bind();
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
