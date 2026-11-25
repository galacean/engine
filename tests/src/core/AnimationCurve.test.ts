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
  it("supports setKeys, keyCount, getKey(out) reuse, and Hermite evaluation across all numeric fixed-width curves", () => {
    // AnimationFloatCurve
    const floatCurve = new AnimationFloatCurve();
    floatCurve.interpolation = InterpolationType.Hermite;
    const floatTimes = new Float32Array([0, 1]);
    const floatValues = new Float32Array([0, 10, 2, 0, 20, 0]);
    floatCurve.setKeys(floatTimes, floatValues, true);
    expect(floatCurve.keyCount).toBe(2);
    expect(floatCurve.length).toBe(1);
    expect(floatCurve.evaluate(0.5)).toBeCloseTo(15.25, 4);

    const floatOut = new Keyframe<number>();
    expect(floatCurve.getKey(1, floatOut)).toBe(floatOut);
    expect(floatOut).toEqual({ time: 1, value: 20, inTangent: 0, outTangent: 0 });

    // AnimationVector2Curve
    const vec2Curve = new AnimationVector2Curve();
    vec2Curve.setKeys(new Float32Array([0, 1]), new Float32Array([1, 2, 3, 6]), false);
    expect(vec2Curve.evaluate(0.5)).toMatchObject({ x: 2, y: 4 });
    const vec2Val = new Vector2();
    const vec2In = new Vector2(9, 9);
    const vec2OutTan = new Vector2(9, 9);
    const vec2Key = new Keyframe<Vector2>();
    vec2Key.value = vec2Val;
    vec2Key.inTangent = vec2In;
    vec2Key.outTangent = vec2OutTan;
    expect(vec2Curve.getKey(1, vec2Key)).toBe(vec2Key);
    expect(vec2Key.value).toBe(vec2Val);
    expect(vec2Val).toMatchObject({ x: 3, y: 6 });
    expect(vec2Key.inTangent).toBeUndefined();
    expect(vec2Key.outTangent).toBeUndefined();

    // AnimationVector3Curve with out-object tangent reuse
    const vec3Curve = new AnimationVector3Curve();
    vec3Curve.interpolation = InterpolationType.CubicSpine;
    vec3Curve.setKeys(
      new Float32Array([0, 1]),
      new Float32Array([0, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0, 3, 6, 9, 0, 0, 0]),
      true
    );
    expect(vec3Curve.evaluate(0.5)).toMatchObject({ x: 2, y: 4, z: 6 });
    const reusableVec3Key = new Keyframe<Vector3>();
    const v3Val = (reusableVec3Key.value = new Vector3());
    const v3In = (reusableVec3Key.inTangent = new Vector3());
    const v3Out = (reusableVec3Key.outTangent = new Vector3());
    vec3Curve.getKey(1, reusableVec3Key);
    expect(reusableVec3Key.value).toBe(v3Val);
    expect(reusableVec3Key.inTangent).toBe(v3In);
    expect(reusableVec3Key.outTangent).toBe(v3Out);
    expect(v3Val).toMatchObject({ x: 3, y: 6, z: 9 });

    // AnimationVector4Curve
    const vec4Curve = new AnimationVector4Curve();
    vec4Curve.interpolation = InterpolationType.CubicSpine;
    vec4Curve.setKeys(
      new Float32Array([0, 1]),
      new Float32Array([0, 0, 0, 0, 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 8, 0, 0, 0, 0]),
      true
    );
    expect(vec4Curve.evaluate(0.5)).toMatchObject({ x: 3, y: 4, z: 5, w: 6 });

    // AnimationQuaternionCurve normalizes CubicSpline results
    const quatCurve = new AnimationQuaternionCurve();
    quatCurve.interpolation = InterpolationType.CubicSpine;
    quatCurve.setKeys(
      new Float32Array([0, 1]),
      new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0.2, 0.4, 0.6, 0.8, -0.2, -0.4, -0.6, -0.8, 0, 0, 1, 0, 0, 0, 0, 0]),
      true
    );
    const evaluatedQuat = quatCurve.evaluate(0.5)!;
    expect(evaluatedQuat.length()).toBeCloseTo(1, 5);
    const quatKey = quatCurve.getKey(0);
    expect(quatKey.value).toBeInstanceOf(Quaternion);
    expect(quatKey.inTangent).toBeInstanceOf(Vector4);
    expect(quatKey.outTangent).toBeInstanceOf(Vector4);

    // AnimationColorCurve (RGBA value + Vector4 tangents)
    const colorCurve = new AnimationColorCurve();
    colorCurve.interpolation = InterpolationType.Hermite;
    colorCurve.setKeys(
      new Float32Array([0, 1]),
      new Float32Array([0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.8, 1.0, 1.0, 0, 0, 0, 0]),
      true
    );
    const evaluatedColor = colorCurve.evaluate(0.5)!;
    expect(evaluatedColor.r).toBeCloseTo(0.4, 5);
    expect(evaluatedColor.g).toBeCloseTo(0.6, 5);
    expect(evaluatedColor.b).toBeCloseTo(0.8, 5);
    expect(evaluatedColor.a).toBeCloseTo(0.9, 5);
    const colorKey = colorCurve.getKey(1);
    expect(colorKey.value).toBeInstanceOf(Color);
    expect(colorKey.inTangent).toBeInstanceOf(Vector4);

    // AnimationRectCurve (Step-only)
    const rectCurve = new AnimationRectCurve();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      rectCurve.interpolation = InterpolationType.Linear;
      expect(rectCurve.interpolation).toBe(InterpolationType.Step);
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
    rectCurve.setKeys(new Float32Array([0, 2]), new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]));
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

    // Changing width via setKeys re-allocates public evaluate buffer
    floatArrayCurve.setKeys(
      new Float32Array([0, 1]),
      new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 6, 0, 0, 0]),
      true
    );
    expect(Array.from(floatArrayCurve.evaluate(0.5)!)).toEqual([1, 2, 3]);

    // 1-key replacement via setKey changes width safely
    floatArrayCurve.clearKeys();
    expect(floatArrayCurve.keyCount).toBe(0);
    expect(floatArrayCurve.length).toBe(0);
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

    // AnimationArrayCurve direct evaluate & Hermite
    const arrayCurve = new AnimationArrayCurve();
    arrayCurve.interpolation = InterpolationType.Hermite;
    const k0 = new Keyframe<number[]>();
    k0.time = 0;
    k0.value = [1, 2];
    k0.inTangent = [0, 0];
    k0.outTangent = [0, 0];
    const k1 = new Keyframe<number[]>();
    k1.time = 1;
    k1.value = [3, 6];
    k1.inTangent = [0, 0];
    k1.outTangent = [0, 0];
    arrayCurve.addKey(k0);
    arrayCurve.addKey(k1);
    expect(arrayCurve.evaluate(0.5)).toEqual([2, 4]);
    const evalAdditive = arrayCurve._evaluateAdditive(0.5, { curKeyframeIndex: 0, value: [] });
    expect(evalAdditive).toEqual([1, 2]);
  });

  it("supports discrete Bool, String, and Ref curves including unsorted setKeys and removeKey reference clearing", () => {
    const boolCurve = new AnimationBoolCurve();
    boolCurve.setKeys(new Float32Array([2, 0, 1]), [false, true, false]);
    expect(boolCurve.length).toBe(2);
    expect(boolCurve.evaluate(0.5)).toBe(true);
    expect(boolCurve.evaluate(1.5)).toBe(false);
    expect(boolCurve.getKey(0)).toEqual({ time: 0, value: true, inTangent: undefined, outTangent: undefined });

    const stringCurve = new AnimationStringCurve();
    stringCurve.addKey({ time: 1, value: "b" } as Keyframe<string>);
    stringCurve.addKey({ time: 0, value: "a" } as Keyframe<string>);
    expect(stringCurve.evaluate(0.5)).toBe("a");
    expect(stringCurve.evaluate(1)).toBe("b");

    const refA = {} as ReferResource;
    const refB = {} as ReferResource;
    const refCurve = new AnimationRefCurve();
    refCurve.setKeys(new Float32Array([0, 1, 2]), [refA, null, refB]);
    expect(refCurve.evaluate(0.5)).toBe(refA);
    expect(refCurve.evaluate(1.5)).toBeNull();
    expect(refCurve.evaluate(2.5)).toBe(refB);
    refCurve.removeKey(2);
    expect(refCurve.keyCount).toBe(2);
    expect(refCurve.length).toBe(1);
    expect((refCurve as unknown as { _discreteValues: unknown[] })._discreteValues.length).toBe(2);
  });

  it("maintains ascending order across addKey, setKey, unsorted setKeys, and updates length on removeKey", () => {
    const curve = new AnimationVector3Curve();
    const unsortedTimes = new Float32Array([2, 0, 1]);
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

    // Adding a key with constant (-Infinity) / finite tangents promotes buffer without mutating sharedTimes/curveB.
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

    // Prior keys promoted from 1x -> 3x have NaN tangents so [0, 1] steps to p0 while [1, 2] respects -Infinity constant tangent.
    expect(curveA.evaluate(0.5)).toBe(0);
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
    expect(orderedCurve.getKey(1).time).toBe(0.5);
    expect(orderedCurve.evaluate(1)).toBe(4);

    // Exact Float64 timestamp precision preserved across addKey/length/getKey/evaluate (0.1 stays exact, not float32-rounded).
    const preciseCurve = new AnimationFloatCurve();
    preciseCurve.addKey({ time: 0, value: 0 });
    preciseCurve.addKey({ time: 0.1, value: 1 });
    expect(preciseCurve.length).toBe(0.1);
    expect(preciseCurve.getKey(1).time).toBe(0.1);
    expect(preciseCurve.evaluate(0.1)).toBe(1);
  });

  it("throws on invalid indices or mismatched setKeys buffer lengths", () => {
    const curve = new AnimationVector3Curve();
    expect(() => curve.getKey(0)).toThrow(RangeError);
    expect(() => curve.setKey(0, { time: 0, value: new Vector3() })).toThrow(RangeError);
    expect(() => curve.removeKey(-1)).toThrow(RangeError);

    expect(() => curve.setKeys(new Float32Array([0, 1]), new Float32Array([1, 2, 3]), false)).toThrow();
    expect(() => curve.setKeys(new Float32Array(0), new Float32Array([1]), false)).toThrow();

    const boolCurve = new AnimationBoolCurve();
    expect(() => boolCurve.setKeys(new Float32Array([0, 1]), [true])).toThrow();
  });
});
