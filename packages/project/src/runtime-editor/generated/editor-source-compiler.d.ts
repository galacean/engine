/** Generated implementation uses Runtime Editor virtual-path source schema validation before compilation. */
export interface SourceCompileOptions {
  resolveInstanceSourceFile?: (path: string) => unknown;
  resolveInstanceAssetKind?: (path: string) => "Prefab" | "glTF" | undefined;
  resolveAssetContentRevision?: (path: string) => string | undefined;
  componentRuntimeCapabilitySnapshot?: ComponentRuntimeCapabilitySnapshot;
}
export function compileSourceSceneToRuntime(
  source: unknown,
  resolveAssetUrl: (path: string) => string,
  options?: SourceCompileOptions
): Record<string, unknown>;
export function compileSourcePrefabToRuntime(
  source: unknown,
  resolveAssetUrl: (path: string) => string,
  options?: SourceCompileOptions
): Record<string, unknown>;

export interface ComponentRuntimeCapabilitySnapshot {
  readonly capabilities: Readonly<Record<string, { readonly propertySetters: Readonly<Record<string, string>> }>>;
  readonly setterProperties: readonly string[];
}
export function getBuiltinComponentRuntimeCapabilitySnapshot(): ComponentRuntimeCapabilitySnapshot;

export function runtimeSourceReferenceIds(
  source: unknown,
  options?: SourceCompileOptions
): { entities: string[]; components: string[] };

export interface SourceAddress {
  rootSceneEntityId: string;
  sourceEntityPath: string[];
}
export function sourceNestedViews(
  source: GalaceanSourceSceneFile,
  options: SourceCompileOptions
): Array<{ address: SourceAddress; baseline: GalaceanSourcePrefabFile; instance: GalaceanInstanceSchema }>;
export function mutateSourceInstance(
  source: GalaceanSourceSceneFile,
  options: SourceCompileOptions,
  address: SourceAddress,
  action: string,
  input: Record<string, unknown>
): GalaceanSourceSceneFile;
export function moveSourceAddition(
  source: GalaceanSourceSceneFile,
  options: SourceCompileOptions,
  id: string,
  parentId: string | null,
  address: SourceAddress | undefined,
  target: string | undefined,
  preserveWorld: boolean
): GalaceanSourceSceneFile;
