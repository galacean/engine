/**
 * @author 逸瞻
 * @email [zane.zyz@alibaba-inc.com]
 * @create date 2018-12-12 15:20:28
 * @modify date 2018-12-12 15:35:06
 * @desc function to analysis shader buffer in glb file
 */

export function loadShaderBuffer(shaderBuffer, type, callback) {
  const blob = new window.Blob([shaderBuffer]);
  const file = new FileReader();
  file.readAsText(blob, "utf-8");
  file.onload = function () {
    callback(null, file.result);
  };
}
