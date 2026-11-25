import {
  AnimationArrayCurve,
  AnimationBoolCurve,
  AnimationColorCurve,
  AnimationFloatArrayCurve,
  AnimationFloatCurve,
  AnimationQuaternionCurve,
  AnimationRectCurve,
  AnimationRefCurve,
  AnimationStringCurve,
  AnimationVector2Curve,
  AnimationVector3Curve,
  AnimationVector4Curve,
  InterpolationType,
  Keyframe,
  ReferResource
} from "@galacean/engine-core";
import { Color, Quaternion, Rect, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";

describe("AnimationCurve flat storage", () => {
  it("supports setKeys, keyCount, getKey(out) reuse, and Hermite/additive evaluation across all fixed-width numeric curves", () => {
    // Hermite basis at time = 1 on [0, 2] (t = 0.5, duration = 2):
    // result = 0.5 * p0 + 0.25 * outTangent0 - 0.25 * inTangent1 + 0.5 * p1.

    // AnimationFloatCurve
    const floatCurve = new AnimationFloatCurve();
    floatCurve.interpolation = InterpolationType.Hermite;
    floatCurve.setKeys(new Float32Array([0, 2]), new Float32Array([0, 10, 4, -2, 20, 3]), true);
    expect(floatCurve.keyCount).toBe(2);
    expect(floatCurve.length).toBe(2);
    expect(floatCurve.evaluate(1)).toBeCloseTo(16.5, 5);
    expect(floatCurve._evaluateAdditive(1, { curKeyframeIndex: 0, value: 0 })).toBeCloseTo(6.5, 5);

    const floatOut = new Keyframe<number>();
    expect(floatCurve.getKey(1, floatOut)).toBe(floatOut);
    expect(floatOut).toEqual({ time: 2, value: 20, inTangent: -2, outTangent: 3 });

    // AnimationVector2Curve (Linear, Hermite, addKey with/without tangents, additive)
    const vec2Curve = new AnimationVector2Curve();
    vec2Curve.setKeys(new Float32Array([0, 1]), new Float32Array([1, 2, 3, 6]), false);
    expect(vec2Curve.evaluate(0.5)).toMatchObject({ x: 2, y: 4 });
    expect(vec2Curve._evaluateAdditive(0.5, { curKeyframeIndex: 0, value: new Vector2() })).toMatchObject({
      x: 1,
      y: 2
    });
    const vec2Val = new Vector2();
    const vec2Key = new Keyframe<Vector2>();
    vec2Key.value = vec2Val;
    vec2Key.inTangent = new Vector2(9, 9);
    vec2Key.outTangent = new Vector2(9, 9);
    expect(vec2Curve.getKey(1, vec2Key)).toBe(vec2Key);
    expect(vec2Key.value).toBe(vec2Val);
    expect(vec2Val).toMatchObject({ x: 3, y: 6 });
    expect(vec2Key.inTangent).toBeUndefined();
    expect(vec2Key.outTangent).toBeUndefined();

    vec2Curve.clearKeys();
    vec2Curve.interpolation = InterpolationType.Hermite;
    vec2Curve.addKey({
      time: 0,
      value: new Vector2(1, 2),
      inTangent: new Vector2(0, 0),
      outTangent: new Vector2(4, 0)
    });
    vec2Curve.addKey({
      time: 2,
      value: new Vector2(3, 6),
      inTangent: new Vector2(0, -4),
      outTangent: new Vector2(1, 2)
    });
    expect(vec2Curve.evaluate(1)).toMatchObject({ x: 3, y: 5 });
    const vec2Read = vec2Curve.getKey(1);
    expect(vec2Read.inTangent).toMatchObject({ x: 0, y: -4 });
    expect(vec2Read.outTangent).toMatchObject({ x: 1, y: 2 });

    // AnimationVector3Curve with asymmetric tangents, non-unit duration, and out-object tangent reuse
    const vec3Curve = new AnimationVector3Curve();
    vec3Curve.interpolation = InterpolationType.CubicSpine;
    vec3Curve.setKeys(
      new Float32Array([0, 2]),
      new Float32Array([0, 0, 0, 1, 2, 3, 4, 0, -4, -2, 4, 0, 3, 6, 9, 1, 2, 3]),
      true
    );
    expect(vec3Curve.evaluate(1)).toMatchObject({ x: 3.5, y: 3, z: 5 });
    expect(vec3Curve._evaluateAdditive(1, { curKeyframeIndex: 0, value: new Vector3() })).toMatchObject({
      x: 2.5,
      y: 1,
      z: 2
    });
    const reusableVec3Key = new Keyframe<Vector3>();
    const v3Val = (reusableVec3Key.value = new Vector3());
    const v3In = (reusableVec3Key.inTangent = new Vector3());
    const v3Out = (reusableVec3Key.outTangent = new Vector3());
    vec3Curve.getKey(1, reusableVec3Key);
    expect(reusableVec3Key.value).toBe(v3Val);
    expect(reusableVec3Key.inTangent).toBe(v3In);
    expect(reusableVec3Key.outTangent).toBe(v3Out);
    expect(v3Val).toMatchObject({ x: 3, y: 6, z: 9 });
    expect(v3In).toMatchObject({ x: -2, y: 4, z: 0 });
    expect(v3Out).toMatchObject({ x: 1, y: 2, z: 3 });
    vec3Curve.addKey({ time: 4, value: new Vector3(5, 8, 11) });
    expect(vec3Curve.getKey(2).value).toMatchObject({ x: 5, y: 8, z: 11 });

    // AnimationVector4Curve
    const vec4Curve = new AnimationVector4Curve();
    vec4Curve.interpolation = InterpolationType.CubicSpine;
    vec4Curve.setKeys(
      new Float32Array([0, 2]),
      new Float32Array([0, 0, 0, 0, 1, 2, 3, 4, 4, 0, -4, 8, -4, 4, 0, 4, 5, 6, 7, 8, 1, 2, 3, 4]),
      true
    );
    expect(vec4Curve.evaluate(1)).toMatchObject({ x: 5, y: 3, z: 4, w: 7 });
    expect(vec4Curve._evaluateAdditive(1, { curKeyframeIndex: 0, value: new Vector4() })).toMatchObject({
      x: 4,
      y: 1,
      z: 1,
      w: 3
    });
    const vec4Key = vec4Curve.getKey(1);
    expect(vec4Key.inTangent).toMatchObject({ x: -4, y: 4, z: 0, w: 4 });
    expect(vec4Key.outTangent).toMatchObject({ x: 1, y: 2, z: 3, w: 4 });
    vec4Curve.setKey(1, {
      time: 2,
      value: new Vector4(2, 4, 6, 8),
      inTangent: new Vector4(0, 0, 0, 0),
      outTangent: new Vector4(0, 0, 0, 0)
    });
    expect(vec4Curve.getKey(1).value).toMatchObject({ x: 2, y: 4, z: 6, w: 8 });

    // AnimationQuaternionCurve normalizes CubicSpline results and handles zero-norm antipodal midpoint
    const quatCurve = new AnimationQuaternionCurve();
    quatCurve.interpolation = InterpolationType.CubicSpine;
    quatCurve.setKeys(
      new Float32Array([0, 2]),
      new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0, -4, 0, 0, 1, 0, 0, 0, 0, 0]),
      true
    );
    const evaluatedQuat = quatCurve.evaluate(1)!;
    expect(evaluatedQuat.x).toBeCloseTo(0, 5);
    expect(evaluatedQuat.y).toBeCloseTo(0, 5);
    expect(evaluatedQuat.z).toBeCloseTo(Math.SQRT1_2, 5);
    expect(evaluatedQuat.w).toBeCloseTo(Math.SQRT1_2, 5);
    expect(evaluatedQuat.length()).toBeCloseTo(1, 5);
    const quatKey = quatCurve.getKey(0);
    expect(quatKey.value).toBeInstanceOf(Quaternion);
    expect(quatKey.inTangent).toBeInstanceOf(Vector4);
    expect(quatKey.outTangent).toMatchObject({ x: 0, y: 0, z: 4, w: 0 });

    // Antipodal unit keys (0,0,0,1) and (0,0,0,-1) with zero tangents evaluate to zero polynomial at midpoint -> fallback to p0
    const antipodalQuat = new AnimationQuaternionCurve();
    antipodalQuat.interpolation = InterpolationType.CubicSpine;
    antipodalQuat.setKeys(
      new Float32Array([0, 1]),
      new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0]),
      true
    );
    const fallbackQuat = antipodalQuat.evaluate(0.5)!;
    expect(fallbackQuat).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect(fallbackQuat.length()).toBeCloseTo(1, 5);
    antipodalQuat.clearKeys();
    antipodalQuat.addKey({ time: 0, value: new Quaternion(0, 0, 0, 1) });
    antipodalQuat.addKey({ time: 1, value: new Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2) });
    expect(antipodalQuat.getKey(1).inTangent).toBeUndefined();
    expect(antipodalQuat._evaluateAdditive(1, { curKeyframeIndex: 0, value: new Quaternion() }).y).toBeCloseTo(
      Math.SQRT1_2,
      5
    );

    // AnimationColorCurve (RGBA value + Vector4 tangents, Linear + Hermite + additive)
    const colorCurve = new AnimationColorCurve();
    colorCurve.addKey({ time: 0, value: new Color(0.2, 0.4, 0.6, 0.8) });
    colorCurve.addKey({ time: 2, value: new Color(0.6, 0.8, 1.0, 1.0) });
    const linearColor = colorCurve.evaluate(1)!;
    expect(linearColor.r).toBeCloseTo(0.4, 5);
    expect(linearColor.g).toBeCloseTo(0.6, 5);
    expect(linearColor.b).toBeCloseTo(0.8, 5);
    expect(linearColor.a).toBeCloseTo(0.9, 5);
    expect(colorCurve.getKey(0).inTangent).toBeUndefined();

    colorCurve.interpolation = InterpolationType.Hermite;
    colorCurve.setKeys(
      new Float32Array([0, 2]),
      new Float32Array([
        0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8, 0.4, 0, -0.4, 0.4, -0.4, 0.4, 0, 0, 0.6, 0.8, 1, 1, 0, 0, 0, 0
      ]),
      true
    );
    const evaluatedColor = colorCurve.evaluate(1)!;
    expect(evaluatedColor.r).toBeCloseTo(0.6, 5);
    expect(evaluatedColor.g).toBeCloseTo(0.5, 5);
    expect(evaluatedColor.b).toBeCloseTo(0.7, 5);
    expect(evaluatedColor.a).toBeCloseTo(1.0, 5);
    const additiveColor = colorCurve._evaluateAdditive(1, { curKeyframeIndex: 0, value: new Color() });
    expect(additiveColor.r).toBeCloseTo(0.4, 5);
    expect(additiveColor.g).toBeCloseTo(0.1, 5);
    const colorKey = colorCurve.getKey(1);
    expect(colorKey.value).toBeInstanceOf(Color);
    expect(colorKey.inTangent!.x).toBeCloseTo(-0.4, 5);
    expect(colorKey.inTangent!.y).toBeCloseTo(0.4, 5);
    expect(colorKey.inTangent!.z).toBe(0);
    expect(colorKey.inTangent!.w).toBe(0);

    // AnimationRectCurve (Step-only, addKey + setKeys + getKey)
    const rectCurve = new AnimationRectCurve();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      rectCurve.interpolation = InterpolationType.Linear;
      expect(rectCurve.interpolation).toBe(InterpolationType.Step);
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
    rectCurve.addKey({ time: 0, value: new Rect(1, 2, 3, 4) });
    rectCurve.addKey({ time: 2, value: new Rect(5, 6, 7, 8) });
    expect(rectCurve.evaluate(1)).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
    expect(rectCurve.evaluate(2)).toMatchObject({ x: 5, y: 6, width: 7, height: 8 });
    const rectKey = rectCurve.getKey(0);
    expect(rectKey.value).toBeInstanceOf(Rect);
    expect(rectKey.inTangent).toBeUndefined();
  });

  it("supports dynamic-width Float32Array and number[] curves, morph remapping, and width changes", () => {
    const floatArrayCurve = new AnimationFloatArrayCurve();
    floatArrayCurve.setKeys(new Float32Array([0, 1]), new Float32Array([1, 2, 3, 4]), false);
    expect(Array.from(floatArrayCurve.evaluate(0.5)!)).toEqual([2, 3]);

    // Remapping onto a wider output zero-fills absent morph targets
    const wideEval = { curKeyframeIndex: 0, value: new Float32Array([9, 9, 9, 9]) };
    floatArrayCurve._evaluate(0.5, wideEval);
    expect(Array.from(wideEval.value)).toEqual([2, 3, 0, 0]);

    // Changing width via setKeys re-allocates public evaluate buffer and evaluates non-unit Hermite
    floatArrayCurve.interpolation = InterpolationType.Hermite;
    floatArrayCurve.setKeys(
      new Float32Array([0, 2]),
      new Float32Array([0, 0, 0, 0, 0, 0, 4, 0, -4, -4, 4, 0, 2, 4, 6, 1, 2, 3]),
      true
    );
    expect(Array.from(floatArrayCurve.evaluate(1)!)).toEqual([3, 1, 2]);
    expect(floatArrayCurve.getKey(1).inTangent).toEqual([-4, 4, 0]);

    // Empty setKeys clears curve
    floatArrayCurve.setKeys(new Float32Array(0), new Float32Array(0), false);
    expect(floatArrayCurve.keyCount).toBe(0);
    expect(floatArrayCurve.length).toBe(0);

    // 1-key replacement via setKey changes width safely
    floatArrayCurve.setKeys(new Float32Array([0]), new Float32Array([10, 20]), false);
    const singleKey = new Keyframe<Float32Array>();
    singleKey.time = 1.5;
    singleKey.value = new Float32Array([7, 8, 9]);
    singleKey.inTangent = [1, 2, 3];
    singleKey.outTangent = [4, 5, 6];
    floatArrayCurve.setKey(0, singleKey);
    expect(floatArrayCurve.length).toBe(1.5);
    expect(Array.from(floatArrayCurve.evaluate(0)!)).toEqual([7, 8, 9]);

    // Mismatched value width in multi-key curve throws
    expect(() => {
      const k = new Keyframe<Float32Array>();
      k.time = 2;
      k.value = new Float32Array([1, 2]);
      floatArrayCurve.addKey(k);
    }).toThrow();

    // AnimationArrayCurve: Linear, asymmetric non-unit Hermite, getKey, addKey without tangents, clearKeys, additive
    const arrayCurve = new AnimationArrayCurve();
    arrayCurve.addKey({ time: 0, value: [1, 2] });
    arrayCurve.addKey({ time: 2, value: [3, 6] });
    expect(arrayCurve.evaluate(1)).toEqual([2, 4]);
    expect(arrayCurve.getKey(0)).toEqual({ time: 0, value: [1, 2], inTangent: undefined, outTangent: undefined });

    arrayCurve.clearKeys();
    arrayCurve.interpolation = InterpolationType.Hermite;
    arrayCurve.addKey({ time: 0, value: [1, 2], inTangent: [0, 0], outTangent: [4, 0] });
    arrayCurve.addKey({ time: 2, value: [3, 6], inTangent: [0, -4], outTangent: [1, 2] });
    expect(arrayCurve.evaluate(1)).toEqual([3, 5]);
    expect(arrayCurve.getKey(1)).toEqual({ time: 2, value: [3, 6], inTangent: [0, -4], outTangent: [1, 2] });
    expect(arrayCurve._evaluateAdditive(1, { curKeyframeIndex: 0, value: [] })).toEqual([2, 3]);
  });

  it("supports discrete Bool, String, and Ref curves including unsorted setKeys, middle removeKey, and clearKeys", () => {
    const boolCurve = new AnimationBoolCurve();
    boolCurve.setKeys(new Float32Array([2, 0, 1]), [false, true, false]);
    expect(boolCurve.length).toBe(2);
    expect(boolCurve.evaluate(0.5)).toBe(true);
    expect(boolCurve.evaluate(1.5)).toBe(false);
    expect(boolCurve.getKey(0)).toEqual({ time: 0, value: true, inTangent: undefined, outTangent: undefined });
    boolCurve.addKey({ time: 3, value: true });
    boolCurve.removeKey(1);
    expect(boolCurve.keyCount).toBe(3);
    expect(boolCurve.getKey(1).time).toBe(2);
    boolCurve.setKeys(new Float32Array(0), []);
    expect(boolCurve.keyCount).toBe(0);

    const stringCurve = new AnimationStringCurve();
    stringCurve.addKey({ time: 1, value: "b" } as Keyframe<string>);
    stringCurve.addKey({ time: 0, value: "a" } as Keyframe<string>);
    expect(stringCurve.evaluate(0.5)).toBe("a");
    expect(stringCurve.evaluate(1)).toBe("b");
    expect(stringCurve.getKey(1).value).toBe("b");
    stringCurve.removeKey(0);
    expect(stringCurve.keyCount).toBe(1);
    stringCurve.clearKeys();
    expect(stringCurve.keyCount).toBe(0);

    const refA = {} as ReferResource;
    const refB = {} as ReferResource;
    const refCurve = new AnimationRefCurve();
    refCurve.setKeys(new Float32Array([0, 1, 2]), [refA, null, refB]);
    expect(refCurve.evaluate(0.5)).toBe(refA);
    expect(refCurve.evaluate(1.5)).toBeNull();
    expect(refCurve.evaluate(2.5)).toBe(refB);
    // Middle removal shifts remaining keys cleanly and preserves public behavior
    refCurve.removeKey(1);
    expect(refCurve.keyCount).toBe(2);
    expect(refCurve.length).toBe(2);
    expect(refCurve.getKey(1).value).toBe(refB);
    expect(refCurve.evaluate(1.5)).toBe(refA);
    expect(refCurve.evaluate(2)).toBe(refB);
    expect(() => refCurve.getKey(2)).toThrow(RangeError);
    refCurve.clearKeys();
    expect(refCurve.keyCount).toBe(0);
  });

  it("maintains ascending order across addKey, setKey, unsorted Float32/Float64 setKeys, and updates length on removeKey", () => {
    const curve = new AnimationVector3Curve();
    const unsortedTimes = new Float64Array([2, 0, 1]);
    const unsortedValues = new Float32Array([20, 0, 0, 0, 0, 0, 10, 0, 0]);
    curve.setKeys(unsortedTimes, unsortedValues, false);
    // Caller input arrays were not mutated.
    expect(Array.from(unsortedTimes)).toEqual([2, 0, 1]);
    expect(curve.length).toBe(2);
    expect(curve.evaluate(0.5)).toMatchObject({ x: 5, y: 0, z: 0 });
    expect(curve.evaluate(1.5)).toMatchObject({ x: 15, y: 0, z: 0 });

    // Moving a key earlier and later via setKey re-sorts cleanly
    curve.setKey(2, { time: -1, value: new Vector3(-10, 0, 0) });
    expect([curve.getKey(0).time, curve.getKey(1).time, curve.getKey(2).time]).toEqual([-1, 0, 1]);
    expect(curve.length).toBe(1);

    curve.setKey(0, { time: 3, value: new Vector3(30, 0, 0) });
    expect([curve.getKey(0).time, curve.getKey(1).time, curve.getKey(2).time]).toEqual([0, 1, 3]);
    expect(curve.length).toBe(3);

    // Regression: removing last key updates length to the new last key's time (not 0)
    curve.removeKey(2);
    expect(curve.keyCount).toBe(2);
    expect(curve.length).toBe(1);
    curve.removeKey(0);
    curve.removeKey(0);
    expect(curve.keyCount).toBe(0);
    expect(curve.length).toBe(0);
  });

  it("isolates shared setKeys buffers on mutation (copy-on-write) and handles tangent promotion cleanly", () => {
    const sharedTimes = new Float32Array([0, 1]);
    const sharedValues = new Float32Array([0, 10]);

    const curveA = new AnimationFloatCurve();
    const curveB = new AnimationFloatCurve();
    curveA.setKeys(sharedTimes, sharedValues, false);
    curveB.setKeys(sharedTimes, sharedValues, false);

    // Switching a tangent-less curve to Hermite falls back to p0 cleanly without throwing.
    curveA.interpolation = InterpolationType.Hermite;
    expect(curveA.evaluate(0.5)).toBe(0);

    // Adding a key with tangents promotes buffer without mutating sharedTimes/curveB.
    const tangentKey = new Keyframe<number>();
    tangentKey.time = 2;
    tangentKey.value = 30;
    tangentKey.inTangent = -Infinity;
    tangentKey.outTangent = 5;
    curveA.addKey(tangentKey);

    expect(Array.from(sharedTimes)).toEqual([0, 1]);
    expect(Array.from(sharedValues)).toEqual([0, 10]);
    expect(curveB.keyCount).toBe(2);
    expect(curveB.evaluate(0.5)).toBe(5);

    // Prior keys promoted from 1x -> 3x have NaN tangents so [0, 1] steps to p0.
    expect(curveA.evaluate(0.5)).toBe(0);
    // Give key 1 a finite outTangent so [1, 2] proves key 2's inTangent = -Infinity triggers step fallback.
    curveA.setKey(1, { time: 1, value: 10, inTangent: 0, outTangent: 2 });
    expect(curveA.evaluate(1.5)).toBe(10);

    // Out-of-order insertion and duplicate timestamps
    const orderedCurve = new AnimationFloatCurve();
    orderedCurve.addKey({ time: 0, value: 1 });
    orderedCurve.addKey({ time: 1, value: 3 });
    orderedCurve.addKey({ time: 1, value: 4 });
    orderedCurve.addKey({ time: 0.5, value: 2 });
    expect([
      orderedCurve.getKey(0).time,
      orderedCurve.getKey(1).time,
      orderedCurve.getKey(2).time,
      orderedCurve.getKey(3).time
    ]).toEqual([0, 0.5, 1, 1]);
    expect(orderedCurve.getKey(1).value).toBe(2);
    expect(orderedCurve.getKey(2).value).toBe(3);
    expect(orderedCurve.evaluate(1)).toBe(4);

    // Exact Float64 timestamp precision preserved across addKey/length/getKey/evaluate (0.1 stays exact, not float32-rounded).
    const preciseCurve = new AnimationFloatCurve();
    preciseCurve.addKey({ time: 0, value: 0 });
    preciseCurve.addKey({ time: 0.1, value: 1 });
    expect(preciseCurve.length).toBe(0.1);
    expect(preciseCurve.getKey(1).time).toBe(0.1);
    expect(preciseCurve.evaluate(0.1)).toBe(1);
  });

  it("throws on out-of-range, non-integer, or NaN indices and mismatched setKeys buffer lengths", () => {
    const curve = new AnimationVector3Curve();
    expect(() => curve.getKey(0)).toThrow(RangeError);
    expect(() => curve.setKey(0, { time: 0, value: new Vector3() })).toThrow(RangeError);
    expect(() => curve.removeKey(-1)).toThrow(RangeError);

    // Regression: fractional / NaN indices must throw and must not desync flat _times/_values buffers
    const vec2 = new AnimationVector2Curve();
    vec2.setKeys(new Float32Array([0, 1, 2]), new Float32Array([1, 2, 3, 4, 5, 6]), false);
    expect(() => vec2.getKey(0.5)).toThrow(RangeError);
    expect(() => vec2.setKey(0.5, { time: 0.5, value: new Vector2(9, 9) })).toThrow(RangeError);
    expect(() => vec2.removeKey(0.5)).toThrow(RangeError);
    expect(() => vec2.removeKey(Number.NaN)).toThrow(RangeError);
    expect(vec2.keyCount).toBe(3);
    expect(vec2.getKey(0).value).toMatchObject({ x: 1, y: 2 });
    expect(vec2.getKey(1).value).toMatchObject({ x: 3, y: 4 });
    expect(vec2.getKey(2).value).toMatchObject({ x: 5, y: 6 });

    expect(() => curve.setKeys(new Float32Array([0, 1]), new Float32Array([1, 2, 3]), false)).toThrow();
    expect(() => curve.setKeys(new Float32Array(0), new Float32Array([1]), false)).toThrow();

    const arrCurve = new AnimationFloatArrayCurve();
    expect(() => arrCurve.setKeys(new Float32Array([0, 1]), new Float32Array([1, 2, 3]), false)).toThrow();

    const boolCurve = new AnimationBoolCurve();
    expect(() => boolCurve.setKeys(new Float32Array([0, 1]), [true])).toThrow();
  });
});
