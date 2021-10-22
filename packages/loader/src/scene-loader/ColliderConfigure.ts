import {
  BoxColliderShape,
  CapsuleColliderShape,
  Collider,
  ColliderShapeUpAxis,
  PlaneColliderShape,
  SphereColliderShape
} from "@oasis-engine/core";

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
            case "X-Axis":
              capsule.upAxis = ColliderShapeUpAxis.X;
              break;
            case "Y-Axis":
              capsule.upAxis = ColliderShapeUpAxis.Y;
              break;
            case "Z-Axis":
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
        shape.rotation && plane.setRotation(shape.position[0], shape.position[1], shape.position[2]);
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
}
