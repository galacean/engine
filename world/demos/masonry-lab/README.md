# 砌造实验室（历史外部服务 Demo）

归属 `@galacean/engine-building`。本页面保留原 provider 的几何/规则/单元实验，不参与 World 静态构建，也不是 Seed World 的建筑运行链路。

需要已有的 Python authoring provider（含 `server.py`、`project`、`arrangements`、原生拓扑与资源提取模块）、已导出的资产包（`scene.json`、`lab-scene.json` 和材质变体）、两个有效会话目录。提供方依赖和原游戏提取数据不在仓库内。使用 Python ≥ 3.10；导出工具需要 Pillow；编译桥需要支持 TypeScript stripping 的 Node 24。

从仓库根目录执行：

```sh
python3 world/demos/masonry-lab/server.py \
  --provider "$AUTHORING_PROVIDER" --assets "$CAPTURE_ASSETS" \
  --session-dir "$ORIGINAL_SESSION" --example-session "$EXAMPLE_SESSION" --port 8777
```

页面地址为 `http://127.0.0.1:8777/`。共享离线编译/导出工具位于 `packages/building/src/tiny-glade/tools/`；`CapturedResidentRenderer.js` 与其运行数据由服务映射。可选 `--gpu-feedback` 需要另行提供兼容的 `--engine-assets`，本次未迁入旧 PR3071 bridge 构建脚本。未在缺失 provider 的环境中宣称完成服务运行验收。
