import { loadBinary } from "./loadBinary";
import { loadText } from "./loadText";
import { loadJSON } from "./loadJSON";
import { loadImage } from "./loadImage";
import { loadVideo } from "./loadVideo";
import { loadImageBuffer } from "./loadImageBuffer";
import { loadShaderBuffer } from "./loadShaderBuffer";
import { loadTGA } from "./loadTGA";

export function load(type, props: any = {}, callback) {
  switch (type) {
    case "binary":
      loadBinary(props.url, callback, props.timeout);
      break;
    case "text":
      loadText(props.url, callback);
      break;
    case "json":
      loadJSON(props.url, callback, props.timeout);
      break;
    case "image": {
      if (/\.tga/.test(props.url)) {
        loadTGA(props.url, callback, props.crossOrigin, props.reSample, props.timeout);
      } else {
        loadImage(props.url, callback, props.crossOrigin, props.reSample, props.timeout);
      }
      break;
    }
    case "video":
      loadVideo(props.url, callback, props.crossOrigin);
      break;
    case "imageBuffer":
      loadImageBuffer(props.imageBuffer, props.type, callback);
      break;
    case "shaderBuffer": // 逸瞻：shaderbuffer对应解析函数
      loadShaderBuffer(props.shaderBuffer, props.type, callback);
      break;
    default:
      callback("load file error: unknown file type");
  }
}

export function loadAll(loadQueue = {}, callback) {
  const promises = [];
  const promisesKey = [];
  for (const key in loadQueue) {
    const loadItem = loadQueue[key] || {};
    const promise = new Promise((resolve, reject) => {
      load(loadItem.type, loadItem.props, (err, res) => {
        if (!err) {
          resolve(res);
        } else {
          reject(err);
        }
      });
    });
    promises.push(promise);
    promisesKey.push(key);
  }

  Promise.all(promises)
    .then(resArr => {
      const map = {};

      for (let i = 0; i < resArr.length; i++) {
        map[promisesKey[i]] = resArr[i];
      }

      callback(null, map);
    })
    .catch(e => {
      callback(e);
    });
}
