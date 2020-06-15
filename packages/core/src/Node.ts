import { Event, EventDispatcher, Logger, Util } from "@alipay/o3-base";
import { mat4, MathUtil, quat, vec3 } from "@alipay/o3-math";
import { Engine } from "./Engine";
import { NodeAbility as Component } from "./NodeAbility";
import { Scene } from "./Scene";
import { vec3Type } from "./type";
import { DisorderedArray } from "./DisorderedArray";

/**
 * 节点类,可作为组件的容器。
 */
export class Node extends EventDispatcher {
  private static _nodes: DisorderedArray<Node> = new DisorderedArray();
  private _activeChangedComponents: Component[];
  /**
   * 根据名字查找节点。
   * @param name - 名字
   * @returns 节点
   */
  static findByName(name: string): Node {
    const { _nodes } = Node;
    for (let i = _nodes.length - 1; i >= 0; i--) {
      const node = _nodes[i];
      const nodeName = node.name;
      if (nodeName === name) {
        return node;
      }
    }
    return null;
  }

  /**
   * 根据路径查找节点，使用‘/’符号作为路径分割符。
   * @param path - 路径
   * @returns 节点
   */
  static findByPath(path: string, scene: Scene /*@deprecated*/): Node {
    const splits = path.split("/");
    const rootNode = scene.root;
    if (!rootNode) return null;
    let node: Node = rootNode;
    const spitLength = splits.length;
    for (let i = spitLength - 1; i >= 0; ++i) {
      const split = splits[i];
      if (split) {
        node = Node._findChildByName(node, split);
        if (!node) {
          return null;
        }
      }
    }
    return node;
  }

  /**
   * @internal
   */
  static _findChildByName(root: Node, name: string): Node {
    const children = root._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child.name === name) {
        return child;
      }
    }
    return null;
  }

  /* 名字 */
  name: string;

  /* @internal */
  _activeInHierarchy: boolean = false;

  private _active: boolean;
  private _children: Array<Node> = [];
  private _components: Array<Component> = [];
  private _parent: Node;
  private _isRoot: boolean; //TODO:由于目前场景管理机制不得不加

  /**
   * 是否局部激活。
   */
  get active(): boolean {
    return this._active;
  }
  set active(value: boolean) {
    if (this._activeChangedComponents && this._activeChangedComponents.length) {
      console.error("active state can't be changed while processing");
      return;
    }
    if (value !== this._active) {
      this._active = value;
      if (value) {
        const parent = this._parent;
        if (this._isRoot || (parent && parent._activeInHierarchy)) {
          this._processActive();
        }
      } else {
        if (this._activeInHierarchy) {
          this._processInActive();
        }
      }
    }
  }

  /**
   * 在层级中是否处于激活状态。
   */
  get activeInHierarchy(): boolean {
    return this._activeInHierarchy;
  }

  /**
   * 父节点。
   */
  get parent(): Node {
    return this._parent || null;
  }

  set parent(node: Node) {
    if (node !== this._parent) {
      const oldParent = this._parent;
      if (oldParent != null) {
        const oldParentChildren = oldParent._children;
        oldParentChildren.splice(oldParentChildren.indexOf(this), 1);
      }
      const newParent = (this._parent = node);
      if (newParent) {
        newParent._children.push(this);
        if (this._scene !== newParent._scene) {
          //@deprecated
          // fixme: remove below code after gltf loader can set the right ownerScene
          this._scene = newParent._scene;
          Node.traverseSetOwnerScene(this);
        }

        if (newParent._activeInHierarchy) {
          !this._activeInHierarchy && this._active && this._processActive();
        } else {
          this._activeInHierarchy && this._processInActive();
        }
      } else {
        if (oldParent) {
          // @deprecated event
          // this.traverseAbilitiesTriggerEnabled(false);
          this._scene = null;
          Node.traverseSetOwnerScene(this);
        }
        this._activeInHierarchy && this._processInActive();
      }
    }
  }

  /**
   * 子节点数量。
   */
  get childCount(): number {
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
    this._scene = scene;
    this._isRoot = parent === null && name === "root";
    this.name = name;
    this.parent = parent;
    this.active = true; // local active state of this Node
    if (scene) {
      this._activeChangedComponents = scene._componentsManager._getTempList();
    }
    Node._nodes.add(this);

    //deprecated
    this._pendingDestroy = false;
    this._activeChangeFun = activeChange(this);
    this._position = vec3.create();
    this._rotation = quat.create();
    this._scale = vec3.fromValues(1, 1, 1);
    this._modelMatrix = mat4.create();
    this._invModelMatrix = mat4.create();
    this._modelMatrixDirty = true;
    this._invModelMatrixDirty = true;
    this._up = vec3.fromValues(0, 1, 0);
    this._right = vec3.fromValues(1, 0, 0);
    this._forward = vec3.fromValues(0, 0, 1);
  }

  /**
   * //TODO:组件通常不带构造函数参数，日后需要移除
   * 根据组件类型添加组件。
   * @returns	组件实例
   */
  addComponent<T extends Component>(type: new (node: Node, props?: object) => T, props: object = {}): T {
    //TODO :看看能否删除node参数
    const component = new type(this, props);
    this._components.push(component);
    if (this._activeInHierarchy) {
      component._setActive(true);
    }
    return component;
  }

  /**
   * //TODO:组件通常不带构造函数参数，日后需要移除
   * 根据组件类型获取组件。
   * @returns	组件实例
   */
  getComponent<T extends Component>(type: new (node: Node, props?: object) => T): T {
    for (let i = this._components.length; i >= 0; i--) {
      const component = this._components[i];
      if (component instanceof type) {
        return component;
      }
    }
  }

  /**
   * //TODO:组件通常不带构造函数参数，日后需要移除
   * 根据组件类型获取组件集合。
   * @returns	组件实例集合
   */
  getComponents<T extends Component>(type: new (node: Node, props?: object) => T, results: Array<T>): Array<T> {
    const components = [];
    for (let i = this._components.length; i >= 0; i--) {
      const component = this._components[i];
      if (component instanceof type) {
        components.push(component);
      }
    }
    return components;
  }

  /**
   * 添加子节点对象。
   * @param child - 子节点
   */
  addChild(child: Node): void {
    child.parent = this;
  }

  /**
   * 删除子节点。
   * @param child - 子节点
   */
  removeChild(child: Node): void {
    child.parent = null;
  }

  /**
   * 根据索引获取子节点。
   * @param index - 索引
   * @returns 节点
   */
  getChild(index: number): Node {
    return this._children[index];
  }

  /**
   * 根据名字查找子节点。
   * @param name - 名字
   * @returns 节点
   */
  findByName(name: string): Node {
    const children = this._children;
    const child = Node._findChildByName(this, name);
    if (child) return child;
    // -- 递归的查找所有子节点
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const grandson = child.findByName(name);
      if (grandson) {
        return grandson;
      }
    }
    return null;
  }

  /**
   * 根据路径查找节点，使用‘/’符号作为路径分割符。
   * @param path - 路径
   * @returns 节点
   */
  findByPath(path: string): Node {
    const splits = path.split("/");
    let node: Node = this;
    const spitLength = splits.length;
    for (let i = spitLength - 1; i >= 0; ++i) {
      const split = splits[i];
      if (split) {
        node = Node._findChildByName(node, split);
        if (!node) {
          return null;
        }
      }
    }
    return node;
  }

  /**
   * 清空子节点。
   */
  clearChildren(): void {
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child._parent) {
        child._scene = null;
        Node.traverseSetOwnerScene(child);
      }
      child._parent = null;
      child._activeInHierarchy && child._processInActive();
    }
  }

  /**
   * 克隆。
   */
  clone(): Node {
    const newNode = new Node(this._scene, null, this.name);

    newNode._pendingDestroy = this._pendingDestroy;
    newNode._active = this._active;
    newNode._activeInHierarchy = this._activeInHierarchy;

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

    const abilityArray = this._components || [];
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
  destroy(): void {
    this._pendingDestroy = true;

    // -- clear ability array
    const abilityArray = this._components;
    for (let i = abilityArray.length - 1; i >= 0; i--) {
      abilityArray[i].destroy();
    }
    this._components.length = 0;

    // -- clear children
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      children[i].destroy();
    }
    this._children.length = 0;

    // -- clear parent
    if (this._parent != null) {
      const parentChildren = this._parent._children;
      parentChildren.splice(parentChildren.indexOf(this), 1);
    }
    this._parent = null;
    Node._nodes.delete(this);
  }

  /**
   * @internal
   */
  _setActiveInHierarchy(activeChangedComponents): void {
    this._activeInHierarchy = true;
    const components = this._components;
    for (let i = components.length - 1; i >= 0; i--) {
      const component = components[i];
      activeChangedComponents.push(component);
    }
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child: Node = children[i];
      child.active && child._setActiveInHierarchy(activeChangedComponents);
    }
  }

  /**
   * @internal
   */
  _setInActiveInHierarchy(activeChangedComponents): void {
    this._activeInHierarchy = false;
    const components = this._components;
    for (let i = components.length - 1; i >= 0; i--) {
      const component = components[i];
      activeChangedComponents.push(component);
    }
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child: Node = children[i];
      child.active && child._setInActiveInHierarchy(activeChangedComponents);
    }
  }

  /**
   * @internal
   */
  _processActive(): void {
    this._activeChangedComponents || (this._activeChangedComponents = this._scene._componentsManager._getTempList());
    this._setActiveInHierarchy(this._activeChangedComponents);
    this._activeComponents();
  }

  /**
   * @internal
   */
  _processInActive(): void {
    this._activeChangedComponents || (this._activeChangedComponents = this._scene._componentsManager._getTempList());
    this._setInActiveInHierarchy(this._activeChangedComponents);
    this._inActiveComponents();
  }

  /**
   * @internal
   */
  _activeComponents(): void {
    const activeChangedComponents = this._activeChangedComponents;
    for (let i = 0, length = this._activeChangedComponents.length; i < length; ++i) {
      const component = activeChangedComponents[i];
      console.log(component);
      component._setActive(true);
    }
    this._activeChangedComponents.length = 0;
    this._scene._componentsManager._putTempList(this._activeChangedComponents);
  }

  /**
   * @internal
   */
  _inActiveComponents(): void {
    const activeChangedComponents = this._activeChangedComponents;
    for (let i = 0, length = this._activeChangedComponents.length; i < length; ++i) {
      const component = activeChangedComponents[i];
      component._setActive(false);
    }
    this._activeChangedComponents.length = 0;
    this._scene._componentsManager._putTempList(this._activeChangedComponents);
  }

  //--------------------------------------------TobeConfirmed--------------------------------------------------
  /**
   * 所属的场景对象。
   */
  get scene(): Scene {
    return this._scene;
  }

  private _scene: Scene;

  private _pendingDestroy: boolean; //CM:好像没用了

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
    const child = new Node(this._scene, this, name);
    return child;
  }

  //--------------------------------------------------------------deprecated----------------------------------------------------------------

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
    return this._activeInHierarchy;
  }

  set isActiveInHierarchy(isActiveInHierarchy: boolean) {
    this._activeInHierarchy = isActiveInHierarchy;
    console.error("deprecated");
  }

  /**
   * @deprecated
   * 本节点是否Active
   */
  get isActive(): boolean {
    return this._active;
  }

  set isActive(val: boolean) {
    this.active = val;
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
    return this._scene.engine;
  }

  /**
   * @deprecated
   * 所包含的组件的数量
   * @member {number}
   * @readonly
   */
  get abilityCount(): number {
    return this._components.length;
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
  get abilityArray(): Component[] {
    return this._components;
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
      if (child.name && child.name === name) {
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
   * @return {Component} 新创建的组件对象
   */
  public createAbility<T extends Component>(abilityType: new (node: Node, props?: object) => T, props: object = {}): T {
    const component = this.addComponent(abilityType, props);
    return component;
  }

  /**
   * @deprecated
   * 在当前节点中，查找指定类型的功能组件
   * @param {Class} abilityType
   * @return {Component}
   */
  public findAbilityByType<T extends Component>(abilityType: new (node: Node, props?: object) => T): T {
    const abilityArray = this._components;
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
   * 向节点添加一个已有的功能组件对象
   * @param {Component} abilityObject 功能组件对象
   */
  public attachAbility(abilityObject: Component): void {
    const index = this._components.indexOf(abilityObject);
    if (index !== -1) {
      this._components.push(abilityObject);
    }
  }

  /**
   * @deprecated
   * 把一个功能组件对象，从当前节点移除（不执行 destroy 操作）
   * @param {Component} abilityObject 功能组件对象
   */
  public detachAbility(abilityObject: Component): void {
    const index = this._components.indexOf(abilityObject);
    if (index !== -1) {
      this._components.splice(index, 1);
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
    for (let i = 0; i < this._components.length; i++) {
      const abiltiy = this._components[i];
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
      child._scene = node._scene;
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
