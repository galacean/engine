import { Camera, Entity, Logger, Script, Vector2, Vector3 } from "oasis-engine";

/**
 * The camera's 2D controller, can zoom and pan.
 */
export class OrthoControl extends Script {
  cameraEntity: Entity;
  camera: Camera;

  private _zoomSpeed: number = 1.0;
  private _zoomScale: number = 1.0;
  private _zoomScaleUnit: number = 25.0;
  private _zoomMinSize: number = 0.0;
  private _zoomMaxSize: number = Infinity;
  private _isPanStart: boolean = false;
  private _panStartPos: Vector3 = new Vector3();
  private _panStart: Vector2 = new Vector2();
  private _panEnd: Vector2 = new Vector2();
  private _panDelta: Vector2 = new Vector2();

  /**
   * The zoom speed.
   */
  get zoomSpeed(): number {
    return this._zoomSpeed;
  }

  set zoomSpeed(value: number) {
    this._zoomSpeed = value;
  }

  constructor(entity: Entity) {
    super(entity);

    this.cameraEntity = entity;
    this.camera = entity.getComponent(Camera);
  }

  onUpdate(dt: number): void {
    if (this._zoomScale !== 1) {
      const { camera } = this;
      const sizeDiff = this._zoomScaleUnit * (this._zoomScale - 1);
      const size = camera.orthographicSize + sizeDiff;
      camera.orthographicSize = Math.max(this._zoomMinSize, Math.min(this._zoomMaxSize, size));
      this._zoomScale = 1;
    }

    if (this._isPanStart) {
      const { _panStart: panStart, _panEnd: panEnd } = this;
      const panDelta = this._panDelta;
      Vector2.subtract(panEnd, panStart, panDelta);
      if (panDelta.x === 0 && panDelta.y === 0) {
        return ;
      }
      this._handlePan();
      panEnd.cloneTo(panStart);
    }
  }

  /**
   * Zoom in.
   */
  zoomIn(): void {
    this._zoomScale *= this._getZoomScale();
  }

  /**
   * Zoom out.
   */
  zoomOut(): void {
    this._zoomScale /= this._getZoomScale();
  }

  /**
   * Start pan.
   * @param x - The x-axis coordinate (unit: pixel)
   * @param y - The y-axis coordinate (unit: pixel)
   */
  panStart(x: number, y: number): void {
    if (!this.enabled) return;

    this.cameraEntity.transform.position.cloneTo(this._panStartPos);
    this._panStart.setValue(x, y);
    this._panEnd.setValue(x, y);
    this._isPanStart = true;
  }

  /**
   * Panning.
   * @param x - The x-axis coordinate (unit: pixel)
   * @param y - The y-axis coordinate (unit: pixel)
   *
   * @remarks Make sure to call panStart before calling panMove.
   */
  panMove(x: number, y: number): void {
    if (!this.enabled) return;
    if (!this._isPanStart) {
      Logger.warn("Make sure to call panStart before calling panMove");
    }
    this._panEnd.setValue(x, y);
  }

  /**
   * End pan.
   */
  panEnd(): void {
    if (!this.enabled) return;
    this._isPanStart = false;
  }

  private _getZoomScale(): number {
    return Math.pow(0.95, this.zoomSpeed);
  }

  private _handlePan(): void {
    const { width, height } = this.engine.canvas;
    const { x, y } = this._panDelta;
    const { camera } = this;
    const doubleOrthographicSize = camera.orthographicSize * 4;
    const width3D = doubleOrthographicSize * camera.aspectRatio;
    const height3D = doubleOrthographicSize;
    const pos = this._panStartPos;
    pos.x -= (x * width3D) / width;
    pos.y += (y * height3D) / height;
    this.cameraEntity.transform.position = pos;
  }
}
