import * as o3 from "@alipay/o3";
import { Oasis } from "./Oasis";
import { pluginHook } from "./plugins/PluginManager";
import { switchElementsIndex } from "./utils";
import { NodeConfig } from "./types";

export class NodeManager {
  private nodeMap: { [id: string]: o3.Entity } = {};
  private readonly root: o3.Entity;

  constructor(private oasis: Oasis) {
    this.root = this.oasis.engine.currentScene.root.createChild("runtime-root");
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

  public get(id: string): o3.Entity {
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
  private create(nodeConfig: NodeConfig): o3.Entity {
    const { isActive, position, rotation, scale, id, name } = nodeConfig;
    const node = new o3.Entity(name);
    node.isActive = isActive;
    node.position = position;
    node.transform.rotation = rotation;
    node.scale = scale;
    (node as any).id = id;
    this.nodeMap[id] = node;
    return node;
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
