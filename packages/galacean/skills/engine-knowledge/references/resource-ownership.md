# Resource Ownership

Use this reference when deciding whether an object should be shared, cloned, garbage-collected, or explicitly destroyed.

## Reference-counted resources

- Engine resources derived from `ReferResource` participate in reference counting. Assigning them to owning Engine objects changes their retained lifetime through those owners.
- Ordinary destruction succeeds only when the resource is no longer referenced. Forced destruction overrides that protection and can invalidate consumers.
- Resource-manager garbage collection considers unreferenced resources and skips resources marked to ignore ordinary GC. Engine teardown may still force their destruction.
- Presence in the ResourceManager cache provides identity reuse but does not itself increment a `ReferResource` reference count. Cache identity and lifetime retention are separate concerns.
- A resource can retain other resources. GC must respect those relationships, so a zero direct count alone is not always sufficient to destroy it.

## Clone and instance choices

- Cloning an Entity hierarchy does not imply deep-copying every Engine resource. Reference resources are generally shared unless a component or resource explicitly defines a different clone contract.
- Shared materials are appropriate when all renderers should observe the same state. Mutating one shared material changes every consumer of that instance.
- An instance material is a renderer-owned clone created from an assigned material. It isolates later material mutation for that renderer and also adds a resource with its own lifetime.
- Loading a reusable template and instantiating it are separate ownership decisions. Do not mutate a cached template hierarchy when independent runtime instances are required.

## Decision rule

Share immutable or intentionally synchronized resources. Clone only at the boundary where independent mutation is required, and destroy only from the owner that can prove no live consumer remains.
