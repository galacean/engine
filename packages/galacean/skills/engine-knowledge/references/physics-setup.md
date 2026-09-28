# Physics and Collision Semantics

Use this reference when choosing who owns motion, when synchronization occurs, or how long collision data remains valid.

## Simulation ownership

- Physics is opt-in through Engine configuration. Without a provider, physics components and physics-backed picking do not have a simulation owner.
- A non-kinematic dynamic body is simulation-owned. Drive continuous motion through velocity, forces, and torque rather than competing transform writes.
- A direct Transform change is synchronized to the native collider at a physics step as a teleport. It is not swept through the path between the old and new pose.
- A kinematic dynamic body is application-owned. Use its supported path-motion operation when interactions along the movement path matter; a direct Transform assignment still has teleport semantics.
- After simulation, the native pose of an active non-kinematic body is written back to its Transform.

## Fixed-step order

Within a physics step, active Scripts receive `onPhysicsUpdate`, pending Transform poses are synchronized to native colliders, the provider simulates, dynamic poses are read back, and collision or trigger events are dispatched.

This ordering means a pose or force chosen in `onPhysicsUpdate` affects the upcoming step. Rendered-frame callbacks must not assume exactly one simulation step has occurred.

## Shapes and events

- A collider needs at least one shape to participate in contacts or queries.
- 3D Script pointer targeting is physics-backed: the pointer ray is tested against eligible collider shapes before callbacks are dispatched to the hit Entity. A visible mesh alone is not a pointer target. The active Camera, culling mask, collision layer, shape raycast flag, and physics provider all participate in that selection.
- Trigger callbacks receive the other `ColliderShape`. Collision callbacks receive a `Collision` whose `shape` identifies the peer shape.
- `Collision` and its native contact data are temporary callback data. Copy positions, normals, impulses, or other values that must outlive the callback.
- Collision layers, trigger mode, collider type, and provider capability all affect whether a pair produces contacts. Resolve the exact current API from the installed declarations instead of copying a provider-specific setup.

## Decision rule

Choose one motion owner per body: simulation for non-kinematic dynamics, application path motion for kinematics, or Transform teleportation for explicit repositioning. Mixing owners produces discontinuities and missed path behavior.
