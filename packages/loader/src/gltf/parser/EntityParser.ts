import { Camera, Entity, Logger } from "@oasis-engine/core";
import { Matrix, Quaternion, Vector3 } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { Parser } from "./Parser";

export class EntityParser extends Parser {
  private static _nodeCount = 0;
  private static _position = new Vector3();
  private static _scale = new Vector3(1, 1, 1);
  private static _rotation = new Quaternion();

  parse(context: GLTFResource): void {
    const {
      engine,
      gltf: { nodes, cameras }
    } = context;
    if (!nodes) return;

    const entities = [];

    for (let i = 0; i < nodes.length; i++) {
      const gltfNode = nodes[i];
      const { matrix, translation, rotation, scale, weights, camera: cameraID } = gltfNode;
      const entity = new Entity(engine, gltfNode.name || `GLTF_NODE_${EntityParser._nodeCount++}`);

      if (weights) {
        Logger.error("Sorry, morph animation is not supported now, wait please.");
      }

      if (matrix) {
        const mat = new Matrix();
        mat.setValueByArray(matrix);
        mat.decompose(EntityParser._position, EntityParser._rotation, EntityParser._scale);

        entity.transform.position = EntityParser._position;
        entity.transform.rotationQuaternion = EntityParser._rotation;
        entity.transform.scale = EntityParser._scale;
      } else {
        if (translation) {
          // @ts-ignore
          entity.transform.setPosition(...translation);
        }
        if (rotation) {
          // @ts-ignore
          entity.transform.setRotationQuaternion(...rotation);
        }
        if (scale) {
          // @ts-ignore
          entity.transform.setScale(...scale);
        }
      }

      if (cameraID !== undefined) {
        const cameraOptions = cameras[cameraID];
        const { orthographic, perspective, type, name } = cameraOptions;
        const camera = entity.addComponent(Camera);

        if (type === "orthographic") {
          const { xmag, ymag, zfar, znear } = orthographic;

          camera.isOrthographic = true;

          if (znear !== undefined) {
            camera.nearClipPlane = znear;
          }
          if (zfar !== undefined) {
            camera.farClipPlane = zfar;
          }
          if (ymag && xmag) {
            camera.orthographicSize = Math.max(ymag, xmag) / 2;
          }
          if (ymag !== undefined && xmag) {
            camera.orthographicSize = xmag / 2;
          }
          if (xmag !== undefined && ymag) {
            camera.orthographicSize = ymag / 2;
          }
        } else if (type === "perspective") {
          const { aspectRatio, yfov, zfar, znear } = perspective;

          if (aspectRatio !== undefined) {
            camera.aspectRatio = aspectRatio;
          }
          if (yfov !== undefined) {
            camera.fieldOfView = yfov;
          }
          if (zfar !== undefined) {
            camera.farClipPlane = zfar;
          }
          if (znear !== undefined) {
            camera.nearClipPlane = znear;
          }
        }
      }

      entities[i] = entity;
    }

    context.entities = entities;
  }
}
