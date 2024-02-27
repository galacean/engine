import { MathUtil, Matrix } from "@galacean/engine-math";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Logger } from "../base/Logger";
import { Mesh } from "../graphic/Mesh";
import { Material } from "../material";
import { Shader } from "../shader/Shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";

/**
 * Sky.
 */
export class Sky {
  private static _epsilon: number = 1e-6;
  private static _viewProjMatrix: Matrix = new Matrix();
  private static _projectionMatrix: Matrix = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, Sky._epsilon - 1, -1, 0, 0, 0, 0);

  private _material: Material;
  private _mesh: Mesh;

  /**
   *  Material of the sky.
   */
  get material() {
    return this._material;
  }

  set material(value: Material) {
    if (this._material !== value) {
      value?._addReferCount(1);
      this._material?._addReferCount(-1);
      this._material = value;
    }
  }

  /**
   *  Mesh of the sky.
   */
  get mesh() {
    return this._mesh;
  }

  set mesh(value: Mesh) {
    if (this._mesh !== value) {
      value?._addReferCount(1);
      this._mesh?._addReferCount(-1);
      this._mesh = value;
    }
  }

  /**
   * @internal
   */
  destroy(): void {
    this.mesh = null;
    this.material = null;
  }

  /**
   * @internal
   */
  _render(context: RenderContext): void {
    const { material, mesh } = this;
    if (!material) {
      Logger.warn("The material of sky is not defined.");
      return;
    }

    if (material.destroyed) {
      Logger.warn("The material of sky is destroyed.");
      return;
    }

    if (!mesh) {
      Logger.warn("The mesh of sky is not defined.");
      return;
    }

    if (mesh.destroyed) {
      Logger.warn("The mesh of sky is destroyed.");
      return;
    }

    const { engine, scene, aspectRatio, fieldOfView, viewMatrix, shaderData: cameraShaderData } = context.camera;
    const sceneData = scene.shaderData;

    const { _viewProjMatrix: viewProjMatrix, _projectionMatrix: projectionMatrix } = Sky;
    const rhi = engine._hardwareRenderer;
    const { shaderData: materialShaderData, shader, renderState } = material;

    // no-scale view matrix
    viewProjMatrix.copyFrom(viewMatrix);
    const e = viewProjMatrix.elements;
    e[12] = e[13] = e[14] = 0;

    // epsilon-infinity projection matrix http://terathon.com/gdc07_lengyel.pdf
    const f = 1.0 / Math.tan(MathUtil.degreeToRadian(fieldOfView) / 2);
    projectionMatrix.elements[0] = f / aspectRatio;
    projectionMatrix.elements[5] = f;

    // view-proj matrix
    Matrix.multiply(projectionMatrix, viewProjMatrix, viewProjMatrix);
    const originViewProjMatrix = cameraShaderData.getMatrix(RenderContext.vpMatrixProperty);

    if (context.flipY) {
      Matrix.multiply(RenderContext._flipYMatrix, viewProjMatrix, viewProjMatrix);
    }
    cameraShaderData.setMatrix(RenderContext.vpMatrixProperty, viewProjMatrix);

    const compileMacros = Shader._compileMacros;
    ShaderMacroCollection.unionCollection(
      context.camera._globalShaderMacro,
      materialShaderData._macroCollection,
      compileMacros
    );

    const pass = shader.subShaders[0].passes[0];
    const program = pass._getShaderProgram(engine, compileMacros);
    program.bind();
    program.groupingOtherUniformBlock();
    program.uploadAll(program.sceneUniformBlock, sceneData);
    program.uploadAll(program.cameraUniformBlock, cameraShaderData);
    program.uploadAll(program.materialUniformBlock, materialShaderData);
    program.uploadUnGroupTextures();

    renderState._apply(engine, false, pass._renderStateDataMap, materialShaderData);
    rhi.drawPrimitive(mesh._primitive, mesh.subMesh, program);
    cameraShaderData.setMatrix(RenderContext.vpMatrixProperty, originViewProjMatrix);
  }
}
