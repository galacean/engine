import { Color, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Material } from "../material";
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
  private static _clearColor = new Color(0, 0, 0, 0);

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
    invalidateColor: boolean = true
  ): void {
    const basicResources = engine._basicResources;
    const blitMesh = destination ? basicResources.flipYBlitMesh : basicResources.blitMesh;
    const blitMaterial = material || basicResources.blitMaterial;
    const rhi = engine._hardwareRenderer;
    const context = engine._renderContext;
    const camera = context.camera;

    // We not use projection matrix when blit, but we must modify flipProjection to make front face correct
    context.flipProjection = !!destination;

    context.setRenderTarget(destination, viewport, destMipLevel);

    const rendererShaderData = Blitter._rendererShaderData;

    rendererShaderData.setTexture(Blitter._blitTextureProperty, source);
    rendererShaderData.setFloat(Blitter._blitMipLevelProperty, mipLevel);
    Blitter._texelSize.set(1 / source.width, 1 / source.height, source.width, source.height);
    rendererShaderData.setVector4(Blitter._blitTexelSizeProperty, Blitter._texelSize);
    rendererShaderData.setVector4(Blitter._sourceScaleOffsetProperty, sourceScaleOffset ?? Blitter._defaultScaleOffset);

    const pass = blitMaterial.shader.subShaders[0].passes[passIndex];
    const compileMacros = Shader._compileMacros;

    ShaderMacroCollection.unionCollection(
      camera._globalShaderMacro,
      blitMaterial.shaderData._macroCollection,
      compileMacros
    );

    ShaderMacroCollection.unionCollection(compileMacros, engine._macroCollection, compileMacros);

    const program = pass._getShaderProgram(engine, compileMacros);

    program.bind();
    program.groupingOtherUniformBlock();
    program.uploadAll(program.sceneUniformBlock, camera.scene!.shaderData);
    program.uploadAll(program.cameraUniformBlock, camera.shaderData);
    program.uploadAll(program.rendererUniformBlock, rendererShaderData);
    program.uploadAll(program.materialUniformBlock, blitMaterial.shaderData);
    program.uploadUnGroupTextures();

    const renderState = pass._renderState;
    renderState._applyStates(engine, false, pass._renderStateDataMap, blitMaterial.shaderData);

    const appliedState = engine._lastRenderState;
    const rhiWithScissor = rhi as {
      _scissorEnable?: boolean;
      _lastScissor?: Vector4;
      getMainFrameBufferWidth?: () => number;
      getMainFrameBufferHeight?: () => number;
    };
    const scissorRect = rhiWithScissor._lastScissor;
    const targetWidth =
      destination !== null
        ? Math.max(1, destination.width >> destMipLevel)
        : rhiWithScissor.getMainFrameBufferWidth?.();
    const targetHeight =
      destination !== null
        ? Math.max(1, destination.height >> destMipLevel)
        : rhiWithScissor.getMainFrameBufferHeight?.();
    const fullScissorClear =
      !rhiWithScissor._scissorEnable ||
      (scissorRect !== undefined &&
        targetWidth !== undefined &&
        targetHeight !== undefined &&
        scissorRect.x === 0 &&
        scissorRect.y === 0 &&
        scissorRect.z === targetWidth &&
        scissorRect.w === targetHeight);
    if (
      invalidateColor &&
      destination !== null &&
      viewport.x === 0 &&
      viewport.y === 0 &&
      viewport.z === 1 &&
      viewport.w === 1 &&
      fullScissorClear &&
      !appliedState.blendState.targetBlendState.enabled &&
      !appliedState.depthState.enabled &&
      !appliedState.stencilState.enabled &&
      appliedState.blendState.targetBlendState.colorWriteMask === ColorWriteMask.All
    ) {
      // Full-RT non-scissored clear maps to TBDR hardware MTLLoadActionClear (0 DRAM read)
      // while marking the attachment Initialized to avoid ANGLE-Metal RobustResourceInit CPU replaceRegion.
      rhi.clearRenderTarget(engine, CameraClearFlags.Color, Blitter._clearColor);
    }

    rhi.drawPrimitive(blitMesh._primitive, blitMesh.subMesh, program);
    rendererShaderData.setTexture(Blitter._blitTextureProperty, null);
  }
}
