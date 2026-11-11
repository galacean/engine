import {
  mutateSourceInstance,
  moveSourceAddition
} from "@galacean/engine-project/runtime-editor/generated/editor-source-compiler";
import { runtimeComponentIdentities, type RuntimeComponentSelector } from "./runtime-component-identity";
import type {} from "../generated/editor-source-schema";
import type { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import {
  instanceMemberId,
  readSourcePrefab,
  RuntimeInstanceSource,
  type InstanceSourceComponent,
  type InstanceSourceEntity
} from "./runtime-instance-source";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { queryPage, type QueryPageOptions } from "../query-page";

export type RuntimeEntityPatch = Pick<
  GalaceanSourceEntitySchema,
  "name" | "position" | "rotation" | "scale" | "isActive" | "layer"
>;
const entityProperties = ["name", "position", "rotation", "scale", "isActive", "layer"] as const;

function instanceEntityPatch(
  instance: GalaceanInstanceSchema,
  target: string,
  props: RuntimeEntityPatch = {}
): GalaceanEntityPropOverride {
  const patches = ((instance.overrides ??= {}).entityProps ??= []);
  const patch = { target, ...Object.assign({}, ...patches.filter((value) => value.target === target)), ...props };
  instance.overrides.entityProps = [...patches.filter((value) => value.target !== target), patch];
  return patch;
}

/** Edits the existing Editor source format; no engine objects or runtime state enter the draft. */
export class RuntimeSceneEdit {
  constructor(
    private readonly project: RuntimeProjectEdit,
    private readonly sceneId: string
  ) {}

  list(): GalaceanSourceEntitySchema[] {
    const source = this.read(),
      members = this.instances(source).entities;
    const records = source.entities.map((record) => {
      const member = members.get(record.id);
      return member
        ? { ...member.record, ...record, children: member.record.children, components: member.record.components }
        : record;
    });
    return [
      ...records,
      ...Array.from(members.values())
        .filter((member) => member.id !== member.root)
        .map((member) => member.record)
    ];
  }

  page(options: QueryPageOptions & { name?: string; parentId?: string | null } = {}) {
    const records = this.list();
    const parents = new Map(
      records.flatMap((record) => (record.children ?? []).map((child) => [child, record.id] as const))
    );
    const rows = records
      .filter(
        (record) =>
          (options.name === undefined || (record.name ?? "").includes(options.name)) &&
          (options.parentId === undefined || (parents.get(record.id) ?? null) === options.parentId)
      )
      .map((record) => ({
        id: record.id,
        name: (record.name ?? "").slice(0, 256),
        nameTruncated: (record.name?.length ?? 0) > 256,
        parentId: parents.get(record.id) ?? null,
        childCount: record.children?.length ?? 0,
        componentCount: record.components?.length ?? 0
      }));
    return queryPage(
      rows,
      [this.sceneId, options.name ?? null, options.parentId === undefined ? ["all"] : ["parent", options.parentId]],
      options
    );
  }

  readEntity(id: string) {
    const entity = this.list().find((record) => record.id === id);
    if (!entity) throw new Error(`Unknown entity '${id}'`);
    return entity;
  }

  queryComponents(selector: RuntimeComponentSelector = {}) {
    const source = this.read();
    return [
      ...runtimeComponentIdentities(source, this.sceneId, selector),
      ...Array.from(this.instances(source).components.values())
        .map(({ id, entityId, record }) => ({ scene: this.sceneId, id, entityId, type: record.type }))
        .filter(
          (identity) =>
            (selector.id === undefined || identity.id === selector.id) &&
            (selector.entityId === undefined || identity.entityId === selector.entityId) &&
            (selector.type === undefined || identity.type === selector.type)
        )
    ];
  }

  readComponent(id: string) {
    const source = this.read();
    const identity = runtimeComponentIdentities(source, this.sceneId, { id })[0];
    if (identity) return { ...source.components.find((component) => component.id === id)!, ...identity };
    const member = this.instanceComponent(source, id);
    return { ...member.record, scene: this.sceneId, entityId: member.entityId };
  }

  /** Resolve native references in the owner's template scope, or explicit Scene/instance scope. */
  resolveComponentReference(reference: GalaceanComponentRef, ownerId?: string): string | undefined {
    const source = this.read(),
      instances = this.instances(source),
      target = reference.$component;
    if (typeof target === "string") {
      const owner = ownerId && instances.components.get(ownerId);
      const scope =
        owner &&
        (owner.nested
          ? [owner.nested.rootSceneEntityId, ...owner.nested.sourceEntityPath]
          : instances.entities.get(owner.entityId)?.scope);
      if (scope) {
        const member = instances.components.get(instanceMemberId(scope, target));
        if (member) return member.id;
      }
      return source.components.some((component) => component.id === target) || instances.components.has(target)
        ? target
        : undefined;
    }
    if (!target || typeof target.instance !== "string" || typeof target.target !== "string") return;
    const members = [...instances.components.values()].filter(
      (member) => instances.entities.get(member.entityId)?.root === target.instance && member.target === target.target
    );
    return members.length === 1 ? members[0].id : undefined;
  }

  /** Convert a public identity into the existing native Source reference layout. */
  componentReference(id: string): GalaceanComponentRef {
    const source = this.read();
    if (source.components.some((component) => component.id === id)) return { $component: id };
    const member = this.instanceComponent(source, id);
    if (member.nested) throw new Error("A nested template reference must be authored in its local component scope.");
    return {
      $component: { instance: this.instances(source).entities.get(member.entityId)!.root, target: member.target }
    };
  }

  create(input: RuntimeEntityPatch & { name: string; parentEntityId?: string; prefab?: string }): { id: string } {
    const scene = this.read();
    const { parentEntityId, prefab, ...props } = input;
    const parent = scene.entities.find((entity) => entity.id === parentEntityId);
    const id = crypto.randomUUID();
    const template = prefab === undefined ? undefined : readSourcePrefab(this.lookupInstanceAsset, prefab);
    if (prefab !== undefined && !template)
      throw Error(`Expected an editable Prefab asset '${prefab}'`);
    const entity: GalaceanSourceEntitySchema =
      prefab === undefined
        ? { ...props, id, components: [] }
        : {
            id,
            instance: {
              asset: { $ref: prefab },
              overrides: { entityProps: [{ target: template!.root, ...props }] }
            }
          };
    if (parentEntityId !== undefined && (!parent || parent.instance)) {
      const member = this.instanceEntity(scene, parentEntityId);
      if (member.nested) {
        this.write(
          mutateSourceInstance(scene, this.sourceOptions(), member.nested, "create", { target: member.target, entity })
        );
        return { id };
      }
      const inline: GalaceanInlineEntitySchema & { id: string } =
        prefab === undefined
          ? { ...props, id, components: [] }
          : {
              id,
              instance: {
                asset: { $ref: prefab },
                overrides: {
                  entityProps: [{ target: template!.root, ...props }]
                }
              }
            };
      if (member.inline && !member.inline.instance) (member.inline.children ??= []).push(inline);
      else {
        const { instance, target } = this.instanceOwner(member);
        ((instance.overrides ??= {}).addedEntities ??= []).push({ id, parent: target, entity: inline });
      }
      this.write(scene);
      return { id };
    }
    scene.entities.push(entity);
    if (parent) (parent.children ??= []).push(id);
    else scene.scene.rootEntities.push(id);
    this.write(scene);
    return { id };
  }

  update(id: string, patch: RuntimeEntityPatch): void {
    const scene = this.read();
    let entity: RuntimeEntityPatch | undefined = scene.entities.find((entity) => entity.id === id);
    if (!entity || (entity as GalaceanSourceEntitySchema).instance) {
      const member = this.instanceEntity(scene, id);
      if (member.nested) {
        this.editNested(scene, member, "entity.update", { props: patch });
        return;
      }
      if (member.inline && !member.inline.instance) entity = member.inline;
      else {
        const { instance, target } = this.instanceOwner(member);
        entity = instanceEntityPatch(instance, target);
      }
    }
    // Only the public transform/state slots can be patched; identity and ownership stay stable.
    for (const key of entityProperties) {
      if (patch[key] !== undefined) Object.assign(entity, { [key]: structuredClone(patch[key]) });
    }
    this.write(scene);
  }

  revert(id: string, keys: readonly (keyof RuntimeEntityPatch)[] = entityProperties): void {
    const scene = this.read(),
      source = scene.entities.find((entity) => entity.id === id);
    const member = this.instanceEntity(scene, id);
    if (member.nested) {
      this.editNested(scene, member, "entity.revert", { keys });
      return;
    }
    if (member.inline && !member.inline.instance) throw Error("An added entity has no template properties to revert");
    const { instance, target } = this.instanceOwner(member);
    if (source) for (const key of keys) delete source[key];
    for (const patch of instance.overrides?.entityProps ?? [])
      if (patch.target === target) for (const key of keys) delete patch[key];
    if (instance.overrides?.entityProps) {
      instance.overrides.entityProps = instance.overrides.entityProps.filter((patch) =>
        Object.keys(patch).some((key) => key !== "target")
      );
      if (!instance.overrides.entityProps.length) delete instance.overrides.entityProps;
      if (!Object.keys(instance.overrides).length) delete instance.overrides;
    }
    this.write(scene);
  }

  /** Move Scene subtrees into native inline overrides, or move local additions within their owner. */
  reparent(id: string, parentEntityId: string | null, preserveWorld = true): void {
    const scene = this.read(),
      instances = this.instances(scene);
    const records = new Map(this.list().map((record) => [record.id, record]));
    if (!records.has(id)) throw Error(`Unknown entity '${id}'`);
    if (parentEntityId !== null && !records.has(parentEntityId)) throw Error(`Unknown entity '${parentEntityId}'`);
    const parents = new Map<string, string>();
    for (const record of records.values()) for (const child of record.children ?? []) parents.set(child, record.id);
    const visited = new Set<string>();
    for (
      let current: string | undefined = parentEntityId ?? undefined;
      current !== undefined;
      current = parents.get(current)
    ) {
      if (current === id || visited.has(current)) throw Error("Cannot reparent an entity to itself or its descendant");
      visited.add(current);
    }
    if ((parents.get(id) ?? null) === parentEntityId) return;
    const sourceEntity = scene.entities.find((entity) => entity.id === id);
    const sourceParent = scene.entities.find((entity) => entity.id === parentEntityId);
    const member = instances.entities.get(id),
      parentMember = parentEntityId === null ? undefined : instances.entities.get(parentEntityId);
    if (sourceEntity) {
      if (parentEntityId !== null && (!sourceParent || sourceParent.instance)) {
        if (!parentMember) throw Error("Prefab parenting requires editable Source topology");
      }
    } else {
      if (!member?.inline || !member.removeAdded) throw Error("Cannot reparent a template-owned Prefab entity");
    }
    const transform = preserveWorld ? reparentTransform(records, parents, id, parentEntityId) : undefined;
    if (!sourceEntity) {
      const owner = parentMember && this.instanceOwner(parentMember);
      const address = parentMember
        ? (parentMember.nested ?? {
            rootSceneEntityId: parentMember.inline?.instance ? parentMember.id : parentMember.scope[0],
            sourceEntityPath: []
          })
        : undefined;
      this.write(
        moveSourceAddition(scene, this.sourceOptions(), id, parentEntityId, address, owner?.target, preserveWorld)
      );
      return;
    }
    if (parentMember?.nested) {
      this.write(
        moveSourceAddition(
          scene,
          this.sourceOptions(),
          id,
          parentEntityId,
          parentMember.nested,
          parentMember.target,
          preserveWorld
        )
      );
      return;
    }
    if (sourceEntity) {
      if (parentMember) {
        const removedEntities = new Set<string>(),
          removedComponents = new Set<string>();
        const convert = (record: GalaceanSourceEntitySchema): GalaceanInlineEntitySchema & { id: string } => {
          removedEntities.add(record.id);
          const { children, components, instance, ...props } = record;
          if (instance) {
            const template = readSourcePrefab(this.lookupInstanceAsset, instance.asset.$ref);
            if (!template) throw Error("Moving an instance requires editable Prefab Source topology");
            const { id: _, ...rootProps } = props;
            instanceEntityPatch(instance, template.root, rootProps);
            return { id: record.id, instance };
          }
          return {
            ...props,
            components: (components ?? []).map((id) => {
              const component = scene.components.find((component) => component.id === id);
              if (!component) throw Error(`Unknown component '${id}'`);
              removedComponents.add(id);
              return component;
            }),
            children: (children ?? []).map((id) => convert(this.entity(scene, id)))
          };
        };
        const inline = convert(sourceEntity);
        if (transform) {
          if (inline.instance) {
            const target = readSourcePrefab(this.lookupInstanceAsset, inline.instance.asset.$ref)!.root;
            instanceEntityPatch(inline.instance, target, transform);
          } else Object.assign(inline, transform);
        }
        if (parentMember.inline && !parentMember.inline.instance) (parentMember.inline.children ??= []).push(inline);
        else {
          const { instance, target } = this.instanceOwner(parentMember);
          ((instance.overrides ??= {}).addedEntities ??= []).push({ id, parent: target, entity: inline });
        }
        scene.entities = scene.entities.filter((record) => !removedEntities.has(record.id));
        scene.components = scene.components.filter((record) => !removedComponents.has(record.id));
        for (const record of scene.entities)
          if (record.children) record.children = record.children.filter((id) => !removedEntities.has(id));
        scene.scene.rootEntities = scene.scene.rootEntities.filter((id) => !removedEntities.has(id));
        this.write(scene);
        return;
      }
      for (const record of scene.entities)
        if (record.children) record.children = record.children.filter((child) => child !== id);
      scene.scene.rootEntities = scene.scene.rootEntities.filter((root) => root !== id);
      if (sourceParent) (sourceParent.children ??= []).push(id);
      else scene.scene.rootEntities.push(id);
      if (transform) {
        if (sourceEntity.instance) {
          const target = readSourcePrefab(this.lookupInstanceAsset, sourceEntity.instance.asset.$ref)!.root;
          instanceEntityPatch(sourceEntity.instance, target, transform);
        } else Object.assign(sourceEntity, transform);
      }
    }
    this.write(scene);
  }

  delete(id: string): void {
    const scene = this.read();
    if (!scene.entities.some((entity) => entity.id === id)) {
      const members = this.instances(scene),
        member = members.entities.get(id);
      if (!member) throw Error(`Unknown entity '${id}'`);
      if (member.nested) {
        this.editNested(scene, member, "entity.delete", {});
        return;
      }
      if (member.removeAdded) member.removeAdded();
      else {
        const template = readSourcePrefab(this.lookupInstanceAsset, member.instance.asset.$ref)!;
        const nodes = new Map(template.entities.map((entity) => [entity.id, entity]));
        const removed = new Set<string>(),
          components = new Set<string>(),
          pending = [member.target];
        while (pending.length) {
          const key = pending.pop()!;
          if (removed.has(key)) continue;
          removed.add(key);
          const node = nodes.get(key)!;
          if (!node.instance) {
            pending.push(...(node.children ?? []));
            for (const id of node.components ?? []) components.add(id);
          }
        }
        const overrides = (member.instance.overrides ??= {});
        overrides.removedEntities = [
          ...(overrides.removedEntities ?? []).filter((value) => !removed.has(value)),
          member.target
        ];
        overrides.entityProps = overrides.entityProps?.filter((value) => !removed.has(value.target));
        overrides.componentProps = overrides.componentProps?.filter((value) => !components.has(value.target));
        overrides.removedComponents = overrides.removedComponents?.filter((value) => !components.has(value));
        overrides.addedComponents = overrides.addedComponents?.filter((value) => !removed.has(value.owner));
        overrides.addedEntities = overrides.addedEntities?.filter((value) => !removed.has(value.parent));
      }
      this.write(scene);
      return;
    }
    const removed = new Set<string>();
    const pending = [id];
    while (pending.length) {
      const current = pending.pop()!;
      if (removed.has(current)) continue;
      const entity = this.entity(scene, current);
      removed.add(current);
      pending.push(...(entity.children ?? []));
    }
    const removedComponents = new Set(
      scene.entities.filter((entity) => removed.has(entity.id)).flatMap((entity) => entity.components ?? [])
    );
    scene.entities = scene.entities.filter((entity) => !removed.has(entity.id));
    for (const entity of scene.entities)
      if (entity.children) entity.children = entity.children.filter((child) => !removed.has(child));
    scene.components = scene.components.filter((component) => !removedComponents.has(component.id));
    scene.scene.rootEntities = scene.scene.rootEntities.filter((root) => !removed.has(root));
    this.write(scene);
  }

  addComponent(entityId: string, input: Omit<GalaceanSourceComponentSchema, "id">): { id: string } {
    const scene = this.read();
    const entity = scene.entities.find((entity) => entity.id === entityId);
    const id = crypto.randomUUID();
    if (!entity || entity.instance) {
      const member = this.instanceEntity(scene, entityId);
      if (member.nested) {
        this.editNested(scene, member, "component.add", { id, value: input });
        return { id: member.inline ? id : instanceMemberId(member.scope, id) };
      }
      if (member.inline && !member.inline.instance)
        (member.inline.components ??= []).push({ ...structuredClone(input), id });
      else {
        const { instance, target } = this.instanceOwner(member);
        ((instance.overrides ??= {}).addedComponents ??= []).push({
          id,
          owner: target,
          component: structuredClone(input)
        });
      }
      this.write(scene);
      return {
        id:
          member.inline && !member.inline.instance
            ? id
            : instanceMemberId(member.inline?.instance ? [member.id] : member.scope, id)
      };
    }
    scene.components.push({ ...structuredClone(input), id });
    (entity.components ??= []).push(id);
    this.write(scene);
    return { id };
  }

  updateComponent(id: string, props: GalaceanSourceValueRecord): void {
    const scene = this.read();
    const component = scene.components.find((component) => component.id === id);
    if (component) component.props = { ...component.props, ...structuredClone(props) };
    else {
      const member = this.instanceComponent(scene, id);
      if (member.nested) {
        if (member.added) this.editNested(scene, member, "component.update", { props });
        else {
          const values = sourceOverrideValue(member.base.props ?? {}, props) as GalaceanSourceValueRecord | undefined;
          const inherited = Object.keys(props).filter((key) => !Object.hasOwn(values ?? {}, key));
          if (inherited.length) this.editNested(scene, member, "component.revert", { keys: inherited });
          if (values) this.editNested(this.read(), member, "component.update", { props: values });
        }
        return;
      }
      if (member.added) member.added.props = { ...member.added.props, ...structuredClone(props) };
      else {
        const overrides = (member.instance.overrides ??= {});
        const patches = (overrides.componentProps ??= []);
        const values: GalaceanSourceValueRecord = {};
        for (const [key, value] of Object.entries(props)) {
          for (const patch of patches) if (patch.target === member.target) delete patch.props?.[key];
          const override = sourceOverrideValue(member.base.props?.[key], value);
          if (override !== undefined) values[key] = override;
        }
        // Property edits retain explicit method calls; only a full revert removes them.
        if (Object.keys(values).length) patches.push({ target: member.target, props: values });
        this.pruneOverride(member);
      }
    }
    this.write(scene);
  }

  /** Restore template inheritance, including properties whose default is owned by the Engine. */
  revertComponent(id: string, keys?: readonly string[]): void {
    const scene = this.read();
    const member = this.instanceComponent(scene, id);
    if (member.nested) {
      this.editNested(scene, member, "component.revert", { keys });
      return;
    }
    if (member.added) throw Error("An added component has no template override to revert");
    const patches = member.instance.overrides?.componentProps?.filter((patch) => patch.target === member.target) ?? [];
    for (const patch of patches) {
      if (keys) for (const key of keys) delete patch.props?.[key];
      else {
        delete patch.props;
        delete patch.calls;
      }
    }
    if (patches.length) this.pruneOverride(member);
    this.write(scene);
  }

  removeComponent(id: string): void {
    const scene = this.read();
    if (!scene.components.some((component) => component.id === id)) {
      const member = this.instanceComponent(scene, id);
      if (member.nested) {
        this.editNested(scene, member, "component.delete", {});
        return;
      }
      const overrides = (member.instance.overrides ??= {});
      if (member.added) {
        if (member.inlineOwner) {
          if (member.inlineOwner.components!.some((value) => !value.id))
            throw Error("Inline components need explicit Source IDs before removal; positional identities would shift");
          member.inlineOwner.components = member.inlineOwner.components!.filter((value) => value !== member.added);
        } else
          overrides.addedComponents = overrides.addedComponents!.filter((value) => value.component !== member.added);
      } else {
        (overrides.removedComponents ??= []).push(member.target);
        overrides.componentProps = overrides.componentProps?.filter((value) => value.target !== member.target);
      }
      this.write(scene);
      return;
    }
    scene.components = scene.components.filter((component) => component.id !== id);
    for (const entity of scene.entities)
      if (entity.components) entity.components = entity.components.filter((component) => component !== id);
    this.write(scene);
  }

  private read(): GalaceanSourceSceneFile {
    const content = this.project.read(this.sceneId);
    if (typeof content !== "string") throw new Error("Scene source is not text");
    const scene = JSON.parse(content);
    if (
      scene.asset?.version !== "2.0" ||
      !scene.scene ||
      !Array.isArray(scene.entities) ||
      !Array.isArray(scene.components)
    ) {
      throw new Error("Scene must use editable Editor v2 source");
    }
    return scene;
  }
  private write(scene: GalaceanSourceSceneFile): void {
    this.project.update(this.sceneId, JSON.stringify(scene));
  }
  private readonly lookupInstanceAsset = (path: string) => this.project.lookupTextAsset(path);

  private instances(scene: GalaceanSourceSceneFile) {
    return new RuntimeInstanceSource(scene, this.lookupInstanceAsset);
  }
  private instanceComponent(scene: GalaceanSourceSceneFile, id: string): InstanceSourceComponent {
    const member = this.instances(scene).components.get(id);
    if (!member) throw Error(`Unknown component '${id}'`);
    return member;
  }
  private instanceEntity(scene: GalaceanSourceSceneFile, id: string): InstanceSourceEntity {
    const member = this.instances(scene).entities.get(id);
    if (!member) throw Error(`Unknown entity '${id}'`);
    return member;
  }
  private instanceOwner(member: InstanceSourceEntity) {
    const instance = member.inline?.instance ?? member.instance;
    const target = member.inline?.instance
      ? readSourcePrefab(this.lookupInstanceAsset, instance.asset.$ref)!.root
      : member.target;
    return { instance, target };
  }
  private sourceOptions() {
    return {
      resolveInstanceSourceFile: (path: string) => readSourcePrefab(this.lookupInstanceAsset, path),
      resolveInstanceAssetKind: (path: string): "Prefab" | "glTF" =>
        this.lookupInstanceAsset(path)?.type === "glTF"
          ? "glTF"
          : "Prefab"
    };
  }
  private editNested(
    scene: GalaceanSourceSceneFile,
    member: InstanceSourceComponent | InstanceSourceEntity,
    action: string,
    input: Record<string, unknown>
  ) {
    this.write(
      mutateSourceInstance(scene, this.sourceOptions(), member.nested!, action, {
        ...input,
        ...("base" in member ? { component: member.target } : { target: member.target })
      })
    );
  }
  private pruneOverride(member: InstanceSourceComponent): void {
    const overrides = member.instance.overrides!;
    for (const patch of overrides.componentProps ?? [])
      if (patch.props && !Object.keys(patch.props).length) delete patch.props;
    overrides.componentProps = overrides.componentProps?.filter((patch) => patch.props || patch.calls?.length);
    if (!overrides.componentProps?.length) delete overrides.componentProps;
    if (!Object.keys(overrides).length) delete member.instance.overrides;
  }
  private entity(scene: GalaceanSourceSceneFile, id: string): GalaceanSourceEntitySchema {
    const entity = scene.entities.find((entity) => entity.id === id);
    if (!entity) throw new Error(`Unknown entity '${id}'`);
    return entity;
  }
}

function reparentTransform(
  records: Map<string, GalaceanSourceEntitySchema>,
  parents: Map<string, string>,
  id: string,
  parent: string | null
): RuntimeEntityPatch {
  const matrices = new Map<string, Matrix>(),
    visiting = new Set<string>();
  const world = (id: string): Matrix => {
    const cached = matrices.get(id);
    if (cached) return cached;
    if (visiting.has(id)) throw Error("Cyclic authoring hierarchy");
    visiting.add(id);
    const record = records.get(id)!;
    const rotation = new Quaternion(),
      matrix = new Matrix();
    const radians = Math.PI / 180,
      angles = record.rotation ?? [0, 0, 0];
    Quaternion.rotationEuler(angles[0] * radians, angles[1] * radians, angles[2] * radians, rotation);
    Matrix.affineTransformation(
      new Vector3(...(record.scale ?? [1, 1, 1])),
      rotation,
      new Vector3(...(record.position ?? [0, 0, 0])),
      matrix
    );
    const parent = parents.get(id);
    if (parent) Matrix.multiply(world(parent), matrix, matrix);
    visiting.delete(id);
    matrices.set(id, matrix);
    return matrix;
  };
  const matrix = world(id).clone();
  if (parent !== null) {
    const parentMatrix = world(parent);
    if (!Number.isFinite(parentMatrix.determinant()) || Math.abs(parentMatrix.determinant()) < 1e-10)
      throw Error("Cannot preserve world transform under a singular parent");
    const inverse = new Matrix();
    Matrix.invert(parentMatrix, inverse);
    Matrix.multiply(inverse, matrix, matrix);
  }
  const position = new Vector3(),
    rotation = new Quaternion(),
    scale = new Vector3();
  if (!matrix.decompose(position, rotation, scale)) throw Error("Cannot decompose the new local transform");
  const rebuilt = new Matrix();
  Matrix.affineTransformation(scale, rotation, position, rebuilt);
  if (
    matrix.elements.some(
      (value, i) =>
        !Number.isFinite(value) || Math.abs(value - rebuilt.elements[i]) > 1e-5 * Math.max(1, Math.abs(value))
    )
  )
    throw Error("Cannot preserve world transform: the new local matrix contains shear");
  const angles = rotation.toEuler(new Vector3()),
    degrees = 180 / Math.PI;
  return {
    position: [position.x, position.y, position.z],
    rotation: [angles.x * degrees, angles.y * degrees, angles.z * degrees],
    scale: [scale.x, scale.y, scale.z]
  };
}

function sameSourceValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        sameSourceValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    )
  );
}

/** Match Source's deep merge: arrays and reference/sentinel records are atomic values. */
function sourceOverrideValue(
  base: GalaceanSourceValue | undefined,
  value: GalaceanSourceValue
): GalaceanSourceValue | undefined {
  if (value === undefined || sameSourceValue(base, value)) return;
  const record = (value: unknown): value is GalaceanSourceValueRecord =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const sentinel = (value: GalaceanSourceValueRecord) =>
    ["$ref", "$entity", "$component", "$signal", "$type", "$class", "$number"].some((key) => key in value);
  if (!record(base) || !record(value) || sentinel(base) || sentinel(value)) return structuredClone(value);
  const result: GalaceanSourceValueRecord = {};
  for (const [key, child] of Object.entries(value)) {
    const override = sourceOverrideValue(base[key], child);
    if (override !== undefined) result[key] = override;
  }
  return Object.keys(result).length ? result : undefined;
}
