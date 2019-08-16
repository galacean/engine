
# 1.1.6 Change
* noramlMat 改为mat3, 外部使用自定义shader用到了normalMat的话，需要把uniform配置中的dataType改为MAT3

## 1.1.14

* 修正 Texture2D.configMipmap() 中判断是否启用 mipmap 的逻辑；
* 对于不能开启 mipmap 的贴图，自动设置兼容的 filter，避免渲染失败.

## 1.1.13

* texture config 变量名修改，保持与 glTF Sampler一致（修复 glTF  loader 加载的 Sampler 失效的问题）
  * config.filterMag --> magFilter
  * config.filterMin --> minFilter