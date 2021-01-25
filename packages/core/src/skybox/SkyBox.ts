import { BoundingBox, Matrix } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Entity } from "../Entity";
import { CuboidGeometry } from "../geometry-shape/CuboidGeometry";
import { GeometryRenderer } from "../geometry/GeometryRenderer";
import { TextureCubeMap } from "../texture/TextureCubeMap";
import { SkyBoxMaterial } from "./SkyBoxMaterial";

/**
 * Skybox Component
 */
export class SkyBox extends GeometryRenderer {
  private _skyBoxMap: TextureCubeMap;
  private _matrix: Matrix = new Matrix();
  private _initBounds: boolean = false;

  /**
   * Contructor of skybox
   * @param - Entity
   */
  constructor(entity: Entity) {
    super(entity);
    this.geometry = new CuboidGeometry(this.engine, 2, 2, 2);
    this.material = new SkyBoxMaterial(this.engine);
  }

  /**
   * @internal
   * @param camera
   */
  render(camera: Camera) {
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

    super.render(camera);
  }

  /**
   * CubeMap of current skybox.
   */
  get skyBoxMap(): TextureCubeMap {
    return this._skyBoxMap;
  }

  set skyBoxMap(v: TextureCubeMap) {
    this._skyBoxMap = v;
    v && this.material.shaderData.setTexture("u_cube", v);
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
