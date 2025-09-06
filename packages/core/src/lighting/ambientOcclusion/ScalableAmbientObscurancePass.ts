import { Vector2, Vector4 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { Material } from "../../material";
import { Blitter } from "../../RenderPipeline/Blitter";
import { PipelinePass } from "../../RenderPipeline/PipelinePass";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Scene } from "../../Scene";
import { Shader, ShaderData, ShaderPass } from "../../shader";
import blitVs from "../../shaderlib/extra/Blit.vs.glsl";
import { SystemInfo } from "../../SystemInfo";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import { AmbientOcclusionQuality } from "../enums/AmbientOcclusionQuality";
import { AmbientOcclusion } from "./AmbientOcclusion";
import bilateralBlurFS from "./shaders/Blur/BilateralBlur.glsl";
import scalableAmbientOcclusionFS from "./shaders/ScalableAmbientOcclusion.glsl";

/**
 * @internal
 * Scalable Ambient Obscurance render pass.
 */
export class ScalableAmbientObscurancePass extends PipelinePass {
  static readonly SHADER_NAME = "ScalableAmbientOcclusion";

  private readonly _material: Material;

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

    const saoMaterial = new Material(engine, Shader.find(ScalableAmbientObscurancePass.SHADER_NAME));
    saoMaterial._addReferCount(1);
    this._material = saoMaterial;
  }

  onConfig(camera: Camera, inputRenderTarget: RenderTarget): void {
    const { engine } = this;
    const { width, height } = camera.pixelViewport;

    this._inputRenderTarget = inputRenderTarget;

    const format = SystemInfo.supportsTextureFormat(engine, TextureFormat.R8) ? TextureFormat.R8 : TextureFormat.R8G8B8;

    this._saoRenderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
      engine,
      this._saoRenderTarget,
      width,
      height,
      format,
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
      width,
      height,
      format,
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
    const { viewport, scene } = camera;
    const { ambientOcclusion } = scene;
    const { shaderData } = this._material;
    const { projectionMatrix } = context;

    // For a typical projection matrix in column-major order:
    // projection[0][0] is at index 0 (X scaling)
    // projection[1][1] is at index 5 (Y scaling)
    // The inverse values we need are:
    const invProjection0 = 1.0 / projectionMatrix.elements[0];
    const invProjection1 = 1.0 / projectionMatrix.elements[5];

    const position = this._position.set(invProjection0 * 2.0, invProjection1 * 2.0);
    shaderData.setVector2(AmbientOcclusion._invPositionProp, position);

    if (ambientOcclusion?._isValid()) {
      scene.shaderData.enableMacro(Scene._ambientOcclusionMacro);

      const { quality } = ambientOcclusion;
      this._updateBlurKernel(shaderData, quality);
      shaderData.enableMacro("SSAO_QUALITY", quality.toString());

      const { radius, bias } = ambientOcclusion;
      const peak = 0.1 * radius;
      const peak2 = peak * peak;
      const intensity = (2 * Math.PI * peak * ambientOcclusion.intensity) / this._sampleCount;
      const power = ambientOcclusion.power * 2.0;
      const projectionScaleRadius = radius * projectionMatrix.elements[5];
      const invRadiusSquared = 1.0 / (radius * radius);
      const farPlaneOverEdgeDistance = -camera.farClipPlane / ambientOcclusion.bilateralThreshold;

      shaderData.setFloat(AmbientOcclusion._invRadiusSquaredProp, invRadiusSquared);
      shaderData.setFloat(AmbientOcclusion._intensityProp, intensity);
      shaderData.setFloat(AmbientOcclusion._powerProp, power);
      shaderData.setFloat(AmbientOcclusion._projectionScaleRadiusProp, projectionScaleRadius);
      shaderData.setFloat(AmbientOcclusion._biasProp, bias);
      shaderData.setFloat(AmbientOcclusion._peak2Prop, peak2);

      shaderData.setFloat(AmbientOcclusion._farPlaneOverEdgeDistanceProp, farPlaneOverEdgeDistance);

      const { _saoRenderTarget: saoTarget, _material: material } = this;

      // Draw ambient occlusion texture
      const sourceTexture = <Texture2D>this._inputRenderTarget.getColorTexture();
      Blitter.blitTexture(engine, sourceTexture, saoTarget, 0, viewport, material, 0);

      // Horizontal blur, saoRenderTarget -> blurRenderTarget
      const aoTexture = <Texture2D>saoTarget.getColorTexture();
      const offsetX = this._offsetX.set(1, 1, 1 / aoTexture.width, 0);
      Blitter.blitTexture(engine, aoTexture, this._blurRenderTarget, 0, viewport, material, 1, offsetX);

      // Vertical blur, blurRenderTarget -> saoRenderTarget
      const horizontalBlur = <Texture2D>this._blurRenderTarget.getColorTexture();
      const offsetY = this._offsetY.set(1, 1, 0, 1 / aoTexture.height);
      Blitter.blitTexture(engine, horizontalBlur, saoTarget, 0, viewport, material, 1, offsetY);

      // Set the SAO texture
      camera.shaderData.setTexture(Camera._cameraSSAOTextureProperty, aoTexture);
    } else {
      scene.shaderData.disableMacro(Scene._ambientOcclusionMacro);
    }
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
    const material = this._material;
    material._addReferCount(-1);
    material.destroy();
  }

  private _updateBlurKernel(blurShaderData: ShaderData, quality: AmbientOcclusionQuality): void {
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
        sampleCount = 16;
        standardDeviation = 6.0;
        break;
    }
    this._sampleCount = sampleCount;

    const kernelArraySize = 16;
    const gaussianKernel = new Float32Array(kernelArraySize);
    const variance = 2.0 * standardDeviation * standardDeviation;
    for (let i = 0; i < sampleCount; i++) {
      gaussianKernel[i] = Math.exp(-(i * i) / variance);
    }
    for (let i = sampleCount; i < kernelArraySize; i++) {
      gaussianKernel[i] = 0.0;
    }

    blurShaderData.setFloatArray(AmbientOcclusion._kernelProp, gaussianKernel);
    this._quality = quality;
  }
}

Shader.create(ScalableAmbientObscurancePass.SHADER_NAME, [
  new ShaderPass("ScalableAmbientOcclusion", blitVs, scalableAmbientOcclusionFS),
  new ShaderPass("BilateralBlur", blitVs, bilateralBlurFS)
]);
