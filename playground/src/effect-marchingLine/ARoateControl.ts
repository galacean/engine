import { NodeAbility } from '@alipay/o3-core';
import { quat, vec2, vec3, MathUtil } from "@alipay/o3-math";

export class ARoateControl extends NodeAbility {
  constructor(node, props) {
    super(node);

    this.camera = node;
    this.canvas = props.canvas;
    this.domElement = props.domElement || document;

    // 目标点
    this.target = vec3.create();

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
    this.minAzimuthAngle = - Infinity;
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
    this._scale = 1;
    this._isMouseUp = true;

    // state
    this._rotateStart = vec2.create();
    this._rotateEnd = vec2.create();
    this._rotateDelta = vec2.create();

    this._spherical = { theta: 0, phi: 0 };
    this._sphericalDelta = { theta: 0, phi: 0 };
    this._sphericalDump = { theta: 0, phi: 0 };

    //
    this._rotation = quat.create();
    this._rotationDelta = quat.create();

    this.STATE = {
      NONE: - 1, ROTATE: 0, ZOOM: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_ZOOM: 4, TOUCH_PAN: 5,
    };
    this._state = this.STATE.NONE;

    this.constEvents = [
      { type: 'mousedown', listener: this.onMouseDown.bind( this ) },
      { type: 'touchstart', listener: this.onTouchStart.bind( this ) },
      { type: 'touchmove', listener: this.onTouchMove.bind( this ) },
      { type: 'touchend', listener: this.onTouchEnd.bind( this ) },
      { type: 'contextmenu', listener: this.onContextMenu.bind( this ) },
    ];

    this.mouseUpEvents = [
      { type: 'mousemove', listener: this.onMouseMove.bind( this ) },
      { type: 'mouseup', listener: this.onMouseUp.bind( this ) },
    ];

    this.constEvents.forEach( ele => {

      if( ele.element ) {

        ele.element.addEventListener( ele.type, ele.listener, false );

      } else {

        this.canvas.addEventListener( ele.type, ele.listener, false );

      }

    } );
  }

  /**
   * 销毁，释放事件监听
   * @private
   */
  destroy() {

    this.constEvents.forEach( ele => {

      if( ele.element ) {

        ele.element.removeEventListener( ele.type, ele.listener, false );

      } else {

        this.canvas.removeEventListener( ele.type, ele.listener, false );

      }

    } );
    const element = this.domElement === document ? this.domElement.body : this.domElement;
    this.canvas.removeEventListener( this.mouseUpEvents[0].type, this.mouseUpEvents[0].listener, false );
    element.removeEventListener( this.mouseUpEvents[1].type, this.mouseUpEvents[1].listener, false );
    super.destroy();

  }

  /**
   * 在触屏上用单指控制旋转，三指控制平移
   */
  setOneFingerRotate() {

    this.touchFingers.ORBIT = 1;

  }

  update(deltaTime) {

    // this._spherical.theta += this._sphericalDelta.theta;
    // this._spherical.phi += this._sphericalDelta.phi;
    //
    // this._spherical.theta = Math.max( this.minAzimuthAngle, Math.min( this.maxAzimuthAngle, this._spherical.theta ) );
    // this._spherical.phi = Math.max( this.minPolarAngle, Math.min( this.maxPolarAngle, this._spherical.phi ) );
    // this._spherical.phi = Math.max( MathUtil.EPSILON, Math.min( Math.PI - MathUtil.EPSILON, this._spherical.phi ) );


    if (this._sphericalDelta.theta !== 0 || this._sphericalDelta.phi !== 0) {
      const m = this.node.getModelMatrix();
      const vx = vec3.fromValues( m[0], m[4], m[8] );
      const vy = vec3.fromValues( m[1], m[5], m[9] );

      quat.copy(this._rotation, this.node.rotation);

      const rot = this._rotationDelta;
      quat.setAxisAngle( rot, vx, -this._sphericalDelta.phi );
      quat.multiply( this._rotation, this._rotation, rot );

      quat.setAxisAngle( rot, vy, -this._sphericalDelta.theta );
      quat.multiply( this._rotation, this._rotation, rot );
      quat.normalize(this._rotation, this._rotation);
      this.node.rotation = this._rotation;

      this._sphericalDelta.theta = 0;
      this._sphericalDelta.phi = 0;
    }

  }

  /**
   * 获取自动旋转的弧度
   * @private
   */
  getAutoRotationAngle( dtime ) {

    return 2 * Math.PI / this.autoRotateSpeed / 1000 * dtime;

  }

  /**
   * 向左旋转一定弧度
   * @property {Number} radian 旋转的弧度值
   */
  rotateLeft( radian ) {

    this._sphericalDelta.theta -= radian;
    if( this.enableDamping ) {

      this._sphericalDump.theta = - radian;

    }

  }

  /**
   * 向上旋转一定弧度
   * @property {Number} radian 旋转的弧度值
   */
  rotateUp( radian ) {

    this._sphericalDelta.phi -= radian;
    if( this.enableDamping ) {

      this._sphericalDump.phi = - radian;

    }

  }

  /**
   * 鼠标点击时旋转参数更新
   * @private
   */
  handleMouseDownRotate( event ) {

    vec2.set( this._rotateStart, event.clientX, event.clientY );

  }


  /**
   * 鼠标移动时旋转参数更新
   * @private
   */
  handleMouseMoveRotate( event ) {

    vec2.set( this._rotateEnd, event.clientX, event.clientY );
    vec2.sub( this._rotateDelta, this._rotateEnd, this._rotateStart );

    const element = this.domElement === document ? document.body : this.domElement;

    this.rotateLeft( 2 * Math.PI * ( this._rotateDelta[0] / element.clientWidth ) * this.rotateSpeed );
    this.rotateUp( 2 * Math.PI * ( this._rotateDelta[1] / element.clientHeight ) * this.rotateSpeed );

    vec2.copy( this._rotateStart, this._rotateEnd );

  }

  /**
   * 触摸落下时旋转参数更新
   * @private
   */
  handleTouchStartRotate( event ) {

    vec2.set( this._rotateStart, event.touches[0].pageX, event.touches[0].pageY );

  }

  /**
   * 触摸移动时旋转参数更新
   * @private
   */
  handleTouchMoveRotate( event ) {

    vec2.set( this._rotateEnd, event.touches[0].pageX, event.touches[0].pageY );
    vec2.sub( this._rotateDelta, this._rotateEnd, this._rotateStart );

    const element = this.domElement === document ? this.domElement.body : this.domElement;

    this.rotateLeft( 2 * Math.PI * this._rotateDelta[0] / element.clientWidth * this.rotateSpeed );
    this.rotateUp( 2 * Math.PI * this._rotateDelta[1] / element.clientHeight * this.rotateSpeed );

    vec2.copy( this._rotateStart, this._rotateEnd );

  }

  /**
   * 鼠标按下事件总处理
   * @private
   */
  onMouseDown( event ) {

    if( this.enabled === false ) return;

    event.preventDefault();

    this._isMouseUp = false;

    switch( event.button ) {

      case this.mouseButtons.ORBIT:
        if( this.enableRotate === false ) return;

        this.handleMouseDownRotate( event );
        this._state = this.STATE.ROTATE;
        break;

    }

    if( this._state !== this.STATE.NONE ) {

      const element = this.domElement === document ? this.domElement.body : this.domElement;
      this.canvas.addEventListener( this.mouseUpEvents[0].type, this.mouseUpEvents[0].listener, false );
      element.addEventListener( this.mouseUpEvents[1].type, this.mouseUpEvents[1].listener, false );

    }

  }

  /**
   * 鼠标移动事件总处理
   * @private
   */
  onMouseMove( event ) {

    if( this.enabled === false ) return;

    event.preventDefault();

    switch( this._state ) {

      case this.STATE.ROTATE:
        if( this.enableRotate === false ) return;

        this.handleMouseMoveRotate( event );
        break;

    }

  }

  /**
   * 鼠标抬起事件总处理
   * @private
   */
  onMouseUp() {

    if( this.enabled === false ) return;

    this._isMouseUp = true;

    this.mouseUpEvents.forEach( ele => {

      this.canvas.removeEventListener( ele.type, ele.listener, false );

    } );

    this._state = this.STATE.NONE;

  }

  /**
   * 触摸按下事件总处理
   * @private
   */
  onTouchStart( event ) {

    if( this.enabled === false ) return;

    this._isMouseUp = false;

    switch( event.touches.length ) {

      case this.touchFingers.ORBIT:
        if ( this.enableRotate === false ) return;

        this.handleTouchStartRotate( event );
        this._state = this.STATE.TOUCH_ROTATE;

        break;

      default:
        this._state = this.STATE.NONE;

    }

  }

  /**
   * 触摸移动事件总处理
   * @private
   */
  onTouchMove( event ) {

    if( this.enabled === false ) return;

    event.preventDefault();
    event.stopPropagation();

    switch( event.touches.length ) {

      case this.touchFingers.ORBIT:
        if( this.enableRotate === false ) return;
        if( this._state !== this.STATE.TOUCH_ROTATE ) return;
        this.handleTouchMoveRotate( event );

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

    if( this.enabled === false ) return;

    this._isMouseUp = true;
    this._state = this.STATE.NONE;

  }

  /**
   * 上下文事件隐藏
   * @private
   */
  onContextMenu( event ) {

    if( this.enabled === false ) return;
    event.preventDefault();

  }
}
