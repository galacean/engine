import { Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material";
import { RenderPassDescriptor, RenderPassLoadAction } from "../renderingHardwareInterface";
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

  private static _rendererShaderData = (() => {
    const data = new ShaderData(ShaderDataGroup.Renderer);
    data._trackBatchSharedFields = false;
    return data;
  })();
  private static _texelSize = new Vector4();
  private static _defaultScaleOffset = new Vector4(1, 1, 0, 0);
  private static _passDescriptor = new RenderPassDescriptor();

  /**
   * Blit texture to destination render target using a standalone render pass and a full-screen triangle.
   * @remarks
   * When `colorLoadAction` is `RenderPassLoadAction.DontCare` or `RenderPassLoadAction.Clear`, it is automatically
   * downgraded to `Load` if `destination` is the default backbuffer, uses MRT, renders to a sub-viewport, or the
   * material enables blending or a partial `ColorWriteMask`.
   * @param engine - Engine
   * @param source - Source texture
   * @param destination - Destination render target
   * @param mipLevel - Source texture mip level to sample
   * @param viewport - Viewport
   * @param material - The material to use when blit
   * @param passIndex - Pass index to use of the provided material
   * @param sourceScaleOffset - Source scale and offset
   * @param colorLoadAction - Color attachment load action for the render pass (defaults to `Load`)
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
    colorLoadAction: RenderPassLoadAction = RenderPassLoadAction.Load
  ): void {
    const blitMaterial = material || engine._basicResources.blitMaterial;
    const context = engine._renderContext;
    const pass = blitMaterial.shader.subShaders[0].passes[passIndex];
    const isFullViewport = viewport.x === 0 && viewport.y === 0 && viewport.z === 1 && viewport.w === 1;
    const resolvedLoadAction =
      destination &&
      destination.colorTextureCount === 1 &&
      isFullViewport &&
      colorLoadAction !== RenderPassLoadAction.Load &&
      Blitter._canClearColorTarget(pass, blitMaterial.shaderData)
        ? colorLoadAction
        : RenderPassLoadAction.Load;

    const passDescriptor = Blitter._passDescriptor.reset(destination, viewport, !!destination, 0);
    passDescriptor.colorLoadAction = resolvedLoadAction;
    context.beginRenderPass(passDescriptor);
    Blitter.draw(engine, source, mipLevel, blitMaterial, passIndex, sourceScaleOffset);
    context.endRenderPass();
  }

  /**
   * Draw a full-screen blit triangle within the currently active render pass.
   * @remarks
   * Callers must already be inside an active render pass (between `beginRenderPass` and `endRenderPass`).
   * For standalone full-screen blits (such as custom `PostProcessPass`), prefer {@link Blitter.blitTexture}.
   * @param engine - Engine
   * @param source - Source texture
   * @param mipLevel - Source texture mip level to sample
   * @param material - The material to use when blit
   * @param passIndex - Pass index to use of the provided material
   * @param sourceScaleOffset - Source scale and offset
   */
  static draw(
    engine: Engine,
    source: Texture2D,
    mipLevel: number = 0,
    material: Material | null = null,
    passIndex = 0,
    sourceScaleOffset?: Vector4
  ): void {
    const basicResources = engine._basicResources;
    const blitMaterial = material || basicResources.blitMaterial;
    const rhi = engine._hardwareRenderer;
    const context = engine._renderContext;
    const camera = context.camera;
    const blitMesh = context.flipProjection ? basicResources.flipYBlitMesh : basicResources.blitMesh;
    const pass = blitMaterial.shader.subShaders[0].passes[passIndex];

    const rendererShaderData = Blitter._rendererShaderData;

    rendererShaderData.setTexture(Blitter._blitTextureProperty, source);
    rendererShaderData.setFloat(Blitter._blitMipLevelProperty, mipLevel);
    Blitter._texelSize.set(1 / source.width, 1 / source.height, source.width, source.height);
    rendererShaderData.setVector4(Blitter._blitTexelSizeProperty, Blitter._texelSize);
    rendererShaderData.setVector4(Blitter._sourceScaleOffsetProperty, sourceScaleOffset ?? Blitter._defaultScaleOffset);

    const compileMacros = Shader._compileMacros;

    // Fullscreen blit / screen-space / post-process passes only need camera-level macros
    // (e.g. CAMERA_ORTHOGRAPHIC), not scene lighting/shadow/fog macros such as SCENE_POINT_LIGHT_COUNT,
    // which otherwise trigger redundant synchronous shader recompilations when scene lights change.
    ShaderMacroCollection.unionCollection(
      camera.shaderData._macroCollection,
      blitMaterial.shaderData._macroCollection,
      compileMacros
    );

    ShaderMacroCollection.unionCollection(compileMacros, engine._macroCollection, compileMacros);

    const program = pass._getShaderProgram(engine, compileMacros);

    program.bind();
    program.regroupUniformBlocks();
    program.uploadAll(program.sceneUniformBlock, camera.scene!.shaderData);
    program.uploadAll(program.cameraUniformBlock, camera.shaderData);
    program.uploadAll(program.rendererUniformBlock, rendererShaderData);
    program.uploadAll(program.materialUniformBlock, blitMaterial.shaderData);
    program.uploadMultiGroupUniforms(
      camera.scene!.shaderData,
      camera.shaderData,
      rendererShaderData,
      blitMaterial.shaderData,
      undefined
    );
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
