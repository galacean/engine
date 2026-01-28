# Animation Curve

## Overview
`AnimationCurve` is an abstract base class in the Galacean engine that stores a collection of keyframes. It is used to define interpolation curves for how properties change over time. It supports multiple data types and interpolation methods, forming the foundation for smooth transitions and complex animation effects in the animation system.

## Core Architecture

### Type System
`AnimationCurve<V>` is generic over the engine's `KeyframeValueType` union. Supported value categories include:
- **Scalars**: `number`
- **Vectors**: `Vector2`, `Vector3`, `Vector4`
- **Colors & rotations**: `Color`, `Quaternion`
- **Geometry**: `Rect`
- **Collections**: `number[]`, `Float32Array`
- **Discrete values**: `string`, `boolean`
- **Asset references**: `ReferResource`

When you animate array or typed-array data, every keyframe must use the same element count; interpolation runs per index.

### Concrete Implementation Classes
| Class | Value type | Interpolation support | Notes |
| --- | --- | --- | --- |
| `AnimationFloatCurve` | `number` | Linear, CubicSpine, Hermite, Step | Default choice for scalar properties. |
| `AnimationVector2Curve` | `Vector2` | Linear, CubicSpine, Hermite, Step | Interpolates component-wise. |
| `AnimationVector3Curve` | `Vector3` | Linear, CubicSpine, Hermite, Step | Works for positions, scales, etc. |
| `AnimationVector4Curve` | `Vector4` | Linear, CubicSpine, Hermite, Step | Useful for homogeneous data. |
| `AnimationColorCurve` | `Color` | Linear, CubicSpine, Hermite, Step | Internally treats colors as `Vector4`. |
| `AnimationQuaternionCurve` | `Quaternion` | Linear, CubicSpine, Hermite, Step | Manages quaternion keyframes without gimbal lock. |
| `AnimationArrayCurve` | `number[]` | Linear, CubicSpine, Hermite, Step | Arrays must keep a fixed length across keys. |
| `AnimationFloatArrayCurve` | `Float32Array` | Linear, CubicSpine, Hermite, Step | Allocates internal buffers based on the first key. |
| `AnimationRectCurve` | `Rect` | Step only | Suited for rectangle swaps; smoothing is not supported. |
| `AnimationBoolCurve` | `boolean` | Step only | For on/off style toggles. |
| `AnimationStringCurve` | `string` | Step only | Useful for state labels or shader keywords. |
| `AnimationRefCurve` | `ReferResource` | Step only | Switches resource references such as textures or prefabs. |

> `interpolation` automatically clamps to `InterpolationType.Step` on step-only curves. Attempting to assign a smoothing mode logs a warning.

## API Reference

### AnimationCurve Base Class Methods

#### Basic Properties
```typescript
// Sorted array of keyframes (earliest → latest)
keys: Keyframe<V>[];

// The duration of the curve (equal to the last key's time, or 0 when empty)
get length(): number;

// Interpolation mode. Defaults to Linear unless the curve only supports Step.
get interpolation(): InterpolationType;
set interpolation(value: InterpolationType);
```

- `keys` can be mutated directly if you need fine-grained control, but prefer `addKey`/`removeKey` to keep the array ordered.
- `length` updates whenever you add or remove keys; removing the last key collapses it back to `0`.
- On step-only curves (`AnimationBoolCurve`, `AnimationStringCurve`, `AnimationRectCurve`, `AnimationRefCurve`) any non-Step assignment is coerced back to `Step` with a warning.

#### Keyframe Management
```typescript
// Insert a keyframe. The curve keeps the array ordered by time.
addKey(key: Keyframe<V>): void;

// Remove the keyframe at the given index.
removeKey(index: number): void;

// Sample the curve at the specified second.
evaluate(time: number): V;
```

- `addKey` accepts any object that satisfies the `Keyframe` shape (a constructed `Keyframe` instance or a plain object typed as one). If the new key's time is the largest so far, `length` grows automatically.
- `evaluate` clamps outside the range of defined keys: times before the first key return the first value, and times past the last key return the last value.

### Keyframe

#### Keyframe Structure
```typescript
class Keyframe<V extends KeyframeValueType, T = TangentType<V>> {
  time: number;
  value: V;
  inTangent?: T;
  outTangent?: T;
}

type TangentType<V> =
  V extends number ? number :
  V extends Vector2 ? Vector2 :
  V extends Vector3 ? Vector3 :
  V extends Vector4 | Color | Quaternion | Rect ? Vector4 :
  V extends number[] | Float32Array ? V :
  V extends ReferResource ? ReferResource :
  never;
```

- Tangents are only honoured by `InterpolationType.Hermite` and `InterpolationType.CubicSpine`. They are ignored for `Linear` and `Step` curves.
- For array-based curves the tangent must mirror the value's shape (same element count). Undefined tangents default to the value itself for Hermite calculations.

### InterpolationType

#### Interpolation Modes
```typescript
enum InterpolationType {
  Linear,      // Linear interpolation
  CubicSpine,  // Cubic spline interpolation
  Step,        // Step interpolation (no transition)
  Hermite      // Hermite interpolation
}
```

## Specific Curve Types

All concrete curves expose the same public API; the differences are in the value type and whether smooth interpolation is supported.

- **Smooth-capable curves** (`AnimationFloatCurve`, `AnimationVector2Curve`, `AnimationVector3Curve`, `AnimationVector4Curve`, `AnimationColorCurve`, `AnimationQuaternionCurve`, `AnimationArrayCurve`, `AnimationFloatArrayCurve`) honour linear, Hermite, and cubic spline interpolation. Hermite tangents must match the value type (scalar, vector, or array).
- **Step-only curves** (`AnimationBoolCurve`, `AnimationStringCurve`, `AnimationRectCurve`, `AnimationRefCurve`) always use discrete transitions. Their `interpolation` property is locked to `Step`.
- **Quaternion curves** expect normalized quaternions. Provide keys in radians (`Quaternion.rotationX/Y/Z`) to avoid gimbal issues.
- **Array and typed-array curves** interpolate each index independently; ensure all keys share the same length. `AnimationFloatArrayCurve` automatically resizes its internal buffers based on the first keyframe and any reference value bound through an `AnimationClip`.

## Usage Examples

### Creating a Basic Animation Curve
```typescript
// Float animation - transparency change
const alphaCurve = new AnimationFloatCurve();
alphaCurve.interpolation = InterpolationType.Linear;

const addFloatKey = (time: number, value: number) => {
  const key = new Keyframe<number>();
  key.time = time;
  key.value = value;
  alphaCurve.addKey(key);
};

addFloatKey(0, 1.0);   // Start fully opaque
addFloatKey(0.5, 0.0); // Fully transparent in the middle
addFloatKey(1.0, 1.0); // End fully opaque

// Get the value at 0.3 seconds
const alphaValue = alphaCurve.evaluate(0.3); // Approximately 0.4
```

`Keyframe` is exported from `@galacean/engine`; creating an instance keeps the compiler aware of optional tangent fields.

### Vector Animation Curve
```typescript
// Position animation - bounce effect
const jumpCurve = new AnimationVector3Curve();
jumpCurve.interpolation = InterpolationType.Hermite;

const addVec3Key = (time: number, value: Vector3) => {
  const key = new Keyframe<Vector3>();
  key.time = time;
  key.value = value;
  jumpCurve.addKey(key);
};

// Add keyframes
addVec3Key(0, new Vector3(0, 0, 0));    // Starting position
addVec3Key(0.5, new Vector3(0, 5, 0));  // Peak of the jump
addVec3Key(1.0, new Vector3(0, 0, 0));  // Landing position

// Set tangents to control the curve shape
const startKey = jumpCurve.keys[0];
startKey.outTangent = new Vector3(0, 15, 0);  // Out-tangent for take-off

const endKey = jumpCurve.keys[2];
endKey.inTangent = new Vector3(0, -15, 0);    // In-tangent for landing
```

### Rotation Animation Curve
```typescript
// Quaternion rotation animation
const rotationCurve = new AnimationQuaternionCurve();

// Rotate 360 degrees around the Y-axis
const startRotation = Quaternion.rotationY(0);
const midRotation = Quaternion.rotationY(Math.PI);
const endRotation = Quaternion.rotationY(Math.PI * 2);

const addQuatKey = (time: number, value: Quaternion) => {
  const key = new Keyframe<Quaternion>();
  key.time = time;
  key.value = value;
  rotationCurve.addKey(key);
};

addQuatKey(0, startRotation);
addQuatKey(1, midRotation);
addQuatKey(2, endRotation);
```

### Color Animation Curve
```typescript
// Color gradient animation
const colorCurve = new AnimationColorCurve();

// From red to blue, then to green
const addColorKey = (time: number, value: Color) => {
  const key = new Keyframe<Color>();
  key.time = time;
  key.value = value;
  colorCurve.addKey(key);
};

addColorKey(0, new Color(1, 0, 0, 1)); // Red
addColorKey(1, new Color(0, 0, 1, 1)); // Blue
addColorKey(2, new Color(0, 1, 0, 1)); // Green
```

### Step Animation (Discrete Values)
```typescript
// Material switching animation
const materialIndexCurve = new AnimationFloatCurve();
materialIndexCurve.interpolation = InterpolationType.Step;

const addMaterialKey = (time: number, value: number) => {
  const key = new Keyframe<number>();
  key.time = time;
  key.value = value;
  materialIndexCurve.addKey(key);
};

addMaterialKey(0, 0); // Use material 0
addMaterialKey(1, 1); // Switch to material 1
addMaterialKey(2, 2); // Switch to material 2

// Step interpolation does not produce intermediate values
const matIndex = materialIndexCurve.evaluate(0.9); // Still 0
```

### Controlling Complex Curve Shapes
```typescript
// Ease-in/ease-out effect
const easeCurve = new AnimationFloatCurve();
easeCurve.interpolation = InterpolationType.Hermite;

// Start keyframe
const startFrame = new Keyframe<number>();
startFrame.time = 0;
startFrame.value = 0;
startFrame.outTangent = 0;  // Start smoothly

// End keyframe
const endFrame = new Keyframe<number>();
endFrame.time = 1;
endFrame.value = 1;
endFrame.inTangent = 0;     // End smoothly

easeCurve.addKey(startFrame);
easeCurve.addKey(endFrame);
```

## Interpolation Algorithms Explained

### Linear Interpolation
```typescript
// Formula: result = start + (end - start) * t
// t is the interpolation factor between 0 and 1
const result = start + (end - start) * t;
```

### Hermite Interpolation
```typescript
// Cubic interpolation that uses tangents to control the curve shape
// Considers the inTangent and outTangent of the keyframes
const t2 = t * t;
const t3 = t2 * t;
const a = 2.0 * t3 - 3.0 * t2 + 1.0;
const b = t3 - 2.0 * t2 + t;
const c = t3 - t2;
const d = -2.0 * t3 + 3.0 * t2;

result = a * p0 + b * outTangent * duration + c * inTangent * duration + d * p1;
```

### Step Interpolation
```typescript
// Directly returns the value of the current keyframe, with no smooth transition
result = currentKeyframe.value;
```

## Best Practices

### Keyframe Design
1. **Keyframe Count**: Avoid too many keyframes, as it affects performance.
2. **Time Distribution**: Keyframe timings should be meaningful, not randomly distributed.
3. **Value Range**: Ensure keyframe values are within a reasonable range.
4. **Boundary Handling**: Pay attention to the behavior at the start and end of the curve.

### Choosing an Interpolation Mode
1. **Linear**: Suitable for most common animations.
2. **Hermite**: Suitable for animations that require precise control over the curve shape.
3. **Step**: Use for discrete switches (material indices, booleans, asset swaps). Step-only curves lock to this mode automatically.
4. **CubicSpine**: Suitable for complex curves that require smooth continuity.

### Performance Optimization
1. **Curve Reuse**: Reuse similar animation curves.
2. **Keyframe Optimization**: Remove redundant keyframes.
3. **Pre-calculation**: Cache values that are repeatedly calculated.
4. **Memory Management**: Release unnecessary curves promptly.

### Tangent Control Techniques
1. **Smooth Transition**: Use continuous tangent values.
2. **Abrupt Change Effect**: Set discontinuous tangents.
3. **Ease-in/Ease-out**: Use zero tangents at the start and end.
4. **Elastic Effect**: Use tangents that overshoot the target value.

## Notes

### Numerical Precision
- Floating-point calculations may have precision issues.
- Time values should be within a reasonable range.
- Avoid extremely small or large tangent values.

### Memory Management
- Vector and array curves keep reusable buffers for evaluation; changing the value length forces reallocation. Keep lengths consistent.
- Remove unused keyframes and curves to reduce serialized clip size.
- Reference-type curves (`AnimationRefCurve`) hold onto asset pointers—clear them if the asset can be unloaded.

### Performance Considerations
- `evaluate` reuses an internal cache (`_evaluateData`) so you can call it every frame without additional allocations.
- Hermite and cubic spline interpolation do more math than linear or step curves. Prefer Linear unless you need the extra control.
- Keep keyframe counts as low as you can; fewer keys mean faster lookups and smaller serialized clips.

### Compatibility
- Different types of curves have different characteristics.
- Some interpolation modes are not supported by all types.
- Tangent calculations may differ between types.
