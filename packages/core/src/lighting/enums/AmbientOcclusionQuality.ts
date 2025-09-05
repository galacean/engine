/**
 * Ambient occlusion quality levels that control the balance between visual quality and performance.
 */
export enum AmbientOcclusionQuality {
  /** Low quality - fewer samples, better performance. */
  Low = 0,
  /** Medium quality - balanced samples and performance. */
  Medium = 1,
  /** High quality - more samples, slower performance. */
  High = 2
}
