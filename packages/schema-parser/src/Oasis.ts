import { NodeManager } from "./NodeManager";
import { AbilityManager } from "./AbilityManager";
import { ResouceManager } from "./resouces/ResourceManager";
import { PluginManager } from "./PluginManager";
import * as o3 from "@alipay/o3";

export class Oasis {
  public readonly nodeManager: NodeManager = new NodeManager(this);
  public readonly abilityManager: AbilityManager = new AbilityManager(this);
  public readonly recourceManager: ResouceManager = new ResouceManager(this);
  public readonly engine = new o3.Engine();

  private constructor(private schema: Schema, public readonly pluginManager: PluginManager) {}

  private async init() {
    await this.loadResouces();
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
    Object.values(nodes).forEach(this.nodeManager.add);
  }

  /**
   * 解析 NodeAbility
   */
  private parseNodeAbilities(): void {
    const { abilities } = this.schema;
    Object.values(abilities).forEach(this.abilityManager.add);
  }

  static async create(schema: Schema, pluginManager: PluginManager): Promise<Oasis> {
    const oasis = new Oasis(schema, pluginManager);
    await oasis.init();
    return oasis;
  }
}
