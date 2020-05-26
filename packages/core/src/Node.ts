import { mat4, vec3, quat, MathUtil } from "@alipay/o3-math";
import { Logger, Util, Event, EventDispatcher } from "@alipay/o3-base";
import { NodeAbility } from "./NodeAbility";
import { SceneVisitor } from "./SceneVisitor";
import { Scene } from "./Scene";
import { Engine } from "./Engine";
import { vec3Type } from "./type";
import { Transform } from "./Transform";
import { StandardTransform } from "./StandardTransform";

/**
 * 节点类,可作为组件的容器。
 */
export class Node extends EventDispatcher {
  private _components: NodeAbility[];
  private _active: boolean;
  private _parent: Node;
  /** 名字。 */
  name: string;

  /**
   * 是否局部激活。
   */
  get active(): boolean {
    //TODO:
    return this._active;
  }
  set active(value: boolean) {
    //TODO:
    this._active = value;
  }

  /**
   * 在层级中是否处于激活状态。
   */
  get activeInHierarchy(): boolean {
    //TODO:
    if (this.parent) {
      return this.active && this.parent.activeInHierarchy;
    } else {
      return this.active;
    }
  }

  /**
   * 父变换。
   */
  get parent(): Node {
    //TODO:
    return this._parent;
  }

  set parent(node: Node) {
    //TODO:
    if (!node || node === this._parent) {
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
    this._parent = node;
    this._parent._children.push(this);
    this._parent.addEventListener("isActiveInHierarchyChange", this._activeChangeFun);
  }

  /**
   * 子变换数量。
   */
  get childCount(): number {
    //TODO:
    return this._children.length;
  }

  /**
   * 构造函数
   * @param scene - 所属的场景
   * @param parent - 父节点
   * @param name - 点名称
   */
  constructor(scene?: Scene, parent?: Node, name?: string) {
    super();

    // -- 核心数据
    this._ownerScene = scene;
    this._name = name;

    this._children = [];
    this._abilityArray = [];
    this._components = [];

    // -- 状态变量
    this._pendingDestroy = false;
    this._activeSelf = true; // local active state of this Node

    this._isActiveInInHierarchy = true;
    this._activeChangeFun = activeChange(this);

    // -- Transform
    this._position = vec3.create();
    this._rotation = quat.create();
    this._scale = vec3.fromValues(1, 1, 1);
    this._modelMatrix = mat4.create();
    this._invModelMatrix = mat4.create();
    this._modelMatrixDirty = true;
    this._invModelMatrixDirty = true;

    this.parentNode = parent;

    this._up = vec3.fromValues(0, 1, 0);
    this._right = vec3.fromValues(1, 0, 0);
    this._forward = vec3.fromValues(0, 0, 1);

    /**
     * 每帧执行的Update回调函数
     * @member {function}
     */
    this.onUpdate = null;

    this.transform = new Transform(this);
  }

  /**
   * //TODO:组件通常不带构造函数参数，日后需要移除
   * 根据组件类型添加组件。
   * @returns	组件实例
   */
  addComponent<T extends NodeAbility>(type: new (node: Node, props?: object) => T, props: object = {}): T {
    //TODO:
    const component = new type(this, props);
    this._components.push(component);
    return component;
  }

  /**
   * //TODO:组件通常不带构造函数参数，日后需要移除
   * 根据组件类型获取组件。
   * @returns	组件实例
   */
  getComponent<T extends NodeAbility>(type: new (node: Node, props?: object) => T): T {
    return (this._components.filter(component => component instanceof type)[0] as T) || null;
  }

  /**
   * //TODO:组件通常不带构造函数参数，日后需要移除
   * 根据组件类型获取组件集合。
   * @returns	组件实例集合
   */
  getComponents<T extends NodeAbility>(type: new (node: Node, props?: object) => T, results: Array<T>): Array<T> {
    //TODO:
    results = this._components.filter(component => component instanceof type) as T[];
    return results;
  }

  /**
   * 根据索引获取子节点。
   *  @param index - 索引
   * @returns 节点
   */
  getChild(index: number): Node {
    //TODO:
    return this._children[index];
  }

  /**
   * 根据名字查找子节点。
   * @param name - 名字
   * @returns 节点
   */
  findByName(name: string): Node {
    //TODO:
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
      const findObj = child.findByName(name);
      if (findObj) {
        return findObj;
      }
    }

    return null;
  }

  /**
   * 根据路径查找子节点，使用‘/’符号作为路径分割符。
   * @param name - 名字
   * @returns 节点
   */
  findByPath(path: string): Node {
    //TODO:
    const splits = path.split("/");
    if (splits.length === 0) {
      return null;
    }
    let obj: Node = this;
    for (const split of splits) {
      if (split) {
        obj = obj.findByName(split);
        if (obj === null) {
          return null;
        }
      }
    }
    return obj;
  }

  /**
   * 清空子节点。
   */
  clearChildren(): void {
    //TODO:
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      children[i].destroy();
    }
  }

  /**
   * 克隆。
   */
  public clone(): Node {
    const newNode = new Node(this._ownerScene, null, this.name);

    newNode._pendingDestroy = this._pendingDestroy;
    newNode._activeSelf = this._activeSelf;
    newNode._isActiveInInHierarchy = this._isActiveInInHierarchy;

    // -- Transform
    newNode._position = vec3.clone(this._position);
    newNode._rotation = quat.clone(this._rotation);
    newNode._scale = vec3.clone(this._scale);
    newNode._modelMatrix = mat4.clone(this._modelMatrix);
    newNode._invModelMatrix = mat4.clone(this._invModelMatrix);
    newNode._modelMatrixDirty = this._modelMatrixDirty;
    newNode._invModelMatrixDirty = this._invModelMatrixDirty;

    for (const childNode of this._children) {
      newNode.addChild(childNode.clone());
    }

    const abilityArray = this._abilityArray || [];
    const len = abilityArray.length;
    for (let i = 0; i < len; i++) {
      const ability = abilityArray[i];
      newNode.createAbility(ability.constructor as any, ability._props);
    }

    return newNode;
  }

  /**
   * 销毁。
   */
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

  //--------------------------------------------TobeConfirmed--------------------------------------------------

  /**
   * 所属的场景对象。
   */
  get scene(): Scene {
    return this._ownerScene;
  }

  private _ownerScene: Scene;

  private _name: string;

  private _children: Node[];

  private _abilityArray: NodeAbility[];

  private _pendingDestroy: boolean;

  private _activeSelf: boolean;

  private _isActiveInInHierarchy: boolean;

  private propertyChangeEvnet = new Event("propertyChange");

  private _activeChangeFun;

  private _position;

  private _rotation;
  private _scale;
  private _modelMatrix;
  private _invModelMatrix;
  private _modelMatrixDirty;
  private _invModelMatrixDirty;
  private _up;
  private _right;
  private _forward;

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
    child.parent = this;
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

  //--------------------------------------------------------------deprecated----------------------------------------------------------------

  /** @deprecated */
  public onUpdate: (t?: number) => void;
  /** @deprecated */
  public transform: Transform;

  /**
   * @deprecated
   * 是否被销毁
   * @member {boolean}
   * @readonly
   * @private
   */
  get isPendingDestroy(): boolean {
    return this._pendingDestroy;
  }

  /**
   * @deprecated
   * 子节点的数量
   * @member {number}
   * @readonly
   */
  get childrenCount(): number {
    return this._children.length;
  }

  /**
   * @deprecated
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
    this._markTransformDirty();
  }

  /**
   * @deprecated
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
  }

  /**
   * @deprecated
   * 本节点是否Active
   */
  get isActive(): boolean {
    return this._activeSelf;
  }

  set isActive(val: boolean) {
    this._activeSelf = val;
    this._activeChangeFun();
  }

  /**
   * @deprecated
   * 子节点数组
   */
  get children(): Node[] {
    return this._children;
  }

  /**
   * @deprecated
   * 引擎对象
   * @member
   * @readonly
   */
  get engine(): Engine {
    return this._ownerScene.engine;
  }

  /**
   * @deprecated
   * 所包含的组件的数量
   * @member {number}
   * @readonly
   */
  get abilityCount(): number {
    return this._abilityArray.length;
  }

  /**
   * @deprecated
   * matrix 是否发生变化
   */
  get isDirty() {
    return this._modelMatrixDirty;
  }

  /**
   * @deprecated
   * 功能组件数组
   * @member {Array}
   * @readonly
   */
  get abilityArray(): NodeAbility[] {
    return this._abilityArray;
  }

  /**
   * @deprecated
   * 本节点的位置(Local Space)
   * @member {vec3}
   */
  get position() {
    return this._position;
  }

  set position(val) {
    vec3.set(this._position, val[0], val[1], val[2]);
    this._markTransformDirty();
  }

  /**
   * @deprecated
   * 节点的上方向
   * @type {Array}
   * @readonly
   */
  get up() {
    return this._up;
  }

  /**
   * @deprecated
   * 节点的前方向
   * @type {Array}
   * @readonly
   */
  get forward() {
    return this._forward;
  }

  /**
   * @deprecated
   * 节点的右方向
   * @type {Array}
   * @readonly
   */
  get right() {
    return this._right;
  }

  /**
   * @deprecated
   * 本节点的世界坐标系位置
   * @member {vec3}
   */
  get worldPosition() {
    if (this._parent) {
      const parentModel = this._parent.getModelMatrix();
      const pos = vec3.create();
      vec3.transformMat4(pos, this._position, parentModel);
      return pos;
    } else {
      return this._position;
    }
  }

  set worldPosition(val) {
    const pos = vec3.fromValues(val[0], val[1], val[2]);
    if (this._parent) {
      const matWorldToLocal = this._parent.getInvModelMatrix();
      vec3.transformMat4(this._position, pos, matWorldToLocal);
    } else {
      this._position = pos;
    }
    this._markTransformDirty();
  }

  /** Property: 本节点的旋转四元数(Local Space)
   * @member {quat|Array}
   */
  get rotation() {
    return this._rotation;
  }

  set rotation(val) {
    quat.set(this._rotation, val[0], val[1], val[2], val[3]);
    this._markTransformDirty();
  }

  /**
   * @deprecated
   * 本节点的缩放系数(Local Space)
   * @member {vec3}
   */
  get scale() {
    return this._scale;
  }

  set scale(val) {
    vec3.set(this._scale, val[0], val[1], val[2]);
    this._markTransformDirty();
  }

  /**
   * @deprecated
   * 设置是否投射阴影，只有导入 ShadowFeature 时生效
   * @member {boolean}
   */
  set castShadow(enabled: boolean) {
    enableRenderer(this, enabled, "castShadow");
  }

  /**
   * @deprecated
   * 设置是否接收阴影，只有导入 ShadowFeature 时生效
   * @member {boolean}
   */
  set recieveShadow(enabled) {
    enableRenderer(this, enabled, "recieveShadow");
  }

  /**
   * @deprecated
   * 设置产生深度纹理时是否忽略该纹理，只有导入 DepthFeature 时生效
   * @member {boolean}
   */
  set ignoreInDepthTexture(enabled: boolean) {
    enableRenderer(this, enabled, "ignoreInDepthTexture");
  }

  /**
   * @deprecated
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
   * @deprecated
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
   * @deprecated
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
   * @deprecated
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
   * @deprecated
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
   * @deprecated
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
   * @deprecated
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
   * @deprecated
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
   * @deprecated
   * 使用四元数对对象进行增量旋转
   * @param {quat} rot 旋转四元数
   */
  public rotateByQuat(rot: number[] | Float32Array) {
    quat.multiply(this._rotation, this._rotation, rot);
    this._markTransformDirty();
  }

  /**
   * @deprecated
   */
  private traverseAbilitiesTriggerEnabled(enabled: boolean) {
    const eventName = enabled ? "enabled" : "disabled";
    for (let i = 0; i < this._abilityArray.length; i++) {
      const abiltiy = this._abilityArray[i];
      if (abiltiy && abiltiy.started && abiltiy.enabled) {
        abiltiy.trigger(new Event(eventName, this));
      }
    }
  }

  /**
   * @deprecated
   */
  private static traverseSetOwnerScene(node: Node) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      const enabled = node._ownerScene ? false : true;
      node.traverseAbilitiesTriggerEnabled(enabled);

      child._ownerScene = node._ownerScene;
      this.traverseSetOwnerScene(node.children[i]);
    }
  }

  /**
   * @deprecated
   * 使用 Euler 角度对对象进行增量旋转, 单位：角度
   * @param {Array | vec3 | number} pitch 如果是number：围绕X轴的旋转；如果是数组：[x, y, z]或者[pitch, yaw, roll]
   * @param {number} yaw Y轴的旋转角度
   * @param {number} roll Z轴的旋转角度
   */
  public rotateByAngles(pitch: number, yaw: number, roll: number): void {
    const rot = quat.create();
    if (Util.isArray(pitch)) {
      quat.fromEuler(rot, pitch[0], pitch[1], pitch[2]);
    } else {
      quat.fromEuler(rot, pitch, yaw, roll);
    }

    quat.multiply(this._rotation, this._rotation, rot);
    this._markTransformDirty();
  }

  /**
   * @deprecated
   * 使用Euler角度的方式设置旋转, 单位：角度
   * @param {Array|vec3|number} pitch 如果是number：围绕X轴的旋转；如果是数组：[x, y, z]或者[pitch, yaw, roll]
   * @param {number} yaw 围绕Y轴的旋转
   * @param {number} roll 围绕Z轴的旋转
   */
  public setRotationAngles(pitch: number, yaw: number, roll: number): void {
    if (Util.isArray(pitch)) {
      quat.fromEuler(this._rotation, pitch[0], pitch[1], pitch[2]);
    } else {
      quat.fromEuler(this._rotation, pitch, yaw, roll);
    }
    this._markTransformDirty();
  }

  /**
   * @deprecated
   * 使用Axis-Angle的方式设置旋转：围绕某个向量为轴，旋转一定角度
   * @param {Vec3} axis 旋转轴
   * @param {number} deg 旋转角度
   */
  public setRotationAxisAngle(axis, deg: number) {
    quat.setAxisAngle(this._rotation, axis, MathUtil.toRadian(deg));
    this._markTransformDirty();
  }

  /**
   * @deprecated
   * 获取本节点的前方方向
   * @return {vec3} 节点的前方方向向量
   */
  public getForward(): number[] | Float32Array {
    const modelMatrix = this.getModelMatrix();
    return vec3.fromValues(modelMatrix[8], modelMatrix[9], modelMatrix[10]);
  }

  /**
   * @deprecated
   * 取得Local to World矩阵
   */
  public getModelMatrix(): number[] | Float32Array {
    if (this._modelMatrixDirty) {
      this._updateModelMatrix();
      vec3.set(this._right, this._modelMatrix[0], this._modelMatrix[1], this._modelMatrix[2]);
      vec3.set(this._up, this._modelMatrix[4], this._modelMatrix[5], this._modelMatrix[6]);
      vec3.set(this._forward, this._modelMatrix[8], this._modelMatrix[9], this._modelMatrix[10]);
      vec3.normalize(this._right, this._right);
      vec3.normalize(this._up, this._up);
      vec3.normalize(this._forward, this._forward);
    }
    return this._modelMatrix;
  }

  /**
   * @deprecated
   * 使用 Local to World 更新内部 Transform 数据，效率较低
   * @param {mat4} m 变换矩阵
   */
  public setModelMatrix(m: number[] | Float32Array) {
    const transformMat = mat4.clone(m);
    if (this._parent) {
      const parentInvMat = this._parent.getInvModelMatrix();
      mat4.mul(transformMat, parentInvMat, transformMat);
    }

    mat4.getTranslation(this._position, transformMat);
    mat4.getRotation(this._rotation, transformMat);
    mat4.getScaling(this._scale, transformMat);

    this._markTransformDirty();
  }

  /**
   * @deprecated
   */
  public setModelMatrixNew(m: number[] | Float32Array) {
    const transformMat = mat4.clone(m);
    if (this._parent) {
      const parentInvMat = this._parent.getInvModelMatrix();
      mat4.mul(transformMat, parentInvMat, transformMat);
    }

    mat4.decompose(transformMat, this._position, this._rotation, this._scale);

    this._markTransformDirty();
  }

  /**
   * @deprecated
   * 取得World to Local矩阵
   * @return {mat4}
   */
  public getInvModelMatrix(): number[] | Float32Array {
    if (this._modelMatrixDirty || this._invModelMatrixDirty) {
      this._updateInvModelMatrix();
    }
    return this._invModelMatrix;
  }

  /**
   * @deprecated
   * 重新计算Local to World矩阵
   * @private
   */
  public _updateModelMatrix(): void {
    const temp = mat4.clone(this._modelMatrix);

    mat4.fromRotationTranslationScale(this._modelMatrix, this._rotation, this._position, this._scale);
    if (this._parent) {
      const parentMat = this._parent.getModelMatrix();
      mat4.mul(this._modelMatrix, parentMat, this._modelMatrix);
    }

    if (!mat4.equals(temp, this._modelMatrix)) {
      this.trigger(this.propertyChangeEvnet);
    }

    this._modelMatrixDirty = false;
  }

  /**
   * @deprecated
   * 重新计算World to Local矩阵
   * @private
   */
  public _updateInvModelMatrix(): void {
    mat4.invert(this._invModelMatrix, this.getModelMatrix());
    this._invModelMatrixDirty = false;
  }

  /**
   * @deprecated
   * 设置Transform Dirty标志，包括子节点
   * @private
   */
  public _markTransformDirty(): void {
    if (this._modelMatrixDirty && this._invModelMatrixDirty) {
      return;
    }

    this._modelMatrixDirty = true;
    this._invModelMatrixDirty = true;
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      child._markTransformDirty();
    }
  }

  /**
   * @deprecated
   * 设置Model矩阵，使得本节点‘看向’一个点
   * @param {vec3} center 看向的点
   * @param {vec3} up 指向上方的单位向量
   */
  public lookAt(center: vec3Type, up: vec3Type) {
    const position = this.worldPosition;
    const modelMatrix = mat4.create();
    mat4.lookAtR(modelMatrix, position, center, up);
    this.setModelMatrix(modelMatrix);
    return this;
  }
}

/**
 * @deprecated
 */
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

/**
 * @deprecated
 */
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
