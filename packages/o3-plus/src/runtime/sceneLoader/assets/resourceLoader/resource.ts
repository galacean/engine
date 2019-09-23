import * as r3 from "@alipay/o3";

/**
 * 单纯的素材加载
 * @param engine
 * @param downloadableResources
 * @param onProgress
 */
let resourceLoader;
export async function loadResources(engine: r3.Engine, downloadableResources, onProgress?: (current, total) => void): Promise<any> {
  resourceLoader = new r3.ResourceLoader(engine, null);
  return await new Promise<any[]>((resolve, reject) => {
    resourceLoader.batchLoad(downloadableResources, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    }, onProgress);
  });
}
