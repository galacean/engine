import { Color, Vector2, Vector3, Vector4 } from "@oasis-engine/math";

// TODO  temp
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
 * temp compa
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

// TODO temp
function handleProps(props) {
  const keys = Object.keys(props);
  for (let i = 0, l = keys.length; i < l; ++i) {
    const k = keys[i];
    const v = props[k];

    if (v?.length > 1) {
      if (["color", "diffuseColor", "specularColor"].indexOf(k) !== -1) {
        props[k] = new Color(v[0], v[1], v[2], v[3]);
      } else if (v.length === 4) {
        props[k] = new Vector4(v[0], v[1], v[2], v[3]);
      } else if (v.length === 3) {
        props[k] = new Vector3(v[0], v[1], v[2]);
      } else if (v.length === 2) {
        props[k] = new Vector2(v[0], v[1]);
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
    if (key === "newMaterial" || key === "scripts") {
      continue;
    }
    if (["ambientColor", "emissiveColor", "diffuseColor", "specularColor", "baseColor"].indexOf(key) !== -1) {
      props[key] = new Color(value[0], value[1], value[2], value[3]);
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
