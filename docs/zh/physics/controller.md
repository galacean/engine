---
order: 4
title: 角色控制器组件
type: 物理
label: Physics
---

角色控制器是物理引擎提供的一种非常重要的功能组件，通过角色控制器可以很容易为动画角色的运动增加物理上的表现，例如可以设定参数使得角色无法爬过一定角度的陡坡，
也可以在角色运动的过程中避免角色与其他碰撞器发生碰撞反馈等等。实际上，角色控制器只是碰撞器的一种高级封装，通过碰撞检测来实现各种高级的的角色控制行为。
也正因此，角色控制器组件的创建与使用，和碰撞器组件非常类似。
```typescript
const physicsCapsule = new CapsuleColliderShape();
physicsCapsule.radius = radius;
physicsCapsule.height = height;
const characterController = capsuleEntity.addComponent(CharacterController);
characterController.addShape(physicsCapsule);
```
和碰撞器组件一样，都是通过构造 `ColliderShape`，并且将其添加到组件中，使得角色控制器获得特定的外形。但这里需要特别强调两点：
1. 角色控制器不支持复合外形，因此只能添加一个 `ColliderShape`。
2. 角色控制器目前只支持 `CapsuleColliderShape` 和 `BoxColliderShape`，且其中 `CapsuleColliderShape` 最为常用。

后续角色控制器的行为通过 `CharacterController` 的各个参数和方法进行控制，其中最重要的是 `move` 函数:
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

可以在 `move` 方法中指定角色位移，并且该方法返回一个枚举类型的复合值，通过该枚举类型 `ControllerCollisionFlag` 可以判断角色控制器是否碰到其他的碰撞器组件：
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
由此角色接下来的动画和运动要怎么进行。在下面的例子当中，可以通过键盘控制角色的运动，使其爬上或者跳过特定的障碍物。
<playground src="physx-controller.ts"></playground>
