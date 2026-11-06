/** Camera-level policy used to resolve materials whose SSR receiver mode is Auto. */
export enum ScreenSpaceReflectionReceiverPolicy {
  /** Only materials explicitly set to OpaqueComposite or TransparentSampleOnly receive SSR. */
  ExplicitOnly,
  /** Standard opaque/alpha-test PBR materials may automatically receive SSR. */
  StandardPbrAuto
}
