import { Matrix, Vector4 } from "@galacean/engine-math";
import { MatrixSnapshot } from "./MatrixSnapshot";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { VirtualCamera } from "../VirtualCamera";
import { ReplacementFailureStrategy } from "../enums/ReplacementFailureStrategy";
import { RHIBackend, RenderPassDescriptor, RenderPassLoadAction } from "../renderingHardwareInterface";
import { ColorWriteMask, Shader, ShaderProperty } from "../shader";
import { ShaderTagKey } from "../shader/ShaderTagKey";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { RenderTarget, TextureCubeFace } from "../texture";

/**
 * Per-frame transient SSR pass state carried on `RenderContext` for the active view.
 * @internal
 */
export class RenderContextSSRState {
  enabled: boolean = false;
  verifyReceiverDepth: boolean = false;
  bilateralSample: boolean = false;
  packedDepthRG8: boolean = false;
  packedNormalOct8: boolean = false;
  packedHDRReinhard: boolean = false;
  maxRoughness: number = 0.6;

  reset(): void {
    this.enabled = false;
    this.verifyReceiverDepth = false;
    this.bilateralSample = false;
    this.packedDepthRG8 = false;
    this.packedNormalOct8 = false;
    this.packedHDRReinhard = false;
    this.maxRoughness = 0.6;
  }
}

/**
 * @internal
 */
export class RenderContext {
  /** Fixed raster depth bias required while drawing directional shadow maps. */
  shadowDepthBias = false;
  static vpMatrixProperty = ShaderProperty._getBuiltinGlobal("camera_VPMat", ShaderDataGroup.Camera);
  static pipelineStageKey: ShaderTagKey = ShaderTagKey.getByName("pipelineStage");

  /** @internal */
  static _flipYMatrix = new Matrix(1, 0, 0, 0, 0, -1);

  private static _cameraProjectionProperty = ShaderProperty._getBuiltinGlobal(
    "camera_ProjectionParams",
    ShaderDataGroup.Camera
  );
  private static _viewMatrixProperty = ShaderProperty._getBuiltinGlobal("camera_ViewMat", ShaderDataGroup.Camera);
  private static _projectionMatrixProperty = ShaderProperty._getBuiltinGlobal("camera_ProjMat", ShaderDataGroup.Camera);
  private static _flipYProjectionMatrix = new Matrix();
  private static _flipYViewProjectionMatrix = new Matrix();

  private readonly _viewSnapshot = new MatrixSnapshot();
  private readonly _viewProjectionSnapshot = new MatrixSnapshot();
  private readonly _flippedViewProjectionSnapshot = new MatrixSnapshot();
  viewRevision = -1;
  viewProjectionRevision = -1;

  private _projectionParams: Vector4 = new Vector4();

  camera: Camera;
  virtualCamera: VirtualCamera;

  replacementShader: Shader | null;
  replacementTag: ShaderTagKey | null | undefined;
  replacementFailureStrategy: ReplacementFailureStrategy | null;

  flipProjection: boolean | null = false;
  /** @internal */
  _onlyShadowCaster: boolean = false;
  /** @internal */
  readonly _ssrState: RenderContextSSRState = new RenderContextSSRState();
  viewMatrix: Matrix;
  projectionMatrix: Matrix;
  viewProjectionMatrix: Matrix;

  applyVirtualCamera(virtualCamera: VirtualCamera, flipProjection: boolean | null): void {
    this.virtualCamera = virtualCamera;
    this.flipProjection = flipProjection;

    const shaderData = this.camera.shaderData;
    let { viewMatrix, projectionMatrix, viewProjectionMatrix } = virtualCamera;

    if (flipProjection) {
      Matrix.multiply(RenderContext._flipYMatrix, projectionMatrix, RenderContext._flipYProjectionMatrix);
      Matrix.multiply(RenderContext._flipYProjectionMatrix, viewMatrix, RenderContext._flipYViewProjectionMatrix);

      projectionMatrix = RenderContext._flipYProjectionMatrix;
      viewProjectionMatrix = RenderContext._flipYViewProjectionMatrix;
    }

    // GL can visit both projection orientations in one camera render. Keep independent revisions for each.
    const viewProjectionSnapshot = flipProjection ? this._flippedViewProjectionSnapshot : this._viewProjectionSnapshot;
    this._viewSnapshot.update(viewMatrix);
    viewProjectionSnapshot.update(viewProjectionMatrix);
    this.viewRevision = this._viewSnapshot.revision;
    this.viewProjectionRevision = viewProjectionSnapshot.revision;
    this.viewMatrix = viewMatrix;
    this.projectionMatrix = projectionMatrix;
    this.viewProjectionMatrix = viewProjectionMatrix;

    shaderData.setMatrix(RenderContext._viewMatrixProperty, viewMatrix);
    shaderData.setMatrix(RenderContext._projectionMatrixProperty, projectionMatrix);
    shaderData.setMatrix(RenderContext.vpMatrixProperty, viewProjectionMatrix);

    const projectionParams = this._projectionParams;
    projectionParams.set(flipProjection ? -1 : 1, virtualCamera.nearClipPlane, virtualCamera.farClipPlane, 0);
    shaderData.setVector4(RenderContext._cameraProjectionProperty, projectionParams);
  }

  setRenderTarget(destination: RenderTarget | null, viewport: Vector4, mipLevel?: number, faceIndex?: TextureCubeFace) {
    const engine = this.camera.engine;
    const rhi = engine._hardwareRenderer;
    rhi.activeRenderTarget(destination, viewport, this.flipProjection, mipLevel, faceIndex);

    if (destination) {
      engine._macroCollection.disable(Engine._outputSRGBCorrectMacro);
    } else {
      engine._macroCollection.enable(Engine._outputSRGBCorrectMacro);
    }
  }

  beginRenderPass(descriptor: RenderPassDescriptor): void {
    const engine = this.camera.engine;
    const rhi = engine._hardwareRenderer;
    this.flipProjection =
      descriptor.faceIndex !== undefined
        ? descriptor.isFlipProjection
        : descriptor.isFlipProjection && rhi.backend === RHIBackend.WebGL2;

    // WebGL gl.clear() is masked by current color/depth/stencil write masks; reset cached masks on core's RenderState before clearing.
    if (rhi.backend === RHIBackend.WebGL2) {
      const gl = (rhi as unknown as { gl?: WebGL2RenderingContext }).gl;
      if (gl) {
        const {
          blendState: { targetBlendState },
          depthState,
          stencilState
        } = engine._lastRenderState;
        if (
          descriptor.colorLoadAction !== RenderPassLoadAction.Load &&
          targetBlendState.colorWriteMask !== ColorWriteMask.All
        ) {
          gl.colorMask(true, true, true, true);
          targetBlendState.colorWriteMask = ColorWriteMask.All;
        }
        if (descriptor.depthLoadAction !== RenderPassLoadAction.Load && depthState.writeEnabled !== true) {
          gl.depthMask(true);
          depthState.writeEnabled = true;
        }
        if (descriptor.stencilLoadAction !== RenderPassLoadAction.Load && stencilState.writeMask !== 0xff) {
          gl.stencilMask(0xff);
          stencilState.writeMask = 0xff;
        }
      }
    }

    rhi.beginRenderPass(descriptor);

    if (descriptor.renderTarget) {
      engine._macroCollection.disable(Engine._outputSRGBCorrectMacro);
    } else {
      engine._macroCollection.enable(Engine._outputSRGBCorrectMacro);
    }
  }

  endRenderPass(): void {
    this.camera.engine._hardwareRenderer.endRenderPass();
  }

  garbageCollection(): void {
    this.camera = null!;
    this._ssrState.reset();
  }
}

/**
 * @internal
 */
export enum ContextRendererUpdateFlag {
  None = 0,
  WorldMatrix = 0x1,
  viewMatrix = 0x2,
  ProjectionMatrix = 0x4,
  WorldViewMatrix = 0x3,
  viewProjectionMatrix = 0x6,
  All = 0x7
}
