import { BufferUsage, DataType, DrawMode } from "@alipay/o3-base";
import { BufferGeometry, GeometryRenderer, InterleavedBuffer } from "@alipay/o3-geometry";
import { quat, vec2, vec3 } from "@alipay/o3-math";
import { BufferAttribute } from "@alipay/o3-primitive";
import { TrailMaterial } from "./TrailMaterial";

/**
 * 拖尾效果渲染组件
 */
export class TrailRenderer extends GeometryRenderer {
  private _stroke;
  private _minSeg;
  private _lifetime;
  private _maxPointNum;
  private _points;
  private _pointStates;
  private _strapPoints;
  private _curPointNum;
  private _prePointsNum;
  /**
   * 纹理对象基类
   * @param {Entity} node 所属的Node对象
   * @param {Object} props 可选配置，包含以下参数
   * @param {float} [props.stroke=0.2] 拖尾的宽度
   * @param {float} [props.minSeg=0.02] 拖尾形状由物体运动轨迹上的点构成，描述相邻点之间最小间隔距离
   * @param {Number} [props.lifetime=1000] 物体运动时，拖尾效果持续的时长
   * @param {Material} [props.material=TrailMaterial] 拖尾使用的材质，默认使用内置的TrailMaterial
   */
  constructor(node, props) {
    super(node);

    this._stroke = props.stroke || 0.2;
    this._minSeg = props.minSeg || 0.02;
    this._lifetime = props.lifetime || 1000;
    this._maxPointNum = (this._lifetime / 1000.0) * node.engine._FPS;

    this._points = [];
    this._pointStates = [];
    this._strapPoints = [];
    for (let i = 0; i < this._maxPointNum; i++) {
      this._points.push(vec3.create());
      this._pointStates.push(this._lifetime);

      this._strapPoints.push(vec3.create());
      this._strapPoints.push(vec3.create());
    }
    this._curPointNum = 0;

    const mtl = props.material || new TrailMaterial("trial_mtl");
    this.setMaterial(mtl);

    this.setTexture(props.texture);
    this._initGeometry();
  }

  /**
   * 每帧的更新函数
   * @private
   */
  update(deltaTime) {
    let mov = 0,
      newIdx = 0;
    for (let i = 0; i < this._curPointNum; i++) {
      this._pointStates[i] -= deltaTime;
      if (this._pointStates[i] < 0) {
        mov++;
      } else if (mov > 0) {
        newIdx = i - mov;

        // Move data
        this._pointStates[newIdx] = this._pointStates[i];

        // Move point
        vec3.copy(this._points[newIdx], this._points[i]);
      }
    }
    this._curPointNum -= mov;

    let appendNewPoint = true;
    if (this._curPointNum === this._maxPointNum) {
      appendNewPoint = false;
    } else if (this._curPointNum > 0) {
      const lastPoint = this._points[this._points.length - 1];
      if (vec3.distance(this.entity.transform.worldPosition, lastPoint) < this._minSeg) {
        appendNewPoint = false;
      } else {
        // debugger
      }
    }

    if (appendNewPoint) {
      this._pointStates[this._curPointNum] = this._lifetime;
      vec3.copy(this._points[this._curPointNum], this.entity.worldPosition);

      this._curPointNum++;
    }
  }

  /**
   * 更新位置，将数据对象加入渲染队列
   * @param {Camera} camera
   * @private
   */
  render(camera) {
    this._updateStrapVertices(camera, this._points);
    this._updateStrapCoords();

    super.render(camera);
  }

  /**
   * 设置当前拖尾的纹理
   * @param {Texture2D} texture
   */
  setTexture(texture) {
    if (texture) {
      this.getMaterial().setValue("u_texture", texture);
    }
  }

  // ----------  private  -------------------
  /**
   * 初始化 geometry
   * @private
   */
  _initGeometry() {
    this.geometry = new BufferGeometry();
    this.geometry.mode = DrawMode.TRIANGLE_STRIP;
    const position = new BufferAttribute({
      semantic: "POSITION",
      size: 3,
      type: DataType.FLOAT,
      normalized: false
    });
    const uv = new BufferAttribute({
      semantic: "TEXCOORD_0",
      size: 2,
      type: DataType.FLOAT,
      normalized: true
    });
    const buffer = new InterleavedBuffer([position, uv], this._maxPointNum * 2);
    this.geometry.addVertexBufferParam(buffer);
  }

  /**
   * 更新拖尾顶点位置
   * @private
   */
  _updateStrapVertices(camera, points) {
    const m = camera.viewMatrix;
    const vx = vec3.fromValues(m[0], m[4], m[8]);
    const vy = vec3.fromValues(m[1], m[5], m[9]);
    const vz = vec3.fromValues(m[2], m[6], m[10]);
    const s = this._stroke;

    vec3.scale(vy, vy, s);

    const up = vec3.create();
    const down = vec3.create();

    const rotation = quat.create();

    vec3.transformQuat(vx, vx, rotation);
    vec3.transformQuat(vy, vy, rotation);

    const dy = vec3.create();
    const cross = vec3.create();
    vec3.normalize(vx, vx);

    //-- quad pos
    for (let i = 0; i < this._maxPointNum; i++) {
      //-- center pos
      if (i < this._curPointNum) {
        const p = points[i];
        const perpVector = vec3.create();
        if (i === this._curPointNum - 1 && i !== 0) {
          vec3.sub(perpVector, p, points[i - 1]);
        } else {
          vec3.sub(perpVector, points[i + 1], p);
        }

        vec3.projectOnPlane(perpVector, perpVector, vz);
        vec3.normalize(perpVector, perpVector);

        // Calculate angle between vectors
        let angle = Math.acos(vec3.dot(vx, perpVector));
        vec3.cross(cross, vx, perpVector);
        if (vec3.dot(cross, vz) <= 0) {
          angle = Math.PI * 2 - angle;
        }
        quat.setAxisAngle(rotation, vz, angle);
        vec3.transformQuat(dy, vy, rotation);

        vec3.add(up, p, dy);
        vec3.sub(down, p, dy);
      }

      this.geometry.setVertexBufferDataByIndex("POSITION", i * 2, up);
      this.geometry.setVertexBufferDataByIndex("POSITION", i * 2 + 1, down);
    }
  }

  /**
   * 更新拖尾 uv 位置
   * @private
   */
  _updateStrapCoords() {
    if (this._prePointsNum === this._curPointNum) {
      return;
    }

    this._prePointsNum = this._curPointNum;

    const count = this._curPointNum;
    const texDelta = 1.0 / count;
    const v = vec2.create();
    for (let i = 0; i < count; i++) {
      const d = 1.0 - i * texDelta;
      this.geometry.setVertexBufferDataByIndex("TEXCOORD_0", i * 2, vec2.set(v, 0, d));
      this.geometry.setVertexBufferDataByIndex("TEXCOORD_0", i * 2 + 1, vec2.set(v, 1.0, d));
    }
  }
}
