# Clone System

Galacean supports cloning entities (and their components) at runtime. The cloning pipeline is driven by `Entity.clone()` together with a set of property decorators that determine how component fields are copied. This document explains the default behavior and how to customize it for your own components.

## Entity cloning
Calling `entity.clone()` creates a new `Entity` that:
- Copies the original entity’s name, layer, active state, and transform hierarchy.
- Instantiates the same component types in the same order.
- Recursively clones all child entities.

```ts
const entity = scene.createRootEntity("Hero");
const meshRenderer = entity.addComponent(MeshRenderer);
meshRenderer.mesh = heroMesh;

const clone = entity.clone();
clone.name = "Hero_Clone";
scene.addRootEntity(clone);

// Mesh references are shared; transforms are independent
console.log(clone.getComponent(MeshRenderer).mesh === meshRenderer.mesh); // true
console.log(clone.transform.worldPosition.equals(entity.transform.worldPosition)); // true
```

The transform on the clone is independent (`Transform` implements a deep clone), but resources such as materials or meshes remain shared unless you explicitly deep-clone them.

## Clone decorators
Component fields default to *assignment* cloning (values are copied for primitives; object references are shared). Apply clone decorators to override that behavior on a per-property basis:

| Decorator | Description |
| --- | --- |
| `@ignoreClone` | Skip this property entirely. Commonly used for cached handles or transient state. |
| `@assignmentClone` | Explicitly keep the default assignment behavior. Useful for documentation. |
| `@shallowClone` | Clone the container (object/array/typed array) but keep references to its elements. |
| `@deepClone` | Recursively deep clone the value. Array elements and object fields are copied according to their own decorators. |

```ts
import { Script, ignoreClone, shallowClone, deepClone } from "@galacean/engine";

class Inventory extends Script {
  @ignoreClone
  tempHUDState: object | null = null;

  @shallowClone
  items: string[] = ["potion", "sword"];

  @deepClone
  loadouts: { name: string; stats: number[] }[] = [];
}

const entity = scene.createRootEntity("Player");
const inv = entity.addComponent(Inventory);
inv.items[0] = "elixir";
inv.loadouts.push({ name: "mage", stats: [10, 20] });

const clone = entity.clone().getComponent(Inventory);
clone.items[0] = "bomb";          // Mutates both arrays (shallow clone)
clone.loadouts[0].stats[0] = 99;   // Only affects the clone (deep clone)
```

## Custom cloning hooks
For advanced scenarios you can implement the optional methods defined in `ICustomClone` / `IComponentCustomClone`:

- Implement `copyFrom(source)` on your class to copy data into an existing instance when the clone system encounters it.
- Implement `_cloneTo(target)` on your component or class to run additional logic after the default property cloning finishes. Component implementations receive the source and target root entities so you can remap entity references.

```ts
class Weapon implements ICustomClone {
  constructor(public id: number, public owner?: Entity) {}

  copyFrom(source: Weapon): void {
    this.id = source.id;
    this.owner = source.owner; // intentionally shared
  }
}

class WeaponHolder extends Script implements IComponentCustomClone {
  weapon: Weapon | null = null;

  _cloneTo(target: WeaponHolder, srcRoot: Entity, targetRoot: Entity): void {
    if (this.weapon?.owner) {
      // Map the owner entity from the source hierarchy to the clone hierarchy.
      const path: number[] = [];
      if (Entity._getEntityHierarchyPath(srcRoot, this.weapon.owner, path)) {
        target.weapon = new Weapon(this.weapon.id);
        target.weapon.owner = Entity._getEntityByHierarchyPath(targetRoot, path);
      }
    }
  }
}
```

Most built-in components already supply appropriate decorators and `_cloneTo` hooks. For example, renderers mark GPU handles with `@ignoreClone` so live WebGL resources are not duplicated.

## CloneManager (internal)
`CloneManager` drives decorator registration (`ignoreClone`, `assignmentClone`, `shallowClone`, `deepClone`) and performs property copies via `cloneProperty`. You typically do not call it directly—decorators automatically register the metadata, and `ComponentCloner.cloneComponent` uses that metadata whenever an entity is cloned.

## Best practices
- **Decorate fields**: Mark transient or runtime-only fields with `@ignoreClone` to avoid copying state that should be reinitialized.
- **Watch nested data**: Use `@deepClone` on arrays/objects that should not share references with the original; otherwise they will point to the same data.
- **Reuse heavy resources**: Leave meshes, materials, and textures as assignment clones so clones share GPU assets.
- **Remap entity references**: Implement `_cloneTo` on components that store references to other entities to ensure those references point to the cloned hierarchy.
- **Test clones**: After introducing new clone rules, clone the entity in a unit test or editor script to confirm fields behave as expected.

For more examples, see `docs/en/core/clone.mdx` in the repository.
