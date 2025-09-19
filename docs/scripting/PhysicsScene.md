# PhysicsScene

## Overview
PhysicsScene is the core manager of the physics world in the Galacean Engine, responsible for handling all physics simulation, collision detection, ray queries, and shape overlap detection. It serves as the central coordinator of the physics system, managing collider lifecycles, handling physics event callbacks, and providing powerful spatial query capabilities.

## Core Architecture

### Physics World Structure
```
Scene
    ↓
PhysicsScene (Physics World Manager)
    ├── Colliders Management
    ├── Physics Simulation
    ├── Spatial Queries
    └── Event System
```

### Main Responsibilities
- **Physics Simulation**: Managing gravity, time steps, and physics update loops
- **Collision Detection**: Handling collision enter, exit, and stay events
- **Spatial Queries**: Ray casting, shape sweeping, and overlap detection
- **Layer Management**: Controlling interactions between collision layers
- **Performance Optimization**: Collider sleeping and garbage collection mechanisms

## API Reference

### Physics Properties Configuration

#### Gravity Setting
```typescript
// Gravity vector
gravity: Vector3  // @defaultValue `new Vector3(0, -9.81, 0)`

// Gravity configuration examples
scene.physics.gravity = new Vector3(0, -9.81, 0);  // Standard Earth gravity
scene.physics.gravity = new Vector3(0, -20, 0);    // High gravity environment
scene.physics.gravity = new Vector3(0, 0, 0);      // Zero gravity environment
```

#### Time Step Control
```typescript
// Fixed physics time step
fixedTimeStep: number  // @defaultValue `1/60`

// Time step configuration
scene.physics.fixedTimeStep = 1/60;   // 60 FPS physics update
scene.physics.fixedTimeStep = 1/120;  // 120 FPS high precision physics
```

### Collision Layer Management

#### Layer Interaction Control
```typescript
// Query whether two collision layers can collide
getColliderLayerCollision(layer1: Layer, layer2: Layer): boolean

// Set whether two collision layers can collide
setColliderLayerCollision(layer1: Layer, layer2: Layer, enabled: boolean): void

// Usage examples
// Set player and enemy layers to collide
scene.physics.setColliderLayerCollision(Layer.Layer0, Layer.Layer1, true);

// Set UI and game objects to not collide
scene.physics.setColliderLayerCollision(Layer.Layer2, Layer.Layer0, false);

// Query layer interaction
const canCollide = scene.physics.getColliderLayerCollision(Layer.Layer0, Layer.Layer1);
```

### Raycasting

#### Basic Raycast
```typescript
// Simple ray detection
raycast(ray: Ray): boolean

// Ray detection with distance limit
raycast(ray: Ray, distance: number): boolean

// Ray detection with result information
raycast(ray: Ray, outHitResult: HitResult): boolean

// Full parameter ray detection
raycast(ray: Ray, distance: number, layerMask: Layer, outHitResult: HitResult): boolean
```

#### Raycast Examples
```typescript
import { Ray, Vector3, HitResult } from "@galacean/engine";

// Create ray from camera to mouse position
const ray = camera.screenPointToRay(mousePosition);
const hitResult = new HitResult();

// Basic ray detection
if (scene.physics.raycast(ray)) {
  console.log("Ray hit something");
}

// Ray detection with distance and result
if (scene.physics.raycast(ray, 100, Layer.Everything, hitResult)) {
  console.log(`Hit entity: ${hitResult.entity.name}`);
  console.log(`Hit distance: ${hitResult.distance}`);
  console.log(`Hit point: ${hitResult.point}`);
  console.log(`Surface normal: ${hitResult.normal}`);
  console.log(`Hit shape: ${hitResult.shape}`);
}

// Ray detection for specific layers only
const playerLayerMask = Layer.Layer0;
if (scene.physics.raycast(ray, 50, playerLayerMask, hitResult)) {
  // Will only hit objects on Layer0
}
```

### Shape Casting

> **Note**: Shape casting methods (`boxCast`, `sphereCast`, `capsuleCast`) are only available when using PhysX physics engine. They will throw an error with LitePhysics.

#### Box Cast
```typescript
// Basic box cast
boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3): boolean

// Box cast with result
boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3, outHitResult: HitResult): boolean

// Box cast with distance
boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3, distance: number): boolean

// Box cast with distance and result
boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3, distance: number, outHitResult: HitResult): boolean

// Full parameter box cast
boxCast(
  center: Vector3,
  halfExtents: Vector3,
  direction: Vector3,
  orientation: Quaternion,
  distance: number,
  layerMask: Layer,
  outHitResult?: HitResult
): boolean
```

#### Sphere Cast
```typescript
// Basic sphere cast
sphereCast(center: Vector3, radius: number, direction: Vector3): boolean

// Sphere cast with result
sphereCast(center: Vector3, radius: number, direction: Vector3, outHitResult: HitResult): boolean

// Sphere cast with distance
sphereCast(center: Vector3, radius: number, direction: Vector3, distance: number): boolean

// Sphere cast with distance and result
sphereCast(center: Vector3, radius: number, direction: Vector3, distance: number, outHitResult: HitResult): boolean

// Full parameter sphere cast
sphereCast(
  center: Vector3,
  radius: number,
  direction: Vector3,
  distance: number,
  layerMask: Layer,
  outHitResult?: HitResult
): boolean
```

#### Capsule Cast
```typescript
// Basic capsule cast
capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3): boolean

// Capsule cast with result
capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3, outHitResult: HitResult): boolean

// Capsule cast with distance
capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3, distance: number): boolean

// Capsule cast with distance and result
capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3, distance: number, outHitResult: HitResult): boolean

// Full parameter capsule cast
capsuleCast(
  center: Vector3,
  radius: number,
  height: number,
  direction: Vector3,
  orientation: Quaternion,
  distance: number,
  layerMask: Layer,
  outHitResult?: HitResult
): boolean
```

#### Shape Cast Examples
```typescript
// Character movement collision detection
const characterCenter = transform.position;
const halfSize = new Vector3(0.5, 1, 0.5);
const moveDirection = new Vector3(1, 0, 0);
const hitResult = new HitResult();

// Check if character movement path has obstacles
if (scene.physics.boxCast(characterCenter, halfSize, moveDirection, 2.0, Layer.Everything, hitResult)) {
  console.log("Movement path blocked");
  // Get collision point for path adjustment
  const obstaclePosition = hitResult.point;
}

// Sphere area attack detection
const attackCenter = weapon.transform.position;
const attackRadius = 3.0;
const attackDirection = weapon.transform.forward;

if (scene.physics.sphereCast(attackCenter, attackRadius, attackDirection, 5.0)) {
  console.log("Attack hit target");
}
```

### Overlap Detection

#### Box Overlap Detection
```typescript
// Get all collider shapes overlapping with a box
overlapBoxAll(
  center: Vector3,
  halfExtents: Vector3,
  orientation: Quaternion = Quaternion.IDENTITY,
  layerMask: Layer = Layer.Everything,
  shapes: ColliderShape[] = []
): ColliderShape[]
```

#### Sphere Overlap Detection
```typescript
// Get all collider shapes overlapping with a sphere
overlapSphereAll(
  center: Vector3,
  radius: number,
  layerMask: Layer = Layer.Everything,
  shapes: ColliderShape[] = []
): ColliderShape[]
```

#### Capsule Overlap Detection
```typescript
// Get all collider shapes overlapping with a capsule
overlapCapsuleAll(
  center: Vector3,
  radius: number,
  height: number,
  orientation: Quaternion = Quaternion.IDENTITY,
  layerMask: Layer = Layer.Everything,
  shapes: ColliderShape[] = []
): ColliderShape[]
```

#### Overlap Detection Examples
```typescript
// All targets within explosion range
const explosionCenter = bomb.transform.position;
const explosionRadius = 10.0;
const affectedShapes: ColliderShape[] = [];

// Get all colliders within explosion range
scene.physics.overlapSphereAll(explosionCenter, explosionRadius, Layer.Everything, affectedShapes);

for (const shape of affectedShapes) {
  const entity = shape.collider.entity;
  console.log(`${entity.name} affected by explosion`);
  
  // Apply explosion force to dynamic objects
  const dynamicCollider = entity.getComponent(DynamicCollider);
  if (dynamicCollider) {
    const direction = entity.transform.position.subtract(explosionCenter).normalize();
    const explosionForce = direction.scale(1000);
    dynamicCollider.applyForce(explosionForce);
  }
}

// Detect players in trigger area
const triggerCenter = checkpoint.transform.position;
const triggerSize = new Vector3(2, 3, 2);
const playersInTrigger: ColliderShape[] = [];

scene.physics.overlapBoxAll(
  triggerCenter, 
  triggerSize, 
  checkpoint.transform.rotation,
  Layer.Layer0,  // Assume players are on Layer0
  playersInTrigger
);

if (playersInTrigger.length > 0) {
  console.log("Player entered checkpoint");
}
```

### HitResult Information

#### Collision Result Structure
```typescript
class HitResult {
  entity: Entity;          // The hit entity
  distance: number;        // Distance from ray origin to hit point
  point: Vector3;          // Hit point in world space
  normal: Vector3;         // Normal of the hit surface
  shape: ColliderShape;    // The hit collider shape
}
```

#### Result Information Application
```typescript
const ray = new Ray(origin, direction);
const hitResult = new HitResult();

if (scene.physics.raycast(ray, 100, Layer.Everything, hitResult)) {
  // Get components of the hit entity
  const renderer = hitResult.entity.getComponent(MeshRenderer);
  if (renderer) {
    // Change material color of the hit object
    renderer.material.baseColor = new Color(1, 0, 0, 1);
  }
  
  // Create effect at hit point
  const effect = createEffect();
  effect.transform.position = hitResult.point.clone();
  effect.transform.rotation = Quaternion.lookRotation(hitResult.normal);
  
  // Calculate damage falloff based on hit distance
  const damage = baseDamage * (1 - hitResult.distance / maxDistance);
  
  // Get material information of the hit shape
  const material = hitResult.shape.material;
  const surfaceType = getSurfaceType(material.staticFriction, material.bounciness);
}
```

## Physics Event System

### Collision Events
PhysicsScene automatically handles collision events and calls corresponding Script methods:

```typescript
// Handle collision events in Script component
export class CollisionHandler extends Script {
  onCollisionEnter(collision: Collision) {
    console.log(`${this.entity.name} started colliding`);
    console.log(`Collision object: ${collision.shape.collider.entity.name}`);
  }
  
  onCollisionExit(collision: Collision) {
    console.log(`${this.entity.name} stopped colliding`);
  }
  
  onCollisionStay(collision: Collision) {
    console.log(`${this.entity.name} continuing collision`);
  }
}
```

### Trigger Events
```typescript
export class TriggerHandler extends Script {
  onTriggerEnter(shape: ColliderShape) {
    console.log(`${this.entity.name} trigger activated`);
    console.log(`Triggering object: ${shape.collider.entity.name}`);
  }
  
  onTriggerExit(shape: ColliderShape) {
    console.log(`${this.entity.name} trigger ended`);
  }
  
  onTriggerStay(shape: ColliderShape) {
    console.log(`${this.entity.name} trigger continuing`);
  }
}
```

## Advanced Application Scenarios

### Gameplay Applications

#### First-Person Shooter Game
```typescript
export class WeaponSystem extends Script {
  private camera: Camera;
  private weapon: Entity;
  
  onAwake() {
    this.camera = this.entity.getComponent(Camera);
  }
  
  shoot() {
    // Fire ray from camera center
    const ray = new Ray(
      this.camera.transform.position,
      this.camera.transform.forward
    );
    
    const hitResult = new HitResult();
    const weaponRange = 100;
    const enemyLayer = Layer.Layer1;
    
    if (this.scene.physics.raycast(ray, weaponRange, enemyLayer, hitResult)) {
      // Hit enemy
      const enemy = hitResult.entity.getComponent(EnemyController);
      if (enemy) {
        enemy.takeDamage(this.weaponDamage);
        
        // Create bullet hole effect at hit point
        this.createBulletHole(hitResult.point, hitResult.normal);
      }
    }
  }
  
  private createBulletHole(position: Vector3, normal: Vector3) {
    const bulletHole = this.engine.resourceManager
      .getResource<Entity>("BulletHolePrefab")
      .clone();
    
    bulletHole.transform.position = position;
    bulletHole.transform.rotation = Quaternion.lookRotation(normal);
    this.scene.addRootEntity(bulletHole);
  }
}
```

#### Platform Jump Game
```typescript
export class PlatformerController extends Script {
  private collider: DynamicCollider;
  private isGrounded: boolean = false;
  
  onAwake() {
    this.collider = this.entity.getComponent(DynamicCollider);
  }
  
  checkGrounded() {
    const rayOrigin = this.entity.transform.position;
    const rayDirection = new Vector3(0, -1, 0);
    const groundCheckDistance = 0.6;
    
    // Detect if character is on the ground
    this.isGrounded = this.scene.physics.raycast(
      new Ray(rayOrigin, rayDirection),
      groundCheckDistance,
      Layer.Layer2  // Ground layer
    );
  }
  
  jump() {
    if (this.isGrounded) {
      const jumpForce = new Vector3(0, 500, 0);
      this.collider.applyForce(jumpForce);
    }
  }
  
  moveHorizontal(direction: number) {
    // Check for obstacles in movement direction
    const moveDirection = new Vector3(direction, 0, 0);
    const characterSize = new Vector3(0.5, 1, 0.5);
    const moveDistance = 1.0;
    
    if (!this.scene.physics.boxCast(
      this.entity.transform.position,
      characterSize,
      moveDirection,
      moveDistance,
      Layer.Layer2  // Obstacle layer
    )) {
      // No obstacles, can move
      const moveForce = moveDirection.scale(300);
      this.collider.applyForce(moveForce);
    }
  }
}
```

#### Vehicle Physics
```typescript
export class VehiclePhysics extends Script {
  private collider: DynamicCollider;
  private wheelColliders: SphereColliderShape[] = [];
  
  onAwake() {
    this.collider = this.entity.getComponent(DynamicCollider);
    this.setupWheels();
  }
  
  private setupWheels() {
    // Create ground detection for each wheel
    const wheelPositions = [
      new Vector3(-1, -0.5, 1.5),   // Front left wheel
      new Vector3(1, -0.5, 1.5),    // Front right wheel
      new Vector3(-1, -0.5, -1.5),  // Rear left wheel
      new Vector3(1, -0.5, -1.5)    // Rear right wheel
    ];
    
    wheelPositions.forEach(pos => {
      const wheelShape = new SphereColliderShape();
      wheelShape.radius = 0.3;
      wheelShape.position = pos;
      this.wheelColliders.push(wheelShape);
    });
  }
  
  simulateWheelPhysics() {
    this.wheelColliders.forEach((wheel, index) => {
      const wheelWorldPos = this.entity.transform.position.add(wheel.position);
      const downRay = new Ray(wheelWorldPos, new Vector3(0, -1, 0));
      const hitResult = new HitResult();
      
      if (this.scene.physics.raycast(downRay, 1.0, Layer.Layer2, hitResult)) {
        // Wheel is touching the ground, apply suspension force
        const suspensionDistance = hitResult.distance;
        const suspensionForce = this.calculateSuspensionForce(suspensionDistance);
        
        // Apply upward force at wheel position
        this.collider.applyForce(suspensionForce);
      }
    });
  }
  
  private calculateSuspensionForce(distance: number): Vector3 {
    const springStrength = 1000;
    const targetDistance = 0.5;
    const compression = Math.max(0, targetDistance - distance);
    return new Vector3(0, compression * springStrength, 0);
  }
}
```

### Advanced Query Applications

#### AI Vision Detection
```typescript
export class AIVision extends Script {
  private viewDistance: number = 20;
  private viewAngle: number = 60;
  
  canSeeTarget(target: Entity): boolean {
    const eyePosition = this.entity.transform.position.add(new Vector3(0, 1.6, 0));
    const targetPosition = target.transform.position.add(new Vector3(0, 1, 0));
    
    const direction = targetPosition.subtract(eyePosition);
    const distance = direction.length();
    
    // Check distance
    if (distance > this.viewDistance) return false;
    
    // Check angle
    const forward = this.entity.transform.forward;
    const angle = Vector3.angle(forward, direction.normalize());
    if (angle > this.viewAngle / 2) return false;
    
    // Raycast for occlusion
    const ray = new Ray(eyePosition, direction.normalize());
    const hitResult = new HitResult();
    
    if (this.scene.physics.raycast(ray, distance, Layer.Everything, hitResult)) {
      // If hit target, can see
      return hitResult.entity === target;
    }
    
    return true;  // Nothing hit, can see
  }
  
  scanForEnemies(): Entity[] {
    const visibleEnemies: Entity[] = [];
    const scanCenter = this.entity.transform.position;
    const scanRadius = this.viewDistance;
    const enemyShapes: ColliderShape[] = [];
    
    // Get all enemies within scan range
    this.scene.physics.overlapSphereAll(
      scanCenter,
      scanRadius,
      Layer.Layer1,  // Enemy layer
      enemyShapes
    );
    
    for (const shape of enemyShapes) {
      const enemy = shape.collider.entity;
      if (this.canSeeTarget(enemy)) {
        visibleEnemies.push(enemy);
      }
    }
    
    return visibleEnemies;
  }
}
```

#### Environment Interaction System
```typescript
export class InteractionSystem extends Script {
  private interactionRange: number = 2.0;
  
  getInteractableObjects(): Entity[] {
    const playerPosition = this.entity.transform.position;
    const interactableShapes: ColliderShape[] = [];
    
    // Get all objects within interaction range
    this.scene.physics.overlapSphereAll(
      playerPosition,
      this.interactionRange,
      Layer.Layer3,  // Interactable object layer
      interactableShapes
    );
    
    return interactableShapes
      .map(shape => shape.collider.entity)
      .filter(entity => entity.getComponent(Interactable));
  }
  
  getClosestInteractable(): Entity | null {
    const interactables = this.getInteractableObjects();
    if (interactables.length === 0) return null;
    
    const playerPos = this.entity.transform.position;
    let closest: Entity | null = null;
    let closestDistance = Infinity;
    
    for (const interactable of interactables) {
      const distance = Vector3.distance(playerPos, interactable.transform.position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = interactable;
      }
    }
    
    return closest;
  }
}
```

## Performance Optimization

### Query Optimization Strategies
1. **Layer Separation**: Place different types of objects on different collision layers
2. **Distance Culling**: Limit query distance to avoid unnecessary remote detection
3. **Frequency Control**: Queries that don't need to run every frame can reduce frequency
4. **Result Caching**: Cache query results to avoid repeated calculations

```typescript
export class OptimizedPhysicsQueries extends Script {
  private lastScanTime: number = 0;
  private scanInterval: number = 0.1;  // Scan every 100ms
  private cachedResults: Entity[] = [];
  
  onUpdate(deltaTime: number) {
    const currentTime = this.engine.time.nowTime;
    
    if (currentTime - this.lastScanTime > this.scanInterval) {
      this.performExpensiveScan();
      this.lastScanTime = currentTime;
    }
    
    // Use cached results for fast operations
    this.processResults(this.cachedResults);
  }
  
  private performExpensiveScan() {
    // Only scan relevant layers
    const relevantLayers = Layer.Layer1 | Layer.Layer2;
    const scanRange = 10;  // Limit scan range
    
    const shapes: ColliderShape[] = [];
    this.scene.physics.overlapSphereAll(
      this.entity.transform.position,
      scanRange,
      relevantLayers,
      shapes
    );
    
    this.cachedResults = shapes.map(s => s.collider.entity);
  }
}
```

### Memory Management
```typescript
export class PhysicsMemoryManager {
  private hitResultPool: HitResult[] = [];
  private shapeArrayPool: ColliderShape[][] = [];
  
  getHitResult(): HitResult {
    return this.hitResultPool.pop() || new HitResult();
  }
  
  returnHitResult(result: HitResult) {
    // Clear result object
    result.entity = null;
    result.shape = null;
    result.distance = 0;
    result.point.set(0, 0, 0);
    result.normal.set(0, 0, 0);
    
    this.hitResultPool.push(result);
  }
  
  getShapeArray(): ColliderShape[] {
    const array = this.shapeArrayPool.pop() || [];
    array.length = 0;  // Clear array
    return array;
  }
  
  returnShapeArray(array: ColliderShape[]) {
    if (array.length < 100) {  // Avoid caching very large arrays
      this.shapeArrayPool.push(array);
    }
  }
}
```

## Best Practices

### Query Design Principles
1. **Clear Purpose**: Each query should have a clear game logic purpose
2. **Minimal Scope**: Use the minimum necessary query range and layer filtering
3. **Reasonable Frequency**: Set appropriate query frequency based on game requirements
4. **Result Processing**: Process query results promptly to avoid accumulation

### Layer Planning Recommendations
```typescript
// Recommended layer allocation
enum GameLayers {
  Player = Layer.Layer0,
  Enemy = Layer.Layer1,
  Environment = Layer.Layer2,
  Interactable = Layer.Layer3,
  Projectile = Layer.Layer4,
  Trigger = Layer.Layer5,
  UI = Layer.Layer6,
  Effect = Layer.Layer7
}

// Setup layer interaction matrix
function setupCollisionMatrix(physics: PhysicsScene) {
  // Player collides with enemies, environment, and interactive objects
  physics.setColliderLayerCollision(GameLayers.Player, GameLayers.Enemy, true);
  physics.setColliderLayerCollision(GameLayers.Player, GameLayers.Environment, true);
  physics.setColliderLayerCollision(GameLayers.Player, GameLayers.Interactable, false);  // Trigger mode
  
  // Projectiles collide with players, enemies, and environment
  physics.setColliderLayerCollision(GameLayers.Projectile, GameLayers.Player, true);
  physics.setColliderLayerCollision(GameLayers.Projectile, GameLayers.Enemy, true);
  physics.setColliderLayerCollision(GameLayers.Projectile, GameLayers.Environment, true);
  
  // UI layer doesn't interact with any physics layers
  physics.setColliderLayerCollision(GameLayers.UI, GameLayers.Player, false);
  physics.setColliderLayerCollision(GameLayers.UI, GameLayers.Enemy, false);
  
  // Effect layer is visual only, doesn't participate in physics interactions
  physics.setColliderLayerCollision(GameLayers.Effect, GameLayers.Player, false);
  physics.setColliderLayerCollision(GameLayers.Effect, GameLayers.Enemy, false);
}
```

### Debugging and Monitoring
```typescript
export class PhysicsDebugger extends Script {
  private static debugRays: Array<{ray: Ray, color: Color, duration: number}> = [];
  
  static drawRay(ray: Ray, color: Color = Color.red, duration: number = 1.0) {
    this.debugRays.push({ray, color, duration});
  }
  
  onUpdate(deltaTime: number) {
    // Visualize rays (in development mode)
    if (this.engine.debug) {
      this.debugRays.forEach(debugRay => {
        this.drawDebugLine(
          debugRay.ray.origin,
          debugRay.ray.origin.add(debugRay.ray.direction.scale(10)),
          debugRay.color
        );
        debugRay.duration -= deltaTime;
      });
      
      this.debugRays = this.debugRays.filter(ray => ray.duration > 0);
    }
  }
  
  private drawDebugLine(start: Vector3, end: Vector3, color: Color) {
    // Implement debug line drawing
    // This requires a debug rendering system
  }
}

// Use debug feature in queries
export class DebuggableRaycast extends Script {
  performRaycast() {
    const ray = new Ray(this.entity.transform.position, this.entity.transform.forward);
    const hitResult = new HitResult();
    
    // Draw debug ray
    PhysicsDebugger.drawRay(ray, Color.blue, 0.5);
    
    if (this.scene.physics.raycast(ray, 10, Layer.Everything, hitResult)) {
      // Draw hit point
      PhysicsDebugger.drawRay(
        new Ray(hitResult.point, hitResult.normal),
        Color.red,
        1.0
      );
    }
  }
}
```

## Important Notes

### Performance Considerations
- Computational complexity of shape queries: Sphere < Capsule < Box
- Overlap queries are more efficient than sweep queries
- Excessive spatial queries can affect frame rate
- Use layer filtering reasonably to reduce detection range

### Precision Issues
- Fast-moving objects may penetrate thin walls (use continuous collision detection)
- Ray origins cannot be inside colliders
- Extremely small contactOffset may cause precision issues

### Design Limitations
- Collision layer settings must be single-layer, multi-layer combinations not supported
- HitResult objects require manual lifecycle management
- Physics queries are immediate, cannot cache internal state across frames
