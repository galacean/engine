import { Engine, Entity } from "@galacean/engine-core";
import { HierarchyParser } from "../resource-deserialize/resources/parser/HierarchyParser";
import { PrefabResource } from "./PrefabResource";
import { IHierarchyFile, ParserContext } from "../resource-deserialize";

export class PrefabParser extends HierarchyParser<PrefabResource, ParserContext<IHierarchyFile, Entity>> {
  static parse(engine: Engine, url: string, data: IHierarchyFile): Promise<PrefabResource> {
    const context = new ParserContext<IHierarchyFile, Entity>(engine);
    const prefabResource = new PrefabResource(engine, url);
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

  protected override handleRootEntity(id: string): void {
    const rootEntity = this.context.entityMap.get(id);
    // @ts-ignore
    rootEntity._isTemplateRoot = true;
    this.prefabResource._root = rootEntity;
    this.context.entityMap.forEach((entity) => {
      // @ts-ignore
      entity._markAsTemplate(this.prefabResource);
    });
  }

  protected override _clearAndResolve(): PrefabResource {
    this.context.clear();
    return this.prefabResource;
  }
}
