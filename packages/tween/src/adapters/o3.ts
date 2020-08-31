import * as TweenPlugins from "../plugins";
import { Tweener } from "../Tweener";
import { DataType } from "@alipay/o3";

/***  做旋转的插值变换
 * @param {Object}  obj 物体
 * @param {quat} endValue 旋转终值(四元数)
 * @param {number} interval 时间区间
 * @param {Object} options 选项
 * @param {function} options.onComplete 完成后调用函数
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

/*** 做平移的插值变换
 * @param {Object}  obj 物体
 * @param {Vector3} endValue 平移终值
 * @param {number} interval 时间区间
 * @param {Object} options 选项
 * @param {function} options.onComplete 完成后调用函数
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

/*** 做缩放的插值变换
 * @param {Object}  obj 物体
 * @param {Vector3} endValue 缩放终值
 * @param {number} interval 时间区间
 * @param {Object} options 选项
 * @param {function} options.onComplete 完成后调用函数
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

/*** 做材质参数的插值变换
 * @param {Material}  mtl 材质
 * @param {*} endValue 材质参数终值
 * @param {string} property 材质属性
 * @param {number} interval 时间区间
 * @param {Object} options 选项
 * @param {function} options.onComplete 完成后调用函数
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

/*** 做材质颜色的插值变换
 * @param {Material}  mtl 材质
 * @param {Vector3} endValue 材质颜色终值
 * @param {string} property 材质属性
 * @param {number} interval 时间区间
 * @param {Object} options 选项
 * @param {function} options.onComplete 完成后调用函数
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

/*** 做一般数值的插值变换
 * @param {number|Vector2|Vector3|Vector4}  startValue 起始值
 * @param {function} setter 设置函数
 * @param {number|Vector2|Vector3|Vector4} endValue 终止值
 * @param interval
 * @param {Object} options 选项
 * @param {DataType} options.dataType
 * @param {function} options.onComplete 完成后调用函数
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
