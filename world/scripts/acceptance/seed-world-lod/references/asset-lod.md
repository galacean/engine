# 资产制作与同机位验收

## 准备候选

工具接受已烘焙根变换、单节点、单 indexed triangle primitive 的静态 GLB，要求具备 POSITION、NORMAL、TEXCOORD_0。资产较复杂时先按材质和变换确定处理范围，再选择对应的项目工具。检查原始 GLB、素材归属及预期发布方式。

```sh
tools=world/scripts/acceptance/seed-world-lod
out=/path/to/a-new-review-directory
blender --background --factory-startup --python-exit-code 1 \
  --python "$tools/scripts/build-lod.py" -- \
  --input /path/to/original.glb --out "$out/geometry" \
  --ratio 0.65 --ratio 0.5 --ratio 0.35 --ratio 0.2
```

`--ratio` 是候选保留比例，自由增减。输出 `asset.json` 和记入实际三角面数的几何候选。清单引用原 GLB，候选按比例从高到低编号。保留原始模型及其资源路径供对照，几何候选在运行时共用原材质。脚本用 Blender 折叠减面与角点法线传递，按原位置与 UV 为低模匹配原切线。UV 接缝或复杂切线仍需检查实拍。

## 对照

在当前 Engine 工作树启动可用的 World Vite 开发环境。建议沿用当前正在工作的本地服务。需要准备时查看 `world/package.json` 的 `prepare:engine` 和 `dev`。采集使用仓库已有的 `@playwright/test`。默认使用 Playwright Chromium，也可通过 `--channel chrome` 使用本机 Chrome。报告需要 Python 3.10+，以及 Pillow 10.1+、NumPy、SciPy。

```sh
node "$tools/scripts/capture.cjs" asset --url http://127.0.0.1:5193 \
  --manifest "$out/geometry/asset.json" --out "$out/captures" \
  --width 1440 --height 1080 --shares 0.22,0.08 --yaws 35,125
python3 "$tools/scripts/report.py" "$out/captures/measurements.json" --out "$out/report"
```

同组候选使用原模材质、机位、光照和投影尺寸。原模型可以引用自带资源、同目录下的相对资源或可访问的绝对 CDN URL。默认以双倍分辨率渲染并缩回显示分辨率，以实际像素尺寸比较。检查 `asset-*.png` 和 `asset-metrics.csv`。剪影 IoU 基于背景分离，RGB MAE 统计两张图剪影重合区域，结合原图确认高光、岩层和轮廓误差。变化达不到预算时增加保留比例或调整阈值再测。

22%/8% 是当前 Seed 岩石的采集起点。若任务是选阈值，增测其他尺寸与视角，再比较最差画质和成本。离线候选只证明单体表现，场景验收见 [出生点环拍](spawn-review.md)。
