import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { Material } from "../../material";
import { Shader, ShaderData } from "../../shader";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import { Blitter } from "../../RenderPipeline/Blitter";
import { PipelinePass } from "../../RenderPipeline/PipelinePass";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Vector2, Vector4 } from "@galacean/engine-math";
import { SystemInfo } from "../../SystemInfo";
import { SSAOQuality } from "../enums/SSAOQuality";
import { ScreenSpaceAmbientOcclusion } from "./ScreenSpaceAmbientOcclusion";

/**
 * @internal
 * Screen Space Ambient Occlusion render pass.
 */
export class SSAOPass extends PipelinePass {
  private readonly _ssaoMaterial: Material;
  private readonly _bilateralBlurMaterial: Material;

  private _ssaoRenderTarget?: RenderTarget;
  private _inputRenderTarget: RenderTarget;
  private _blurRenderTarget: RenderTarget;

  private _sampleCount: number = 7;
  private _position = new Vector2();
  private _offsetX = new Vector4();
  private _offsetY = new Vector4();

  private _quality: SSAOQuality = SSAOQuality.Low;
  private _kernel: Float32Array = null;

  constructor(engine: Engine) {
    super(engine);

    // Create SSAO material
    const ssaoMaterial = new Material(engine, Shader.find(ScreenSpaceAmbientOcclusion.SHADER_NAME));
    ssaoMaterial._addReferCount(1);
    this._ssaoMaterial = ssaoMaterial;

    //Bilateral Blur material
    const bilateralBlurMaterial = new Material(engine, Shader.find(ScreenSpaceAmbientOcclusion.SHADER_NAME));
    bilateralBlurMaterial._addReferCount(1);
    this._bilateralBlurMaterial = bilateralBlurMaterial;

    // ShaderData initialization
    const ssaoShaderData = this._ssaoMaterial.shaderData;

    const radius = 0.5;
    const defaultPower = 1.0;
    const peak = 0.1 * radius;
    const intensity = (2 * Math.PI * peak) / this._sampleCount;
    ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._invRadiusSquaredProp, 1.0 / (radius * radius));
    ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._intensityProp, intensity);
    ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._powerProp, defaultPower * 2.0);
    ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._peak2Prop, peak * peak);
  }

  private _setQuality(blurShaderData: ShaderData, quality: SSAOQuality): void {
    if (quality === this._quality && this._kernel !== null) {
      return;
    }

    let sampleCount: number;
    let standardDeviation: number;

    switch (quality) {
      case SSAOQuality.Low:
        sampleCount = 7;
        standardDeviation = 8.0;
        break;
      case SSAOQuality.Medium:
        sampleCount = 11;
        standardDeviation = 8.0;
        break;
      case SSAOQuality.High:
      default:
        sampleCount = 16;
        standardDeviation = 6.0;
        break;
    }
    this._sampleCount = sampleCount;

    const kernelArraySize = 16;
    const gaussianKernel = new Float32Array(kernelArraySize);
    for (let i = 0; i < sampleCount; i++) {
      const w = Math.exp(-(i * i) / (2.0 * standardDeviation * standardDeviation));
      gaussianKernel[i] = w;
    }
    for (let i = sampleCount; i < kernelArraySize; i++) gaussianKernel[i] = 0.0;
    this._quality = quality;
    this._kernel = gaussianKernel;
    blurShaderData.setFloatArray(ScreenSpaceAmbientOcclusion._kernelProp, gaussianKernel);
  }

  onConfig(camera: Camera, inputRenderTarget: RenderTarget): void {
    const { pixelViewport } = camera;
    const engine = this.engine;
    this._inputRenderTarget = inputRenderTarget;

    const textureFormat = SystemInfo.supportsTextureFormat(engine, TextureFormat.R8)
      ? TextureFormat.R8
      : TextureFormat.R8G8B8;

    this._ssaoRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this._ssaoRenderTarget,
      pixelViewport.width,
      pixelViewport.height,
      textureFormat,
      null,
      false,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear
    );
    this._blurRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      engine,
      this._blurRenderTarget,
      pixelViewport.width,
      pixelViewport.height,
      textureFormat,
      null,
      false,
      false,
      false,
      1,
      TextureWrapMode.Clamp,
      TextureFilterMode.Bilinear
    );
  }

  override onRender(context: RenderContext): void {
    const { engine } = this;
    const { camera } = context;
    const { viewport } = camera;
    const scene = camera.scene;
    const ssaoEffect = scene.ssao;
    const ssaoShaderData = this._ssaoMaterial.shaderData;
    const blurShaderData = this._bilateralBlurMaterial.shaderData;
    const projectionMatrix = context.projectionMatrix;

    // For a typical projection matrix in column-major order:
    // projection[0][0] is at index 0 (X scaling)
    // projection[1][1] is at index 5 (Y scaling)
    // The inverse values we need are:
    // invProjection[0][0] = 1 / projection[0][0]
    // invProjection[1][1] = 1 / projection[1][1]
    const invProjection0 = 1.0 / projectionMatrix.elements[0]; // 1 / projection[0][0]
    const invProjection1 = 1.0 / projectionMatrix.elements[5]; // 1 / projection[1][1]

    const position = this._position.set(invProjection0 * 2.0, invProjection1 * 2.0);
    ssaoShaderData.setVector2(ScreenSpaceAmbientOcclusion._invPositionProp, position);

    if (ssaoEffect?.isValid()) {
      this._setQuality(blurShaderData, ssaoEffect.quality);
      const qualityValue = ssaoEffect.quality.toString();
      scene.shaderData.enableMacro("SCENE_ENABLE_SSAO");
      ssaoShaderData.enableMacro("SSAO_QUALITY", qualityValue);
      blurShaderData.enableMacro("SSAO_QUALITY", qualityValue);

      const radius = ssaoEffect.radius;
      const peak = 0.1 * radius;
      const intensity = (2 * Math.PI * peak * ssaoEffect.intensity) / this._sampleCount;
      const bias = ssaoEffect.bias;
      const power = ssaoEffect.power * 2.0;
      const projectionScaleRadius = radius * projectionMatrix.elements[5];
      const peak2 = peak * peak;
      const invRadiusSquared = 1.0 / (radius * radius);
      const farPlaneOverEdgeDistance = -camera.farClipPlane / ssaoEffect.bilateralThreshold;

      ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._invRadiusSquaredProp, invRadiusSquared);
      ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._intensityProp, intensity);
      ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._powerProp, power);
      ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._projectionScaleRadiusProp, projectionScaleRadius);
      ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._biasProp, bias);
      ssaoShaderData.setFloat(ScreenSpaceAmbientOcclusion._peak2Prop, peak2);
      ssaoShaderData.enableMacro(ScreenSpaceAmbientOcclusion._enableMacro);

      blurShaderData.enableMacro(ScreenSpaceAmbientOcclusion._enableMacro);
      blurShaderData.setFloat(ScreenSpaceAmbientOcclusion._farPlaneOverEdgeDistanceProp, farPlaneOverEdgeDistance);
    } else {
      scene.shaderData.disableMacro("SCENE_ENABLE_SSAO");
      ssaoShaderData.disableMacro(ScreenSpaceAmbientOcclusion._enableMacro);
      blurShaderData.disableMacro(ScreenSpaceAmbientOcclusion._enableMacro);
      return;
    }

    const blurTarget = this._blurRenderTarget;
    const ssaoTarget = this._ssaoRenderTarget;

    // draw ambient occlusion texture
    const sourceTexture = <Texture2D>this._inputRenderTarget.getColorTexture();
    Blitter.blitTexture(engine, sourceTexture, ssaoTarget, 0, viewport, this._ssaoMaterial, 0);

    // Separable bilateral blur pass
    const aoTexture = <Texture2D>this._ssaoRenderTarget.getColorTexture();
    // Horizontal blur: ssaoRenderTarget -> blurRenderTarget
    const offsetX = this._offsetX.set(1, 1, 1 / aoTexture.width, 0);
    const offsetY = this._offsetY.set(1, 1, 0, 1 / aoTexture.height);
    Blitter.blitTexture(engine, aoTexture, blurTarget, 0, viewport, this._bilateralBlurMaterial, 1, offsetX);
    // Vertical blur: blurRenderTarget -> ssaoRenderTarget
    const horizontalBlur = <Texture2D>this._blurRenderTarget.getColorTexture();
    Blitter.blitTexture(engine, horizontalBlur, ssaoTarget, 0, viewport, this._bilateralBlurMaterial, 1, offsetY);

    // Set the SSAO texture
    camera.shaderData.setTexture(Camera._cameraSSAOTextureProperty, aoTexture);
  }

  release(): void {
    if (this._ssaoRenderTarget) {
      this._ssaoRenderTarget.getColorTexture(0)?.destroy(true);
      this._ssaoRenderTarget.destroy(true);
      this._ssaoRenderTarget = null;
    }
    if (this._blurRenderTarget) {
      this._blurRenderTarget.getColorTexture(0)?.destroy(true);
      this._blurRenderTarget.destroy(true);
      this._blurRenderTarget = null;
    }
    this._kernel = null;
    this._inputRenderTarget = null;
    this._ssaoMaterial._addReferCount(-1);
    this._ssaoMaterial.destroy();
    this._bilateralBlurMaterial._addReferCount(-1);
    this._bilateralBlurMaterial.destroy();
  }
}
