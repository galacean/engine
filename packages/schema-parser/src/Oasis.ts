import { NodeManager } from "./NodeManager";
import { AbilityManager } from "./AbilityManager";
import { ResouceManager } from "./resouces/ResourceManager";
import { PluginManager } from "./plugins/PluginManager";
import * as o3 from "@alipay/o3";

export class Oasis {
  public readonly engine = new o3.Engine();
  public readonly nodeManager: NodeManager = new NodeManager(this);
  public readonly abilityManager: AbilityManager = new AbilityManager(this);
  public readonly recourceManager: ResouceManager = new ResouceManager(this);

  private constructor(private schema: Schema, public readonly pluginManager: PluginManager) {
    this.nodeManager.add = this.nodeManager.add.bind(this.nodeManager);
    this.abilityManager.add = this.abilityManager.add.bind(this.abilityManager);
  }

  private async init() {
    // await this.loadResouces();
    this.parseNodes();
    this.parseNodeAbilities();
  }

  /**
   * 加载资源
   */
  private async loadResouces(): Promise<void> {
    const { assets } = this.schema;

    const loadingPromises = Object.values(assets).map(this.recourceManager.load);

    await Promise.all(loadingPromises);
  }

  /**
   * 解析 nodes
   */
  private parseNodes(): void {
    const { nodes } = this.schema;
    const indices = this.bfsNodes();
    indices.map(index => nodes[index]).forEach(this.nodeManager.add);
  }

  /**
   * 解析 NodeAbility
   */
  private parseNodeAbilities(): void {
    const { abilities } = this.schema;
    Object.values(abilities).forEach(this.abilityManager.add);
  }

  /**
   * 广度优先遍历，对 nodes 进行排序
   */
  private bfsNodes(): number[] {
    const { nodes } = this.schema;
    const roots = Object.values(nodes)
      .filter(node => typeof node.parent !== "number")
      .map(node => node.id);

    let result = [];
    const traverseChildren = (roots: string[]) => {
      result = result.concat(roots);
      roots.forEach(id => {
        const children = nodes[id].children;
        children && traverseChildren(children);
      });
    };
    traverseChildren(roots);
    return result;
  }

  static async create(options: Options, pluginManager: PluginManager): Promise<Oasis> {
    const oasis = new Oasis(options.config, pluginManager);
    await oasis.init();
    options.autoPlay && oasis.engine.run();
    return oasis;
  }
}
