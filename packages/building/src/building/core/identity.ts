/** Stable identities. Keys are canonical JSON so no author id can collide with
 * another kind of key, whatever characters it contains. */
export type PartIdentity =
  | { readonly kind: "author"; readonly id: string }
  | { readonly kind: "derived"; readonly connection: string; readonly localId: string };

export const compareKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const authorPartKey = (id: string): string => JSON.stringify(["p", id]);
export const derivedPartKey = (connection: string, localId: string): string =>
  JSON.stringify(["d", connection, localId]);
export const partKey = (identity: PartIdentity): string =>
  identity.kind === "author" ? authorPartKey(identity.id) : derivedPartKey(identity.connection, identity.localId);

export const authorConnectionKey = (id: string): string => JSON.stringify(["c", id]);
export const derivedConnectionKey = (parent: string, localId: string): string =>
  JSON.stringify(["dc", parent, localId]);
/** Symmetric: the same two parts give the same key in either order. */
export function detectedConnectionKey(a: string, b: string): string {
  const [first, second] = compareKeys(a, b) <= 0 ? [a, b] : [b, a];
  return JSON.stringify(["j", first, second]);
}

const TYPE_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
export function validTypeName(type: unknown): type is string {
  return typeof type === "string" && TYPE_NAME.test(type);
}
export function validId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}
