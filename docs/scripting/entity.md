# Entity

Galacean's `Entity` class is the fundamental container that binds components, scripts, and child entities together inside a scene graph. Every entity owns a `Transform` component, tracks its active state across hierarchy/scene boundaries, and coordinates component lifecycles when it is reparented, cloned, or destroyed.

## Create Entities

```ts
import { WebGLEngine, Entity, Camera } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;

const root = scene.createRootEntity("Root");
const hero = new Entity(engine, "Hero");
root.addChild(hero);

// Method 3: Create child entity (recommended)
const weapon = hero.createChild("Weapon");

// Method 4: Create entity and add components
const cameraEntity = root.createChild("Camera");
const camera = cameraEntity.addComponent(Camera);

// Method 5: Add existing entity to scene as root
const detachedEntity = new Entity(engine, "Detached");
scene.addRootEntity(detachedEntity);
```

- `scene.createRootEntity()` creates and automatically adds entity to scene
- `new Entity()` creates detached entity that needs manual parenting
- `createChild()` is the recommended way to create child entities
- `addComponent()` is the correct way to attach components
- Each entity automatically gets a `Transform` component
- When you call `createChild`, the parent’s transform type is reused so the new entity always has a compatible `Transform` implementation.

## Hierarchy Operations

```ts
// Add the same child to a different parent (cross-scene safe)
const enemy = new Entity(engine, "Enemy");
root.addChild(enemy);

const bossRoom = scene.createRootEntity("BossRoom");
bossRoom.addChild(enemy); // handles deactivation/reactivation across scenes

// Indexed insert
bossRoom.addChild(0, enemy);

// Remove without destroying
bossRoom.removeChild(enemy);

// Clear but keep entities alive (they become scene-less)
bossRoom.clearChildren();
```

- `addChild` automatically detaches the target from any previous parent (including root scenes), updates sibling indices, and propagates active state transitions.
- `removeChild` simply sets `child.parent = null`. Destroy the entity explicitly if you no longer need it.
- `clearChildren` walks children from last to first, deactivates them, and removes their scene reference. Use it before pooling or manual cleanup.

## Search Utilities

```ts
// Find by name (recursive search)
const weapon = hero.findByName("Weapon");

// Find by path (slash-delimited)
const hand = hero.findByPath("Arm/Hand");

// Scene-level search (more efficient for deep hierarchies)
const boss = scene.findEntityByPath("parent/child/grandson");

// Access children
const firstChild = hero.getChild(0);
const allChildren = hero.children; // ReadonlyArray<Entity>

// Find components in subtree
const renderers: MeshRenderer[] = [];
hero.getComponentsIncludeChildren(MeshRenderer, renderers);
```

- `findByName` performs depth-first search starting with current entity
- `findByPath` supports slash-delimited traversal with backtracking
- `scene.findEntityByPath` is more efficient for deep scene searches
- `children` property provides readonly access to child entities
- `getChild(index)` provides direct indexed access
- `getComponentsIncludeChildren` recursively collects components across subtree

## Lifecycle & Activation

```ts
hero.isActive = false;               // disables hierarchy + scene participation
hero.isActive = true;                // reactivates using parent/scene state

if (!hero.isActiveInHierarchy) {
  // entity or one of its ancestors is inactive
}

bossRoom.isActive = false;           // cascades to children via ActiveChangeFlag
```

- `isActive` toggles local activation; Galacean automatically propagates hierarchy
to components using `ActiveChangeFlag` masks.
- `isActiveInHierarchy` reflects whether all ancestors are active; `isActiveInScene` (internal) tracks scene-level activation.
- Reactivation across scenes triggers a deactivate/activate cycle so render and physics state stay consistent.

> **Warning:** `removeChild` or setting `parent = null` does **not** destroy components. Call `entity.destroy()` when you need to fully release resources.

## Transform Helpers

Each entity owns exactly one `Transform`. Adding another `Transform` replaces the previous instance and silently destroys the old copy.

```ts
const transform = hero.transform;
transform.setPosition(0, 0, 0);
transform.rotate(new Vector3(0, 45, 0));

const flag = hero.registerWorldChangeFlag();
engine.on("update", () => {
  if (flag.flag) {
    flag.flag = false;
    console.log("Hero moved", hero.transform.worldMatrix);
  }
});
```

- `registerWorldChangeFlag` returns a `BoolUpdateFlag` that flips when the world matrix changes, ideal for reactive systems or caching logic.
- Use `Transform` APIs for all spatial updates (`setPosition`, `translate`, `rotate`, `lookAt`, etc.).

## Component Access

```ts
import { DirectLight, Camera, Script, MeshRenderer } from "@galacean/engine";

// Add components
const light = hero.addComponent(DirectLight);
light.color.set(1, 1, 1);
light.intensity = 1.0;

// Get single component
const camera = hero.getComponent(Camera);
if (camera) {
  camera.fieldOfView = 60;
}

// Get all components of a type
const scripts: Script[] = [];
hero.getComponents(Script, scripts);

// Get components from entity and children
const renderers: MeshRenderer[] = [];
hero.getComponentsIncludeChildren(MeshRenderer, renderers);

// Access entity from component
const entityFromComponent = light.entity; // Returns hero
```

- `addComponent` creates, attaches, and activates component if entity is active
- `getComponent` returns first component of specified type or null
- `getComponents` populates provided array with all matching components
- `getComponentsIncludeChildren` searches entity and all descendants
- Components have `entity` property to access their parent entity
- Component `enabled` property controls activation state independently

## Cloning & Templates

```ts
const clone = hero.clone();
clone.name = "HeroClone";
scene.addRootEntity(clone);
```

- `clone()` deep-copies components, scripts, and child entities, preserving active states, layers, and template resource references (`ReferResource`).
- Template entities registered via `_markAsTemplate` keep refer-counted resources aligned across clones.

## API Reference

```apidoc
Entity:
  Properties:
    name: string
      - Arbitrary identifier used by `findByName` and editors.
    layer: Layer
      - Rendering layer mask shared with children created via `createChild`.
    parent: Entity | null
      - Getter/setter for hierarchy linkage. Setter revalidates scene membership.
    children: ReadonlyArray<Entity>
      - Ordered list of direct children.
    siblingIndex: number
      - Controls draw/update order among siblings. Throws if entity is detached.
    scene: Scene | null
      - Owning scene or null when detached.
    isActive: boolean
      - Local activation flag; propagates via `_processActive`/`_processInActive`.
    isActiveInHierarchy: boolean
      - Readonly view of effective activation considering ancestors.

  Methods:
    constructor(engine: Engine, name?: string): Entity
      - Creates a detached entity with automatic Transform component.
    addComponent<T>(type: new() => T, ...args: any[]): T
      - Instantiates, attaches, and activates a component.
    getComponent<T>(type: new() => T): T | null
      - Returns first component of specified type or null.
    getComponents<T>(type: new() => T, results: T[]): void
      - Populates provided array with all components of specified type.
    getComponentsIncludeChildren<T>(type: new() => T, results: T[]): void
      - Recursively collects components from entity and all descendants.
    addChild(child: Entity): void
    addChild(index: number, child: Entity): void
      - Reparents child entity and updates hierarchy.
    removeChild(child: Entity): void
      - Detaches child without destroying it.
    createChild(name?: string): Entity
      - Creates and parents a new child entity.
    clearChildren(): void
      - Removes all children, deactivating them.
    clone(): Entity
      - Deep clones entity with all components and children.
    findByName(name: string): Entity | null
      - Depth-first recursive search by name.
    findByPath(path: string): Entity | null
      - Slash-delimited hierarchical search.
    getChild(index: number): Entity | undefined
      - Direct indexed access to child entity.
    destroy(): void
      - Destroys entity and all its components and children.
```

## Best Practices

- Keep entity trees shallow when possible; frequent `findByName` on deep hierarchies is recursive.
- Reuse entities via `clearChildren` and manual pooling to avoid GC churn from repeated construction.
- When moving entities between scenes, always rely on `addChild`/`parent` assignments instead of directly manipulating internal arrays; Galacean handles activation, layer sync, and scene reassignment for you.
