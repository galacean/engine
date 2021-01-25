import { Engine, EventDispatcher, ObjectValues } from "@oasis-engine/core";
import { AbilityManager } from "./AbilityManager";
import { NodeManager } from "./NodeManager";
import { pluginHook, PluginManager } from "./plugins/PluginManager";
import { RESOURCE_CLASS, SchemaResourceManager } from "./ResourceManager";
import { Options, Schema } from "./types";

export class Oasis extends EventDispatcher {
  public readonly engine: Engine = null;
  public readonly nodeManager: NodeManager;
  public readonly abilityManager: AbilityManager;
  public resourceManager: SchemaResourceManager;
  public _canvas: HTMLCanvasElement;
  private schema: Schema;
  public timeout: number;
  private oasis = this;

  private constructor(private _options: Options, public readonly pluginManager: PluginManager) {
    super(_options.engine);
    this.engine = _options.engine;
    this.schema = _options.config;
    this.timeout = _options.timeout;
    _options.scripts = _options.scripts ?? {};
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
    return this.loadResources().then(() => {
      this.bindResources();
      this.parseEntities();
      this.parseNodeAbilities();
      this.attach();
      this.nodeManager.addRootEntity();
      this.pluginManager.boot(this);
    });
  }

  private loadResources(): Promise<any> {
    const { assets = {} } = this.schema;

    const loadingPromises = ObjectValues(assets)
      .filter((asset) => {
        if (RESOURCE_CLASS[asset.type]) {
          return true;
        }
        console.warn(`${asset.type} loader is not defined. the ${asset.type} type will be ignored.`);
        return false;
      })
      .map((asset) => this.resourceManager.load(asset));

    return Promise.all(loadingPromises);
  }

  private bindResources() {
    this.resourceManager.getAll().forEach((resource) => {
      resource.bind();
    });
  }

  private parseEntities(): void {
    const { nodes } = this.schema;
    const indices = this.bfsNodes();
    indices.map((index) => nodes[index]).forEach(this.nodeManager.add);
  }

  private parseNodeAbilities(): void {
    const { abilities } = this.schema;
    Object.keys(abilities)
      .map((id) => ({ id, ...abilities[id] }))
      .forEach(this.abilityManager.add);
  }

  private bfsNodes(): number[] {
    const { nodes } = this.schema;
    const roots = ObjectValues(nodes)
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
