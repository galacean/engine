import { Entity, Logger, MathUtil, Script, Spherical, Vector3 } from "oasis-engine";
// import { doTransform, Easing, Tween } from "@oasis-engine/tween";

// 防止万向锁
const ESP = MathUtil.zeroTolerance;

function includes(array, ...filterArray) {
  return filterArray.some((e) => array.indexOf(e) !== -1);
}

// const tween = new Tween();

/**
 * 相机的的漫游控制器，可以上下左右位移，转转视角。
 */
export class FreeControl extends Script {
  _forward = new Vector3();
  _right = new Vector3();
  camera: Entity;
  mainElement: any;
  domElement: any;

  /** 每秒运动距离，单位为MVP转换前的单位
   * @member {number}
   * */
  movementSpeed: number;

  /** 一个canvas的高宽度旋转Math.PI* this.rotateSpeed
   * @member {number}
   * */
  rotateSpeed: number;

  /** 模拟一个地面用来jump，替代碰撞体
   * @member {boolean}
   * */
  floorMock: boolean;

  /** 模拟地面高度
   * @member {number}
   * */
  floorY: number;

  /**
   * the heightY jump to
   * @member {number}
   * */
  jumpY: number;

  /**
   * the amount of the jumping time, jumpUpDuration+jumpDownDuration
   * unit:ms
   * @member {number}
   * */
  jumpDuration: number;

  /** only rotate when press=true
   * @member {boolean}
   * */
  press: boolean;
  keysForward: Array<string | number>;
  keysBackward: Array<string | number>;
  keysLeft: Array<string | number>;
  keysRight: Array<string | number>;
  keysJump: Array<string | number>;

  /**
   * radian of spherical.theta
   * @member {number}
   * */
  private _theta: number;

  /**
   * radian of spherical.phi
   * @member {number}
   * */
  private _phi: number;

  private _moveForward: boolean;
  private _moveBackward: boolean;
  private _moveLeft: boolean;
  private _moveRight: boolean;
  private _moveJump: boolean;

  private _v3Cache: Vector3;
  private _spherical: Spherical;
  private _rotateOri: Array<number>;
  private _events: Array<{ type: string; listener: () => {}; element?: any }>;

  /**
   * 漫游控制器构造函数
   * @param {Entity} entity 挂载节点
   */
  constructor(entity: Entity) {
    super(entity);
    this.camera = entity;
    //@ts-ignore @todo 未来移除对html元素的依赖，通过封装引擎的input实现
    this.mainElement = this.scene.engine.canvas._webCanvas;
    this.domElement = document;

    if (!(this.mainElement instanceof HTMLCanvasElement)) {
      Logger.warn("AFreeControls must have a legal mainElement");
      return null;
    }
    this.movementSpeed = 1.0;
    this.rotateSpeed = 1.0;

    this.floorMock = true;
    this.floorY = 0;

    this.jumpY = 1;
    this.jumpDuration = 600;

    this.press = false;

    this.keysForward = ["KeyW", "ArrowUp"];
    this.keysBackward = ["KeyS", "ArrowDown"];
    this.keysLeft = ["KeyA", "ArrowLeft"];
    this.keysRight = ["KeyD", "ArrowRight"];
    this.keysJump = ["Space"];

    this._theta = 0;
    this._phi = 0;

    // private variables
    this._moveForward = false;
    this._moveBackward = false;
    this._moveLeft = false;
    this._moveRight = false;
    this._moveJump = false;

    this._v3Cache = new Vector3();
    this._spherical = new Spherical();
    this._rotateOri = [0, 0];

    this._events = [
      { type: "mousemove", listener: this.onMouseMove.bind(this) },
      { type: "touchmove", listener: this.onMouseMove.bind(this) },
      { type: "mousedown", listener: this.onMouseDown.bind(this) },
      { type: "touchstart", listener: this.onMouseDown.bind(this) },
      { type: "mouseup", listener: this.onMouseUp.bind(this) },
      { type: "touchend", listener: this.onMouseUp.bind(this) },
      { type: "keydown", listener: this.onKeyDown.bind(this), element: window },
      { type: "keyup", listener: this.onKeyUp.bind(this), element: window },
      { type: "contextmenu", listener: this.onContextMenu.bind(this) }
    ];

    this.initEvents();

    // init spherical
    this.updateSpherical();
  }

  /**
   * 浏览器右键事件
   * @private
   * */
  onContextMenu(event): void {
    event.preventDefault();
  }

  /**
   * 键盘按下事件
   * @private
   * */
  onKeyDown(event): void {
    const { code, key, keyCode } = event;
    if (includes(this.keysForward, code, key, keyCode)) {
      this._moveForward = true;
    } else if (includes(this.keysBackward, code, key, keyCode)) {
      this._moveBackward = true;
    } else if (includes(this.keysLeft, code, key, keyCode)) {
      this._moveLeft = true;
    } else if (includes(this.keysRight, code, key, keyCode)) {
      this._moveRight = true;
    }
    // else if (includes(this.keysJump, code, key, keyCode)) {
    //   this.jump();
    // }
  }

  /**
   * 键盘抬起事件
   * @private
   * */
  onKeyUp(event): void {
    const { code, key, keyCode } = event;
    if (includes(this.keysForward, code, key, keyCode)) {
      this._moveForward = false;
    } else if (includes(this.keysBackward, code, key, keyCode)) {
      this._moveBackward = false;
    } else if (includes(this.keysLeft, code, key, keyCode)) {
      this._moveLeft = false;
    } else if (includes(this.keysRight, code, key, keyCode)) {
      this._moveRight = false;
    }
  }

  /**
   * 手势按下事件
   * @private
   * */
  onMouseDown(event): void {
    event.stopPropagation();
    event = (event.changedTouches && event.changedTouches[0]) || event;

    if (this.domElement !== document) {
      this.domElement.focus();
    }

    this.press = true;
    this._rotateOri = [event.clientX, event.clientY];
  }

  /**
   * 手势抬起事件
   * @private
   * */
  onMouseUp(event): void {
    event.preventDefault();
    event.stopPropagation();

    this.press = false;
  }

  /**
   * 手势滑动事件
   * @private
   * */
  onMouseMove(event): void {
    if (this.press === false) return;
    if (this.enabled === false) return;

    event.preventDefault();
    event.stopPropagation();
    event = (event.changedTouches && event.changedTouches[0]) || event;

    const movementX = event.clientX - this._rotateOri[0];
    const movementY = event.clientY - this._rotateOri[1];
    this._rotateOri[0] = event.clientX;
    this._rotateOri[1] = event.clientY;
    const factorX = 180 / this.mainElement.width;
    const factorY = 180 / this.mainElement.height;
    const actualX = movementX * factorX;
    const actualY = movementY * factorY;

    this.rotate(-actualX, actualY);
  }

  /**
   * 分别绕y轴，x轴旋转的角度
   * unit:deg
   * @param {number} alpha - 绕y轴旋转的deg
   * @param {number} beta - 绕x轴旋转的deg
   * */
  rotate(alpha: number = 0, beta: number = 0): void {
    this._theta += MathUtil.degreeToRadian(alpha);
    this._phi += MathUtil.degreeToRadian(beta);
    this._phi = MathUtil.clamp(this._phi, ESP, Math.PI - ESP);
    this._spherical.theta = this._theta;
    this._spherical.phi = this._phi;
    this._spherical.setToVec3(this._v3Cache);
    Vector3.add(this.camera.transform.position, this._v3Cache, this._v3Cache);
    this.camera.transform.lookAt(this._v3Cache, new Vector3(0, 1, 0));
  }

  /**
   * 跳跃，根据jumpY确定高度，jumpDuration确定时间，floorY确定地面高度
   * */
  jump(): void {
    // if (this._moveJump) return;
    // this._moveJump = true;
    // let p = this.camera.position;
    // doTransform
    //   .Translate(this.camera, new Vector3(p.x, this.jumpY, p.z), this.jumpDuration / 2, {
    //     easing: Easing.easeOutSine,
    //     onComplete: () => {
    //       doTransform
    //         .Translate(this.camera, new Vector3(p.x, this.floorY, p.z), this.jumpDuration / 2, {
    //           easing: Easing.easeInSine,
    //           onComplete: () => {
    //             this._moveJump = false;
    //           }
    //         })
    //         .start(tween);
    //     }
    //   })
    //   .start(tween);
  }

  /**
   * transform vec3 on axis by distance
   * */
  translateOnAxis(axis: Readonly<Vector3>, distance: number, v3: Readonly<Vector3> = this.camera.position): void {
    const diff: Vector3 = new Vector3();
    Vector3.normalize(axis, diff);
    v3.add(diff.scale(distance));
  }

  private tempVec3 = new Vector3();

  /**
   * @override
   * translate camera per tick
   * @param  delta - tick gap
   * */
  onUpdate(delta: number): void {
    if (this.enabled === false) return;

    const actualMoveSpeed = (delta / 1000) * this.movementSpeed;
    this.camera.transform.getWorldForward(this._forward);
    this.camera.transform.getWorldRight(this._right);
    if (this._moveForward) {
      this.translateOnAxis(this._forward, actualMoveSpeed);
    }
    if (this._moveBackward) {
      this.translateOnAxis(this._forward, -actualMoveSpeed);
    }
    if (this._moveLeft) {
      this.translateOnAxis(this._right, -actualMoveSpeed);
    }
    if (this._moveRight) {
      this.translateOnAxis(this._right, actualMoveSpeed);
    }

    // tween.update(delta);
    const position = this.camera.transform.position;

    if (this.floorMock && !this._moveJump) {
      // this.camera.position[1] = this.floorY;

      // const pos = this.camera.transform.position;
      position.setValue(position.x, this.floorY, position.z);
      this.camera.transform.position = position;
    }
  }

  /**注册浏览器事件*/
  initEvents(): void {
    this._events.forEach((ele) => {
      if (ele.element) {
        ele.element.addEventListener(ele.type, ele.listener, false);
      } else {
        this.mainElement.addEventListener(ele.type, ele.listener, false);
      }
    });
  }

  /**
   * dispose all events
   * */
  destroy(): void {
    this._events.forEach((ele) => {
      if (ele.element) {
        ele.element.removeEventListener(ele.type, ele.listener, false);
      } else {
        this.mainElement.removeEventListener(ele.type, ele.listener, false);
      }
    });
    super.destroy();
  }

  /**
   * must updateSpherical after quaternion has been changed
   * @example
   * Entity#lookAt([0,1,0],[0,1,0]);
   * AFreeControls#updateSpherical();
   * */
  updateSpherical(): void {
    this._v3Cache.setValue(0, 0, -1);
    Vector3.transformByQuat(this._v3Cache, this.camera.rotation, this._v3Cache);
    this._spherical.setFromVec3(this._v3Cache);
    this._theta = this._spherical.theta;
    this._phi = this._spherical.phi;
  }
}
