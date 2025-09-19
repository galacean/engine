# Joint System

Galacean joints provide high-level constraints that keep two colliders in a particular spatial relationship. Every joint component lives on the "primary" entity, automatically adds a `DynamicCollider` to it, and connects that body to another collider (or to world space). Joints require a physics backend (such as `@galacean/engine-physics-physx`) because they are solved by the native physics layer.

## Quick Start

```ts
import {
  BoxColliderShape,
  DynamicCollider,
  FixedJoint,
  HingeJoint,
  JointLimits,
  JointMotor,
  SpringJoint,
  WebGLEngine
} from '@galacean/engine';
import { PhysXPhysics } from '@galacean/engine-physics-physx';

const engine = await WebGLEngine.create({
  canvas,
  physics: new PhysXPhysics()
});

// Primary body (the host entity automatically receives a DynamicCollider)
const base = engine.sceneManager.activeScene.createRootEntity('Base');
const baseCollider = base.addComponent(DynamicCollider);
baseCollider.addShape(new BoxColliderShape());

// Connected body
const target = engine.sceneManager.activeScene.createRootEntity('Target');
const targetCollider = target.addComponent(DynamicCollider);
targetCollider.addShape(new BoxColliderShape());

// FixedJoint keeps both rigid bodies welded together
const fixedJoint = base.addComponent(FixedJoint);
fixedJoint.connectedCollider = targetCollider;
fixedJoint.breakForce = 2_000;
fixedJoint.breakTorque = 2_000;
```

Set `connectedCollider = null` to attach the primary body to an immovable point in world space (useful for hanging props).

## Joint Base Class

| Property | Type | Notes |
| --- | --- | --- |
| `connectedCollider` | `Collider | null` | Target collider. `null` means the anchors are interpreted in world space. |
| `anchor` | `Vector3` | Local offset on the primary body. Mutating the vector updates the joint immediately. |
| `connectedAnchor` | `Vector3` | Local offset on the connected collider or world position if `connectedCollider` is `null`. |
| `automaticConnectedAnchor` | `boolean` | When `true` (default) the engine keeps `connectedAnchor` aligned with `anchor` in world space. Set to `false` before editing `connectedAnchor` manually. |
| `massScale` / `connectedMassScale` | `number` | Multiplies the effective mass of each body during constraint solving (default `1`). |
| `inertiaScale` / `connectedInertiaScale` | `number` | Multiplies the rotational inertia contribution of each body (default `1`). |
| `breakForce` | `number` | Maximum linear force before the joint breaks. Defaults to `Infinity`. |
| `breakTorque` | `number` | Maximum angular force before the joint breaks. Defaults to `Infinity`. |

### Common configuration

```ts
const joint = base.addComponent(FixedJoint);

// Automatic anchors keep both bodies aligned initially
joint.anchor.setValue(0, 0.5, 0);
joint.automaticConnectedAnchor = true;

// Switch to manual mode when you need exact offsets
joint.automaticConnectedAnchor = false;
joint.connectedAnchor.setValue(0, -0.5, 0);

// Soften the constraint by scaling mass and inertia
joint.massScale = 0.5;
joint.connectedMassScale = 2.0;
```

## FixedJoint

`FixedJoint` exposes only the base class properties. It prevents all relative motion, effectively gluing the two colliders together. Typical uses include:

- Assembling complex rigid bodies from multiple parts
- Attaching dynamic props to a static world anchor
- Creating destructible welds via `breakForce` / `breakTorque`

## HingeJoint

`HingeJoint` behaves like a door hinge or wheel axle. Additional members:

| Property | Type | Notes |
| --- | --- | --- |
| `axis` | `Vector3` | Local axis on the primary body. The setter normalizes the vector. |
| `angle` | `number` (read-only) | Current angle in degrees relative to the initial pose. Updated each frame while enabled. |
| `velocity` | `number` (read-only) | Angular velocity in degrees per second. |
| `useLimits` | `boolean` | Enables hard or soft limits defined by `limits`. |
| `useMotor` | `boolean` | Enables the drive defined by `motor`. |
| `useSpring` | `boolean` | When `true`, limits are treated as a spring (`JointLimits.stiffness` / `damping`). |
| `motor` | `JointMotor | null` | Drive settings (lazy-updated; reuse instances when possible). |
| `limits` | `JointLimits | null` | Angle range and optional spring coefficients. |

```ts
const hinged = base.addComponent(HingeJoint);
hinged.connectedCollider = targetCollider;

hinged.axis.setValue(0, 1, 0);         // rotate around Y
hinged.useLimits = true;

const limits = new JointLimits();
limits.min = -45;
limits.max = 60;
limits.contactDistance = 2;            // degrees before the stop engages
limits.stiffness = 200;                // used only when useSpring = true
limits.damping = 20;

hinged.limits = limits;
hinged.useSpring = true;               // enables soft limits

const motor = new JointMotor();
motor.targetVelocity = 90;             // deg/s
motor.forceLimit = 800;                // torque limit
motor.gearRatio = 1;
motor.freeSpin = false;

hinged.motor = motor;
hinged.useMotor = true;
```

Call `hinged.angle`/`hinged.velocity` to read the live motion, e.g. for UI displays or control loops.

## SpringJoint

`SpringJoint` maintains a distance band between two anchor points and applies spring forces when the band is violated.

| Property | Type | Notes |
| --- | --- | --- |
| `minDistance` | `number` | Minimum allowed distance (metres). |
| `maxDistance` | `number` | Maximum allowed distance (metres). |
| `tolerance` | `number` | Additional slack before forces are applied. Default `0.25`. |
| `stiffness` | `number` | Spring constant. Larger values pull harder. |
| `damping` | `number` | Damping ratio. Larger values reduce oscillation. |

```ts
const spring = base.addComponent(SpringJoint);
spring.connectedCollider = targetCollider;

spring.minDistance = 1.0;
spring.maxDistance = 3.0;
spring.tolerance = 0.15;
spring.stiffness = 600;
spring.damping = 40;
```

Set `minDistance === maxDistance` to approximate a distance constraint.

## JointLimits

`JointLimits` is a mutable data object that notifies listeners when any property changes.

| Property | Notes |
| --- | --- |
| `min` / `max` | Angular bounds in degrees. Setters clamp each other so `min ≤ max`. |
| `contactDistance` | Optional margin (degrees). Defaults to `min(0.1, 0.49 * (max - min))` when left at `-1`. Only used when `useSpring` is `false`. |
| `stiffness` / `damping` | Spring coefficients used when `HingeJoint.useSpring` is `true`. |

```ts
const limits = new JointLimits();
limits.min = -30;
limits.max = 45;
limits.contactDistance = 1.5;
limits.stiffness = 150;
limits.damping = 10;

hinged.limits = limits;
```

## JointMotor

`JointMotor` describes the drive applied by a `HingeJoint` when `useMotor = true`.

| Property | Notes |
| --- | --- |
| `targetVelocity` | Desired angular speed in degrees per second. |
| `forceLimit` | Maximum torque applied by the drive (defaults to `Number.MAX_VALUE`). |
| `gearRatio` | Multiplies the target velocity and required torque (default `1`). |
| `freeSpin` | When `true`, the motor only accelerates; it will not actively brake. |

Motors and limits can be reused across multiple joints—each instance carries an internal `UpdateFlagManager`, so changing a property automatically pushes the new value to every joint referencing it.

## Best Practices

- Always add appropriate collider shapes to both bodies before attaching a joint; the solver needs accurate mass and inertia data.
- Keep hinge axes normalized—`HingeJoint` normalizes internally, but supplying a unit vector avoids needless allocations.
- For manual anchor editing, disable `automaticConnectedAnchor` first so the system does not overwrite your values on the next frame.
- Use `breakForce` / `breakTorque` together to simulate destructible links. When a threshold is exceeded the physics backend destroys the joint; keep track of the component if you need to respawn or play break effects.
- When connecting to the world (no `connectedCollider`), treat `connectedAnchor` as world coordinates in metres.
- Reuse `JointLimits` and `JointMotor` instances when multiple hinges share the same tuning to reduce garbage and keep configurations consistent.
