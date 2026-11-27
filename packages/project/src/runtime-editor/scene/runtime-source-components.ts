/** Component slots in the current Editor Source contract, including Scene-owned nested overrides. */
export interface SourceComponentSlot {
  type: string;
  script?: { $ref: string; key?: string };
  refId?: string;
  scriptKey?: string;
}
export function visitSourceComponents(
  source: GalaceanSceneFile | GalaceanPrefabFile,
  visit: (component: SourceComponentSlot) => void
): void {
  const instance = (value: GalaceanInstanceSchema) => {
    for (const added of value.overrides?.addedComponents ?? []) visit(added.component);
    for (const added of value.overrides?.addedEntities ?? []) inline(added.entity);
  };
  const inline = (value: GalaceanInlineEntitySchema) => {
    for (const component of value.components ?? []) visit(component);
    if (value.instance) instance(value.instance);
    for (const child of value.children ?? []) inline(child);
  };
  for (const component of source.components ?? []) visit(component);
  for (const entity of source.entities ?? []) if (entity.instance) instance(entity.instance);
  for (const entry of sourceNestedEntries(source)) {
    for (const bucket of Object.values(entry.overrides?.addedComponents ?? {}))
      for (const component of Object.values(bucket)) visit(component);
    for (const added of entry.addedEntities ?? []) inline(added.entity);
  }
}
export function sourceNestedEntries(source: GalaceanSceneFile | GalaceanPrefabFile): Array<{
  assetId: string;
  addedEntities?: GalaceanAddedEntityOverride[];
  overrides?: { addedComponents?: Record<string, Record<string, SourceComponentSlot>> };
}> {
  return (("scene" in source ? source.prefab?.nestedOverrides : undefined) ?? []) as ReturnType<
    typeof sourceNestedEntries
  >;
}
