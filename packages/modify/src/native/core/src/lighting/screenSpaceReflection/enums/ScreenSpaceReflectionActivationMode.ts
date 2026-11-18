/** Camera-global activation policy evaluated before all SSR support checks and GPU work. */
export enum ScreenSpaceReflectionActivationMode {
  /** Run when the camera manual request or at least one consumer lease requests SSR. */
  Auto,
  /** Run regardless of manual requests and consumer leases. */
  ForceOn,
  /** Skip all SSR work while preserving manual requests, leases, and material receiver settings. */
  ForceOff
}
