# 素材准备、命令与边界

## 当前项目的格式契约

以目标工作树为准，读取以下文件：

| 文件 | 负责内容 |
|---|---|
| `packages/project/src/project-files/project-file-types.ts` | 路径推断和显式资产类型 |
| `packages/runtime-editor/src/project/runtime-native-formats.ts` | 格式解析、`validateImport` 和引用提取 |
| `packages/runtime-editor/src/retrieval-agent/asset-source.ts` | 召回文件的二进制或文本解码 |
| `packages/runtime-editor/src/project/runtime-asset-import.ts` | 文件夹导入和引用重写 |

`validate-project.mjs` 调用这些真实模块，在内存草稿中导入整个资产。
它不创建游戏项目，不运行脚本，也不打开浏览器。
它检查导入结构和依赖契约。
检查通过不证明 GPU 呈现、全部纹理压缩能力或玩法行为正确。

以下是 2026-11-05 核对的格式边界。项目变化后重新检查，不将此表作为永久白名单。

| 素材 | 当时的导入要求 |
|---|---|
| glTF | 使用 `.glb` 二进制 glTF 2.0。buffers 和 images 必须内嵌。不直接宣称支持外置 `.gltf` |
| Texture | 支持 PNG/JPEG。其他格式必须同时通过召回解码和项目格式校验。存在 Engine Loader 不代表可以导入 |
| Mesh | `.mesh` 默认表示 PrimitiveMesh JSON，例如 cuboid。二进制 Mesh 是另一类型。当前召回解码可能不支持，校验失败时拒绝导入，不改后缀绕过 |
| JSON | 在 `file.json.meta` 中指定 `type: JSON` 和 summary。否则普通 `.json` 可能只作为文档导入 |
| Prefab/Scene | 使用当前 Editor v2 结构。依赖随同文件夹导入，并通过层级转换和引用校验 |
| Material/AnimatorController | 使用原生布局。引用必须完整。自定义 Shader 必须有真实可用的依赖 |
| Script/自定义类型 | 必须通过项目对应的编译或注册校验。独立准备器不提供完整 Script 编译环境，不伪造依赖结果 |

## OSS 分类证据

外部同步账本记录了以下历史数量：

| 分类 | 数量 |
|---|---:|
| texture | 8113 |
| model | 4662 |
| audio | 926 |
| prefab | 61 |
| spine | 14 |
| font | 2 |

这些数量不是当前 OSS 全量统计，也不是可用性白名单。
2026-11-05 首次读取返回 403。用户恢复访问后，六类描述的实时抽样读取成功。
样本包含 GLB、PNG/JPEG、OGG、TTF、Spine JSON/atlas/PNG 和 Prefab `.package`。
来源中存在该分类，不代表当前项目可以导入其中所有资产。

## 目录与描述

每个独立目录对应一项入库资产。该资产的物料和依赖均放在目录内。
例如：

```text
<外部草稿>/fishing-rod/
  describe.json
  fishing-rod.glb
  README.md                 # 有必要才提供
```

```json
{
  "assetType": "model",
  "assetPaths": ["assets/local/fishing-rod/fishing-rod.glb"],
  "overview": {
    "name": "鱼竿",
    "description": "根据实际预览填写可确认的形态、材质和风格。"
  },
  "tags": ["鱼竿", "钓鱼", "fishing rod"],
  "visualProfile": {"description": "根据实际可见外观填写。"},
  "usage": {"description": "导入模型后实例化。这是静态物料，不包含钓鱼交互。"}
}
```

示例不是可直接发布的事实。按实际素材填写描述和用途。

- 名称和关键词使用自然名称、常用别称及有依据的特征。
- 搜索索引读取 `overview.name`、`overview.description` 和顶层或分区的 `tags`。
- 尺寸、动画等技术证据放在 `technical` 中。不要堆砌关键词提高排序。
- `assetType` 表示检索分类。后缀或必要的 `.meta` 表示项目导入类型。两者不要求同名。
- `assetPaths` 使用完整的 `assets/...` 逻辑键。所有入口均须位于当前资产目录内。
- 本地来源建议使用 `assets/local/...`。工具返回的 `/oss/assets/local/...` 沿用来源定位协议，不表示文件写入了 OSS。
- `manifestPath` 可选。不要为简单文件增加冗余 manifest。
- README 通过链接或准确入口说明用法，不复制整套接口声明。

## 批次输入

整理物料后，在物料目录外创建 `batch.json`：

```json
{
  "assets": [
    {"directory": "/absolute/staging/fishing-rod", "key": "assets/local/fishing-rod/describe.json", "mode": "create"}
  ]
}
```

`mode` 只作用于本地发布来源，不更新 OSS 资产。

| 情况 | 处理 |
|---|---|
| 目标目录不存在 | 使用 `create` |
| 已登记的同一路径具有相同文件集和字节 | 准备器标记为 `reuse` |
| 同名但内容不同 | 拒绝 `create`。用户选择 `update` 或新名称 |
| 同目录存在 OSS 文件 | 拒绝发布。选择其他本地逻辑目录 |
| 不同路径的素材可能重复 | 根据名称和描述建议复用。不将外观相似直接认定为同一资产 |

`update` 用新文件集合替换下一版召回目录中的对应记录。
它不删除历史 CDN 文件。
`review.removed` 列出不再进入新版本的文件。展示这些文件，请用户确认。

## 准备与发布命令

先运行准备命令：

```sh
python3 "$IMPORT_SKILL/scripts/intake.py" prepare \
  --project "$PROJECT_ROOT" --state-dir "$SYNC_DIR" \
  --batch "$DRAFT_DIR/batch.json" --output "$DRAFT_DIR/review.json"
```

`prepare` 只读 OSS，不上传文件。
`review.json` 保存文件 SHA-256、已有本地发布版本、项目契约指纹、目标服务和导入结果。
`batch.json` 和 `review.json` 均不得放在物料目录内。

用户确认后运行发布命令：

```sh
python3 "$IMPORT_SKILL/scripts/intake.py" publish \
  --project "$PROJECT_ROOT" --state-dir "$SYNC_DIR" \
  --batch "$DRAFT_DIR/review.json" --approved-digest "$CONFIRMED_DIGEST" \
  --workers 2
```

两步使用同一 `endpoint` 和 `browser-origin`。
任一值变化后，重新准备并请求确认。
AFTS 和 OSS 密钥仅放在进程环境中，遵循同步 Skill 的约定。

## 账本与恢复

先完成完整库同步，再使用该库已有的规范同步目录。
发布器会核对账本生成的 catalog 与项目入口，避免旧账本覆盖新库。
排他锁覆盖 CDN 上传和入口更新。不要另开状态目录绕过锁。

批次失败后，CDN 可能已有未被引用的文件，旧 catalog 仍然有效。
`pendingIntake` 阻止其他同步任务发布未完成记录。
使用原 `review.json` 和原状态目录重试。

本地来源记录保存在外部 SQLite 的 `local_assets` 表中。
后续 OSS 同步只移除缺失的 OSS 来源记录，不移除本地来源记录。
备份规范账本和本地发布记录。不要换用空账本继续发布。

最多同时处理 2 个资产。每个上传线程只有一个物料临时文件。
临时上传副本在 `finally` 中删除。
原始草稿是否保留，由用户决定。
脚本不自动压缩、重编码或修改用户物料。

## 开发验证

```sh
python3 "$IMPORT_SKILL/scripts/test_intake.py"
python3 "$SYNC_SKILL/scripts/test_sync.py"
```

将 `RETRIEVAL_TEST_PROJECT` 设为目标工作树，并使用项目要求的 Node 版本，可执行真实导入校验。
其他测试使用隔离目录和假的 OSS/CDN，不写正式服务。
