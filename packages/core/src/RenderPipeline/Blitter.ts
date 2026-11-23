import { Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material";
import { RenderBufferLoadAction } from "../renderingHardwareInterface";
import { ColorWriteMask, ShaderPass, ShaderProperty } from "../shader";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderStateElementKey } from "../shader/enums/RenderStateElementKey";
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

  private static _rendererShaderData = new ShaderData(ShaderDataGroup.Renderer);
  private static _texelSize = new Vector4();
  private static _defaultScaleOffset = new Vector4(1, 1, 0, 0);

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
   */
  static blitTexture(
    engine: Engine,
    source: Texture2D,
    destination: RenderTarget | null,
    mipLevel: number = 0,
    viewport: Vector4 = PipelineUtils.defaultViewport,
    material: Material | null = null,
    passIndex = 0,
    sourceScaleOffset?: Vector4
  ): void {
    Blitter._blitTexture(engine, source, destination, mipLevel, viewport, material, passIndex, sourceScaleOffset);
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
    colorLoadAction: RenderBufferLoadAction = RenderBufferLoadAction.Load
  ): void {
    const basicResources = engine._basicResources;
    const blitMesh = destination ? basicResources.flipYBlitMesh : basicResources.blitMesh;
    const blitMaterial = material || basicResources.blitMaterial;
    const rhi = engine._hardwareRenderer;
    const context = engine._renderContext;
    const camera = context.camera;

    // We not use projection matrix when blit, but we must modify flipProjection to make front face correct
    context.flipProjection = !!destination;

    const pass = blitMaterial.shader.subShaders[0].passes[passIndex];
    const resolvedLoadAction =
      destination &&
      destination.colorTextureCount === 1 &&
      colorLoadAction === RenderBufferLoadAction.Clear &&
      Blitter._canClearColorTarget(pass, blitMaterial.shaderData)
        ? RenderBufferLoadAction.Clear
        : RenderBufferLoadAction.Load;
    context.setRenderTarget(destination, viewport, 0, undefined, resolvedLoadAction);

    const rendererShaderData = Blitter._rendererShaderData;

    rendererShaderData.setTexture(Blitter._blitTextureProperty, source);
    rendererShaderData.setFloat(Blitter._blitMipLevelProperty, mipLevel);
    Blitter._texelSize.set(1 / source.width, 1 / source.height, source.width, source.height);
    rendererShaderData.setVector4(Blitter._blitTexelSizeProperty, Blitter._texelSize);
    rendererShaderData.setVector4(Blitter._sourceScaleOffsetProperty, sourceScaleOffset ?? Blitter._defaultScaleOffset);

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

    rhi.drawPrimitive(blitMesh._primitive, blitMesh.subMesh, program);
    rendererShaderData.setTexture(Blitter._blitTextureProperty, null);
  }

  private static _canClearColorTarget(pass: ShaderPass, shaderData: ShaderData): boolean {
    const renderStateDataMap = pass._renderStateDataMap;
    const targetBlendState = pass._renderState.blendState.targetBlendState;

    const enabledProp = renderStateDataMap[RenderStateElementKey.BlendStateEnabled0];
    const blendEnabled = enabledProp !== undefined ? !!shaderData.getFloat(enabledProp) : targetBlendState.enabled;
    if (blendEnabled) {
      return false;
    }

    const colorWriteMaskProp = renderStateDataMap[RenderStateElementKey.BlendStateColorWriteMask0];
    const colorWriteMask =
      colorWriteMaskProp !== undefined
        ? (shaderData.getFloat(colorWriteMaskProp) ?? ColorWriteMask.All)
        : targetBlendState.colorWriteMask;
    return colorWriteMask === ColorWriteMask.All;
  }
}
