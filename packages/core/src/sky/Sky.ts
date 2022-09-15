import { MathUtil, Matrix } from "@oasis-engine/math";
import { Mesh } from "../graphic/Mesh";
import { Material } from "../material";
import { Camera } from "../Camera";
import { Logger } from "../base/Logger";
import { Shader } from "../shader/Shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";

/**
 * Sky.
 */
export class Sky {
  private static _epsilon = 1e-6;
  private static _viewProjMatrix: Matrix = new Matrix();
  private static _projectionMatrix: Matrix = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, Sky._epsilon - 1, -1, 0, 0, 0, 0);

  /** Material of the sky. */
  material: Material;
  /** Mesh of the sky. */
  mesh: Mesh;

  /**
   * @internal
   */
  _render(camera: Camera): void {
    const { material, mesh } = this;
    if (!material) {
      Logger.warn("The material of sky is not defined.");
      return;
    }
    if (!mesh) {
      Logger.warn("The mesh of sky is not defined.");
      return;
    }

    const { engine, aspectRatio, fieldOfView, viewMatrix } = camera;
    const { _viewProjMatrix: viewProjMatrix, _projectionMatrix: projectionMatrix } = Sky;
    const rhi = engine._hardwareRenderer;
    const { shaderData, shader, renderState } = material;

    // no-scale view matrix
    viewProjMatrix.copyFrom(viewMatrix);
    const e = viewProjMatrix.elements;
    e[12] = e[13] = e[14] = 0;

    // epsilon-infinity projection matrix
    const f = 1.0 / Math.tan(MathUtil.degreeToRadian(fieldOfView) / 2);
    projectionMatrix.elements[0] = f / aspectRatio;
    projectionMatrix.elements[5] = f;

    // view-proj matrix
    Matrix.multiply(projectionMatrix, viewProjMatrix, viewProjMatrix);
    shaderData.setMatrix("u_mvpNoscale", viewProjMatrix);

    const compileMacros = Shader._compileMacros;
    ShaderMacroCollection.unionCollection(camera._globalShaderMacro, shaderData._macroCollection, compileMacros);
    const program = shader.passes[0]._getShaderProgram(engine, compileMacros);
    program.bind();
    program.groupingOtherUniformBlock();
    program.uploadAll(program.materialUniformBlock, shaderData);
    program.uploadUnGroupTextures();

    renderState._apply(engine, false);
    rhi.drawPrimitive(mesh, mesh.subMesh, program);
  }
}
