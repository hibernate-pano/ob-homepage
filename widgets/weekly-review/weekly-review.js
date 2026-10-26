/**
 * 本周复盘 —— Home Pages 自定义组件
 *
 * 把「本周复盘写没写」和「上次复盘还欠什么」放到首页。
 * - 显示当前 ISO 周是否已有复盘文件；
 * - 没有就一键按模板新建并打开；
 * - 列出本周（没写时用上次）复盘里还没勾掉的事项，可直接勾选。
 *
 * 文件命名兼容 `2026-W44 周复盘.md` 和 `2026-W44.md`。
 *
 * 安装：放进 Home Pages 设置里的「自定义组件目录」（如 _scripts/home-pages）。
 */
const { Notice, TFile, TFolder, setIcon, moment, normalizePath } = require("obsidian");

const DEFAULTS = {
  /** 周复盘所在目录。 */
  folder: "复盘/周",
  /** 新建周复盘时使用的模板。 */
  template: "系统/模板/T-Week.md",
  /** 最多显示几条未完成事项。 */
  limit: 5
};

function normalizeConfig(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    if (typeof raw.folder === "string" && raw.folder.trim()) out.folder = raw.folder.trim().replace(/\/+$/, "");
    if (typeof raw.template === "string") out.template = raw.template.trim();
    const limit = Number(raw.limit);
    if (Number.isFinite(limit)) out.limit = Math.max(1, Math.min(12, Math.round(limit)));
  }
  return out;
}

const STYLE_ID = "hp-user-weekly-review-style";
const STYLE = `
.hp-weekly { display: flex; flex: 1; flex-direction: column; gap: 9px; min-height: 0; padding: 10px 14px 12px; overflow: hidden; }
.hp-weekly-status { display: flex; flex: none; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
.hp-weekly-status.is-missing { color: var(--text-warning); }
.hp-weekly-status.is-done { color: var(--color-green); }
.hp-weekly-status-icon { display: inline-flex; }
.hp-weekly-status-icon svg { width: 16px; height: 16px; }
.hp-weekly-meta { display: flex; flex: none; flex-wrap: wrap; gap: 4px 12px; color: var(--hp-muted); font-size: 11.5px; }
.hp-weekly-meta b { color: var(--text-normal); font-weight: 600; }
.hp-weekly-section { display: flex; flex: none; align-items: center; justify-content: space-between; margin-top: 1px; color: var(--hp-muted); font-size: 11px; font-weight: 700; letter-spacing: .02em; }
.hp-weekly-list { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.hp-weekly-row { display: flex; align-items: flex-start; gap: 8px; padding: 6px 4px; border-bottom: 1px solid color-mix(in srgb, var(--hp-border) 65%, transparent); font-size: 12.5px; line-height: 1.45; }
.hp-weekly-row:last-child { border-bottom: none; }
.hp-weekly-check { flex: none; margin-top: 3px; }
.hp-weekly-text { flex: 1; min-width: 0; cursor: pointer; word-break: break-word; }
.hp-weekly-text:hover { color: var(--hp-accent); }
.hp-weekly-empty { flex: 1; display: flex; align-items: center; justify-content: center; padding: 12px; color: var(--hp-muted); font-size: 12px; text-align: center; }
.hp-weekly-button { display: inline-flex; flex: none; align-items: center; gap: 5px; padding: 5px 10px; border: 1px solid var(--hp-border); border-radius: 7px; background: var(--hp-card-bg); color: var(--text-normal); font-size: 11.5px; cursor: pointer; box-shadow: none; }
.hp-weekly-button:hover { border-color: var(--hp-accent); color: var(--hp-accent); }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const WEEK_RE = /^(\d{4})-W(\d{1,2})/;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function currentWeekKey() {
  return moment().format("GGGG-[W]WW");
}

function parseWeekKey(name) {
  const m = String(name).match(WEEK_RE);
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]), key: `${m[1]}-W${pad2(Number(m[2]))}` };
}

/** ISO 周的第一天（周一）。用纯日期计算，避免 moment 严格解析的坑。 */
function weekStartOf(key) {
  const parsed = parseWeekKey(key);
  if (!parsed) return null;
  const jan4 = new Date(parsed.year, 0, 4);
  const dow = jan4.getDay() || 7;
  const monday = new Date(parsed.year, 0, 4 - dow + 1);
  monday.setDate(monday.getDate() + (parsed.week - 1) * 7);
  return monday;
}

function weeksBetween(fromKey, toKey) {
  const from = weekStartOf(fromKey);
  const to = weekStartOf(toKey);
  if (!from || !to) return 0;
  return Math.max(0, Math.round((to - from) / 604800000));
}

/** 递归列出目录下所有带周号的复盘文件，按周倒序。 */
function listReviews(app, folder) {
  const root = app.vault.getAbstractFileByPath(normalizePath(folder));
  if (!(root instanceof TFolder)) return [];
  const out = [];
  const walk = (node) => {
    if (node instanceof TFolder) {
      for (const child of node.children) walk(child);
      return;
    }
    if (!(node instanceof TFile) || node.extension.toLowerCase() !== "md") return;
    const parsed = parseWeekKey(node.basename);
    if (!parsed) return;
    out.push({ file: node, ...parsed });
  };
  walk(root);
  out.sort((a, b) => b.year - a.year || b.week - a.week);
  return out;
}

function plainText(text) {
  return String(text)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 读取未完成任务，保留原始行用于勾选时校验。 */
async function readOpenTasks(app, file, limit) {
  let content = "";
  try {
    content = await app.vault.cachedRead(file);
  } catch (error) {
    console.error("Home Pages: 读取周复盘失败", error);
    return [];
  }
  const lines = content.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*[-*+]\s*\[ \]\s+(.*)$/);
    if (!match) continue;
    const text = plainText(match[1]);
    if (!text) continue;
    out.push({ line: i, raw: lines[i], text });
    if (out.length >= limit) break;
  }
  return out;
}

async function ensureFolder(app, folder) {
  const parts = folder.split("/").filter(Boolean);
  let dir = "";
  for (const part of parts) {
    dir = dir ? `${dir}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(dir)) {
      try {
        await app.vault.createFolder(dir);
      } catch {
        // 并发创建时忽略。
      }
    }
  }
}

function expandTemplate(content, basename) {
  return content.replace(/\{\{(date(?::[^}]+)?|time(?::[^}]+)?|title)\}\}/gi, (_, token) => {
    const raw = token.toLowerCase();
    if (raw === "title") return basename;
    const [head, ...rest] = token.split(":");
    const fmt = rest.join(":");
    return moment().format(fmt || (head.toLowerCase() === "time" ? "HH:mm" : "YYYY-MM-DD"));
  });
}

/** 找到本周复盘；没有就按模板创建。 */
async function openOrCreateCurrent(app, config) {
  const key = currentWeekKey();
  const existing = listReviews(app, config.folder).find((review) => review.key === key);
  if (existing) return existing.file;

  const folder = normalizePath(config.folder);
  await ensureFolder(app, folder);

  let content = "";
  if (config.template) {
    const templatePath = normalizePath(
      config.template.endsWith(".md") ? config.template : `${config.template}.md`
    );
    const template = app.vault.getAbstractFileByPath(templatePath);
    if (template instanceof TFile) {
      try {
        content = await app.vault.cachedRead(template);
      } catch {
        content = "";
      }
    }
  }

  const path = normalizePath(`${folder}/${key} 周复盘.md`);
  const direct = app.vault.getAbstractFileByPath(path);
  if (direct instanceof TFile) return direct;
  return app.vault.create(path, expandTemplate(content, `${key} 周复盘`));
}

function toggleTask(content, line, raw) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  if (lines[line] !== raw) throw new Error("复盘文件已被修改，请刷新后重试");
  lines[line] = raw.replace(/\[ \]/, "[x]");
  return lines.join(eol);
}

module.exports = {
  kind: "user-weekly-review",
  name: "本周复盘",
  description: "显示本周复盘是否已写；列出上次遗留事项，可直接勾选。",
  icon: "calendar-check",
  accent: "#0ea5e9",
  defaultSize: { w: 6, h: 6 },

  defaultConfig: () => ({ ...DEFAULTS }),
  normalizeConfig,

  async render(body, ctx) {
    const { app, config } = ctx;
    body.empty();
    ensureStyle();

    const reviews = listReviews(app, config.folder);
    const currentKey = currentWeekKey();
    const current = reviews.find((review) => review.key === currentKey) ?? null;
    const lastWritten = current ?? reviews[0] ?? null;
    const year = currentKey.slice(0, 4);
    const yearCount = reviews.filter((review) => String(review.year) === year).length;

    ctx.setSubtitle(`${currentKey} · ${yearCount} 篇`);

    ctx.addHeaderAction(current ? "file-text" : "calendar-plus", current ? "打开本周复盘" : "新建本周复盘", () => {
      void openOrCreateCurrent(app, config)
        .then((file) => ctx.openPath(file.path))
        .catch((error) => new Notice(error instanceof Error ? error.message : String(error)));
    });

    const wrap = body.createDiv({ cls: "hp-weekly" });
    const status = wrap.createDiv({
      cls: current ? "hp-weekly-status is-done" : "hp-weekly-status is-missing"
    });
    const statusIcon = status.createSpan({ cls: "hp-weekly-status-icon" });
    setIcon(statusIcon, current ? "check-circle" : "alert-circle");
    status.createSpan({ text: current ? "本周已写" : "本周还没写" });

    const meta = wrap.createDiv({ cls: "hp-weekly-meta" });
    if (lastWritten) {
      const ago = weeksBetween(lastWritten.key, currentKey);
      meta.createSpan({
        text: current ? "本周" : `上次 ${lastWritten.key}`
      });
      if (!current) meta.createSpan({ text: ago === 0 ? "本周" : `${ago} 周前` });
      meta.createSpan({ text: `${year} 年已写 ${yearCount} 篇` });
    } else {
      meta.createSpan({ text: "还没有任何周复盘" });
    }

    if (!lastWritten) {
      wrap.createDiv({ cls: "hp-weekly-empty", text: "点右上角的新建按钮，按模板开始写本周复盘。" });
      return;
    }

    const tasks = await readOpenTasks(app, lastWritten.file, config.limit);
    if (!ctx.isAlive()) return;

    const section = wrap.createDiv({ cls: "hp-weekly-section" });
    section.createSpan({ text: current ? "本周待完成" : `上次遗留（${lastWritten.key}）` });
    section.createSpan({ text: `${tasks.length} 项` });

    if (tasks.length === 0) {
      wrap.createDiv({
        cls: "hp-weekly-empty",
        text: current ? "本周复盘没有未完成项 🎉" : "上次复盘没有遗留任务 🎉"
      });
      return;
    }

    const list = wrap.createDiv({ cls: "hp-weekly-list" });
    for (const task of tasks) {
      const row = list.createDiv({ cls: "hp-weekly-row" });
      const check = row.createEl("input", { cls: "hp-weekly-check", attr: { type: "checkbox" } });
      const text = row.createDiv({ cls: "hp-weekly-text", text: task.text });
      text.addEventListener("click", (event) => {
        void ctx.openPath(lastWritten.file.path, { line: task.line, event });
      });
      check.addEventListener("change", () => {
        check.disabled = true;
        void app.vault
          .process(lastWritten.file, (content) => toggleTask(content, task.line, task.raw))
          .then(() => ctx.rerender())
          .catch((error) => {
            check.checked = false;
            check.disabled = false;
            new Notice(error instanceof Error ? error.message : String(error));
          });
      });
    }
  },

  renderSettings(container, ctx) {
    const { Setting } = require("obsidian");

    new Setting(container)
      .setName("周复盘目录")
      .setDesc("存放周复盘文件的文件夹。")
      .addText((text) => text.setValue(ctx.config.folder).onChange((value) => ctx.update({ folder: value })));

    new Setting(container)
      .setName("新建模板")
      .setDesc("新建本周复盘时使用的模板路径；留空则创建空文件。")
      .addText((text) =>
        text.setValue(ctx.config.template).onChange((value) => ctx.update({ template: value }))
      );

    new Setting(container)
      .setName("显示几条遗留事项")
      .setDesc("1–12 条。")
      .addText((text) =>
        text.setValue(String(ctx.config.limit)).onChange((value) => {
          const n = Number(value);
          if (Number.isFinite(n)) ctx.update({ limit: Math.max(1, Math.min(12, Math.round(n))) });
        })
      );
  }
};
