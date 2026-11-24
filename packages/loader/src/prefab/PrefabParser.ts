import { Engine, Entity } from "@galacean/engine-core";
import type { HierarchyFile } from "../schema/HierarchySchema";
import type { PrefabFile } from "../schema/PrefabSchema";
import { HierarchyParser } from "../resource-deserialize/resources/parser/HierarchyParser";
import { ParserContext, ParserType } from "../resource-deserialize/resources/parser/ParserContext";
import { PrefabResource } from "./PrefabResource";

export class PrefabParser extends HierarchyParser<PrefabResource, ParserContext> {
  static parse(engine: Engine, url: string, data: PrefabFile): Promise<PrefabResource> {
    const prefabResource = new PrefabResource(engine, url);
    prefabResource._isLoading = true;
    let parser: PrefabParser;
    try {
      const context = new ParserContext(engine, ParserType.Prefab, prefabResource);
      parser = new PrefabParser(data, context, prefabResource);
      parser.start();
    } catch (e) {
      prefabResource.destroy();
      throw e;
    }
    return parser.promise.then(
      (res) => {
        prefabResource._isLoading = false;
        return res;
      },
      (e) => {
        prefabResource.destroy();
        throw e;
      }
    );
  }

  constructor(
    data: HierarchyFile,
    context: ParserContext,
    public readonly prefabResource: PrefabResource
  ) {
    super(data, context);
  }

  protected override _onEntityCreated(entity: Entity): void {
    // @ts-ignore
    entity._markAsTemplate(this.context.resource);
  }

  protected override _getRootIndices(): number[] {
    return [(this.data as PrefabFile).root];
  }

  protected override _handleRootEntity(index: number): void {
    this.prefabResource._root = this.context.entityInstances[index];
  }

  protected override _clearAndResolve(): PrefabResource {
    this.context.clear();
    return this.prefabResource;
  }
}
