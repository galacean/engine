import { Engine, Entity } from "@galacean/engine-core";
import type { PrefabFile } from "../schema/PrefabSchema";
import { HierarchyParser } from "../resource-deserialize/resources/parser/HierarchyParser";
import { ParserContext, ParserType } from "../resource-deserialize/resources/parser/ParserContext";
import { PrefabResource } from "./PrefabResource";

export class PrefabParser extends HierarchyParser<PrefabResource> {
  static parse(engine: Engine, url: string, data: PrefabFile): Promise<PrefabResource> {
    const prefabResource = new PrefabResource(engine, url);
    const context = new ParserContext(engine, ParserType.Prefab, prefabResource);
    return context._load(() => new PrefabParser(data, context).start());
  }

  protected override _onEntityCreated(entity: Entity): void {
    // @ts-ignore
    entity._markAsTemplate(this.context.resource);
  }

  protected override _getRootIndices(): number[] {
    return [(this.data as PrefabFile).root];
  }

  protected override _handleRootEntity(index: number): void {
    const context = this.context;
    context.resource._root = context.entityInstances[index];
  }
}
