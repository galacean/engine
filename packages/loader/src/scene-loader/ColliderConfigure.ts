import {
  BoxColliderShape,
  CapsuleColliderShape,
  Collider,
  ColliderShapeUpAxis,
  DynamicCollider,
  PlaneColliderShape,
  SphereColliderShape
} from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";

// 根据Schema构造Component
export function colliderConfigure(collider: Collider, props: any) {
  (<any>collider).isShowCollider = props.isShowCollider;

  const shapes = props.colliderShapes;
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    switch (shape._shapes) {
      case "BoxColliderShape": {
        const box = new BoxColliderShape();
        shape.size && box.setSize(shape.size[0], shape.size[1], shape.size[2]);
        shape.position && box.setPosition(shape.position[0], shape.position[1], shape.position[2]);
        shape.isTrigger && (box.isTrigger = shape.isTrigger);
        collider.addShape(box);
        break;
      }
      case "CapsuleColliderShape": {
        const capsule = new CapsuleColliderShape();
        shape.radius && (capsule.radius = shape.radius);
        shape.height && (capsule.height = shape.height);
        if (shape.upAxis) {
          switch (shape.upAxis) {
            case "X":
              capsule.upAxis = ColliderShapeUpAxis.X;
              break;
            case "Y":
              capsule.upAxis = ColliderShapeUpAxis.Y;
              break;
            case "Z":
              capsule.upAxis = ColliderShapeUpAxis.Z;
              break;
          }
        }
        shape.position && capsule.setPosition(shape.position[0], shape.position[1], shape.position[2]);
        shape.isTrigger && (capsule.isTrigger = shape.isTrigger);
        collider.addShape(capsule);
        break;
      }
      case "PlaneColliderShape": {
        const plane = new PlaneColliderShape();
        shape.rotation && plane.setRotation(shape.rotation[0], shape.rotation[1], shape.rotation[2]);
        shape.position && plane.setPosition(shape.position[0], shape.position[1], shape.position[2]);
        shape.isTrigger && (plane.isTrigger = shape.isTrigger);
        collider.addShape(plane);
        break;
      }
      case "SphereColliderShape": {
        const sphere = new SphereColliderShape();
        shape.radius && (sphere.radius = shape.radius);
        shape.position && sphere.setPosition(shape.position[0], shape.position[1], shape.position[2]);
        shape.isTrigger && (sphere.isTrigger = shape.isTrigger);
        collider.addShape(sphere);
        break;
      }
    }
  }

  if (collider instanceof DynamicCollider) {
    const force = props.force;
    if (force) {
      (<DynamicCollider>collider).applyForce(new Vector3(force[0], force[1], force[2]));
    }

    const torque = props.torque;
    if (torque) {
      (<DynamicCollider>collider).applyTorque(new Vector3(torque[0], torque[1], torque[2]));
    }
  }
}
