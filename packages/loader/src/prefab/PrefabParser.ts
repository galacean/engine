import { Engine, Entity } from "@galacean/engine-core";
import type { GalaceanEntitySchema, GalaceanPrefabFile, IHierarchyFile } from "../scene-format/types";
import { HierarchyParser } from "../resource-deserialize/resources/parser/HierarchyParser";
import { ParserContext, ParserType } from "../resource-deserialize/resources/parser/ParserContext";
import { PrefabResource } from "./PrefabResource";

export class PrefabParser extends HierarchyParser<PrefabResource, ParserContext<IHierarchyFile>> {
  static parse(engine: Engine, url: string, data: GalaceanPrefabFile): Promise<PrefabResource> {
    const prefabResource = new PrefabResource(engine, url);
    const context = new ParserContext<IHierarchyFile>(engine, ParserType.Prefab, prefabResource);
    const parser = new PrefabParser(data, context, prefabResource);
    parser.start();
    return parser.promise.then(() => prefabResource);
  }

  constructor(
    data: IHierarchyFile,
    context: ParserContext<IHierarchyFile>,
    public readonly prefabResource: PrefabResource
  ) {
    super(data, context);
  }

  protected override _applyEntityData(entity: Entity, entityConfig: GalaceanEntitySchema): Entity {
    super._applyEntityData(entity, entityConfig);
    // @ts-ignore
    entity._markAsTemplate(this.context.resource);
    return entity;
  }

  protected override _getRootIndices(): number[] {
    return [(this.data as GalaceanPrefabFile).root];
  }

  protected override _handleRootEntity(index: number): void {
    this.prefabResource._root = this.context.entityMap.get(index);
  }

  protected override _clearAndResolve(): PrefabResource {
    this.context.clear();
    return this.prefabResource;
  }
}
