---
order: 3
title: Collider Component
type: Physics
label: Physics
---

The biggest advantage of introducing a physics engine is to give physical responses to objects in the scene. Colliders belong to components in the engine. Before using them, we need to understand the types of colliders:

1. [StaticCollider](/apis/core/#StaticCollider): Static collider, mainly used for stationary objects in the scene;
2. [DynamicCollider](/apis/core/#DynamicCollider): Dynamic collider, used for objects in the scene that need to be controlled by scripts or respond to physical feedback.

## Editor Usage

### Adding Collider Component

The first thing to consider is whether the collider is static or dynamic, then add the corresponding collider component, StaticCollider for static colliders or DynamicCollider for dynamic ones.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*-E4USbdiH6sAAAAAAAAAAAAADsJ_AQ/original)

### Selecting Collider Shape

In fact, each `Collider` is a collection of [ColliderShape](/apis/core/#ColliderShape), meaning each `Collider` can set a composite collider shape by combining `ColliderShape`.

Currently, four `ColliderShape` types are supported, but the level of support varies depending on the backend physics package, as follows:

| Name | Description | Supported Backend Physics Packages |
| :--- |:---------|:----------------------------|
| [BoxColliderShape](/apis/core/#BoxColliderShape) | Box-shaped collider | physics-lite, physics-physx |
| [SphereColliderShape](/apis/core/#SphereColliderShape) | Sphere-shaped collider | physics-lite, physics-physx |
| [PlaneColliderShape](/apis/core/#PlaneColliderShape) | Infinite plane collider | physics-physx |
| [CapsuleColliderShape](/apis/core/#CapsuleColliderShape) | Capsule-shaped collider | physics-physx |

The engine supports composite collider shapes, meaning a collider can be composed of BoxColliderShape, SphereColliderShape, and CapsuleColliderShape.

It is important to note the relationship between `Collider` and `ColliderShape`. The pose of each `Collider` is consistent with the `Entity` it is attached to, and they are synchronized every frame. The `position` property on `ColliderShape` can be used to set an offset **relative to** the `Collider`.

![table](https://mdn.alipayobjects.com/huamei_vvspai/afts/img/A*erlGRKk7dNMAAAAAAAAAAAAADsqFAQ/original)

When adding a collider component, the collider shape is not added by default, so you need to click on Add Item to add it, and you will see the collider's auxiliary rendering in the viewport after adding it.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*OUr-SIejEkoAAAAAAAAAAAAADsJ_AQ/original)

For each collider shape, you can design corresponding size properties. For example:

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*d4MCRbuHeMsAAAAAAAAAAAAADsJ_AQ/original" alt="alt text" style="zoom:67%;" />

However, regardless of the collider shape, you can set the Local Position, which is the local offset relative to the Entity coordinates.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*p8UcRJ9Q0EIAAAAAAAAAAAAADsJ_AQ/original)

### Dynamic Collider Settings
Unlike static colliders, dynamic colliders are affected by physical laws, so there are many additional physical properties to set. 


<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*7rzqSKtjULMAAAAAAAAAAAAADsJ_AQ/original" alt="alt text" style="zoom:67%;" />

After modifying these parameters, the viewport will not change because the dynamic collider is affected by gravity by default, so observation can only be done in Play mode.

### Note
- The collision area should be kept as simple as possible to improve the performance of the physics engine detection.
- The reference coordinate system of the collider is the coordinate system of the dependent Entity.
- PlaneColliderShape represents a full plane, so there is no display of auxiliary lines, generally used as a floor.

## Script Usage

There are two types of physical responses:

1. Trigger mode: Objects do not have a rigid body shape, but specific script functions can be triggered when contact occurs.
2. Collider mode: Physics have a rigid body shape, and when contact occurs, not only can script functions be triggered, but the original motion can also be changed according to physical laws.

For these two types, corresponding functions are provided in the script, and the collider component also provides a series of functions to set its own state, such as velocity, mass, and so on.

### Trigger Script Functions

For trigger mode, first, add a `Collider` to the `Entity` in the scene; when these components come into contact, three functions in the script component will be automatically triggered:

1. [onTriggerEnter](/en/docs/script#component-lifecycle-functions#ontriggerenter): Called when they come into contact.
2. [onTriggerStay](/en/docs/script#component-lifecycle-functions#ontriggerstay): Called *repeatedly* during contact.
3. [onTriggerExit](/en/docs/script#component-lifecycle-functions#ontriggerexit): Called when the contact ends.

You can enable trigger mode by setting `isTrigger` on the `ColliderShape`, but it is important to note that **trigger events are not called between two StaticColliders unless one of them is a `DynamicCollider`**.

<playground src="physx-collision-detection.ts"></playground>

### Collider Script Functions

For collider mode, when `DynamicCollider` interact with each other, three collision-related script functions will be triggered:
1. [onCollisionEnter](/en/docs/script#component-lifecycle-functions#oncollisionenter): Called when a collision occurs.
2. [onCollisionStay](/en/docs/script#component-lifecycle-functions#oncollisionstay): Called *repeatedly* during the collision process.
3. [onCollisionExit](/en/docs/script#component-lifecycle-functions#oncollisionexit): Called when the collision ends.

<playground src="physx-compound.ts"></playground>

