import type { RuntimeProjectManifest } from "@galacean/engine-project/runtime-editor/project/runtime-project";

type RecordValue = Record<string, any>;

/** Import a flat published hierarchy once; subsequent edits retain these stable source IDs. */
export function importRuntimeHierarchy(
  runtime: RecordValue,
  identity: string,
  files: RuntimeProjectManifest["files"],
  isRegisteredComponent: (name: string) => boolean
): RecordValue {
  if (runtime.asset) return runtime;
  if (
    runtime.version !== "2.0" ||
    !Array.isArray(runtime.entities) ||
    !Array.isArray(runtime.components) ||
    !Array.isArray(runtime.refs)
  ) {
    throw new Error(`Cannot import hierarchy '${identity}': expected runtime v2`);
  }
  const entityId = (index: number) => {
    if (!Number.isInteger(index) || !runtime.entities[index]) throw new Error(`Invalid entity index ${index}`);
    return `${identity}:entity:${index}`;
  };
  const componentId = (index: number) => {
    if (!Number.isInteger(index) || !runtime.components[index]) throw new Error(`Invalid component index ${index}`);
    return `${identity}:component:${index}`;
  };
  const reference = (index: number) => {
    const ref = runtime.refs[index];
    if (!Number.isInteger(index) || !ref || typeof ref.url !== "string")
      throw new Error(`Invalid asset reference ${index}`);
    return ref as { url: string; key?: string };
  };
  const assetRef = (index: number) => {
    const ref = reference(index);
    const matches = files.filter((file) => file.virtualPath === ref.url);
    if (matches.length !== 1) throw new Error(`Unregistered project asset '${ref.url}'`);
    return { $ref: matches[0].virtualPath, ...(ref.key === undefined ? {} : { key: ref.key }) };
  };
  const entityIndex = (path: unknown): number => {
    if (!Array.isArray(path) || path.length !== 1)
      throw new Error("Import of references inside Prefab instances requires source topology");
    entityId(path[0]);
    return path[0];
  };
  const componentType = (component: RecordValue): string =>
    component.type === "Script" ? reference(component.script).url : component.type;
  const value = (input: any): any => {
    if (!input || typeof input !== "object") return input;
    if (Array.isArray(input)) return input.map(value);
    if ("$ref" in input) return assetRef(input.$ref);
    if ("$entity" in input) return { $entity: entityId(entityIndex(input.$entity)) };
    if ("$component" in input) {
      const target = input.$component;
      const entity = runtime.entities[entityIndex(target.entity)];
      const candidates = (entity.components ?? []).filter(
        (index: number) => componentType(runtime.components[index]) === target.type
      );
      if (!Number.isInteger(target.index) || candidates[target.index] === undefined)
        throw new Error("Unresolved runtime component reference");
      return { $component: componentId(candidates[target.index]) };
    }
    return Object.fromEntries(Object.entries(input).map(([key, child]) => [key, value(child)]));
  };
  const entities = runtime.entities.map((entity: RecordValue, index: number) => {
    if (entity.instance) {
      const instance = entity.instance;
      const asset = assetRef(instance.asset);
      const file = files.find((file) => file.virtualPath === asset.$ref)!;
      if (file.type.toLowerCase() !== "gltf")
        throw new Error("Import of Prefab instances requires their editable source topology");
      const target = (path: number[]) => {
        if (!Array.isArray(path) || path.some((index) => !Number.isSafeInteger(index) || index < 0))
          throw new Error("Invalid glTF override path");
        return path.length ? path.join("/") : "root";
      };
      const overrides = instance.overrides;
      if (overrides && Object.keys(overrides).some((key) => !["entityProps", "componentProps"].includes(key)))
        throw new Error("Import of structural glTF overrides is not supported");
      const sourceOverrides = overrides && {
        ...(overrides.entityProps
          ? {
              entityProps: overrides.entityProps.map(({ path, ...props }: RecordValue) => ({
                target: target(path),
                ...props
              }))
            }
          : {}),
        ...(overrides.componentProps
          ? {
              componentProps: overrides.componentProps.map(({ path, selector, ...props }: RecordValue) => ({
                target: `${target(path)}:${selector.type}/${selector.index}`,
                ...value(props)
              }))
            }
          : {})
      };
      return {
        ...entity,
        id: entityId(index),
        instance: {
          asset,
          ...(sourceOverrides ? { overrides: sourceOverrides } : {}),
          ...(file.params?.sourceContentRevision ? { sourceContentRevision: file.params.sourceContentRevision } : {})
        }
      };
    }
    return {
      ...entity,
      id: entityId(index),
      ...(entity.children ? { children: entity.children.map(entityId) } : {}),
      ...(entity.components ? { components: entity.components.map(componentId) } : {})
    };
  });
  const components = runtime.components.map((component: RecordValue, index: number) => {
    const result: RecordValue = {
      ...component,
      id: componentId(index),
      ...(component.props ? { props: value(component.props) } : {}),
      ...(component.calls ? { calls: value(component.calls) } : {})
    };
    if (component.type === "Script") {
      const ref = reference(component.script);
      const file = files.find((file) => file.virtualPath === ref.url);
      if (file) result.script = assetRef(component.script);
      else {
        if (!isRegisteredComponent(ref.url)) throw new Error(`Unregistered system component '${ref.url}'`);
        result.type = ref.url;
        delete result.script;
      }
    }
    return result;
  });
  const color = (tuple: number[]) => ({ r: tuple[0], g: tuple[1], b: tuple[2], a: tuple[3] });
  const result: RecordValue = { asset: { version: "2.0" }, entities, components };
  if (runtime.root !== undefined) result.root = entityId(runtime.root);
  if (runtime.scene) {
    const scene = structuredClone(runtime.scene);
    scene.rootEntities = scene.rootEntities.map(entityId);
    if (scene.background) {
      scene.background.color = color(scene.background.color);
      for (const key of ["texture", "skyMesh", "skyMaterial"])
        if (scene.background[key] !== undefined) scene.background[key] = assetRef(scene.background[key]);
    }
    if (scene.ambient) {
      for (const key of ["ambientLight", "customAmbientLight"])
        if (scene.ambient[key] !== undefined) scene.ambient[key] = assetRef(scene.ambient[key]);
      if (scene.ambient.diffuseSolidColor)
        scene.ambient.diffuseSolidColor = { ...color(scene.ambient.diffuseSolidColor), _metaIntensity: 1 };
    }
    if (scene.fog) {
      const fog = scene.fog;
      scene.fog = Object.fromEntries(
        Object.entries({
          mode: fog.fogMode,
          start: fog.fogStart,
          end: fog.fogEnd,
          density: fog.fogDensity,
          color: fog.fogColor ? color(fog.fogColor) : undefined
        }).filter(([, v]) => v !== undefined)
      );
    }
    if (scene.ambientOcclusion?.enabledAmbientOcclusion !== undefined) {
      scene.ambientOcclusion.enabled = scene.ambientOcclusion.enabledAmbientOcclusion;
      delete scene.ambientOcclusion.enabledAmbientOcclusion;
    }
    result.scene = scene;
  }
  return result;
}

/** Refuse migration if the source compiler drops or changes runtime behavior. */
export function assertRuntimeHierarchyEquivalent(before: RecordValue, after: RecordValue): void {
  const canonical = (runtime: RecordValue): string => {
    const ref = (index: number) => {
      const item = runtime.refs[index];
      if (!item) throw new Error(`Unresolved runtime asset reference ${index}`);
      return item;
    };
    const walk = (input: any): any => {
      if (!input || typeof input !== "object") return input;
      if (Array.isArray(input)) return input.map(walk);
      if (typeof input.$ref === "number") return walk(ref(input.$ref));
      const record = { ...input };
      if (record.type === "Script") {
        record.type = ref(record.script).url;
        delete record.script;
      }
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, walk(record[key])])
      );
    };
    const { refs: _, ...body } = structuredClone(runtime);
    if (body.scene?.background) {
      for (const key of ["texture", "skyMesh", "skyMaterial"])
        if (body.scene.background[key] !== undefined) body.scene.background[key] = ref(body.scene.background[key]);
    }
    if (body.scene?.ambient) {
      for (const key of ["ambientLight", "customAmbientLight"])
        if (body.scene.ambient[key] !== undefined) body.scene.ambient[key] = ref(body.scene.ambient[key]);
    }
    return JSON.stringify(walk(body));
  };
  if (canonical(before) !== canonical(after))
    throw new Error("Hierarchy import changes runtime behavior; original data was retained");
}
