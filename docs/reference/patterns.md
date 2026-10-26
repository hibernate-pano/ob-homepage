# 常用实现范式

都是本机实测过的写法。

## 1. 写文件（原子 + 防并发覆盖）

```javascript
async function writeLine(app, file, line, expected, next) {
  await app.vault.process(file, (content) => {
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/g);
    if (lines[line] !== expected) throw new Error("文件已被修改，请刷新后重试");
    lines[line] = next;
    return lines.join(newline);
  });
}
```

按内容定位（不知道行号时）：把 `expected` 那几行整块拿去比对，命中唯一位置才改，否则抛错。

```javascript
function replaceBlock(content, block, replacement) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/g);
  const target = block.split(/\r?\n/g);
  const hits = [];
  for (let i = 0; i + target.length <= lines.length; i++) {
    if (target.every((l, j) => lines[i + j].replace(/\r$/, "") === l.replace(/\r$/, ""))) hits.push(i);
  }
  if (hits.length !== 1) throw new Error("内容已变化，请刷新后重试");
  lines.splice(hits[0], target.length, ...replacement.split(/\r?\n/g));
  return lines.join(eol);
}
```

## 2. 渲染 markdown

```javascript
const { MarkdownRenderer, Component } = require("obsidian");

const wrap = body.createDiv({ cls: "hp-note markdown-rendered" });
const child = new Component();
ctx.component.addChild(child);
ctx.registerCleanup(() => ctx.component.removeChild(child));
await MarkdownRenderer.render(ctx.app, source, wrap, filePath, child);
```

- **必须用独立的子 Component**，否则重绘时渲染产物会累积
- 自定义视图里内部链接不会自动跳转，要手动接管：

```javascript
wrap.addEventListener("click", (event) => {
  const link = event.target.closest("a.internal-link");
  if (!link) return;
  event.preventDefault();
  const href = link.dataset.href ?? link.getAttribute("href") ?? "";
  if (href) void app.workspace.openLinkText(href, filePath, Keymap.isModEvent(event));
});
```

## 3. 扫描全库待办（不用读文件）

```javascript
const TASK_RE = /^(\s*[-*+]\s*\[)([^\]]?)(\]\s*)(.*)$/;

for (const file of app.vault.getMarkdownFiles()) {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache?.listItems) continue;
  const items = cache.listItems.filter((i) => i.task !== undefined);
  if (items.length === 0) continue;   // 绝大多数文件在这里被跳过
  // 只对有任务的文件读一次内容拿标题
  const lines = (await app.vault.cachedRead(file)).split(/\r?\n/g);
  for (const item of items) {
    const line = item.position.start.line;
    const raw = lines[line];
    const m = raw?.match(TASK_RE);
    if (!m) continue;
    const status = m[2].trim().toLowerCase() === "x" ? "done"
      : ["/", ">"].includes(m[2].trim()) ? "doing" : "todo";
    records.push({ path: file.path, line, raw, title: m[4].trim(), status });
  }
}
```

实测：1002 篇笔记 / 1115 条待办，扫 metadataCache 约 **4ms**；读完命中的 256 个文件也就几十毫秒。

## 4. 热力图（GitHub 风格）

按天计数 → 分 4 档 → 7 行按周排成列。

```javascript
// 1) 统计：日期 → 数量
const counts = new Map();
// 2) 补齐日期数组（从 startIso 到今天）
// 3) 按 getDay() 补空格，让首列落在周日
const firstDow = new Date(startIso + "T12:00:00").getDay();
const padded = [...Array(firstDow).fill(null), ...days];
// 4) 等级
const level = count <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
```

网格 CSS：`display:grid; grid-auto-flow:column; grid-template-rows:repeat(7,12px); gap:3px`，列 = 周。

## 5. 读写当天日记（跟随核心 Daily Notes）

```javascript
function dailySettings(app) {
  const o = app.internalPlugins.getPluginById("daily-notes")?.instance?.options ?? {};
  return {
    folder: typeof o.folder === "string" ? o.folder.trim().replace(/\/+$/, "") : "",
    format: typeof o.format === "string" && o.format.trim() ? o.format.trim() : "YYYY-MM-DD",
    template: typeof o.template === "string" ? o.template.trim() : ""
  };
}

function dailyPath(app) {
  const { folder, format } = dailySettings(app);
  const base = moment().format(format);       // moment 从 obsidian 导出
  return normalizePath(folder ? `${folder}/${base}.md` : `${base}.md`);
}
```

找不到时兜底全库按 basename 搜（用户挪过文件夹的情况）：

```javascript
const direct = app.vault.getAbstractFileByPath(path);
if (direct instanceof TFile) return direct;
const base = path.split("/").pop().replace(/\.md$/, "");
return app.vault.getMarkdownFiles().find((f) => f.basename === base) ?? null;
```

创建时展开模板变量：

```javascript
content.replace(/\{\{(date(?::[^}]+)?|time(?::[^}]+)?|title)\}\}/gi, (_, token) => {
  const raw = token.toLowerCase();
  if (raw === "title") return basename;
  const [head, ...rest] = token.split(":");
  return moment().format(rest.join(":") || (head.toLowerCase() === "time" ? "HH:mm" : "YYYY-MM-DD"));
});
```

## 6. 往日记小节里插入一行

先把「找小节」和「插入」拆开，两者都有坑。

```javascript
// 小节标题可能有 emoji 或前缀（「🔥 待办」，或历史遗留的「今日待办」）。
// 先精确匹配，再退而求其次接受以该名字结尾的，避免同一文件里多出一个重复小节。
function findSection(lines, section) {
  const name = section.trim();
  if (!name) return { start: 0, end: lines.length, level: 0, found: false };

  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) headings.push({ line: i, level: m[1].length, text: m[2].trim() });
  }
  const hit = headings.find((h) => h.text === name) ?? headings.find((h) => h.text.endsWith(name));
  if (!hit) return { start: 0, end: lines.length, level: 0, found: false };

  let end = lines.length;
  for (const h of headings) {
    if (h.line > hit.line && h.level <= hit.level) { end = h.line; break; }
  }
  return { start: hit.line + 1, end, level: hit.level, found: true };
}
```

```javascript
function insertTask(content, section, text) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const entry = `- [ ] ${text}`;
  const { start, end, found } = findSection(lines, section);

  if (!found) {
    // 没有这个节：在 frontmatter 后新建完整小节，别裸塞到文末
    const at = afterFrontmatter(lines);
    lines.splice(at, 0, `## ${section.trim()}`, "", entry, "");
    return lines.join(eol);
  }

  let last = end - 1;                  // 小节里最后一个非空行
  while (last >= start && !lines[last].trim()) last -= 1;

  if (last >= start) {
    lines.splice(last + 1, 0, entry);  // 紧跟着上一条，条目之间不留空行
  } else {
    const body = ["", entry];          // 空小节：标题 / 空行 / 条目
    if (end < lines.length) body.push("");  // 后面还有别的标题才补空行
    lines.splice(start, end - start, ...body);
  }
  return lines.join(eol);
}
```

坑位清单：

- **别往文末裸塞**：`${base}\n\n- [ ] x` 看着无害，但每写一条就多一个空行，连写三条就是空行夹心，而且内容落在小节外面。
- **空小节要补空行**：`## 待办` 紧跟条目很丑；但小节已经是文件最后一段时又不能再补尾随空行。
- **前缀要兜底**：`endsWith` 匹配让 `🔥 待办`、`今日待办` 都能复用，不会凭空造出第二个待办小节。
- 上面的 `findSection` **没有**跳过代码块：日记里如果贴了 ``` 围栏含 `#` 的内容，会被误认为标题。真遇到了再加围栏状态机。

## 6b. 写「带时间戳的流水记录」到日记小节

跟第 6 节的插入逻辑一样，区别有三处：

```javascript
// ① 条目带时间戳：- [09:42] 内容
const entry = `- [${moment().format("HH:mm")}] ${text}`;

// ② 模板会留下空 bullet 占位（只有「-」），它不算内容，插入时要跳过
function isBareBullet(line) { return /^\s*[-*+]\s*$/.test(line); }
let last = end - 1;
while (last >= start && (!lines[last].trim() || isBareBullet(lines[last]))) last -= 1;

// ③ 读回来时把时间戳拆出来，渲染成两栏
const stamped = body.match(/^\[(\d{1,2}:\d{2})\]\s*(.*)$/);
records.push({ line: i, text: stamped ? stamped[2] : body, time: stamped ? stamped[1] : "" });
```

两个关键验证：

- **`- [09:42] xxx` 不会被 Obsidian 当成 task**。实测 `metadataCache.getFileCache(f).listItems` 里，`- [09:42] x` 的 `item.task` 是 `undefined`，只有 `- [ ]` / `- [x]` 才有 `task` 字段。所以带时间戳的流水记录不会污染「全部待办」组件。可以用这个特性区分待办和记录。
- **单行输入框里可能有换行**（粘贴多行文本时）。提交前压成空格，否则会打断 bullet 结构：

```javascript
const text = input.value.replace(/\s*\r?\n\s*/g, " ").trim();
```

兼容旧格式：库里已有的「- 周日了。」没有时间戳，读取时 `time` 为空字符串，渲染时不显示时间那一栏。

## 7. 读文件恢复快照（IndexedDB）

```javascript
async function readSnapshots(app, days = 30) {
  const name = `${app.appId}-backup`;
  const rows = [];
  try {
    if (typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases();
      if (!dbs.some((db) => db.name === name)) return rows;   // 别误建空库
    }
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (db.objectStoreNames.contains("backups")) {
      const store = db.transaction("backups", "readonly").objectStore("backups");
      const lower = Date.now() - days * 86400000;
      const all = await new Promise((resolve) => {
        const req = store.index("ts").getAll(IDBKeyRange.lowerBound(lower));  // 用索引限范围
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve([]);
      });
      for (const row of all) {
        if (typeof row.path === "string" && typeof row.ts === "number") rows.push(row);
      }
    }
    db.close();
  } catch (error) {
    console.error("读取快照失败", error);
  }
  return rows;
}
```

## 8. 持久化历史数据到 localStorage

配置放 `data.json` 会膨胀时，历史放 localStorage。

```javascript
const key = `${app.appId}-my-widget-history`;

function loadHistory(app) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveHistory(app, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
```

**只在数据真的变了才写**，否则每次渲染都写盘。

## 9. 输入框 + 中文输入法

```javascript
input.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing) return;   // isComposing 必须查
  event.preventDefault();
  void submit();
});
```

输入框草稿用模块级 `Map` 缓存，重绘不丢：

```javascript
const drafts = new Map();
drafts.set(scope, input.value);
```

## 10. 可滚动列表

```javascript
.hp-my-list {
  flex: 1;              /* 在 .hp-card-body 里占满剩余空间 */
  min-height: 0;        /* flex 子项默认 min-height:auto，不加会撑破卡片 */
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
```

## 11. 弹出层（popover）

```javascript
document.querySelector(".my-popover")?.remove();
const popover = document.body.createDiv({ cls: "my-popover" });
// ...
const close = () => {
  popover.remove();
  document.removeEventListener("mousedown", onDown, true);
  document.removeEventListener("keydown", onKey, true);
};
const onDown = (e) => { if (!popover.contains(e.target)) close(); };
const onKey = (e) => { if (e.key === "Escape") close(); };
window.setTimeout(() => {
  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("keydown", onKey, true);
}, 0);
ctx.registerCleanup(close);          // 卸载时清掉
```
