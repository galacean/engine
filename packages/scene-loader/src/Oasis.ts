import { NodeManager } from "./NodeManager";
import { AbilityManager } from "./AbilityManager";
import { SchemaResourceManager } from "./ResourceManager";
import { PluginManager, pluginHook } from "./plugins/PluginManager";
import { Schema, Options } from "./types";
import { EventDispatcher, Engine, Component } from "@alipay/o3-core";
import { WebCanvas, WebGLRenderer } from "@alipay/o3-rhi-webgl";

export class Oasis extends EventDispatcher {
  public readonly engine: Engine = null;
  public readonly nodeManager: NodeManager;
  public readonly abilityManager: AbilityManager;
  public resourceManager: SchemaResourceManager;
  public _canvas: HTMLCanvasElement;
  private schema: Schema;
  public timeout: number; // 全局资源超时配置
  // hook 重点
  private oasis = this;

  private constructor(private _options: Readonly<Options>, public readonly pluginManager: PluginManager) {
    super();
    this.engine = new Engine(new WebCanvas(_options.canvas), new WebGLRenderer(_options.rhiAttr));
    this.resetFeature();
    this.schema = _options.config;
    this.timeout = _options.timeout;
    this.nodeManager = new NodeManager(this);
    this.abilityManager = new AbilityManager(this);
    this.nodeManager.add = this.nodeManager.add.bind(this.nodeManager);
    this.abilityManager.add = this.abilityManager.add.bind(this.abilityManager);
    this.resourceManager = new SchemaResourceManager(this);
    if (_options.fps) {
      this.engine.targetFrameRate = _options.fps;
      this.engine.vSyncCount = 0;
    }
  }

  public get canvas(): HTMLCanvasElement {
    return this._options.canvas;
  }

  public get options(): Readonly<Options> {
    return this._options;
  }

  public updateConfig(config: Schema): void {
    this.schema = config;

    this.init();
  }

  @pluginHook({ after: "schemaParsed" })
  private init(): Promise<any> {
    this.pluginManager.boot(this);

    return this.loadResources().then(() => {
      this.bindResources();
      this.parseNodes();
      this.parseNodeAbilities();
      // TODO 临时使用 用于运行时asset把id转化为各种实例
      this.attach();
    });
  }

  /**
   * 加载资源
   */
  private loadResources(): Promise<any> {
    const { assets = {} } = this.schema;

    const loadingPromises = Object.values(assets).map((asset) => this.resourceManager.load(asset));

    return Promise.all(loadingPromises);
  }

  /**
   * 资源绑定
   */
  private bindResources() {
    this.resourceManager.getAll().forEach((resource) => {
      resource.bind();
    });
  }

  /**
   * 解析 nodes
   */
  private parseNodes(): void {
    const { nodes } = this.schema;
    const indices = this.bfsNodes();
    indices.map((index) => nodes[index]).forEach(this.nodeManager.add);
  }

  /**
   * 解析 Component
   */
  private parseNodeAbilities(): void {
    const { abilities } = this.schema;
    Object.keys(abilities)
      .map((id) => ({ id, ...abilities[id] }))
      .forEach(this.abilityManager.add);
  }

  /**
   * 广度优先遍历，对 nodes 进行排序
   */
  private bfsNodes(): number[] {
    const { nodes } = this.schema;
    const roots = Object.values(nodes)
      .filter((node) => !nodes[node.parent])
      .map((node) => node.id);

    let result = [];
    const traverseChildren = (roots: string[]) => {
      result = result.concat(roots);
      roots.forEach((id) => {
        const children = nodes[id].children;
        children && traverseChildren(children);
      });
    };
    traverseChildren(roots);
    return result;
  }

  /**
   * 重置 Feature
   */
  private resetFeature() {
    // TODO 脏代码，delete
    const scene = this.engine.sceneManager.activeScene;
    scene.features.splice(1, 1);
    scene.features.splice(3, 1);
    (scene as any).hasFogFeature = undefined;
    (scene as any).getFogMacro = undefined;
    (scene as any).bindFogToMaterial = undefined;
  }
  private attach() {
    this.resourceManager.getAll().forEach((resource) => {
      resource.attach();
    });
  }

  static create(options: Options, pluginManager: PluginManager): Promise<Oasis> {
    const oasis = new Oasis(options, pluginManager);
    return oasis.init().then(() => {
      options.autoPlay && oasis.engine.run();
      return oasis;
    });
  }
}
