/** Runtime binding/pick keys. Author IDs and material random inputs remain unchanged. */
export function buildingPartKey(id: string): string {
  return JSON.stringify(["part", id]);
}
export function buildingGroupKey(id: string): string {
  return JSON.stringify(["group", id]);
}
/** Runtime handles never enter author data or material random seeds. */
export function buildingInstanceKey(frame: { readonly instanceId: number }, localId: string): string {
  return JSON.stringify([frame.instanceId, localId]);
}
