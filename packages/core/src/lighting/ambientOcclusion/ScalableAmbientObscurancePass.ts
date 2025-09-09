import { Vector2, Vector4 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { Material } from "../../material";
import { Blitter } from "../../RenderPipeline/Blitter";
import { PipelinePass } from "../../RenderPipeline/PipelinePass";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Shader, ShaderData, ShaderPass, ShaderProperty } from "../../shader";
import blitVs from "../../shaderlib/extra/Blit.vs.glsl";
import { SystemInfo } from "../../SystemInfo";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import { AmbientOcclusionQuality } from "../enums/AmbientOcclusionQuality";
import bilateralBlurFS from "./shaders/Blur/BilateralBlur.glsl";
import scalableAmbientOcclusionFS from "./shaders/ScalableAmbientOcclusion.glsl";

/**
 * @internal
 * Scalable Ambient Obscurance render pass.
 */
export class ScalableAmbientObscurancePass extends PipelinePass {
  static readonly SHADER_NAME = "ScalableAmbientOcclusion";

  private static _invRadiusSquaredProp = ShaderProperty.getByName("material_invRadiusSquared");
  private static _intensityProp = ShaderProperty.getByName("material_intensity");
  private static _projectionScaleRadiusProp = ShaderProperty.getByName("material_projectionScaleRadius");
  private static _biasProp = ShaderProperty.getByName("material_bias");
  private static _minHorizonAngleSineSquaredProp = ShaderProperty.getByName("material_minHorizonAngleSineSquared");
  private static _peak2Prop = ShaderProperty.getByName("material_peak2");
  private static _powerProp = ShaderProperty.getByName("material_power");
  private static _invPositionProp = ShaderProperty.getByName("material_invProjScaleXY");

  // Shader properties for bilateral blur
  private static _farPlaneOverEdgeDistanceProp = ShaderProperty.getByName("material_farPlaneOverEdgeDistance");
  private static _kernelProp = ShaderProperty.getByName("material_kernel");

  private readonly _material: Material;

  private _saoRenderTarget?: RenderTarget;
  private _depthRenderTarget: RenderTarget;
  private _blurRenderTarget: RenderTarget;

  private _sampleCount: number;
  private _position = new Vector2();
  private _offsetX = new Vector4();
  private _offsetY = new Vector4();
  private _quality: AmbientOcclusionQuality;

  constructor(engine: Engine) {
    super(engine);

    const material = new Material(engine, Shader.find(ScalableAmbientObscurancePass.SHADER_NAME));
    material._addReferCount(1);
    this._material = material;
  }

  onConfig(camera: Camera, depthRenderTarget: RenderTarget): void {
    const { engine } = this;
    const { width, height } = camera.pixelViewport;

    this._depthRenderTarget = depthRenderTarget;

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
    shaderData.setVector2(ScalableAmbientObscurancePass._invPositionProp, position);

    const { quality } = ambientOcclusion;
    this._updateBlurKernel(shaderData, quality);
    shaderData.enableMacro("SSAO_QUALITY", quality.toString());

    const { radius } = ambientOcclusion;
    const peak = 0.1 * radius;
    const intensity = (2 * Math.PI * peak * ambientOcclusion.intensity) / this._sampleCount;
    const projectionScaleRadius = radius * projectionMatrix.elements[5];
    const farPlaneOverEdgeDistance = -camera.farClipPlane / ambientOcclusion.bilateralThreshold;

    shaderData.setFloat(ScalableAmbientObscurancePass._invRadiusSquaredProp, 1.0 / (radius * radius));
    shaderData.setFloat(ScalableAmbientObscurancePass._intensityProp, intensity);
    shaderData.setFloat(ScalableAmbientObscurancePass._powerProp, ambientOcclusion.power * 2.0);
    shaderData.setFloat(ScalableAmbientObscurancePass._biasProp, ambientOcclusion.bias);
    shaderData.setFloat(ScalableAmbientObscurancePass._peak2Prop, peak * peak);
    shaderData.setFloat(
      ScalableAmbientObscurancePass._minHorizonAngleSineSquaredProp,
      Math.pow(Math.sin(ambientOcclusion.minHorizonAngle), 2.0)
    );
    shaderData.setFloat(ScalableAmbientObscurancePass._projectionScaleRadiusProp, projectionScaleRadius);

    shaderData.setFloat(ScalableAmbientObscurancePass._farPlaneOverEdgeDistanceProp, farPlaneOverEdgeDistance);

    const { _saoRenderTarget: saoTarget, _material: material } = this;

    // Draw ambient occlusion texture
    const sourceTexture = <Texture2D>this._depthRenderTarget.depthTexture;
    Blitter.blitTexture(engine, sourceTexture, saoTarget, 0, viewport, material, 0);

    // Horizontal blur, saoRenderTarget -> blurRenderTarget
    const saoTexture = <Texture2D>saoTarget.getColorTexture();
    const offsetX = this._offsetX.set(1, 1, 1 / saoTexture.width, 0);
    Blitter.blitTexture(engine, saoTexture, this._blurRenderTarget, 0, viewport, material, 1, offsetX);

    // Vertical blur, blurRenderTarget -> saoRenderTarget
    const horizontalBlur = <Texture2D>this._blurRenderTarget.getColorTexture();
    const offsetY = this._offsetY.set(1, 1, 0, 1 / saoTexture.height);
    Blitter.blitTexture(engine, horizontalBlur, saoTarget, 0, viewport, material, 1, offsetY);

    // Set the SAO texture
    camera.shaderData.setTexture(Camera._cameraAOTextureProperty, saoTexture);
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
    this._depthRenderTarget = null;
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

    blurShaderData.setFloatArray(ScalableAmbientObscurancePass._kernelProp, gaussianKernel);
    this._quality = quality;
  }
}

Shader.create(ScalableAmbientObscurancePass.SHADER_NAME, [
  new ShaderPass("ScalableAmbientOcclusion", blitVs, scalableAmbientOcclusionFS),
  new ShaderPass("BilateralBlur", blitVs, bilateralBlurFS)
]);
