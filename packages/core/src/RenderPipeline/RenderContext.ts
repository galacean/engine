import { Matrix, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { VirtualCamera } from "../VirtualCamera";
import { ReplacementFailureStrategy } from "../enums/ReplacementFailureStrategy";
import type { Material } from "../material/Material";
import { Shader, ShaderProperty } from "../shader";
import type { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import type { ShaderPass } from "../shader/ShaderPass";
import type { ShaderProgram } from "../shader/ShaderProgram";
import { ShaderTagKey } from "../shader/ShaderTagKey";
import { RenderTarget, TextureCubeFace } from "../texture";

/**
 * Optional per-camera hook that overrides `ShaderProgram` resolution inside `RenderQueue.render`.
 * @internal
 */
export interface IShaderProgramResolver {
  resolveProgram(
    engine: Engine,
    shaderPass: ShaderPass,
    material: Material,
    compileMacros: ShaderMacroCollection,
    pipelineStageTagValue: string
  ): ShaderProgram;
}

/**
 * @internal
 */
export class RenderContext {
  static vpMatrixProperty = ShaderProperty.getByName("camera_VPMat");
  static pipelineStageKey: ShaderTagKey = ShaderTagKey.getByName("pipelineStage");

  /** @internal */
  static _flipYMatrix = new Matrix(1, 0, 0, 0, 0, -1);

  private static _cameraProjectionProperty = ShaderProperty.getByName("camera_ProjectionParams");
  private static _viewMatrixProperty = ShaderProperty.getByName("camera_ViewMat");
  private static _projectionMatrixProperty = ShaderProperty.getByName("camera_ProjMat");
  private static _flipYProjectionMatrix = new Matrix();
  private static _flipYViewProjectionMatrix = new Matrix();

  private _projectionParams: Vector4 = new Vector4();

  camera: Camera;
  virtualCamera: VirtualCamera;

  replacementShader: Shader | null;
  replacementTag: ShaderTagKey | null | undefined;
  replacementFailureStrategy: ReplacementFailureStrategy | null;

  flipProjection: boolean | null = false;
  viewMatrix: Matrix;
  projectionMatrix: Matrix;
  viewProjectionMatrix: Matrix;

  /**
   * Optional per-camera shader program resolver applied during `RenderQueue.render`.
   * Reset at the start of each `Camera.render()` and during `garbageCollection()`.
   */
  programResolver: IShaderProgramResolver | null = null;

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

  garbageCollection(): void {
    this.camera = null!;
    this.programResolver = null;
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
