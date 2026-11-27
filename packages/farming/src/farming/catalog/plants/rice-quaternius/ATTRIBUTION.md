# 水稻 · Quaternius

作者：Quaternius

授权：[CC0](https://creativecommons.org/publicdomain/zero/1.0/)

[原始素材](https://quaternius.com/packs/ultimatecrops.html)

## 派生处理

按原始 .blend 文件提取完整植株；旧 EEVEE/Cycles 专用输出替换为 ALL 输出并连接原文件中颜色一致的 Principled 节点以保留 GLB PBR 颜色；Flower/Flowers 合并为花卉，Coconut_Half 归入椰子树产物。生长阶段与采收后植株、产物分别登记，可复用成熟形态到多个阶段组。

通过 prepare-crop-packs.py 离线导出，保留材质与纹理，烘焙世界变换，最低 1% 顶点接地中心对齐，输出米制 Y-up GLB。无相机、灯光或展示地面。原始文件不修改。每个阶段的源文件、源对象、SHA-256、尺寸及三角形数见 normalization-report.json。

## 程序化派生

四阶段植株已替换为生长配方与原材质色板，结构规则人工编写，细节见 [procedural/README.md](procedural/README.md)。原 GLB（包含独立采收产物）归档于仓库外，normalization-report.json 保留为来源记录。
