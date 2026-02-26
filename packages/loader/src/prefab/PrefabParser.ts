import { Engine, Entity } from "@galacean/engine-core";
import { IEntity, IHierarchyFile, ParserContext, ParserType } from "../resource-deserialize";
import { HierarchyParser } from "../resource-deserialize/resources/parser/HierarchyParser";
import { PrefabResource } from "./PrefabResource";

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

  protected override _applyEntityData(entity: Entity, entityConfig: IEntity = {}): Entity {
    super._applyEntityData(entity, entityConfig);
    // @ts-ignore
    entity._markAsTemplate(this.context.resource);
    return entity;
  }

  protected override _handleRootEntity(id: string): void {
    this.prefabResource._root = this.context.entityMap.get(id);
  }

  protected override _clearAndResolve(): PrefabResource {
    this.context.clear();
    return this.prefabResource;
  }
}
