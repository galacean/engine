import { Entity, MathUtil, Script, Spherical, Vector3 } from "oasis-engine";

// Prevent universal lock.
const ESP = MathUtil.zeroTolerance;

function includes(array, ...filterArray) {
  return filterArray.some((e) => array.indexOf(e) !== -1);
}

/**
 * The camera's roaming controller, can move up and down, left and right, and rotate the viewing angle.
 */
export class FreeControl extends Script {
  _forward = new Vector3();
  _right = new Vector3();
  camera: Entity;
  mainElement: any;
  domElement: any;

  /**
   * Movement distance per second, the unit is the unit before MVP conversion.
   */
  movementSpeed: number;

  /**
   * Rotate speed.
   */
  rotateSpeed: number;

  /**
   * Simulate a ground.
   */
  floorMock: boolean;

  /**
   * Simulated ground height.
   */
  floorY: number;

  /**
   * Only rotate when press=true
   */
  press: boolean;
  keysForward: Array<string | number>;
  keysBackward: Array<string | number>;
  keysLeft: Array<string | number>;
  keysRight: Array<string | number>;

  /**
   * Radian of spherical.theta.
   */
  private _theta: number;

  /**
   * Radian of spherical.phi.
   */
  private _phi: number;

  private _moveForward: boolean;
  private _moveBackward: boolean;
  private _moveLeft: boolean;
  private _moveRight: boolean;

  private _v3Cache: Vector3;
  private _spherical: Spherical;
  private _rotateOri: Array<number>;
  private _events: Array<{ type: string; listener: () => {}; element?: any }>;

  constructor(entity: Entity) {
    super(entity);
    this.camera = entity;
    // @ts-ignore
    // @todo In the future, the dependence on html elements will be removed and realized through the input of the packaging engine.
    this.mainElement = this.scene.engine.canvas._webCanvas;
    this.domElement = document;

    this.movementSpeed = 1.0;
    this.rotateSpeed = 1.0;

    this.floorMock = true;
    this.floorY = 0;

    this.press = false;

    this.keysForward = ["KeyW", "ArrowUp"];
    this.keysBackward = ["KeyS", "ArrowDown"];
    this.keysLeft = ["KeyA", "ArrowLeft"];
    this.keysRight = ["KeyD", "ArrowRight"];

    this._theta = 0;
    this._phi = 0;

    // private variables
    this._moveForward = false;
    this._moveBackward = false;
    this._moveLeft = false;
    this._moveRight = false;

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
   * Browser right click event.
   */
  onContextMenu(event): void {
    event.preventDefault();
  }

  /**
   * Keyboard press event.
   */
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
  }

  /**
   * Keyboard up event.
   */
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
   * Mouse press event.
   */
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
   * Mouse up event.
   */
  onMouseUp(event): void {
    event.preventDefault();
    event.stopPropagation();

    this.press = false;
  }

  /**
   * Mouse movement event.
   */
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
   * The angle of rotation around the y axis and the x axis respectively.
   * @param alpha - Radian to rotate around the y axis
   * @param beta - Radian to rotate around the x axis
   */
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

  onUpdate(delta: number): void {
    if (this.enabled === false) return;

    const actualMoveSpeed = (delta / 1000) * this.movementSpeed;
    this.camera.transform.getWorldForward(this._forward);
    this.camera.transform.getWorldRight(this._right);

    if (this._moveForward) {
      this.camera.transform.translate(this._forward.scale(actualMoveSpeed), false);
    }
    if (this._moveBackward) {
      this.camera.transform.translate(this._forward.scale(-actualMoveSpeed), false);
    }
    if (this._moveLeft) {
      this.camera.transform.translate(this._right.scale(-actualMoveSpeed), false);
    }
    if (this._moveRight) {
      this.camera.transform.translate(this._right.scale(actualMoveSpeed), false);
    }

    if (this.floorMock) {
      const position = this.camera.transform.position;
      if (position.y !== this.floorY) {
        this.camera.transform.setPosition(position.x, this.floorY, position.z);
      }
    }
  }

  /**
   * Register browser events.
   */
  initEvents(): void {
    this._events.forEach((ele) => {
      if (ele.element) {
        ele.element.addEventListener(ele.type, ele.listener, false);
      } else {
        this.mainElement.addEventListener(ele.type, ele.listener, false);
      }
    });
  }

  onDestroy(): void {
    this._events.forEach((ele) => {
      if (ele.element) {
        ele.element.removeEventListener(ele.type, ele.listener, false);
      } else {
        this.mainElement.removeEventListener(ele.type, ele.listener, false);
      }
    });
  }

  /**
   * must updateSpherical after quaternion has been changed
   * @example
   * Entity#lookAt([0,1,0],[0,1,0]);
   * AFreeControls#updateSpherical();
   */
  updateSpherical(): void {
    this._v3Cache.setValue(0, 0, -1);
    Vector3.transformByQuat(this._v3Cache, this.camera.rotation, this._v3Cache);
    this._spherical.setFromVec3(this._v3Cache);
    this._theta = this._spherical.theta;
    this._phi = this._spherical.phi;
  }
}
