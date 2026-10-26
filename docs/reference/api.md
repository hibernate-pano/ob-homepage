# Home Pages 组件 API 完整参考

来源：`jepicaju862-lab/home-pages` v0.3.1 源码（`src/widgets/types.ts`、`src/widgets/userLoader.ts`、`src/widgets/registry.ts`、`src/api.ts`、`src/view.ts`）。

## 脚本执行环境

插件用 `AsyncFunction` 执行脚本，签名为：

```javascript
new AsyncFunction("module", "exports", "require", "app", "obsidian", source)
```

- `require("obsidian")` → Obsidian API
- 其它 `require(name)` → 尝试 `window.require(name)`，失败返回 `undefined`
- `app`、`obsidian` 也是注入的形参
- 顶层 `await` 可用（函数体即 async）

**没有** `process`、`fs`、Node 内置模块。要读文件系统必须走 `require("fs")`（在 Electron 里通常可用，但仅限脚本沙箱允许的路径）。

## 导出与校验

支持三种写法：

```javascript
module.exports = { ... }              // 推荐
module.exports = { default: { ... } }  // 也行
return { ... }                         // 顶层 return
module.exports = async () => ({ ... }) // 函数，返回对象
```

校验规则（任一不满足 → 加载失败，弹 Notice）：

| 字段 | 规则 | 失败信息 |
|---|---|---|
| `kind` | 非空字符串 | 组件缺少有效的 kind 字段（非空字符串，如 "my-widget"） |
| `name` | 非空字符串 | 组件缺少 name 显示名称 |
| `render` | 函数 | 组件缺少 render(body, ctx) 渲染函数 |

字段缺省时的兜底：

| 字段 | 缺省值 |
|---|---|
| `description` | `""` |
| `icon` | `"box"` |
| `accent` | `"#64748b"` |
| `defaultSize` | `{ w: 6, h: 4 }`（w 钳制 1..12，h 钳制 1..24） |
| `defaultConfig` | `() => ({})` |
| `normalizeConfig` | `undefined`（此时用 `{...defaultConfig(), ...raw}`） |
| `renderSettings` | `() => undefined` |
| `liveRefresh` | `raw.liveRefresh !== false` → 默认 true |

## WidgetContext 完整定义

```typescript
interface WidgetContext<C> {
  app: App;                          // Obsidian App
  plugin: HomePagesPlugin;           // 插件实例（拿 settings / customWidgetManager）
  widget: WidgetInstance;            // 当前卡片实例 { id, kind, title, w, h, config, provider }
  config: C;                         // 已与默认值合并的配置
  component: Component;              // 宿主 Component

  saveConfig(patch: Partial<C>): Promise<void>;  // 写入并持久化；不自动重绘
  rerender(): void;                              // 重绘本卡片
  openPath(path, options?): Promise<void>;       // options: { line, event, newLeaf }
  setSubtitle(text: string): void;               // 标题栏副标题
  addHeaderAction(icon, label, onClick): HTMLElement;
  registerInterval(callback, ms): void;          // 定时器，自动清理
  registerCleanup(callback): void;               // 清理函数
  isAlive(): boolean;                            // 渲染是否仍然有效
  isEditing(): boolean;                          // 是否布局编辑模式
}
```

## WidgetSettingsContext 完整定义

齿轮面板里用的上下文。**操作的是草稿**，用户点「保存」才写回：

```typescript
interface WidgetSettingsContext<C> {
  app: App;
  plugin: HomePagesPlugin;
  config: C;
  update(patch: Partial<C>): void;   // 修改草稿
  refresh(): void;                    // 重绘面板（列表增删后用）
}
```

面板里 `Setting` 的 `ctx.update(...)` 不会立刻生效，只改草稿。

## 生命周期与重绘

```
render(body, ctx)
  ├─ body.empty()            ← 每次 render 都会换成新的空 body
  ├─ 同步渲染
  └─ await 异步加载
       └─ await 之后必须 ctx.isAlive() 检查，否则会写进已被丢弃的 DOM
```

重绘触发时机：

- 库文件 create/modify/delete/rename（扩展名限 `md` `base` `canvas` `duowei` `json`）
- `metadataCache` resolved
- `ctx.rerender()` 手动
- `ctx.saveConfig()` 之后需自己调 `rerender()`

`liveRefresh: false` 的组件不参与「库文件变化自动重绘」（番茄钟用），但手动 `rerender()` 仍有效。

## 卡片 DOM 结构

```html
<div class="hp-card hp-card-{kind}" data-id="...">
  <div class="hp-card-header">
    <div class="hp-card-title">
      <span class="hp-card-grip"></span>
      <span class="hp-card-icon"><svg/></span>
      <span class="hp-card-title-text">标题</span>
    </div>
    <div class="hp-card-header-right">
      <span class="hp-card-subtitle"></span>
      <span class="hp-card-actions"><!-- addHeaderAction 按钮 --></span>
      <button class="hp-card-gear"></button>
    </div>
  </div>
  <div class="hp-card-body"><!-- render 的 body --></div>
</div>
```

`.hp-card` 是 `container-type: size` 容器，可按高度自适应。

## 内置组件 kind（不可覆盖）

`hero` `recent` `quicklinks` `countdown` `pomodoro` `quote` `habit` `kanban` `stats` `onthisday` `note` `duowei` `annotations` `insights` `wechat` `media`

`registerWidget()` 遇到内置 kind 会抛错。

## 宿主 API（第三方插件用，自定义脚本一般用不到）

```typescript
interface HomePagesApi {
  version: 1;
  registerWidget(definition, provider?): () => void;
  listWidgetKinds(): string[];
  pinWidget(kind, config?, options?): Promise<void>;
  refresh(kind?): void;
  openPath: typeof openPath;
  ui: { renderKpi, renderEmpty };
}
```

`app.plugins.plugins["home-pages"].api` 拿得到。`workspace` 事件 `"home-pages:ready"` 参数即 api。

## 常用 Obsidian API（写组件时最常用）

```javascript
const { TFile, TFolder, Notice, Setting, Modal, setIcon, MarkdownRenderer, Component, Keymap, normalizePath, moment } = require("obsidian");
```

- `moment` **是 obsidian 导出的**（`import * as Moment from 'moment'` 再 `export const moment`），可以直接用：`moment().format("YYYY-MM-DD")`
- `window.moment` 也存在
- `app.appId` → 库的稳定 ID（用于隔离 localStorage / IndexedDB）
- `app.vault.configDir` → 通常是 `.obsidian`
- `app.metadataCache.getFileCache(file)` → `{ listItems, headings, frontmatter, ... }`
  - `listItems` 里 `item.task` 存在即该行是任务（值：`" "` 未完成 / `"x"` 完成 / `"/"` 进行中）
  - `item.position.start.line` → 精确行号，**不用读文件就能定位所有任务**

## 核心插件设置读取

```javascript
// 核心 Daily Notes
const opts = app.internalPlugins.getPluginById("daily-notes")?.instance?.options;
// { folder, format, template }
```

其它核心插件同理（`file-recovery` `canvas` `bookmarks` …）。

## 踩过的坑

1. **`obsidian eval` 参数**：必须是 `code=<原始 JS>`。JSON 编码的字符串会被当普通字符串回显而不执行；含 `//` 注释要先剥掉；多行折成一行。
2. **`.obsidian` 里的文件不算库文件**（`getAbstractFileByPath('.obsidian/...')` 返回 null），所以改 `data.json` 不会触发刷新循环。
3. **坚果云/onedrive 同步会刷新文件 mtime**，靠 mtime 判断「今天改过」会误报。
4. **`ctime` 在同步过的库里不可信**（整库笔记共享一个创建日期）。
5. **git 历史常常不可用**（很多用户的库只在某天批量提交过几次）。
6. **文件恢复快照在 IndexedDB `{app.appId}-backup`**，store 名 `backups`，记录 `{path, ts, data}`，索引 `path` 和 `ts`。核心插件默认只保留 7 天（`options.keepDays`）。用 `indexedDB.open(name)` 读之前先 `indexedDB.databases()` 确认库存在，避免误建空库。
7. **读取 IndexedDB 时不要用 `store.getAll()` 全量读**，用 `store.index('ts').getAll(IDBKeyRange.lowerBound(lower))` 限范围，实测 1000+ 行只需几毫秒。
8. **自定义组件的 CSS 不会进插件的 styles.css**，必须自己注入 `<style>`。
9. **组件配置存在 `data.json`**，体积敏感时把大数组放 `localStorage`（key 用 `app.appId` 前缀隔离库）。
10. **`ctx.config` 是合并后的对象**，但 `normalizeConfig` 不存在时是浅合并 —— 数组字段要自己处理。

## 数据写入正确姿势

```javascript
await app.vault.process(file, (content) => {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/g);
  if (lines[record.line] !== record.raw) throw new Error("文件已被修改，请刷新后重试");
  lines[record.line] = lines[record.line].replace(/\[([ xX])\]/, "[x]");
  return lines.join(newline);
});
```

`vault.process` 是原子的，且能检测并发修改。抛错时把错误信息用 `Notice` 弹给用户。
