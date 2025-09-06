import { Vector2, Vector4 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { Material } from "../../material";
import { Blitter } from "../../RenderPipeline/Blitter";
import { PipelinePass } from "../../RenderPipeline/PipelinePass";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Shader, ShaderData } from "../../shader";
import { SystemInfo } from "../../SystemInfo";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import { AmbientOcclusionQuality } from "../enums/AmbientOcclusionQuality";
import { AmbientOcclusion } from "./AmbientOcclusion";

/**
 * @internal
 * Scalable Ambient Obscurance render pass.
 */
export class ScalableAmbientObscurancePass extends PipelinePass {
  private readonly _saoMaterial: Material;

  private _saoRenderTarget?: RenderTarget;
  private _inputRenderTarget: RenderTarget;
  private _blurRenderTarget: RenderTarget;

  private _sampleCount = 7;
  private _position = new Vector2();
  private _offsetX = new Vector4();
  private _offsetY = new Vector4();

  private _quality: AmbientOcclusionQuality;

  constructor(engine: Engine) {
    super(engine);

    const saoMaterial = new Material(engine, Shader.find(AmbientOcclusion.SHADER_NAME));
    saoMaterial._addReferCount(1);
    this._saoMaterial = saoMaterial;
  }

  private _setQuality(blurShaderData: ShaderData, quality: AmbientOcclusionQuality): void {
    if (quality === this._quality) {
      return;
    }

    let sampleCount: number;
    let standardDeviation: number;

    switch (quality) {
      case AmbientOcclusionQuality.Low:
        sampleCount = 7;
        standardDeviation = 8.0;
        break;
      case AmbientOcclusionQuality.Medium:
        sampleCount = 11;
        standardDeviation = 8.0;
        break;
      case AmbientOcclusionQuality.High:
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
    for (let i = sampleCount; i < kernelArraySize; i++) {
      gaussianKernel[i] = 0.0;
    }
    this._quality = quality;
    blurShaderData.setFloatArray(AmbientOcclusion._kernelProp, gaussianKernel);
  }

  onConfig(camera: Camera, inputRenderTarget: RenderTarget): void {
    const { pixelViewport } = camera;
    const engine = this.engine;
    this._inputRenderTarget = inputRenderTarget;

    const textureFormat = SystemInfo.supportsTextureFormat(engine, TextureFormat.R8)
      ? TextureFormat.R8
      : TextureFormat.R8G8B8;

    this._saoRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      this.engine,
      this._saoRenderTarget,
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
    const aoEffect = scene.ambientOcclusion;
    const saoShaderData = this._saoMaterial.shaderData;
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
    saoShaderData.setVector2(AmbientOcclusion._invPositionProp, position);

    if (aoEffect?._isValid()) {
      this._setQuality(saoShaderData, aoEffect.quality);
      const qualityValue = aoEffect.quality.toString();
      scene.shaderData.enableMacro("SCENE_ENABLE_SSAO");
      saoShaderData.enableMacro("SSAO_QUALITY", qualityValue);

      const radius = aoEffect.radius;
      const peak = 0.1 * radius;
      const intensity = (2 * Math.PI * peak * aoEffect.intensity) / this._sampleCount;
      const bias = aoEffect.bias;
      const power = aoEffect.power * 2.0;
      const projectionScaleRadius = radius * projectionMatrix.elements[5];
      const peak2 = peak * peak;
      const invRadiusSquared = 1.0 / (radius * radius);
      const farPlaneOverEdgeDistance = -camera.farClipPlane / aoEffect.bilateralThreshold;

      saoShaderData.setFloat(AmbientOcclusion._invRadiusSquaredProp, invRadiusSquared);
      saoShaderData.setFloat(AmbientOcclusion._intensityProp, intensity);
      saoShaderData.setFloat(AmbientOcclusion._powerProp, power);
      saoShaderData.setFloat(AmbientOcclusion._projectionScaleRadiusProp, projectionScaleRadius);
      saoShaderData.setFloat(AmbientOcclusion._biasProp, bias);
      saoShaderData.setFloat(AmbientOcclusion._peak2Prop, peak2);
      saoShaderData.enableMacro(AmbientOcclusion._enableMacro);

      saoShaderData.setFloat(AmbientOcclusion._farPlaneOverEdgeDistanceProp, farPlaneOverEdgeDistance);
    } else {
      scene.shaderData.disableMacro("SCENE_ENABLE_SSAO");
      saoShaderData.disableMacro(AmbientOcclusion._enableMacro);
      return;
    }

    const blurTarget = this._blurRenderTarget;
    const ssaoTarget = this._saoRenderTarget;

    // Draw ambient occlusion texture
    const sourceTexture = <Texture2D>this._inputRenderTarget.getColorTexture();
    Blitter.blitTexture(engine, sourceTexture, ssaoTarget, 0, viewport, this._saoMaterial, 0);

    // Separable bilateral blur pass
    const aoTexture = <Texture2D>this._saoRenderTarget.getColorTexture();
    // Horizontal blur: ssaoRenderTarget -> blurRenderTarget
    const offsetX = this._offsetX.set(1, 1, 1 / aoTexture.width, 0);
    const offsetY = this._offsetY.set(1, 1, 0, 1 / aoTexture.height);
    Blitter.blitTexture(engine, aoTexture, blurTarget, 0, viewport, this._saoMaterial, 1, offsetX);
    // Vertical blur: blurRenderTarget -> ssaoRenderTarget
    const horizontalBlur = <Texture2D>this._blurRenderTarget.getColorTexture();
    Blitter.blitTexture(engine, horizontalBlur, ssaoTarget, 0, viewport, this._saoMaterial, 1, offsetY);

    // Set the SSAO texture
    camera.shaderData.setTexture(Camera._cameraSSAOTextureProperty, aoTexture);
  }

  release(): void {
    if (this._saoRenderTarget) {
      this._saoRenderTarget.getColorTexture(0)?.destroy(true);
      this._saoRenderTarget.destroy(true);
      this._saoRenderTarget = null;
    }
    if (this._blurRenderTarget) {
      this._blurRenderTarget.getColorTexture(0)?.destroy(true);
      this._blurRenderTarget.destroy(true);
      this._blurRenderTarget = null;
    }
    this._inputRenderTarget = null;
    this._saoMaterial._addReferCount(-1);
    this._saoMaterial.destroy();
  }
}
