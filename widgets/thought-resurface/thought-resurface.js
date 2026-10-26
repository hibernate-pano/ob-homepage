/**
 * 闪念回顾 —— Home Pages 自定义组件
 *
 * 每天从旧日记里捞一条思考放到首页：
 * - 来源一：日记里的 `## 思考` 小节；
 * - 来源二：正文里带 `#思考` / `#思考/xxx` 的行。
 *
 * 同一天固定同一条（按日期做确定性抽样），右上角「换一条」可以继续翻。
 * 只读，不写任何笔记。
 *
 * 安装：放进 Home Pages 设置里的「自定义组件目录」（如 _scripts/home-pages）。
 */
const { TFile, TFolder, setIcon, moment, normalizePath } = require("obsidian");

const DEFAULTS = {
  /** 从哪个目录找日记；留空 = 全库。 */
  folder: "日记",
  /** 只回顾至少这么多天前的思考，避免刚写完就被翻出来。 */
  minAgeDays: 7,
  /** 太短的碎片不展示。 */
  minChars: 15
};

function normalizeConfig(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    if (typeof raw.folder === "string") out.folder = raw.folder.trim().replace(/\/+$/, "");
    const age = Number(raw.minAgeDays);
    if (Number.isFinite(age)) out.minAgeDays = Math.max(0, Math.min(3650, Math.round(age)));
    const chars = Number(raw.minChars);
    if (Number.isFinite(chars)) out.minChars = Math.max(1, Math.min(500, Math.round(chars)));
  }
  return out;
}

const STYLE_ID = "hp-user-thought-resurface-style";
const STYLE = `
.hp-thought { display: flex; flex: 1; flex-direction: column; gap: 9px; min-height: 0; padding: 10px 14px 12px; overflow: hidden; }
.hp-thought-meta { display: flex; flex: none; align-items: center; gap: 6px; color: var(--hp-muted); font-size: 11px; }
.hp-thought-meta svg { width: 13px; height: 13px; }
.hp-thought-text { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; white-space: pre-wrap; word-break: break-word; padding: 2px 2px 2px 0; color: var(--text-normal); font-size: 13px; line-height: 1.65; cursor: pointer; }
.hp-thought-text:hover { color: var(--hp-accent); }
.hp-thought-tags { display: flex; flex: none; flex-wrap: wrap; gap: 4px; }
.hp-thought-tag { padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--hp-accent) 12%, transparent); color: var(--hp-accent); font-size: 10.5px; }
.hp-thought-foot { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; color: var(--hp-muted); font-size: 10.5px; }
.hp-thought-source { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hp-thought-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 14px; color: var(--hp-muted); font-size: 12px; text-align: center; }
.hp-thought-empty svg { width: 26px; height: 26px; opacity: .55; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const TAG_RE = /#[\w一-鿿/-]{1,40}/g;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

let cache = { key: "", at: 0, pool: [] };
const offsets = new Map();

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dateOf(file) {
  const match = file.basename.match(DATE_RE);
  return match ? match[1] : "";
}

function tagsOf(text) {
  return [...new Set(String(text).match(TAG_RE) ?? [])];
}

function cleanText(text) {
  return String(text)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(TAG_RE, "")
    .replace(/[*_`~]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function listFiles(app, folder) {
  if (!folder) return app.vault.getMarkdownFiles();
  const root = app.vault.getAbstractFileByPath(normalizePath(folder));
  if (!(root instanceof TFolder)) return [];
  const out = [];
  const walk = (node) => {
    if (node instanceof TFolder) {
      for (const child of node.children) walk(child);
      return;
    }
    if (node instanceof TFile && node.extension.toLowerCase() === "md") out.push(node);
  };
  walk(root);
  return out;
}

/** 从一个文件里提取思考候选（小节 + 标签行）。 */
function extractCandidates(content, file, date, minChars) {
  const lines = content.split(/\r?\n/);
  const out = [];
  const headings = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(HEADING_RE);
    if (match) headings.push({ line: i, level: match[1].length, text: match[2].trim() });
  }

  const hit = headings.find((heading) => heading.text === "思考" || heading.text.endsWith("思考")) ?? null;
  let sectionStart = -1;
  let sectionEnd = -1;

  if (hit) {
    sectionStart = hit.line;
    sectionEnd = lines.length;
    for (const heading of headings) {
      if (heading.line > hit.line && heading.level <= hit.level) {
        sectionEnd = heading.line;
        break;
      }
    }

    let block = [];
    let blockStart = -1;
    const flush = () => {
      if (block.length === 0) return;
      const raw = block.join("\n");
      const text = cleanText(raw);
      if (text.length >= minChars) {
        out.push({ path: file.path, line: blockStart, text, tags: tagsOf(raw), date });
      }
      block = [];
      blockStart = -1;
    };

    for (let i = hit.line + 1; i < sectionEnd; i += 1) {
      const line = lines[i];
      if (!line.trim()) {
        flush();
        continue;
      }
      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bullet) {
        flush();
        const raw = bullet[1];
        const text = cleanText(raw);
        if (text.length >= minChars) {
          out.push({ path: file.path, line: i, text, tags: tagsOf(raw), date });
        }
        continue;
      }
      if (blockStart < 0) blockStart = i;
      block.push(line);
    }
    flush();
  }

  // 正文里带 #思考 的行（跳过已经从小节里收过的行）。
  for (let i = 0; i < lines.length; i += 1) {
    if (i >= sectionStart && i < sectionEnd) continue;
    if (!/#思考(?:\/[\w一-鿿-]+)?/.test(lines[i])) continue;
    const raw = lines[i].replace(/^\s*[-*+]\s+/, "");
    const text = cleanText(raw);
    if (text.length >= minChars) {
      out.push({ path: file.path, line: i, text, tags: tagsOf(raw), date });
    }
  }

  return out;
}

function signatureOf(app, config) {
  const files = app.vault.getMarkdownFiles();
  let newest = 0;
  for (const file of files) {
    if (file.stat.mtime > newest) newest = file.stat.mtime;
  }
  return `${app.appId ?? "vault"}|${config.folder}|${config.minAgeDays}|${config.minChars}|${files.length}|${newest}`;
}

async function collect(app, config) {
  const key = signatureOf(app, config);
  if (cache.key === key && Date.now() - cache.at < 60000) return cache.pool;

  const files = listFiles(app, config.folder);
  const candidates = [];
  const seen = new Set();

  for (const file of files) {
    const date = dateOf(file);
    if (!date) continue;
    let content = "";
    try {
      content = await app.vault.cachedRead(file);
    } catch {
      continue;
    }
    for (const candidate of extractCandidates(content, file, date, config.minChars)) {
      const id = `${candidate.path}:${candidate.line}`;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push(candidate);
    }
  }

  const cutoff = moment().subtract(config.minAgeDays, "days").format("YYYY-MM-DD");
  let pool = candidates.filter((candidate) => candidate.date <= cutoff);
  if (pool.length === 0) pool = candidates;

  pool.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.path.localeCompare(b.path) ||
      a.line - b.line
  );

  cache = { key, at: Date.now(), pool };
  return pool;
}

function relativeDate(date) {
  const days = moment().startOf("day").diff(moment(date, "YYYY-MM-DD").startOf("day"), "days");
  if (days <= 0) return "今天";
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30))} 个月前`;
  return `${Math.max(1, Math.floor(days / 365))} 年前`;
}

module.exports = {
  kind: "user-thought-resurface",
  name: "闪念回顾",
  description: "每天从旧日记里捞一条思考，点开回到当时的上下文。",
  icon: "sparkles",
  accent: "#8b5cf6",
  defaultSize: { w: 4, h: 6 },

  defaultConfig: () => ({ ...DEFAULTS }),
  normalizeConfig,

  async render(body, ctx) {
    const { app, config } = ctx;
    body.empty();
    ensureStyle();

    const widgetId = ctx.widget?.id ?? "default";
    const pool = await collect(app, config);
    if (!ctx.isAlive()) return;

    ctx.setSubtitle(`${pool.length} 条可回顾`);

    if (pool.length === 0) {
      const empty = body.createDiv({ cls: "hp-thought-empty" });
      setIcon(empty.createSpan(), "sparkles");
      empty.createDiv({ text: "还没有可以回顾的思考" });
      empty.createDiv({ text: `在日记里写「## 思考」或加上 #思考 标签后，这里就会出现。` });
      return;
    }

    const today = moment().format("YYYY-MM-DD");
    const base = hashString(today) % pool.length;
    const offset = offsets.get(widgetId) ?? 0;
    const item = pool[(base + offset) % pool.length];

    ctx.addHeaderAction("refresh-cw", "换一条", () => {
      offsets.set(widgetId, (offsets.get(widgetId) ?? 0) + 1);
      ctx.rerender();
    });

    const wrap = body.createDiv({ cls: "hp-thought" });
    const meta = wrap.createDiv({ cls: "hp-thought-meta" });
    setIcon(meta.createSpan(), "quote");
    meta.createSpan({ text: `${item.date} · ${relativeDate(item.date)}` });

    const text = wrap.createDiv({ cls: "hp-thought-text", text: item.text });
    text.addEventListener("click", (event) => {
      void ctx.openPath(item.path, { line: item.line, event });
    });

    if (item.tags.length > 0) {
      const tagRow = wrap.createDiv({ cls: "hp-thought-tags" });
      for (const tag of item.tags) tagRow.createSpan({ cls: "hp-thought-tag", text: tag });
    }

    const foot = wrap.createDiv({ cls: "hp-thought-foot" });
    const source = item.path.split("/").pop().replace(/\.md$/i, "");
    foot.createSpan({ cls: "hp-thought-source", text: source });
    const open = foot.createSpan({ text: "点击打开 →" });
    open.style.cursor = "pointer";
    open.addEventListener("click", (event) => {
      void ctx.openPath(item.path, { line: item.line, event });
    });
  },

  renderSettings(container, ctx) {
    const { Setting } = require("obsidian");

    new Setting(container)
      .setName("日记目录")
      .setDesc("从哪个文件夹找思考；留空 = 全库。")
      .addText((text) => text.setValue(ctx.config.folder).onChange((value) => ctx.update({ folder: value })));

    new Setting(container)
      .setName("最少隔几天")
      .setDesc("只回顾至少这么多天前的思考；0 = 不限制。")
      .addText((text) =>
        text.setValue(String(ctx.config.minAgeDays)).onChange((value) => {
          const n = Number(value);
          if (Number.isFinite(n)) ctx.update({ minAgeDays: Math.max(0, Math.round(n)) });
        })
      );

    new Setting(container)
      .setName("最短字数")
      .setDesc("太短的碎片不展示。")
      .addText((text) =>
        text.setValue(String(ctx.config.minChars)).onChange((value) => {
          const n = Number(value);
          if (Number.isFinite(n)) ctx.update({ minChars: Math.max(1, Math.round(n)) });
        })
      );
  }
};
