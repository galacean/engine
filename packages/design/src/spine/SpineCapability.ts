/** Version-specific capabilities are explicit, including on versions that do not support them. */
export type SpineCapability<T> =
  | { readonly supported: true; readonly value: T }
  | { readonly supported: false; readonly reason: string };
