# ob-homepage

Obsidian **Home Pages** 插件的自定义组件源码集。

- 插件：[`jepicaju862-lab/home-pages`](https://github.com/jepicaju862-lab/home-pages)（v0.3.1，作者 peyote.info）
- 插件加载目录：库内 `_scripts/home-pages/`（在插件设置「自定义组件目录」里配置）
- 本仓库：组件源码的**唯一维护入口**，改完再部署到库里

## 目录结构

```
.
├── widgets/                  # 一个组件一个目录
│   ├── daily-note/
│   │   ├── daily-note.js     # 组件源码（自包含）
│   │   └── README.md         # 这个组件做什么、怎么配置
│   ├── quick-note/
│   ├── all-tasks/
│   └── note-activity/
├── templates/widget.js       # 新组件起点模板
├── scripts/
│   ├── validate.mjs          # 校验组件契约（不碰库）
│   └── deploy.mjs            # 把组件平铺复制到库的加载目录
├── docs/reference/           # Home Pages 组件 API / 样式类 / 实现范式
├── home-pages.config.json    # 本机库路径（已 gitignore）
└── package.json
```

## 当前组件

| 目录 | kind | 名称 | 作用 | 默认尺寸 |
|---|---|---|---|---|
| [`daily-note`](widgets/daily-note/README.md) | `user-daily-note` | 今日日记 | 打开当天日记，在首页添加 / 勾选待办 | 4×6 |
| [`quick-note`](widgets/quick-note/README.md) | `user-quick-note` | 快速记录 | 带时间戳的流水记录，写进当天日记 | 4×6 |
| [`all-tasks`](widgets/all-tasks/README.md) | `user-all-tasks` | 全部待办 | 汇总全库待办，可勾选、可限定来源 | 4×8 |
| [`note-activity`](widgets/note-activity/README.md) | `user-note-activity` | 笔记活跃 | GitHub 风格活跃热力图 + 连续天数 | 6×6 |

## 日常用法

```bash
# 1. 校验所有组件（静态加载，不执行 render，不碰库）
npm run validate

# 2. 看仓库和库里的差异，不写文件
npm run deploy:dry

# 3. 部署全部组件到库；插件会热重载
npm run deploy

# 4. 只部署某几个
npm run deploy -- daily-note quick-note
```

`home-pages.config.json` 只在本机存在：

```json
{
  "vault": "~/path/to/your/obsidian-vault",
  "customWidgetsFolder": "_scripts/home-pages"
}
```

换机器时复制 `home-pages.config.example.json` 再改库路径即可。

## 新增一个组件

```bash
mkdir widgets/my-widget
cp templates/widget.js widgets/my-widget/my-widget.js
```

然后：

1. 改 `kind` 为 `user-my-widget`（必须 `user-` 前缀，不能撞内置 kind）。
2. 改 `name` / `description` / `icon` / `accent` / `defaultSize`。
3. 写 `render(body, ctx)`；需要设置项就写 `renderSettings(container, ctx)`。
4. 给目录补一个 `README.md`：kind、配置项、读写哪些文件、数据来源。
5. `npm run validate`，再 `npm run deploy -- my-widget`。

## 组件契约（硬性约束）

- **一个文件 = 一个组件**。`module.exports` 只能导出一个组件对象。
- **每个文件必须自包含**。插件把加载目录下每个 `.js` 都当组件加载，不能放共享 helper（会被当成组件加载然后报错）。多个组件共用的逻辑只能复制，并在文件头注明来源。
- **只能用 `require("obsidian")`**，其他模块在沙箱里拿不到。
- **`await` 之后必须查 `ctx.isAlive()`**，否则可能往已被替换的 DOM 里写。
- **改笔记用 `app.vault.process(file, fn)`**（原子写入）；改行前先校验原内容，不一致就报错让用户刷新。
- **定时器用 `ctx.registerInterval`**，不要裸 `setInterval`。
- **样式自己注入 `<style>`**（固定 id 防重复），优先复用插件的 `.hp-*` 类。
- **中文输入**：`keydown` 里检查 `event.isComposing`，否则拼音选词回车会误提交。
- 部署到库时统一平铺为 `<slug>.js`；插件本身支持递归扫描子目录，但仓库目录结构与库内加载目录不要求一致。

完整 API、校验规则和常用套路见：

- [`docs/reference/api.md`](docs/reference/api.md)
- [`docs/reference/css-classes.md`](docs/reference/css-classes.md)
- [`docs/reference/patterns.md`](docs/reference/patterns.md)

> `docs/reference/` 与 `templates/widget.js` 复制自本机的 `home-pages-widget` skill（`~/.config/magpie/library/skills/home-pages-widget/`）。插件升级后以插件源码和该 skill 为准。
