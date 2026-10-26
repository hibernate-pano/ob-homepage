/**
 * 健康打卡 —— Home Pages 自定义组件
 *
 * 体重 / 尿酸 / 血糖的「最近一次 + 快速记录」卡片。
 *
 * 数据来源：
 *   1. 当天日记 frontmatter：weight / uric_acid / blood_glucose（推荐，结构化）；
 *   2. 历史日记正文：`体重：70`、`尿酸：400`、`血糖值：5.6`（兼容旧记录）。
 *
 * 卡片上的输入框会把今天的数值写回当天日记的 frontmatter。
 * 不先做趋势图：先把记录变成顺手的事，数据够了再画。
 *
 * 安装：放进 Home Pages 设置里的「自定义组件目录」（如 _scripts/home-pages）。
 */
const { Notice, TFile, setIcon, moment, normalizePath } = require("obsidian");

const METRICS = [
  {
    key: "weight",
    label: "体重",
    unit: "kg",
    min: 20,
    max: 300,
    step: "0.1",
    icon: "scale",
    bodyRe: /体重\s*[：:]\s*([0-9]+(?:\.[0-9]+)?)/
  },
  {
    key: "uric_acid",
    label: "尿酸",
    unit: "μmol/L",
    min: 50,
    max: 1500,
    step: "1",
    icon: "droplets",
    bodyRe: /尿酸\s*[：:]\s*([0-9]+(?:\.[0-9]+)?)/
  },
  {
    key: "blood_glucose",
    label: "血糖",
    unit: "mmol/L",
    min: 0.5,
    max: 50,
    step: "0.1",
    icon: "activity",
    bodyRe: /血糖(?:值)?\s*[：:]?\s*([0-9]+(?:\.[0-9]+)?)/
  }
];

const DEFAULTS = {
  /** 留空 = 跟随核心 Daily Notes 的目录。 */
  folder: "",
  /** 没有当天日记时按核心模板自动创建。 */
  autoCreate: true,
  /** 目标值，留空不显示。 */
  targetWeight: "",
  targetUricAcid: "",
  targetGlucose: ""
};

function normalizeConfig(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    if (typeof raw.folder === "string") out.folder = raw.folder.trim().replace(/\/+$/, "");
    if (typeof raw.autoCreate === "boolean") out.autoCreate = raw.autoCreate;
    for (const key of ["targetWeight", "targetUricAcid", "targetGlucose"]) {
      if (typeof raw[key] === "string" || typeof raw[key] === "number") out[key] = String(raw[key]).trim();
    }
  }
  return out;
}

const STYLE_ID = "hp-user-health-log-style";
const STYLE = `
.hp-health { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 0; padding: 10px 14px 12px; overflow: hidden; }
.hp-health-summary { flex: none; color: var(--hp-muted); font-size: 11px; }
.hp-health-list { display: flex; flex: none; flex-direction: column; gap: 5px; }
.hp-health-row { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 8px; background: var(--background-modifier-hover); }
.hp-health-icon { display: flex; flex: none; color: var(--hp-accent); }
.hp-health-icon svg { width: 15px; height: 15px; }
.hp-health-main { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; }
.hp-health-label { color: var(--text-normal); font-size: 12px; font-weight: 600; }
.hp-health-meta { overflow: hidden; color: var(--hp-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.hp-health-value { flex: none; text-align: right; font-variant-numeric: tabular-nums; }
.hp-health-number { font-size: 15px; font-weight: 700; }
.hp-health-unit { margin-left: 3px; color: var(--hp-muted); font-size: 10px; }
.hp-health-none { color: var(--hp-muted); font-size: 11px; }
.hp-health-form { display: flex; flex: none; align-items: flex-end; gap: 6px; margin-top: auto; padding-top: 2px; }
.hp-health-field { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.hp-health-field-label { color: var(--hp-muted); font-size: 10px; }
.hp-health-input { width: 100%; padding: 4px 6px; border: 1px solid var(--hp-border); border-radius: 6px; background: var(--hp-card-bg); font-size: 12px; }
.hp-health-save { display: inline-flex; flex: none; align-items: center; gap: 3px; height: 27px; padding: 0 8px; border: none; border-radius: 6px; background: var(--hp-accent); color: #fff; font-size: 11px; cursor: pointer; box-shadow: none; }
.hp-health-save:hover { opacity: .9; }
.hp-health-save svg { width: 13px; height: 13px; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const DATE_RE = /(\d{4}-\d{2}-\d{2})/;
const drafts = new Map();

function dailySettings(app) {
  const plugin = app.internalPlugins?.getPluginById?.("daily-notes");
  const options = plugin?.instance?.options ?? {};
  const folder = typeof options.folder === "string" ? options.folder.trim().replace(/\/+$/, "") : "";
  const format = typeof options.format === "string" && options.format.trim() ? options.format.trim() : "YYYY-MM-DD";
  const template = typeof options.template === "string" ? options.template.trim() : "";
  return { folder, format, template };
}

function dailyFolder(app, config) {
  return config.folder || dailySettings(app).folder;
}

function dailyPath(app, config) {
  const info = dailySettings(app);
  const folder = config.folder || info.folder;
  const base = moment().format(info.format);
  return normalizePath(folder ? `${folder}/${base}.md` : `${base}.md`);
}

function dateOf(file) {
  const match = file.basename.match(DATE_RE);
  return match ? match[1] : "";
}

function findDailyNote(app, config) {
  const path = dailyPath(app, config);
  const direct = app.vault.getAbstractFileByPath(path);
  if (direct instanceof TFile) return direct;

  // 兜底只在配置/核心 Daily Notes 的目录里找，避免扫到别的目录里同名的日记。
  const folder = dailyFolder(app, config);
  const prefix = folder ? `${normalizePath(folder)}/` : "";
  const base = path.split("/").pop().replace(/\.md$/i, "");
  return (
    app.vault
      .getMarkdownFiles()
      .find((file) => (!prefix || file.path.startsWith(prefix)) && file.basename === base) ?? null
  );
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

async function createDailyNote(app, config) {
  const path = dailyPath(app, config);
  const parts = path.split("/");
  parts.pop();
  await ensureFolder(app, parts.join("/"));

  const info = dailySettings(app);
  let content = "";
  if (info.template) {
    const templatePath = normalizePath(info.template.endsWith(".md") ? info.template : `${info.template}.md`);
    const template = app.vault.getAbstractFileByPath(templatePath);
    if (template instanceof TFile) {
      try {
        content = await app.vault.cachedRead(template);
      } catch {
        content = "";
      }
    }
  }

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return existing;
  return app.vault.create(path, expandTemplate(content, path.split("/").pop().replace(/\.md$/i, "")));
}

async function ensureDailyNote(app, config) {
  const existing = findDailyNote(app, config);
  if (existing) return existing;
  if (!config.autoCreate) throw new Error("今天还没有日记，请先创建当天日记");
  return createDailyNote(app, config);
}

function isValid(metric, value) {
  return Number.isFinite(value) && value >= metric.min && value <= metric.max;
}

function listDailyFiles(app, config) {
  const folder = dailyFolder(app, config);
  const prefix = folder ? `${normalizePath(folder)}/` : "";
  return app.vault
    .getMarkdownFiles()
    .filter((file) => (!prefix || file.path.startsWith(prefix)) && DATE_RE.test(file.basename));
}

function signatureOf(app, config) {
  const files = app.vault.getMarkdownFiles();
  let newest = 0;
  for (const file of files) {
    if (file.stat.mtime > newest) newest = file.stat.mtime;
  }
  return `${app.appId ?? "vault"}|${dailyFolder(app, config)}|${config.folder}|${files.length}|${newest}`;
}

let cache = { key: "", at: 0, records: [] };

async function collect(app, config) {
  const key = signatureOf(app, config);
  if (cache.key === key && Date.now() - cache.at < 60000) return cache.records;

  const records = [];
  const today = moment().format("YYYY-MM-DD");

  for (const file of listDailyFiles(app, config)) {
    const date = dateOf(file);
    if (!date) continue;

    const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const missing = [];

    for (const metric of METRICS) {
      const raw = fm[metric.key];
      if (raw === undefined || raw === null || raw === "") {
        missing.push(metric);
        continue;
      }
      const value = Number(raw);
      if (isValid(metric, value)) {
        records.push({ metric: metric.key, date, value, path: file.path, line: -1, source: "frontmatter" });
      }
    }

    if (missing.length === 0) continue;

    let content = "";
    try {
      content = await app.vault.cachedRead(file);
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);

    for (const metric of missing) {
      let found = null;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (/目标/.test(line)) continue;
        const match = line.match(metric.bodyRe);
        if (!match) continue;
        const value = Number(match[1]);
        if (!isValid(metric, value)) continue;
        found = { value, line: i };
      }
      if (found) {
        records.push({
          metric: metric.key,
          date,
          value: found.value,
          path: file.path,
          line: found.line,
          source: "body"
        });
      }
    }
  }

  // 同一天同一指标只保留一条：frontmatter 优先。
  const map = new Map();
  for (const record of records) {
    const id = `${record.metric}|${record.date}`;
    const existing = map.get(id);
    if (!existing || (existing.source !== "frontmatter" && record.source === "frontmatter")) {
      map.set(id, record);
    }
  }

  const merged = [...map.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.metric.localeCompare(b.metric)
  );
  cache = { key, at: Date.now(), records: merged };
  return merged;
}

function latestOf(records, metricKey) {
  let latest = null;
  for (const record of records) {
    if (record.metric !== metricKey) continue;
    if (!latest || record.date > latest.date) latest = record;
  }
  return latest;
}

function todayOf(records, metricKey, today) {
  return records.find((record) => record.metric === metricKey && record.date === today) ?? null;
}

function formatValue(metric, value) {
  const digits = metric.key === "uric_acid" ? 0 : 1;
  return Number(value).toFixed(digits).replace(/\.0$/, "");
}

function agoText(date, today) {
  const days = moment(today, "YYYY-MM-DD").startOf("day").diff(moment(date, "YYYY-MM-DD").startOf("day"), "days");
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return `${days} 天前`;
}

function targetOf(config, metric) {
  if (metric.key === "weight") return config.targetWeight;
  if (metric.key === "uric_acid") return config.targetUricAcid;
  if (metric.key === "blood_glucose") return config.targetGlucose;
  return "";
}

module.exports = {
  kind: "user-health-log",
  name: "健康打卡",
  description: "体重、尿酸、血糖的最近记录与快速录入。",
  icon: "heart-pulse",
  accent: "#ec4899",
  defaultSize: { w: 4, h: 6 },

  defaultConfig: () => ({ ...DEFAULTS }),
  normalizeConfig,

  async render(body, ctx) {
    const { app, config } = ctx;
    body.empty();
    ensureStyle();

    const records = await collect(app, config);
    if (!ctx.isAlive()) return;

    const today = moment().format("YYYY-MM-DD");
    const cutoff = moment().subtract(30, "days").format("YYYY-MM-DD");
    const recentDays = new Set(records.filter((record) => record.date >= cutoff).map((record) => record.date)).size;
    const widgetId = ctx.widget?.id ?? "default";

    ctx.setSubtitle(`近 30 天 ${recentDays} 天有记录`);

    ctx.addHeaderAction("calendar-days", "打开今天日记", () => {
      void ensureDailyNote(app, config)
        .then((file) => ctx.openPath(file.path))
        .catch((error) => new Notice(error instanceof Error ? error.message : String(error)));
    });

    const wrap = body.createDiv({ cls: "hp-health" });
    wrap.createDiv({
      cls: "hp-health-summary",
      text:
        records.length === 0
          ? "还没有记录，先从今天开始。"
          : recentDays === 0
            ? "近 30 天没有记录，补一条今天的吧。"
            : `近 30 天记录了 ${recentDays} 天`
    });

    const list = wrap.createDiv({ cls: "hp-health-list" });
    for (const metric of METRICS) {
      const latest = latestOf(records, metric.key);
      const target = targetOf(config, metric);
      const row = list.createDiv({ cls: "hp-health-row" });

      const icon = row.createDiv({ cls: "hp-health-icon" });
      setIcon(icon, metric.icon);

      const main = row.createDiv({ cls: "hp-health-main" });
      main.createDiv({ cls: "hp-health-label", text: metric.label });
      const meta = main.createDiv({ cls: "hp-health-meta" });
      if (latest) {
        meta.createSpan({ text: `${latest.date} · ${agoText(latest.date, today)}` });
      } else {
        meta.createSpan({ text: "还没有记录" });
      }
      if (target) meta.createSpan({ text: ` · 目标 ${target}` });

      const value = row.createDiv({ cls: "hp-health-value" });
      if (latest) {
        value.createSpan({ cls: "hp-health-number", text: formatValue(metric, latest.value) });
        value.createSpan({ cls: "hp-health-unit", text: metric.unit });
      } else {
        value.createSpan({ cls: "hp-health-none", text: "—" });
      }
    }

    const form = wrap.createDiv({ cls: "hp-health-form" });
    const inputs = [];

    for (const metric of METRICS) {
      const field = form.createDiv({ cls: "hp-health-field" });
      field.createSpan({ cls: "hp-health-field-label", text: metric.label });
      const input = field.createEl("input", {
        cls: "hp-health-input",
        attr: {
          type: "number",
          min: String(metric.min),
          max: String(metric.max),
          step: metric.step,
          placeholder: metric.key === "weight" ? "70" : metric.key === "uric_acid" ? "400" : "5.6"
        }
      });
      const draftKey = `${widgetId}:${metric.key}`;
      const todayRecord = todayOf(records, metric.key, today);
      input.value = drafts.get(draftKey) ?? (todayRecord ? String(todayRecord.value) : "");
      input.addEventListener("input", () => drafts.set(draftKey, input.value));
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        void save();
      });
      inputs.push({ metric, input, draftKey });
    }

    const saveButton = form.createEl("button", {
      cls: "hp-health-save",
      attr: { type: "button", title: "记录到今天的日记" }
    });
    setIcon(saveButton, "check");
    saveButton.createSpan({ text: "记录" });

    async function save() {
      const updates = {};
      for (const { metric, input } of inputs) {
        const raw = input.value.trim();
        if (!raw) continue;
        const value = Number(raw);
        if (!isValid(metric, value)) {
          new Notice(`${metric.label}数值不在合理范围（${metric.min}–${metric.max}）`);
          input.focus();
          return;
        }
        updates[metric.key] = value;
      }

      if (Object.keys(updates).length === 0) {
        new Notice("没有可记录的数值");
        return;
      }

      saveButton.disabled = true;
      try {
        const file = await ensureDailyNote(app, config);
        await app.fileManager.processFrontMatter(file, (fm) => {
          for (const [key, value] of Object.entries(updates)) fm[key] = value;
        });
        for (const { metric } of inputs) drafts.delete(`${widgetId}:${metric.key}`);
        new Notice("已记录到今天的日记");
        if (ctx.isAlive()) ctx.rerender();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      } finally {
        saveButton.disabled = false;
      }
    }

    saveButton.addEventListener("click", () => void save());
  },

  renderSettings(container, ctx) {
    const { Setting } = require("obsidian");

    new Setting(container)
      .setName("日记目录")
      .setDesc("留空跟随核心 Daily Notes 的目录。")
      .addText((text) => text.setValue(ctx.config.folder).onChange((value) => ctx.update({ folder: value })));

    new Setting(container)
      .setName("没有日记时自动创建")
      .setDesc("按核心 Daily Notes 的模板创建当天日记。")
      .addToggle((toggle) =>
        toggle.setValue(ctx.config.autoCreate).onChange((value) => ctx.update({ autoCreate: value }))
      );

    new Setting(container)
      .setName("目标体重")
      .setDesc("留空不显示。")
      .addText((text) => text.setValue(ctx.config.targetWeight).onChange((value) => ctx.update({ targetWeight: value })));

    new Setting(container)
      .setName("目标尿酸")
      .setDesc("留空不显示。")
      .addText((text) =>
        text.setValue(ctx.config.targetUricAcid).onChange((value) => ctx.update({ targetUricAcid: value }))
      );

    new Setting(container)
      .setName("目标血糖")
      .setDesc("留空不显示。")
      .addText((text) =>
        text.setValue(ctx.config.targetGlucose).onChange((value) => ctx.update({ targetGlucose: value }))
      );
  }
};
