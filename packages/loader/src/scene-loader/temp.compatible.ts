import { Vector2, Vector3, Vector4 } from "@alipay/o3-math";

// TODO  临时方案 用来将编辑器中用的数组转为引擎需要的数据类型，而不修改编辑器本身逻辑
const _vec3Attribute = [
  "color",
  "center",
  "size",
  "__position",
  "__positionRandomness",
  "__color",
  "__velocity",
  "__velocityRandomness",
  "__acceleration",
  "__accelerationRandomness",
  "_center"
];

/**
 * 临时兼容到 v2 的 schema 数据
 * @param config
 */
export function compatibleToV2(config) {
  const { abilities = {}, assets = {} } = config;
  const ids = Object.keys(abilities);
  const assetKeys = Object.keys(assets);

  for (let i = 0, l = ids.length; i < l; ++i) {
    handleProps(abilities[ids[i]].props);
  }

  for (let i = 0, l = assetKeys.length; i < l; ++i) {
    handleAssets(assets[assetKeys[i]].props);
  }

  return config;
}

// TODO 临时方案
function handleProps(props) {
  const keys = Object.keys(props);
  for (let i = 0, l = keys.length; i < l; ++i) {
    const k = keys[i];
    const v = props[k];

    if (v !== null && typeof v === "object" && v.length > 1) {
      if (k === "backgroundColor" || k === "tintColor") {
        props[k] = new Vector4(v[0], v[1], v[2], v[3]);
      } else if (_vec3Attribute.indexOf(k) !== -1) {
        props[k] = new Vector3(v[0], v[1], v[2]);
      }
    }
  }
}

function handleAssets(props: any = {}) {
  if (!props) {
    return;
  }
  const keys = Object.keys(props);
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    const value = props[key];
    if (key === "newMaterial" || key === "blendFuncSeparate") {
      continue;
    }
    switch (value?.length) {
      case 2:
        props[key] = new Vector2(value[0], value[1]);
        break;
      case 3:
        props[key] = new Vector3(value[0], value[1], value[2]);
        break;
      case 4:
        props[key] = new Vector4(value[0], value[1], value[2], value[3]);
        break;
    }
  }
}
