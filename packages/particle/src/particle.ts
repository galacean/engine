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
import { AGeometryRenderer, IndexBufferGeometry } from '@alipay/o3-geometry';
import { vec3 } from '@alipay/o3-math';


/**
 * GPU粒子系统渲染类
 * @extends AGeometryRenderer
 */
export class AGPUParticleSystem extends AGeometryRenderer {
  private _time: number;
  private _isInit: boolean;
  private _material: any;
  private once: boolean;
  public DPR: number;
  public maxCount: number;
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
  public spriteSheet: any[];
  public is2d: boolean;

  /**
   * @constructor
   * @param {Node} node 节点对象
   */
  constructor(node) {

    super(node);
    this._time = 0; // 渲染时间，单位秒
    this._isInit = false; // 是否完成初始化
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
   * @property {number} alpha 透明度，默认1，范围 0 ~ 1
   * @property {Array/number} positionRandomness  位置随机因子，默认[0,0,0]，范围  >0
   * @property {Array} positionArray  固定位置数组
   * @property {Array/number} velocityRandomness  速度随机因子，默认[0, 0, 0]，范围  >0
   * @property {Array/number} accelerationRandomness  加速度随机因子，默认[0, 0, 0]，范围  >0
   * @property {number} colorRandomness  颜色随机因子，默认0，范围  0 ~ 1
   * @property {number} sizeRandomness  大小随机因子，默认0，范围  0 ~ 1
   * @property {number} alphaRandomness  透明度随机因子，默认0，范围 0 ~ 1
   * @property {number} startAngleRandomness  初始旋转角度随机因子，默认0，范围 0 ~ 1
   * @property {number} rotateRateRandomness  自转旋转角速率随机因子，默认0，范围   >0
   * @property {number} startTimeRandomness  每个粒子出现的时间点随机因子，单位秒   >0
   */

  /**
   * 初始化
   * @param {ParticleProps} props 初始化参数
   * @param {number} [ParticleProps.maxCount = 1000] 最大粒子数
   * @param {boolean} [ParticleProps.once = false] 是否只发射一帧, 默认
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
   * @param {Array} [ParticleProps.spriteSheet] 雪碧图数据
   * @param {boolean} [ParticleProps.is2d] 是否是2D旋转
   */

  initialize(props) {
    this.maxCount = props.maxCount !== undefined ? props.maxCount : 1000;
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
    this.spriteSheet = props.spriteSheet || null;
    this.is2d = props.is2d === undefined ? true : props.is2d;

    this.setMaterial();

    /** @private */
    this.geometry = this._createGeometry();

    this._isInit = true;

    const options = this.getOptions ? this.getOptions(this._time) : this.options;

    for (let x = 0; x < this.maxCount; x++) {
      this._spawnParticle(options, x);
    }

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
    this._material.setValue('uTime', this._time);

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

    this._time = 0;
    this._material.setValue('uActive', 1.0);

  }

  /**
   * 停止发射
   */
  stop() {

    this._material.setValue('uActive', 0.0);

  }

  /**
   * 销毁资源
   * @private
   */
  destroy() {

    super.destroy();
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

    material.setValue('uOnce', this.once ? 1.0 : 0.0);

    if (this.particleTex) {

      this.particleTex.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);
      material.setValue('particleTex', this.particleTex);

    }
    if (this.particleMaskTex) {

      this.particleMaskTex.setWrapMode(TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE);
      material.setValue('particleMaskTex', this.particleMaskTex);

    }

    super.setMaterial(material);

    this._material = material;

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
        alpha: {
          name: 'alpha',
          semantic: 'ALPHA',
          type: DataType.FLOAT
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
        uv: {
          name: 'uv',
          semantic: 'UV',
          type: DataType.FLOAT_VEC3
        },
        normalizedUv: {
          name: 'normalizedUv',
          semantic: 'NORMALIZED_UV',
          type: DataType.FLOAT_VEC2
        },
      },
      uniforms: {
        uOnce: {
          name: 'uOnce',
          type: DataType.FLOAT
        },
        uActive: {
          name: 'uActive',
          type: DataType.FLOAT
        },
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
        } as any
      }
    };

    if (this.is2d) {
      cfg.uniforms.matViewInverse = {
        name: 'matViewInverse',
        semantic: UniformSemantic.VIEWINVERSE,
        type: DataType.FLOAT_MAT4,
      }

      cfg.uniforms.matProjection = {
        name: 'matProjection',
        semantic: UniformSemantic.PROJECTION,
        type: DataType.FLOAT_MAT4,
      }

      cfg.uniforms.matView = {
        name: 'matView',
        semantic: UniformSemantic.VIEW,
        type: DataType.FLOAT_MAT4,
      }

      cfg.uniforms.matWorld = {
        name: 'matWorld',
        semantic: UniformSemantic.MODEL,
        type: DataType.FLOAT_MAT4,
      }
    }
    else {
      // @ts-ignore
      cfg.states.disable = [RenderState.CULL_FACE];
    }

    if (this.blendFuncSeparate) {
      // @ts-ignore
      cfg.states.functions.blendFuncSeparate = this.blendFuncSeparate;
    } else {
      // @ts-ignore
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
    const geometry = new IndexBufferGeometry('particleGeometry');
    geometry.mode = DrawMode.TRIANGLES;
    const FLOAT = DataType.FLOAT;

    var indices = new Uint16Array(6 * this.maxCount);

    var idx = 0;

    for (var i = 0; i < this.maxCount; ++i) {
      // 两个三角面
      var startIndex = i * 4;
      indices[idx++] = startIndex + 0;
      indices[idx++] = startIndex + 1;
      indices[idx++] = startIndex + 2;
      indices[idx++] = startIndex + 0;
      indices[idx++] = startIndex + 2;
      indices[idx++] = startIndex + 3;
    }

    geometry.initialize([
      { semantic: 'POSITIONSTART', size: 3, type: FLOAT, normalized: false },
      { semantic: 'VELOCITY', size: 3, type: FLOAT, normalized: false },
      { semantic: 'ACCELERATION', size: 3, type: FLOAT, normalized: false },
      { semantic: 'COLOR', size: 3, type: FLOAT, normalized: false },
      { semantic: 'ALPHA', size: 1, type: FLOAT, normalized: false },
      { semantic: 'SIZE', size: 1, type: FLOAT, normalized: false },
      { semantic: 'ROTATERATE', size: 1, type: FLOAT, normalized: false },
      { semantic: 'STARTTIME', size: 1, type: FLOAT, normalized: false },
      { semantic: 'LIFETIME', size: 1, type: FLOAT, normalized: false },
      { semantic: 'STARTANGLE', size: 1, type: FLOAT, normalized: false },
      { semantic: 'SCALEFACTOR', size: 1, type: FLOAT, normalized: false },
      { semantic: 'UV', size: 3, type: FLOAT, normalized: false },
      { semantic: 'NORMALIZED_UV', size: 2, type: FLOAT, normalized: false },
    ], this.maxCount * 4, indices, BufferUsage.DYNAMIC_DRAW);
    return geometry;

  }

  /**
   * 粒子发射
   * @param {Options} options
   * @private
   */
  _spawnParticle(options, i) {
    const position = options.position !== undefined ? vec3.clone(options.position) : vec3.fromValues(0, 0, 0);
    const positionRandomness = options.positionRandomness !== undefined ? this._get3DData(options.positionRandomness) : [0, 0, 0];
    const positionArray = options.positionArray;
    const velocity = options.velocity !== undefined ? vec3.clone(options.velocity) : vec3.fromValues(0, 0, 0);
    const velocityRandomness = options.velocityRandomness !== undefined ? this._get3DData(options.velocityRandomness) : [0, 0, 0];
    const color = options.color !== undefined ? this._getColor(options.color) : vec3.fromValues(1, 1, 1);
    const colorRandomness = options.colorRandomness !== undefined ? options.colorRandomness : 1;
    const alpha = options.alpha !== undefined ? options.alpha : 1;
    const alphaRandomness = options.alphaRandomness !== undefined ? options.alphaRandomness : 0;
    const lifetime = options.lifetime !== undefined ? options.lifetime : 5;
    let size = options.size !== undefined ? options.size : 1;
    const sizeRandomness = options.sizeRandomness !== undefined ? options.sizeRandomness : 0;
    const smoothPosition = options.smoothPosition !== undefined ? options.smoothPosition : false;
    const startTimeRandomness = options.startTimeRandomness !== undefined ? options.startTimeRandomness : 0;

    const acceleration = options.acceleration !== undefined ? this._get3DData(options.acceleration) : [0, 0, 0];
    const accelerationRandomness = options.accelerationRandomness !== undefined ? this._get3DData(options.accelerationRandomness) : [0, 0, 0];
    const startAngle = options.startAngle !== undefined ? options.startAngle : 0;
    const startAngleRandomness = options.startAngleRandomness !== undefined ? options.startAngleRandomness : 0;
    const rotateRate = options.rotateRate !== undefined ? options.rotateRate : 0;
    const rotateRateRandomness = options.rotateRateRandomness !== undefined ? options.rotateRateRandomness : 0;
    const scaleFactor = options.scaleFactor !== undefined ? options.scaleFactor : 1;

    if (this.DPR !== undefined) size *= this.DPR;

    let x = position[0];
    let y = position[1];
    let z = position[2];

    if (positionArray) {
      x += positionArray[i][0];
      y += positionArray[i][1];
      z += positionArray[i][2];
    }
    else {
      x += this._getRandom() * positionRandomness[0];
      y += this._getRandom() * positionRandomness[1];
      z += this._getRandom() * positionRandomness[2];
    }

    if (smoothPosition === true) {
      x += -(velocity[0] * this._getRandom());
      y += -(velocity[1] * this._getRandom());
      z += -(velocity[2] * this._getRandom());
    }

    const velX = velocity[0] + (this._getRandom() * velocityRandomness[0]);
    const velY = velocity[1] + (this._getRandom() * velocityRandomness[1]);
    const velZ = velocity[2] + (this._getRandom() * velocityRandomness[2]);

    const accX = acceleration[0] + this._getRandom() * accelerationRandomness[0];
    const accY = acceleration[1] + this._getRandom() * accelerationRandomness[1];
    const accZ = acceleration[2] + this._getRandom() * accelerationRandomness[2];

    color[0] = this._clamp(color[0] + this._getRandom() * colorRandomness, 0, 1);
    color[1] = this._clamp(color[1] + this._getRandom() * colorRandomness, 0, 1);
    color[2] = this._clamp(color[2] + this._getRandom() * colorRandomness, 0, 1);
    size = Math.max(size + (this._getRandom() * sizeRandomness * size * 2), 0);
    const lifeTime = [lifetime + this._getRandom() * lifetime];
    const sa = [startAngle + this._getRandom() * Math.PI * startAngleRandomness * 2];
    const rr = [rotateRate + this._getRandom() * rotateRateRandomness]
    const particleAlpha = this._clamp(alpha + this._getRandom() * alphaRandomness, 0, 1)
    const startTime = [Math.random() * startTimeRandomness];

    for (let j = 0; j < 4; j++) {
      const k = i * 4 + j;

      // this.geometry.setValue('POSITIONSTART', k, [_x, _y, z]);
      this.geometry.setValue('POSITIONSTART', k, [x, y, z]);

      this.geometry.setValue('STARTTIME', k, startTime);

      this.geometry.setValue('VELOCITY', k, [velX, velY, velZ]);

      this.geometry.setValue('ACCELERATION', k, [accX, accY, accZ]);

      this.geometry.setValue('COLOR', k, [color[0], color[1], color[2]]);

      this.geometry.setValue('SIZE', k, [size]);
      this.geometry.setValue('LIFETIME', k, lifeTime);

      this.geometry.setValue('STARTANGLE', k, sa);
      this.geometry.setValue('ROTATERATE', k, rr);
      this.geometry.setValue('SCALEFACTOR', k, [scaleFactor]);

      this.geometry.setValue("ALPHA", k, [particleAlpha]);

      this._setUvs(i, j, k);
    }
  }

  /**
   * 设置每个粒子的uv
   * @param i {number} 第i个粒子
   * @param j {number} 单个粒子四个顶点中的第j个
   * @param k {number} 所有粒子顶点中的第k个
   */
  private _setUvs(i: number, j: number, k: number) {
    const { spriteSheet } = this;
    const { particleTex } = this;
    let rects;
    const normalizedRects: any[] = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5]
    ];
    if (particleTex) {
      const width = particleTex.image.width;
      const height = particleTex.image.height;
  
      if (spriteSheet) {
  
        const { x, y, w, h } = spriteSheet[i % spriteSheet.length];
  
        const u = x / width;
        const v = y / height;
        const p = u + w / width;
        const q = v + h / height;
  
        rects = [
          [u, q, h / w], // left bottom
          [p, q, h / w], // right bottom
          [p, v, h / w], // right top
          [u, v, h / w], // left top
        ]
  
      }
      else {
        rects = [
          [0, 0, height / width],
          [1, 0, height / width],
          [1, 1, height / width],
          [0, 1, height / width]
        ]
      }
      
    } else {
      rects = [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1]
      ]
    }
    this.geometry.setValue('UV', k, rects[j]);
    this.geometry.setValue('NORMALIZED_UV', k, normalizedRects[j]); 
  }

  /**
   * 获取随机数
   * @returns {number}
   * @private
   */
  _getRandom() {

    return Math.random() - 0.5;

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
        attribute float alpha;
        attribute float startAngle;
        attribute float scaleFactor;
        attribute vec3 uv;
        attribute vec2 normalizedUv;
        
        uniform float uTime;
        uniform float uOnce;
        uniform float uActive;
        uniform mat4 matModelViewProjection;
        uniform mat4 matModelView;
        uniform mat4 matViewInverse;
        uniform mat4 matView;
        uniform mat4 matProjection;
        uniform mat4 matWorld;

        varying vec3 v_color;
        varying float v_alpha;
        varying float lifeLeft;
        varying mat2 vTextureMat;
        varying vec2 v_uv;

        mat2 rotation2d(float angle) {
          float s = sin(angle);
          float c = cos(angle);
        
          return mat2(
            c, -s,
            s, c
          );
        }

        void main()
        {
          v_color = color;
          v_uv = uv.xy;
          v_alpha = alpha;
          
          // float deltaTime = max(mod(uTime, lifeTime), 0.0);
          // 真实的生命周期
          float life = lifeTime + startTime;
          // 当前已过去的时间
          float deltaTime = max(mod(uTime, life) - startTime, 0.0);

          bool isDying = false;

          if (uOnce == 1.0 || uActive == 0.0) {
            isDying = true;
          }

          if ((isDying && uTime > life)) {
            deltaTime = life;
          }

          // 没出生就代表死亡，否则没出生就显示了
          if (deltaTime == 0.0) {
            deltaTime = life;
          }

          lifeLeft = 1.0 - deltaTime / lifeTime;
          float scale = size;
          vec3 position = positionStart + (velocity + acceleration * deltaTime * 0.5) * deltaTime;
      `,
      postionShader: `
        gl_Position = matModelViewProjection * vec4(position, 1.0 );
      `,
      sizeVertexShader:
        `
          scale *= pow(scaleFactor, deltaTime);
      `,
      isScaleByLifetimeVertexShader:
        `
          scale *= lifeLeft;
      `,
      rotateToVelocityVertexShader:
        // TODO：此feature待开发
        `
        // vec4 vWorld = matModelView * vec4( velocity + acceleration * deltaTime, 0.0 );
        // vec2 v2 = normalize(vWorld.xy);
        // vTextureMat = mat2(v2.x, v2.y, -v2.y, v2.x);
      `,
      rotationVertexShader:
        `
        float deltaAngle = deltaTime * rotateRate;
        float angle = startAngle + deltaAngle;
        float s = sin(angle);
        float c = cos(angle);

      `,
      rotation2dShader: `
        vec2 rotatedPoint = rotation2d(angle) * vec2(normalizedUv.x, normalizedUv.y * uv.z);

        vec3 basisX = matViewInverse[0].xyz;
        vec3 basisZ = matViewInverse[1].xyz;

        vec3 localPosition = vec3(basisX * rotatedPoint.x + 
                    basisZ * rotatedPoint.y) * scale + position;

        gl_Position = matProjection * matView * vec4(localPosition + matWorld[3].xyz, 1.);
      `
      ,
      rotation3dShader: `
        vec4 rotatedPoint = vec4((normalizedUv.x * c + normalizedUv.y * uv.z * s) * scale , 0., 
                                 (normalizedUv.x * s - normalizedUv.y * uv.z * c) * scale, 1.);
      
        vec4 orientation = vec4(0, 0, 0, 1);
        vec4 q2 = orientation + orientation;
        vec4 qx = orientation.xxxw * q2.xyzx;
        vec4 qy = orientation.xyyw * q2.xyzy;
        vec4 qz = orientation.xxzw * q2.xxzz;
      
        mat4 localMatrix = mat4(
            (1.0 - qy.y) - qz.z, 
            qx.y + qz.w, 
            qx.z - qy.w,
            0,
      
            qx.y - qz.w, 
            (1.0 - qx.x) - qz.z, 
            qy.z + qx.w,
            0,
      
            qx.z + qy.w, 
            qy.z - qx.w, 
            (1.0 - qx.x) - qy.y,
            0,
      
            position.x, position.y, position.z, 1);

        rotatedPoint = localMatrix * rotatedPoint;

        gl_Position = matModelViewProjection * rotatedPoint;
      `,

      fragmentShader:
        `
        precision mediump float;
        precision mediump int;

        varying vec3 v_color;
        varying float v_alpha;
        varying float lifeLeft;
        varying vec2 v_uv;
        uniform sampler2D particleTex;
        uniform sampler2D particleMaskTex;

        void main()
        {
          float new_lifeLeft = lifeLeft;
         
      `,
      fadeInFragmentShader:
        `
        float k = step(0.5, lifeLeft);
        new_lifeLeft =  (1.0 - k) * lifeLeft +  k * (1.0 - lifeLeft);
      `,
      noImgFragmentShader:
        ` 
          gl_FragColor = vec4( v_color, new_lifeLeft * v_alpha);
        
      `,
      imgFragmentShader:
        `
        vec4 tex = texture2D(particleTex, v_uv);
      `,
      originColorFragmentShader:
        `
        gl_FragColor = vec4( tex.rgb ,  new_lifeLeft * tex.a * v_alpha);
      `,
      createColorFragmentShader:
        `
        gl_FragColor = vec4( v_color * tex.rgb , new_lifeLeft * tex.a * v_alpha);
      `,
      createColorWithMaskFragmentShader:
        `
        vec4 maskTex = texture2D( particleMaskTex, v_uv);
        gl_FragColor = vec4( v_color * tex.rgb + maskTex.a,   new_lifeLeft * tex.a * v_alpha);
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
      

      if (this.rotateToVelocity) {

        vertexShader += shader.rotateToVelocityVertexShader;

      } else {

        vertexShader += shader.rotationVertexShader;

       // 2D 和 3D 的旋转算法不同
        if (this.is2d) {
          vertexShader += shader.rotation2dShader;
        }
        else {
          vertexShader += shader.rotation3dShader;
        }
      }
      vertexShader += this.rotateToVelocity ? (shader.postionShader + '}') : '}';

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
