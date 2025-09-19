# Transform

Galacean's `Transform` component controls spatial properties of entities including position, rotation, and scale in both local and world coordinate systems. Every entity automatically receives a Transform component that manages its placement within the 3D scene hierarchy and provides efficient dirty-flag optimizations for world-space calculations.

## Quick Start

```ts
import { WebGLEngine, Entity } from "@galacean/engine";
import { Vector3, Quaternion } from "@galacean/engine-math";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;
const entity = scene.createRootEntity("MyEntity");

// Access the transform (every entity has one automatically)
const transform = entity.transform;

// Set position
transform.setPosition(10, 5, 0);
// Or via property assignment
transform.position.set(10, 5, 0);

// Set rotation in degrees (Euler angles)
transform.setRotation(0, 45, 0);
// Or using quaternions
transform.rotationQuaternion.set(0, 0.707, 0, 0.707);

// Set scale
transform.setScale(2, 2, 2);
```

## Local vs World Coordinate Systems

Transform operates in two coordinate systems:

**Local Space**: Relative to the entity's parent transform
- `position`, `rotation`, `rotationQuaternion`, `scale`
- `localMatrix`

**World Space**: Absolute position in the 3D world
- `worldPosition`, `worldRotation`, `worldRotationQuaternion`
- `worldMatrix`, `lossyWorldScale`

```ts
const parent = scene.createRootEntity("Parent");
const child = parent.createChild("Child");

parent.transform.setPosition(5, 0, 0);
child.transform.setPosition(3, 0, 0);  // Local position relative to parent

console.log(child.transform.position);      // (3, 0, 0) - local
console.log(child.transform.worldPosition); // (8, 0, 0) - world position
```

## Position Operations

```ts
// Direct position setting
transform.setPosition(x, y, z);
transform.position.set(x, y, z);

// World space positioning (direct property assignment)
transform.worldPosition.set(x, y, z);

// Translation (additive movement)
transform.translate(new Vector3(1, 0, 0));           // Local space
transform.translate(new Vector3(1, 0, 0), false);    // World space
transform.translate(1, 0, 0);                       // Local space
transform.translate(1, 0, 0, false);                // World space

// Move forward in local coordinate system
const forward = transform.worldForward;
transform.translate(forward.scale(speed * deltaTime), false);
```

## Rotation Operations

Galacean supports both Euler angles (degrees) and quaternions for rotation:

```ts
// Euler angles (degrees) - applied in Y, X, Z order
transform.setRotation(30, 45, 0);
transform.rotation.set(30, 45, 0);

// Quaternions (more stable for animation)
transform.setRotationQuaternion(0, 0.707, 0, 0.707);
transform.rotationQuaternion.set(0, 0.707, 0, 0.707);

// World space rotation (direct property assignment)
transform.worldRotation.set(0, 90, 0);

// Incremental rotation
transform.rotate(new Vector3(0, 1, 0));              // Local space
transform.rotate(0, 1, 0);                          // Local space  
transform.rotate(new Vector3(0, 1, 0), false);      // World space

// Rotate around arbitrary axis
const axis = new Vector3(1, 1, 0).normalize();
transform.rotateByAxis(axis, 30);                   // 30 degrees
```

## LookAt Functionality

The `lookAt` method rotates the entity to face a target position:

```ts
const target = new Vector3(0, 0, 10);
const worldUp = new Vector3(0, 1, 0);  // Optional, defaults to world up

transform.lookAt(target, worldUp);

// Example: Camera following a character
const camera = scene.createRootEntity("Camera");
const character = scene.createRootEntity("Character");

character.transform.setPosition(5, 0, 5);
camera.transform.setPosition(0, 2, 0);
camera.transform.lookAt(character.transform.worldPosition);
```

## Scale Operations

```ts
// Uniform scaling
transform.setScale(2, 2, 2);
transform.scale.set(2, 2, 2);

// Non-uniform scaling
transform.setScale(1, 2, 0.5);

// Access world-space scale (lossy - may not preserve exact values)
const worldScale = transform.lossyWorldScale;
console.log("World scale:", worldScale.x, worldScale.y, worldScale.z);
```

> **Note**: `lossyWorldScale` may not be accurate when parent nodes have non-uniform scaling combined with child rotations, as the scaling becomes "tilted" in space.

## Matrix Operations

For advanced transformations, you can work directly with transformation matrices:

```ts
// Access local transformation matrix
const localMat = transform.localMatrix;

// Access world transformation matrix  
const worldMat = transform.worldMatrix;

// Decompose matrix back to TRS components
import { Matrix } from "@galacean/engine-math";
const matrix = new Matrix();
// ... set matrix values ...
transform.localMatrix = matrix;  // Automatically decomposes to position/rotation/scale

// Manual matrix construction
const position = new Vector3(5, 0, 0);
const rotation = new Quaternion(0, 0.707, 0, 0.707);
const scale = new Vector3(2, 2, 2);
Matrix.affineTransformation(scale, rotation, position, matrix);
transform.localMatrix = matrix;
```

## Direction Vectors

Transform provides convenient world-space direction vectors as properties:

```ts
// Get world-space direction vectors (normalized)
const forward = transform.worldForward;   // -Z axis in world space
const right = transform.worldRight;       // +X axis in world space
const up = transform.worldUp;             // +Y axis in world space

// Example: Move entity forward
const speed = 5;
const deltaTime = engine.time.deltaTime;
const movement = forward.clone().scale(speed * deltaTime);
transform.translate(movement, false);  // World space translation
```

> **Note**: Direction vectors are now properties (not methods). The old `getWorldForward()`, `getWorldRight()`, and `getWorldUp()` methods have been replaced with `worldForward`, `worldRight`, and `worldUp` properties.

## Performance Optimization

Transform uses efficient dirty flags to minimize expensive matrix calculations:

```ts
// Register for world transform change notifications
const changeFlag = transform.registerWorldChangeFlag();

engine.on("update", () => {
  if (changeFlag.flag) {
    changeFlag.flag = false;  // Reset flag
    console.log("Transform changed:", transform.worldMatrix);
  }
});

// Batch multiple transformations
transform.position.set(10, 0, 0);
transform.rotation.set(0, 45, 0);
transform.scale.set(2, 2, 2);
// World matrix only calculated once when accessed
const worldMatrix = transform.worldMatrix;
```

## Hierarchy Considerations

Transform behavior changes based on entity hierarchy:

```ts
const parent = scene.createRootEntity("Parent");
const child = parent.createChild("Child");

// Child inherits parent transformations
parent.transform.setPosition(5, 0, 0);
parent.transform.setRotation(0, 45, 0);
child.transform.setPosition(2, 0, 0);  // Local to parent

// Child's world position/rotation includes parent transformation
console.log(child.transform.worldPosition);  // Includes parent translation
console.log(child.transform.worldRotation);  // Includes parent rotation

// Moving child to different parent updates world calculations
const newParent = scene.createRootEntity("NewParent");
newParent.addChild(child);  // World position automatically recalculated
```

## Common Patterns

### Object Following
```ts
const follower = scene.createRootEntity("Follower");
const target = scene.createRootEntity("Target");

engine.on("update", () => {
  const targetPos = target.transform.worldPosition;
  const followerPos = follower.transform.worldPosition;
  
  // Move towards target
  const direction = Vector3.subtract(targetPos, followerPos, new Vector3());
  const distance = direction.length();
  
  if (distance > 0.1) {
    direction.normalize();
    const speed = 2 * engine.time.deltaTime;
    follower.transform.translate(direction.scale(speed), false);
  }
  
  // Look at target
  follower.transform.lookAt(targetPos);
});
```

### Orbit Camera
```ts
const camera = scene.createRootEntity("Camera");
const target = new Vector3(0, 0, 0);
let angle = 0;
const radius = 10;

engine.on("update", () => {
  angle += engine.time.deltaTime;
  
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  
  camera.transform.setWorldPosition(x, 5, z);
  camera.transform.lookAt(target);
});
```

### Local Space Movement
```ts
// Move relative to entity's current orientation
const entity = scene.createRootEntity("Player");

// Move forward regardless of world rotation
entity.transform.translate(0, 0, 1);  // Local forward (+Z)

// Strafe right
entity.transform.translate(1, 0, 0);  // Local right (+X)
```

## API Reference

```apidoc
Transform:
  Properties:
    position: Vector3
      - Local position relative to parent. Automatically triggers matrix updates.
    worldPosition: Vector3  
      - World-space position. Getter triggers world matrix calculation if dirty.
    rotation: Vector3
      - Local rotation in degrees (Y, X, Z order). Derived from rotationQuaternion when dirty.
    worldRotation: Vector3
      - World-space rotation in degrees. Derived from worldRotationQuaternion when dirty.
    rotationQuaternion: Quaternion  
      - Local rotation as unit quaternion. More stable than Euler angles for interpolation.
    worldRotationQuaternion: Quaternion
      - World-space rotation as unit quaternion. Computed from parent chain when dirty.
    scale: Vector3
      - Local scaling factors. Uniform scaling (x=y=z) enables optimizations.
    lossyWorldScale: Vector3
      - World-space scale approximation. May be inaccurate with non-uniform parent scaling.
    localMatrix: Matrix
      - Local transformation matrix. Computed from position/rotation/scale when dirty.
    worldMatrix: Matrix  
      - World transformation matrix. Computed from parent chain when dirty.
    worldForward: Vector3
      - Forward direction in world space (-Z axis). Normalized vector.
    worldRight: Vector3
      - Right direction in world space (+X axis). Normalized vector.
    worldUp: Vector3  
      - Up direction in world space (+Y axis). Normalized vector.

  Methods:
    setPosition(x: number, y: number, z: number): void
      - Set local position by component values.
    setRotation(x: number, y: number, z: number): void  
      - Set local rotation in degrees (Y, X, Z order).
    setRotationQuaternion(x: number, y: number, z: number, w: number): void
      - Set local rotation by quaternion components.
    setScale(x: number, y: number, z: number): void
      - Set local scale by component values.

    translate(translation: Vector3, relativeToLocal?: boolean): void
    translate(x: number, y: number, z: number, relativeToLocal?: boolean): void  
      - Translate by vector or component values. relativeToLocal defaults to true.
    rotate(rotation: Vector3, relativeToLocal?: boolean): void
    rotate(x: number, y: number, z: number, relativeToLocal?: boolean): void
      - Rotate by euler angles in degrees. relativeToLocal defaults to true.
    rotateByAxis(axis: Vector3, angle: number, relativeToLocal?: boolean): void
      - Rotate around arbitrary axis by angle in degrees. relativeToLocal defaults to true.
    lookAt(targetPosition: Vector3, worldUp?: Vector3): void
      - Rotate to face target position. worldUp defaults to (0, 1, 0).
    registerWorldChangeFlag(): BoolUpdateFlag
      - Subscribe to world transformation changes for optimization.
```

## Best Practices

- **Use local space** for entity-relative movements (character controls, object animation)
- **Use world space** for absolute positioning (UI elements, camera placement)
- **Prefer quaternions** over Euler angles for complex rotations and animation
- **Batch transformations** when possible - world matrices are computed lazily
- **Register change flags** to optimize systems that react to transform changes
- **Avoid frequent world-space queries** in performance-critical code
- **Use uniform scaling** when possible for better performance
- **Be cautious with lossyWorldScale** when dealing with complex hierarchies

## Common Issues

**Gimbal Lock with Euler Angles**: When rotating around multiple axes, Euler angles can lose a degree of freedom. Use quaternions for smooth rotation interpolation.

**Non-uniform Scaling Issues**: Complex hierarchies with non-uniform scaling can produce unexpected `lossyWorldScale` values. Consider restructuring hierarchy or using uniform scaling.

**Matrix Assignment**: When assigning to `localMatrix` or `worldMatrix`, the Transform automatically decomposes back to position/rotation/scale, which may introduce floating-point precision errors.
