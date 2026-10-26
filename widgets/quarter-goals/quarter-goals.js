/**
 * 季度目标 —— Home Pages 自定义组件
 *
 * 把当前季度的计划文件摊开：
 * - 自动定位 `项目/计划/<年>/<年>-Q<n>.md`；
 * - 顶层目标显示完成度，下面挂着的子任务显示下一步；
 * - 点任意文字跳到计划文件对应行。
 *
 * 找不到当前季度时，会回退显示目录里最新的一个季度文件。
 *
 * 安装：放进 Home Pages 设置里的「自定义组件目录」（如 _scripts/home-pages）。
 */
const { TFile, TFolder, setIcon, moment, normalizePath } = require("obsidian");

const DEFAULTS = {
  /** 计划根目录，下面按年份分子目录。 */
  folder: "项目/计划",
  /** auto = 当前季度；也可写死成 2026-Q4。 */
  quarter: "auto",
  /** 最多显示几个顶层目标。 */
  limit: 3
};

function normalizeConfig(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    if (typeof raw.folder === "string") out.folder = raw.folder.trim().replace(/\/+$/, "");
    if (typeof raw.quarter === "string" && raw.quarter.trim()) out.quarter = raw.quarter.trim();
    const limit = Number(raw.limit);
    if (Number.isFinite(limit)) out.limit = Math.max(1, Math.min(12, Math.round(limit)));
  }
  return out;
}

const STYLE_ID = "hp-user-quarter-goals-style";
const STYLE = `
.hp-quarter { display: flex; flex: 1; flex-direction: column; gap: 9px; min-height: 0; padding: 10px 14px 12px; overflow: hidden; }
.hp-quarter-head { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; }
.hp-quarter-key { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
.hp-quarter-key svg { width: 15px; height: 15px; color: var(--hp-accent); }
.hp-quarter-note { color: var(--hp-muted); font-size: 10.5px; text-align: right; }
.hp-quarter-progress { flex: none; height: 5px; overflow: hidden; border-radius: 999px; background: var(--background-modifier-hover); }
.hp-quarter-fill { height: 100%; border-radius: 999px; background: var(--hp-accent); transition: width .2s ease; }
.hp-quarter-list { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.hp-quarter-goal { display: flex; flex-direction: column; gap: 3px; padding: 7px 4px; border-bottom: 1px solid color-mix(in srgb, var(--hp-border) 65%, transparent); }
.hp-quarter-goal:last-child { border-bottom: none; }
.hp-quarter-title { color: var(--text-normal); font-size: 12.5px; font-weight: 600; line-height: 1.4; cursor: pointer; }
.hp-quarter-title:hover { color: var(--hp-accent); }
.hp-quarter-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--hp-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.hp-quarter-next { overflow: hidden; color: var(--hp-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.hp-quarter-next:hover { color: var(--hp-accent); }
.hp-quarter-more { flex: none; color: var(--hp-muted); font-size: 10.5px; text-align: center; }
.hp-quarter-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 14px; color: var(--hp-muted); font-size: 12px; text-align: center; }
.hp-quarter-empty svg { width: 26px; height: 26px; opacity: .55; }
.hp-quarter-empty code { padding: 1px 5px; border-radius: 4px; background: var(--background-modifier-hover); font-size: 10.5px; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function currentQuarter() {
  const now = moment();
  return `${now.format("YYYY")}-Q${Math.floor(now.month() / 3) + 1}`;
}

function parseQuarter(value) {
  const match = String(value).match(/^(\d{4})-Q([1-4])(?![0-9])/i);
  if (!match) return null;
  return { year: Number(match[1]), quarter: Number(match[2]), key: `${match[1]}-Q${match[2]}` };
}

function plainText(text) {
  return String(text)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function quarterFiles(app, folder) {
  const root = app.vault.getAbstractFileByPath(normalizePath(folder));
  if (!(root instanceof TFolder)) return [];
  const out = [];
  const walk = (node) => {
    if (node instanceof TFolder) {
      for (const child of node.children) walk(child);
      return;
    }
    if (!(node instanceof TFile) || node.extension.toLowerCase() !== "md") return;
    const parsed = parseQuarter(node.basename);
    if (!parsed) return;
    out.push({ file: node, ...parsed });
  };
  walk(root);
  out.sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  return out;
}

/** 定位季度计划：先按标准路径，再按文件名，最后回退到最新一份。 */
function resolvePlan(app, config) {
  const requested = config.quarter === "auto" ? currentQuarter() : config.quarter;
  const parsed = parseQuarter(requested);
  const key = parsed?.key ?? currentQuarter();
  const files = quarterFiles(app, config.folder);
  const exact = files.find((entry) => entry.key === key);
  if (exact) return { file: exact.file, key, fallback: false };

  const expectedPath = parsed
    ? normalizePath(`${config.folder}/${parsed.year}/${parsed.key}.md`)
    : normalizePath(`${config.folder}/${key}.md`);

  const latest = files[0] ?? null;
  return { file: latest?.file ?? null, key: latest?.key ?? key, fallback: Boolean(latest), expectedPath };
}

/**
 * 解析复选框，按最小缩进分层。
 * 顶层 = 目标；更深缩进 = 该目标下面的步骤。
 */
function parseGoals(content) {
  const lines = content.split(/\r?\n/);
  const entries = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^(\s*)[-*+]\s+\[([ xX/>-])\]\s+(.*)$/);
    if (!match) continue;

    const text = plainText(match[3]);
    if (!text) continue;
    entries.push({
      line: i,
      indent: match[1].replace(/\t/g, "    ").length,
      done: match[2].toLowerCase() === "x",
      text
    });
  }

  if (entries.length === 0) return { goals: [], total: 0, done: 0 };

  const minIndent = Math.min(...entries.map((entry) => entry.indent));
  const goals = [];
  let current = null;

  for (const entry of entries) {
    if (entry.indent === minIndent || !current) {
      current = { ...entry, children: [] };
      goals.push(current);
    } else {
      current.children.push(entry);
    }
  }

  return {
    goals,
    total: entries.length,
    done: entries.filter((entry) => entry.done).length
  };
}

module.exports = {
  kind: "user-quarter-goals",
  name: "季度目标",
  description: "显示当前季度目标的完成度、下一步和整体进度。",
  icon: "target",
  accent: "#ef4444",
  defaultSize: { w: 4, h: 6 },

  defaultConfig: () => ({ ...DEFAULTS }),
  normalizeConfig,

  async render(body, ctx) {
    const { app, config } = ctx;
    body.empty();
    ensureStyle();

    const plan = resolvePlan(app, config);
    ctx.setSubtitle(plan.fallback ? `${plan.key} · 回退` : plan.key);

    if (!plan.file) {
      const empty = body.createDiv({ cls: "hp-quarter-empty" });
      setIcon(empty.createSpan(), "target");
      empty.createDiv({ text: `没有找到 ${plan.key} 计划文件` });
      empty.createDiv({
        text: "期望路径："
      }).createEl("code", { text: plan.expectedPath });
      return;
    }

    ctx.addHeaderAction("file-text", "打开计划文件", () => {
      void ctx.openPath(plan.file.path);
    });

    let content = "";
    try {
      content = await app.vault.cachedRead(plan.file);
    } catch (error) {
      console.error("Home Pages: 读取季度计划失败", error);
      body.createDiv({ cls: "hp-quarter-empty", text: "读取季度计划失败" });
      return;
    }
    if (!ctx.isAlive()) return;

    const { goals, total, done } = parseGoals(content);
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    const wrap = body.createDiv({ cls: "hp-quarter" });
    const head = wrap.createDiv({ cls: "hp-quarter-head" });
    const keyEl = head.createDiv({ cls: "hp-quarter-key" });
    setIcon(keyEl.createSpan(), "target");
    keyEl.createSpan({ text: plan.key });
    head.createDiv({
      cls: "hp-quarter-note",
      text: plan.fallback ? `当前季度无计划，显示 ${plan.key}` : `${done}/${total} 完成`
    });

    const progress = wrap.createDiv({ cls: "hp-quarter-progress" });
    const fill = progress.createDiv({ cls: "hp-quarter-fill" });
    fill.style.width = `${percent}%`;

    if (goals.length === 0) {
      wrap.createDiv({ cls: "hp-quarter-empty", text: "这份计划里还没有复选框任务。" });
      return;
    }

    const list = wrap.createDiv({ cls: "hp-quarter-list" });
    for (const goal of goals.slice(0, config.limit)) {
      const goalDone = (goal.done ? 1 : 0) + goal.children.filter((child) => child.done).length;
      const goalTotal = 1 + goal.children.length;
      const row = list.createDiv({ cls: "hp-quarter-goal" });

      const title = row.createDiv({ cls: "hp-quarter-title", text: goal.text });
      title.addEventListener("click", (event) => {
        void ctx.openPath(plan.file.path, { line: goal.line, event });
      });

      const meta = row.createDiv({ cls: "hp-quarter-meta" });
      meta.createSpan({ text: `${goalDone}/${goalTotal}` });
      meta.createSpan({ text: goalDone === goalTotal ? "已完成" : `${Math.round((goalDone / goalTotal) * 100)}%` });

      if (goal.children.length > 0) {
        const next = goal.children.find((child) => !child.done);
        if (next) {
          const nextEl = row.createDiv({
            cls: "hp-quarter-next",
            text: `下一步：${next.text}`
          });
          nextEl.setAttribute("title", next.text);
          nextEl.addEventListener("click", (event) => {
            void ctx.openPath(plan.file.path, { line: next.line, event });
          });
        } else {
          row.createDiv({
            cls: "hp-quarter-next",
            text: goal.done ? "✓ 这个目标已完成" : "子步骤已完成，待勾选目标"
          });
        }
      } else {
        row.createDiv({
          cls: "hp-quarter-next",
          text: goal.done ? "✓ 这个目标已完成" : "待完成"
        });
      }
    }

    if (goals.length > config.limit) {
      wrap.createDiv({
        cls: "hp-quarter-more",
        text: `还有 ${goals.length - config.limit} 个目标未显示`
      });
    }
  },

  renderSettings(container, ctx) {
    const { Setting } = require("obsidian");

    new Setting(container)
      .setName("计划根目录")
      .setDesc("下面按年份分子目录，例如 项目/计划/2026/2026-Q4.md。")
      .addText((text) => text.setValue(ctx.config.folder).onChange((value) => ctx.update({ folder: value })));

    new Setting(container)
      .setName("显示哪个季度")
      .setDesc("auto = 当前季度；也可以写 2026-Q4。")
      .addText((text) => text.setValue(ctx.config.quarter).onChange((value) => ctx.update({ quarter: value })));

    new Setting(container)
      .setName("显示几个目标")
      .setDesc("1–12 个。")
      .addText((text) =>
        text.setValue(String(ctx.config.limit)).onChange((value) => {
          const n = Number(value);
          if (Number.isFinite(n)) ctx.update({ limit: Math.max(1, Math.min(12, Math.round(n))) });
        })
      );
  }
};
