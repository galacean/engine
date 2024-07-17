---
order: 5
title: Basic Physics Constraint Components
type: Physics
label: Physics
---

Physics constraint components are essential components in physics that allow better control of the movement of dynamic collider components, adding interesting interactive responses to scenes. This article mainly introduces the three most basic physics constraint components:

1. Fixed Constraint Component

   ![fixedJoint](https://gameworksdocs.nvidia.com/PhysX/4.1/documentation/physxguide/_images/fixedJoint.png)
2. Spring Constraint Component

   ![springJoint](https://gameworksdocs.nvidia.com/PhysX/4.1/documentation/physxguide/_images/distanceJoint.png)
3. Hinge Constraint Component

   ![hingeJoint](https://gameworksdocs.nvidia.com/PhysX/4.1/documentation/physxguide/_images/revoluteJoint.png)

All physics constraints have two target objects: one represents the dynamic collider affected by the physics constraint (the physics constraint component is attached to this node), and the other is the position where the constraint is attached or another dynamic collider (set through component configuration).
Therefore, the usage of these components is similar. Taking the fixed constraint component `FixedJoint` as an example:

```typescript
const fixedJoint = currentEntity.addComponent(FixedJoint);
fixedJoint.connectedCollider = prevCollider;
```

## Local Coordinates and World Coordinates

Understanding the usage of physics constraint components, one key point is to understand **local coordinates** and **world coordinates**. All physics constraints can configure the `connectedCollider` property.
In addition, some physics constraint components can also set the position where the physics constraint is attached by configuring the `connectedAnchor` property.

**It is important to note that when `connectedCollider` is set, `connectedAnchor` represents the local coordinates relative to that collider. When `connectedCollider` is null, `connectedAnchor` represents world coordinates.**

## Hinge Constraint

Among the three physics constraints mentioned above, the hinge constraint is relatively more complex because, in addition to configuring `connectedCollider` and `connectedAnchor`, you also need to specify the rotation axis direction and rotation radius of the hinge. This can be done by setting the `axis` (default direction is towards the positive x-axis) and `swingOffset` properties.
The `swingOffset` is also a vector that can be understood as an offset starting from the rotation center determined by `connectedAnchor` and `connectedCollider`, where the dynamic collider rotates around the rotation axis.

The usage of the above physics constraint components can be referenced in:
<playground src="physx-joint-basic.ts"></playground>
