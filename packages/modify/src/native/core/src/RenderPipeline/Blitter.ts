import { Color, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Material } from "../material";
import { RenderBufferLoadAction } from "../renderingHardwareInterface";
import { ShaderProperty } from "../shader";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ColorWriteMask } from "../shader/enums/ColorWriteMask";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { RenderTarget, Texture2D } from "../texture";
import { PipelineUtils } from "./PipelineUtils";

/**
 * A helper class to blit texture to destination render target.
 */
export class Blitter {
  private static _blitTextureProperty = ShaderProperty.getByName("renderer_BlitTexture");
  private static _blitMipLevelProperty = ShaderProperty.getByName("renderer_BlitMipLevel");
  private static _blitTexelSizeProperty = ShaderProperty.getByName("renderer_texelSize"); // x: 1/width, y: 1/height, z: width, w: height
  private static _sourceScaleOffsetProperty = ShaderProperty.getByName("renderer_SourceScaleOffset");

  private static _rendererShaderData = (() => {
    const data = new ShaderData(ShaderDataGroup.Renderer);
    data._trackBatchSharedFields = false;
    return data;
  })();
  private static _texelSize = new Vector4();
  private static _defaultScaleOffset = new Vector4(1, 1, 0, 0);
  private static _flippedScreenScaleOffset = new Vector4(1, -1, 0, 1);

  /**
   * Blit texture to destination render target using a triangle.
   * @param engine - Engine
   * @param source - Source texture
   * @param destination - Destination render target
   * @param mipLevel - Mip level to blit
   * @param viewport - Viewport
   * @param material - The material to use when blit
   * @param passIndex - Pass index to use of the provided material
   * @param sourceScaleOffset - Source scale and offset
   * @param destMipLevel - Destination mip level to render into
   * @param invalidateColor - Whether to invalidate destination color buffer before full-viewport overwrite
   * @param scissorRect - Optional GL pixel scissor rectangle `(x, y, width, height)` applied after binding the target
   */
  static blitTexture(
    engine: Engine,
    source: Texture2D,
    destination: RenderTarget | null,
    mipLevel: number = 0,
    viewport: Vector4 = PipelineUtils.defaultViewport,
    material: Material | null = null,
    passIndex = 0,
    sourceScaleOffset?: Vector4,
    destMipLevel: number = 0,
    invalidateColor: boolean = true,
    scissorRect?: Vector4
  ): void {
    Blitter._blitTexture(
      engine,
      source,
      destination,
      mipLevel,
      viewport,
      material,
      passIndex,
      sourceScaleOffset,
      RenderBufferLoadAction.Load,
      destMipLevel,
      scissorRect
    );
  }

  /**
   * @internal
   */
  static _blitTexture(
    engine: Engine,
    source: Texture2D,
    destination: RenderTarget | null,
    mipLevel: number = 0,
    viewport: Vector4 = PipelineUtils.defaultViewport,
    material: Material | null = null,
    passIndex = 0,
    sourceScaleOffset?: Vector4,
    colorLoadAction: RenderBufferLoadAction = RenderBufferLoadAction.Load,
    destMipLevel = 0,
    scissorRect?: Vector4
  ): void {
    const basicResources = engine._basicResources;
    const flipProjection = !!destination && engine._hardwareRenderer.backend === "webgl2";
    const blitMesh = flipProjection ? basicResources.flipYBlitMesh : basicResources.blitMesh;
    const blitMaterial = material || basicResources.blitMaterial;
    const pass = blitMaterial.shader.subShaders[0].passes[passIndex];
    const rhi = engine._hardwareRenderer;
    const context = engine._renderContext;
    const camera = context.camera;

    // We not use projection matrix when blit, but we must modify flipProjection to make front face correct
    context.flipProjection = flipProjection;

    const resolvedLoadAction =
      destination && destination.colorTextureCount === 1 ? colorLoadAction : RenderBufferLoadAction.Load;
    context.setRenderTarget(
      destination,
      viewport,
      destMipLevel,
      undefined,
      resolvedLoadAction,
      undefined,
      undefined,
      undefined,
      pass.name
    );
    if (scissorRect) {
      rhi.scissor(scissorRect.x, scissorRect.y, scissorRect.z, scissorRect.w);
    }

    const rendererShaderData = Blitter._rendererShaderData;

    rendererShaderData.setTexture(Blitter._blitTextureProperty, source);
    rendererShaderData.setFloat(Blitter._blitMipLevelProperty, mipLevel);
    Blitter._texelSize.set(1 / source.width, 1 / source.height, source.width, source.height);
    rendererShaderData.setVector4(Blitter._blitTexelSizeProperty, Blitter._texelSize);
    rendererShaderData.setVector4(
      Blitter._sourceScaleOffsetProperty,
      sourceScaleOffset ??
        (blitMaterial === basicResources.blitScreenMaterial && rhi.backend === "webgl2"
          ? Blitter._flippedScreenScaleOffset
          : Blitter._defaultScaleOffset)
    );

    const compileMacros = Shader._compileMacros;

    ShaderMacroCollection.unionCollection(
      camera._globalShaderMacro,
      blitMaterial.shaderData._macroCollection,
      compileMacros
    );

    ShaderMacroCollection.unionCollection(compileMacros, engine._macroCollection, compileMacros);

    const program = pass._getShaderProgram(
      engine,
      compileMacros,
      undefined,
      blitMesh._primitive,
      rendererShaderData,
      blitMaterial.shaderData
    );

    program.bind();
    program.regroupUniformBlocks();
    program.uploadAll(program.sceneUniformBlock, camera.scene!.shaderData);
    program.uploadAll(program.cameraUniformBlock, camera.shaderData);
    program.uploadAll(program.rendererUniformBlock, rendererShaderData);
    program.uploadAll(program.materialUniformBlock, blitMaterial.shaderData);
    program.uploadSharedUniforms(
      camera.scene!.shaderData,
      camera.shaderData,
      rendererShaderData,
      blitMaterial.shaderData,
      undefined
    );
    program.uploadUnGroupTextures();

    const renderState = pass._renderState;
    renderState._applyStates(engine, false, pass._renderStateDataMap, blitMaterial.shaderData);

    rhi.drawPrimitive(blitMesh._primitive, blitMesh.subMesh, program._platformProgram);
    rendererShaderData.setTexture(Blitter._blitTextureProperty, null);
  }
}
