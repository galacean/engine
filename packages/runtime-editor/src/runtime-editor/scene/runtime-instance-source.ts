import {
  mergeSourceValueRecords,
  sourceNestedViews,
  type SourceAddress
} from "@galacean/engine-project/runtime-editor/generated/editor-source-compiler";
import type {} from "../generated/editor-source-schema";
import {
  lookupRuntimeProjectTextAsset,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";

export const instanceMemberId = (scope: readonly string[], id: string) => `@instance:${JSON.stringify([...scope, id])}`;

export interface InstanceSourceEntity {
  id: string;
  root: string;
  path: number[];
  record: GalaceanSourceEntitySchema;
  instance: GalaceanInstanceSchema;
  target: string;
  scope: string[];
  nested?: SourceAddress;
  inline?: GalaceanInlineEntitySchema;
  removeAdded?: () => void;
}

export interface InstanceSourceComponent {
  id: string;
  entityId: string;
  record: GalaceanSourceComponentSchema;
  base: GalaceanInlineComponentSchema;
  instance: GalaceanInstanceSchema;
  target: string;
  nested?: SourceAddress;
  /** Components added by this Scene are edited directly in their inline definition. */
  added?: GalaceanInlineComponentSchema;
  inlineOwner?: GalaceanInlineEntitySchema;
}

type SourceAssetLookup = (path: string) => ReturnType<typeof lookupRuntimeProjectTextAsset>;

export function readSourcePrefab(
  assets: RuntimeProjectPackage | SourceAssetLookup,
  path: string
): GalaceanSourcePrefabFile | undefined {
  const asset = typeof assets === "function" ? assets(path) : lookupRuntimeProjectTextAsset(assets, path);
  if (asset?.type.toLowerCase() !== "prefab") return;
  if (asset.text === undefined) throw Error(`Load Prefab source '${path}' before editing`);
  const source = JSON.parse(asset.text);
  if (
    source.asset?.version !== "2.0" ||
    typeof source.root !== "string" ||
    !Array.isArray(source.entities) ||
    !Array.isArray(source.components)
  )
    throw Error(`Prefab '${path}' has no editable source topology`);
  return source;
}

/** Ephemeral view of native source records, shared by draft tools and live identity binding. */
export class RuntimeInstanceSource {
  readonly entities = new Map<string, InstanceSourceEntity>();
  readonly components = new Map<string, InstanceSourceComponent>();

  constructor(source: GalaceanSourceSceneFile, assets: RuntimeProjectPackage | SourceAssetLookup) {
    const lookup: SourceAssetLookup =
      typeof assets === "function" ? assets : (path) => lookupRuntimeProjectTextAsset(assets, path);
    let views: Map<string, ReturnType<typeof sourceNestedViews>[number]> | undefined;
    const nestedViews = () =>
      (views ??= new Map(
        sourceNestedViews(source, {
          resolveInstanceSourceFile: (path) => readSourcePrefab(lookup, path),
          resolveInstanceAssetKind: (path) => lookup(path)?.type === "glTF" ? "glTF" : "Prefab"
        }).map((view) => [JSON.stringify([view.address.rootSceneEntityId, ...view.address.sourceEntityPath]), view])
      ));
    const templates = new Map<string, GalaceanSourcePrefabFile>();
    const sourceComponents = new Set(source.components.map((record) => record.id));
    const sourceEntities = new Set(source.entities.map((record) => record.id));
    const addEntity = (member: InstanceSourceEntity) => {
      const { id, root, path } = member;
      if (sourceEntities.has(id) && id !== root) throw Error(`Ambiguous instance entity identity '${id}'`);
      const previous = this.entities.get(id);
      if (previous && (previous.root !== root || previous.path.join("/") !== path.join("/")))
        throw Error(`Ambiguous instance entity identity '${id}'`);
      // A nested template root shares its outer entity; retain the outer ownership.
      if (!previous) this.entities.set(id, member);
      else previous.record = { ...member.record, ...previous.record };
    };
    const addComponent = (
      base: GalaceanInlineComponentSchema,
      target: string,
      entityId: string,
      scope: string[],
      instance: GalaceanInstanceSchema,
      added = false,
      inlineOwner?: GalaceanInlineEntitySchema,
      nested?: SourceAddress
    ) => {
      const id = inlineOwner && base.id ? base.id : instanceMemberId(scope, target);
      if (sourceComponents.has(id) || this.components.has(id))
        throw Error(`Ambiguous instance component identity '${id}'`);
      const patches = added
        ? []
        : (instance.overrides?.componentProps?.filter((value) => value.target === target) ?? []);
      this.components.set(id, {
        id,
        entityId,
        base,
        instance,
        target,
        nested,
        inlineOwner,
        ...(added ? { added: base } : {}),
        record: {
          ...base,
          id,
          props: patches.reduce((props, patch) => mergeSourceValueRecords(props, patch.props), base.props ?? {}),
          calls: patches.some((patch) => patch.calls)
            ? [...(base.calls ?? []), ...patches.flatMap((patch) => patch.calls ?? [])]
            : base.calls
        }
      });
    };
    const bind = (
      instance: GalaceanInstanceSchema,
      root: string,
      path: number[],
      rootId: string,
      scope: string[],
      ancestors: Set<string>,
      nested?: SourceAddress
    ): number | undefined => {
      const asset = instance.asset.$ref;
      if (ancestors.has(asset)) throw Error(`Recursive Prefab instance '${asset}'`);
      let template = templates.get(asset);
      if (!template) {
        template = readSourcePrefab(lookup, asset);
        if (!template) return; // glTF has no Prefab Source member identities.
        templates.set(asset, template);
      }
      if (nested) {
        const view = nestedViews().get(JSON.stringify([nested.rootSceneEntityId, ...nested.sourceEntityPath]));
        if (!view) throw Error("Cannot resolve native nested Prefab scope");
        template = view.baseline;
        instance = view.instance;
      }
      const nodes = new Map(template.entities.map((record) => [record.id, record]));
      const definitions = new Map(template.components.map((record) => [record.id, record]));
      const removedEntities = new Set(instance.overrides?.removedEntities ?? []);
      const removedComponents = new Set(instance.overrides?.removedComponents ?? []);
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(asset);
      const inline = (
        record: GalaceanInlineEntitySchema,
        id: string,
        path: number[],
        localScope: string[],
        removeAdded: () => void
      ) => {
        id = record.id ?? localScope.at(-1)!;
        addEntity({
          id,
          root,
          path,
          instance,
          target: record.id ?? localScope.at(-1)!,
          scope: localScope,
          nested,
          inline: record,
          removeAdded,
          record: { ...record, id, children: [], components: [] }
        });
        if (record.instance) {
          bind(record.instance, root, path, id, [id], new Set());
          return;
        }
        (record.components ?? []).forEach((component) => {
          if (!component.id) throw Error("Inline component id must be a non-empty string id");
          addComponent(component, component.id, id, localScope, instance, true, record, nested);
        });
        (record.children ?? []).forEach((child, index) => {
          if (!child.id) throw Error("Inline child id must be a non-empty string id");
          const key = child.id;
          const childScope = scope;
          inline(child, instanceMemberId(childScope, key), [...path, index], [...childScope, key], () => {
            if (record.children!.some((child) => !child.id))
              throw Error("Inline entities need explicit Source IDs before removal; positional identities would shift");
            record.children = record.children!.filter((value) => value !== child);
          });
        });
      };
      const visit = (key: string, id: string, path: number[], parents: Set<string>): number => {
        const record = nodes.get(key);
        if (!record || parents.has(key)) throw Error(`Invalid Prefab entity '${key}' in '${asset}'`);
        const patches =
          instance.overrides?.entityProps
            ?.filter((value) => value.target === key)
            .map(({ target: _, ...props }) => props) ?? [];
        addEntity({
          id,
          root,
          path,
          instance,
          target: key,
          scope,
          nested,
          record: { ...record, ...Object.assign({}, ...patches), id, children: [], components: [] }
        });
        const nestedChildren = record.instance
          ? bind(record.instance, root, path, id, [...scope, record.id], nextAncestors, {
              rootSceneEntityId: nested?.rootSceneEntityId ?? scope[0],
              sourceEntityPath: [...(nested?.sourceEntityPath ?? []), record.id]
            })
          : 0;
        if (!record.instance)
          for (const key of record.components ?? []) {
            if (removedComponents.has(key)) continue;
            const definition = definitions.get(key);
            if (!definition) throw Error(`Unknown Prefab component '${key}'`);
            addComponent(definition, key, id, scope, instance, false, undefined, nested);
          }
        for (const added of instance.overrides?.addedComponents ?? [])
          if (added.owner === record.id)
            addComponent(added.component, added.id, id, scope, instance, true, undefined, nested);
        const nextParents = new Set(parents);
        nextParents.add(key);
        let index = nestedChildren ?? 0;
        if (!record.instance)
          for (const key of record.children ?? [])
            if (!removedEntities.has(key)) visit(key, instanceMemberId(scope, key), [...path, index++], nextParents);
        // Native hierarchy overrides append added children after template children.
        for (const added of instance.overrides?.addedEntities ?? [])
          if (added.parent === record.id) {
            if (nestedChildren === undefined)
              throw Error("Added children inside glTF instances require native source topology");
            inline(added.entity, instanceMemberId(scope, added.id), [...path, index++], [...scope, added.id], () => {
              instance.overrides!.addedEntities = instance.overrides!.addedEntities!.filter((value) => value !== added);
            });
          }
        return index;
      };
      return visit(template.root, rootId, path, new Set());
    };
    for (const record of source.entities)
      if (record.instance) bind(record.instance, record.id, [], record.id, [record.id], new Set());
    const paths = new Map(
      Array.from(this.entities.values(), (member) => [JSON.stringify([member.root, member.path]), member])
    );
    for (const member of this.entities.values())
      if (member.path.length)
        paths.get(JSON.stringify([member.root, member.path.slice(0, -1)]))!.record.children!.push(member.id);
    for (const member of this.components.values())
      this.entities.get(member.entityId)!.record.components!.push(member.id);
  }
}
