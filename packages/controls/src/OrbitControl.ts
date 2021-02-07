"use strict";
import { Entity, Matrix, Script, Vector2, Vector3 } from "oasis-engine";
import { Spherical } from "./Spherical";

/**
 * The camera's track controller, can rotate, zoom, pan, support mouse and touch events.
 */
export class OrbitControl extends Script {
  camera: Entity;
  domElement: HTMLElement | Document;
  mainElement: HTMLCanvasElement;
  fov: number;
  target: Vector3;
  up: Vector3;
  minDistance: number;
  maxDistance: number;
  minZoom: number;
  maxZoom: number;
  enableDamping: boolean;
  zoomFactor: number;
  enableRotate: boolean;
  keyPanSpeed: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
  enableZoom: boolean;
  dampingFactor: number;
  zoomSpeed: number;
  enablePan: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  rotateSpeed: number;
  enableKeys: boolean;
  keys: { LEFT: number; RIGHT: number; UP: number; BOTTOM: number };
  mouseButtons: { ORBIT: number; ZOOM: number; PAN: number };
  touchFingers: { ORBIT: number; ZOOM: number; PAN: number };
  STATE: {
    TOUCH_ROTATE: number;
    ROTATE: number;
    TOUCH_PAN: number;
    ZOOM: number;
    NONE: number;
    PAN: number;
    TOUCH_ZOOM: number;
  };
  mouseUpEvents: { listener: any; type: string }[];
  constEvents: { listener: any; type: string; element?: Window }[];

  private _position: Vector3;
  private _offset: Vector3;
  private _spherical: Spherical;
  private _sphericalDelta: Spherical;
  private _sphericalDump: Spherical;
  private _zoomFrag: number;
  private _scale: number;
  private _panOffset: Vector3;
  private _isMouseUp: boolean;
  private _vPan: Vector3;
  private _state: any;
  private _rotateStart: Vector2;
  private _rotateEnd: Vector2;
  private _rotateDelta: Vector2;
  private _panStart: Vector2;
  private _panEnd: Vector2;
  private _panDelta: Vector2;
  private _zoomStart: Vector2;
  private _zoomEnd: Vector2;
  private _zoomDelta: Vector2;
  private _oriTarget = new Vector3(Infinity, Infinity, Infinity);

  constructor(entity: Entity) {
    super(entity);

    this.camera = entity;
    // @ts-ignore
    // @todo In the future, the dependence on html elements will be removed and realized through the input of the packaging engine.
    this.mainElement = this.engine.canvas._webCanvas;
    this.domElement = document;
    this.fov = 45;

    // Target position.
    this.target = new Vector3();

    // Up vector
    this.up = new Vector3(0, 1, 0);

    /**
     * The minimum distance, the default is 0.1, should be greater than 0.
     */
    this.minDistance = 0.1;
    /**
     * The maximum distance, the default is infinite, should be greater than the minimum distance
     */
    this.maxDistance = Infinity;

    /**
     * Minimum zoom speed, the default is 0.0.
     * @member {Number}
     */
    this.minZoom = 0.0;

    /**
     * Maximum zoom speed, the default is positive infinity.
     */
    this.maxZoom = Infinity;

    /**
     * The minimum radian in the vertical direction, the default is 0 radian, the value range is 0 - Math.PI.
     */
    this.minPolarAngle = 0;

    /**
     * The maximum radian in the vertical direction, the default is Math.PI, and the value range is 0 - Math.PI.
     */
    this.maxPolarAngle = Math.PI;

    /**
     * The minimum radian in the horizontal direction, the default is negative infinity.
     */
    this.minAzimuthAngle = -Infinity;

    /**
     * The maximum radian in the horizontal direction, the default is positive infinity.
     */
    this.maxAzimuthAngle = Infinity;

    /**
     * Whether to enable camera damping, the default is true.
     */
    this.enableDamping = true;

    /**
     * Rotation damping parameter, default is 0.1 .
     */
    this.dampingFactor = 0.1;

    /**
     * Zoom damping parameter, default is 0.2 .
     */
    this.zoomFactor = 0.2;

    /**
     * Whether to enable zoom, the default is true.
     */
    this.enableZoom = true;

    /**
     * Camera zoom speed, the default is 1.0.
     */
    this.zoomSpeed = 1.0;

    /**
     * Whether to enable rotation, the default is true.
     */
    this.enableRotate = true;

    /**
     * Rotation speed, default is 1.0 .
     */
    this.rotateSpeed = 1.0;

    /**
     * Whether to enable translation, the default is true.
     */
    this.enablePan = true;

    /**
     * Keyboard translation speed, the default is 7.0 .
     */
    this.keyPanSpeed = 7.0;

    /**
     * Whether to automatically rotate the camera, the default is false.
     */
    this.autoRotate = false;

    /**
     * The time required for one automatic rotation, the default is 2.0s .
     */
    this.autoRotateSpeed = 2.0;

    /**
     * Whether to enable keyboard.
     */
    this.enableKeys = false;
    this.keys = {
      LEFT: 37,
      UP: 38,
      RIGHT: 39,
      BOTTOM: 40
    };

    // Control keys.
    this.mouseButtons = {
      ORBIT: 0,
      ZOOM: 1,
      PAN: 2
    };

    this.touchFingers = {
      ORBIT: 1,
      ZOOM: 2,
      PAN: 3
    };

    // Reuse objects to prevent excessive stack allocation.
    // update
    this._position = new Vector3();
    this._offset = new Vector3();
    this._spherical = new Spherical();
    this._sphericalDelta = new Spherical();
    this._sphericalDump = new Spherical();
    this._zoomFrag = 0;
    this._scale = 1;
    this._panOffset = new Vector3();
    this._isMouseUp = true;

    // pan
    this._vPan = new Vector3();

    // state
    this._rotateStart = new Vector2();
    this._rotateEnd = new Vector2();
    this._rotateDelta = new Vector2();

    this._panStart = new Vector2();
    this._panEnd = new Vector2();
    this._panDelta = new Vector2();

    this._zoomStart = new Vector2();
    this._zoomEnd = new Vector2();
    this._zoomDelta = new Vector2();

    this.STATE = {
      NONE: -1,
      ROTATE: 0,
      ZOOM: 1,
      PAN: 2,
      TOUCH_ROTATE: 3,
      TOUCH_ZOOM: 4,
      TOUCH_PAN: 5
    };
    this._state = this.STATE.NONE;

    this.constEvents = [
      { type: "mousedown", listener: this.onMouseDown.bind(this) },
      { type: "wheel", listener: this.onMouseWheel.bind(this) },
      { type: "keydown", listener: this.onKeyDown.bind(this), element: window },
      { type: "touchstart", listener: this.onTouchStart.bind(this) },
      { type: "touchmove", listener: this.onTouchMove.bind(this) },
      { type: "touchend", listener: this.onTouchEnd.bind(this) },
      { type: "contextmenu", listener: this.onContextMenu.bind(this) }
    ];

    this.mouseUpEvents = [
      { type: "mousemove", listener: this.onMouseMove.bind(this) },
      { type: "mouseup", listener: this.onMouseUp.bind(this) }
    ];

    this.constEvents.forEach((ele) => {
      if (ele.element) {
        ele.element.addEventListener(ele.type, ele.listener, false);
      } else {
        this.mainElement.addEventListener(ele.type, ele.listener, false);
      }
    });
  }

  onDisable(): void {
    const element = this.domElement === document ? this.domElement.body : this.domElement;
    this.mainElement.removeEventListener(this.mouseUpEvents[0].type, this.mouseUpEvents[0].listener, false);
    element.removeEventListener(this.mouseUpEvents[1].type, this.mouseUpEvents[1].listener, false);
  }

  onDestroy() {
    this.constEvents.forEach((ele) => {
      if (ele.element) {
        ele.element.removeEventListener(ele.type, ele.listener, false);
      } else {
        this.mainElement.removeEventListener(ele.type, ele.listener, false);
      }
    });
    const element = this.domElement === document ? this.domElement.body : this.domElement;
    this.mainElement.removeEventListener(this.mouseUpEvents[0].type, this.mouseUpEvents[0].listener, false);
    element.removeEventListener(this.mouseUpEvents[1].type, this.mouseUpEvents[1].listener, false);
  }

  onUpdate(dtime) {
    if (!this.enabled) return;

    const position: Vector3 = this.camera.transform.position;
    position.cloneTo(this._offset);
    this._offset.subtract(this.target);
    this._spherical.setFromVec3(this._offset);

    if (this.autoRotate && this._state === this.STATE.NONE) {
      this.rotateLeft(this.getAutoRotationAngle(dtime));
    }

    this._spherical.theta += this._sphericalDelta.theta;
    this._spherical.phi += this._sphericalDelta.phi;

    this._spherical.theta = Math.max(this.minAzimuthAngle, Math.min(this.maxAzimuthAngle, this._spherical.theta));
    this._spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._spherical.phi));
    this._spherical.makeSafe();

    if (this._scale !== 1) {
      this._zoomFrag = this._spherical.radius * (this._scale - 1);
    }

    this._spherical.radius += this._zoomFrag;
    this._spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this._spherical.radius));

    this.target.add(this._panOffset);
    this._spherical.setToVec3(this._offset);
    this.target.cloneTo(this._position);
    this._position.add(this._offset);

    if (!Vector3.equals(this.camera.transform.position, this._position)) {
      this.camera.transform.position = this._position;
      this.camera.transform.lookAt(this.target, this.up);
    }
    if (!Vector3.equals(this.target, this._oriTarget)) {
      this.camera.transform.lookAt(this.target, this.up);
      this.target.cloneTo(this._oriTarget);
    }

    if (this.enableDamping === true) {
      this._sphericalDump.theta *= 1 - this.dampingFactor;
      this._sphericalDump.phi *= 1 - this.dampingFactor;
      this._zoomFrag *= 1 - this.zoomFactor;

      if (this._isMouseUp) {
        this._sphericalDelta.theta = this._sphericalDump.theta;
        this._sphericalDelta.phi = this._sphericalDump.phi;
      } else {
        this._sphericalDelta.set(0, 0, 0);
      }
    } else {
      this._sphericalDelta.set(0, 0, 0);
      this._zoomFrag = 0;
    }

    this._scale = 1;
    this._panOffset.setValue(0, 0, 0);
  }

  /**
   * Get the radian of automatic rotation.
   */
  getAutoRotationAngle(dtime: number) {
    return ((2 * Math.PI) / this.autoRotateSpeed / 1000) * dtime;
  }

  /**
   * Get zoom value.
   */
  getZoomScale() {
    return Math.pow(0.95, this.zoomSpeed);
  }

  /**
   * Rotate to the left by a certain randian.
   * @param radian - Radian value of rotation
   */
  rotateLeft(radian: number) {
    this._sphericalDelta.theta -= radian;
    if (this.enableDamping) {
      this._sphericalDump.theta = -radian;
    }
  }

  /**
   * Rotate to the right by a certain randian.
   * @param radian - Radian value of rotation
   */
  rotateUp(radian: number) {
    this._sphericalDelta.phi -= radian;
    if (this.enableDamping) {
      this._sphericalDump.phi = -radian;
    }
  }

  /**
   * Pan left.
   */
  panLeft(distance: number, worldMatrix: Matrix) {
    const e = worldMatrix.elements;
    this._vPan.setValue(e[0], e[1], e[2]);
    this._vPan.scale(distance);
    this._panOffset.add(this._vPan);
  }

  /**
   * Pan right.
   */
  panUp(distance: number, worldMatrix: Matrix) {
    const e = worldMatrix.elements;
    this._vPan.setValue(e[4], e[5], e[6]);
    this._vPan.scale(distance);
    this._panOffset.add(this._vPan);
  }

  /**
   * Pan.
   * @param deltaX - The amount of translation from the screen distance in the x direction
   * @param deltaY - The amount of translation from the screen distance in the y direction
   */
  pan(deltaX: number, deltaY: number) {
    const element = this.domElement === document ? this.domElement.body : (this.domElement as HTMLElement);

    // perspective only
    const position: Vector3 = this.camera.position;
    position.cloneTo(this._vPan);
    this._vPan.subtract(this.target);
    let targetDistance = this._vPan.length();

    targetDistance *= (this.fov / 2) * (Math.PI / 180);

    this.panLeft(-2 * deltaX * (targetDistance / element.clientHeight), this.camera.transform.worldMatrix);
    this.panUp(2 * deltaY * (targetDistance / element.clientHeight), this.camera.transform.worldMatrix);
  }

  /**
   * Zoom in.
   */
  zoomIn(zoomScale: number): void {
    // perspective only
    this._scale *= zoomScale;
  }

  /**
   * Zoom out.
   */
  zoomOut(zoomScale: number): void {
    // perspective only
    this._scale /= zoomScale;
  }

  /**
   * Rotation parameter update on mouse click.
   */
  handleMouseDownRotate(event) {
    this._rotateStart.setValue(event.clientX, event.clientY);
  }

  /**
   * Zoom parameter update on mouse click.
   */
  handleMouseDownZoom(event) {
    this._zoomStart.setValue(event.clientX, event.clientY);
  }

  /**
   * Pan parameter update on mouse click.
   */
  handleMouseDownPan(event) {
    this._panStart.setValue(event.clientX, event.clientY);
  }

  /**
   * Rotation parameter update when the mouse moves.
   */
  handleMouseMoveRotate(event) {
    this._rotateEnd.setValue(event.clientX, event.clientY);
    Vector2.subtract(this._rotateEnd, this._rotateStart, this._rotateDelta);

    const element = this.domElement === document ? document.body : (this.domElement as HTMLElement);

    this.rotateLeft(2 * Math.PI * (this._rotateDelta.x / element.clientWidth) * this.rotateSpeed);
    this.rotateUp(2 * Math.PI * (this._rotateDelta.y / element.clientHeight) * this.rotateSpeed);

    this._rotateEnd.cloneTo(this._rotateStart);
  }

  /**
   * Zoom parameters update when the mouse moves.
   */
  handleMouseMoveZoom(event) {
    this._zoomEnd.setValue(event.clientX, event.clientY);
    Vector2.subtract(this._zoomEnd, this._zoomStart, this._zoomDelta);

    if (this._zoomDelta.y > 0) {
      this.zoomOut(this.getZoomScale());
    } else if (this._zoomDelta.y < 0) {
      this.zoomIn(this.getZoomScale());
    }

    this._zoomEnd.cloneTo(this._zoomStart);
  }

  /**
   * Pan parameters update when the mouse moves.
   */
  handleMouseMovePan(event: MouseEvent): void {
    this._panEnd.setValue(event.clientX, event.clientY);
    Vector2.subtract(this._panEnd, this._panStart, this._panDelta);

    this.pan(this._panDelta.x, this._panDelta.y);

    this._panEnd.cloneTo(this._panStart);
  }

  /**
   * Zoom parameter update when the mouse wheel is scrolled.
   */
  handleMouseWheel(event: MouseWheelEvent): void {
    if (event.deltaY < 0) {
      this.zoomIn(this.getZoomScale());
    } else if (event.deltaY > 0) {
      this.zoomOut(this.getZoomScale());
    }
  }

  /**
   * Pan parameter update when keyboard is pressed.
   */
  handleKeyDown(event: KeyboardEvent) {
    switch (event.keyCode) {
      case this.keys.UP:
        this.pan(0, this.keyPanSpeed);
        break;
      case this.keys.BOTTOM:
        this.pan(0, -this.keyPanSpeed);
        break;
      case this.keys.LEFT:
        this.pan(this.keyPanSpeed, 0);
        break;
      case this.keys.RIGHT:
        this.pan(-this.keyPanSpeed, 0);
        break;
    }
  }

  /**
   * Rotation parameter update when touch is dropped.
   */
  handleTouchStartRotate(event: TouchEvent) {
    this._rotateStart.setValue(event.touches[0].pageX, event.touches[0].pageY);
  }

  /**
   * Zoom parameter update when touch down.
   */
  handleTouchStartZoom(event: TouchEvent) {
    const dx = event.touches[0].pageX - event.touches[1].pageX;
    const dy = event.touches[0].pageY - event.touches[1].pageY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    this._zoomStart.setValue(0, distance);
  }

  /**
   * Update the translation parameter when touch down.
   */
  handleTouchStartPan(event: TouchEvent) {
    this._panStart.setValue(event.touches[0].pageX, event.touches[0].pageY);
  }

  /**
   * Rotation parameter update when touch to move.
   */
  handleTouchMoveRotate(event: TouchEvent) {
    this._rotateEnd.setValue(event.touches[0].pageX, event.touches[0].pageY);
    Vector2.subtract(this._rotateEnd, this._rotateStart, this._rotateDelta);

    const element = this.domElement === document ? this.domElement.body : (this.domElement as HTMLElement);

    this.rotateLeft(((2 * Math.PI * this._rotateDelta.x) / element.clientWidth) * this.rotateSpeed);
    this.rotateUp(((2 * Math.PI * this._rotateDelta.y) / element.clientHeight) * this.rotateSpeed);

    this._rotateEnd.cloneTo(this._rotateStart);
  }

  /**
   * Zoom parameter update when touch to move.
   */
  handleTouchMoveZoom(event) {
    const dx = event.touches[0].pageX - event.touches[1].pageX;
    const dy = event.touches[0].pageY - event.touches[1].pageY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    this._zoomEnd.setValue(0, distance);

    Vector2.subtract(this._zoomEnd, this._zoomStart, this._zoomDelta);

    if (this._zoomDelta.y > 0) {
      this.zoomIn(this.getZoomScale());
    } else if (this._zoomDelta.y < 0) {
      this.zoomOut(this.getZoomScale());
    }

    this._zoomEnd.cloneTo(this._zoomStart);
  }

  /**
   * Pan parameter update when touch moves.
   */
  handleTouchMovePan(event: TouchEvent) {
    this._panEnd.setValue(event.touches[0].pageX, event.touches[0].pageY);

    Vector2.subtract(this._panEnd, this._panStart, this._panDelta);

    this.pan(this._panDelta.x, this._panDelta.y);

    this._panEnd.cloneTo(this._panStart);
  }

  /**
   * Total handling of mouse down events.
   */
  onMouseDown(event: MouseEvent) {
    if (this.enabled === false) return;

    event.preventDefault();

    this._isMouseUp = false;

    switch (event.button) {
      case this.mouseButtons.ORBIT:
        if (this.enableRotate === false) return;

        this.handleMouseDownRotate(event);
        this._state = this.STATE.ROTATE;
        break;

      case this.mouseButtons.ZOOM:
        if (this.enableZoom === false) return;

        this.handleMouseDownZoom(event);
        this._state = this.STATE.ZOOM;
        break;

      case this.mouseButtons.PAN:
        if (this.enablePan === false) return;

        this.handleMouseDownPan(event);
        this._state = this.STATE.PAN;
        break;
    }

    if (this._state !== this.STATE.NONE) {
      const element = this.domElement === document ? this.domElement.body : this.domElement;
      this.mainElement.addEventListener(this.mouseUpEvents[0].type, this.mouseUpEvents[0].listener, false);
      element.addEventListener(this.mouseUpEvents[1].type, this.mouseUpEvents[1].listener, false);
    }
  }

  /**
   * Total handling of mouse movement events.
   */
  onMouseMove(event: MouseEvent) {
    if (this.enabled === false) return;

    event.preventDefault();

    switch (this._state) {
      case this.STATE.ROTATE:
        if (this.enableRotate === false) return;

        this.handleMouseMoveRotate(event);
        break;

      case this.STATE.ZOOM:
        if (this.enableZoom === false) return;

        this.handleMouseMoveZoom(event);
        break;

      case this.STATE.PAN:
        if (this.enablePan === false) return;

        this.handleMouseMovePan(event);
        break;
    }
  }

  /**
   * Total handling of mouse up events.
   */
  onMouseUp() {
    if (this.enabled === false) return;

    this._isMouseUp = true;

    this.mouseUpEvents.forEach((ele) => {
      const element = this.domElement === document ? this.domElement.body : this.domElement;
      element.removeEventListener(ele.type, ele.listener, false);
      this.mainElement.removeEventListener(ele.type, ele.listener, false);
    });

    this._state = this.STATE.NONE;
  }

  /**
   * Total handling of mouse wheel events.
   */
  onMouseWheel(event: MouseWheelEvent) {
    if (
      this.enabled === false ||
      this.enableZoom === false ||
      (this._state !== this.STATE.NONE && this._state !== this.STATE.ROTATE)
    )
      return;

    event.preventDefault();
    event.stopPropagation();

    this.handleMouseWheel(event);
  }

  /**
   * Total handling of keyboard down events.
   */
  onKeyDown(event: KeyboardEvent) {
    if (this.enabled === false || this.enableKeys === false || this.enablePan === false) return;

    this.handleKeyDown(event);
  }

  /**
   * Total handling of touch start events.
   */
  onTouchStart(event: TouchEvent) {
    if (this.enabled === false) return;

    this._isMouseUp = false;

    switch (event.touches.length) {
      case this.touchFingers.ORBIT:
        if (this.enableRotate === false) return;

        this.handleTouchStartRotate(event);
        this._state = this.STATE.TOUCH_ROTATE;

        break;

      case this.touchFingers.ZOOM:
        if (this.enableZoom === false) return;

        this.handleTouchStartZoom(event);
        this._state = this.STATE.TOUCH_ZOOM;

        break;

      case this.touchFingers.PAN:
        if (this.enablePan === false) return;

        this.handleTouchStartPan(event);
        this._state = this.STATE.TOUCH_PAN;

        break;

      default:
        this._state = this.STATE.NONE;
    }
  }

  /**
   * Total handling of touch movement events.
   */
  onTouchMove(event: TouchEvent) {
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();

    switch (event.touches.length) {
      case this.touchFingers.ORBIT:
        if (this.enableRotate === false) return;
        if (this._state !== this.STATE.TOUCH_ROTATE) return;
        this.handleTouchMoveRotate(event);

        break;

      case this.touchFingers.ZOOM:
        if (this.enableZoom === false) return;
        if (this._state !== this.STATE.TOUCH_ZOOM) return;
        this.handleTouchMoveZoom(event);

        break;

      case this.touchFingers.PAN:
        if (this.enablePan === false) return;
        if (this._state !== this.STATE.TOUCH_PAN) return;
        this.handleTouchMovePan(event);

        break;

      default:
        this._state = this.STATE.NONE;
    }
  }

  /**
   * Total handling of touch end events.
   */
  onTouchEnd() {
    if (this.enabled === false) return;

    this._isMouseUp = true;
    this._state = this.STATE.NONE;
  }

  /**
   * Context event hiding.
   */
  onContextMenu(event) {
    if (this.enabled === false) return;
    event.preventDefault();
  }
}
