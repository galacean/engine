import {
  AnimationClip,
  AnimationQuaternionCurve,
  AnimationVector3Curve,
  InterpolationType,
  Quaternion,
  Vector3
} from "@galacean/engine";

/** Rotate an audited cyclic clip to a contact pose once at load, preserving every authored phase. */
export function startAnimalCycleAt(clip: AnimationClip, start: number, end: number, phase: number): AnimationClip {
  if (phase < start || phase >= end || end > clip.length + 1e-6)
    throw new Error(`Invalid animal cycle phase: ${clip.name}`);
  if (clip.events.length) throw new Error(`Animal cycle phase requires event-free clips: ${clip.name}`);
  const period = end - start;
  const output = new AnimationClip(clip.name);
  for (const binding of clip.curveBindings) {
    const source = binding.curve;
    if (
      !(source instanceof AnimationVector3Curve || source instanceof AnimationQuaternionCurve) ||
      ![InterpolationType.Linear, InterpolationType.Step].includes(source.interpolation)
    )
      throw new Error(`Unsupported animal cycle curve: ${clip.name}`);
    const first = source.evaluate(start)!.clone(),
      last = source.evaluate(end)!.clone();
    const gap =
      first instanceof Quaternion
        ? 1 - Math.abs(Quaternion.dot(first, last as Quaternion))
        : Vector3.distance(first, last as Vector3);
    if (gap > 1e-3) throw new Error(`Animal cycle endpoints must match: ${clip.name}`);
    const target =
      source instanceof AnimationQuaternionCurve ? new AnimationQuaternionCurve() : new AnimationVector3Curve();
    target.interpolation = source.interpolation;
    const times = new Set([start, end, start + end - phase]);
    for (const key of source.keys) {
      if (key.time > start && key.time < end) times.add(start + ((key.time - phase + period) % period));
    }
    for (const time of [...times].sort((a, b) => a - b)) {
      const sample = start + ((phase - start + time - start) % period);
      const value = source.evaluate(sample)!.clone();
      if (target instanceof AnimationQuaternionCurve) target.addKey({ time, value: value as Quaternion });
      else target.addKey({ time, value: value as Vector3 });
    }
    output.addCurveBinding(
      binding.relativePath,
      binding.type,
      binding.typeIndex,
      binding.property,
      binding.getProperty ?? binding.property,
      target
    );
  }
  return output;
}
