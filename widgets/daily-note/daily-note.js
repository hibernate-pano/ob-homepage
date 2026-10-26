/**
 * 今日日记 + 待办 —— Home Pages 自定义组件
 *
 * 参考「乔木 Home Page」的 daily-preview / todo 卡片：
 *   - 一个日历图标入口，直接跳到当天的日记；
 *   - 一个待办输入框，回车把 `- [ ] xxx` 写进当天日记的「## 待办」小节；
 *   - 列出当天日记里的待办，可勾选（直接改写日记文件里的 `[ ]` / `[x]`）。
 *
 * 跟随 Obsidian 核心「Daily Notes」插件的设置（目录 / 日期格式 / 模板）。
 *
 * 安装方式（二选一）：
 *   1. Home Pages 设置 →「自定义组件目录」填 _scripts/home-pages，把本文件放进去；
 *   2. 命令面板 →「Home Pages: 粘贴代码新建组件」，粘贴本文件内容。
 */
const { Notice, TFile, setIcon, moment, normalizePath } = require("obsidian");

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const DEFAULTS = {
  /** 待办写在哪个二级小节下（默认「待办」，与库里既有日记一致）。 */
  section: "待办",
  /** 没有日记时按核心 Daily Notes 的模板自动创建 */
  autoCreate: true
};

/** 输入框草稿：重绘后仍保留，避免打字时被打断。 */
const drafts = new Map();

/** 组件自带样式（自定义脚本没法改插件的 styles.css，这里注入一段只作用于本组件的 CSS）。 */
const STYLE_ID = "hp-user-daily-note-style";
const STYLE = `
.hp-daily-form { display: flex; flex: none; gap: 8px; align-items: center; padding: 0 10px 8px; }
.hp-daily-input {
  flex: 1; min-width: 0; padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--hp-accent) 42%, transparent);
  border-radius: 6px; background: var(--hp-card-bg); font-size: 12px;
}
.hp-daily-add {
  display: inline-flex; align-items: center; justify-content: center;
  flex: none; width: 28px; height: 28px; padding: 0;
  border: none; border-radius: 6px; background: transparent;
  color: var(--hp-muted); cursor: pointer; box-shadow: none;
}
.hp-daily-add:hover { background: var(--background-modifier-hover); color: var(--hp-accent); }
.hp-daily-add svg { width: 15px; height: 15px; }
.hp-daily-list { display: flex; flex: 1; flex-direction: column; min-height: 0; padding: 6px 10px; overflow-y: auto; }
.hp-daily-row { display: flex; align-items: flex-start; gap: 9px; padding: 7px 8px; font-size: 13px; }
.hp-daily-check { flex: none; margin-top: 3px; }
.hp-daily-text { flex: 1; min-width: 0; }
.hp-daily-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.hp-daily-label:hover { color: var(--hp-accent); }
.hp-daily-row.is-done .hp-daily-label { text-decoration: line-through; opacity: 0.55; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function normalizeConfig(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    if (typeof raw.section === "string" && raw.section.trim()) out.section = raw.section.trim();
    if (typeof raw.autoCreate === "boolean") out.autoCreate = raw.autoCreate;
  }
  return out;
}

// ---- 核心 Daily Notes 设置 -------------------------------------------------

function dailySettings(app) {
  const plugin = app.internalPlugins?.getPluginById?.("daily-notes");
  const options = plugin?.instance?.options ?? {};
  const folder = typeof options.folder === "string" ? options.folder.trim().replace(/\/+$/, "") : "";
  const format = typeof options.format === "string" && options.format.trim() ? options.format.trim() : "YYYY-MM-DD";
  const template = typeof options.template === "string" ? options.template.trim() : "";
  return { folder, format, template };
}

/** 当天的 YYYY-MM-DD。 */
function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 当天日记的预期路径（跟随核心插件的目录与日期格式）。 */
function dailyPath(app) {
  const { folder, format } = dailySettings(app);
  const base = moment().format(format);
  return normalizePath(folder ? `${folder}/${base}.md` : `${base}.md`);
}

/** 找当天的日记；找不到时兜底全库按 basename 搜（用户挪过文件夹的情况）。 */
function findDailyNote(app) {
  const path = dailyPath(app);
  const direct = app.vault.getAbstractFileByPath(path);
  if (direct instanceof TFile) return direct;
  const base = path.split("/").pop().replace(/\.md$/, "");
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.basename === base) return file;
  }
  return null;
}

/** 展开模板里的 {{date}} / {{date:FORMAT}} / {{time}} / {{title}}。 */
function expandTemplate(content, basename) {
  return content.replace(
    /\{\{(date(?::[^}]+)?|time(?::[^}]+)?|title)\}\}/gi,
    (_, token) => {
      const raw = token.toLowerCase();
      if (raw === "title") return basename;
      const [head, ...rest] = token.split(":");
      const fmt = rest.join(":");
      return moment().format(fmt || (head.toLowerCase() === "time" ? "HH:mm" : "YYYY-MM-DD"));
    }
  );
}

/** 按核心 Daily Notes 的目录与模板创建当天的日记。 */
async function createDailyNote(app) {
  const path = dailyPath(app);
  const parts = path.split("/");
  parts.pop();
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

  const { template } = dailySettings(app);
  let content = "";
  if (template) {
    const tpl = app.vault.getAbstractFileByPath(normalizePath(template.endsWith(".md") ? template : `${template}.md`));
    if (tpl instanceof TFile) {
      try {
        content = await app.vault.cachedRead(tpl);
      } catch {
        content = "";
      }
    }
  }

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return existing;
  return app.vault.create(path, expandTemplate(content, path.split("/").pop().replace(/\.md$/, "")));
}

// ---- 日记内容解析 ----------------------------------------------------------

function eolOf(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

/** 找到小节标题所在行与小节结束行。 */
function findSection(lines, section) {
  const name = section.trim();
  if (!name) return { start: 0, end: lines.length, level: 0, found: false };

  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) headings.push({ line: i, level: match[1].length, text: match[2].trim() });
  }

  // 先找完全同名的；没有再退而求其次接受以该名字结尾的（如「🔥 待办」「今日待办」），
  // 避免同一个文件里凭空多出一个重复小节。
  const exact = headings.find((h) => h.text === name);
  const suffix = headings.find((h) => h.text.endsWith(name));
  const hit = exact ?? suffix;
  if (!hit) return { start: 0, end: lines.length, level: 0, found: false };

  const start = hit.line + 1;
  let end = lines.length;
  for (const heading of headings) {
    if (heading.line >= start && heading.level <= hit.level) {
      end = heading.line;
      break;
    }
  }
  return { start, end, level: hit.level, found: true };
}

/** frontmatter 之后、第一个内容行之前的位置（用于新建小节）。 */
function afterFrontmatter(lines) {
  let at = 0;
  if ((lines[0] ?? "").trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (/^(---|\.\.\.)\s*$/.test(lines[i])) {
        at = i + 1;
        break;
      }
    }
  }
  while (at < lines.length && !lines[at].trim()) at += 1;
  return at;
}

/** 列出日记里的待办（勾选与未勾选都要）。 */
function extractTasks(content, section) {
  const lines = content.split(/\r?\n/);
  const { start, end } = findSection(lines, section);
  const tasks = [];
  for (let i = start; i < end; i++) {
    const match = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.+?)\s*$/);
    if (!match) continue;
    tasks.push({ line: i, raw: lines[i], text: match[2], done: match[1] !== " " });
  }
  return tasks;
}

/**
 * 把一条待办写进日记的指定小节下面。
 * - 小节存在：紧跟在最后一条内容之后，任务之间不留空行；
 * - 小节不存在：在 frontmatter 后新建 `## <小节>` 再写（不往文末乱塞）。
 */
function insertTask(content, section, text) {
  const eol = eolOf(content);
  const lines = content.split(/\r?\n/);
  const entry = `- [ ] ${text}`;
  const { start, end, found } = findSection(lines, section);

  if (!found) {
    const header = `## ${section.trim()}`;
    const at = afterFrontmatter(lines);
    lines.splice(at, 0, header, "", entry, "");
    return lines.join(eol);
  }

  // 小节内最后一个非空行
  let last = end - 1;
  while (last >= start && !lines[last].trim()) last -= 1;

  if (last >= start) {
    // 已有内容 → 紧跟其后，任务之间不留空行
    lines.splice(last + 1, 0, entry);
  } else {
    // 空小节 → 标题 / 空行 / 任务；后面还有别的标题时再补一个空行
    const body = ["", entry];
    if (end < lines.length) body.push("");
    lines.splice(start, end - start, ...body);
  }
  return lines.join(eol);
}

/** 勾选/取消勾选某一条待办；找不到原行返回 null（说明这行已被改动）。 */
function toggleTask(content, raw, done) {
  const eol = eolOf(content);
  const lines = content.split(/\r?\n/);
  const index = lines.indexOf(raw);
  if (index < 0) return null;
  lines[index] = lines[index].replace(/\[([ xX])\]/, done ? "[x]" : "[ ]");
  return lines.join(eol);
}

// ---- 组件 ------------------------------------------------------------------

module.exports = {
  kind: "user-daily-note",
  name: "今日日记",
  description: "打开当天的日记，并直接在首页添加 / 勾选当天的待办。",
  icon: "calendar-days",
  accent: "#f59e0b",
  defaultSize: { w: 4, h: 6 },

  defaultConfig: () => ({ ...DEFAULTS }),
  normalizeConfig,

  async render(body, ctx) {
    const { app, config } = ctx;

    body.empty();
    ensureStyle();

    // 跨零点自动切到新的一天。
    const day = todayIso();
    ctx.registerInterval(() => {
      if (todayIso() !== day) ctx.rerender();
    }, 60000);

    let file = findDailyNote(app);

    if (!file && config.autoCreate) {
      try {
        file = await createDailyNote(app);
      } catch (error) {
        console.error("Home Pages: 创建当天日记失败", error);
      }
      if (!ctx.isAlive()) return;
    }

    // ---- 没有日记：给一个创建入口 ----
    if (!file) {
      ctx.setSubtitle("");
      const empty = body.createDiv({ cls: "hp-empty" });
      setIcon(empty.createDiv({ cls: "hp-empty-icon" }), "calendar-x");
      empty.createDiv({ cls: "hp-empty-text", text: "今天还没有日记" });
      const button = empty.createEl("button", { cls: "hp-pill", text: "创建今天的日记", attr: { type: "button" } });
      button.addEventListener("click", async () => {
        try {
          await createDailyNote(app);
        } catch (error) {
          new Notice(`创建日记失败：${error instanceof Error ? error.message : String(error)}`);
        }
        ctx.rerender();
      });
      return;
    }

    ctx.setSubtitle(`${day} ${WEEKDAYS[new Date().getDay()]}`);
    ctx.addHeaderAction("calendar-days", "打开今天的日记", (event) => {
      void ctx.openPath(file.path, { event });
    });

    let content = "";
    try {
      content = await app.vault.cachedRead(file);
    } catch {
      body.createDiv({ cls: "hp-empty", text: "读取失败" });
      return;
    }
    if (!ctx.isAlive()) return;

    // ---- 添加待办的输入框 ----
    const scope = config.section.trim() || "（文末）";
    const form = body.createDiv({ cls: "hp-daily-form" });
    const input = form.createEl("input", {
      cls: "hp-daily-input",
      attr: { type: "text", placeholder: "添加待办，回车保存" }
    });
    input.value = drafts.get(scope) ?? "";
    input.addEventListener("input", () => drafts.set(scope, input.value));
    const addBtn = form.createEl("button", {
      cls: "hp-daily-add",
      attr: { type: "button", "aria-label": "添加待办" }
    });
    setIcon(addBtn, "plus");

    const submit = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      drafts.set(scope, "");
      try {
        await app.vault.process(file, (data) => insertTask(data, config.section, text));
      } catch (error) {
        new Notice(`写入失败：${error instanceof Error ? error.message : String(error)}`);
        input.value = text;
        drafts.set(scope, text);
        return;
      }
      ctx.rerender();
    };

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      void submit();
    });
    addBtn.addEventListener("click", () => void submit());

    // ---- 待办列表 ----
    const tasks = extractTasks(content, config.section);
    const list = body.createDiv({ cls: "hp-daily-list" });
    if (tasks.length === 0) {
      list.createDiv({ cls: "hp-empty", text: config.section.trim() ? "今天还没有待办" : "这篇日记里没有待办" });
    } else {
      for (const task of tasks) {
        const row = list.createDiv({ cls: task.done ? "hp-daily-row is-done" : "hp-daily-row" });
        const check = row.createEl("input", { cls: "hp-daily-check", attr: { type: "checkbox" } });
        check.checked = task.done;
        const text = row.createDiv({ cls: "hp-daily-text" });
        const label = text.createDiv({ cls: "hp-daily-label", text: task.text });
        label.addEventListener("click", () => void ctx.openPath(file.path, { line: task.line }));
        check.addEventListener("change", () => {
          check.disabled = true;
          void app.vault
            .process(file, (data) => {
              const next = toggleTask(data, task.raw, check.checked);
              if (next === null) throw new Error("这一行已被修改，请刷新后再试");
              return next;
            })
            .catch((error) => {
              check.checked = !check.checked;
              new Notice(error instanceof Error ? error.message : String(error));
            })
            .finally(() => {
              check.disabled = false;
            });
        });
      }
    }
  },

  renderSettings(container, ctx) {
    const { Setting } = require("obsidian");
    const info = dailySettings(ctx.app);

    container.createDiv({
      cls: "setting-item-description",
      text: `核心 Daily Notes 设置：目录「${info.folder || "（库根目录）"}」，日期格式 ${info.format}`
    });

    new Setting(container)
      .setName("待办写在哪个小节下")
      .setDesc("日记里的二级小节标题（默认「待办」）；小节不存在时会在 frontmatter 后新建一个。")
      .addText((text) => text.setValue(ctx.config.section).onChange((value) => ctx.update({ section: value })));

    new Setting(container)
      .setName("没有日记时自动创建")
      .setDesc("按核心 Daily Notes 的模板创建当天的日记。")
      .addToggle((toggle) =>
        toggle.setValue(ctx.config.autoCreate).onChange((value) => ctx.update({ autoCreate: value }))
      );
  }
};
