# Seed Demo 出生点 360° 环拍

使用目标工作树的 Vite 开发页。需要比较发布结果时，记录 commit、模板、seed、分辨率和光照。如当前分支遇到引擎启动问题，优先修复或使用已知兼容的本地引擎配置，并注明实际版本。打开一个页面并顺序验收多个模板。

```sh
tools=world/scripts/acceptance/seed-world-lod
out=/path/to/a-new-review-directory
node "$tools/scripts/capture.cjs" seed \
  --url http://127.0.0.1:5193/world/demos/seed-world/index.html \
  --template titan-wasteland --seed 1 --step 45 --time 12 \
  --width 1280 --height 720 --out "$out/captures"
python3 "$tools/scripts/report.py" "$out/captures/measurements.json" \
  --out "$out/report"
```

- `0°` 是实际开场机位与朝向。探针固定相机位置、俯仰、FOV、太阳时间和动画时钟，只绕世界竖轴转动。模板有构图机位时记录实际相机坐标。选取不大于水平 FOV 的采样步长保持视野连续。
- 采集脚本拦截当前浏览器页收到的 `SeedWorldDemo.ts` 并临时注入探针。探针覆盖共用岩石、沙漠专用岩石和开场已激活的伴生石。若场景结构或渲染注册变更，先更新探针适配，再以浏览器数据核对采样范围。
- 这组截图比较稳定档位。共用岩石取开场稳定的自动档，带独立 LODGroup 的岩石按当前相机投影吸附到稳定档。LOD0 组强制使用原网格，也可能恢复自动组因终端阈值退场的岩石。统计是通过主相机视锥筛选的目标渲染器三角面，每个渲染器去重一次，深度遮挡、阴影和全帧性能需要独立测量。
- 脚本输出原始 PNG、带红框的 `spawn-360.jpg`（长序列分图）、逐朝向 `triangles.csv` 和按资产路径及档位分组的 `triangles-by-level.csv`。红框依据换档或退场岩石的投影范围与局部像素变化。报告支持 `--threshold`、`--boxes` 和归一化坐标的 `--ignore left,top,right,bottom`，可针对 HUD 动画排除干扰。先检查框内是不是实际岩石变化，再交付；某个朝向无明显差异时允许没有红框。
- 若用户要求验收换档过渡，另在实际场景让相机跨过阈值，记录源档、目标档和淡化完成时间。静态环拍的面数描述稳定状态。
