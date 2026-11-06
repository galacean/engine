# Resident capture viewer（历史资产 Demo）

归属 `@galacean/engine-building`。使用保留的离线 `CapturedResidentRenderer`，不参与 World 静态构建。需要已有的 capture 资产目录，其中包含 `scene.json` 及它引用的二进制/纹理；资产提取 provider 与原游戏数据不随迁移提供。

```sh
python3 world/demos/tiny-glade-resident/server.py --assets "$CAPTURE_ASSETS" --port 8776
```

访问 `http://127.0.0.1:8776/`。Python ≥ 3.10。这个页面是历史对比工具，不代表原游戏 provider 已迁为浏览器运行实现。本次未启动此服务进行回归。
