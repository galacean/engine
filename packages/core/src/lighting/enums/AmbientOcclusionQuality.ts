/**
 * Ambient occlusion quality levels that control the balance between visual quality and performance.
 */
export enum AmbientOcclusionQuality {
  /** Low quality - fewer samples, better performance. */
  Low,
  /** Medium quality - balanced samples and performance. */
  Medium,
  /** High quality - more samples, slower performance. */
  High
}
