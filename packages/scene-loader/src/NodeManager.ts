import { Oasis } from "./Oasis";
import { pluginHook } from "./plugins/PluginManager";
import { switchElementsIndex } from "./utils";
import { NodeConfig } from "./types";
import { Entity } from "@alipay/o3-core";

export class NodeManager {
  private nodeMap: { [id: string]: Entity } = {};
  private readonly root: Entity;

  constructor(private oasis: Oasis) {
    this.root = new Entity("root", this.oasis.engine);
    this.oasis.engine.sceneManager.activeScene.addRootEntity(this.root);
  }

  @pluginHook({ after: "nodeAdded" })
  public add(nodeConfig: NodeConfig) {
    this.create(nodeConfig);
    this.append(nodeConfig.id, nodeConfig.parent, nodeConfig.index);
    return this.get(nodeConfig.id);
  }

  @pluginHook({ before: "beforeNodeUpdated", after: "nodeUpdated" })
  public update(id: string, key: string, value: any) {
    this.get(id)[key] = value;
    return { id, key, value };
  }

  public get(id: string): Entity {
    return this.nodeMap[id];
  }

  public reset() {
    this.nodeMap = {};
  }

  @pluginHook({ before: "beforeNodeDeleted" })
  public delete(id: string) {
    this.nodeMap[id].destroy();
    delete this.nodeMap[id];
  }

  /**
   * 创建节点
   * @param nodeConfig
   */
  private create(nodeConfig: NodeConfig): Entity {
    const { isActive, position, rotation, scale, id, name } = nodeConfig;
    const entity = new Entity(name);
    entity.isActive = isActive;
    entity.position = position;
    entity.transform.rotation = rotation;
    entity.scale = scale;
    (entity as any).id = id;
    this.nodeMap[id] = entity;
    return entity;
  }

  /**
   * append 节点到 parent
   * @param childId
   * @param parentId
   * @param index
   */
  private append(childId: string, parentId: string, index: number) {
    const child = this.nodeMap[childId];
    const parent = this.nodeMap[parentId] || this.root;
    parent.addChild(child);
    //@ts-ignore
    const children = parent._children;
    const currentIndex = children.length - 1;
    switchElementsIndex(children, currentIndex, index);
  }
}
