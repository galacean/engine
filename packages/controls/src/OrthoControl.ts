import { Camera, Entity, Script, UpdateFlag, Vector2, Vector3 } from "oasis-engine";

/**
 * The camera's 2D controller, can zoom and pan.
 */
export class OrthoControl extends Script {
  camera: Entity;
  cameraComp: Camera;
  cameraMatrixDirty: UpdateFlag;

  private _position: Vector3 = new Vector3();
  private _zoomSpeed: number = 1.0;
  private _zoomScale: number = 1.0;
  private _zoomScaleUnit: number = 25.0;
  private _zoomMinSize: number = 0.0;
  private _zoomMaxSize: number = Infinity;
  private _isPanStart: boolean = false;
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

    this.camera = entity;
    this.cameraComp = entity.getComponent(Camera);
    this.cameraMatrixDirty = entity.transform.registerWorldChangeFlag();
    this.cameraMatrixDirty.flag = false;

    const position = this.camera.transform.position;
    position.cloneTo(this._position);

    // // @ts-ignore
    // this.mainElement = this.engine.canvas._webCanvas;
    // this.mainElement.addEventListener(
    //   "wheel",
    //   (e) => {
    //     if (e.deltaY < 0) {
    //       this.zoomIn();
    //     } else {
    //       this.zoomOut();
    //     }
    //   },
    //   false
    // );
    // this.mainElement.addEventListener("mousedown", (e) => {
    //   this.panStart(e.clientX, e.clientY);
    // });
    // this.mainElement.addEventListener("mousemove", (e) => {
    //   this.panMove(e.clientX, e.clientY);
    // });
    // this.mainElement.addEventListener("mouseup", (e) => {
    //   this.panEnd();
    // });
  }

  onDestroy(): void {
    this.cameraMatrixDirty.destroy();
  }

  onUpdate(dt: number): void {
    if (!this.enabled) return;

    if (this._zoomScale !== 1) {
      const { cameraComp } = this;
      const sizeDiff = this._zoomScaleUnit * (this._zoomScale - 1);
      const size = cameraComp.orthographicSize + sizeDiff;
      cameraComp.orthographicSize = Math.max(this._zoomMinSize, Math.min(this._zoomMaxSize, size));
    }

    this._zoomScale = 1;

    if (this.cameraMatrixDirty.flag) {
      const position = this.camera.transform.position;
      position.cloneTo(this._position);
      this.cameraMatrixDirty.flag = false;
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
    if (this.enabled === false) return;

    this._isPanStart = true;
    this._panStart.setValue(x, y);
  }

  /**
   * Panning.
   * @param x - The x-axis coordinate (unit: pixel)
   * @param y - The y-axis coordinate (unit: pixel)
   */
  panMove(x: number, y: number): void {
    if (this.enabled === false || this._isPanStart === false) return;

    const { _panStart: panStart, _panEnd: panEnd } = this;
    panEnd.setValue(x, y);
    Vector2.subtract(panEnd, panStart, this._panDelta);
    this._handlePan();
    panEnd.cloneTo(panStart);
  }

  /**
   * End pan.
   */
  panEnd(): void {
    if (this.enabled === false) return;
    this._isPanStart = false;
  }

  private _getZoomScale(): number {
    return Math.pow(0.95, this.zoomSpeed);
  }

  private _handlePan(): void {
    const { width, height } = this.engine.canvas;
    const { x, y } = this._panDelta;
    const { cameraComp } = this;
    const doubleOrthographicSize = cameraComp.orthographicSize * 2;
    const width3D = doubleOrthographicSize * cameraComp.aspectRatio;
    const height3D = doubleOrthographicSize;
    const pos = this._position;
    pos.x -= (x * width3D) / width;
    pos.y += (y * height3D) / height;
    this.camera.transform.position = pos;
    this.cameraMatrixDirty.flag = false;
  }
}
