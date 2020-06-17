import { mat4, vec3, quat, MathUtil } from "@alipay/o3-math";
import { Logger, Util, Event, EventDispatcher } from "@alipay/o3-base";
import { NodeAbility } from "./NodeAbility";
import { SceneVisitor } from "./SceneVisitor";
import { Scene } from "./Scene";
import { Engine } from "./Engine";
import { vec3Type } from "./type";
import { Transform } from "./Transform";

function activeChange(node: Node) {
  return () => {
    if (node.parentNode) {
      if (node.parentNode.isActiveInHierarchy) {
        node.isActiveInHierarchy = node.isActive;
      } else {
        node.isActiveInHierarchy = false;
      }
    } else {
      node.isActiveInHierarchy = node.isActive;
    }
  };
}

function enableRenderer(node: Node, enabled: boolean, key: string) {
  const abilityArray = node.abilityArray;

  if (abilityArray) {
    for (let i = abilityArray.length - 1; i >= 0; i--) {
      const ability = abilityArray[i];
      if (ability.isRenderable) {
        ability[key] = enabled;
      }
    } // end of for
  }

  const children = node.children;
  if (children) {
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      child[key] = enabled;
    } // end of for
  } // end of if
}

const tempMat4 = mat4.create();

/**
 * SceneGraph中的一个节点，也就是场景中的一个对象；主要功能是管理组件对象，并组成SceneGraph
 * @class
 */
export class Node extends EventDispatcher {
  /**
   * 节点计数
   */
  static counter: number = 0;

  public _parent: Node;

  private _children: Node[] = [];
  public transform: Transform = new Transform(this, {});

  private _ownerScene: Scene;

  private _name: string;

  private _abilityArray: NodeAbility[] = [];

  private _pendingDestroy: boolean = false;

  private _activeSelf: boolean = true;

  private _isActiveInInHierarchy: boolean = true;

  private _activeChangeFun;

  /**
   * 所属的 Scene 对象
   * @member {Scene}
   * @readonly
   */
  get scene(): Scene {
    return this._ownerScene;
  }

  /**
   * 引擎对象
   * @member
   * @readonly
   */
  get engine(): Engine {
    return this._ownerScene.engine;
  }

  /**
   * 名字
   * @member {string}
   * @readonly
   */
  get name(): string {
    return this._name;
  }

  set name(name) {
    this._name = name;
  }

  /**
   * 子节点数组
   * @member {Array}
   * @readonly
   */
  get children(): Node[] {
    return this._children;
  }

  /**
   * 功能组件数组
   * @member {Array}
   * @readonly
   */
  get abilityArray(): NodeAbility[] {
    return this._abilityArray;
  }

  /**
   * 本节点是否Active
   * @member {boolean}
   */
  get isActive(): boolean {
    return this._activeSelf;
  }

  set isActive(val: boolean) {
    this._activeSelf = val;
    this._activeChangeFun();
  }

  /**
   * 在SceneGraph中是否Active
   * @member {boolean}
   * @readonly
   */
  get isActiveInHierarchy(): boolean {
    return this._isActiveInInHierarchy;
  }

  set isActiveInHierarchy(isActiveInHierarchy: boolean) {
    this._isActiveInInHierarchy = isActiveInHierarchy;
    this.trigger(new Event("isActiveInHierarchyChange"));
    this.traverseAbilitiesTriggerEnabled(isActiveInHierarchy);

    // 节点计数
    isActiveInHierarchy ? Node.counter++ : Node.counter--;
  }

  /**
   * 父节点
   * @member {Node}
   */
  get parentNode(): Node {
    return this._parent;
  }

  set parentNode(parentObj: Node) {
    if (!parentObj || parentObj === this._parent) {
      return;
    }
    if (this._parent != null) {
      const index = this._parent._children.indexOf(this);
      if (index > -1) {
        this._parent._children.splice(index, 1);
        this._parent.removeEventListener("isActiveInHierarchyChange", this._activeChangeFun);
      } else {
        Logger.debug("can not find this object in _parent._children");
      }
    }

    this._parent = parentObj;
    parentObj._children.push(this);
    this._parent.addEventListener("isActiveInHierarchyChange", this._activeChangeFun);
    this._activeChangeFun();
    this.transform.updateParentTransform();
    // this._markTransformDirty();
  }

  /**
   * 子节点的数量
   * @member {number}
   * @readonly
   */
  get childrenCount(): number {
    return this._children.length;
  }

  /**
   * 所包含的组件的数量
   * @member {number}
   * @readonly
   */
  get abilityCount(): number {
    return this._abilityArray.length;
  }

  /**
   * 是否被销毁
   * @member {boolean}
   * @readonly
   * @private
   */
  get isPendingDestroy(): boolean {
    return this._pendingDestroy;
  }

  // -- Begin of Transform ----------------------------------------------------------------------------------------
  /**
   * 本节点的位置(Local Space)
   * @member {vec3}
   */
  get position() {
    // return this._position;
    return this.transform.position;
  }

  set position(val) {
    // vec3.set(this._position, val[0], val[1], val[2]);
    // this._markTransformDirty();
    this.transform.position = val;
  }

  /**
   * 节点的上方向
   * @type {Array}
   * @readonly
   */
  get up() {
    const tempVec3 = vec3.create();
    const up = this.transform.getWorldUp(tempVec3);
    return up;
  }

  /**
   * 节点的前方向
   * @type {Array}
   * @readonly
   */
  get forward() {
    const tempVec3 = vec3.create();
    const forward = this.transform.getWorldForward(tempVec3);
    return forward;
  }

  /**
   * 节点的右方向
   * @type {Array}
   * @readonly
   */
  get right() {
    const tempVec3 = vec3.create();
    const right = this.transform.getWorldRight(tempVec3);
    return right;
  }

  /**
   * 本节点的世界坐标系位置
   * @member {vec3}
   */
  get worldPosition() {
    // if (this._parent) {
    //   const parentModel = this._parent.getModelMatrix();
    //   const pos = vec3.create();
    //   vec3.transformMat4(pos, this._position, parentModel);
    //   return pos;
    // } else {
    //   return this._position;
    // }
    return this.transform.worldPosition;
  }

  set worldPosition(val) {
    // const pos = vec3.fromValues(val[0], val[1], val[2]);
    // if (this._parent) {
    //   const matWorldToLocal = this._parent.getInvModelMatrix();
    //   vec3.transformMat4(this._position, pos, matWorldToLocal);
    // } else {
    //   this._position = pos;
    // }
    // this._markTransformDirty();
    this.transform.worldPosition = val;
  }

  /** Property: 本节点的旋转四元数(Local Space)
   * @member {quat|Array}
   */
  get rotation() {
    // return this._rotation;
    return this.transform.rotationQuaternion;
  }

  set rotation(val) {
    // quat.set(this._rotation, val[0], val[1], val[2], val[3]);
    // this._markTransformDirty();
    this.transform.rotationQuaternion = val;
  }

  /** 本节点的缩放系数(Local Space)
   * @member {vec3}
   */
  get scale() {
    // return this._scale;
    return this.transform.scale;
  }

  set scale(val) {
    // vec3.set(this._scale, val[0], val[1], val[2]);
    // this._markTransformDirty();
    this.transform.scale = val;
  }

  /**
   * 设置是否投射阴影，只有导入 ShadowFeature 时生效
   * @member {boolean}
   */
  set castShadow(enabled: boolean) {
    enableRenderer(this, enabled, "castShadow");
  }

  /**
   * 设置是否接收阴影，只有导入 ShadowFeature 时生效
   * @member {boolean}
   */
  set recieveShadow(enabled) {
    enableRenderer(this, enabled, "recieveShadow");
  }

  /**
   * 设置产生深度纹理时是否忽略该纹理，只有导入 DepthFeature 时生效
   * @member {boolean}
   */
  set ignoreInDepthTexture(enabled: boolean) {
    enableRenderer(this, enabled, "ignoreInDepthTexture");
  }

  /**
   * matrix 是否发生变化
   * */
  get isDirty() {
    return true;
  }

  public onUpdate: (t?: number) => void;

  /**
   * 构造函数
   * @param {Scene} scene 所属的场景
   * @param {Node} parent 父节点
   * @param {string} name 节点名称
   */
  constructor(scene?: Scene, parent?: Node, name?: string) {
    super();

    // -- 核心数据
    this._ownerScene = scene;
    this._name = name;

    // -- 状态变量
    this._activeChangeFun = activeChange(this);

    // -- Transform
    // this._position = vec3.create();
    // this._rotation = quat.create();
    // this._scale = vec3.fromValues(1, 1, 1);
    // this._modelMatrix = mat4.create();
    // this._invModelMatrix = mat4.create();
    // this._modelMatrixDirty = true;
    // this._invModelMatrixDirty = true;

    this.parentNode = parent;

    /**
     * 每帧执行的Update回调函数
     * @member {function}
     */
    this.onUpdate = null;
  }

  public clone(): Node {
    const newNode = new Node(this._ownerScene, null, this.name);

    newNode._pendingDestroy = this._pendingDestroy;
    newNode._activeSelf = this._activeSelf;
    newNode._isActiveInInHierarchy = this._isActiveInInHierarchy;

    // -- Transform
    newNode.position = vec3.clone(this.transform.position);
    newNode.rotation = quat.clone(this.transform.rotationQuaternion);
    newNode.scale = vec3.clone(this.transform.scale);

    for (const childNode of this._children) {
      newNode.addChild(childNode.clone());
    }

    const abilityArray = this._abilityArray || [];
    const len = abilityArray.length;
    for (let i = 0; i < len; i++) {
      const ability = abilityArray[i];
      if (ability.constructor.name !== "Transform") {
        newNode.createAbility(ability.constructor as any, {
          ...ability._props,
          isClone: true
        });
      }
    }

    return newNode;
  }

  /**
   * 每帧状态更新，在Engine.tick()中被调用
   * @param {number} deltaTime
   * @private
   */
  public update(deltaTime: number): void {
    if (!this._activeSelf) {
      return;
    }

    // -- 检查并执行onUpdate函数
    if (this.onUpdate) {
      this.onUpdate(deltaTime);
    }

    // -- 更新所有 Ability
    const abilityArray = this._abilityArray;
    if (abilityArray) {
      for (let i = abilityArray.length - 1; i >= 0; i--) {
        const ability = abilityArray[i];

        if (ability.isPendingDestroy) {
          abilityArray.splice(i, 1);
          continue;
        }

        if (ability.enabled) {
          ability.update(deltaTime);
        }
      } // end of for
    }

    // -- 更新所有子节点
    const children = this._children;
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child._pendingDestroy) {
          children.splice(i, 1);
          continue;
        }
        child.update(deltaTime);
      } // end of for
    } // end of if
  }

  /**
   * 递归的访问自身&子节点
   * @param {SceneVisitor} visitor
   */
  public visit(visitor: SceneVisitor): void {
    if (!visitor.acceptNode(this)) {
      return;
    }

    const abilityArray = this._abilityArray;
    if (abilityArray) {
      for (let i = abilityArray.length - 1; i >= 0; i--) {
        visitor.acceptAbility(abilityArray[i]);
      }
    } // end of if

    const children = this._children;
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) {
        children[i].visit(visitor);
      } // end of for
    } // end of if
  }

  /**
   * 按照名称查找子节点
   * @param {string} name 对象名称
   * @return {Node}
   */
  public findChildByName(name: string): Node {
    // -- find in this
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child._name && child._name === name) {
        return child;
      }
    }

    // -- 递归的查找所有子节点
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const findObj = child.findChildByName(name);
      if (findObj) {
        return findObj;
      }
    }

    return null;
  }

  /**
   * 按照路径查找子节点
   * @param {string} path 斜线分割的路径, 例如：'chicken/obj1/obj2'
   * @return {Node}
   */
  public findChildByPath(path: string): Node {
    const splits = path.split("/");
    if (splits.length === 0) {
      return null;
    }

    let obj: Node = this;
    for (const split of splits) {
      obj = obj.findChildByName(split);
      if (obj === null) {
        return null;
      }
    }
    return obj;
  }

  /**
   * 创建子节点
   * @param {string} name 子节点的名称
   * @return {Node} 新创建的子节点对象
   */
  public createChild(name: string): Node {
    const child = new Node(this._ownerScene, this, name);
    return child;
  }

  /**
   * 添加子节点对象
   * @param {Node} child
   */
  public addChild(child: Node): void {
    if (child._ownerScene !== this._ownerScene) {
      // fixme: remove below code after gltf loader can set the right ownerScene
      child._ownerScene = this._ownerScene;

      Node.traverseSetOwnerScene(child);
      // throw new Error( 'Node should NOT shared between scenes.' );
    }
    child.parentNode = this;
  }

  /**
   * 删除子节点
   * @param child
   */
  public removeChild(child: Node) {
    const index = this._children.indexOf(child);
    if (index < 0) {
      Logger.warn(`child's parent is not this node!`);
      return;
    }
    this._children.splice(index, 1);
    child._parent = null;

    if (this._ownerScene) {
      child.traverseAbilitiesTriggerEnabled(false);
      child._ownerScene = null;
      Node.traverseSetOwnerScene(child);
    }
  }

  /** 销毁本节点对象 */
  public destroy(): void {
    this._pendingDestroy = true;

    // -- clear ability array
    const abilityArray = this._abilityArray;
    for (let i = abilityArray.length - 1; i >= 0; i--) {
      abilityArray[i].destroy();
    }
    this._abilityArray = [];

    // -- clear children
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      children[i].destroy();
    }
    this._children = [];

    // -- clear parent
    if (this._parent != null) {
      const index = this._parent._children.indexOf(this);
      if (index > -1) {
        this._parent._children.splice(index, 1);
        this._parent.removeEventListener("isActiveInHierarchyChange", this._activeChangeFun);
      } else {
        Logger.debug("can not find this object in _parent._children");
      }
    }
    this._parent = null;
  }

  /**
   * 向节点添加一个已有的功能组件对象
   * @param {NodeAbility} abilityObject 功能组件对象
   */
  public attachAbility(abilityObject: NodeAbility): void {
    const index = this._abilityArray.indexOf(abilityObject);
    if (index !== -1) {
      this._abilityArray.push(abilityObject);
    }
  }

  /**
   * 把一个功能组件对象，从当前节点移除（不执行 destroy 操作）
   * @param {NodeAbility} abilityObject 功能组件对象
   */
  public detachAbility(abilityObject: NodeAbility): void {
    const index = this._abilityArray.indexOf(abilityObject);
    if (index !== -1) {
      this._abilityArray.splice(index, 1);
    }
  }

  /**
   * 为这个节点，创建一个功能组件
   * @param {Class} abilityType 组件的类型
   * @param {object} props 组件的额外参数
   * @return {NodeAbility} 新创建的组件对象
   */
  public createAbility<T extends NodeAbility>(
    abilityType: new (node: Node, props?: object) => T,
    props: object = {}
  ): T {
    const newAbility = new abilityType(this, props);
    this._abilityArray.push(newAbility);
    return newAbility;
  }

  /**
   * 在当前节点中，查找指定类型的功能组件
   * @param {Class} abilityType
   * @return {NodeAbility}
   */
  public findAbilityByType<T extends NodeAbility>(abilityType: new (node: Node, props?: object) => T): T {
    const abilityArray = this._abilityArray;
    for (let i = abilityArray.length - 1; i >= 0; i--) {
      const ability = abilityArray[i];
      if (ability instanceof abilityType) {
        return ability;
      }
    }
    return null;
  }

  /**
   * 使用四元数对对象进行增量旋转
   * @param {quat} rot 旋转四元数
   */
  public rotateByQuat(rot: number[] | Float32Array) {
    // quat.multiply(this._rotation, this._rotation, rot);
    // this._markTransformDirty();
    const tempVec3 = vec3.create();
    const rotateEuler = quat.toEuler(tempVec3, rot);
    this.transform.rotate(rotateEuler);
  }

  /**
   * 使用 Euler 角度对对象进行增量旋转, 单位：角度
   * @param {Array | vec3 | number} pitch 如果是number：围绕X轴的旋转；如果是数组：[x, y, z]或者[pitch, yaw, roll]
   * @param {number} yaw Y轴的旋转角度
   * @param {number} roll Z轴的旋转角度
   */
  public rotateByAngles(pitch: number, yaw: number, roll: number): void {
    // const rot = quat.create();
    // if (Util.isArray(pitch)) {
    //   quat.fromEuler(rot, pitch[0], pitch[1], pitch[2]);
    // } else {
    //   quat.fromEuler(rot, pitch, yaw, roll);
    // }

    // quat.multiply(this._rotation, this._rotation, rot);
    // this._markTransformDirty();
    if (Util.isArray(pitch)) {
      this.transform.rotate([pitch[0], pitch[1], pitch[2]]);
    } else {
      this.transform.rotate([pitch, yaw, roll]);
    }
  }

  /**
   * 使用Euler角度的方式设置旋转, 单位：角度
   * @param {Array|vec3|number} pitch 如果是number：围绕X轴的旋转；如果是数组：[x, y, z]或者[pitch, yaw, roll]
   * @param {number} yaw 围绕Y轴的旋转
   * @param {number} roll 围绕Z轴的旋转
   */
  public setRotationAngles(pitch, yaw: number, roll: number): void {
    // if (Util.isArray(pitch)) {
    //   quat.fromEuler(this._rotation, pitch[0], pitch[1], pitch[2]);
    // } else {
    //   quat.fromEuler(this._rotation, pitch, yaw, roll);
    // }
    // this._markTransformDirty();
    if (Util.isArray(pitch)) {
      this.transform.rotation = pitch;
    } else {
      this.transform.rotation = [pitch, yaw, roll];
    }
  }

  /**
   * 使用Axis-Angle的方式设置旋转：围绕某个向量为轴，旋转一定角度
   * @param {Vec3} axis 旋转轴
   * @param {number} deg 旋转角度
   */
  public setRotationAxisAngle(axis, deg: number) {
    // quat.setAxisAngle(this._rotation, axis, MathUtil.toRadian(deg));
    // this._markTransformDirty();
    const tempQuat = quat.create();
    const rotateQuat = quat.setAxisAngle(tempQuat, axis, MathUtil.toRadian(deg));
    this.transform.rotationQuaternion = rotateQuat;
  }

  /** 获取本节点的前方方向
   * @return {vec3} 节点的前方方向向量
   */
  public getForward() {
    // const modelMatrix = this.getModelMatrix();
    // return vec3.fromValues(modelMatrix[8], modelMatrix[9], modelMatrix[10]);
    return this.forward;
  }

  /**
   * 取得Local to World矩阵
   */
  public getModelMatrix() {
    return this.transform.worldMatrix;
  }

  /**
   * 使用 Local to World 更新内部 Transform 数据，效率较低
   * @param {mat4} m 变换矩阵
   * @deprecated
   */
  public setModelMatrix(m: number[] | Float32Array) {
    this.transform.worldMatrix = m;
  }

  /**
   * 取得World to Local矩阵
   * @return {mat4}
   */
  public getInvModelMatrix(): number[] | Float32Array {
    // if (this._modelMatrixDirty || this._invModelMatrixDirty) {
    //   this._updateInvModelMatrix();
    // }
    const modelMatrix = this.getModelMatrix();
    const _invModelMatrix = mat4.invert(tempMat4, modelMatrix);
    return _invModelMatrix;
  }

  /**
   * 设置Model矩阵，使得本节点‘看向’一个点
   * @param {vec3} center 看向的点
   * @param {vec3} up 指向上方的单位向量
   */
  public lookAt(center: vec3Type, up: vec3Type) {
    // const position = this.worldPosition;
    // const modelMatrix = mat4.create();
    // mat4.lookAtR(modelMatrix, position, center, up);
    // this.setModelMatrix(modelMatrix);
    // return this;
    this.transform.lookAt(center, up);
  }

  private traverseAbilitiesTriggerEnabled(enabled: boolean) {
    const eventName = enabled ? "enabled" : "disabled";
    for (let i = 0; i < this._abilityArray.length; i++) {
      const abiltiy = this._abilityArray[i];
      if (abiltiy && abiltiy.started && abiltiy.enabled) {
        abiltiy.trigger(new Event(eventName, this));
      }
    }
  }

  private static traverseSetOwnerScene(node: Node) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      const enabled = node._ownerScene ? false : true;
      node.traverseAbilitiesTriggerEnabled(enabled);

      child._ownerScene = node._ownerScene;
      this.traverseSetOwnerScene(node.children[i]);
    }
  }
}
