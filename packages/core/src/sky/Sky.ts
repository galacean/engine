import { Matrix } from "@oasis-engine/math";
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
  private static _viewProjMatrix: Matrix = new Matrix();

  /** Material of the sky. */
  material: Material;
  /** Mesh of the sky. */
  mesh: Mesh;

  /**
   * @internal
   */
  _render(camera: Camera): void {
    const engine = camera.engine;
    const _viewProjMatrix = Sky._viewProjMatrix;
    const { material, mesh } = this;
    if (!material) {
      Logger.warn("The material of sky is not defined.");
      return;
    }
    if (!mesh) {
      Logger.warn("The mesh of sky is not defined.");
      return;
    }

    const rhi = engine._hardwareRenderer;
    const { shaderData, shader, renderState } = material;

    const compileMacros = Shader._compileMacros;
    ShaderMacroCollection.unionCollection(camera._globalShaderMacro, shaderData._macroCollection, compileMacros);

    const { viewMatrix, projectionMatrix } = camera;
    _viewProjMatrix.copyFrom(viewMatrix);
    const e = _viewProjMatrix.elements;
    e[12] = e[13] = e[14] = 0;
    Matrix.multiply(projectionMatrix, _viewProjMatrix, _viewProjMatrix);
    shaderData.setMatrix("u_mvpNoscale", _viewProjMatrix);

    const program = shader.passes[0]._getShaderProgram(engine, compileMacros);
    program.bind();
    program.groupingOtherUniformBlock();
    program.uploadAll(program.materialUniformBlock, shaderData);
    program.uploadUnGroupTextures();

    renderState._apply(engine, false);
    rhi.drawPrimitive(mesh, mesh.subMesh, program);
  }
}
