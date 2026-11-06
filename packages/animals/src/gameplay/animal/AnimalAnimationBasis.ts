import {
  AnimationClip,
  AnimationQuaternionCurve,
  AnimationVector3Curve,
  InterpolationType,
  Quaternion,
  Transform,
  Vector3,
  type GLTFResource
} from "@galacean/engine";
import type { AnimalAssetConfig } from "./AnimalAssetCatalog";
import { startAnimalCycleAt } from "./AnimalAnimationCycle";

const cache = new WeakMap<GLTFResource, Map<string, readonly AnimationClip[]>>();
const cycleCache = new WeakMap<GLTFResource, Map<string, readonly AnimationClip[]>>();

/** Shared, load-time adaptations only; the remote GLB and its cached curves stay immutable. */
export function animalAnimationClips(resource: GLTFResource, config: AnimalAssetConfig): readonly AnimationClip[] {
  const clips = rebaseAnimalClips(resource, config);
  const phases = config.animations.filter((a) => a.cycleStartTime !== undefined);
  if (!phases.length) return clips;
  const key = JSON.stringify([
    config.animationBasisNode,
    config.initialAnimation,
    phases.map((a) => [a.clip, a.range, a.cycleStartTime])
  ]);
  let entries = cycleCache.get(resource);
  if (entries?.has(key)) return entries.get(key)!;
  const prepared = clips.map((clip) => {
    const config = phases.find((a) => a.clip === clip.name);
    return config ? startAnimalCycleAt(clip, config.range![0], config.range![1], config.cycleStartTime!) : clip;
  });
  if (!entries) cycleCache.set(resource, (entries = new Map()));
  entries.set(key, prepared);
  return prepared;
}

/**
 * Rebase an explicitly audited, unweighted structural joint before native crossfading.
 * Some imports encode the same facing with opposing parent/child rotations in different clips.
 * Interpolating those rotations independently spins the body despite equal endpoint facings.
 * Only corrected curves are copied, once per resource/basis; source clips remain untouched.
 * There is no per-frame correction and no change to authored world-space poses or key times.
 */
function rebaseAnimalClips(resource: GLTFResource, config: AnimalAssetConfig): readonly AnimationClip[] {
  const clips = resource.animations ?? [];
  const node = config.animationBasisNode;
  if (!node) return clips;
  const referenceName = config.animations.find((a) => a.id === config.initialAnimation)!.clip;
  const key = JSON.stringify([node, referenceName]);
  let entries = cache.get(resource);
  if (entries?.has(key)) return entries.get(key)!;
  const reference = clips.find((c) => c.name === referenceName)!;
  const roots = reference.curveBindings.filter(
    (b) => b.type === Transform && b.property === "rotationQuaternion" && b.relativePath.split("/").at(-1) === node
  );
  if (roots.length !== 1) throw new Error(`Ambiguous animal animation basis: ${node}`);
  const path = roots[0].relativePath;
  const canonical = (roots[0].curve!.keys[0].value as Quaternion).clone().normalize();
  const corrected = clips.map((clip) => {
    const root = clip.curveBindings.find((b) => b.relativePath === path && b.property === "rotationQuaternion");
    if (!root || !(root.curve instanceof AnimationQuaternionCurve) || !root.curve.keys.length)
      throw new Error(`Missing animal basis rotation: ${clip.name}`);
    const rotation = root.curve.keys[0].value.clone().normalize();
    if (root.curve.keys.some((k) => 1 - Math.abs(Quaternion.dot(k.value, rotation)) > 1e-6))
      throw new Error(`Animal basis must be static: ${clip.name}`);
    if (1 - Math.abs(Quaternion.dot(rotation, canonical)) < 1e-6) return clip;
    const scale = clip.curveBindings.find((b) => b.relativePath === path && b.property === "scale");
    if (
      scale?.curve?.keys.some((k) => {
        const v = k.value as Vector3;
        return Math.abs(v.x - v.y) > 1e-6 || Math.abs(v.x - v.z) > 1e-6;
      })
    )
      throw new Error(`Animal basis requires uniform scale: ${clip.name}`);
    const delta = canonical.clone().conjugate().multiply(rotation);
    const output = new AnimationClip(clip.name);
    for (const binding of clip.curveBindings) {
      const { relativePath, property } = binding;
      const child = relativePath.slice(0, relativePath.lastIndexOf("/")) === path;
      let curve = binding.curve;
      if (!curve) throw new Error("Animal animation binding requires a curve");
      if (binding === root) {
        const replacement = new AnimationQuaternionCurve();
        for (const k of root.curve.keys) replacement.addKey({ time: k.time, value: canonical.clone() });
        curve = replacement;
      } else if (
        child &&
        binding.type === Transform &&
        (property === "position" || property === "rotationQuaternion")
      ) {
        if (curve.interpolation !== InterpolationType.Linear && curve.interpolation !== InterpolationType.Step)
          throw new Error(`Unsupported animal basis interpolation: ${clip.name}`);
        if (curve instanceof AnimationQuaternionCurve) {
          const replacement = new AnimationQuaternionCurve();
          replacement.interpolation = curve.interpolation;
          for (const k of curve.keys) replacement.addKey({ time: k.time, value: delta.clone().multiply(k.value) });
          curve = replacement;
        } else if (curve instanceof AnimationVector3Curve) {
          const replacement = new AnimationVector3Curve();
          replacement.interpolation = curve.interpolation;
          for (const k of curve.keys) {
            const value = new Vector3();
            Vector3.transformByQuat(k.value, delta, value);
            replacement.addKey({ time: k.time, value });
          }
          curve = replacement;
        }
      }
      output.addCurveBinding(
        relativePath,
        binding.type,
        binding.typeIndex,
        property,
        binding.getProperty ?? property,
        curve
      );
    }
    for (const event of clip.events) output.addEvent(event);
    return output;
  });
  if (!entries) cache.set(resource, (entries = new Map()));
  entries.set(key, corrected);
  return corrected;
}
