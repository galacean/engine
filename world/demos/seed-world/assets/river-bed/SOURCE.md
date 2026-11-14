# Farmlands 河床素材

经授权复用 Farmlands Scene_Demo 的 Farmlands_RiverStone.terrainlayer；实际 diffuse 为 `Farmlands/Textures/Terrain/Sand/T_Farm_Sand_CH.tga`，tile size 6 × 6 米。未能解析 normal/mask GUID，当前不绑定替代图。

| 文件 | SHA-256 / 转换 |
| --- | --- |
| 原 TGA | `5839906fba85e94e3e5244083fbeb62975c9100aef4694334781455639567ac9` |
| farmlands-river-sand.png | `63bef1adb845c239b4fd615a908523b95c9391415ec03c6151efaf5f8568b41b`；1024² RGBA 无损转换，无缩放 |

PlanningAlphamap 从已发布河流轮廓派生 riverBedCoverage，向岸上延伸 0.75 米并沿材质边界过渡；不挖床/改高度，也不复用湖/海通道。PlanningRiverBedLayer 在预览与 SeedWorld 使用同一层，其他权重按剩余覆盖保持比例。纹理按 Engine 租约共享，精细块按明确 content revision 共享数组；可变纹理保持独立。
