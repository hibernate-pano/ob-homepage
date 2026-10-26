# 在读清单 · `user-reading`

显示最近真正在读的书，而不是把几十本「在读」全堆出来。

| 项 | 值 |
|---|---|
| 文件 | `reading.js` |
| kind | `user-reading` |
| 图标 / 强调色 | `book-open` / `#14b8a6` |
| 默认尺寸 | 6×6 |
| 设置面板 | 有 |

## 功能

- 从书籍笔记的 frontmatter 读取在读状态、进度、最后阅读日期和封面。
- 默认只显示最近 180 天翻过的书，按最后阅读日期倒序。
- 每行显示封面、书名、作者、进度条、百分比和距今天数。
- 点击打开对应的书摘笔记。
- 只读，不写任何笔记。

## 数据源

书籍笔记 frontmatter：

| 字段 | 用途 |
|---|---|
| `readingStatus` | `"2"` = 在读，`"4"` = 已读 |
| `progress` | `"64%"` / `"100%"` / `"-1"`（未知） |
| `lastReadDate` | `YYYY-MM-DD` |
| `cover` | 封面 URL |
| `title` / `author` | 书名 / 作者 |

默认目录 `收藏/书籍`，兼容微信读书插件生成的 `doc_type: weread-highlights-reviews`。

## 配置

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `folder` | string | `收藏/书籍` | 书籍笔记目录 |
| `limit` | number | `3` | 显示几本（1–8） |
| `maxAgeDays` | number | `180` | 只看最近多少天读过的；0 = 不限 |

## 实现备注

- 走 `metadataCache.getFileCache(file).frontmatter`，不读文件正文，渲染开销很低。
- 最近窗口里没有书时，自动回退显示全部在读，避免卡片空白。
- 封面加载失败时回退成书本图标。
- 样式注入 id：`hp-user-reading-style`。
