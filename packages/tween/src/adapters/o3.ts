import * as TweenPlugins from "../plugins";
import { Tweener } from "../Tweener";
import { DataType } from "oasis-engine";

/***  Do rotation interpolation transformation.
 * @param {Object} obj - Object
 * @param {quat} endValue - End quaternion
 * @param {number} interval - Time interval
 * @param {Object} options - Options
 * @param {function} options.onComplete - Completed callback function
 */
const doTransformRotate = (obj, endValue, interval, options: any = {}) => {
  options.plugin = options.plugin || TweenPlugins.QuaternionPlugin;
  return new Tweener(
    () => obj.rotation.clone(),
    (value) => (obj.rotation = value),
    endValue,
    interval,
    options,
    obj
  );
};

/*** Do translation interpolation transformation.
 * @param {Object} obj - Object
 * @param {Vector3} endValue - End value
 * @param {number} interval - Time interval
 * @param {Object} options - Options
 * @param {function} options.onComplete - Completed callback function
 */
const doTransformTranslate = (obj, endValue, interval, options: any = {}) => {
  options.plugin = options.plugin || TweenPlugins.Vector3Plugin;

  return new Tweener(
    () => obj.position.clone(),
    (value) => (obj.position = value),
    endValue,
    interval,
    options,
    obj
  );
};

/*** Do scaling interpolation transformation.
 * @param {Object} obj - Object
 * @param {Vector3} endValue - End value
 * @param {number} interval - Time interval
 * @param {Object} options - Options
 * @param {function} options.onComplete - Completed callback function
 */
const doTransformScale = (obj, endValue, interval, options: any = {}) => {
  options.plugin = options.plugin || TweenPlugins.Vector3Plugin;
  return new Tweener(
    () => obj.scale.clone(),
    (value) => (obj.scale = value),
    endValue,
    interval,
    options,
    obj
  );
};

/***
 * Do material parameters interpolation transformation.
 * @param {Material} mtl - Material
 * @param {*} endValue - End value
 * @param {string} property - Material property
 * @param {number} interval - Time interval
 * @param {Object} options - Options
 * @param {function} options.onComplete - Completed callback function
 */
const doMaterialValue = (mtl, endValue, property = "", interval, options: any = {}) => {
  options.plugin = options.plugin || TweenPlugins.FloatPlugin;

  return new Tweener(
    () => mtl.getValue(property),
    (value) => mtl.setValue(property, value),
    endValue,
    interval,
    options,
    mtl
  );
};

/*** Do material color interpolation transformation.
 * @param {Material} mtl - Material
 * @param {Vector3} endValue - End value
 * @param {string} property - Material property
 * @param {number} interval - Time interval
 * @param {Object} options - Options
 * @param {function} options.onComplete - Completed callback function
 */
const doMaterialColor = (mtl, endValue, property = "", interval, options: any = {}) => {
  options.plugin = options.plugin || TweenPlugins.Vector3Plugin;

  return new Tweener(
    () => mtl.getValue(property),
    (value) => {
      mtl.setValue(property, [value[0] / 255, value[1] / 255, value[2] / 255]);
    },
    endValue,
    interval,
    options,
    mtl
  );
};

/*** Do general numerical interpolation transformation.
 * @param {number|Vector2|Vector3|Vector4} startValue - Start value
 * @param {function} setter - Setter function
 * @param {number|Vector2|Vector3|Vector4} endValue - End value
 * @param interval - Time interval
 * @param {Object} options - Options
 * @param {DataType} options.dataType
 * @param {function} options.onComplete - Completed callback function
 */
const doTransformByDataType = (startValue, setter, endValue, interval, options: any = {}) => {
  if (options.dataType === DataType.FLOAT_VEC2) {
    options.plugin = options.plugin || TweenPlugins.Vector2Plugin;
    return new Tweener(() => startValue.clone(), setter, endValue, interval, options);
  } else if (options.dataType === DataType.FLOAT_VEC3) {
    options.plugin = options.plugin || TweenPlugins.Vector3Plugin;
    return new Tweener(() => startValue.clone(), setter, endValue, interval, options);
  } else if (options.dataType === DataType.FLOAT_VEC4) {
    options.plugin = options.plugin || TweenPlugins.Vector3Plugin;
    return new Tweener(() => startValue.clone(), setter, endValue, interval, options);
  } else {
    options.plugin = options.plugin || TweenPlugins.FloatPlugin;
    return new Tweener(() => startValue, setter, endValue, interval, options);
  }
};

export const doTransform = {
  Rotate: doTransformRotate,
  Translate: doTransformTranslate,
  Scale: doTransformScale,
  DataType: doTransformByDataType
};

export const doMaterial = {
  Float: doMaterialValue,
  Color: doMaterialColor
};
