import {
  AnimationClip,
  AnimationQuaternionCurve,
  AnimationVector3Curve,
  Animator,
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
const prunedCache = new WeakMap<GLTFResource, Map<readonly AnimationClip[], readonly AnimationClip[]>>();

/** Shared, load-time adaptations only; the remote GLB and its cached curves stay immutable. */
export function animalAnimationClips(resource: GLTFResource, config: AnimalAssetConfig): readonly AnimationClip[] {
  const rebased = rebaseAnimalClips(resource, config);
  const phases = config.animations.filter((a) => a.cycleStartTime !== undefined);
  let prepared: readonly AnimationClip[] = rebased;
  if (phases.length) {
    const key = JSON.stringify([
      config.animationBasisNode,
      config.initialAnimation,
      phases.map((a) => [a.clip, a.range, a.cycleStartTime])
    ]);
    let entries = cycleCache.get(resource);
    if (entries?.has(key)) {
      prepared = entries.get(key)!;
    } else {
      prepared = rebased.map((clip) => {
        const phase = phases.find((a) => a.clip === clip.name);
        return phase ? startAnimalCycleAt(clip, phase.range![0], phase.range![1], phase.cycleStartTime!) : clip;
      });
      if (!entries) cycleCache.set(resource, (entries = new Map()));
      entries.set(key, prepared);
    }
  }
  return pruneConstantAnimalClips(resource, prepared);
}

const VECTOR_EPSILON = 1e-5;
const QUAT_DOT_EPSILON = 1e-6;

function vectorEquals(a: Vector3, b: Vector3): boolean {
  return (
    Math.abs(a.x - b.x) <= VECTOR_EPSILON &&
    Math.abs(a.y - b.y) <= VECTOR_EPSILON &&
    Math.abs(a.z - b.z) <= VECTOR_EPSILON
  );
}

function quatEquals(a: Quaternion, b: Quaternion): boolean {
  const lenA = Math.hypot(a.x, a.y, a.z, a.w);
  const lenB = Math.hypot(b.x, b.y, b.z, b.w);
  if (lenA <= 1e-8 || lenB <= 1e-8) return false;
  const dot = (a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) / (lenA * lenB);
  return 1 - Math.abs(dot) <= QUAT_DOT_EPSILON;
}

function isLinearOrStep(interpolation: InterpolationType): boolean {
  return interpolation === InterpolationType.Linear || interpolation === InterpolationType.Step;
}

function isConstantVector3Curve(curve: AnimationVector3Curve): boolean {
  if (!isLinearOrStep(curve.interpolation) || curve.keys.length === 0) return false;
  const first = curve.keys[0].value;
  for (let i = 1; i < curve.keys.length; i++) {
    if (!vectorEquals(curve.keys[i].value, first)) return false;
  }
  return true;
}

function isConstantQuaternionCurve(curve: AnimationQuaternionCurve): boolean {
  if (!isLinearOrStep(curve.interpolation) || curve.keys.length === 0) return false;
  const first = curve.keys[0].value;
  for (let i = 1; i < curve.keys.length; i++) {
    if (!quatEquals(curve.keys[i].value, first)) return false;
  }
  return true;
}

/**
 * Drop Transform curves that stay strictly equal to the skeleton's rest pose across every clip
 * in this resource, and collapse per-clip constant curves to a single keyframe while preserving
 * exact clip lengths and crossfade targets. Uses only public engine AnimationClip APIs.
 */
function pruneConstantAnimalClips(resource: GLTFResource, clips: readonly AnimationClip[]): readonly AnimationClip[] {
  const root = resource.defaultSceneRoot;
  if (!root || !clips.length) return clips;
  let entries = prunedCache.get(resource);
  const cached = entries?.get(clips);
  if (cached) return cached;

  const animators: Animator[] = [];
  root.getComponentsIncludeChildren(Animator, animators);
  const animatorEntity = animators.length === 1 ? animators[0].entity : root;

  const canDrop = new Map<string, boolean>();
  for (const clip of clips) {
    for (const binding of clip.curveBindings) {
      const key = `${binding.relativePath}\0${binding.property}`;
      if (canDrop.get(key) === false) continue;
      const curve = binding.curve;
      if (
        !curve ||
        binding.type !== Transform ||
        binding.typeIndex !== 0 ||
        (binding.property !== "position" && binding.property !== "rotationQuaternion" && binding.property !== "scale")
      ) {
        canDrop.set(key, false);
        continue;
      }
      const target = binding.relativePath === "" ? animatorEntity : animatorEntity.findByPath(binding.relativePath);
      if (!target) {
        canDrop.set(key, false);
        continue;
      }
      if (curve instanceof AnimationVector3Curve && (binding.property === "position" || binding.property === "scale")) {
        const rest = binding.property === "position" ? target.transform.position : target.transform.scale;
        canDrop.set(key, isConstantVector3Curve(curve) && vectorEquals(curve.keys[0].value, rest));
      } else if (curve instanceof AnimationQuaternionCurve && binding.property === "rotationQuaternion") {
        canDrop.set(
          key,
          isConstantQuaternionCurve(curve) && quatEquals(curve.keys[0].value, target.transform.rotationQuaternion)
        );
      } else {
        canDrop.set(key, false);
      }
    }
  }

  const pruned = clips.map((clip) => {
    let changed = false;
    for (const binding of clip.curveBindings) {
      const key = `${binding.relativePath}\0${binding.property}`;
      const curve = binding.curve;
      if (canDrop.get(key) === true) {
        changed = true;
        break;
      }
      if (
        curve &&
        curve.keys.length > 1 &&
        ((curve instanceof AnimationVector3Curve && isConstantVector3Curve(curve)) ||
          (curve instanceof AnimationQuaternionCurve && isConstantQuaternionCurve(curve)))
      ) {
        changed = true;
        break;
      }
    }
    if (!changed) return clip;

    const output = new AnimationClip(clip.name);
    let firstDropped: (typeof clip.curveBindings)[number] | undefined;
    let firstCollapsed:
      | { binding: (typeof clip.curveBindings)[number]; curve: AnimationVector3Curve | AnimationQuaternionCurve }
      | undefined;

    for (const binding of clip.curveBindings) {
      const key = `${binding.relativePath}\0${binding.property}`;
      const curve = binding.curve;
      if (!curve) continue;
      if (canDrop.get(key) === true) {
        firstDropped ??= binding;
        continue;
      }
      let nextCurve = curve;
      if (curve instanceof AnimationVector3Curve && curve.keys.length > 1 && isConstantVector3Curve(curve)) {
        const collapsed = new AnimationVector3Curve();
        collapsed.interpolation = InterpolationType.Step;
        collapsed.addKey({ time: curve.keys[0].time, value: curve.keys[0].value.clone() });
        nextCurve = collapsed;
        firstCollapsed ??= { binding, curve: collapsed };
      } else if (
        curve instanceof AnimationQuaternionCurve &&
        curve.keys.length > 1 &&
        isConstantQuaternionCurve(curve)
      ) {
        const collapsed = new AnimationQuaternionCurve();
        collapsed.interpolation = InterpolationType.Step;
        collapsed.addKey({ time: curve.keys[0].time, value: curve.keys[0].value.clone() });
        nextCurve = collapsed;
        firstCollapsed ??= { binding, curve: collapsed };
      }
      output.addCurveBinding(
        binding.relativePath,
        binding.type,
        binding.typeIndex,
        binding.property,
        binding.getProperty ?? binding.property,
        nextCurve
      );
    }

    // Never shorten clip.length when every full-length curve was constant.
    if (output.length < clip.length - 1e-6) {
      if (firstCollapsed) {
        const c = firstCollapsed.curve;
        if (c instanceof AnimationVector3Curve) {
          c.addKey({ time: clip.length, value: c.keys[0].value.clone() });
        } else {
          c.addKey({ time: clip.length, value: c.keys[0].value.clone() });
        }
        // Re-bind via a fresh clip so AnimationClip._length reflects the preserved duration.
        const extended = new AnimationClip(clip.name);
        for (const b of output.curveBindings) {
          extended.addCurveBinding(
            b.relativePath,
            b.type,
            b.typeIndex,
            b.property,
            b.getProperty ?? b.property,
            b.curve!
          );
        }
        for (const event of clip.events) extended.addEvent(event);
        return extended;
      } else if (firstDropped?.curve) {
        const src = firstDropped.curve;
        let sentinel = src;
        if (src instanceof AnimationVector3Curve) {
          const c = new AnimationVector3Curve();
          c.interpolation = InterpolationType.Step;
          c.addKey({ time: src.keys[0].time, value: src.keys[0].value.clone() });
          c.addKey({ time: clip.length, value: src.keys[0].value.clone() });
          sentinel = c;
        } else if (src instanceof AnimationQuaternionCurve) {
          const c = new AnimationQuaternionCurve();
          c.interpolation = InterpolationType.Step;
          c.addKey({ time: src.keys[0].time, value: src.keys[0].value.clone() });
          c.addKey({ time: clip.length, value: src.keys[0].value.clone() });
          sentinel = c;
        }
        output.addCurveBinding(
          firstDropped.relativePath,
          firstDropped.type,
          firstDropped.typeIndex,
          firstDropped.property,
          firstDropped.getProperty ?? firstDropped.property,
          sentinel
        );
      }
    }
    for (const event of clip.events) output.addEvent(event);
    return output;
  });

  if (!entries) prunedCache.set(resource, (entries = new Map()));
  entries.set(clips, pruned);
  return pruned;
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
