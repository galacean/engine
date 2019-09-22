import {
  UniformSemantic,
  DataType,
  DrawMode,
  BufferUsage,
  BlendFunc,
  RenderState,
  MaterialType,
  TextureWrapMode,
} from '@alipay/o3-base';
import { Material, RenderTechnique } from '@alipay/o3-material';
import { AGeometryRenderer, BufferGeometry } from '@alipay/o3-geometry';
import { vec3 } from '@alipay/o3-math';


/**
 * GPU粒子系统渲染类
 * @extends AGeometryRenderer
 */
export class AGPUParticleSystem extends AGeometryRenderer {
  private _cursor: number;
  private _rand: any[];
  private _randomIndex: number;
  private _time: number;
  private _sleepedCount: number;
  private _myActive: boolean;
  private _isInit: boolean;
  private once: boolean;
  private geometry: BufferGeometry;
  public DPR: number;
  public maxCount: number;
  public spawnCount: number;
  private _sleepFrameCount: number;
  public intervalFrameCount: number;
  public options: {};
  public getOptions: any;
  public rotateToVelocity: boolean;
  public blendFunc: number[];
  public blendFuncSeparate: number[];
  public useOriginColor: boolean;
  public fragmentShader: string;
  public vertexShader: string;
  public particleTex;
  public fadeIn: boolean;
  public particleMaskTex;
  public isScaleByLifetime: boolean;
  public scaleFactor: number;

  /**
   * @constructor
   * @param {Node} node 节点对象
   */
  constructor(node) {

    super(node);
    this._cursor = 0; // 粒子指针
    this._rand = []; // 随机数数组
    this._randomIndex = 0; // 随机数指针
    this._time = 0; // 渲染时间，单位秒
    this._sleepedCount = 0; // 睡眠帧数
    this._isInit = false; // 是否完成初始化
    this._myActive = false; // 是否激活发射模块
    this.DPR = window.devicePixelRatio; // 精度系数

  }

  /**
   * 粒子发射参数
   * @typedef {Object} ParticleParam
   * @property {Array/Vec3} position 位置，默认[0, 0, 0]
   * @property {Array/Vec3} velocity 速度，默认[0, 0, 0]
   * @property {Array/Vec3} acceleration 加速度，默认[0, 0, 0]
   * @property {Array/number} color  颜色，默认[1, 1, 1]，范围 0 ~ 1
   * @property {number} size  大小，默认 10，范围  >0
   * @property {number} startAngle  初始旋转角度，默认0，范围 0 ~ 2*PI
   * @property {number} rotateRate  自转旋转角速率，默认0
   * @property {number} lifetime  生命周期，默认5，范围  >0
   * @property {Array/number} positionRandomness  位置随机因子，默认[0,0,0]，范围  >0
   * @property {Array/number} velocityRandomness  速度随机因子，默认[0, 0, 0]，范围  >0
   * @property {Array/number} accelerationRandomness  加速度随机因子，默认[0, 0, 0]，范围  >0
   * @property {number} colorRandomness  颜色随机因子，默认0，范围  0 ~ 1
   * @property {number} sizeRandomness  大小随机因子，默认0，范围  0 ~ 1
   * @property {number} startAngleRandomness  初始旋转角度随机因子，默认0，范围 0 ~ 1
   * @property {number} rotateRateRandomness  自转旋转角速率随机因子，默认0，范围   >0
   */

  /**
   * 初始化
   * @param {ParticleProps} props 初始化参数
   * @param {number} [ParticleProps.maxCount = 1000] 最大粒子数
   * @param {number} [ParticleProps.spawnCount = maxCount / 10] 每帧发射粒子数
   * @param {boolean} [ParticleProps.once = false] 是否只发射一帧, 默认
   * @param {number} [ParticleProps.intervalFrameCount = 0] 发射粒子间隔帧数
   * @param {ParticleParam} [ParticleProps.options] 发射参数
   * @param {Function} [ParticleProps.getOptions] 获取更新参数（每帧回调）
   * @param {boolean} [ParticleProps.rotateToVelocity] 是否跟随粒子运动速度的方向。
   * @param {Array} [ParticleProps.blendFunc] webgl 混合因子，默认透明度混合 [SRC_ALPHA, ONE_MINUS_SRC_ALPHA]
   * @param {Array} [ParticleProps.blendFuncSeparate] webgl 混合因子alpha通道分离，优先级高于blendFunc，如无指定使用blendFunc
   * @param {boolean} [ParticleProps.useOriginColor = true] 是否使用图片原色: true(使用图片原色)、 false(图片原色混合生成的颜色)
   * @param {string} [ParticleProps.fragmentShader] 自定义片元着色器
   * @param {string} [ParticleProps.vertexShader] 自定义定点着色器
   * @param {Texture} [ParticleProps.texture] 粒子贴图
   * @param {Texture} [ParticleProps.maskTexture] 粒子遮罩贴图
   * @param {boolean} [ParticleProps.isScaleByLifetime = false] 是否随生命周期缩小至消失
   * @param {boolean} [ParticleProps.fadeIn = false] 是否添加淡入效果
   * @param {number} [ParticleProps.scaleFactor = 1] 粒子随时间scale参数
   */

  initialize(props) {
    this.maxCount = props.maxCount !== undefined ? props.maxCount : 1000;
    this.spawnCount = props.spawnCount !== undefined ? props.spawnCount : Math.floor(this.maxCount / 10);
    this._sleepFrameCount = this.spawnCount > 1 ? 0 : 1 / this.spawnCount;
    this.intervalFrameCount = props.intervalFrameCount || 0;
    this.once = props.once || false;
    this.options = props.options || {};
    this.getOptions = props.getOptions;
    this.rotateToVelocity = props.rotateToVelocity || false;
    if (props.blendFuncSeparate) {
      this.blendFuncSeparate = props.blendFuncSeparate;
    }
    this.blendFunc = props.blendFunc || [BlendFunc.SRC_ALPHA, BlendFunc.ONE_MINUS_SRC_ALPHA];
    this.useOriginColor = props.useOriginColor !== undefined ? props.useOriginColor : true;
    this.fragmentShader = props.fragmentShader || null;
    this.vertexShader = props.vertexShader || null;
    this.particleTex = props.texture || null;
    this.fadeIn = props.fadeIn || false;
    this.particleMaskTex = props.maskTexture || null;
    this.isScaleByLifetime = props.isScaleByLifetime || false;
    this.scaleFactor = props.scaleFactor || 1;

    const randomCount = Math.min(this.maxCount * 2, Math.max(this.spawnCount, 1) * 360);
    this._creatRandom(randomCount);
    this.setMaterial();

    /** @private */
    this.geometry = this._createGeometry();

    this._isInit = true;
    return this;

  }

  /**
   * 更新参数
   * @param {number} deltaTime 帧间隔时间
   * @private
   */
  update(deltaTime) {

    if (!this._isInit) {

      return;

    }
    this._time += deltaTime / 1000;
    this.getMaterial().setValue('uTime', this._time);

    if (this._myActive) {

      if (this._sleepFrameCount > 0 && this._sleepedCount < this._sleepFrameCount + this.intervalFrameCount) {

        this._sleepedCount++;

      } else {

        this._sleepedCount = 0;
        const options = this.getOptions ? this.getOptions(this._time) : this.options;
        for (let x = 0; x < this.spawnCount; x++) {

          this._spawnParticle(options);

        }

      }

    }

    if (this.once) {

      this._myActive = false;

    }

  }

  /**
   * 设置粒子发射参数
   * @param {ParticleParam} options 发射参数
   */
  setOptions(options) {

    if (options !== undefined) {

      this.options = { ...this.options, ...options };

    }
    return this;

  }

  /**
   * 激活发射模块，重新开始发射 */
  start() {

    if (!this._myActive) {

      this._myActive = true;

    }

  }

  /**
   * 停止发射
   */
  stop() {

    if (this._myActive) {

      this._myActive = false;

    }

  }

  /**
   * 销毁资源
   * @private
   */
  destroy() {

    super.destroy();
    this._rand = null;
    this.options = null;
    if (this.particleTex) {

      this.particleTex = null;

    }
    if (this.particleMaskTex) {

      this.particleMaskTex = null;

    }

  }

  /**
   * 创建材质
   * @private
   */
  setMaterial() {

    const technique = this._createTechnique();
    const material = new Material('particleMaterial');
    material.technique = technique;
    material.renderType = MaterialType.TRANSPARENT;

    if (this.particleTex) {

      this.particleTex.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);
      material.setValue('particleTex', this.particleTex);

    }
    if (this.particleMaskTex) {

      this.particleMaskTex.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);
      material.setValue('particleMaskTex', this.particleMaskTex);

    }
    super.setMaterial(material);

  }

  /**
   * 创建 Technique
   * @private
   */
  _createTechnique() {

    const cfg = {
      attributes: {
        positionStart: {
          name: 'positionStart',
          semantic: 'POSITIONSTART',
          type: DataType.FLOAT_VEC3
        },
        color: {
          name: 'color',
          semantic: 'COLOR',
          type: DataType.FLOAT_VEC3
        },
        acceleration: {
          name: 'acceleration',
          semantic: 'ACCELERATION',
          type: DataType.FLOAT_VEC3
        },
        velocity: {
          name: 'velocity',
          semantic: 'VELOCITY',
          type: DataType.FLOAT_VEC3
        },
        startAngle: {
          name: 'startAngle',
          semantic: 'STARTANGLE',
          type: DataType.FLOAT
        },
        lifeTime: {
          name: 'lifeTime',
          semantic: 'LIFETIME',
          type: DataType.FLOAT
        },
        startTime: {
          name: 'startTime',
          semantic: 'STARTTIME',
          type: DataType.FLOAT
        },
        size: {
          name: 'size',
          semantic: 'SIZE',
          type: DataType.FLOAT
        },
        rotateRate: {
          name: 'rotateRate',
          semantic: 'ROTATERATE',
          type: DataType.FLOAT
        },
        scaleFactor: {
          name: 'scaleFactor',
          semantic: 'SCALEFACTOR',
          type: DataType.FLOAT
        },
      },
      uniforms: {
        uTime: {
          name: 'uTime',
          type: DataType.FLOAT
        },
        matModelViewProjection: {
          name: 'matModelViewProjection',
          semantic: UniformSemantic.MODELVIEWPROJECTION,
          type: DataType.FLOAT_MAT4,
        },
        matModelView: {
          name: 'matModelView',
          semantic: UniformSemantic.MODELVIEW,
          type: DataType.FLOAT_MAT4,
        }
      } as any,
      states: {
        enable: [RenderState.BLEND],
        functions: {
          // blendFunc: this.blendFunc,
          // todo question
          depthMask: [false]
        }
      }
    };
    if (this.blendFuncSeparate) {
      cfg.states.functions.blendFuncSeparate = this.blendFuncSeparate;
    } else {
      cfg.states.functions.blendFunc = this.blendFunc;
    }
    if (this.particleTex) {

      cfg.uniforms.particleTex = {
        name: 'particleTex',
        type: DataType.SAMPLER_2D
      };

    }
    if (this.particleMaskTex) {

      cfg.uniforms.particleMaskTex = {
        name: 'particleMaskTex',
        type: DataType.SAMPLER_2D
      };

    }

    const tech = new RenderTechnique('particleTech');
    tech.isValid = true;
    tech.uniforms = cfg.uniforms;
    tech.attributes = cfg.attributes;
    tech.states = cfg.states;
    tech.vertexShader = this._createVertexShader();
    tech.fragmentShader = this._createFragmentShader();

    return tech;

  }

  /**
   * 创建几何体
   * @private
   */
  _createGeometry() {

    const geometry = new BufferGeometry('particleGeometry');
    geometry.mode = DrawMode.POINTS;
    const FLOAT = DataType.FLOAT;
    geometry.initialize([
      { semantic: 'POSITIONSTART', size: 3, type: FLOAT, normalized: false },
      { semantic: 'VELOCITY', size: 3, type: FLOAT, normalized: false },
      { semantic: 'ACCELERATION', size: 3, type: FLOAT, normalized: false },
      { semantic: 'COLOR', size: 3, type: FLOAT, normalized: false },
      { semantic: 'SIZE', size: 1, type: FLOAT, normalized: false },
      { semantic: 'ROTATERATE', size: 1, type: FLOAT, normalized: false },
      { semantic: 'STARTTIME', size: 1, type: FLOAT, normalized: false },
      { semantic: 'LIFETIME', size: 1, type: FLOAT, normalized: false },
      { semantic: 'STARTANGLE', size: 1, type: FLOAT, normalized: false },
      { semantic: 'SCALEFACTOR', size: 1, type: FLOAT, normalized: false },
    ], this.maxCount, BufferUsage.DYNAMIC_DRAW);
    return geometry;

  }

  /**
   * 粒子发射
   * @param {Options} options
   * @private
   */
  _spawnParticle(options) {

    const position = options.position !== undefined ? vec3.clone(options.position) : vec3.fromValues(0, 0, 0);
    const positionRandomness = options.positionRandomness !== undefined ? this._get3DData(options.positionRandomness) : [0, 0, 0];
    const velocity = options.velocity !== undefined ? vec3.clone(options.velocity) : vec3.fromValues(0, 0, 0);
    const velocityRandomness = options.velocityRandomness !== undefined ? this._get3DData(options.velocityRandomness) : [0, 0, 0];
    const color = options.color !== undefined ? this._getColor(options.color) : vec3.fromValues(1, 1, 1);
    const colorRandomness = options.colorRandomness !== undefined ? options.colorRandomness : 1;
    const lifetime = options.lifetime !== undefined ? options.lifetime : 5;
    let size = options.size !== undefined ? options.size : 10;
    const sizeRandomness = options.sizeRandomness !== undefined ? options.sizeRandomness : 0;
    const smoothPosition = options.smoothPosition !== undefined ? options.smoothPosition : false;

    const acceleration = options.acceleration !== undefined ? this._get3DData(options.acceleration) : [0, 0, 0];
    const accelerationRandomness = options.accelerationRandomness !== undefined ? this._get3DData(options.accelerationRandomness) : [0, 0, 0];
    const startAngle = options.startAngle !== undefined ? options.startAngle : 0;
    const startAngleRandomness = options.startAngleRandomness !== undefined ? options.startAngleRandomness : 0;
    const rotateRate = options.rotateRate !== undefined ? options.rotateRate : 0;
    const rotateRateRandomness = options.rotateRateRandomness !== undefined ? options.rotateRateRandomness : 0;
    const scaleFactor = options.scaleFactor !== undefined ? options.scaleFactor : 1;

    if (this.DPR !== undefined) size *= this.DPR;

    const i = this._cursor;
    let x = position[0] + (this._getRandom() * positionRandomness[0]);
    let y = position[1] + (this._getRandom() * positionRandomness[1]);
    let z = position[2] + (this._getRandom() * positionRandomness[2]);
    if (smoothPosition === true) {

      x += -(velocity[0] * this._getRandom());
      y += -(velocity[1] * this._getRandom());
      z += -(velocity[2] * this._getRandom());

    }
    this.geometry.setValue('POSITIONSTART', i, [x, y, z]);

    const velX = velocity[0] + (this._getRandom() * velocityRandomness[0]);
    const velY = velocity[1] + (this._getRandom() * velocityRandomness[1]);
    const velZ = velocity[2] + (this._getRandom() * velocityRandomness[2]);
    this.geometry.setValue('VELOCITY', i, [velX, velY, velZ]);

    const accX = acceleration[0] + this._getRandom() * accelerationRandomness[0];
    const accY = acceleration[1] + this._getRandom() * accelerationRandomness[1];
    const accZ = acceleration[2] + this._getRandom() * accelerationRandomness[2];
    this.geometry.setValue('ACCELERATION', i, [accX, accY, accZ]);

    color[0] = this._clamp(color[0] + this._getRandom() * colorRandomness, 0, 1);
    color[1] = this._clamp(color[1] + this._getRandom() * colorRandomness, 0, 1);
    color[2] = this._clamp(color[2] + this._getRandom() * colorRandomness, 0, 1);
    this.geometry.setValue('COLOR', i, [color[0], color[1], color[2]]);

    this.geometry.setValue('SIZE', i, [size + this._getRandom() * sizeRandomness * size * 2]);
    this.geometry.setValue('LIFETIME', i, [lifetime + this._getRandom() * lifetime]);

    const time = this._time + (this._getRandom() + 0.5) * 0.1;
    this.geometry.setValue('STARTTIME', i, [time]);

    this.geometry.setValue('STARTANGLE', i, [startAngle + this._getRandom() * Math.PI * startAngleRandomness * 2]);
    this.geometry.setValue('ROTATERATE', i, [rotateRate + this._getRandom() * rotateRateRandomness]);
    this.geometry.setValue('SCALEFACTOR', i, [scaleFactor]);

    // 移动指针
    this._cursor++;
    if (this._cursor >= this.maxCount) {

      this._cursor = 0;

    }

  }

  /**
   * 创建随机数数组
   * @param {number} count 随机数个数
   * @private
   */
  _creatRandom(count) {

    for (let i = 0; i < count; i++) {

      this._rand.push(Math.random() - 0.5);

    }

  }

  /**
   * 获取随机数
   * @returns {number}
   * @private
   */
  _getRandom() {

    return ++this._randomIndex >= this._rand.length ? this._rand[this._randomIndex = 1] : this._rand[this._randomIndex];

  }

  /**
   * 获取着色器代码
   * @returns {string}
   * @private
   */
  _getShader() {

    return {
      vertexShader:
        `
        precision highp float;
        precision highp int;

        attribute float lifeTime;
        attribute float startTime;
        attribute float size;
        attribute float rotateRate;
        attribute vec3 velocity;
        attribute vec3 acceleration;
        attribute vec3 positionStart;
        attribute vec3 color;
        attribute float startAngle;
        attribute float scaleFactor;
        
        uniform float uTime;
        uniform mat4 matModelViewProjection;
        uniform mat4 matModelView;

        varying vec3 v_color;
        varying float lifeLeft;
        varying mat2 vTextureMat;
        
        void main()
        {
          v_color = color;
          float deltaTime = max((uTime - startTime), 0.0);
          lifeLeft = clamp((1.0 - ( deltaTime / lifeTime )) * 2.0, 0.0, 1.0);
          vec3 position = positionStart + (velocity + acceleration * deltaTime) * deltaTime;
          gl_Position = matModelViewProjection * vec4( position, 1.0 );
         
      `,

      sizeVertexShader:
        `
          gl_PointSize = size * pow(scaleFactor, deltaTime) / gl_Position.z;
      `,
      isScaleByLifetimeVertexShader:
        `
          gl_PointSize = size * lifeLeft / gl_Position.z;
      `,
      rotateToVelocityVertexShader:
        `
        vec4 vWorld = matModelView * vec4( velocity + acceleration * deltaTime, 0.0 );
        vec2 v2 = normalize(vWorld.xy);
        vTextureMat = mat2(v2.x, v2.y, -v2.y, v2.x);
      `,
      rotationVertexShader:
        `
        float deltaAngle = deltaTime * rotateRate;
        float angle = startAngle + deltaAngle;
        vec2 angleXY = normalize(vec2(cos(angle), sin(angle)));
        vTextureMat = mat2(angleXY.x, angleXY.y, -angleXY.y, angleXY.x);
      `,

      fragmentShader:
        `
        precision mediump float;
        precision mediump int;

        varying vec3 v_color;
        varying float lifeLeft;
        varying mat2 vTextureMat;
        uniform sampler2D particleTex;
        uniform sampler2D particleMaskTex;

        void main()
        {
          vec2 pointCoord = (vTextureMat * (gl_PointCoord - vec2(0.5))) + vec2(0.5);
          float new_lifeLeft = lifeLeft;
         
      `,
      fadeInFragmentShader:
        `
        float k = step(0.5, lifeLeft);
        new_lifeLeft =  (1.0 - k) * lifeLeft +  k * (1.0 - lifeLeft);
      `,
      noImgFragmentShader:
        ` 
        float dist = distance(gl_PointCoord, vec2(0.5, 0.5));
        if(dist < 0.5){
          float alpha = dist < 0.25 ? new_lifeLeft : new_lifeLeft * (1.0 - (dist - 0.25) * 4.0);
          vec3 shineColor =  vec3(0.8) * (1.0 - (dist * 2.0));
          gl_FragColor = vec4( v_color + shineColor, alpha);
        } else {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        }
      `,
      imgFragmentShader:
        `
        vec4 tex = texture2D(particleTex, pointCoord);
      `,
      originColorFragmentShader:
        `
        gl_FragColor = vec4( tex.rgb ,  new_lifeLeft * tex.a);
      `,
      createColorFragmentShader:
        `
        gl_FragColor = vec4( v_color * tex.rgb , new_lifeLeft * tex.a);
      `,
      createColorWithMaskFragmentShader:
        `
        vec4 maskTex = texture2D( particleMaskTex, pointCoord );
        gl_FragColor = vec4( v_color * tex.rgb + maskTex.a,   new_lifeLeft * tex.a);
      `
    };

  }

  /**
   * 创建顶点着色器
   * @returns {string}
   * @private
   */
  _createVertexShader() {

    const shader = this._getShader();

    let vertexShader = '';
    if (this.vertexShader) {

      vertexShader = this.vertexShader;

    } else {

      vertexShader = shader.vertexShader;
      if (this.isScaleByLifetime) {

        vertexShader += shader.isScaleByLifetimeVertexShader;

      } else {

        vertexShader += shader.sizeVertexShader;

      }
      if (this.particleTex) {

        if (this.rotateToVelocity) {

          vertexShader += shader.rotateToVelocityVertexShader;

        } else {

          vertexShader += shader.rotationVertexShader;

        }

      }
      vertexShader += '}';

    }
    return vertexShader;

  }

  /**
   * 创建片元着色器
   * @returns {string}
   * @private
   */
  _createFragmentShader() {

    const shader = this._getShader();

    let fragmentShader = '';
    if (this.fragmentShader) {

      fragmentShader = this.fragmentShader;

    } else {

      fragmentShader = shader.fragmentShader;
      if (this.fadeIn) {

        fragmentShader += shader.fadeInFragmentShader;

      }

      if (!this.particleTex) {

        fragmentShader += shader.noImgFragmentShader;

      } else {

        fragmentShader += shader.imgFragmentShader;
        if (this.useOriginColor) {

          fragmentShader += shader.originColorFragmentShader;

        } else {

          if (this.particleMaskTex) {

            fragmentShader += shader.createColorWithMaskFragmentShader;

          } else {

            fragmentShader += shader.createColorFragmentShader;

          }

        }

      }
      fragmentShader += '}';

    }
    return fragmentShader;

  }

  /**
   * 将值的大小限制在最大值和最小值之间
   * @param {number} value 计算值
   * @param {number} min 最小值
   * @param {number} max 最大值
   * @returns 限制后的值
   * @private
   */
  _clamp(value, min, max) {

    if (value > max) {

      return max;

    }
    if (value < min) {

      return min;

    }
    return value;

  }

  /**
   * 将十六进制值颜色转换为颜色向量
   * @param {number} hex
   * @private
   */
  _getRGBFromHex(hex) {

    hex = Math.floor(hex);
    const r = (hex >> 16 & 255) / 255;
    const g = (hex >> 8 & 255) / 255;
    const b = (hex & 255) / 255;
    return vec3.fromValues(r, g, b);

  }

  /**
   * 将颜色格式转换为向量
   * @param {number|Array|Vec3} value 颜色
   * @private
   */
  _getColor(value) {

    if (typeof value === 'number') {

      return this._getRGBFromHex(value);

    } else if (Array.isArray(value)) {

      return vec3.fromValues(value[0], value[1], value[2]);

    } else {

      return vec3.clone(value);

    }

  }

  /**
   * 将一维数据扩展为三维数据
   * @param {number} value 一维数据
   * @returns {Array} 三维数据
   * @private
   */
  _get3DData(value) {

    let res = [];
    if (!Array.isArray(value)) {

      res.push(value);
      res.push(value);
      res.push(value);

    } else {

      res = value;

    }
    return res;

  }

}
