# Seed 草地并行分支 Rebase 交接手册

## 目的与当前门槛

这份手册只解决一件事：并行任务完成后，把各自的**任务增量**快速搬到已经解决过 `dev/2.0` 冲突的草地基线上，避免每个窗口重复处理同一批冲突。

截至 2026-08-31，当前状态是：

| 项目 | 值 |
| --- | --- |
| 本次集成前的上游基线 | `origin/dev/2.0` = `f4612963538e8805abc537e706775db067cc3eaa` |
| Rebase 前草地共享提交 | `7640545540ae3e5cf0eb2e5b66026c55dfc3c493` |
| 旧草地交接分支 | `origin/codex/seed-grass-stylization-clean` = `0e1741ea0df047244d656615e611eba8c27689f3` |
| 最新 Rebase 后功能提交 | `948e628cf`（包含默认最大 UV Scale） |
| 最终共享基线 | 每次迁移前 fetch，并锁定当时的 `origin/dev/2.0` 完整 SHA |

草地修改已经再次重放到最新 `dev/2.0`，最终目标是 `origin/dev/2.0`，旧 `codex/seed-grass-stylization-clean` 只用于识别其他窗口的历史起点。必须先 fetch，再把 `origin/dev/2.0` 锁定为本次迁移使用的完整 SHA。

这里的“已验收上游基线”是固定快照，不等于以后每次读取到的 `origin/dev/2.0`。迁移时先使用最终草地基线完成本任务验收；如果远端主线又前进，由一个集成窗口统一推进草地基线，不能让每个并行窗口各自重复解决共享冲突。

## 一分钟快速路径

下面这段命令适用于工作树干净、当前分支只在某个已知草地共享头之后增加了自己任务提交的窗口。它会先锁定远端草地基线，再自动选择当前分支包含的最新旧共享头：

```bash
(
test -z "$(git status --porcelain)" || { echo "worktree is dirty; commit or stash it first"; exit 1; }
TASK_BRANCH=$(git branch --show-current)
test -n "$TASK_BRANCH" || { echo "detached HEAD; switch to the task branch first"; exit 1; }

git fetch origin dev/2.0 codex/seed-grass-stylization-clean
FINAL_GRASS_BASE_SHA=$(git rev-parse origin/dev/2.0)

if git merge-base --is-ancestor "$FINAL_GRASS_BASE_SHA" HEAD; then
  echo "already based on $FINAL_GRASS_BASE_SHA"
  exit 0
fi

OLD_SHARED_BASE_SHA=""
for candidate in \
  0e1741ea0df047244d656615e611eba8c27689f3 \
  19e257889bac461a5e35b4f697f981a0eb03e025 \
  e53d963caba46196a98b3db37b1a8b80c4eb010e \
  b5bbdfcaf \
  c28be9920 \
  0ce1f201d1a77471db04a36416f324c656f33325 \
  7640545540ae3e5cf0eb2e5b66026c55dfc3c493
do
  if git merge-base --is-ancestor "$candidate" HEAD; then
    OLD_SHARED_BASE_SHA="$candidate"
    break
  fi
done

test -n "$OLD_SHARED_BASE_SHA" || { echo "unknown shared base; stop and inspect the graph"; exit 1; }
git log --oneline "$OLD_SHARED_BASE_SHA"..HEAD
git rebase --onto "$FINAL_GRASS_BASE_SHA" "$OLD_SHARED_BASE_SHA" "$TASK_BRANCH"
)
```

`git log` 输出必须只包含当前窗口自己的任务提交；如果混有其他共享提交，按后文“分支不包含任何已知共享头”处理，不要继续自动 rebase。

## Rebase 后的提交映射

草地共享提交已经重放到 `f4612963538e8805abc537e706775db067cc3eaa`：

| Rebase 前 | Rebase 后 |
| --- | --- |
| `f1e16a05f` | `430c4f6db` |
| `dd368023f` | `f57bab330` |
| `419004ee1` | `4eb99ed4a` |
| `764054554` | `9922ebdbc` |
| `e53d963ca` | `55a30aa42` |
| `19e257889` | `948e628cf` |

Rebase 后关系必须满足：

```bash
git merge-base --is-ancestor f4612963538e8805abc537e706775db067cc3eaa <FINAL_GRASS_BASE_SHA>
git rev-list --left-right --count f4612963538e8805abc537e706775db067cc3eaa...<FINAL_GRASS_BASE_SHA>
```

第一条应退出为 `0`；第二条左侧应为 `0`。

## 并行窗口迁移的推荐路径

适用条件：任务分支以某一个已知草地共享头为基线，并在它后面增加了自己的提交。

### 1. 先固定任务增量

```bash
git status --short --branch
git merge-base --is-ancestor 0e1741ea0df047244d656615e611eba8c27689f3 HEAD
git merge-base --is-ancestor 19e257889bac461a5e35b4f697f981a0eb03e025 HEAD
git merge-base --is-ancestor e53d963caba46196a98b3db37b1a8b80c4eb010e HEAD
git merge-base --is-ancestor b5bbdfcaf HEAD
git merge-base --is-ancestor c28be9920 HEAD
git merge-base --is-ancestor 0ce1f201d1a77471db04a36416f324c656f33325 HEAD
git merge-base --is-ancestor 7640545540ae3e5cf0eb2e5b66026c55dfc3c493 HEAD
```

从上到下选择第一条成功的命令，其提交就是 `<OLD_SHARED_BASE_SHA>`。然后确认以下日志里只有当前窗口自己的任务提交：

```bash
git log --oneline --decorate <OLD_SHARED_BASE_SHA>..HEAD
```

常见锚点如下：

| 并行窗口从哪里开始 | `<OLD_SHARED_BASE_SHA>` |
| --- | --- |
| 快速交接手册发布后的旧分支头 | `0e1741ea0df047244d656615e611eba8c27689f3` |
| 默认 UV Scale 调整后的已发布功能头 | `19e257889bac461a5e35b4f697f981a0eb03e025` |
| 最终收尾提交 | `e53d963caba46196a98b3db37b1a8b80c4eb010e` |
| 第三次 rebase 后的共享历史头 | `b5bbdfcaf` |
| 第二次 rebase 后的已提交暂存头 | `c28be9920` |
| 第一次 rebase 后的暂存头 | `0ce1f201d1a77471db04a36416f324c656f33325` |
| 最初共享草地头 | `7640545540ae3e5cf0eb2e5b66026c55dfc3c493` |

未提交文件先留在当前工作树；如果必须暂存，使用带任务名的独立 stash，并记录工具返回的 stash 哈希：

```bash
git stash push -u -m "<task-name> before final grass base"
```

不要用 `stash@{0}` 作为长期标识；其他窗口可能同时新增 stash，序号会移动。

### 2. 只重放任务提交

最终草地基线公布后执行：

```bash
git fetch origin dev/2.0 codex/seed-grass-stylization-clean
FINAL_GRASS_BASE_SHA=$(git rev-parse origin/dev/2.0)
git rebase --onto "$FINAL_GRASS_BASE_SHA" <OLD_SHARED_BASE_SHA> <TASK_BRANCH>
```

这条命令替换旧草地基线，只重放 `764054554...` 之后的任务提交。不要直接执行：

```bash
git rebase origin/dev/2.0
```

直接 rebase 到 `dev/2.0` 会让每个窗口再次重放共享草地提交，重复产生已经解决过的冲突。

如果任务提交包含 merge commit，使用同一个边界并增加 `--rebase-merges`：

```bash
git rebase --rebase-merges --onto <FINAL_GRASS_BASE_SHA> <OLD_SHARED_BASE_SHA> <TASK_BRANCH>
```

### 3. 恢复未提交修改

如果第 1 步创建了 stash，用记录下来的哈希精确恢复：

```bash
git stash apply <RECORDED_STASH_HASH>
```

检查无误后再删除同一个 stash；不得清理或改动其他窗口的 stash。

## 分支不包含任何已知共享头时

不要猜 `--onto` 的旧边界。先检查：

```bash
git log --graph --oneline --decorate --boundary --all --max-count=80
```

- 若分支已经自行 rebase、混入了别的共享提交或旧边界不在祖先链上，新建一个以 `<FINAL_GRASS_BASE_SHA>` 为起点的临时分支，并只 cherry-pick 已确认的任务提交。不要用大范围文件拷贝覆盖基线。
- 无法明确区分“共享草地提交”和“任务提交”时，停止迁移并在原窗口列出提交图；这不是适合自动选择冲突一侧的场景。

## 已解决冲突的语义所有权

再次出现以下冲突时，以这些语义为准，不以 `ours` 或 `theirs` 为准：

| 文件/区域 | 必须同时保留的结果 |
| --- | --- |
| `index.html` / `styles.css` / `main.ts` | 保留 `89ad7c2cc` 的精简页面控制、`96c687877` 的湖岸岩石入口与 `45f7a0dc6` 的 1729 相机预设，同时保留草地共享调色和 `Grass Density / 草密度` 运行时绑定 |
| `SeedWorldPopulationPlan.ts` | `riparianVegetationWeight` 保持最新上游的 `Float32Array`；`roadVegetationWeights` 为可选；草不叠加第二条道路清退曲线；草在岩石覆盖区保持连续覆盖语义 |
| `SeedWorldTerrainRuntime.ts` | 创建期间 `root.isActive = false`、分帧 yield，以及 GrassColorField 纹理的创建、所有权、失败清理和销毁 |
| `generate-seed-world-assets.mjs` | 同时保留湖岸岩石资源生成与草簇模型、Prefab、两张 R8 的权威重建；不能恢复为手工放在 `public/` 下的孤立资源 |
| `production-catalog.json` | 同时包含 `cartoon/rock/rock-clif-1/v1` 与 `cartoon/grass/cluster/v1`，并由生成器重建 |
| Terrain/Grass Shader | 两个 Shader 继续独立；只共享世界空间颜色场和表面求值契约；Grass 仅使用真实 Terrain Normal 与风场法线偏移 |
| 草实例控件 | `Road & Grass` 暴露 0–2 密度倍率及 0.1–2m Min/Max Height；Reset 恢复密度 1 与 0.32–1.71m 默认高度 |

## 生成文件规则

以下 `*.shaderc` 是生成物，不能手工挑选冲突块：

```text
world/gallery/demos/terrain/data/seed-world/public/Shader/Grass.shaderc
world/gallery/demos/terrain/data/seed-world/public/Shader/Terrain.shaderc
```

正确顺序是：

1. 先合并 `shaders/**/*.shader` 与 `shaders/**/*.glsl` 源文件；
2. 合并离线资源生成器，运行它重建草与湖岸岩石目录；
3. 删除生成文件的冲突标记；
4. 重新物化并构建，让编译器生成 `shaderc`；
5. 用 `git diff --check` 确认没有残留冲突。

```bash
node world/gallery/demos/terrain/asset-assembly/offline/generate-seed-world-assets.mjs
pnpm -C world engine:prepare
pnpm -C world engine:install
node world/scripts/run-engine.mjs pnpm b:module
node world/scripts/run-engine.mjs pnpm b:types
pnpm -C world typecheck
pnpm -C world test:terrain
git diff --check
```

生成后至少检查：

```bash
git status --short
git diff -- world/gallery/demos/terrain/data/seed-world/public/production-catalog.json
```

如果生成器删除 `public/atoms/grass.glb`、`public/prefabs/grass.prefab` 或两张 Grass R8，说明资源所有权再次断开，不能继续验收。

## 固定验收协议

迁移后的任务必须先用同一世界确认草地基线没有被冲突处理破坏，再验收任务自己的变化：

```text
Seed: 1729
Height: 129
Alpha: 128
Grass Density: 1
```

固定入口模板：

```text
http://127.0.0.1:<PORT>/demos/terrain/seed-world-planner/index.html?g=1729&h=0&debug=1&height=129&alpha=128
```

最低检查项：

1. 控制台无 Shader 编译、ShaderProperty 分组、资源 404 或世界生成失败；
2. `Road & Grass / 道路与草地` 位于顶层，草密度默认值为 `1`，Reset 能恢复 `1`；
3. 地形草区与草根仍共享颜色场，泥土不受 Grass A/B 影响；
4. Terrain 与 Grass 都受直接光、环境光和树影影响；
5. 道路边缘没有因冲突恢复旧的第二条草清退曲线；
6. 再检查并行任务自己的固定视角与交互。

## Push 规则

- `origin/dev/2.0` 是最终共享基线；旧 `origin/codex/seed-grass-stylization-clean` 只用于识别历史起点。
- 视觉结果仍由用户验收，手册不宣称视觉通过。
- 并行分支完成上述迁移和固定验收后再 normal push。
- 不 force-push 共享历史。
- 不把本机 stash、临时 worktree、端口或调试截图当成交付内容。

并行窗口按以下顺序使用当前迁移门槛：

1. fetch 并锁定完整 `<FINAL_GRASS_BASE_SHA>`；
2. 识别本任务的 `<OLD_SHARED_BASE_SHA>`，确认增量日志只含自己的提交；
3. 按两个锚点执行 `--onto`，解决任务自身冲突；
4. 重跑固定 Seed、类型检查、草地定向测试与任务测试；
5. 仍由用户在各任务分支做视觉验收，最后 normal push。

截至本手册记录时，精确 `dev/2.0` 基线完整测试为 `14 failed files / 17 failed tests`，属于主线既有失败；草地分支必须与这个失败集合保持一致，且草地、资源生成器和类型检查的定向门槛必须全绿。不能把“完整测试不是全绿”误报成草地回归，也不能新增第 18 个失败后仍称为等价。
