# 笔记活跃 · `user-note-activity`

GitHub 风格的笔记活跃热力图。

| 项 | 值 |
|---|---|
| 文件 | `note-activity.js` |
| kind | `user-note-activity` |
| 图标 / 强调色 | `layout-grid` / `#16a34a` |
| 默认尺寸 | 6×6 |
| 设置面板 | 无（范围在卡片顶部切换） |

## 功能

- 热力图展示最近 12 周 / 26 周 / 52 周的活跃情况。
- 某天改过任意笔记就算一次活跃；同一篇笔记同一天只算一次。
- 顶部 KPI：今天编辑的笔记数、连续活跃天数、活跃天数。
- 点击某天弹出当天改过的笔记列表，可直接打开。
- 打开时自动滚到最右侧（今天）。

## 配置

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `range` | `"12w" \| "26w" \| "52w"` | `"52w"` | 显示范围 |

范围切换按钮会调用 `ctx.saveConfig({ range })` 后重绘。

## 数据来源（两路合并）

1. **笔记 mtime**：`app.vault.getMarkdownFiles()` 的 `stat.mtime`，覆盖全部历史。
2. **核心「文件恢复」快照**：读 `${app.appId}-backup` 这个 IndexedDB 的 `backups` store，取最近 30 天记录。能反映一天内多次编辑，但核心插件本身只保留约 7 天。

两路结果取并集，合并进历史后只增不减。

## 存储

- 每天的数量写进组件配置（`data.json`），超过 420 天（`KEEP_DAYS`）的旧数据丢弃。
- 每天的**路径明细**放在 `localStorage`，按库隔离（key 前缀 `app.appId`），避免 `data.json` 因上千条路径膨胀。
- 只有合并结果变化时才写回，避免每次渲染都改配置。

## 实现备注

- 异步采集完会先 `ctx.isAlive()` 再操作 DOM。
- 弹层挂在 `document.body`，用 `ctx.registerCleanup` 在重绘/卸载时关闭并移除监听。
- 样式注入 id：`hp-user-note-activity-style`。
