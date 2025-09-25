# Script System

Galacean's Script System provides a powerful framework for implementing game logic through component-based scripting. Scripts extend the base Component class and offer comprehensive lifecycle management, event handling, and interaction capabilities. The script system serves as the bridge between engine capabilities and game logic, enabling developers to create complex behaviors and interactions.

The Script System includes:
- **Script Lifecycle Management**: Complete lifecycle hooks from initialization to destruction
- **Event-Driven Architecture**: Comprehensive event handling for user input, physics, and rendering
- **Component Integration**: Seamless integration with the entity-component system
- **Performance Optimization**: Efficient script execution and management
- **Communication System**: Event-based communication between scripts and external systems
- **Physics Integration**: Built-in physics event handling and collision detection

## Quick Start

```ts
import { Script, Entity, Vector3 } from "@galacean/engine";

// Create a basic script class
class RotationScript extends Script {
  public rotationSpeed: number = 90; // degrees per second
  
  // Called once when the script is first enabled
  onAwake(): void {
    console.log("RotationScript awakened on entity:", this.entity.name);
  }
  
  // Called when the script becomes enabled
  onEnable(): void {
    console.log("RotationScript enabled");
  }
  
  // Called before the first frame update, only once
  onStart(): void {
    console.log("RotationScript started");
    // Initialize any resources or state here
  }
  
  // Called every frame
  onUpdate(deltaTime: number): void {
    // Rotate the entity around Y-axis
    const rotationAmount = this.rotationSpeed * deltaTime;
    this.entity.transform.rotate(0, rotationAmount, 0);
  }
  
  // Called after all onUpdate calls
  onLateUpdate(deltaTime: number): void {
    // Perform any cleanup or final calculations
  }
  
  // Called when the script becomes disabled
  onDisable(): void {
    console.log("RotationScript disabled");
  }
  
  // Called when the script is destroyed
  onDestroy(): void {
    console.log("RotationScript destroyed");
    // Clean up resources here
  }
}

// Usage
const scene = engine.sceneManager.activeScene;
const entity = scene.createRootEntity("RotatingCube");
const rotationScript = entity.addComponent(RotationScript);
rotationScript.rotationSpeed = 45; // Customize rotation speed
```

## Script Lifecycle

The script lifecycle provides hooks for different stages of a script's existence:

```ts
class CompleteLifecycleScript extends Script {
  private startTime: number = 0;
  private frameCount: number = 0;
  
  // 1. Called when the script is first enabled (only once)
  onAwake(): void {
    console.log("1. onAwake - Script initialized");
    this.startTime = Date.now();
    
    // Perfect place for:
    // - Initial setup
    // - Finding references to other components
    // - Setting up event listeners
  }
  
  // 2. Called when the script becomes enabled
  onEnable(): void {
    console.log("2. onEnable - Script enabled");
    
    // Perfect place for:
    // - Resuming operations
    // - Re-enabling behaviors
    // - Resetting state
  }
  
  // 3. Called before the first frame update (only once)
  onStart(): void {
    console.log("3. onStart - First frame preparation");
    
    // Perfect place for:
    // - Final initialization after all components are ready
    // - Starting animations or processes
    // - Initial calculations
  }
  
  // 4. Called every frame during the update phase
  onUpdate(deltaTime: number): void {
    this.frameCount++;
    
    // Perfect place for:
    // - Game logic updates
    // - Input handling
    // - State changes
    // - Movement calculations
    
    if (this.frameCount % 60 === 0) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      console.log(`4. onUpdate - Frame ${this.frameCount}, Elapsed: ${elapsed.toFixed(1)}s`);
    }
  }
  
  // 5. Called every frame after all onUpdate calls
  onLateUpdate(deltaTime: number): void {
    // Perfect place for:
    // - Camera following
    // - UI updates based on game state
    // - Final position adjustments
    // - Cleanup operations
  }
  
  // 6. Called before physics calculations
  onPhysicsUpdate(): void {
    // Perfect place for:
    // - Physics-based movement
    // - Force applications
    // - Physics state changes
  }
  
  // 7. Called before camera rendering (only if entity has Camera component)
  onBeginRender(): void {
    // Perfect place for:
    // - Pre-render setup
    // - Camera-specific calculations
    // - Render state preparation
  }
  
  // 8. Called after camera rendering (only if entity has Camera component)
  onEndRender(): void {
    // Perfect place for:
    // - Post-render cleanup
    // - Render statistics collection
    // - Debug rendering
  }
  
  // 9. Called when the script becomes disabled
  onDisable(): void {
    console.log("9. onDisable - Script disabled");
    
    // Perfect place for:
    // - Pausing operations
    // - Saving state
    // - Temporary cleanup
  }
  
  // 10. Called when the script is destroyed
  onDestroy(): void {
    console.log("10. onDestroy - Script destroyed");
    
    // Perfect place for:
    // - Final cleanup
    // - Resource disposal
    // - Event listener removal
  }
}
```

## Input Event Handling

Scripts provide comprehensive input event handling capabilities:

```ts
class InputHandlerScript extends Script {
  private isDragging: boolean = false;
  private dragStartPosition: Vector3 = new Vector3();
  
  // Pointer Events
  onPointerEnter(eventData: PointerEventData): void {
    console.log("Pointer entered entity");
    // Change material or highlight the object
  }
  
  onPointerExit(eventData: PointerEventData): void {
    console.log("Pointer exited entity");
    // Remove highlight
  }
  
  onPointerDown(eventData: PointerEventData): void {
    console.log("Pointer down on entity");
    this.isDragging = true;
    this.dragStartPosition.copyFrom(eventData.position);
    
    // Start drag operation
    // Change cursor or visual feedback
  }
  
  onPointerUp(eventData: PointerEventData): void {
    console.log("Pointer up on entity");
    this.isDragging = false;
    
    // End drag operation
    // Execute click action if not dragged
  }
  
  onPointerClick(eventData: PointerEventData): void {
    console.log("Entity clicked");
    
    // Handle click action
    // Only called if pointer down and up on same entity
  }
  
  onPointerDrag(eventData: PointerEventData): void {
    if (this.isDragging) {
      console.log("Dragging entity");
      
      // Update entity position based on drag
      const deltaX = eventData.position.x - this.dragStartPosition.x;
      const deltaY = eventData.position.y - this.dragStartPosition.y;
      
      // Apply drag movement
      this.entity.transform.translate(deltaX * 0.01, deltaY * 0.01, 0);
    }
  }
  
  onPointerDrop(eventData: PointerEventData): void {
    console.log("Object dropped on entity");
    
    // Handle drop operation
    // Process dropped data
  }
  
  // Update method to handle continuous input
  onUpdate(deltaTime: number): void {
    // Handle keyboard input through InputManager
    const inputManager = this.engine.inputManager;
    
    // Movement with WASD keys
    const moveSpeed = 5.0;
    let movement = new Vector3();
    
    if (inputManager.isKeyHeldDown("KeyW")) {
      movement.z -= moveSpeed * deltaTime;
    }
    if (inputManager.isKeyHeldDown("KeyS")) {
      movement.z += moveSpeed * deltaTime;
    }
    if (inputManager.isKeyHeldDown("KeyA")) {
      movement.x -= moveSpeed * deltaTime;
    }
    if (inputManager.isKeyHeldDown("KeyD")) {
      movement.x += moveSpeed * deltaTime;
    }
    
    if (movement.length() > 0) {
      this.entity.transform.translate(movement);
    }
    
    // Handle mouse wheel for scaling
    const wheelDelta = inputManager.wheelDelta;
    if (wheelDelta.y !== 0) {
      const scaleChange = 1 + (wheelDelta.y * 0.1);
      this.entity.transform.scale.scale(scaleChange);
    }
  }
}
```

## Physics Event Handling

Handle physics interactions and collisions:

```ts
class PhysicsScript extends Script {
  private health: number = 100;
  private isInvulnerable: boolean = false;
  
  // Trigger Events (for sensors and trigger colliders)
  onTriggerEnter(other: Collider): void {
    console.log("Entered trigger:", other.entity.name);

    // Handle different trigger types
    if (other.entity.name === "HealthPickup") {
      this.collectHealth(other.entity);
    } else if (other.entity.name === "DamageZone") {
      this.enterDamageZone();
    } else if (other.entity.name === "Checkpoint") {
      this.activateCheckpoint(other.entity);
    }
  }

  onTriggerExit(other: Collider): void {
    console.log("Exited trigger:", other.entity.name);

    if (other.entity.name === "DamageZone") {
      this.exitDamageZone();
    }
  }

  onTriggerStay(other: Collider): void {
    // Called every frame while inside trigger
    if (other.entity.name === "DamageZone" && !this.isInvulnerable) {
      this.takeDamage(10 * this.engine.time.deltaTime);
    }
  }
  
  // Collision Events (for solid colliders)
  onCollisionEnter(collision: Collision): void {
    console.log("Collision started with:", collision.other.entity.name);
    
    // Handle collision impact
    const impactForce = collision.impulse.length();
    if (impactForce > 5.0) {
      this.handleImpact(impactForce);
    }
    
    // Play collision sound
    this.playCollisionSound(collision);
  }
  
  onCollisionExit(collision: Collision): void {
    console.log("Collision ended with:", collision.other.entity.name);
  }
  
  onCollisionStay(collision: Collision): void {
    // Called every frame while colliding
    // Handle continuous collision effects
  }
  
  // Physics update for physics-based movement
  onPhysicsUpdate(): void {
    // Apply forces, modify velocities, etc.
    const rigidbody = this.entity.getComponent(DynamicCollider);
    if (rigidbody) {
      // Apply gravity modifications
      // Apply wind forces
      // Handle physics-based movement
    }
  }
  
  private collectHealth(healthPickup: Entity): void {
    this.health = Math.min(100, this.health + 25);
    console.log(`Health collected! Current health: ${this.health}`);
    
    // Destroy the pickup
    healthPickup.destroy();
    
    // Play pickup effect
    this.playPickupEffect();
  }
  
  private enterDamageZone(): void {
    console.log("Entered damage zone!");
    // Visual feedback for damage zone
  }
  
  private exitDamageZone(): void {
    console.log("Exited damage zone!");
  }
  
  private takeDamage(amount: number): void {
    if (this.isInvulnerable) return;
    
    this.health -= amount;
    console.log(`Taking damage! Health: ${this.health.toFixed(1)}`);
    
    if (this.health <= 0) {
      this.handleDeath();
    }
  }
  
  private handleImpact(force: number): void {
    console.log(`Impact force: ${force.toFixed(2)}`);
    
    // Screen shake
    // Damage based on impact
    // Visual effects
  }
  
  private activateCheckpoint(checkpoint: Entity): void {
    console.log("Checkpoint activated!");
    // Save game state
  }
  
  private playCollisionSound(collision: Collision): void {
    // Play appropriate sound based on materials
  }
  
  private playPickupEffect(): void {
    // Spawn particle effect
    // Play sound
  }
  
  private handleDeath(): void {
    console.log("Entity died!");
    // Death animation
    // Respawn logic
    // Game over handling
  }
}
```

## Script Communication and Events

Implement communication between scripts and external systems:

```ts
// Event-based communication system
class GameEventManager extends Script {
  private eventHandlers: Map<string, Function[]> = new Map();

  onAwake(): void {
    // Set up global event system
    this.setupGlobalEvents();
  }

  private setupGlobalEvents(): void {
    // Listen to engine events
    this.engine.on("gameStart", this.onGameStart.bind(this));
    this.engine.on("gameEnd", this.onGameEnd.bind(this));
    this.engine.on("levelComplete", this.onLevelComplete.bind(this));
    this.engine.on("playerDeath", this.onPlayerDeath.bind(this));
  }

  // Custom event system for script-to-script communication
  addEventListener(eventName: string, handler: Function): void {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName)!.push(handler);
  }

  removeEventListener(eventName: string, handler: Function): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  dispatchEvent(eventName: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }

    // Also dispatch to engine for external listeners
    this.engine.dispatch(eventName, ...args);
  }

  private onGameStart(): void {
    console.log("Game started!");
    this.dispatchEvent("gameStateChanged", "playing");
  }

  private onGameEnd(): void {
    console.log("Game ended!");
    this.dispatchEvent("gameStateChanged", "ended");
  }

  private onLevelComplete(levelData: any): void {
    console.log("Level completed:", levelData);
    this.dispatchEvent("scoreUpdate", levelData.score);
  }

  private onPlayerDeath(playerData: any): void {
    console.log("Player died:", playerData);
    this.dispatchEvent("gameStateChanged", "gameOver");
  }
}

// Player script that communicates with other systems
class PlayerScript extends Script {
  private eventManager: GameEventManager;
  private score: number = 0;
  private lives: number = 3;

  onAwake(): void {
    // Find the event manager
    this.eventManager = this.scene.findEntityByName("GameManager")
      ?.getComponent(GameEventManager);

    if (this.eventManager) {
      // Subscribe to relevant events
      this.eventManager.addEventListener("enemyDefeated", this.onEnemyDefeated.bind(this));
      this.eventManager.addEventListener("powerUpCollected", this.onPowerUpCollected.bind(this));
    }
  }

  onUpdate(deltaTime: number): void {
    // Handle player input and movement
    this.handleMovement(deltaTime);
    this.handleActions();
  }

  private handleMovement(deltaTime: number): void {
    const inputManager = this.engine.inputManager;
    const moveSpeed = 5.0;

    if (inputManager.isKeyHeldDown("ArrowLeft")) {
      this.entity.transform.translate(-moveSpeed * deltaTime, 0, 0);
    }
    if (inputManager.isKeyHeldDown("ArrowRight")) {
      this.entity.transform.translate(moveSpeed * deltaTime, 0, 0);
    }
  }

  private handleActions(): void {
    const inputManager = this.engine.inputManager;

    if (inputManager.isKeyDown("Space")) {
      this.shoot();
    }

    if (inputManager.isKeyDown("KeyE")) {
      this.interact();
    }
  }

  private shoot(): void {
    console.log("Player shoots!");

    // Create projectile
    const projectile = this.createProjectile();

    // Notify other systems
    this.eventManager?.dispatchEvent("playerShoot", {
      position: this.entity.transform.position.clone(),
      direction: this.entity.transform.getWorldForward()
    });
  }

  private interact(): void {
    console.log("Player interacts!");

    // Find nearby interactable objects
    const nearbyObjects = this.findNearbyInteractables();
    if (nearbyObjects.length > 0) {
      this.eventManager?.dispatchEvent("playerInteract", nearbyObjects[0]);
    }
  }

  private onEnemyDefeated(enemyData: any): void {
    this.score += enemyData.points;
    console.log(`Enemy defeated! Score: ${this.score}`);

    // Update UI
    this.eventManager?.dispatchEvent("scoreChanged", this.score);
  }

  private onPowerUpCollected(powerUpData: any): void {
    console.log("Power-up collected:", powerUpData.type);

    // Apply power-up effect
    this.applyPowerUp(powerUpData);
  }

  public takeDamage(amount: number): void {
    this.lives -= amount;
    console.log(`Player took damage! Lives remaining: ${this.lives}`);

    if (this.lives <= 0) {
      this.die();
    } else {
      this.eventManager?.dispatchEvent("playerDamaged", {
        lives: this.lives,
        damage: amount
      });
    }
  }

  private die(): void {
    console.log("Player died!");

    // Notify game systems
    this.eventManager?.dispatchEvent("playerDeath", {
      score: this.score,
      position: this.entity.transform.position.clone()
    });

    // Disable player
    this.entity.isActive = false;
  }

  private createProjectile(): Entity {
    // Implementation for creating projectile
    return new Entity(this.engine, "Projectile");
  }

  private findNearbyInteractables(): Entity[] {
    // Implementation for finding nearby interactable objects
    return [];
  }

  private applyPowerUp(powerUpData: any): void {
    // Implementation for applying power-up effects
  }
}
```

## API Reference

```apidoc
Script (extends Component):
  Properties:
    _started: boolean
      - Whether the script has completed its onStart lifecycle.
    entity: Entity
      - Reference to the entity this script is attached to.
    scene: Scene
      - Reference to the scene containing this script.
    engine: Engine
      - Reference to the engine instance.
    enabled: boolean
      - Whether the script is enabled and active.

  Lifecycle Methods:
    onAwake(): void
      - Called when the script is first enabled (only once).
    onEnable(): void
      - Called when the script becomes enabled.
    onStart(): void
      - Called before the first frame update (only once).
    onUpdate(deltaTime: number): void
      - Called every frame during the update phase.
    onLateUpdate(deltaTime: number): void
      - Called every frame after all onUpdate calls.
    onPhysicsUpdate(): void
      - Called before physics calculations.
    onBeginRender(camera: Camera): void
      - Called before camera rendering (per camera).
    onEndRender(camera: Camera): void
      - Called after camera rendering (per camera).
    onDisable(): void
      - Called when the script becomes disabled.
    onDestroy(): void
      - Called when the script is destroyed.

  Input Event Methods:
    onPointerEnter(eventData: PointerEventData): void
      - Called when pointer enters the entity.
    onPointerExit(eventData: PointerEventData): void
      - Called when pointer exits the entity.
    onPointerDown(eventData: PointerEventData): void
      - Called when pointer is pressed down on the entity.
    onPointerUp(eventData: PointerEventData): void
      - Called when pointer is released on the entity.
    onPointerClick(eventData: PointerEventData): void
      - Called when the entity is clicked.
    onPointerDrag(eventData: PointerEventData): void
      - Called when the entity is being dragged.
    onPointerDrop(eventData: PointerEventData): void
      - Called when something is dropped on the entity.

  Physics Event Methods:
    onTriggerEnter(other: ColliderShape): void
      - Called when entering a trigger collider.
    onTriggerExit(other: ColliderShape): void
      - Called when exiting a trigger collider.
    onTriggerStay(other: ColliderShape): void
      - Called every frame while inside a trigger collider.
    onCollisionEnter(collision: Collision): void
      - Called when collision starts.
    onCollisionExit(collision: Collision): void
      - Called when collision ends.
    onCollisionStay(collision: Collision): void
      - Called every frame while colliding.

ComponentsManager:
  Methods:
    addOnStartScript(script: Script): void
      - Add script to the onStart execution queue.
    removeOnStartScript(script: Script): void
      - Remove script from the onStart execution queue.
    addOnUpdateScript(script: Script): void
      - Add script to the onUpdate execution queue.
    removeOnUpdateScript(script: Script): void
      - Remove script from the onUpdate execution queue.
    addOnLateUpdateScript(script: Script): void
      - Add script to the onLateUpdate execution queue.
    removeOnLateUpdateScript(script: Script): void
      - Remove script from the onLateUpdate execution queue.
    addOnPhysicsUpdateScript(script: Script): void
      - Add script to the onPhysicsUpdate execution queue.
    removeOnPhysicsUpdateScript(script: Script): void
      - Remove script from the onPhysicsUpdate execution queue.
    callScriptOnStart(): void
      - Execute all scripts in the onStart queue.
    callScriptOnUpdate(deltaTime: number): void
      - Execute all scripts in the onUpdate queue.
    callScriptOnLateUpdate(deltaTime: number): void
      - Execute all scripts in the onLateUpdate queue.
    callScriptOnPhysicsUpdate(): void
      - Execute all scripts in the onPhysicsUpdate queue.

PointerEventData:
  Properties:
    position: Vector2
      - Screen position of the pointer event.
    deltaPosition: Vector2
      - Change in pointer position since last frame.
    button: number
      - Mouse button that triggered the event.
    clickCount: number
      - Number of consecutive clicks.
    pressure: number
      - Pressure of the pointer (for pressure-sensitive devices).

ColliderShape:
  Properties:
    entity: Entity
      - The entity this collider is attached to.
    isTrigger: boolean
      - Whether this collider is a trigger.
    material: PhysicsMaterial
      - Physics material of the collider.

Collision:
  Properties:
    other: ColliderShape
      - The other collider involved in the collision.
    contacts: ContactPoint[]
      - Array of contact points.
    impulse: Vector3
      - Collision impulse vector.
    relativeVelocity: Vector3
      - Relative velocity at collision.
```

## Best Practices

- **Lifecycle Management**: Use appropriate lifecycle methods for different types of operations
- **Performance Optimization**: Cache component references and use object pooling for frequently created objects
- **Event-Driven Architecture**: Use events for communication between scripts and systems
- **Input Handling**: Implement proper input handling with appropriate event methods
- **Physics Integration**: Use physics events for collision detection and trigger interactions
- **Resource Management**: Clean up resources in onDestroy to prevent memory leaks
- **Error Handling**: Implement proper error handling and null checks
- **Code Organization**: Keep scripts focused on single responsibilities
- **Communication Patterns**: Use event managers for complex inter-script communication
- **Performance Monitoring**: Monitor script performance and optimize expensive operations

This comprehensive Script System provides a robust foundation for implementing game logic with proper lifecycle management, event handling, and performance optimization capabilities.
