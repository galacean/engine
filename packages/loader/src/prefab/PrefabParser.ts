import { Engine, Entity } from "@galacean/engine-core";
import { HierarchyParser } from "../resource-deserialize/resources/parser/HierarchyParser";
import { PrefabResource } from "./PrefabResource";
import { IHierarchyFile, ParserContext, ParserType } from "../resource-deserialize";

export class PrefabParser extends HierarchyParser<PrefabResource, ParserContext<IHierarchyFile, Entity>> {
  static parse(engine: Engine, url: string, data: IHierarchyFile): Promise<PrefabResource> {
    const prefabResource = new PrefabResource(engine, url);
    const context = new ParserContext<IHierarchyFile, Entity>(engine, ParserType.Prefab, prefabResource);
    const parser = new PrefabParser(data, context, prefabResource);
    parser.start();
    return parser.promise.then(() => prefabResource);
  }

  constructor(
    data: IHierarchyFile,
    context: ParserContext<IHierarchyFile, Entity>,
    public readonly prefabResource: PrefabResource
  ) {
    super(data, context);
  }

  protected override _handleRootEntity(id: string): void {
    this.prefabResource._root = this.context.entityMap.get(id);
  }

  protected override _clearAndResolve(): PrefabResource {
    this.context.clear();
    return this.prefabResource;
  }
}
