import { Color, MathUtil, Vector3, Vector4 } from "@galacean/engine-math";
import { GLCapabilityType } from "../base/Constant";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { Primitive } from "../graphic/Primitive";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { Material } from "../material";
import type { BasicRenderPipeline } from "../RenderPipeline/BasicRenderPipeline";
import { Blitter } from "../RenderPipeline/Blitter";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { RenderPassDescriptor, RenderPassLoadAction } from "../renderingHardwareInterface";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import type { ShaderPass } from "../shader/ShaderPass";
import { RenderTarget, Texture, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import {
  BloomDownScaleMode,
  BloomEffect,
  ColorAdjustmentsEffect,
  SunLensFlareEffect,
  TonemappingEffect,
  VolumetricLightEffect,
  VolumetricLightQuality
} from "./effects";
import type { SunLensFlareScreenState } from "./effects/SunLensFlareEffect";
import type { VolumetricLightScreenState } from "./effects/VolumetricLightEffect";
import { PostProcessManager } from "./PostProcessManager";
import { PostProcessPass, PostProcessPassEvent } from "./PostProcessPass";

const SUN_LENS_FLARE_GHOST_TABLE: ReadonlyArray<
  readonly [d: number, invR2: number, hexScale: number, r: number, g: number, b: number]
> = [
  [-0.3, 145.0, 11.5, 0.18, 0.91, 1.0],
  [2.5358, 105.0, 13.5, 0.78, 1.0, 0.9],
  [0.0395, 115.0, 16.5, 0.22, 0.65, 1.0],
  [0.2681, 160.0, 19.0, 1.0, 0.24, 0.34],
  [0.034, 150.0, 10.5, 0.2, 0.66, 1.0],
  [1.6031, 135.0, 14.0, 0.22, 0.68, 1.0],
  [1.5336, 155.0, 17.5, 0.14, 0.74, 1.0],
  [0.419, 90.0, 15.5, 1.0, 0.3, 0.16],
  [0.9758, 85.0, 9.5, 0.76, 1.0, 0.9],
  [2.2421, 110.0, 12.5, 1.0, 0.48, 0.3],
  [1.8081, 100.0, 15.0, 0.95, 0.28, 0.46]
];
const SUN_LENS_FLARE_INSTANCE_COUNT = 1 + SUN_LENS_FLARE_GHOST_TABLE.length * 3; // 34 quads
const SUN_LENS_FLARE_VISIBILITY_STEP_RATE = 64; // >= 34 so every instance reads vertex 0
const SUN_LENS_FLARE_GLARE_RADIUS = 0.78;
const SUN_LENS_FLARE_DOT_RADIUS = 1 / Math.sqrt(160.0);
const SUN_LENS_FLARE_CLEAR_COLOR = new Color(0, 0, 0, 1);
const SUN_LENS_FLARE_FULL_DEPTH_RECT = new Vector4(1, 1, 0, 0);

export class PostProcessUberPass extends PostProcessPass {
  static readonly UBER_SHADER_NAME = "PostProcess/Uber";

  private _passDescriptor = new RenderPassDescriptor();

  private _uberMaterial: Material;

  // Bloom
  private _bloomMaterial: Material;
  private _mipRT: RenderTarget[] = [];
  private _bloomMipCount = 0;

  // Sun lens flare (Engine-shared static 34-quad geometry; per-camera TF history & VAOs live on BasicRenderPipeline)
  private _sunLensFlareMaterial: Material | null = null;
  private _sunLensFlareVisibilityPass: ShaderPass | null = null;
  private _sunLensFlareRT: RenderTarget | null = null;
  private _sunLensFlareTFShaderData: ShaderData | null = null;
  private readonly _sunLensFlareTFFeedbackElements: VertexElement[] = [
    new VertexElement("a_PrevVisibility", 0, VertexElementFormat.Float, 0)
  ];
  private _sunLensFlareCornerBinding: VertexBufferBinding | null = null;
  private _sunLensFlareInstanceBinding: VertexBufferBinding | null = null;
  private _sunLensFlareIndexBinding: IndexBufferBinding | null = null;
  private _sunLensFlareStaticVisibilityBinding: VertexBufferBinding | null = null;
  private _sunLensFlareStaticPrimitive: Primitive | null = null;
  private _sunLensFlareSubPrimitive: SubPrimitive | null = null;
  /** @internal */
  _sunLensFlareLastCompositedViaBloom = false;
  /** @internal */
  _sunLensFlareLastDepthMode: "none" | "shared" | "patch" = "none";
  private readonly _sunLensFlareScreenState: SunLensFlareScreenState = {
    visible: false,
    sunU: 0.5,
    sunV: 0.5,
    effectiveIntensity: 0,
    aspectRatio: 1
  };

  // Volumetric light shafts (tiered Low 2D <=270p R11G11B10F, Medium 3D <=360p RG16F, High 3D <=720p RG16F)
  private _volumetricLightMaterial: Material | null = null;
  private _volumetricLightRTA: RenderTarget | null = null;
  private _volumetricLightRTB: RenderTarget | null = null;
  private readonly _volumetricLightBlurOffset = new Vector4(1, 1, 0, 0);
  private readonly _volumetricLightScreenState: VolumetricLightScreenState = {
    visible: false,
    sunU: 0.5,
    sunV: 0.25,
    effectiveStrength: 0,
    aspectRatio: 1
  };

  constructor(engine: Engine) {
    super(engine);
    this.event = PostProcessPassEvent.AfterUber - 1;

    // Uber Material
    const uberMaterial = new Material(engine, Engine._builtinShaders.uber);
    this._uberMaterial = uberMaterial;

    // Bloom Material
    const bloomMaterial = new Material(engine, Engine._builtinShaders.bloom);
    this._bloomMaterial = bloomMaterial;

    // Sun Lens Flare Material (optional builtin shader registered by World ShaderPool)
    const sunLensFlareShader = Shader.find(SunLensFlareEffect._shaderName);
    if (sunLensFlareShader) {
      const sunLensFlareMaterial = new Material(engine, sunLensFlareShader);
      this._sunLensFlareMaterial = sunLensFlareMaterial;
      const flareShaderData = sunLensFlareMaterial.shaderData;
      flareShaderData.setVector4(SunLensFlareEffect._params0Property, new Vector4(0.5, 0.5, 0, 1));
      flareShaderData.setVector4(SunLensFlareEffect._params1Property, new Vector4(0.75, 1.2, 1, 0.8));
      flareShaderData.setVector4(SunLensFlareEffect._tintProperty, new Vector4(1, 0.94, 0.84, 0));
      flareShaderData.setFloat(SunLensFlareEffect._visibilityOverrideProperty, 1);

      const visibilityShader = Shader.find(SunLensFlareEffect._visibilityShaderName);
      this._sunLensFlareVisibilityPass = visibilityShader?.subShaders[0]?.passes[0] ?? null;
      if (this._sunLensFlareVisibilityPass) {
        const tfShaderData = new ShaderData(ShaderDataGroup.Renderer);
        tfShaderData.setVector4(SunLensFlareEffect._tfDepthRectProperty, new Vector4(1, 1, 0, 0));
        tfShaderData.setVector4(SunLensFlareEffect._tfParams0Property, new Vector4(0.5, 0.5, 1, 0.012));
        tfShaderData.setVector4(SunLensFlareEffect._tfParams1Property, new Vector4(0.999998, 1, 0, 0));
        this._sunLensFlareTFShaderData = tfShaderData;
      }
    }

    // Volumetric Light Material (optional builtin shader registered by World ShaderPool)
    const volumetricLightShader = Shader.find(VolumetricLightEffect._shaderName);
    if (volumetricLightShader) {
      const vlMaterial = new Material(engine, volumetricLightShader);
      this._volumetricLightMaterial = vlMaterial;
      const vlShaderData = vlMaterial.shaderData;
      vlShaderData.setTexture(VolumetricLightEffect._depthTextureProperty, engine._basicResources.whiteTexture2D);
      vlShaderData.setVector4(VolumetricLightEffect._params0Property, new Vector4(0.5, 0.25, 0.72, 0.93));
      vlShaderData.setVector4(VolumetricLightEffect._params1Property, new Vector4(0.9997, 0, 1, 1));
      vlShaderData.setVector4(VolumetricLightEffect._tintProperty, new Vector4(1, 0.9, 0.68, 0));
      vlShaderData.setFloat(VolumetricLightEffect._thresholdProperty, 0.18);
      vlShaderData.setVector4(VolumetricLightEffect._raymarchParams0Property, new Vector4(1, 1, 80, 0.72));
      vlShaderData.setVector4(VolumetricLightEffect._raymarchParams1Property, new Vector4(0.035, 0, 0, 0));
      vlShaderData.setVector4(VolumetricLightEffect._sunDirProperty, new Vector4(0, 1, 0, 0));
      vlShaderData.setFloat(VolumetricLightEffect._bilateralSharpnessProperty, 12);
    }

    // ShaderData initialization
    const bloomShaderData = bloomMaterial.shaderData;
    const uberShaderData = uberMaterial.shaderData;
    bloomShaderData.setVector4(BloomEffect._bloomParams, new Vector4());
    bloomShaderData.setFloat(ColorAdjustmentsEffect._postExposureProperty, 1);
    uberShaderData.setVector4(BloomEffect._bloomTexelSizeProp, new Vector4());
    uberShaderData.setVector4(BloomEffect._bloomIntensityParams, new Vector4());
    uberShaderData.setVector4(BloomEffect._dirtTilingOffsetProp, new Vector4());
    uberShaderData.setColor(BloomEffect._tintProp, new Color());
    uberShaderData.setFloat(ColorAdjustmentsEffect._postExposureProperty, 1);
    uberShaderData.setVector3(ColorAdjustmentsEffect._whiteBalanceProperty, new Vector3(1, 1, 1));
    uberShaderData.setVector4(ColorAdjustmentsEffect._adjustmentsProperty, new Vector4(1, 1, 0, 0));
    uberShaderData.setFloat(SunLensFlareEffect._compositeIntensityProperty, 0);
    uberShaderData.setTexture(VolumetricLightEffect._depthTextureProperty, engine._basicResources.whiteTexture2D);
    uberShaderData.setVector4(VolumetricLightEffect._compositeParamsProperty, new Vector4(0.5, 0.25, 0.6, 1));
    uberShaderData.setVector4(VolumetricLightEffect._tintProperty, new Vector4(1, 0.9, 0.68, 0));
  }

  /** @inheritdoc */
  override isValid(postProcessManager: PostProcessManager): boolean {
    if (!this.isActive) {
      return false;
    }

    const bloomBlend = postProcessManager.getBlendEffect(BloomEffect);
    const tonemappingBlend = postProcessManager.getBlendEffect(TonemappingEffect);
    const colorAdjustmentsBlend = postProcessManager.getBlendEffect(ColorAdjustmentsEffect);
    const sunLensFlareBlend = postProcessManager.getBlendEffect(SunLensFlareEffect);
    const volumetricLightBlend = postProcessManager.getBlendEffect(VolumetricLightEffect);
    return (
      bloomBlend?.isValid() ||
      tonemappingBlend?.isValid() ||
      colorAdjustmentsBlend?.isValid() ||
      sunLensFlareBlend?.isValid() ||
      volumetricLightBlend?.isValid()
    );
  }

  /**
   * @inheritdoc
   */
  onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    const postProcessManager = camera.scene!.postProcessManager;
    const uberShaderData = this._uberMaterial.shaderData;
    const bloomBlend = postProcessManager.getBlendEffect(BloomEffect);
    const tonemappingBlend = postProcessManager.getBlendEffect(TonemappingEffect);
    const colorAdjustmentsBlend = postProcessManager.getBlendEffect(ColorAdjustmentsEffect);
    const sunLensFlareBlend = postProcessManager.getBlendEffect(SunLensFlareEffect);
    const volumetricLightBlend = postProcessManager.getBlendEffect(VolumetricLightEffect);
    let exposureMultiplier = 1;

    if (colorAdjustmentsBlend?.isValid()) {
      exposureMultiplier = Math.pow(2, colorAdjustmentsBlend.postExposure.value);
      uberShaderData.setFloat(ColorAdjustmentsEffect._postExposureProperty, exposureMultiplier);
      ColorAdjustmentsEffect._computeWhiteBalance(
        colorAdjustmentsBlend.temperature.value,
        colorAdjustmentsBlend.tint.value,
        uberShaderData.getVector3(ColorAdjustmentsEffect._whiteBalanceProperty)
      );
      const adjustments = uberShaderData.getVector4(ColorAdjustmentsEffect._adjustmentsProperty);
      adjustments.x = colorAdjustmentsBlend.contrast.value / 100 + 1;
      adjustments.y = colorAdjustmentsBlend.saturation.value / 100 + 1;
      uberShaderData.enableMacro(ColorAdjustmentsEffect._enableMacro);
    } else {
      uberShaderData.setFloat(ColorAdjustmentsEffect._postExposureProperty, 1);
      uberShaderData.getVector3(ColorAdjustmentsEffect._whiteBalanceProperty).set(1, 1, 1);
      uberShaderData.getVector4(ColorAdjustmentsEffect._adjustmentsProperty).set(1, 1, 0, 0);
      uberShaderData.disableMacro(ColorAdjustmentsEffect._enableMacro);
    }

    if (bloomBlend?.isValid()) {
      this._setupBloom(bloomBlend, camera, srcTexture, exposureMultiplier);
      uberShaderData.enableMacro(BloomEffect._enableMacro);
    } else {
      uberShaderData.disableMacro(BloomEffect._enableMacro);
      uberShaderData.setTexture(BloomEffect._bloomTextureProp, null);
      this._releaseBloomRenderTargets(0);
    }

    if (sunLensFlareBlend?.isValid()) {
      this._setupSunLensFlare(sunLensFlareBlend, bloomBlend, camera);
      uberShaderData.enableMacro(SunLensFlareEffect._enableMacro);
    } else {
      uberShaderData.setFloat(SunLensFlareEffect._compositeIntensityProperty, 0);
      uberShaderData.disableMacro(SunLensFlareEffect._enableMacro);
      this._releaseSunLensFlareRenderTarget();
      const pipeline = camera._renderPipeline as BasicRenderPipeline | null;
      pipeline?._sunLensFlareCameraState?.invalidateHistory();
      this._sunLensFlareLastCompositedViaBloom = false;
      this._sunLensFlareLastDepthMode = "none";
    }

    if (volumetricLightBlend?.isValid()) {
      if (this._setupVolumetricLight(volumetricLightBlend, camera, srcTexture, exposureMultiplier)) {
        uberShaderData.enableMacro(VolumetricLightEffect._enableMacro);
      } else {
        uberShaderData.disableMacro(VolumetricLightEffect._enableMacro);
      }
    } else {
      uberShaderData.getVector4(VolumetricLightEffect._tintProperty).w = 0;
      uberShaderData.disableMacro(VolumetricLightEffect._enableMacro);
      uberShaderData.disableMacro(VolumetricLightEffect._raymarchMacro);
      this._releaseVolumetricLightRenderTargets();
    }

    if (tonemappingBlend?.isValid()) {
      uberShaderData.enableMacro("TONEMAPPING_MODE", tonemappingBlend.mode.value.toString());
      uberShaderData.enableMacro(TonemappingEffect._enableMacro);
    } else {
      uberShaderData.disableMacro(TonemappingEffect._enableMacro);
    }
    const engine = camera.engine;
    const context = engine._renderContext;
    const viewport = destTarget === camera.renderTarget ? camera.viewport : PipelineUtils.defaultViewport;
    const isFullViewport = viewport.x === 0 && viewport.y === 0 && viewport.z === 1 && viewport.w === 1;
    const passDescriptor = this._passDescriptor.reset(destTarget, viewport);
    passDescriptor.colorLoadAction =
      destTarget && destTarget.colorTextureCount === 1 && isFullViewport
        ? RenderPassLoadAction.DontCare
        : RenderPassLoadAction.Load;
    context.beginRenderPass(passDescriptor);
    Blitter.draw(engine, srcTexture, 0, this._uberMaterial);
    context.endRenderPass();
  }

  /**
   * @internal
   * @inheritdoc
   */
  override _onDestroy() {
    super._onDestroy();
    this._releaseBloomRenderTargets(0);
    this._releaseSunLensFlareRenderTarget();
    this._destroySunLensFlareGpuResources();
    this._releaseVolumetricLightRenderTargets();
    this._uberMaterial.destroy();
    this._bloomMaterial.destroy();
    this._sunLensFlareMaterial?.destroy();
    this._sunLensFlareMaterial = null;
    this._sunLensFlareVisibilityPass = null;
    this._sunLensFlareTFShaderData = null;
    this._volumetricLightMaterial?.destroy();
    this._volumetricLightMaterial = null;
  }

  private _setupVolumetricLight(
    volumetricLightBlend: VolumetricLightEffect,
    camera: Camera,
    srcTexture: Texture2D,
    exposureMultiplier: number
  ): boolean {
    const engine = camera.engine;
    const scene = camera.scene!;
    const rhi = engine._hardwareRenderer;
    const uberShaderData = this._uberMaterial.shaderData;
    const vlMaterial = this._volumetricLightMaterial;
    const quality = volumetricLightBlend.quality.value;
    const screenState = VolumetricLightEffect._resolveScreenState(
      camera,
      scene,
      volumetricLightBlend,
      this._volumetricLightScreenState
    );

    if (!vlMaterial || !screenState.visible) {
      uberShaderData.getVector4(VolumetricLightEffect._tintProperty).w = 0;
      uberShaderData.disableMacro(VolumetricLightEffect._raymarchMacro);
      uberShaderData.setTexture(VolumetricLightEffect._textureProperty, engine._basicResources.whiteTexture2D);
      this._releaseVolumetricLightRenderTargets();
      return false;
    }

    const depthTexture =
      camera._depthTextureSource !== "none" ? camera.shaderData.getTexture(Camera._cameraDepthTextureProperty) : null;
    const hasDepth = depthTexture ? 1 : 0;
    const useRaymarch = Boolean(screenState.useRaymarch && depthTexture);

    // Resolve normalized directional sunlight hue without double-tinting legacy warm default tint.
    const tint = volumetricLightBlend.tint.value;
    const sunlight = scene._lightManager._sunlight ?? scene.sun;
    let sunR = 1;
    let sunG = 1;
    let sunB = 1;
    if (sunlight) {
      const sc = sunlight.color;
      const peak = Math.max(sc.r, sc.g, sc.b, 1e-4);
      sunR = sc.r / peak;
      sunG = sc.g / peak;
      sunB = sc.b / peak;
    }
    const isLegacyDefaultTint =
      Math.abs(tint.r - 1.0) < 1e-3 && Math.abs(tint.g - 0.9) < 1e-3 && Math.abs(tint.b - 0.68) < 1e-3;
    const tintR = isLegacyDefaultTint ? sunR : sunR * tint.r;
    const tintG = isLegacyDefaultTint ? sunG : sunG * tint.g;
    const tintB = isLegacyDefaultTint ? sunB : sunB * tint.b;

    const shortEdge = Math.min(srcTexture.width, srcTexture.height);
    const vlShaderData = vlMaterial.shaderData;
    vlShaderData.setTexture(
      VolumetricLightEffect._depthTextureProperty,
      depthTexture ?? engine._basicResources.whiteTexture2D
    );

    if (useRaymarch) {
      const isHigh = quality === VolumetricLightQuality.High;
      const scale = isHigh ? Math.min(0.5, 720 / Math.max(1, shortEdge)) : Math.min(0.35, 360 / Math.max(1, shortEdge));
      const lowW = Math.max(1, Math.round(srcTexture.width * scale));
      const lowH = Math.max(1, Math.round(srcTexture.height * scale));
      const useRG16F = rhi.supportsRenderTargetColorFormat(TextureFormat.R16G16_SFloat);
      const rtFormat = useRG16F ? TextureFormat.R16G16_SFloat : TextureFormat.R16G16B16A16_SFloat;

      this._volumetricLightRTA = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._volumetricLightRTA,
        lowW,
        lowH,
        rtFormat,
        null,
        false,
        false,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
      this._volumetricLightRTB = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._volumetricLightRTB,
        lowW,
        lowH,
        rtFormat,
        null,
        false,
        false,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );

      vlShaderData.enableMacro("VOLUMETRIC_LIGHT_QUALITY", quality.toString());
      const heightFalloff = volumetricLightBlend.heightFalloff.value;
      if (heightFalloff > 1e-4) {
        vlShaderData.enableMacro(VolumetricLightEffect._heightFogMacro);
      } else {
        vlShaderData.disableMacro(VolumetricLightEffect._heightFogMacro);
      }

      const p = camera.projectionMatrix.elements;
      const invProjX = Math.abs(p[0]) > 1e-6 ? 1.0 / p[0] : 1.0;
      const invProjY = Math.abs(p[5]) > 1e-6 ? 1.0 / p[5] : 1.0;
      const maxDistance = Math.min(volumetricLightBlend.maxDistance.value, scene.shadowDistance);

      vlShaderData
        .getVector4(VolumetricLightEffect._raymarchParams0Property)
        .set(invProjX, invProjY, maxDistance, volumetricLightBlend.anisotropy.value);
      vlShaderData
        .getVector4(VolumetricLightEffect._raymarchParams1Property)
        .set(volumetricLightBlend.extinction.value, heightFalloff, volumetricLightBlend.baseHeight.value, 0);
      vlShaderData
        .getVector4(VolumetricLightEffect._sunDirProperty)
        .set(screenState.dirToSunX ?? 0, screenState.dirToSunY ?? 1, screenState.dirToSunZ ?? 0, 0);
      vlShaderData.setFloat(
        VolumetricLightEffect._bilateralSharpnessProperty,
        volumetricLightBlend.bilateralSharpness.value
      );

      const context = engine._renderContext;
      const passDescriptor = this._passDescriptor;
      // Pass 3: 3D Shadow-Map Raymarching -> RT A
      passDescriptor.reset(this._volumetricLightRTA);
      passDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
      context.beginRenderPass(passDescriptor);
      Blitter.draw(engine, srcTexture, 0, vlMaterial, 3);
      context.endRenderPass();
      // Pass 4 (H): Horizontal separable depth-aware bilateral blur (RT A -> RT B)
      const blurOffset = this._volumetricLightBlurOffset;
      blurOffset.set(1, 1, 1 / lowW, 0);
      passDescriptor.reset(this._volumetricLightRTB);
      passDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
      context.beginRenderPass(passDescriptor);
      Blitter.draw(engine, this._volumetricLightRTA.getColorTexture(0) as Texture2D, 0, vlMaterial, 4, blurOffset);
      context.endRenderPass();
      // Pass 4 (V): Vertical separable depth-aware bilateral blur (RT B -> RT A)
      blurOffset.set(1, 1, 0, 1 / lowH);
      passDescriptor.reset(this._volumetricLightRTA);
      passDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
      context.beginRenderPass(passDescriptor);
      Blitter.draw(engine, this._volumetricLightRTB.getColorTexture(0) as Texture2D, 0, vlMaterial, 4, blurOffset);
      context.endRenderPass();

      uberShaderData.enableMacro(VolumetricLightEffect._raymarchMacro);
      uberShaderData.setTexture(VolumetricLightEffect._textureProperty, this._volumetricLightRTA.getColorTexture(0));
      uberShaderData.setTexture(VolumetricLightEffect._depthTextureProperty, depthTexture);
      uberShaderData
        .getVector4(VolumetricLightEffect._compositeParamsProperty)
        .set(1 / lowW, 1 / lowH, volumetricLightBlend.softKnee.value, volumetricLightBlend.bilateralSharpness.value);
      const strength = screenState.effectiveStrength * exposureMultiplier;
      // Physical single scattering uses real linear HDR sunlight irradiance (`sunlight.color`), matching UE/HDRP/Frostbite.
      const radR = sunlight ? (isLegacyDefaultTint ? sunlight.color.r : sunlight.color.r * tint.r) : tintR;
      const radG = sunlight ? (isLegacyDefaultTint ? sunlight.color.g : sunlight.color.g * tint.g) : tintG;
      const radB = sunlight ? (isLegacyDefaultTint ? sunlight.color.b : sunlight.color.b * tint.b) : tintB;
      uberShaderData
        .getVector4(VolumetricLightEffect._tintProperty)
        .set(radR * strength, radG * strength, radB * strength, 1);
      return true;
    }

    // Low quality (default, or automatic fallback when shadows/depth are unavailable):
    // 3-pass <=270p R11G11B10F (1-tap sequential extract -> 8-tap coarse -> 8-tap fine).
    const scale = Math.min(0.25, 270 / Math.max(1, shortEdge));
    const lowW = Math.max(1, Math.round(srcTexture.width * scale));
    const lowH = Math.max(1, Math.round(srcTexture.height * scale));
    const useR11G11B10 = rhi.supportsRenderTargetColorFormat(TextureFormat.R11G11B10_UFloat);
    const rtFormat = useR11G11B10 ? TextureFormat.R11G11B10_UFloat : TextureFormat.R8G8B8A8_UNorm;

    this._volumetricLightRTA = PipelineUtils.recreateRenderTargetIfNeeded(
      engine,
      this._volumetricLightRTA,
      lowW,
      lowH,
      rtFormat,
      null,
      false,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear
    );
    this._volumetricLightRTB = PipelineUtils.recreateRenderTargetIfNeeded(
      engine,
      this._volumetricLightRTB,
      lowW,
      lowH,
      rtFormat,
      null,
      false,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear
    );

    vlShaderData
      .getVector4(VolumetricLightEffect._params0Property)
      .set(screenState.sunU, screenState.sunV, volumetricLightBlend.density.value, volumetricLightBlend.decay.value);
    vlShaderData
      .getVector4(VolumetricLightEffect._params1Property)
      .set(volumetricLightBlend.skyDepthThreshold.value, hasDepth, screenState.aspectRatio, exposureMultiplier);
    vlShaderData
      .getVector4(VolumetricLightEffect._tintProperty)
      .set(tintR, tintG, tintB, screenState.effectiveStrength);
    vlShaderData.setFloat(VolumetricLightEffect._thresholdProperty, volumetricLightBlend.threshold.value);

    const context = engine._renderContext;
    const passDescriptor = this._passDescriptor;
    // Pass 0 (<=270p -> RT A): 1-tap sequential downsample + HDR sky luminance contrast extract.
    passDescriptor.reset(this._volumetricLightRTA);
    passDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
    context.beginRenderPass(passDescriptor);
    Blitter.draw(engine, srcTexture, 0, vlMaterial, 0);
    context.endRenderPass();
    // Pass 1 (<=270p -> RT B): 8-tap coarse radial scatter strictly inside low-res RT.
    passDescriptor.reset(this._volumetricLightRTB);
    passDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
    context.beginRenderPass(passDescriptor);
    Blitter.draw(engine, this._volumetricLightRTA.getColorTexture(0) as Texture2D, 0, vlMaterial, 1);
    context.endRenderPass();
    // Pass 2 (<=270p -> RT A): 8-tap cascaded fine scatter (64-step equivalent smooth rays).
    passDescriptor.reset(this._volumetricLightRTA);
    passDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
    context.beginRenderPass(passDescriptor);
    Blitter.draw(engine, this._volumetricLightRTB.getColorTexture(0) as Texture2D, 0, vlMaterial, 2);
    context.endRenderPass();

    uberShaderData.disableMacro(VolumetricLightEffect._raymarchMacro);
    uberShaderData.setTexture(VolumetricLightEffect._textureProperty, this._volumetricLightRTA.getColorTexture(0));
    uberShaderData
      .getVector4(VolumetricLightEffect._compositeParamsProperty)
      .set(screenState.sunU, screenState.sunV, volumetricLightBlend.softKnee.value, screenState.aspectRatio);
    uberShaderData
      .getVector4(VolumetricLightEffect._tintProperty)
      .set(tintR, tintG, tintB, screenState.effectiveStrength);
    return true;
  }

  private _releaseVolumetricLightRenderTargets(): void {
    const pool = this.engine._renderTargetPool;
    if (this._volumetricLightRTA) {
      pool.freeRenderTarget(this._volumetricLightRTA);
      this._volumetricLightRTA = null;
    }
    if (this._volumetricLightRTB) {
      pool.freeRenderTarget(this._volumetricLightRTB);
      this._volumetricLightRTB = null;
    }
  }

  private _setupSunLensFlare(
    sunLensFlareBlend: SunLensFlareEffect,
    bloomBlend: BloomEffect | undefined,
    camera: Camera
  ): void {
    const engine = camera.engine;
    const rhi = engine._hardwareRenderer;
    const uberShaderData = this._uberMaterial.shaderData;
    const flareMaterial = this._sunLensFlareMaterial;
    const pipeline = camera._renderPipeline as BasicRenderPipeline | null;
    const screenState = SunLensFlareEffect._resolveScreenState(
      camera,
      camera.scene!,
      sunLensFlareBlend,
      this._sunLensFlareScreenState
    );

    if (!flareMaterial || !screenState.visible) {
      uberShaderData.setFloat(SunLensFlareEffect._compositeIntensityProperty, 0);
      uberShaderData.setTexture(SunLensFlareEffect._textureProperty, engine._basicResources.whiteTexture2D);
      this._releaseSunLensFlareRenderTarget();
      pipeline?._sunLensFlareCameraState?.invalidateHistory();
      this._sunLensFlareLastCompositedViaBloom = false;
      this._sunLensFlareLastDepthMode = "none";
      return;
    }

    this._ensureSunLensFlareGeometry(engine);

    // Resolve depth source: prefer existing shared camera_DepthTexture, otherwise use the 64x64 local sun depth patch.
    let depthTexture: Texture | null = null;
    let depthRect = SUN_LENS_FLARE_FULL_DEPTH_RECT;
    let depthMode: "none" | "shared" | "patch" = "none";
    if (sunLensFlareBlend.depthOcclusion.value) {
      if (camera._depthTextureSource !== "none") {
        depthTexture = camera.shaderData.getTexture(Camera._cameraDepthTextureProperty);
        if (depthTexture) {
          depthMode = "shared";
        }
      } else if (pipeline?._sunLensFlareDepthTexture) {
        depthTexture = pipeline._sunLensFlareDepthTexture;
        depthRect = pipeline._sunLensFlareDepthRect;
        depthMode = "patch";
      }
    }
    this._sunLensFlareLastDepthMode = depthMode;

    const useDepthOcclusion = depthTexture !== null;
    let primitive = this._sunLensFlareStaticPrimitive!;
    let visibilityOverride = 1;

    if (useDepthOcclusion && pipeline && this._sunLensFlareVisibilityPass && this._sunLensFlareTFShaderData) {
      const cameraState = pipeline._getOrCreateSunLensFlareCameraState();
      const simulator = cameraState.ensureVisibilityTF(engine, this._sunLensFlareVisibilityPass);
      const tfShaderData = this._sunLensFlareTFShaderData;
      if (simulator) {
        const tau = sunLensFlareBlend.temporalSmoothing.value;
        const elapsedTime = engine.time.elapsedTime;
        const dt =
          cameraState.lastElapsedTime < 0
            ? -1
            : elapsedTime > cameraState.lastElapsedTime
              ? elapsedTime - cameraState.lastElapsedTime
              : elapsedTime === cameraState.lastElapsedTime
                ? engine.time.actualDeltaTime
                : -1;
        const sunJump = Math.hypot(screenState.sunU - cameraState.lastSunU, screenState.sunV - cameraState.lastSunV);
        const snapHistory =
          !cameraState.historyValid ||
          !cameraState.lastDepthOcclusion ||
          tau <= 1e-4 ||
          dt <= 0 ||
          dt > 0.5 ||
          sunJump > 0.35;
        const blendFactor = snapHistory ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) / tau);

        tfShaderData.setTexture(SunLensFlareEffect._tfDepthTextureProperty, depthTexture);
        tfShaderData.getVector4(SunLensFlareEffect._tfDepthRectProperty).copyFrom(depthRect);
        tfShaderData
          .getVector4(SunLensFlareEffect._tfParams0Property)
          .set(screenState.sunU, screenState.sunV, screenState.aspectRatio, 0.012);
        tfShaderData.getVector4(SunLensFlareEffect._tfParams1Property).set(0.999998, blendFactor, 0, 0);

        if (simulator.beginUpdate(tfShaderData, this._sunLensFlareTFFeedbackElements, [], [])) {
          try {
            simulator.draw(MeshTopology.Points, 0, 1);
          } finally {
            simulator.endUpdate();
            tfShaderData.setTexture(SunLensFlareEffect._tfDepthTextureProperty, null);
          }
          primitive = cameraState.getOrCreatePrimitive(
            engine,
            simulator.readBinding,
            this._sunLensFlareCornerBinding!,
            this._sunLensFlareInstanceBinding!,
            this._sunLensFlareIndexBinding!,
            SUN_LENS_FLARE_INSTANCE_COUNT,
            SUN_LENS_FLARE_VISIBILITY_STEP_RATE
          );
          visibilityOverride = -1;
          cameraState.historyValid = true;
          cameraState.lastDepthOcclusion = true;
          cameraState.lastSunU = screenState.sunU;
          cameraState.lastSunV = screenState.sunV;
          cameraState.lastElapsedTime = elapsedTime;
        } else {
          tfShaderData.setTexture(SunLensFlareEffect._tfDepthTextureProperty, null);
          cameraState.invalidateHistory();
        }
      }
    } else {
      pipeline?._sunLensFlareCameraState?.invalidateHistory();
    }

    // Optimization #2: When HDR Bloom is active and has written _mipRT[0], draw additive quads
    // directly into Bloom's _mipRT[0] with tint pre-compensation, eliminating _sunLensFlareRT VRAM and UberPost fetch.
    const canReuseBloomRT =
      camera._isInternalFormatHDR() &&
      Boolean(bloomBlend?.isValid()) &&
      this._bloomMipCount >= 1 &&
      this._mipRT[0] != null &&
      !bloomBlend!.dirtTexture.value &&
      bloomBlend!.intensity.value > 0.05 &&
      Math.min(bloomBlend!.tint.value.r, bloomBlend!.tint.value.g, bloomBlend!.tint.value.b) > 0.05;

    const tint = sunLensFlareBlend.tint.value;
    let tintR = tint.r;
    let tintG = tint.g;
    let tintB = tint.b;
    let targetRT: RenderTarget;
    let clearTarget: boolean;

    if (canReuseBloomRT) {
      this._releaseSunLensFlareRenderTarget();
      targetRT = this._mipRT[0];
      clearTarget = false;
      const invBloomIntensity = 1 / bloomBlend!.intensity.value;
      const bloomTint = bloomBlend!.tint.value;
      tintR = (tintR * invBloomIntensity) / bloomTint.r;
      tintG = (tintG * invBloomIntensity) / bloomTint.g;
      tintB = (tintB * invBloomIntensity) / bloomTint.b;
      uberShaderData.setFloat(SunLensFlareEffect._compositeIntensityProperty, 0);
      uberShaderData.setTexture(SunLensFlareEffect._textureProperty, engine._basicResources.whiteTexture2D);
      this._sunLensFlareLastCompositedViaBloom = true;
    } else {
      const pixelViewport = camera.pixelViewport;
      const width = Math.max(1, pixelViewport.width >> 2);
      const height = Math.max(1, pixelViewport.height >> 2);
      const internalColorTextureFormat = camera._getInternalColorTextureFormat();
      const isSRGB = !camera._isInternalFormatHDR();
      this._sunLensFlareRT = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._sunLensFlareRT,
        width,
        height,
        internalColorTextureFormat,
        null,
        false,
        false,
        isSRGB,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
      targetRT = this._sunLensFlareRT;
      clearTarget = true;
      uberShaderData.setTexture(SunLensFlareEffect._textureProperty, this._sunLensFlareRT.getColorTexture(0));
      uberShaderData.setFloat(SunLensFlareEffect._compositeIntensityProperty, 1);
      this._sunLensFlareLastCompositedViaBloom = false;
    }

    const flareShaderData = flareMaterial.shaderData;
    flareShaderData
      .getVector4(SunLensFlareEffect._params0Property)
      .set(screenState.sunU, screenState.sunV, screenState.effectiveIntensity, screenState.aspectRatio);
    flareShaderData
      .getVector4(SunLensFlareEffect._params1Property)
      .set(
        sunLensFlareBlend.glareIntensity.value,
        sunLensFlareBlend.ghostIntensity.value,
        sunLensFlareBlend.ghostSpread.value,
        sunLensFlareBlend.ghostChromaticity.value
      );
    flareShaderData.getVector4(SunLensFlareEffect._tintProperty).set(tintR, tintG, tintB, engine.time.elapsedTime);
    flareShaderData.setFloat(SunLensFlareEffect._visibilityOverrideProperty, visibilityOverride);

    // Draw 34 tightly-bounded additive instanced quads directly into targetRT (_mipRT[0] or _sunLensFlareRT).
    const context = engine._renderContext;
    context.flipProjection = true;
    context.setRenderTarget(targetRT, PipelineUtils.defaultViewport, 0);
    if (clearTarget) {
      rhi.clearRenderTarget(engine, CameraClearFlags.Color, SUN_LENS_FLARE_CLEAR_COLOR);
    }

    const pass = flareMaterial.shader.subShaders[0].passes[0];
    const compileMacros = Shader._compileMacros;
    ShaderMacroCollection.unionCollection(
      camera.shaderData._macroCollection,
      flareShaderData._macroCollection,
      compileMacros
    );
    ShaderMacroCollection.unionCollection(compileMacros, engine._macroCollection, compileMacros);

    const program = pass._getShaderProgram(engine, compileMacros);
    if (!program.isValid) {
      return;
    }
    program.bind();
    program.regroupUniformBlocks();
    program.uploadAll(program.sceneUniformBlock, camera.scene!.shaderData);
    program.uploadAll(program.cameraUniformBlock, camera.shaderData);
    program.uploadAll(program.materialUniformBlock, flareShaderData);
    program.uploadMultiGroupUniforms(
      camera.scene!.shaderData,
      camera.shaderData,
      undefined,
      flareShaderData,
      undefined
    );
    program.uploadUnGroupTextures();

    const renderState = pass._renderState;
    renderState._applyStates(engine, false, pass._renderStateDataMap, flareShaderData);

    rhi.drawPrimitive(primitive, this._sunLensFlareSubPrimitive!, program);
  }

  private _ensureSunLensFlareGeometry(engine: Engine): void {
    if (this._sunLensFlareCornerBinding) {
      return;
    }

    const cornerData = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
    const cornerBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, cornerData, BufferUsage.Static);
    cornerBuffer.isGCIgnored = true;
    this._sunLensFlareCornerBinding = new VertexBufferBinding(cornerBuffer, 8);

    const indexData = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indexData, BufferUsage.Static);
    indexBuffer.isGCIgnored = true;
    this._sunLensFlareIndexBinding = new IndexBufferBinding(indexBuffer, IndexFormat.UInt16);

    // Bake 34 static instances: 1 glare + 11 circular bokeh + 11 crisp hexagons + 11 pinpoint sparkles.
    const instanceData = new Float32Array(SUN_LENS_FLARE_INSTANCE_COUNT * 8);
    let offset = 0;
    // Instance 0: Sun glare (shapeType = 0)
    instanceData[offset++] = 0;
    instanceData[offset++] = 0;
    instanceData[offset++] = SUN_LENS_FLARE_GLARE_RADIUS;
    instanceData[offset++] = 0;
    instanceData[offset++] = 1;
    instanceData[offset++] = 1;
    instanceData[offset++] = 1;
    instanceData[offset++] = 1;

    // Instances 1..11: Soft circular bokeh (shapeType = 1)
    for (let i = 0; i < SUN_LENS_FLARE_GHOST_TABLE.length; i++) {
      const [d, invR2, , r, g, b] = SUN_LENS_FLARE_GHOST_TABLE[i];
      instanceData[offset++] = -d;
      instanceData[offset++] = 0;
      instanceData[offset++] = 1 / Math.sqrt(invR2);
      instanceData[offset++] = 1;
      instanceData[offset++] = r;
      instanceData[offset++] = g;
      instanceData[offset++] = b;
      instanceData[offset++] = 1;
    }

    // Instances 12..22: Crisp coated hexagons (shapeType = 2)
    for (let i = 0; i < SUN_LENS_FLARE_GHOST_TABLE.length; i++) {
      const [d, , hexScale, r, g, b] = SUN_LENS_FLARE_GHOST_TABLE[i];
      instanceData[offset++] = -(d * 1.12 + 0.14);
      instanceData[offset++] = 0;
      instanceData[offset++] = 0.6 / hexScale;
      instanceData[offset++] = 2;
      instanceData[offset++] = r;
      instanceData[offset++] = g;
      instanceData[offset++] = b;
      instanceData[offset++] = 1;
    }

    // Instances 23..33: Pinpoint optical-axis sparkles (shapeType = 3)
    for (let i = 0; i < SUN_LENS_FLARE_GHOST_TABLE.length; i++) {
      const [d, , , r, g, b] = SUN_LENS_FLARE_GHOST_TABLE[i];
      instanceData[offset++] = (d - 1.0) * 0.5;
      instanceData[offset++] = 0;
      instanceData[offset++] = SUN_LENS_FLARE_DOT_RADIUS;
      instanceData[offset++] = 3;
      instanceData[offset++] = r;
      instanceData[offset++] = g;
      instanceData[offset++] = b;
      instanceData[offset++] = 1;
    }

    const instanceBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, instanceData, BufferUsage.Static);
    instanceBuffer.isGCIgnored = true;
    this._sunLensFlareInstanceBinding = new VertexBufferBinding(instanceBuffer, 32);

    const staticVisibilityBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      new Float32Array([1.0]),
      BufferUsage.Static
    );
    staticVisibilityBuffer.isGCIgnored = true;
    this._sunLensFlareStaticVisibilityBinding = new VertexBufferBinding(staticVisibilityBuffer, 4);

    const staticPrimitive = new Primitive(engine);
    staticPrimitive.isGCIgnored = true;
    staticPrimitive.instanceCount = SUN_LENS_FLARE_INSTANCE_COUNT;
    staticPrimitive.setVertexBufferBinding(0, this._sunLensFlareCornerBinding);
    staticPrimitive.setVertexBufferBinding(1, this._sunLensFlareInstanceBinding);
    staticPrimitive.setVertexBufferBinding(2, this._sunLensFlareStaticVisibilityBinding);
    staticPrimitive.setIndexBufferBinding(this._sunLensFlareIndexBinding);
    staticPrimitive.addVertexElement(new VertexElement("a_QuadCorner", 0, VertexElementFormat.Vector2, 0, 0));
    staticPrimitive.addVertexElement(new VertexElement("a_FlareGeo", 0, VertexElementFormat.Vector4, 1, 1));
    staticPrimitive.addVertexElement(new VertexElement("a_FlareHue", 16, VertexElementFormat.Vector4, 1, 1));
    staticPrimitive.addVertexElement(
      new VertexElement("a_SunVisibility", 0, VertexElementFormat.Float, 2, SUN_LENS_FLARE_VISIBILITY_STEP_RATE)
    );
    this._sunLensFlareStaticPrimitive = staticPrimitive;

    this._sunLensFlareSubPrimitive = new SubPrimitive(0, 6, MeshTopology.Triangles);
  }

  private _releaseSunLensFlareRenderTarget(): void {
    const rt = this._sunLensFlareRT;
    if (rt) {
      this.engine._renderTargetPool.freeRenderTarget(rt);
      this._sunLensFlareRT = null;
    }
  }

  private _destroySunLensFlareGpuResources(): void {
    this._sunLensFlareStaticPrimitive?.destroy();
    this._sunLensFlareStaticPrimitive = null;
    this._sunLensFlareCornerBinding?.buffer.destroy();
    this._sunLensFlareCornerBinding = null;
    this._sunLensFlareInstanceBinding?.buffer.destroy();
    this._sunLensFlareInstanceBinding = null;
    this._sunLensFlareIndexBinding?.buffer.destroy();
    this._sunLensFlareIndexBinding = null;
    this._sunLensFlareStaticVisibilityBinding?.buffer.destroy();
    this._sunLensFlareStaticVisibilityBinding = null;
    this._sunLensFlareSubPrimitive = null;
    this._sunLensFlareLastCompositedViaBloom = false;
    this._sunLensFlareLastDepthMode = "none";
  }

  private _setupBloom(bloomBlend: BloomEffect, camera: Camera, srcTexture: Texture2D, exposureMultiplier: number) {
    const engine = camera.engine;
    const bloomMaterial = this._bloomMaterial;
    const bloomShaderData = bloomMaterial.shaderData;
    const uberMaterial = this._uberMaterial;
    const uberShaderData = uberMaterial.shaderData;
    const {
      downScale,
      maxIterations,
      threshold,
      scatter,
      intensity,
      tint,
      highQualityFiltering,
      dirtTexture,
      dirtIntensity
    } = bloomBlend;

    // Update shaderData
    bloomShaderData.setFloat(ColorAdjustmentsEffect._postExposureProperty, exposureMultiplier);
    const downRes = downScale.value === BloomDownScaleMode.Half ? 1 : 2;
    const thresholdLinear = threshold.value;
    const thresholdKnee = thresholdLinear * 0.5; // Hardcoded soft knee
    const bloomParams = bloomShaderData.getVector4(BloomEffect._bloomParams);
    const scatterLerp = MathUtil.lerp(0.05, 0.95, scatter.value);
    bloomParams.set(thresholdLinear, thresholdKnee, scatterLerp, downRes);
    const bloomIntensityParams = uberShaderData.getVector4(BloomEffect._bloomIntensityParams);
    bloomIntensityParams.x = intensity.value;
    bloomIntensityParams.y = dirtIntensity.value;
    const tintParam = uberShaderData.getColor(BloomEffect._tintProp);
    tintParam.copyFrom(tint.value);
    if (highQualityFiltering.value) {
      bloomShaderData.enableMacro(BloomEffect._hqMacro);
      uberShaderData.enableMacro(BloomEffect._hqMacro);
    } else {
      bloomShaderData.disableMacro(BloomEffect._hqMacro);
      uberShaderData.disableMacro(BloomEffect._hqMacro);
    }
    uberShaderData.setTexture(BloomEffect._dirtTextureProp, dirtTexture.value);
    if (dirtTexture.value) {
      uberShaderData.enableMacro(BloomEffect._dirtMacro);
    } else {
      uberShaderData.disableMacro(BloomEffect._dirtMacro);
    }

    // Determine the iteration count
    const pixelViewport = camera.pixelViewport;
    const tw = Math.max(1, pixelViewport.width >> downRes);
    const th = Math.max(1, pixelViewport.height >> downRes);
    const maxSize = Math.max(tw, th);
    const iterations = Math.floor(Math.log2(maxSize) - 1);
    const maxMipCount = Math.max(1, Math.round(maxIterations.value) || 6);
    const mipCount = Math.min(Math.max(iterations, 1), maxMipCount);
    this._bloomMipCount = mipCount;

    // Allocate mip pyramid (single RT per level; upsample blends in-place)
    const isHDR = camera._isInternalFormatHDR();
    // Bloom only composites RGB, so prefer R11G11B10_UFloat even when scene HDR needs alpha
    const bloomColorFormat =
      isHDR && engine._hardwareRenderer.supportsRenderTargetColorFormat(TextureFormat.R11G11B10_UFloat)
        ? TextureFormat.R11G11B10_UFloat
        : camera._getInternalColorTextureFormat();
    const isSRGB = !isHDR;
    const mipRT = this._mipRT;
    let mipWidth = tw;
    let mipHeight = th;
    for (let i = 0; i < mipCount; i++) {
      mipRT[i] = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        mipRT[i],
        mipWidth,
        mipHeight,
        bloomColorFormat,
        null,
        false,
        false,
        isSRGB,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
      mipWidth = Math.max(1, mipWidth >> 1);
      mipHeight = Math.max(1, mipHeight >> 1);
    }
    if (mipRT.length > mipCount) {
      this._releaseBloomRenderTargets(mipCount);
    }

    const context = engine._renderContext;
    const passDescriptor = this._passDescriptor;

    // Prefilter
    passDescriptor.reset(mipRT[0]);
    passDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
    context.beginRenderPass(passDescriptor);
    Blitter.draw(engine, srcTexture, 0, bloomMaterial, 0);
    context.endRenderPass();

    // Progressive single-pass 5x5 9-tap downsample pyramid (Castaño 2013)
    for (let i = 1; i < mipCount; i++) {
      passDescriptor.reset(mipRT[i]);
      passDescriptor.colorLoadAction = RenderPassLoadAction.DontCare;
      context.beginRenderPass(passDescriptor);
      Blitter.draw(engine, <Texture2D>mipRT[i - 1].getColorTexture(0), 0, bloomMaterial, 1);
      context.endRenderPass();
    }

    // Progressive in-place upsample (4-tap 3x3 tent by default, bicubic with HQ filtering)
    // Pass 2 blends in-place onto mipRT[i], so it must Load existing destination pixels.
    for (let i = mipCount - 2; i >= 0; i--) {
      passDescriptor.reset(mipRT[i]);
      passDescriptor.colorLoadAction = RenderPassLoadAction.Load;
      context.beginRenderPass(passDescriptor);
      Blitter.draw(engine, <Texture2D>mipRT[i + 1].getColorTexture(0), 0, bloomMaterial, 2);
      context.endRenderPass();
    }

    // Setup bloom on uber
    if (dirtTexture.value) {
      const dirtTilingOffset = uberShaderData.getVector4(BloomEffect._dirtTilingOffsetProp);
      const dirtRatio = dirtTexture.value.width / dirtTexture.value.height;
      const screenRatio = camera.aspectRatio;
      if (dirtRatio > screenRatio) {
        dirtTilingOffset.set(screenRatio / dirtRatio, 1, (1 - dirtTilingOffset.x) * 0.5, 0);
      } else if (dirtRatio < screenRatio) {
        dirtTilingOffset.set(1, dirtRatio / screenRatio, 0, (1 - dirtTilingOffset.y) * 0.5);
      } else {
        dirtTilingOffset.set(1, 1, 0, 0);
      }
    }
    const mip0 = mipRT[0];
    uberShaderData.setTexture(BloomEffect._bloomTextureProp, mip0.getColorTexture(0));
    if (highQualityFiltering.value) {
      uberShaderData
        .getVector4(BloomEffect._bloomTexelSizeProp)
        .set(1 / mip0.width, 1 / mip0.height, mip0.width, mip0.height);
    }
  }

  private _releaseBloomRenderTargets(fromIndex = 0): void {
    const pool = this.engine._renderTargetPool;
    const mipRT = this._mipRT;
    for (let i = fromIndex, n = mipRT.length; i < n; i++) {
      const rt = mipRT[i];
      if (rt) {
        pool.freeRenderTarget(rt);
      }
    }
    mipRT.length = fromIndex;
    if (fromIndex === 0) {
      this._bloomMipCount = 0;
    }
  }
}
