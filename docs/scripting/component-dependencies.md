# Component Dependencies System

The Component Dependencies system in Galacean Engine ensures proper component relationships and prevents runtime errors by automatically managing component dependencies. This system uses decorators to declare dependencies and provides automatic validation and resolution.

## Overview

The dependencies system provides:
- **Automatic dependency checking** when adding components
- **Dependency resolution** with configurable modes
- **Removal validation** to prevent breaking dependencies
- **Inheritance support** for component hierarchies

## Core Concepts

### @dependentComponents Decorator

The `@dependentComponents` decorator declares that a component requires other components to function properly:

```typescript
import { dependentComponents, DependentMode, Transform, Camera } from "@galacean/engine";

// Single dependency
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Renderer extends Component {
  // This component requires Transform to exist
}

// Multiple dependencies
@dependentComponents([Transform, Camera], DependentMode.AutoAdd)
export class CameraController extends Component {
  // This component requires both Transform and Camera
}
```

### Dependency Modes

The system supports two dependency resolution modes:

#### DependentMode.CheckOnly
Validates dependencies exist but doesn't automatically add them:

```typescript
@dependentComponents(Transform, DependentMode.CheckOnly)
export class MeshRenderer extends Component {}

// Usage
const entity = scene.createRootEntity();
entity.addComponent(MeshRenderer); // ❌ Throws error: "Should add Transform before adding MeshRenderer"

// Correct usage
entity.addComponent(Transform);     // ✅ Add dependency first
entity.addComponent(MeshRenderer);  // ✅ Now succeeds
```

#### DependentMode.AutoAdd
Automatically adds missing dependencies:

```typescript
@dependentComponents(Transform, DependentMode.AutoAdd)
export class AutoComponent extends Component {}

// Usage
const entity = scene.createRootEntity();
entity.addComponent(AutoComponent); // ✅ Automatically adds Transform first
console.log(entity.getComponent(Transform)); // ✅ Transform was auto-added
```

## Built-in Component Dependencies

Many core components have predefined dependencies:

### Rendering Components
```typescript
// All renderers require Transform
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Renderer extends Component {}

@dependentComponents(Transform, DependentMode.CheckOnly)
export class MeshRenderer extends Renderer {}

@dependentComponents(Transform, DependentMode.CheckOnly)
export class SpriteRenderer extends Renderer {}
```

### Camera System
```typescript
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Camera extends Component {}
```

### Physics Components
```typescript
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Collider extends Component {}

@dependentComponents(DynamicCollider, DependentMode.AutoAdd)
export class Joint extends Component {}
```

### UI Components
```typescript
@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UICanvas extends Component {}
```

## Custom Component Dependencies

### Creating Dependent Components

```typescript
import { Component, dependentComponents, DependentMode } from "@galacean/engine";

// Example: Audio component that requires Transform for 3D positioning
@dependentComponents(Transform, DependentMode.CheckOnly)
export class AudioSource extends Component {
  private audioContext: AudioContext;
  private gainNode: GainNode;
  
  onAwake(): void {
    // Can safely access transform because dependency is guaranteed
    const position = this.entity.transform.worldPosition;
    this.updateAudioPosition(position);
  }
}

// Example: AI component with multiple dependencies
@dependentComponents([Transform, MeshRenderer], DependentMode.AutoAdd)
export class AIAgent extends Component {
  onAwake(): void {
    // Both Transform and MeshRenderer are guaranteed to exist
    const renderer = this.entity.getComponent(MeshRenderer);
    const transform = this.entity.transform;
  }
}
```

### Complex Dependency Chains

```typescript
// Base component with its own dependencies
@dependentComponents(Transform, DependentMode.CheckOnly)
export class MovementComponent extends Component {}

// Derived component inherits parent dependencies
@dependentComponents(Camera, DependentMode.AutoAdd)
export class CameraMovement extends MovementComponent {
  // Inherits Transform dependency from MovementComponent
  // Adds Camera dependency
}

// Usage
const entity = scene.createRootEntity();
entity.addComponent(Transform);      // Required by MovementComponent
entity.addComponent(CameraMovement); // Auto-adds Camera, inherits Transform requirement
```

## Dependency Validation

### Add-time Validation

The system validates dependencies when components are added:

```typescript
@dependentComponents(MeshRenderer, DependentMode.CheckOnly)
export class MaterialController extends Component {}

const entity = scene.createRootEntity();

try {
  entity.addComponent(MaterialController);
} catch (error) {
  console.error(error); // "Should add MeshRenderer before adding MaterialController"
}

// Correct approach
entity.addComponent(Transform);        // MeshRenderer dependency
entity.addComponent(MeshRenderer);     // MaterialController dependency  
entity.addComponent(MaterialController); // ✅ All dependencies satisfied
```

### Remove-time Validation

The system prevents removing components that other components depend on:

```typescript
const entity = scene.createRootEntity();
const transform = entity.addComponent(Transform);
const renderer = entity.addComponent(MeshRenderer);

try {
  transform.destroy(); // ❌ Throws error: "Should remove MeshRenderer before remove Transform"
} catch (error) {
  console.error(error);
}

// Correct removal order
renderer.destroy();  // Remove dependent component first
transform.destroy(); // ✅ Now safe to remove
```

## Advanced Usage Patterns

### Conditional Dependencies

```typescript
@dependentComponents(Transform, DependentMode.CheckOnly)
export class ConditionalComponent extends Component {
  private requiresRenderer: boolean = false;
  
  onAwake(): void {
    if (this.requiresRenderer) {
      // Manually check for additional dependencies
      const renderer = this.entity.getComponent(MeshRenderer);
      if (!renderer) {
        throw new Error("MeshRenderer required when requiresRenderer is true");
      }
    }
  }
}
```

### Dynamic Dependency Management

```typescript
export class DynamicSystem extends Component {
  private currentMode: string = "basic";
  
  switchMode(mode: string): void {
    switch (mode) {
      case "physics":
        this.ensureComponent(Collider);
        break;
      case "audio":
        this.ensureComponent(AudioSource);
        break;
      case "rendering":
        this.ensureComponent(MeshRenderer);
        break;
    }
    this.currentMode = mode;
  }
  
  private ensureComponent<T extends Component>(
    componentType: new (entity: Entity) => T
  ): T {
    let component = this.entity.getComponent(componentType);
    if (!component) {
      component = this.entity.addComponent(componentType);
    }
    return component;
  }
}
```

### Dependency Groups

```typescript
// Create logical dependency groups
const RenderingDependencies = [Transform, MeshRenderer, Material];
const PhysicsDependencies = [Transform, Collider];
const UIDependencies = [UITransform, UIRenderer];

@dependentComponents(RenderingDependencies, DependentMode.AutoAdd)
export class AdvancedRenderer extends Component {}

@dependentComponents(PhysicsDependencies, DependentMode.CheckOnly)
export class PhysicsController extends Component {}
```

## Best Practices

### Choosing Dependency Modes
- **Use CheckOnly** for core architectural dependencies (e.g., Transform for renderers)
- **Use AutoAdd** for convenience components or when dependencies are always needed
- **Consider user experience** - AutoAdd reduces boilerplate but may hide component relationships

### Dependency Design
- **Keep dependencies minimal** - only declare truly required components
- **Use inheritance wisely** - derived components inherit parent dependencies
- **Document dependencies** - make component relationships clear to users

### Error Handling
```typescript
export class SafeComponent extends Component {
  onAwake(): void {
    try {
      // Attempt to use dependent component
      const renderer = this.entity.getComponent(MeshRenderer);
      if (renderer) {
        this.setupRendering(renderer);
      }
    } catch (error) {
      console.warn("Optional dependency not available:", error);
    }
  }
}
```

### Testing Dependencies
```typescript
describe("Component Dependencies", () => {
  it("should enforce Transform dependency", () => {
    const entity = scene.createRootEntity();
    
    expect(() => {
      entity.addComponent(MeshRenderer);
    }).toThrow("Should add Transform before adding MeshRenderer");
  });
  
  it("should auto-add dependencies when configured", () => {
    const entity = scene.createRootEntity();
    entity.addComponent(AutoDependentComponent);
    
    expect(entity.getComponent(Transform)).toBeTruthy();
  });
});
```

The Component Dependencies system ensures robust component relationships while providing flexibility in how dependencies are resolved, leading to more reliable and maintainable component architectures.
