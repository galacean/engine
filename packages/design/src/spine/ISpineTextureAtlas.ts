/** Backend-owned atlas handle; it is never interpreted by the shared renderer. */
export interface ISpineTextureAtlas {
  readonly pages: readonly { readonly name: string }[];
}
