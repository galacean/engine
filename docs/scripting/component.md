# Component

Galacean follows an entity–component pattern. Entities are simple containers, while components (renderers, colliders, audio sources, scripts…) provide concrete behaviour. Most gameplay logic is implemented by extending `Script`—see `docs/llm/script-system.md` for the full scripting guide. This page focuses on managing components in general.

## Managing Components on an Entity

Components are attached to entities and retrieved by type.

```ts
import { Entity, Script, MeshRenderer, DirectLight, Color } from "@galacean/engine";

// Assume `rotatorEntity` is an existing Entity

// Add a component by its class
const rotator = rotatorEntity.addComponent(RotatorScript);

// Add built-in components with configuration
const light = rotatorEntity.addComponent(DirectLight);
light.color = new Color(1, 1, 1);
light.intensity = 1.0;

// Get a component that is already on the entity
const existingRotator = rotatorEntity.getComponent(RotatorScript);

if (rotator === existingRotator) {
  console.log("They are the same instance.");
}

// Get single component (returns null if not found)
const renderer = rotatorEntity.getComponent(MeshRenderer);
if (renderer) {
  renderer.enabled = false;
}

// Get all components of a certain type
const allScripts: Script[] = [];
rotatorEntity.getComponents(Script, allScripts);

// Get components from entity and its children
const allRenderers: MeshRenderer[] = [];
rotatorEntity.getComponentsIncludeChildren(MeshRenderer, allRenderers);

// Access entity from component
const entityFromComponent = light.entity; // Returns rotatorEntity

// To remove a component, you must destroy it
rotator.destroy();
```

> **Note:** Adding a component that already exists on an entity will not add a second one; the existing instance is returned.

## Enabling and Disabling

A component is active only when both `component.enabled` and `entity.isActiveInHierarchy` are `true`. Disabling a component pauses its behaviour without removing it:

```ts
const rotator = rotatorEntity.getComponent(RotatorScript);

rotator.enabled = false; // pauses updates
rotator.enabled = true;  // resumes updates
```

## Built-in Component Overview

- **Rendering**: `MeshRenderer`, `SkinnedMeshRenderer`, `SpriteRenderer`, `TrailRenderer`, `ParticleRenderer`
- **Lighting**: `DirectLight`, `PointLight`, `SpotLight`, `AmbientLight`
- **Physics (optional packages)**: `RigidBody`, `Collider` variants, `Joint` components
- **Audio**: `AudioListener`, `AudioSource`
- **UI & 2D**: `SpriteMask`, `TextRenderer`, `UI*` components
- **Logic**: `Script` for custom behaviour (lifecycle详情见脚本文档)

Consult each component’s dedicated documentation for configuration details.

## Removal and Cleanup

Destroying a component detaches it permanently:

```ts
const renderer = entity.getComponent(MeshRenderer);
renderer?.destroy();
```

`destroy()` triggers the component’s `onDestroy()` hook so you can release resources in custom scripts.

## Further Reading

- `docs/llm/script-system.md` – 编写脚本、生命周期、事件回调
- `docs/llm/renderer.md` – 渲染组件详解
- `docs/llm/physics-scene.md` / `docs/llm/collider.md` – 物理组件



## API Reference

```apidoc
Entity Component Management:
  Methods:
    addComponent<T>(type: new() => T): T
      - Creates and attaches a component of the specified type to the entity.
      - Returns the component instance.
    getComponent<T>(type: new() => T): T | null
      - Returns the first component of the specified type or null if not found.
    getComponents<T>(type: new() => T, results: T[]): void
      - Populates the provided array with all components of the specified type.
    getComponentsIncludeChildren<T>(type: new() => T, results: T[]): void
      - Recursively finds components in entity and all its children.

Component:
  Properties:
    enabled: boolean
      - Controls component activation. When false, lifecycle methods are not called.
    entity: Entity
      - Reference to the entity this component is attached to. (Read-only)
    scene: Scene
      - Reference to the scene containing this component's entity. (Read-only)

  Methods:
    destroy(): void
      - Destroys the component and removes it from its entity.
      - Triggers onDestroy() lifecycle method before removal.

Script (extends Component):
  Lifecycle Methods:
    onAwake(): void
      - Called once when script is first initialized. Use for setup.
    onEnable(): void
      - Called when script becomes active (enabled=true and entity active).
    onStart(): void
      - Called before first onUpdate, after all onAwake calls complete.
    onUpdate(deltaTime: number): void
      - Called every frame. Use for game logic updates.
    onLateUpdate(deltaTime: number): void
      - Called after all onUpdate calls. Use for camera following, etc.
    onDisable(): void
      - Called when script becomes inactive (enabled=false or entity inactive).
    onDestroy(): void
      - Called once before component destruction. Use for cleanup.
```
