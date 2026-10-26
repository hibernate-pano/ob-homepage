# 健康打卡 · `user-health-log`

体重、尿酸、血糖的「最近一次 + 快速记录」卡片。

| 项 | 值 |
|---|---|
| 文件 | `health-log.js` |
| kind | `user-health-log` |
| 图标 / 强调色 | `heart-pulse` / `#ec4899` |
| 默认尺寸 | 4×6 |
| 设置面板 | 有 |

## 为什么不做趋势图

历史记录通常比较稀疏，先画图只会得到一条断断续续的线。这个组件的目标是**把记录变成顺手的事**：输入今天的数值，写进当天日记的 frontmatter；数据够了再升级成趋势图。

## 功能

- 显示三个指标的最近一次数值、日期和距今天数。
- 可配置目标值，显示在对应指标下面。
- 三个输入框，回车或点「记录」写进当天日记 frontmatter。
- 没有当天日记时按核心 Daily Notes 模板自动创建。
- 显示近 30 天有记录的天数。

## 数据来源

1. **frontmatter（推荐）**：`weight`、`uric_acid`、`blood_glucose`。
2. **历史正文（兼容）**：
   - `体重：70`
   - `尿酸：400`
   - `血糖值：5.6` / `血糖 5.6`

frontmatter 优先；正文只补齐缺失的指标。

## 写入

```yaml
---
date: 2026-10-26
weight: 70
uric_acid: 400
blood_glucose: 5.6
---
```

通过 `app.fileManager.processFrontMatter()` 写入，保留已有字段。

## 合理范围

| 指标 | 范围 | 单位 |
|---|---|---|
| 体重 | 20–300 | kg |
| 尿酸 | 50–1500 | μmol/L |
| 血糖 | 0.5–50 | mmol/L |

超出范围会拒绝写入并提示。

## 配置

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `folder` | string | `""` | 日记目录；留空跟随核心 Daily Notes |
| `autoCreate` | boolean | `true` | 没有当天日记时自动创建 |
| `targetWeight` | string | `""` | 目标体重；留空不显示 |
| `targetUricAcid` | string | `""` | 目标尿酸；留空不显示 |
| `targetGlucose` | string | `""` | 目标血糖；留空不显示 |

## 实现备注

- 扫描日记按「文件数量 + 最新 mtime + 配置」缓存 60 秒；渲染实测约 100ms。
- 输入草稿存在模块级 `Map`，重绘不丢。
- 回车提交检查 `event.isComposing`，兼容中文输入法。
- 样式注入 id：`hp-user-health-log-style`。
