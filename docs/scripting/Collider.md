# Collider

## Overview
Collider is the base class for all colliders in the Galacean Engine, used to represent collision boundaries of entities in the physics world. It inherits from Component and can be attached to Entity, providing collision detection and physics simulation functionality for entities. The Collider system supports both static and dynamic types, with configurable shapes and materials.

## Core Architecture

### Class Hierarchy
```
Component
    ↓
Collider (Abstract Base Class)
    ├── StaticCollider (Static Collider)
    └── DynamicCollider (Dynamic Collider)
```

### Main Components
- **Collider**: Base class for all colliders, managing shapes and collision layers
- **StaticCollider**: Static collider for non-moving objects
- **DynamicCollider**: Dynamic collider for objects that can move and be affected by forces
- **ColliderShape**: Abstract base class for collision shapes
- **PhysicsMaterial**: Physics material defining friction and elasticity properties

## API Reference

### Collider Base Class

#### Basic Properties
```typescript
// Collision shapes array
readonly shapes: Readonly<ColliderShape[]>

// Collision layer setting (single layer only)
collisionLayer: Layer
```

#### Shape Management
```typescript
// Add collision shape
addShape(shape: ColliderShape): void

// Remove collision shape
removeShape(shape: ColliderShape): void

// Clear all shapes
clearShapes(): void
```

### StaticCollider Static Collider

#### Features
```typescript
// Static collider - never moves, used for immovable objects like walls, floors
// Usage scenario
const staticCollider = entity.addComponent(StaticCollider);
const boxShape = new BoxColliderShape();
boxShape.size = new Vector3(1, 1, 1);
staticCollider.addShape(boxShape);
```

### DynamicCollider Dynamic Collider

#### Physics Properties
```typescript
// Damping properties
linearDamping: number;      // Linear damping
angularDamping: number;     // Angular damping

// Velocity properties
linearVelocity: Vector3;    // Linear velocity
angularVelocity: Vector3;   // Angular velocity

// Mass properties
mass: number;               // Mass
centerOfMass: Vector3;      // Center of mass
inertiaTensor: Vector3;     // Inertia tensor
```

#### Motion Control
```typescript
// Apply force and torque
applyForce(force: Vector3): void
applyTorque(torque: Vector3): void

// Kinematic control - multiple overloads
move(position: Vector3): void
move(rotation: Quaternion): void  
move(position: Vector3, rotation: Quaternion): void

// Sleep control
sleep(): void
wakeUp(): void
isSleeping(): boolean
```

#### Physics Constraints
```typescript
// Gravity and kinematic mode
useGravity: boolean         // Whether affected by gravity
isKinematic: boolean        // Whether in kinematic mode

// Motion constraints
constraints: DynamicColliderConstraints

// Collision detection mode
collisionDetectionMode: CollisionDetectionMode
```

### ColliderShape Collision Shape Base Class

#### Basic Properties
```typescript
// Shape properties
readonly id: number                 // Unique identifier
readonly collider: Collider        // Owner collider

// Transform properties
position: Vector3                   // Local position
rotation: Vector3                   // Local rotation (degrees)

// Physics properties
material: PhysicsMaterial          // Physics material
isTrigger: boolean                 // Whether it's a trigger
contactOffset: number              // Contact offset. @defaultValue `0.02`
```

#### Distance Query
```typescript
// Get closest distance and position to a point
getClosestPoint(point: Vector3, outClosestPoint: Vector3): number
```

### Specific Shape Types

#### BoxColliderShape Box Collider
```typescript
class BoxColliderShape extends ColliderShape {
  size: Vector3  // Box dimensions
}

// Create box collider
const boxShape = new BoxColliderShape();
boxShape.size = new Vector3(2, 1, 1);  // Width, height, depth
```

#### SphereColliderShape Sphere Collider
```typescript
class SphereColliderShape extends ColliderShape {
  radius: number  // Sphere radius
}

// Create sphere collider
const sphereShape = new SphereColliderShape();
sphereShape.radius = 0.5;
```

#### CapsuleColliderShape Capsule Collider
```typescript
class CapsuleColliderShape extends ColliderShape {
  radius: number    // Radius
  height: number    // Total height
  upAxis: ColliderShapeUpAxis  // Up axis direction
}
```

#### PlaneColliderShape Plane Collider
```typescript
class PlaneColliderShape extends ColliderShape {
  // Infinite plane with normal pointing in positive Y direction
}
```

### PhysicsMaterial Physics Material

#### Friction Properties
```typescript
// Friction coefficients
staticFriction: number      // Static friction coefficient. @defaultValue `0.6`
dynamicFriction: number     // Dynamic friction coefficient. @defaultValue `0.6`

// Elasticity coefficient
bounciness: number          // Bounciness coefficient (0-1). @defaultValue `0`
```

#### Combine Modes
```typescript
// Friction and bounce combine modes
frictionCombine: PhysicsMaterialCombineMode  // @defaultValue `PhysicsMaterialCombineMode.Average`
bounceCombine: PhysicsMaterialCombineMode    // @defaultValue `PhysicsMaterialCombineMode.Average`
```

## Enum Types

### CollisionDetectionMode Collision Detection Mode
```typescript
enum CollisionDetectionMode {
  Discrete,                // Discrete detection
  Continuous,             // Continuous detection (static)
  ContinuousDynamic,      // Continuous detection (dynamic)
  ContinuousSpeculative   // Speculative continuous detection
}
```

### DynamicColliderConstraints Dynamic Constraints
```typescript
enum DynamicColliderConstraints {
  None = 0,                    // No constraints
  FreezePositionX = 1,        // Freeze X axis translation
  FreezePositionY = 2,        // Freeze Y axis translation
  FreezePositionZ = 4,        // Freeze Z axis translation
  FreezeRotationX = 8,        // Freeze X axis rotation
  FreezeRotationY = 16,       // Freeze Y axis rotation
  FreezeRotationZ = 32        // Freeze Z axis rotation
}
```

### PhysicsMaterialCombineMode Material Combine Mode
```typescript
enum PhysicsMaterialCombineMode {
  Average,    // Average value
  Minimum,    // Minimum value
  Maximum,    // Maximum value
  Multiply    // Product
}
```

## Usage Examples

### Creating Static Collider
```typescript
// Ground collider
const groundEntity = rootEntity.createChild("Ground");
const staticCollider = groundEntity.addComponent(StaticCollider);

// Add plane shape
const planeShape = new PlaneColliderShape();
planeShape.material.staticFriction = 0.8;
planeShape.material.dynamicFriction = 0.6;
staticCollider.addShape(planeShape);
```

### Creating Dynamic Collider
```typescript
// Movable ball
const ballEntity = rootEntity.createChild("Ball");
ballEntity.transform.setPosition(0, 5, 0);

const dynamicCollider = ballEntity.addComponent(DynamicCollider);

// Configure physics properties
dynamicCollider.mass = 1.0;
dynamicCollider.useGravity = true;
dynamicCollider.linearDamping = 0.1;
dynamicCollider.angularDamping = 0.05;

// Add sphere shape
const sphereShape = new SphereColliderShape();
sphereShape.radius = 0.5;
sphereShape.material.bounciness = 0.8;
dynamicCollider.addShape(sphereShape);
```

### Compound Shape Collider
```typescript
// Complex-shaped vehicle
const vehicleEntity = rootEntity.createChild("Vehicle");
const vehicleCollider = vehicleEntity.addComponent(DynamicCollider);

// Vehicle body
const bodyShape = new BoxColliderShape();
bodyShape.size = new Vector3(2, 0.8, 4);
bodyShape.position = new Vector3(0, 0.4, 0);

// Vehicle roof
const roofShape = new BoxColliderShape();
roofShape.size = new Vector3(1.5, 0.6, 2);
roofShape.position = new Vector3(0, 1.1, -0.5);

vehicleCollider.addShape(bodyShape);
vehicleCollider.addShape(roofShape);
```

### Trigger Collider
```typescript
// Checkpoint trigger
const checkpointEntity = rootEntity.createChild("Checkpoint");
const triggerCollider = checkpointEntity.addComponent(StaticCollider);

const triggerShape = new BoxColliderShape();
triggerShape.size = new Vector3(2, 3, 1);
triggerShape.isTrigger = true;  // Set as trigger
triggerCollider.addShape(triggerShape);
```

### Applying Forces and Control
```typescript
// Forward propulsion
const forwardForce = new Vector3(0, 0, 100);
dynamicCollider.applyForce(forwardForce);

// Upward jump
const jumpForce = new Vector3(0, 500, 0);
dynamicCollider.applyForce(jumpForce);

// Rotation torque
const torque = new Vector3(10, 0, 0);
dynamicCollider.applyTorque(torque);

// Kinematic control
if (dynamicCollider.isKinematic) {
  const targetPosition = new Vector3(10, 0, 0);
  dynamicCollider.move(targetPosition);
}
```

### Advanced Physics Configuration
```typescript
// Continuous collision detection for high-speed objects
dynamicCollider.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;

// Constrain motion axes
dynamicCollider.constraints = 
  DynamicColliderConstraints.FreezeRotationX | 
  DynamicColliderConstraints.FreezeRotationZ;

// Custom center of mass and inertia
dynamicCollider.automaticCenterOfMass = false;
dynamicCollider.centerOfMass = new Vector3(0, -0.2, 0);

dynamicCollider.automaticInertiaTensor = false;
dynamicCollider.inertiaTensor = new Vector3(1, 2, 1);
```

### Collision Layer Configuration
```typescript
// Set collision layer
collider.collisionLayer = Layer.Layer1;

// Note: Only single layer can be set, not multiple layers
// collider.collisionLayer = Layer.Layer1 | Layer.Layer2; // ❌ Error
```

## Best Practices

### Performance Optimization
1. **Shape Selection**: Prioritize simple shapes (sphere, box, capsule)
2. **Static Optimization**: Use StaticCollider for non-moving objects
3. **Sleep Mechanism**: Properly set sleepThreshold to let stationary objects sleep
4. **Collision Layers**: Use collision layers to reduce unnecessary collision calculations

### Physics Realism
1. **Mass Setting**: Set reasonable mass based on actual objects
2. **Friction Materials**: Use different friction and elasticity parameters for different materials
3. **Damping Configuration**: Set appropriate linear and angular damping to simulate air resistance
4. **Gravity Setting**: Adjust gravity influence based on game requirements

### Collision Detection
1. **Detection Mode**: Use continuous collision detection for high-speed objects
2. **Triggers**: Use for area detection in game logic
3. **Constraint Usage**: Limit unnecessary degrees of freedom in motion
4. **Contact Offset**: Adjust contactOffset to avoid penetration

### Debugging and Monitoring
1. **Physics Visualization**: Enable visual debugging of physics shapes
2. **Performance Monitoring**: Monitor physics simulation performance overhead
3. **Parameter Debugging**: Real-time adjustment of physics parameters to observe effects
4. **Exception Handling**: Handle abnormal situations in physics simulation

## Important Notes

### Design Limitations
- Collision layers only support single layer setting, cannot belong to multiple layers simultaneously
- Material cannot be null, each shape must have a valid physics material
- Shape local transforms are relative to the entity containing the collider

### Performance Considerations
- Complex shapes increase collision detection overhead
- Too many dynamic colliders affect physics simulation performance
- Continuous collision detection consumes more performance than discrete detection

### Usage Constraints
- Kinematic objects are not affected by forces and gravity, can only be controlled through move method
- Triggers do not participate in physics collisions, only used for enter and exit event detection
- Automatic center of mass and inertia tensor calculations depend on shape geometric properties
