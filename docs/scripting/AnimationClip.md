# Animation Clip

## Overview
`AnimationClip` is the core class in the Galacean engine for storing keyframe-based animation data. It contains animation curve bindings, animation events, and timeline information, serving as the fundamental data unit of the animation system. Each `AnimationClip` is an independent animation segment that can be reused by multiple animation states. Clips can be authored in the Galacean editor, imported with animated assets, or created programmatically.

## Core Architecture

### Main Components
- **AnimationClip**: The main class for animation clips, storing keyframe animations.
- **AnimationClipCurveBinding**: Binds animation curves to entity component properties.
- **AnimationEvent**: Triggers callbacks at specific points in time.
- **AnimationCurve**: Stores keyframe data and interpolation information.

## API Reference

### Core Methods of AnimationClip

#### Basic Properties
```typescript
// The name of the animation clip
readonly name: string

// The length of the animation in seconds
readonly length: number

// An array of animation events
readonly events: Readonly<AnimationEvent[]>

// An array of curve bindings
readonly curveBindings: Readonly<AnimationClipCurveBinding[]>
```

#### Animation Event Management
```typescript
// Add an animation event - created via parameters
addEvent(functionName: string, time: number, parameter: Object | undefined): void

// Add an animation event - by passing the event object directly
addEvent(event: AnimationEvent): void

// Clear all events
clearEvents(): void

// Example usage
clip.addEvent("onFootStep", 0.5, { footIndex: 0 });
clip.addEvent("onAttackHit", 0.8, { damage: 50 });
clip.addEvent("onJumpLand", 1.1, undefined); // Explicitly pass undefined when no payload is needed
```

#### Curve Binding Management
```typescript
// Add a curve binding - basic version
addCurveBinding<T extends Component>(
  entityPath: string,
  componentType: new (entity: Entity) => T,
  propertyPath: string,
  curve: AnimationCurve<KeyframeValueType>
): void

// Add a curve binding - with separate read/write paths
addCurveBinding<T extends Component>(
  entityPath: string,
  componentType: new (entity: Entity) => T,
  setPropertyPath: string,
  getPropertyPath: string,
  curve: AnimationCurve<KeyframeValueType>
): void

// Add a curve binding - specifying the component index
addCurveBinding<T extends Component>(
  entityPath: string,
  componentType: new (entity: Entity) => T,
  componentIndex: number,
  propertyPath: string,
  curve: AnimationCurve<KeyframeValueType>
): void

// Add a curve binding - specifying the component index with separate read/write paths
addCurveBinding<T extends Component>(
  entityPath: string,
  componentType: new (entity: Entity) => T,
  componentIndex: number,
  setPropertyPath: string,
  getPropertyPath: string,
  curve: AnimationCurve<KeyframeValueType>
): void

// Clear all curve bindings (resets clip length to 0)
clearCurveBindings(): void
```

### AnimationClipCurveBinding Configuration

#### Basic Properties
```typescript
// Relative path to the target entity
relativePath: string  // e.g., "root/spine/leftArm"

// Target component type
type: new (entity: Entity) => Component

// Component index (for multiple components of the same type)
typeIndex: number = 0

// Property path (for setting the value)
property: string  // Supports: "a.b", "a.b[0]", "a.b('c', 0, $value)"

// Get property path (optional, for reading the current value)
getProperty?: string  // Supports: "a.b", "a.b[0]", "a.b('c', 0)"

// The animation curve
curve: AnimationCurve<KeyframeValueType>
```

### AnimationEvent Configuration

#### Basic Properties
```typescript
// Trigger time in seconds
time: number

// Function name
functionName: string

// Parameter to pass to the function
parameter: Object
```

## Property Path Syntax

### Supported Path Formats
```typescript
// 1. Simple property access
"position.x"           // Access the x property of position
"rotation.y"           // Access the y property of rotation
"material.baseColor"   // Access the baseColor property of material

// 2. Array index access
"materials[0].baseColor"  // Access the baseColor of the first material
"bones[2].rotation.x"     // Access the x rotation value of the third bone

// 3. Method call (for setting values only)
"setPosition('x', $value)"           // Call the setPosition method
"transform.setRotation('y', $value)" // Call the setRotation method of transform
"material.setFloat('metallic', $value)" // Set a float parameter of the material
```

### Path Parsing Rules
- **$value**: A placeholder representing the value calculated by the animation curve.
- **Dot notation**: Represents object property access.
- **Square brackets**: Represent array or index access.
- **Parentheses**: Represent a method call, with parameters separated by commas.

## Usage Examples

### Creating a Basic Animation Clip
```typescript
// Create an animation clip
const walkClip = new AnimationClip("walk");

// Create a position animation curve
const positionCurve = new AnimationCurve<Vector3>();
positionCurve.addKey(0, new Vector3(0, 0, 0));
positionCurve.addKey(1, new Vector3(0, 0, 5));

// Add a curve binding
walkClip.addCurveBinding(
  "",                    // Root entity
  Transform,             // Transform component
  "position",            // position property
  positionCurve          // The animation curve
);
```

### Complex Property Animation
```typescript
// Material color animation
const colorClip = new AnimationClip("colorChange");

// Create a color curve
const colorCurve = new AnimationCurve<Color>();
colorCurve.addKey(0, new Color(1, 0, 0, 1));  // Red
colorCurve.addKey(1, new Color(0, 0, 1, 1));  // Blue

// Bind to the material's baseColor property
colorClip.addCurveBinding(
  "",                         // Root entity
  MeshRenderer,               // MeshRenderer component
  "material.baseColor",       // material base color
  colorCurve
);
```

### Bone Animation Binding
```typescript
// Bone rotation animation
const boneRotationClip = new AnimationClip("boneAnimation");

// Left arm rotation curve
const leftArmRotationCurve = new AnimationCurve<Vector3>();
leftArmRotationCurve.addKey(0, new Vector3(0, 0, 0));
leftArmRotationCurve.addKey(0.5, new Vector3(45, 0, 0));
leftArmRotationCurve.addKey(1, new Vector3(0, 0, 0));

// Bind to the left arm bone
boneRotationClip.addCurveBinding(
  "root/spine/leftShoulder/leftArm",  // Bone path
  Transform,                           // Transform component
  "rotation",                          // rotation property
  leftArmRotationCurve
);
```

### Multi-component Animation
```typescript
// Animate multiple components simultaneously
const complexClip = new AnimationClip("complex");

// Transform position animation
complexClip.addCurveBinding("", Transform, "position.y", jumpCurve);

// Material transparency animation
complexClip.addCurveBinding("", MeshRenderer, "material.baseColor.a", alphaCurve);

// Color animation of the second material (component index 1)
complexClip.addCurveBinding("", MeshRenderer, 1, "material.baseColor", colorCurve);
```

### Using Animation Events
```typescript
// Add footstep sound events
walkClip.addEvent("playFootstepSound", 0.25, { foot: "left" });
walkClip.addEvent("playFootstepSound", 0.75, { foot: "right" });

// Add an attack hit check event
attackClip.addEvent("checkHit", 0.6, {
  damage: 100,
  range: 2.0,
  type: "melee"
});

// Add a special effect event
jumpClip.addEvent("spawnEffect", 0.1, {
  effectName: "dustCloud",
  position: new Vector3(0, -1, 0)
});
```

### Separate Read/Write Paths
```typescript
// For properties that require special handling
complexClip.addCurveBinding(
  "weapon",                           // Weapon entity path
  WeaponComponent,                    // Custom weapon component
  "setDamage($value)",               // Setter method
  "getDamage()",                     // Getter method
  damageCurve                        // Damage curve
);
```

## Animation Sampling Mechanism

### Internal Sampling Process
```typescript
// Internal sampling method (called by the engine)
_sampleAnimation(entity: Entity, time: number): void {
  // 1. Iterate through all curve bindings
  // 2. Resolve target entity with entity.findByPath(binding.relativePath)
  // 3. Fetch the component (typeIndex > 0 uses getComponents(...) with a shared scratch array)
  // 4. Acquire a cached AnimationCurveOwner for the entity/component pair
  // 5. Evaluate the curve at the specified time and apply the value via the owner
}
```

### Sampling Performance Optimization
- **Curve Owner Caching**: Reuses `AnimationCurveOwner` instances per entity/component pair.
- **Shared Component Scratch Array**: Reuses an internal array when fetching components to reduce allocations.
- **Automatic Length Tracking**: Clip length updates to the longest bound curve, so shorter curves are skipped once complete.

## Best Practices

### Curve Binding Design
1. **Path Naming Convention**: Use clear, hierarchical path names.
2. **Property Grouping**: Group related properties on a similar timeline.
3. **Avoid Redundancy**: Do not bind properties that do not change.
4. **Specify Index**: Clearly specify the index for multiple components.

### Animation Event Optimization
1. **Precise Event Timing**: Ensure the accuracy of event timings.
2. **Lightweight Parameters**: Avoid passing heavy parameter objects.
3. **Efficient Event Handling**: Keep event handler functions efficient.
4. **Time Sorting**: Events are automatically sorted by time.

### Performance Considerations
1. **Curve Complexity**: Avoid an excessive number of keyframes.
2. **Binding Count**: Control the number of bindings per clip.
3. **Path Depth**: Avoid overly deep entity paths.
4. **Memory Management**: Clean up unnecessary bindings promptly.

### Compatibility Design
1. **Versioning**: Version control for animation data.
2. **Path Fault Tolerance**: Handle cases where entity paths do not exist.
3. **Component Checking**: Verify the existence of target components.
4. **Property Validation**: Ensure the validity of property paths.

## Notes

### Path Parsing
- Entity paths are separated by slashes, similar to file paths.
- An empty path refers to the current entity (the one containing the animation clip).
- Path lookups are real-time; caching is necessary for performance-sensitive scenarios.

### Time Calculation
- The animation length is determined by the longest curve.
- The time range is [0, length].
- Times outside this range are handled according to the curve's wrap mode.

### Memory Management
- `AnimationClip` can be shared by multiple states.
- Curve owners are cached per target entity to avoid repeatedly recreating accessors.
- `clearCurveBindings()` empties bindings and resets the cached clip length to `0`.

### Thread Safety
- The sampling process runs on the main thread.
- Avoid mutating bindings or events while a clip is actively sampled.
- Event triggers are synchronous.
