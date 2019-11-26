import * as r3 from "@alipay/o3";

/**
 * 单纯的素材加载
 * @param engine
 * @param downloadableResources
 * @param onProgress
 */
export async function loadResources(
  resourceLoader,
  engine: r3.Engine,
  downloadableResources,
  onProgress?: (current, total) => void
): Promise<any> {
  return await new Promise<any[]>((resolve, reject) => {
    resourceLoader.batchLoad(
      downloadableResources,
      (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      },
      onProgress
    );
  });
}
