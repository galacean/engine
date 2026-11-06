/** Inset a retained material fragment without reversing its axes. The ordinary
 * joint is preserved; short boundary/opening fragments retain 80% of their span.
 * Apply after clipping, so the producer owns both the fragment and its joint. */
export function insetMaterialSpan(span: number, joint: number): number {
  if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(joint) || joint < 0)
    throw Error("A material fragment requires a positive finite span and nonnegative joint");
  return span - Math.min(joint, span * 0.2);
}
