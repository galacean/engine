import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import type {
  RuntimeProjectEdit,
  RuntimeSceneChangeSet
} from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { sameRuntimeProjectContent } from "@galacean/engine-project/runtime-editor/project/runtime-project-content";
import type {} from "./generated/editor-source-schema";

export type PreparationReadonly<T> = T extends readonly (infer E)[]
  ? readonly PreparationReadonly<E>[]
  : T extends object
    ? { readonly [K in keyof T]: PreparationReadonly<T[K]> }
    : T;

function freeze<T>(value: T): PreparationReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as PreparationReadonly<T>;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Immutable parsed hierarchy, shared by readers of the same transaction/source version. */
export class RuntimePreparationScene {
  readonly source: PreparationReadonly<GalaceanSourceSceneFile>;
  readonly hasInstances: boolean;
  readonly #entities = new Map<string, PreparationReadonly<GalaceanSourceEntitySchema>>();
  readonly #components = new Map<string, PreparationReadonly<GalaceanSourceComponentSchema>>();
  readonly #owners = new Map<string, string>();
  readonly #parents = new Map<string, string>();
  readonly #types = new Map<string, readonly PreparationReadonly<GalaceanSourceComponentSchema>[]>();
  constructor(readonly text: string) {
    const source = JSON.parse(text) as GalaceanSourceSceneFile;
    if (
      source.asset?.version !== "2.0" ||
      !source.scene ||
      !Array.isArray(source.entities) ||
      !Array.isArray(source.components)
    )
      throw Error("Preparation requires editable Scene source");
    this.source = freeze(source);
    this.hasInstances = source.entities.some((entity) => !!entity.instance) || !!source.prefab;
    for (const entity of this.source.entities) {
      this.#entities.set(entity.id, entity);
      for (const id of entity.components ?? []) this.#owners.set(id, entity.id);
      for (const id of entity.children ?? []) this.#parents.set(id, entity.id);
    }
    const types = new Map<string, PreparationReadonly<GalaceanSourceComponentSchema>[]>();
    for (const component of this.source.components) {
      this.#components.set(component.id, component);
      const entries = types.get(component.type) ?? [];
      entries.push(component);
      types.set(component.type, entries);
    }
    for (const [type, entries] of types) this.#types.set(type, Object.freeze(entries));
    Object.freeze(this);
  }
  entity(id: string) {
    return this.#entities.get(id);
  }
  component(id: string) {
    return this.#components.get(id);
  }
  owner(id: string) {
    return this.#owners.get(id);
  }
  parent(id: string) {
    return this.#parents.get(id);
  }
  components(types: readonly string[], prefixes: readonly string[] = []) {
    return Object.freeze(
      [...this.#types].flatMap(([type, entries]) =>
        types.includes(type) || prefixes.some((prefix) => type.startsWith(prefix)) ? entries : []
      )
    );
  }
  /** A cycle is not a reason to skip a validator. */
  ancestors(id: string): readonly string[] {
    const result: string[] = [],
      visited = new Set<string>();
    for (let current: string | undefined = id; current; current = this.#parents.get(current)) {
      if (visited.has(current)) throw Error("Cyclic Scene hierarchy in preparation inputs");
      visited.add(current);
      result.push(current);
    }
    return Object.freeze(result);
  }
}

/** Detached read surface. Binary reads return copies; no mutable project/maps escape. */
export class RuntimePreparationView {
  readonly project: PreparationReadonly<RuntimeProjectPackage["project"]>;
  readonly documents: Readonly<Record<string, string>>;
  readonly version: number;
  readonly #contents: RuntimeProjectPackage["contents"];
  readonly #scenes: Map<string, RuntimePreparationScene>;
  constructor(pack: RuntimeProjectPackage, scenes = new Map<string, RuntimePreparationScene>()) {
    this.project = freeze(structuredClone(pack.project));
    this.documents = Object.freeze({ ...pack.documents });
    this.version = pack.version;
    this.#contents = Object.fromEntries(
      Object.entries(pack.contents).map(([path, value]) => [
        path,
        typeof value === "string" ? value : new Uint8Array(value)
      ])
    );
    this.#scenes = scenes;
    Object.freeze(this);
  }
  content(path: string): string | Uint8Array | undefined {
    const content = this.#contents[path];
    return content instanceof Uint8Array ? new Uint8Array(content) : content;
  }
  sameContent(other: RuntimePreparationView, path: string): boolean {
    return sameRuntimeProjectContent(this.#contents[path], other.#contents[path]);
  }
  scene(path = this.project.scene): RuntimePreparationScene {
    const content = this.#contents[path];
    if (typeof content !== "string") throw Error(`Scene '${path}' is not loaded`);
    let scene = this.#scenes.get(content);
    if (!scene) this.#scenes.set(content, (scene = new RuntimePreparationScene(content)));
    return scene;
  }
}

/** Declarative source dependencies. Omitted categories are asserted irrelevant by the extension.
 * Registration requires initialized host authoring, just like legacy scoped preparation.
 * Untracked Scene writes and Prefab topology always fall back to executing the extension. */
export interface RuntimePreparationDependencies {
  scene: {
    componentTypes: readonly string[];
    componentTypePrefixes?: readonly string[];
    hierarchy?: boolean;
    settings?: boolean;
  };
  assets?: "all" | "referenced";
  /** Namespace changes include addition/removal/type/URL/params, not derived dependency edges. */
  namespace?: boolean;
  documents?: "all" | readonly string[];
  /** Only use when asset descriptions cannot affect this extension. */
  ignoreAssetDescriptions?: boolean;
}
export interface RuntimePreparationOptions {
  name: string;
  dependencies: RuntimePreparationDependencies;
}

export class RuntimePreparationContext {
  readonly changes: Readonly<{
    assets: readonly string[];
    documents: readonly string[];
    scenes: PreparationReadonly<Record<string, RuntimeSceneChangeSet>>;
    namespace: boolean;
  }>;
  constructor(
    readonly before: RuntimePreparationView,
    readonly after: RuntimePreparationView,
    journals: Record<string, RuntimeSceneChangeSet>
  ) {
    const a = new Map(before.project.files.map((file) => [file.virtualPath, file]));
    const b = new Map(after.project.files.map((file) => [file.virtualPath, file]));
    const signature = (file: (typeof before.project.files)[number] | undefined) => {
      if (!file) return undefined;
      const { dependencies: _, ...identity } = file;
      return identity;
    };
    const paths = [...new Set([...a.keys(), ...b.keys()])];
    const namespace =
      before.version !== after.version ||
      !same({ ...before.project, files: undefined }, { ...after.project, files: undefined }) ||
      paths.some((path) => !same(signature(a.get(path)), signature(b.get(path))));
    this.changes = freeze({
      assets: paths.filter(
        (path) => !same(signature(a.get(path)), signature(b.get(path))) || !before.sameContent(after, path)
      ),
      documents: [...new Set([...Object.keys(before.documents), ...Object.keys(after.documents)])].filter(
        (path) => before.documents[path] !== after.documents[path]
      ),
      scenes: journals,
      namespace
    });
    Object.freeze(this);
  }

  affected(dependencies: RuntimePreparationDependencies): boolean {
    const { before, after, changes } = this;
    if (before.project.scene !== after.project.scene || before.version !== after.version) return true;
    if (dependencies.namespace && changes.namespace) return true;
    const documents = dependencies.documents;
    if (
      changes.documents.some(
        (path) =>
          (!dependencies.ignoreAssetDescriptions || !path.endsWith(".meta")) &&
          (documents === "all" || documents?.includes(path))
      )
    )
      return true;
    const path = after.project.scene;
    const previous = before.scene(path),
      current = after.scene(path);
    // Linked/unknown topology may contain selected types not visible in ordinary records.
    if (previous.hasInstances || current.hasInstances) return true;
    if (previous.text !== current.text) {
      const journal = changes.scenes[path];
      if (!journal || journal.before !== previous.text || journal.after !== current.text) return true;
      if (dependencies.scene.settings && !same(previous.source.scene, current.source.scene)) return true;
      const types = new Set(dependencies.scene.componentTypes);
      const selected = (type: string) =>
        types.has(type) || dependencies.scene.componentTypePrefixes?.some((prefix) => type.startsWith(prefix));
      for (const id of journal.components) {
        const old = previous.component(id),
          next = current.component(id);
        if ((old && selected(old.type)) || (next && selected(next.type)))
          if (!same(old, next) || previous.owner(id) !== current.owner(id)) return true;
      }
      if (dependencies.scene.hierarchy) {
        const ancestors = new Set<string>();
        for (const view of [previous, current])
          for (const component of view.components(
            dependencies.scene.componentTypes,
            dependencies.scene.componentTypePrefixes
          )) {
            const owner = view.owner(component.id);
            if (owner) for (const id of view.ancestors(owner)) ancestors.add(id);
          }
        for (const id of journal.entities) {
          if (!ancestors.has(id)) continue;
          // Adding an unrelated Component changes ownership lists, not the watched Entity's transform/state.
          const entityFacts = (entity: ReturnType<RuntimePreparationScene["entity"]>) => {
            if (!entity) return undefined;
            const { components: _, ...facts } = entity;
            return facts;
          };
          if (!same(entityFacts(previous.entity(id)), entityFacts(current.entity(id)))) return true;
        }
      }
    }
    const assets = changes.assets.filter((asset) => asset !== path);
    if (!assets.length || !dependencies.assets) return false;
    if (dependencies.assets === "all") return true;
    for (const view of [before, after]) {
      const inputs = new Set<string>();
      const collect = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          if (key === "$ref" && typeof child === "string") inputs.add(child);
          else collect(child);
        }
      };
      for (const component of view
        .scene()
        .components(dependencies.scene.componentTypes, dependencies.scene.componentTypePrefixes))
        collect(component);
      const files = new Map(view.project.files.map((file) => [file.virtualPath, file]));
      const pending = [...inputs];
      for (let i = 0; i < pending.length; i++) {
        if (assets.includes(pending[i])) return true;
        const file = files.get(pending[i]);
        if (!file || file.dependencies === undefined) return true;
        for (const dependency of file.dependencies)
          if (!inputs.has(dependency)) {
            inputs.add(dependency);
            pending.push(dependency);
          }
      }
    }
    return false;
  }
}

/** Transaction lifetime only. A new draft revision creates a new snapshot; unchanged Scene text shares parsing. */
export class RuntimePreparationViews {
  readonly before: RuntimePreparationView;
  readonly #scenes = new Map<string, RuntimePreparationScene>();
  #revision = -1;
  #context?: RuntimePreparationContext;
  constructor(pack: RuntimeProjectPackage) {
    this.before = new RuntimePreparationView(pack, this.#scenes);
  }
  current(draft: RuntimeProjectEdit): RuntimePreparationContext {
    if (this.#revision !== draft.revision) {
      this.#context = new RuntimePreparationContext(
        this.before,
        new RuntimePreparationView(draft.preview(), this.#scenes),
        draft.sceneChangeSets()
      );
      this.#revision = draft.revision;
    }
    return this.#context!;
  }
}
