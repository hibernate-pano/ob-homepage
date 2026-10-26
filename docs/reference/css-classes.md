# 可复用的 `.hp-*` 类名清单

来自插件 `styles.css`（v0.3.1，共 330 个类）。**优先复用这些**，视觉自动跟随主题。

## 通用容器 / 空状态

| 类 | 用途 |
|---|---|
| `hp-empty` | 空状态容器（flex 居中） |
| `hp-empty-icon` | 空状态图标（40×40 圆角方块） |
| `hp-empty-text` | 空状态文字（max-width 320px） |
| `hp-list` | 通用可滚动列表（flex:1, overflow-y:auto, padding 6px 10px） |
| `hp-list-row` | 列表行（flex, gap 10px, 底部边框） |
| `hp-list-row.is-clickable` | 可点击行（悬停高亮） |
| `hp-list-icon` | 行首图标（26×26 圆角方块，强调色底） |
| `hp-list-text` | 行文字容器（flex:1, min-width:0） |
| `hp-list-title` | 行标题（单行省略） |
| `hp-list-sub` | 行副标题（11px 灰） |
| `hp-list-meta` | 行右侧元信息（11px 灰，等宽数字） |
| `hp-list-year` | 年份徽章 |
| `hp-list-year-icon` | 年份徽章图标 |

## 按钮 / 药丸

| 类 | 用途 |
|---|---|
| `hp-pill` | 小圆角按钮（padding 2px 11px，11px 粗体） |
| `hp-pill.is-active` | 选中态（用 `--hp-pomo-color` 背景） |
| `hp-button` | 通用按钮（padding 6px 14px，13px 粗体） |
| `hp-button-quiet` | 次要按钮（中性背景） |
| `hp-button-icon` | 按钮内图标（14×14） |
| `hp-segmented` | 分段控件容器（圆角药丸底） |
| `hp-segment` | 分段控件单项 |
| `hp-filter-row` | 筛选行（flex wrap, gap 6px） |
| `hp-danger` | 危险操作样式 |

## KPI 磁贴

| 类 | 用途 |
|---|---|
| `hp-kpis` | 磁贴行（grid auto-fit minmax(96px,1fr)） |
| `hp-kpi` | 单个磁贴（--hp-tone 决定配色） |
| `hp-kpi.is-clickable` | 可点击磁贴 |
| `hp-kpi-icon` | 磁贴图标 |
| `hp-kpi-value` | 大数字（22px 800 字重，等宽） |
| `hp-kpi-label` | 说明文字（10.5px 灰） |
| `hp-tone-0` ~ `hp-tone-3` | 四档配色：蓝 / 青 / 琥珀 / 粉 |
| `hp-stat` `hp-stat-value` `hp-stat-label` | 旧版统计磁贴 |
| `hp-stats` | 旧版统计容器 |

## 卡片 / 标题栏

| 类 | 用途 |
|---|---|
| `hp-card` | 卡片（container-type:size） |
| `hp-card-body` | 卡片内容区（flex 列，overflow hidden）— render 的 body |
| `hp-card-header` | 标题栏 |
| `hp-card-title` / `hp-card-title-text` | 标题文字 |
| `hp-card-icon` | 标题图标 |
| `hp-card-subtitle` | 标题栏副标题（`ctx.setSubtitle` 写入） |
| `hp-card-actions` | 标题栏按钮容器（`ctx.addHeaderAction`） |
| `hp-card-action` | 单个标题栏按钮 |
| `hp-card-gear` | 齿轮按钮（打开设置） |
| `hp-card-grip` | 拖拽手柄 |
| `hp-card-resize` | 右下角缩放手柄 |
| `hp-card-editbar` | 编辑模式工具条 |
| `hp-card-size-badge` | 编辑模式尺寸徽章 |

## Markdown / 内容

| 类 | 用途 |
|---|---|
| `hp-note` | markdown 渲染容器（flex:1, overflow:auto, 13.5px） |
| `hp-note-open` | 底部「打开笔记 ↗」链接条 |
| `hp-quote` `hp-quote-text` `hp-quote-source` `hp-quote-footer` `hp-quote-shuffle` | 每日一言 |
| `hp-section`（无） | — |

## 待办 / 看板

| 类 | 用途 |
|---|---|
| `hp-kanban` | 看板网格 |
| `hp-kanban-column` `hp-kanban-column.is-doing` `hp-kanban-column.is-done` | 三列（待办/进行中/已完成），顶部 3px 强调色 |
| `hp-kanban-head` | 列头 |
| `hp-kanban-list` | 列内任务列表 |
| `hp-kanban-card` | 任务卡片（可拖拽） |
| `hp-kanban-check` | 圆形勾选按钮（18×18） |
| `hp-kanban-check.is-done` | 已完成态 |
| `hp-kanban-content` `hp-kanban-title` `hp-kanban-meta` | 任务文字 / 标题 / 元信息 |
| `hp-kanban-meta.is-overdue` `hp-kanban-meta.is-today` | 逾期 / 今天 |
| `hp-kanban-open` | 卡片内跳转按钮 |
| `hp-kanban-add` `hp-kanban-add-btn` `hp-kanban-input` | 内联新增待办（输入框 + 加号按钮） |
| `hp-kanban-empty` | 空列提示 |

## 习惯打卡 / 热力图

| 类 | 用途 |
|---|---|
| `hp-habit` | 容器（`--hp-cell` 格子尺寸，默认 13px） |
| `hp-habit-cal` | 日历横向滚动容器 |
| `hp-habit-dow` `hp-habit-dow-label` | 左侧星期列 |
| `hp-habit-cal-right` | 右侧（月份行 + 网格） |
| `hp-habit-month-row` `hp-habit-month-label` | 月份标签行 |
| `hp-habit-grid` | 网格（grid-auto-flow:column，7 行） |
| `hp-habit-cell` | 格子（`--hp-cell` 方形） |
| `hp-habit-cell.is-empty` | 空占位（透明） |
| `hp-habit-cell.level-1` ~ `.level-4` | 四档绿色（rgba 34,197,94 0.32/0.54 → 21,128,61 0.96） |
| `hp-habit-cell.is-today` | 今天（2px 强调色描边） |
| `hp-habit-popover` `hp-habit-popover-title` `hp-habit-popover-row` | 弹出层 |
| `hp-habit-today` `hp-habit-today-label` `hp-habit-chip` `hp-habit-chip-icon` | 今日打卡行 |
| `hp-habit-streak` `hp-habit-streak-icon` | 连续天数徽章 |
| `hp-habit-toolbar` | 工具条 |

## 天气 / 倒计时 / 番茄钟

| 类 | 用途 |
|---|---|
| `hp-hero` `hp-hero-top` `hp-hero-left` `hp-hero-greeting` `hp-hero-greeting-icon` | 欢迎横幅 |
| `hp-hero-name` `hp-hero-clock` `hp-hero-clock-seconds` `hp-hero-clockbox` `hp-hero-date` | 横幅内容 |
| `hp-hero-meta` `hp-hero-meta-item` `hp-hero-meta-icon` | 统计小项 |
| `hp-hero-chip` `hp-hero-chip-icon` `hp-hero-chips` | 徽章 |
| `hp-hero-weather` `hp-hero-weather-icon` `hp-hero-weather-line` `hp-hero-weather-meta` `hp-hero-weather-temp` `hp-hero-weather-text` | 天气 |
| `hp-countdown` `hp-countdown-value` `hp-countdown-num` `hp-countdown-unit` `hp-countdown-label` `hp-countdown-note` | 倒计时 |
| `hp-pomo` `hp-pomo-main` `hp-pomo-ring` `hp-pomo-time` `hp-pomo-status` `hp-pomo-btn` `hp-pomo-primary` `hp-pomo-task` `hp-pomo-dots` `hp-pomo-dot` `hp-pomo-track` `hp-pomo-bar` `hp-pomo-center` `hp-pomo-side` `hp-pomo-controls` `hp-pomo-count` `hp-pomo-rounds` `hp-pomo-phases` | 番茄钟 |

## 弹窗 / 设置

| 类 | 用途 |
|---|---|
| `hp-modal` | 弹窗容器（宽 min(680px, 92vw)） |
| `hp-modal-body` | 弹窗内容（可滚动） |
| `hp-modal-footer` | 底部按钮条 |
| `hp-modal-section` | 内容区小标题 |
| `hp-json-area` | 代码/JSON 文本域 |
| `hp-paste-error` | 粘贴错误提示 |
| `hp-settings-heading` | 设置分组标题 |
| `hp-setting-input-narrow` `hp-setting-input-wide` `hp-setting-textarea` | 设置输入框宽度 |
| `hp-suggest-path` `hp-suggest-title` | 路径联想 |
| `hp-delete-meta` | 删除确认信息 |

## 其它

| 类 | 用途 |
|---|---|
| `hp-tabs` `hp-tab` `hp-tab-add` | 页面标签栏 |
| `hp-toolbar` `hp-toolbar-actions` `hp-toolbar-hint` `hp-toolbar-hint-icon` | 工具条 |
| `hp-grid` `hp-grid-empty` `hp-grid-empty-icon` | 首页网格 |
| `hp-add-grid` `hp-add-card` `hp-add-card-user` `hp-add-card-paste` `hp-add-icon` `hp-add-text` `hp-add-name` `hp-add-name-row` `hp-add-desc` `hp-add-card-custom-tag` `hp-add-card-del` `hp-add-topbar` `hp-add-topbar-text` | 「添加组件」弹窗 |
| `hp-quicklinks` `hp-quicklink` `hp-quicklink-icon` `hp-quicklink-label` | 快捷入口 |
| `hp-wechat` `hp-wechat-list` `hp-wechat-item` `hp-wechat-text` `hp-wechat-meta` `hp-wechat-time` `hp-wechat-kind` `hp-wechat-icon` `hp-wechat-toolbar` `hp-wechat-content` `hp-wechat-done` `hp-wechat-status` | 微信收件 |
| `hp-annot-*` | 批注与复习 |
| `hp-media-*` | 主流媒体 / RSS |
| `hp-duowei-chip` `hp-duowei-chips` `hp-duowei-embed` `hp-duowei-warn` | 多维表格 |
| `hp-insight-*` `hp-insights` | 聚合信息流 |
| `hp-root` `hp-view` | 根容器 |
| `hp-sort-ghost` `hp-resize-frame` | 拖拽排序 / 缩放 |
| `hp-pin-editor*` | 快捷入口编辑器 |
| `hp-count` | 计数徽章 |

## CSS 变量

| 变量 | 值 |
|---|---|
| `--hp-accent` | 卡片强调色（每张卡片独立，由组件 `accent` 决定） |
| `--hp-border` | 边框色 |
| `--hp-card-bg` | 卡片背景 |
| `--hp-muted` | 弱化文字色（= `var(--text-muted)`） |
| `--hp-text` | 正文色 |
| `--hp-radius` `--hp-shadow` | 圆角 / 阴影 |
| `--hp-cell` | 热力图格子尺寸（`hp-habit` 容器内定义，默认 13px） |
| `--hp-row` `--hp-gap` `--hp-max-width` | 首页网格行高 / 间距 / 最大宽度 |
