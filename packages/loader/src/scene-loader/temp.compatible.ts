import { Color, Vector2, Vector3, Vector4, SphericalHarmonics3 } from "@oasis-engine/math";

/**
 * temp compa
 * @param config
 */
export function compatibleToV2(config) {
  const { abilities = {}, assets = {}, scene = {} } = config;
  const ids = Object.keys(abilities);
  const assetKeys = Object.keys(assets);
  const sceneKeys = Object.keys(scene || {});

  for (let i = 0, l = ids.length; i < l; ++i) {
    handleComponents(abilities[ids[i]].props);
  }

  for (let i = 0, l = assetKeys.length; i < l; ++i) {
    handleAssets(assets[assetKeys[i]].props);
  }

  for (let i = 0, l = sceneKeys.length; i < l; ++i) {
    handleSceneProps(scene[sceneKeys[i]].props);
  }

  return config;
}

// TODO temp
function handleComponents(props) {
  const keys = Object.keys(props);
  for (let i = 0, l = keys.length; i < l; ++i) {
    const k = keys[i];
    const v = props[k];

    if (Array.isArray(v)) {
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

const sh = new SphericalHarmonics3();

function handleSceneProps(props) {
  const keys = Object.keys(props);
  for (let i = 0, l = keys.length; i < l; ++i) {
    const k = keys[i];
    const v = props[k];

    if (Array.isArray(v)) {
      if (/color/i.test(k)) {
        props[k] = new Color(v[0], v[1], v[2], v[3]);
      } else if (v.length === 4) {
        props[k] = new Vector4(v[0], v[1], v[2], v[3]);
      } else if (v.length === 3) {
        props[k] = new Vector3(v[0], v[1], v[2]);
      } else if (v.length === 2) {
        props[k] = new Vector2(v[0], v[1]);
      }
    } else if (k === "diffuseSphericalHarmonics") {
      sh.setValueByArray(JSON.parse(v));
      props[k] = sh;
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

    if (Array.isArray(value)) {
      if (["emissiveColor", "diffuseColor", "specularColor", "baseColor"].indexOf(key) !== -1) {
        props[key] = new Color(value[0], value[1], value[2], value[3]);
      } else if (value.length === 4) {
        props[key] = new Vector4(value[0], value[1], value[2], value[3]);
      } else if (value.length === 3) {
        props[key] = new Vector3(value[0], value[1], value[2]);
      } else if (value.length === 2) {
        props[key] = new Vector2(value[0], value[1]);
      }
    }
  }
}
