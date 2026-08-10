# SBX Safe Script Templates

这些模板用于 sandbox / SBX 任务。目标是让脚本通过当前 agent 提供的 validated script-mutation boundary 注册、被 verify 看到，并避开当前 source-v2 最常见的运行时/类型幻觉。

## 硬规则

- 用 `export default class X extends Script`，不要 `export class X`。
- `onAwake/onStart/onEnable/onDisable/onUpdate/onCollisionEnter` 等生命周期回调要保持 public：省略访问修饰符即可，不要写成 `private` 或 `protected`。
- 新建脚本使用 `action:"create"` + 完整 `code`；修复已存在脚本使用 `action:"update"` + focused edits，只有确需整体替换时才提交完整源码。
- 不要把 `src/scripts/*.ts` 当主路径；verify 出现 `no scripts found, skipping` 不是成功。
- 不要从 `@galacean/engine` import `Button`，不要 `getComponent(Button)`。
- 不要从 `@galacean/engine` import `Text`，不要 `getComponent("Text" as any)`；需要更新 UI 文本时，从 `@galacean/engine-ui` import `Text`，再 `getComponent(Text)`。
- `Collision` 里没有 `collider` / `otherCollider`，取对方实体用 `collision.shape.collider.entity`。
- 脚本创建、修复、挂载和 props 的当前 payload 以 validated script-mutation boundary 与 `editor_api` 为准；复用 mutation 返回的 canonical path 和同一事务产生的稳定 id，不要自行拼字段。不要写 `@property` / `@serializable` decorator。
- 空格键是 `Keys.Space`，不是 `Keys.KeySpace`；字母 X 是 `Keys.KeyX`；根实体用 `this.scene.rootEntities`，不是 `getRootEntities()`。
- `InputManager` 没有 `isKeyPressed`；单帧按下用 `isKeyDown(Keys.KeyX)`，持续移动用 `isKeyHeldDown(Keys.KeyX)`，抬起用 `isKeyUp(Keys.KeyX)`。
- verify 报 `src/scripts/Foo.ts` 是 build 视图。找 source asset path 后，通过 validated script-mutation boundary 更新原资产。
- 不要自造 `script.get` 或借通用 asset writer 修改 TS；脚本读取和 mutation 都走当前 agent 暴露的 validated script boundary。
- verify 失败后不要重跑 setup helper（会产生重复脚本）。通过 validated script-mutation boundary 修复原脚本 asset，必要时删除重复脚本。
- 避免 `inputManager.pointerPosition`、`pointer.isDown`、`camera.screenToWorldPoint(pointer, out)` 这类易错 API；`pointer.position` 是 `Vector2`，不能直接传给 `screenToWorldPoint`。SBX 里点击/发射用 `input.isPointerDown()`；需要拖拽时优先用 `engine.inputManager.pointers` + `PointerPhase`，水平拖拽可直接映射到一个 clamped gameplay x 值。确实需要屏幕转世界时，用 `new Vector3(pointer.position.x, pointer.position.y, depth)` 和 out `Vector3`。
- 不要在 SBX runtime 脚本里用 `this.engine.resourceManager.getResourceByRef(...)`；verify 环境的 `ResourceManager` 没有这个方法。材质/mesh/texture 优先在 CLI setup 阶段绑定好，runtime 只做激活、位移、物理力、显隐和分数逻辑。
- Editor `.mat` 资产绑定到 Script 属性后，在运行时按 `Material | null` 使用；不要声明成 `PBRMaterial`、不要对 `renderer.getInstanceMaterial()` 做 `as PBRMaterial`，也不要读取 `baseColor/baseTexture`。需要改通用材质参数时，先取得并判空 `Material`，再写 `material.shaderData.setColor("material_BaseColor", color)` 或 `setTexture("material_BaseTexture", texture)`，最后通过 Renderer 的 `setMaterial` 保留实例。
- Script 挂载复用 mutation 返回的 canonical path；具体挂载字段必须通过当前 `editor_api` 查询，不保留静态 payload 副本。
- 缓存组件字段写成 nullable：`private body: DynamicCollider | null = null;`，`onStart(){ this.body = this.entity.getComponent(DynamicCollider); }`。不要写未初始化的 `private body: DynamicCollider;`。
- `Entity` 的销毁标志是 `destroyed`，不是 `isDestroyed`。
- 不要在 runtime 脚本里 `new Entity` / `new PBRMaterial` / `new BoxColliderShape` / `this.engine.meshPrimitive.createCuboid()`。SBX eval 中把可复用方块/子弹/敌人实体池放在 CLI setup 阶段创建好，runtime 只激活、定位、施力、回收。
- 不要用 `declare class Foo extends Script` 后再 `getComponent(Foo)`；这只是类型声明，不保证运行时类值。跨脚本协作要 `import Foo from "./Foo"`，再用 `entity.getComponent(Foo)`。
- 不要写独立 `setup-bindings.js`。Entity/Component 字段优先在同一 Editor construction transaction 中用当前 schema 支持的结构化引用绑定；没有稳定引用时才把字段写成 nullable 并在 `onStart` 中按名称赋值。
- `getComponents` 需要 out array：`const scripts: Script[] = []; entity.getComponents(Script, scripts);`。不要写 `entity.getComponents(Script)`。
- 不要用 `this.engine.Text`、`getComponent(this.engine.Text)` 或字符串 `"Text"` 更新 UI 文本；从 `@galacean/engine-ui` import `Text` 后按类引用取组件。
- 每个用到键盘的脚本都要 `import { Keys } from "@galacean/engine"`；不要在未 import 的脚本里直接写 `Keys.Space`。
- 切换场景从脚本实例走 `this.engine.sceneManager.loadScene("Scenes/foo.scene")`。这里使用 build manifest 注册的 runtime virtual path，不是 Editor canonical path `/Scenes/foo.scene`；不要写 `this.scene.loadScene(...)`，也不要把 `SceneManager.loadScene(...)` 当静态 API。
- `sceneManager.loadScene(...)` 返回 `AssetPromise<Scene>`；加载进度直接用 `.onProgress((loaded, total) => ...)`。不要为了确认这两个稳定签名扫描依赖声明。
- 序列化 UI 点击回调是 Script 的 public 实例方法；需要事件对象时从 `@galacean/engine` 导入 `PointerEventData`。按钮的接收者、方法名和可选字符串参数仍由 Editor 的 typed listener contract 绑定。
- 脚本里声明或使用 `Entity` 字段/参数时，必须从 `@galacean/engine` import `Entity`；不要依赖全局类型。

## 最小管理器脚本

```ts
import { Entity, Script } from "@galacean/engine";

export default class GameManager extends Script {
  private gameOverPanel: Entity | null = null;
  private scoreLabel: Entity | null = null;

  onStart() {
    this.gameOverPanel = this.scene.findEntityByName("GameOverPanel");
    this.scoreLabel = this.scene.findEntityByName("ScoreLabel");
    if (this.gameOverPanel) this.gameOverPanel.isActive = false;
  }

  showGameOver() {
    if (this.gameOverPanel) this.gameOverPanel.isActive = true;
    const gameOverText = this.scene.findEntityByName("GameOverText");
    const restartButton = this.scene.findEntityByName("RestartButton");
    const restartButtonText = this.scene.findEntityByName("RestartButtonText");
    if (gameOverText) gameOverText.isActive = true;
    if (restartButton) restartButton.isActive = true;
    if (restartButtonText) restartButtonText.isActive = true;
  }
}
```

## 最小事件总线

```ts
import { Script } from "@galacean/engine";

type Handler<T = unknown> = (payload?: T) => void;

export default class EventBus extends Script {
  private static listeners: Record<string, Handler[]> = {};

  static on(eventName: string, handler: Handler): void {
    (this.listeners[eventName] ||= []).push(handler);
  }

  static off(eventName: string, handler: Handler): void {
    const list = this.listeners[eventName];
    if (!list) return;
    this.listeners[eventName] = list.filter((item) => item !== handler);
  }

  static dispatch<T = unknown>(eventName: string, payload?: T): void {
    for (const handler of this.listeners[eventName] ?? []) handler(payload);
  }
}
```

## 最小移动脚本

```ts
import { Keys, Script } from "@galacean/engine";

export default class PlayerController extends Script {
  speed = 4;

  onUpdate(deltaTime: number) {
    const input = this.engine.inputManager;
    let dx = 0;
    let dz = 0;
    if (input.isKeyHeldDown(Keys.KeyA)) dx -= 1;
    if (input.isKeyHeldDown(Keys.KeyD)) dx += 1;
    if (input.isKeyHeldDown(Keys.KeyW)) dz -= 1;
    if (input.isKeyHeldDown(Keys.KeyS)) dz += 1;
    this.entity.transform.translate(dx * this.speed * deltaTime, 0, dz * this.speed * deltaTime);
  }
}
```

## 最小点击发射脚本

```ts
import { DynamicCollider, Keys, Script, Vector3 } from "@galacean/engine";

export default class Launcher extends Script {
  private cooldown = 0;

  onUpdate(deltaTime: number) {
    this.cooldown -= deltaTime;
    const input = this.engine.inputManager;
    if (this.cooldown > 0) return;
    if (input.isPointerDown() || input.isKeyDown(Keys.Space)) {
      this.cooldown = 0.4;
      this.fireFromLauncher();
    }
  }

  private fireFromLauncher() {
    const projectile = this.scene.findEntityByName("Projectile_0");
    if (!projectile) return;
    projectile.isActive = true;
    projectile.transform.position = this.entity.transform.position.clone();
    const body = projectile.getComponent(DynamicCollider);
    body?.applyForce(new Vector3(0, 120, -420));
    body?.applyTorque(new Vector3(40, 20, 10));
  }
}
```

## 最小碰撞脚本

```ts
import { Collision, Script } from "@galacean/engine";

export default class Bullet extends Script {
  onCollisionEnter(collision: Collision) {
    const other = collision.shape.collider.entity;
    if (other.name.includes("Enemy")) {
      other.destroy();
      this.entity.destroy();
    }
  }
}
```
