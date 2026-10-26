/**
 * 全部待办 —— Home Pages 自定义组件
 *
 * 汇总整个库里所有笔记的 `- [ ]` 待办；勾选完成后该条从列表移除（直接改写笔记文件）。
 * 列表可能很长，容器内可滚动。样式参考「今日待办」卡片。
 *
 * 数据来源：Obsidian 的 metadataCache（listItems 里带 task 的条目），
 * 不需要逐个读文件，1000+ 篇笔记也能瞬间扫完。
 *
 * 安装：Home Pages 设置 →「自定义组件目录」放本文件，或命令面板「粘贴代码新建组件」。
 */
const { Notice, TFile, setIcon } = require("obsidian");

const TASK_RE = /^(\s*[-*+]\s*\[)([^\]]?)(\]\s*)(.*)$/;

const DEFAULTS = {
  /** 限定来源（多个，每行一个）：文件夹或单个笔记路径；留空 = 全库。 */
  sources: [],
  /** 排除文件夹（换行分隔）。 */
  excludeFolders: []
};

/** 匹配首页待办 / 今日待办组件的样式。 */
const STYLE_ID = "hp-user-all-tasks-style";
const STYLE = `
.hp-alltasks { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 0; padding: 10px 14px 12px; overflow: hidden; }
.hp-alltasks-bar { display: flex; flex: none; align-items: center; gap: 6px; }
.hp-alltasks-count { margin-right: auto; color: var(--hp-muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.hp-alltasks-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.hp-alltasks-row { display: flex; align-items: flex-start; gap: 9px; padding: 7px 4px; border-bottom: 1px solid color-mix(in srgb, var(--hp-border) 70%, transparent); font-size: 13px; line-height: 1.45; }
.hp-alltasks-row:last-child { border-bottom: none; }
.hp-alltasks-check { flex: none; margin-top: 3px; width: 15px; height: 15px; accent-color: var(--hp-accent); cursor: pointer; }
.hp-alltasks-body { flex: 1; min-width: 0; }
.hp-alltasks-text { overflow-wrap: anywhere; cursor: pointer; }
.hp-alltasks-text:hover { color: var(--hp-accent); }
.hp-alltasks-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; color: var(--hp-muted); font-size: 11px; }
.hp-alltasks-src { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.hp-alltasks-src:hover { color: var(--hp-accent); }
.hp-alltasks-empty { display: flex; flex: 1; align-items: center; justify-content: center; padding: 16px; color: var(--hp-muted); font-size: 12.5px; text-align: center; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function normalizeConfig(raw) {
  const out = { ...DEFAULTS, sources: [], excludeFolders: [] };
  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.sources)) {
      out.sources = raw.sources.map((v) => String(v).trim()).filter(Boolean);
    } else if (typeof raw.source === "string" && raw.source.trim()) {
      // 旧版只有一个 source 字段，迁移过来。
      out.sources = [raw.source.trim()];
    }
    if (Array.isArray(raw.excludeFolders)) {
      out.excludeFolders = raw.excludeFolders.map((v) => String(v).trim()).filter(Boolean);
    }
  }
  return out;
}

// ---- 数据采集 --------------------------------------------------------------

/** 解析范围内、排除后的笔记文件。多个来源取并集。 */
function resolveFiles(app, sources, excludes) {
  const all = app.vault.getMarkdownFiles();
  const paths = sources.map((item) => item.trim().replace(/\/+$/g, "")).filter(Boolean);

  let files = all;
  let label = "全库";

  if (paths.length === 1) {
    const path = paths[0];
    const target = app.vault.getAbstractFileByPath(path);
    if (target instanceof TFile) {
      files = [target];
      label = target.basename;
    } else {
      files = all.filter((file) => file.path.startsWith(`${path}/`));
      label = `${path}/`;
    }
  } else if (paths.length > 1) {
    const picked = new Set();
    for (const path of paths) {
      const target = app.vault.getAbstractFileByPath(path);
      if (target instanceof TFile) {
        picked.add(target.path);
      } else {
        for (const file of all) {
          if (file.path.startsWith(`${path}/`)) picked.add(file.path);
        }
      }
    }
    files = all.filter((file) => picked.has(file.path));
    label = `${paths.length} 处来源`;
  }

  const excluded = excludes.map((item) => item.trim().replace(/\/+$/g, "")).filter(Boolean);
  if (excluded.length) {
    files = files.filter((file) => !excluded.some((folder) => file.path === folder || file.path.startsWith(`${folder}/`)));
  }
  return { files, label };
}

/** 一条待办。 */
function makeRecord(file, item) {
  const char = String(item.task ?? " ").trim().toLowerCase();
  const status = char === "x" ? "done" : char === "/" || char === ">" ? "doing" : "todo";
  return {
    path: file.path,
    line: item.position?.start?.line ?? -1,
    raw: "",
    status,
    title: ""
  };
}

/**
 * 扫描所有笔记的待办。
 * 用 metadataCache 的 listItems 定位（带 task 的条目），只对命中的文件读一次内容取标题。
 */
async function loadTasks(app, config) {
  const { files, label } = resolveFiles(app, config.sources, config.excludeFolders);
  const records = [];

  // 1) 先用 metadataCache 找出哪些文件有任务，并拿到行号
  const hits = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache || !cache.listItems) continue;
    const items = cache.listItems.filter((item) => item.task !== undefined);
    if (items.length === 0) continue;
    hits.push({ file, items });
  }

  // 2) 只读有任务的文件，取任务文字
  for (const { file, items } of hits) {
    let content = "";
    try {
      content = await app.vault.cachedRead(file);
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/g);
    for (const item of items) {
      const line = item.position?.start?.line ?? -1;
      const raw = line >= 0 && line < lines.length ? lines[line] : "";
      const match = raw.match(TASK_RE);
      const record = makeRecord(file, item);
      record.raw = raw;
      record.title = match ? match[4].trim() : "";
      if (!record.title) continue;
      records.push(record);
    }
  }

  // 3) 排序：未完成在前，同组按文件修改时间倒序
  records.sort((a, b) => {
    const rank = { todo: 0, doing: 1, done: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    const ta = app.vault.getAbstractFileByPath(a.path);
    const tb = app.vault.getAbstractFileByPath(b.path);
    const ma = ta instanceof TFile ? ta.stat.mtime : 0;
    const mb = tb instanceof TFile ? tb.stat.mtime : 0;
    return mb - ma;
  });

  const open = records.filter((r) => r.status !== "done").length;
  return { records, label, open, total: records.length };
}

/** 改写某一行任务的勾选状态。 */
function rewriteLine(content, record, done) {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/g);
  if (record.line < 0 || record.line >= lines.length) throw new Error("任务行已不存在");
  const current = lines[record.line];
  if (record.raw && current !== record.raw) throw new Error("文件已被修改，请刷新后重试");
  const match = current.match(TASK_RE);
  if (!match) throw new Error("该行已不是任务");
  lines[record.line] = `${match[1]}${done ? "x" : " "}${match[3]}${match[4]}`;
  return lines.join(newline);
}

// ---- 组件 ------------------------------------------------------------------

module.exports = {
  kind: "user-all-tasks",
  name: "全部待办",
  description: "汇总全库所有笔记的待办；勾选完成后从列表移除，可滚动查看。",
  icon: "list-todo",
  accent: "#2563eb",
  defaultSize: { w: 4, h: 8 },

  defaultConfig: () => ({ ...DEFAULTS, excludeFolders: [] }),
  normalizeConfig,

  async render(body, ctx) {
    const { app, config } = ctx;
    body.empty();
    ensureStyle();

    const { records, label, open, total } = await loadTasks(app, config);
    if (!ctx.isAlive()) return;

    const visible = records.filter((r) => r.status !== "done");
    ctx.setSubtitle(`${label} · ${visible.length} 未完成 / ${records.length} 条`);

    // ---- 顶部：数量 ----
    const bar = body.createDiv({ cls: "hp-alltasks-bar" });
    bar.createSpan({ cls: "hp-alltasks-count", text: `${visible.length} 项` });

    // ---- 列表 ----
    const list = body.createDiv({ cls: "hp-alltasks-list" });
    if (visible.length === 0) {
      list.createDiv({ cls: "hp-alltasks-empty", text: "没有未完成的待办 🎉" });
      return;
    }

    for (const record of visible) {
      const row = list.createDiv({ cls: "hp-alltasks-row" });
      const check = row.createEl("input", { cls: "hp-alltasks-check", attr: { type: "checkbox" } });
      check.checked = record.status === "done";
      const bodyEl = row.createDiv({ cls: "hp-alltasks-body" });
      const text = bodyEl.createDiv({ cls: "hp-alltasks-text", text: record.title });
      // 点文字打开所在笔记的那一行
      text.addEventListener("click", (event) => void ctx.openPath(record.path, { line: record.line, event }));

      const file = app.vault.getAbstractFileByPath(record.path);
      const meta = bodyEl.createDiv({ cls: "hp-alltasks-meta" });
      const src = meta.createSpan({ cls: "hp-alltasks-src", text: file instanceof TFile ? file.basename : record.path });
      src.setAttribute("title", record.path);
      src.addEventListener("click", (event) => void ctx.openPath(record.path, { line: record.line, event }));

      check.addEventListener("change", () => {
        check.disabled = true;
        const target = app.vault.getAbstractFileByPath(record.path);
        if (!(target instanceof TFile)) {
          check.disabled = false;
          check.checked = !check.checked;
          new Notice("任务所在文件不存在");
          return;
        }
        void app.vault
          .process(target, (content) => rewriteLine(content, record, check.checked))
          .catch((error) => {
            check.checked = !check.checked;
            new Notice(error instanceof Error ? error.message : String(error));
          })
          .finally(() => {
            check.disabled = false;
            ctx.rerender();
          });
      });
    }
  },

  renderSettings(container, ctx) {
    const { Setting } = require("obsidian");
    new Setting(container)
      .setName("限定来源")
      .setDesc("一行一个文件夹或单个笔记路径，可填多个；留空为全库。多个来源取并集。")
      .addTextArea((text) =>
        text
          .setValue(ctx.config.sources.join("\n"))
          .setPlaceholder("项目/计划\n日记/2026")
          .onChange((value) =>
            ctx.update({ sources: value.split(/[\n,，]/g).map((v) => v.trim()).filter(Boolean) })
          )
      );

    new Setting(container)
      .setName("排除文件夹")
      .setDesc("一行一个文件夹路径。")
      .addTextArea((text) =>
        text
          .setValue(ctx.config.excludeFolders.join("\n"))
          .onChange((value) =>
            ctx.update({ excludeFolders: value.split(/[\n,，]/g).map((v) => v.trim()).filter(Boolean) })
          )
      );
  }
};
