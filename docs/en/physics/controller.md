---
order: 4
title: Character Controller Component
type: Physics
label: Physics
---

The character controller is a very important functional component provided by the physics engine. It allows for easily adding physical behaviors to the motion of animated characters. For example, parameters can be set to prevent a character from climbing steep slopes or to avoid collisions with other colliders during the character's movement. In fact, the character controller is just an advanced encapsulation of colliders, implementing various advanced character control behaviors through collision detection.

Similar to collider components, the creation and usage of character controller components are very similar to collider components.
```typescript
const physicsCapsule = new CapsuleColliderShape();
physicsCapsule.radius = radius;
physicsCapsule.height = height;
const characterController = capsuleEntity.addComponent(CharacterController);
characterController.addShape(physicsCapsule);
```
Like collider components, a `ColliderShape` is constructed and added to the component to give the character controller a specific shape. However, two points need to be emphasized here:
1. Character controllers do not support compound shapes, so only one `ColliderShape` can be added.
2. Currently, character controllers only support `CapsuleColliderShape` and `BoxColliderShape`, with `CapsuleColliderShape` being the most commonly used.

The behavior of the character controller can be controlled through the parameters and methods of `CharacterController`, with the most important one being the `move` function:
```typescript
class Controller extends Script {
    onPhysicsUpdate() {
        const fixedTimeStep = this.engine.physicsManager.fixedTimeStep;
        const character = this._character;
        const flag = character.move(this._displacement, 0.1, fixedTimeStep);
        if (flag | ControllerCollisionFlag.Down) {
            character.move(new Vector3(0, -0.2, 0), 0.1, fixedTimeStep);
        }
        this._displacement.setValue(0, 0, 0);
    }
}
````

In the `move` method, you can specify the character's displacement, and this method returns an enum type composite value. By using the enum type `ControllerCollisionFlag`, you can determine if the character controller collides with other collider components:
```typescript
export enum ControllerCollisionFlag {
  /** Character is colliding to the sides. */
  Sides = 1,
  /** Character has collision above. */
  Up = 2,
  /** Character has collision below. */
  Down = 4
}
```
Based on this, the character's subsequent animations and movements can be determined. In the example below, you can control the character's movement using the keyboard to make it climb or jump over specific obstacles.
<playground src="physx-controller.ts"></playground>
