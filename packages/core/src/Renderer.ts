import { BoundingBox, Matrix, Vector3 } from "@oasis-engine/math";
import { Camera } from "./Camera";
import { deepClone, ignoreClone } from "./clone/CloneManager";
import { Component } from "./Component";
import { Entity } from "./Entity";
import { RenderContext } from "./RenderPipeline/RenderContext";
import { Shader } from "./shader";
import { ShaderDataGroup } from "./shader/enums/ShaderDataGroup";
import { ShaderData } from "./shader/ShaderData";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
import { UpdateFlag } from "./UpdateFlag";

/**
 * Renderable components.
 */
export abstract class Renderer extends Component {
  private static _localMatrixProperty = Shader.getPropertyByName("u_localMat");
  private static _worldMatrixProperty = Shader.getPropertyByName("u_modelMat");
  private static _mvMatrixProperty = Shader.getPropertyByName("u_MVMat");
  private static _mvpMatrixProperty = Shader.getPropertyByName("u_MVPMat");
  private static _mvInvMatrixProperty = Shader.getPropertyByName("u_MVInvMat");
  private static _normalMatrixProperty = Shader.getPropertyByName("u_normalMat");

  /** ShaderData related to renderer. */
  @deepClone
  readonly shaderData: ShaderData = new ShaderData(ShaderDataGroup.Renderer);
  /** Whether it is clipped by the frustum, needs to be turned on camera.enableFrustumCulling。 */
  @ignoreClone
  isCulled: boolean = false;

  /** @internal */
  @ignoreClone
  _onUpdateIndex: number = -1;

  /** @internal */
  @ignoreClone
  _rendererIndex: number = -1;

  /** @internal */
  @ignoreClone
  _globalShaderMacro: ShaderMacroCollection = new ShaderMacroCollection();

  @ignoreClone
  protected _overrideUpdate: boolean = false;

  @ignoreClone
  private _transformChangeFlag: UpdateFlag;
  @deepClone
  private _bounds: BoundingBox = new BoundingBox(new Vector3(), new Vector3());
  @ignoreClone
  private _mvMatrix: Matrix = new Matrix();
  @ignoreClone
  private _mvpMatrix: Matrix = new Matrix();
  @ignoreClone
  private _mvInvMatrix: Matrix = new Matrix();
  @ignoreClone
  private _normalMatrix: Matrix = new Matrix();

  get bounds(): BoundingBox {
    const changeFlag = this._transformChangeFlag;
    if (changeFlag.flag) {
      this._updateBounds(this._bounds);
      changeFlag.flag = false;
    }
    return this._bounds;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    const prototype = Renderer.prototype;
    this._overrideUpdate = this.update !== prototype.update;
    this._transformChangeFlag = this.entity.transform.registerWorldChangeFlag();
    this.shaderData._addRefCount(1);
  }

  /**
   * @internal
   */
  _updateShaderData(context: RenderContext) {
    const shaderData = this.shaderData;
    const worldMatrix = this.entity.transform.worldMatrix;
    const mvMatrix = this._mvMatrix;
    const mvpMatrix = this._mvpMatrix;
    const mvInvMatrix = this._mvInvMatrix;
    const normalMatrix = this._normalMatrix;

    Matrix.multiply(context._camera.viewMatrix, worldMatrix, mvMatrix);
    Matrix.multiply(context._viewProjectMatrix, worldMatrix, mvpMatrix);
    Matrix.invert(mvMatrix, mvInvMatrix);
    Matrix.invert(worldMatrix, normalMatrix);
    normalMatrix.transpose();

    shaderData.setMatrix(Renderer._localMatrixProperty, this.entity.transform.localMatrix);
    shaderData.setMatrix(Renderer._worldMatrixProperty, worldMatrix);
    shaderData.setMatrix(Renderer._mvMatrixProperty, mvMatrix);
    shaderData.setMatrix(Renderer._mvpMatrixProperty, mvpMatrix);
    shaderData.setMatrix(Renderer._mvInvMatrixProperty, mvInvMatrix);
    shaderData.setMatrix(Renderer._normalMatrixProperty, normalMatrix);
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    const flag = this._transformChangeFlag;
    if (flag) {
      flag.destroy();
      this._transformChangeFlag = null;
    }
    this.shaderData._addRefCount(-1);
  }

  abstract render(camera: Camera): void;

  update(deltaTime: number): void {}

  protected _updateBounds(worldBounds: any): void {}

  _onEnable() {
    const componentsManager = this.engine._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
    }
    componentsManager.addRenderer(this);
  }

  _onDisable() {
    const componentsManager = this.engine._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.removeOnUpdateRenderers(this);
    }
    componentsManager.removeRenderer(this);
  }

  _render(camera: Camera) {
    this.render(camera);
  }
}
