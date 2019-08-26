'use strict';

import { Logger } from '@alipay/o3-base';
import { NodeAbility, Node } from '@alipay/o3-core';
import { vec2, vec3, Spherical } from '@alipay/o3-math';

/**
 * 相机的的轨道控制器，可以旋转，缩放，平移，支持鼠标和触摸事件。
 */
export class AOrbitControls extends NodeAbility {

  public camera: Node;
  public domElement: HTMLElement | Document;
  public mainElement: HTMLCanvasElement;
  public fov: number;
  public target: Array<number> | Float32Array;
  public minDistance: number;
  public maxDistance: number;
  public minZoom: number;
  public maxZoom: number;
  public enableDamping: boolean;
  public zoomFactor: number;
  public enableRotate: boolean;
  public keyPanSpeed: number;
  public minPolarAngle: number;
  public maxPolarAngle: number;
  public minAzimuthAngle: number;
  public maxAzimuthAngle: number;
  public enableZoom: boolean;
  public dampingFactor: number;
  public zoomSpeed: number;
  public enablePan: boolean;
  public autoRotate: boolean;
  public autoRotateSpeed: number;
  public rotateSpeed: number;
  public enableKeys: boolean;
  public keys: { LEFT: number; RIGHT: number; UP: number; BOTTOM: number };
  public mouseButtons: { ORBIT: number; ZOOM: number; PAN: number };
  public touchFingers: { ORBIT: number; ZOOM: number; PAN: number };
  private _position: any[] | Float32Array;
  private _offset: any[] | Float32Array;
  private _spherical: Spherical;
  private _sphericalDelta: Spherical;
  private _sphericalDump: Spherical;
  private _zoomFrag: number;
  private _scale: number;
  private _panOffset: any[] | Float32Array;
  private _isMouseUp: boolean;
  private _rotateStart: any[] | Float32Array;
  private _vPan: any[] | Float32Array;
  public constEvents: { listener: any; type: string; element?: Window }[];
  private _state: any;
  private _rotateEnd: any[] | Float32Array;
  private _rotateDelta: any[] | Float32Array;
  private _panStart: any[] | Float32Array;
  private _panEnd: any[] | Float32Array;
  private _zoomStart: any[] | Float32Array;
  private _panDelta: any[] | Float32Array;
  private _zoomEnd: any[] | Float32Array;
  private _zoomDelta: any[] | Float32Array;
  public STATE: { TOUCH_ROTATE: number; ROTATE: number; TOUCH_PAN: number; ZOOM: number; NONE: number; PAN: number; TOUCH_ZOOM: number };
  public mouseUpEvents: ({ listener: any; type: string })[];

  /**
   * 轨道控制器构造函数
   * @param {Node} node 挂载节点
   * @param {Object} props 轨道控制器参数，包含以下项
   * @property {Canvas|HTMLElement} [props.mainElement=RHI.canvas] 获取事件的HTMLElement对象，推荐使用绘制的canvas
   * @property {HTMLElement} [props.domElement=document] 获取顶级事件的HTMLElement对象。
   * @property {fov} [props.fov=45] 透视相机的视场角大小，影响控制器的控制精度
   * @property {Vec3} [props.target=[0,0,0]] 围绕的目标点，默认原点
   */
  constructor(node: Node,
    props?: {
      domElement?: HTMLElement | Document,
      fov?: number,
      target?: Array<number>,
      mainElement?: HTMLCanvasElement
    }) {

    super(node);

    this.camera = node;
    const acamera = (node.scene as any)._activeCameras[0];
    this.mainElement = props.mainElement || acamera._rhi.canvas;
    this.domElement = props.domElement || document;
    this.fov = props.fov || 45;

    if (!(this.mainElement instanceof HTMLCanvasElement)) {

      Logger.warn('AOrbitControls must have a legal mainElement');
      return null;

    }
    // 目标点
    this.target = props.target || vec3.create();

    // 最大最小距离
    /**
     * 最小距离，默认为0.1，应大于0
     * @member {Number}
     */
    this.minDistance = 0.1;
    /**
     * 最大距离，默认为无穷，应大于最小距离
     * @member {Number}
     */
    this.maxDistance = Infinity;

    // 最大最小缩放速度
    /**
     * 最小缩放速度，默认为0.0
     * @member {Number}
     */
    this.minZoom = 0.0;
    /**
     * 最大缩放速度，默认为正无穷
     * @member {Number}
     */
    this.maxZoom = Infinity;

    // 垂直方向旋转范围
    /**
     * 垂直方向最小弧度，默认为0弧度，取值范围 0 － Math.PI
     * @member {Number}
     */
    this.minPolarAngle = 0;
    /**
     * 垂直方向最大弧度，默认为Math.PI，取值范围 0 － Math.PI
     * @member {Number}
     */
    this.maxPolarAngle = Math.PI;

    // 水平方向旋转范围
    /**
     * 垂直方向最小弧度，默认为负无穷
     * @member {Number}
     */
    this.minAzimuthAngle = -Infinity;
    /**
     * 垂直方向最小弧度，默认为正无穷
     * @member {Number}
     */
    this.maxAzimuthAngle = Infinity;

    // 缓冲参数
    /**
     * 是否开启镜头缓冲，默认为false
     * @member {Boolean}
     */
    this.enableDamping = false;
    /**
     * 旋转缓冲参数，默认为0.08
     * @member {Number}
     */
    this.dampingFactor = 0.08;
    /**
     * 缩放缓冲参数，默认为0.2
     * @member {Number}
     */
    this.zoomFactor = 0.2;

    // 缩放控制
    /**
     * 是否启用缩放，默认为true
     * @member {Boolean}
     */
    this.enableZoom = true;
    /**
     * 镜头缩放速度，默认为1.0
     * @member {Number}
     */
    this.zoomSpeed = 1.0;

    // 旋转控制
    /**
     * 是否开启旋转，默认为true
     * @member {Boolean}
     */
    this.enableRotate = true;
    /**
     * 旋转速度，默认为1.0
     * @member {Number}
     */
    this.rotateSpeed = 1.0;

    // 平移控制
    /**
     * 是否开启平移，默认为true
     * @member {Number}
     */
    this.enablePan = true;
    /**
     * 键盘平移速度，默认为7.0
     * @member {Number}
     */
    this.keyPanSpeed = 7.0;

    // 自动旋转
    /**
     * 是否自动旋转镜头，默认为false
     * @member {Boolean}
     */
    this.autoRotate = false;
    /**
     * 自动旋转一圈所需的时间，默认为2.0s
     * @member {Number}
     */
    this.autoRotateSpeed = 2.0; // 旋转 2PI 所用的时间 s

    // 键盘平移
    /**
     * 是否启用键盘平移，默认为false
     * @member {Boolean}
     */
    this.enableKeys = false;
    this.keys = {
      LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40,
    };

    // 控制键位
    this.mouseButtons = {
      ORBIT: 0, ZOOM: 1, PAN: 2,
    };
    this.touchFingers = {
      ORBIT: 1, ZOOM: 2, PAN: 3,
    };

    // 复用对象 防止栈分配过多
    // update
    this._position = vec3.create();
    this._offset = vec3.create();
    this._spherical = new Spherical();
    this._sphericalDelta = new Spherical();
    this._sphericalDump = new Spherical();
    this._zoomFrag = 0;
    this._scale = 1;
    this._panOffset = vec3.create();
    this._isMouseUp = true;

    // pan
    this._vPan = vec3.create();

    // state
    this._rotateStart = vec2.create();
    this._rotateEnd = vec2.create();
    this._rotateDelta = vec2.create();

    this._panStart = vec2.create();
    this._panEnd = vec2.create();
    this._panDelta = vec2.create();

    this._zoomStart = vec2.create();
    this._zoomEnd = vec2.create();
    this._zoomDelta = vec2.create();

    this.STATE = {
      NONE: -1, ROTATE: 0, ZOOM: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_ZOOM: 4, TOUCH_PAN: 5,
    };
    this._state = this.STATE.NONE;

    this.constEvents = [
      { type: 'mousedown', listener: this.onMouseDown.bind(this) },
      { type: 'wheel', listener: this.onMouseWheel.bind(this) },
      { type: 'keydown', listener: this.onKeyDown.bind(this), element: window },
      { type: 'touchstart', listener: this.onTouchStart.bind(this) },
      { type: 'touchmove', listener: this.onTouchMove.bind(this) },
      { type: 'touchend', listener: this.onTouchEnd.bind(this) },
      { type: 'contextmenu', listener: this.onContextMenu.bind(this) },
    ];

    this.mouseUpEvents = [
      { type: 'mousemove', listener: this.onMouseMove.bind(this) },
      { type: 'mouseup', listener: this.onMouseUp.bind(this) },
    ];

    this.constEvents.forEach(ele => {

      if (ele.element) {

        ele.element.addEventListener(ele.type, ele.listener, false);

      } else {

        this.mainElement.addEventListener(ele.type, ele.listener, false);

      }

    });

  }

  /**
   * 销毁，释放事件监听
   * @private
   */
  destroy() {

    this.constEvents.forEach(ele => {

      if (ele.element) {

        ele.element.removeEventListener(ele.type, ele.listener, false);

      } else {

        this.mainElement.removeEventListener(ele.type, ele.listener, false);

      }

    });
    const element = this.domElement === document ? this.domElement.body : this.domElement;
    this.mainElement.removeEventListener(this.mouseUpEvents[0].type, this.mouseUpEvents[0].listener, false);
    element.removeEventListener(this.mouseUpEvents[1].type, this.mouseUpEvents[1].listener, false);
    super.destroy();

  }

  /**
   * 在触屏上用单指控制旋转，三指控制平移
   */
  setOneFingerRotate() {

    this.touchFingers.ORBIT = 1;
    this.touchFingers.ZOOM = 2;
    this.touchFingers.PAN = 3;

  }

  /**
   * 在触屏上用单指控制平移，三指控制旋转
   */
  setOneFingerPan() {

    this.touchFingers.ORBIT = 3;
    this.touchFingers.ZOOM = 2;
    this.touchFingers.PAN = 1;

  }

  /**
   * 每帧更新
   * @private
   * @param {Number} dtime 和上次绘制的事件间隔 ms
   */
  update(dtime) {

    if (!this.enabled) return;

    super.update(dtime);

    const position = this.camera.position;
    vec3.copy(this._offset, position);
    vec3.sub(this._offset, this._offset, this.target);
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

    vec3.add(this.target, this.target, this._panOffset);
    this._spherical.setToVec3(this._offset);
    vec3.copy(this._position, this.target);
    vec3.add(this._position, this._position, this._offset);
    this.camera.position = this._position;
    this.camera.lookAt(this.target, vec3.fromValues(0, 1, 0));

    if (this.enableDamping === true) {

      this._sphericalDump.theta *= (1 - this.dampingFactor);
      this._sphericalDump.phi *= (1 - this.dampingFactor);
      this._zoomFrag *= (1 - this.zoomFactor);

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
    vec3.set(this._panOffset, 0, 0, 0);

  }

  /**
   * 获取自动旋转的弧度
   * @private
   */
  getAutoRotationAngle(dtime) {

    return 2 * Math.PI / this.autoRotateSpeed / 1000 * dtime;

  }

  /**
   * 获取缩放值
   * @private
   */
  getZoomScale() {

    return Math.pow(0.95, this.zoomSpeed);

  }

  /**
   * 向左旋转一定弧度
   * @property {Number} radian 旋转的弧度值
   */
  rotateLeft(radian) {

    this._sphericalDelta.theta -= radian;
    if (this.enableDamping) {

      this._sphericalDump.theta = -radian;

    }

  }

  /**
   * 向上旋转一定弧度
   * @property {Number} radian 旋转的弧度值
   */
  rotateUp(radian) {

    this._sphericalDelta.phi -= radian;
    if (this.enableDamping) {

      this._sphericalDump.phi = -radian;

    }

  }

  /**
   * 向左平移
   * @private
   */
  panLeft(distance, worldMatrix) {

    vec3.set(this._vPan, worldMatrix[0], worldMatrix[1], worldMatrix[2]);
    vec3.scale(this._vPan, this._vPan, distance); // WARN: camera left is positive x
    vec3.add(this._panOffset, this._panOffset, this._vPan);

  }

  /**
   * 向右平移
   * @private
   */
  panUp(distance, worldMatrix) {

    vec3.set(this._vPan, worldMatrix[4], worldMatrix[5], worldMatrix[6]);
    vec3.scale(this._vPan, this._vPan, distance);
    vec3.add(this._panOffset, this._panOffset, this._vPan);

  }

  /**
   * 平移
   * @property {Number} deltaX x方向的平移量，屏幕距离
   * @property {Number} deltaY y方向的平移量，屏幕距离
   */
  pan(deltaX, deltaY) {

    const element = this.domElement === document ? this.domElement.body : this.domElement as HTMLElement;

    // perspective only
    const position = this.camera.position;
    vec3.copy(this._vPan, position);
    vec3.sub(this._vPan, this._vPan, this.target);
    let targetDistance = vec3.len(this._vPan);

    targetDistance *= (this.fov / 2) * (Math.PI / 180);

    this.panLeft(2 * deltaX * (targetDistance / element.clientHeight), this.camera.getModelMatrix());
    this.panUp(2 * deltaY * (targetDistance / element.clientHeight), this.camera.getModelMatrix());

  }

  /**
   * 放大
   * @private
   */
  zoomIn(zoomScale) {

    // perspective only
    this._scale *= zoomScale;

  }

  /**
   * 缩小
   * @private
   */
  zoomOut(zoomScale) {

    // perspective only
    this._scale /= zoomScale;

  }

  /**
   * 鼠标点击时旋转参数更新
   * @private
   */
  handleMouseDownRotate(event) {

    vec2.set(this._rotateStart, event.clientX, event.clientY);

  }

  /**
   * 鼠标点击时缩放参数更新
   * @private
   */
  handleMouseDownZoom(event) {

    vec2.set(this._zoomStart, event.clientX, event.clientY);

  }

  /**
   * 鼠标点击时平移参数更新
   * @private
   */
  handleMouseDownPan(event) {

    vec2.set(this._panStart, event.clientX, event.clientY);

  }

  /**
   * 鼠标移动时旋转参数更新
   * @private
   */
  handleMouseMoveRotate(event) {

    vec2.set(this._rotateEnd, event.clientX, event.clientY);
    vec2.sub(this._rotateDelta, this._rotateEnd, this._rotateStart);

    const element = this.domElement === document ? document.body : this.domElement as HTMLElement;

    this.rotateLeft(2 * Math.PI * (this._rotateDelta[0] / element.clientWidth) * this.rotateSpeed);
    this.rotateUp(2 * Math.PI * (this._rotateDelta[1] / element.clientHeight) * this.rotateSpeed);

    vec2.copy(this._rotateStart, this._rotateEnd);

  }

  /**
   * 鼠标移动时缩放参数更新
   * @private
   */
  handleMouseMoveZoom(event) {

    vec2.set(this._zoomEnd, event.clientX, event.clientY);
    vec2.sub(this._zoomDelta, this._zoomEnd, this._zoomStart);

    if (this._zoomDelta[1] > 0) {

      this.zoomOut(this.getZoomScale());

    } else if (this._zoomDelta[1] < 0) {

      this.zoomIn(this.getZoomScale());

    }

    vec2.copy(this._zoomStart, this._zoomEnd);

  }

  /**
   * 鼠标移动时平移参数更新
   * @private
   */
  handleMouseMovePan(event: MouseEvent): void {

    vec2.set(this._panEnd, event.clientX, event.clientY);
    vec2.sub(this._panDelta, this._panEnd, this._panStart);

    this.pan(this._panDelta[0], this._panDelta[1]);

    vec2.copy(this._panStart, this._panEnd);

  }

  /**
   * 鼠标滚轮滚动时缩放参数更新
   * @private
   */
  handleMouseWheel(event: MouseWheelEvent): void {

    if (event.deltaY < 0) {

      this.zoomIn(this.getZoomScale());

    } else if (event.deltaY > 0) {

      this.zoomOut(this.getZoomScale());

    }

  }

  /**
   * 键盘按下时平移参数更新
   * @private
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
   * 触摸落下时旋转参数更新
   * @private
   */
  handleTouchStartRotate(event: TouchEvent) {

    vec2.set(this._rotateStart, event.touches[0].pageX, event.touches[0].pageY);

  }

  /**
   * 触摸落下时缩放参数更新
   * @private
   */
  handleTouchStartZoom(event: TouchEvent) {

    const dx = event.touches[0].pageX - event.touches[1].pageX;
    const dy = event.touches[0].pageY - event.touches[1].pageY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    vec2.set(this._zoomStart, 0, distance);

  }

  /**
   * 触摸落下时平移参数更新
   * @private
   */
  handleTouchStartPan(event: TouchEvent) {

    vec2.set(this._panStart, event.touches[0].pageX, event.touches[0].pageY);

  }

  /**
   * 触摸移动时旋转参数更新
   * @private
   */
  handleTouchMoveRotate(event: TouchEvent) {

    vec2.set(this._rotateEnd, event.touches[0].pageX, event.touches[0].pageY);
    vec2.sub(this._rotateDelta, this._rotateEnd, this._rotateStart);

    const element = this.domElement === document ? this.domElement.body : this.domElement as HTMLElement;

    this.rotateLeft(2 * Math.PI * this._rotateDelta[0] / element.clientWidth * this.rotateSpeed);
    this.rotateUp(2 * Math.PI * this._rotateDelta[1] / element.clientHeight * this.rotateSpeed);

    vec2.copy(this._rotateStart, this._rotateEnd);

  }

  /**
   * 触摸移动时缩放参数更新
   * @private
   */
  handleTouchMoveZoom(event) {

    const dx = event.touches[0].pageX - event.touches[1].pageX;
    const dy = event.touches[0].pageY - event.touches[1].pageY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    vec2.set(this._zoomEnd, 0, distance);

    vec2.sub(this._zoomDelta, this._zoomEnd, this._zoomStart);

    if (this._zoomDelta[1] > 0) {

      this.zoomIn(this.getZoomScale());

    } else if (this._zoomDelta[1] < 0) {

      this.zoomOut(this.getZoomScale());

    }

    vec2.copy(this._zoomStart, this._zoomEnd);

  }

  /**
   * 触摸移动时平移参数更新
   * @private
   */
  handleTouchMovePan(event: TouchEvent) {

    vec2.set(this._panEnd, event.touches[0].pageX, event.touches[0].pageY);

    vec2.sub(this._panDelta, this._panEnd, this._panStart);

    this.pan(this._panDelta[0], this._panDelta[1]);

    vec2.copy(this._panStart, this._panEnd);

  }

  /**
   * 鼠标按下事件总处理
   * @private
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
   * 鼠标移动事件总处理
   * @private
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
   * 鼠标抬起事件总处理
   * @private
   */
  onMouseUp() {

    if (this.enabled === false) return;

    this._isMouseUp = true;

    this.mouseUpEvents.forEach(ele => {

      this.mainElement.removeEventListener(ele.type, ele.listener, false);

    });

    this._state = this.STATE.NONE;

  }

  /**
   * 鼠标滚轮滚动事件处理
   * @private
   */
  onMouseWheel(event: MouseWheelEvent) {

    if (this.enabled === false || this.enableZoom === false || (this._state !== this.STATE.NONE && this._state !== this.STATE.ROTATE)) return;

    event.preventDefault();
    event.stopPropagation();

    this.handleMouseWheel(event);

  }

  /**
   * 键盘按下事件总处理
   * @private
   */
  onKeyDown(event: KeyboardEvent) {

    if (this.enabled === false || this.enableKeys === false || this.enablePan === false) return;

    this.handleKeyDown(event);

  }

  /**
   * 触摸按下事件总处理
   * @private
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
   * 触摸移动事件总处理
   * @private
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
   * 触摸抬起事件总处理
   * @private
   */
  onTouchEnd() {

    if (this.enabled === false) return;

    this._isMouseUp = true;
    this._state = this.STATE.NONE;

  }

  /**
   * 上下文事件隐藏
   * @private
   */
  onContextMenu(event) {

    if (this.enabled === false) return;
    event.preventDefault();

  }

}
