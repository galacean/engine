import { Event, EventDispatcher, Logger, Util } from "@alipay/o3-base";
import { mat4, MathUtil, quat, vec3 } from "@alipay/o3-math";
import { Engine } from "./Engine";
import { NodeAbility as Component } from "./NodeAbility";
import { Scene } from "./Scene";
import { vec3Type, mat4Type } from "./type";
import { DisorderedArray } from "./DisorderedArray";
import { Transform } from "./Transform";

/**
 * 节点类,可作为组件的容器。
 */
export class Node extends EventDispatcher {
  public static _nodes: DisorderedArray<Node> = new DisorderedArray();

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
   * @param scene - @deprecated 兼容参数
   * @returns 节点
   */
  static findByPath(path: string, scene: Scene /*@deprecated*/): Node {
    const splits = path.split("/");
    const rootNode = scene.root;
    if (!rootNode) return null; //scene or scene.root maybe destroyed
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

  private static _traverseSetOwnerScene(node: Node, scene: Scene): void {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      child._scene = scene;
      this._traverseSetOwnerScene(node.children[i], scene);
    }
  }

  /* 名字。 */
  name: string;

  /* @internal */
  _isActiveInHierarchy: boolean = false;

  private _scene: Scene;
  private _active: boolean;
  private _children: Array<Node> = [];
  private _components: Array<Component> = [];
  private _parent: Node = null;
  private _activeChangedComponents: Component[];
  private _isRoot: boolean; //must add,because scene management mechanism
  public readonly transform: Transform;

  /** @deprecated */
  private _invModelMatrix: mat4Type = mat4.create();
  private tempVec30 = vec3.create();
  private tempVec31 = vec3.create();
  private tempVec32 = vec3.create();
  private tempVec33 = vec3.create();
  private tempVec34 = vec3.create();
  private tempVec35 = vec3.create();
  private tempVec36 = vec3.create();

  /**
   * 是否局部激活。
   */
  get isActive(): boolean {
    return this._active;
  }
  set isActive(value: boolean) {
    if (value !== this._active) {
      this._active = value;
      if (value) {
        const parent = this._parent;
        if (this._isRoot || (parent && parent._isActiveInHierarchy)) {
          this._processActive();
        }
      } else {
        if (this._isActiveInHierarchy) {
          this._processInActive();
        }
      }
    }
  }

  /**
   * 在层级中是否处于激活状态。
   */
  get isActiveInHierarchy(): boolean {
    return this._isActiveInHierarchy;
  }

  /**
   * 父节点。
   */
  get parent(): Node {
    return this._parent;
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
        const parentScene = newParent._scene;
        if (this._scene !== parentScene) {
          this._scene = parentScene;
          Node._traverseSetOwnerScene(this, parentScene);
        }

        if (newParent._isActiveInHierarchy) {
          !this._isActiveInHierarchy && this._active && this._processActive();
        } else {
          this._isActiveInHierarchy && this._processInActive();
        }
      } else {
        if (oldParent) {
          this._scene = null;
          Node._traverseSetOwnerScene(this, null);
        }
        this._isActiveInHierarchy && this._processInActive();
      }
    }
    this._setTransformDirty();
  }

  /**
   * 子节点数量。
   */
  get childCount(): number {
    return this._children.length;
  }

  /**
   * 所属的场景对象。
   */
  get scene(): Scene {
    return this._scene;
  }

  /**
   * 创建一个节点。
   * @param scene - 所属的场景
   * @param parent - 父节点
   * @param name - 点名称
   */
  constructor(scene?: Scene, parent?: Node, name?: string) {
    super();
    Node._nodes.add(this);
    this._scene = scene;
    //TODO 因现有机制scene的rootNode 在创建时需要知道自己为root(判断activeInHierarchy时不需要判断父节点)
    this._isRoot = parent === null && name === "__root__";
    this.name = name;
    this.transform = this.addComponent(Transform);
    this.parent = parent;
    this.isActive = true;
  }

  /**
   * //TODO:组件通常不带构造函数参数，日后需要移除
   * 根据组件类型添加组件。
   * @returns	组件实例
   */
  addComponent<T extends Component>(type: new (node: Node, props?: object) => T, props: object = {}): T {
    const component = new type(this, props);
    this._components.push(component);
    if (this._isActiveInHierarchy) {
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
    for (let i = this._components.length - 1; i >= 0; i--) {
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
    for (let i = this._components.length - 1; i >= 0; i--) {
      const component = this._components[i];
      if (component instanceof type) {
        results.push(component);
      }
    }
    return results;
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
        Node._traverseSetOwnerScene(child, null);
      }
      child._parent = null;
      child._isActiveInHierarchy && child._processInActive();
    }
  }

  /**
   * 克隆。
   * @returns 克隆的节点
   */
  clone(): Node {
    const newNode = new Node(this._scene, null, this.name);

    newNode._active = this._active;
    newNode._isActiveInHierarchy = this._isActiveInHierarchy; //克隆后仍属于相同父节点

    newNode.transform.localMatrix = this.transform.localMatrix;
    // Transform

    for (const childNode of this._children) {
      newNode.addChild(childNode.clone());
    }

    const abilityArray = this._components || [];
    const len = abilityArray.length;
    for (let i = 0; i < len; i++) {
      const ability = abilityArray[i];
      if (!(ability instanceof Transform)) {
        newNode.createAbility(ability.constructor as any, (ability as any)._props);
      }
    }

    return newNode;
  }

  /**
   * 销毁。
   */
  destroy(): void {
    // clear ability array
    const abilityArray = this._components;
    for (let i = abilityArray.length - 1; i >= 0; i--) {
      abilityArray[i].destroy();
    }
    this._components.length = 0;

    // clear children
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      children[i].destroy();
    }
    this._children.length = 0;

    // clear parent
    if (this._parent != null) {
      const parentChildren = this._parent._children;
      parentChildren.splice(parentChildren.indexOf(this), 1);
    }
    this._parent = null;
    Node._nodes.delete(this);
  }

  private _setActiveComponents(isActive: boolean): void {
    const activeChangedComponents = this._activeChangedComponents;
    for (let i = 0, length = activeChangedComponents.length; i < length; ++i) {
      activeChangedComponents[i]._setActive(isActive);
    }
    this._scene._componentsManager.putActiveChangedTempList(activeChangedComponents);
    this._activeChangedComponents = null;
  }

  private _processActive(): void {
    if (this._activeChangedComponents) {
      throw "Node: can't set the 'main inActive node' active in hierarchy,if the operate is in main inActive node or it's children script's onDisable Event.";
    }
    this._activeChangedComponents = this._scene._componentsManager.getActiveChangedTempList();
    this._setActiveInHierarchy(this._activeChangedComponents);
    this._setActiveComponents(true);
  }

  private _processInActive(): void {
    if (this._activeChangedComponents) {
      throw "Node: can't set the 'main active node' inActive in hierarchy,if the operate is in main active node or it's children script's onEnable Event.";
    }
    this._activeChangedComponents = this._scene._componentsManager.getActiveChangedTempList();
    this._setInActiveInHierarchy(this._activeChangedComponents);
    this._setActiveComponents(false);
  }

  private _setActiveInHierarchy(activeChangedComponents: Component[]): void {
    this._isActiveInHierarchy = true;
    const components = this._components;
    for (let i = components.length - 1; i >= 0; i--) {
      activeChangedComponents.push(components[i]);
    }
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child: Node = children[i];
      child.isActive && child._setActiveInHierarchy(activeChangedComponents);
    }
  }

  private _setInActiveInHierarchy(activeChangedComponents: Component[]): void {
    this._isActiveInHierarchy = false;
    const components = this._components;
    for (let i = components.length - 1; i >= 0; i--) {
      activeChangedComponents.push(components[i]);
    }
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child: Node = children[i];
      child.isActive && child._setInActiveInHierarchy(activeChangedComponents);
    }
  }

  private _setTransformDirty() {
    if (this.transform) {
      this.transform._setParentDirty();
    } else {
      for (let i = 0, len = this._children.length; i < len; i++) {
        this.children[i]._setTransformDirty();
      }
    }
  }

  //--------------------------------------------TobeConfirmed-------------------------------------------------
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
    this.parent = parentObj;
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
    return this.transform.position;
  }

  set position(val) {
    this.transform.position = val;
  }

  /**
   * @deprecated
   * 节点的上方向
   * @type {Array}
   * @readonly
   */
  get up() {
    return this.transform.getWorldUp(this.tempVec30);
  }

  /**
   * @deprecated
   * 节点的前方向
   * @type {Array}
   * @readonly
   */
  get forward() {
    return this.transform.getWorldForward(this.tempVec31);
  }

  /**
   * @deprecated
   * 节点的右方向
   * @type {Array}
   * @readonly
   */
  get right() {
    return this.transform.getWorldRight(this.tempVec32);
  }

  /**
   * @deprecated
   * 本节点的世界坐标系位置
   * @member {vec3}
   */
  get worldPosition() {
    return this.transform.worldPosition;
  }

  set worldPosition(val) {
    this.transform.worldPosition = val;
  }

  /** Property: 本节点的旋转四元数(Local Space)
   * @member {quat|Array}
   */
  get rotation() {
    return this.transform.rotationQuaternion;
  }

  set rotation(val) {
    this.transform.rotationQuaternion = val;
  }

  /**
   * @deprecated
   * 本节点的缩放系数(Local Space)
   * @member {vec3}
   */
  get scale() {
    return this.transform.scale;
  }

  set scale(val) {
    this.transform.scale = val;
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
    const rotateEuler = quat.toEuler(this.tempVec33, rot);
    this.transform.rotate(rotateEuler);
  }

  /**
   * @deprecated
   * 使用 Euler 角度对对象进行增量旋转, 单位：角度
   * @param {Array | vec3 | number} pitch 如果是number：围绕X轴的旋转；如果是数组：[x, y, z]或者[pitch, yaw, roll]
   * @param {number} yaw Y轴的旋转角度
   * @param {number} roll Z轴的旋转角度
   */
  public rotateByAngles(pitch: number, yaw: number, roll: number): void {
    if (Util.isArray(pitch)) {
      vec3.set(this.tempVec36, pitch[0], pitch[1], pitch[2]);
    } else {
      vec3.set(this.tempVec36, pitch, yaw, roll);
    }
    this.transform.rotate(this.tempVec36);
  }

  /**
   * @deprecated
   * 使用Euler角度的方式设置旋转, 单位：角度
   * @param {Array|vec3|number} pitch 如果是number：围绕X轴的旋转；如果是数组：[x, y, z]或者[pitch, yaw, roll]
   * @param {number} yaw 围绕Y轴的旋转
   * @param {number} roll 围绕Z轴的旋转
   */
  public setRotationAngles(pitch: number, yaw: number, roll: number): void {
    vec3.set(this.tempVec34, pitch, yaw, roll);
    this.transform.rotation = this.tempVec34;
  }

  /**
   * @deprecated
   * 使用Axis-Angle的方式设置旋转：围绕某个向量为轴，旋转一定角度
   * @param {Vec3} axis 旋转轴
   * @param {number} deg 旋转角度
   */
  public setRotationAxisAngle(axis: vec3Type, deg: number) {
    const rotateQuat = quat.setAxisAngle(this.tempVec35, axis, MathUtil.toRadian(deg));
    this.transform.rotationQuaternion = rotateQuat;
  }

  /**
   * @deprecated
   * 获取本节点的前方方向
   * @return {vec3} 节点的前方方向向量
   */
  public getForward(): vec3Type {
    return this.forward;
  }

  /**
   * @deprecated
   * 取得Local to World矩阵
   */
  public getModelMatrix(): mat4Type {
    return this.transform.worldMatrix;
  }

  /**
   * @deprecated
   * 使用 Local to World 更新内部 Transform 数据，效率较低
   * @param {mat4} m 变换矩阵
   */
  public setModelMatrix(m: number[] | Float32Array) {
    this.transform.worldMatrix = m;
  }

  /**
   * @deprecated
   */
  public setModelMatrixNew(m: number[] | Float32Array) {
    this.transform.worldMatrix = m;
  }

  /**
   * @deprecated
   * 取得World to Local矩阵
   * @return {mat4}
   */
  public getInvModelMatrix(): number[] | Float32Array {
    return mat4.invert(this._invModelMatrix, this.transform.worldMatrix);
  }

  /**
   * @deprecated
   * 设置Model矩阵，使得本节点‘看向’一个点
   * @param {vec3} center 看向的点
   * @param {vec3} up 指向上方的单位向量
   */
  public lookAt(center: vec3Type, up?: vec3Type) {
    this.transform.lookAt(center, up);
    return this;
  }
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
