import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";
import {
  Transform,
  AnimationClip,
  AnimationCurve,
  AnimationProperty,
  InterpolaKeyframe,
  InterpolableValueType,
  AnimationEvent,
  ResourceManager
} from "@oasis-engine/core";
import { AssetConfig } from "../types";
import { LoadAttachedResourceResult } from "../types";
import { SchemaResource } from "./SchemaResource";

export class AnimationClipResource extends SchemaResource {
  load(resourceManager: ResourceManager, assetConfig: AssetConfig): Promise<any> {
    return new Promise((resolve) => {
      const { name, curves = [], events = [] } = assetConfig.props;
      const assetObj = new AnimationClip(name);

      for (let i = 0, length = curves.length; i < length; ++i) {
        const { relativePath, property, curve } = curves[i];
        let propertyName = "";
        let type;
        switch (property) {
          case AnimationProperty.Position:
            type = Transform;
            propertyName = "position";
            break;
          case AnimationProperty.Rotation:
            type = Transform;
            propertyName = "rotation";
            break;
          case AnimationProperty.Scale:
            type = Transform;
            propertyName = "scale";
            break;
        }
        if (!propertyName) continue;
        const { interpolation, keys, valueType } = curve;
        const animationCurve = new AnimationCurve();
        animationCurve.interpolation = interpolation;
        for (let j = 0, length = keys.length; j < length; ++j) {
          const keyframeData = keys[j];
          const keyframe = this._createKeyframe(keyframeData, valueType);
          animationCurve.addKey(keyframe);
        }
        assetObj.setCurve(relativePath, type, propertyName, animationCurve);
      }
      for (let i = 0, length = events.length; i < length; ++i) {
        const eventData = events[i];
        const event = new AnimationEvent();
        event.time = eventData.time;
        event.functionName = eventData.functionName;
        event.parameter = eventData.parameter;
        assetObj.addEvent(event);
      }
      console.log("AnimationClipResource load", assetConfig, assetObj);
      this._resource = assetObj;
      this.setMeta();
      resolve(this);
    });
  }

  loadWithAttachedResources(
    resourceManager: ResourceManager,
    assetConfig: AssetConfig
  ): Promise<LoadAttachedResourceResult> {
    return new Promise((resolve, reject) => {
      let loadPromise;
      if (assetConfig.resource instanceof AnimationClip) {
        loadPromise = new Promise((resolve) => {
          console.log("AnimationClipResource loadWithAttachedResources AnimationClip");
          this._resource = assetConfig.resource;
          this.setMeta();
          resolve(this);
        });
      } else if (assetConfig.props) {
        console.log("AnimationClipResource loadWithAttachedResources props");
        loadPromise = this.load(resourceManager, assetConfig);
      } else {
        reject("Load AnimationClip Error");
      }
      if (loadPromise) {
        loadPromise.then(() => {
          const result: any = {
            resources: [this],
            structure: {
              index: 0,
              props: {}
            }
          };
          resolve(result);
        });
      }
    });
  }

  setMeta() {
    if (this.resource) {
      this.meta.name = this.resource.name;
    }
  }

  getProps() {
    const result: any = {};
    const clip = this.resource as AnimationClip;
    result.name = clip.name;
    result.curves = clip.curves.map((curveData) => {
      const { relativePath, property, curve } = curveData;
      return {
        relativePath,
        property,
        curve: {
          interpolation: curve.interpolation,
          valueType: curve.valueType,
          keys: curve.keys
        }
      };
    });
    result.events = clip.events;
    console.log("AnimationClipResource getProps", this.resource, result);
    return result;
  }

  _transformObjToVec2(vec2) {
    return new Vector2(vec2.x, vec2.y);
  }

  _transformObjToVec3(vec3) {
    return new Vector3(vec3.x, vec3.y, vec3.z);
  }

  _transformObjToVec4(vec4) {
    return new Vector4(vec4.x, vec4.y, vec4.z, vec4.w);
  }

  _transformObjToQuat(quat) {
    return new Quaternion(quat.x, quat.y, quat.z, quat.w);
  }

  _createKeyframe(keyframeData, valueType: InterpolableValueType) {
    switch (valueType) {
      case InterpolableValueType.Float: {
        const keyframe = new InterpolaKeyframe<number, number>();
        keyframe.time = keyframeData.time;
        keyframe.value = keyframeData.value;
        keyframe.inTangent = keyframeData.inTangent;
        keyframe.outTangent = keyframeData.outTangent;
        return keyframe;
      }
      case InterpolableValueType.FloatArray: {
        const keyframe = new InterpolaKeyframe<Float32Array, Float32Array>();
        keyframe.time = keyframeData.time;
        keyframe.value = new Float32Array(keyframeData.value);
        keyframe.inTangent = keyframeData.inTangent;
        keyframe.outTangent = keyframeData.outTangent;
        return keyframe;
      }
      case InterpolableValueType.Vector2: {
        const keyframe = new InterpolaKeyframe<Vector2, Vector2>();
        keyframe.time = keyframeData.time;
        keyframe.value = this._transformObjToVec2(keyframeData.value);
        keyframe.inTangent = this._transformObjToVec2(keyframeData.inTangent);
        keyframe.outTangent = this._transformObjToVec2(keyframeData.outTangent);
        return keyframe;
      }
      case InterpolableValueType.Vector3: {
        const keyframe = new InterpolaKeyframe<Vector3, Vector3>();
        keyframe.time = keyframeData.time;
        keyframe.value = this._transformObjToVec3(keyframeData.value);
        keyframe.inTangent = this._transformObjToVec3(keyframeData.inTangent);
        keyframe.outTangent = this._transformObjToVec3(keyframeData.outTangent);
        return keyframe;
      }
      case InterpolableValueType.Vector4: {
        const keyframe = new InterpolaKeyframe<Vector4, Vector4>();
        keyframe.time = keyframeData.time;
        keyframe.value = this._transformObjToVec4(keyframeData.value);
        keyframe.inTangent = this._transformObjToVec4(keyframeData.inTangent);
        keyframe.outTangent = this._transformObjToVec4(keyframeData.outTangent);
        return keyframe;
      }
      case InterpolableValueType.Quaternion: {
        const keyframe = new InterpolaKeyframe<Vector4, Quaternion>();
        keyframe.time = keyframeData.time;
        keyframe.value = this._transformObjToQuat(keyframeData.value);
        keyframe.inTangent = this._transformObjToVec4(keyframeData.inTangent);
        keyframe.outTangent = this._transformObjToVec4(keyframeData.outTangent);
        return keyframe;
      }
    }
  }
}
