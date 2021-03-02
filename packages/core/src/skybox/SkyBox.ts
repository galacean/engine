import { BoundingBox, Matrix } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Entity } from "../Entity";
import { PrimitiveMesh } from "../mesh/PrimitiveMesh";
import { MeshRenderer } from "../mesh/MeshRenderer";
import { TextureCubeMap } from "../texture/TextureCubeMap";
import { SkyBoxMaterial } from "./SkyBoxMaterial";

/**
 * Skybox Component
 */
export class SkyBox extends MeshRenderer {
  private _skyBoxMap: TextureCubeMap;
  private _matrix: Matrix = new Matrix();
  private _initBounds: boolean = false;

  /**
   * Contructor of skybox
   * @param - Entity
   */
  constructor(entity: Entity) {
    super(entity);
    this.mesh = PrimitiveMesh.createCuboid(this.engine, 2, 2, 2);
    this.setMaterial(new SkyBoxMaterial(this.engine));
  }

  /**
   * @internal
   */
  _render(camera: Camera): void {
    if (!this._skyBoxMap) return;

    const modelMatrix = this.entity.transform.worldMatrix;
    const view = camera.viewMatrix;
    const proj = camera.projectionMatrix;
    const matrix = this._matrix;

    Matrix.multiply(view, modelMatrix, matrix);
    const e = matrix.elements;
    e[12] = e[13] = e[14] = 0;
    Matrix.multiply(proj, matrix, matrix);
    this.shaderData.setMatrix("u_mvpNoscale", matrix);

    super._render(camera);
  }

  /**
   * CubeMap of current skybox.
   */
  get skyBoxMap(): TextureCubeMap {
    return this._skyBoxMap;
  }

  set skyBoxMap(v: TextureCubeMap) {
    this._skyBoxMap = v;
    v && this.getMaterial().shaderData.setTexture("u_cube", v);
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    if (!this._initBounds) {
      worldBounds.min.setValue(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
      worldBounds.max.setValue(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
      this._initBounds = true;
    }
  }
}
