/**
 * 在读清单 —— Home Pages 自定义组件
 *
 * 从微信读书同步过来的书籍笔记里，挑出最近真正在读的书：
 * - 读 `收藏/书籍/*.md` 的 frontmatter（readingStatus / progress / lastReadDate / cover）；
 * - 默认只看最近 180 天翻过的书，避免把几十本「在读」全堆出来；
 * - 点击打开书摘笔记。
 *
 * 只读，不写任何笔记。没有微信读书插件也能用，只要笔记里有同样的 frontmatter。
 *
 * 安装：放进 Home Pages 设置里的「自定义组件目录」（如 _scripts/home-pages）。
 */
const { TFile, setIcon, moment, normalizePath } = require("obsidian");

const DEFAULTS = {
  /** 书籍笔记所在目录。 */
  folder: "收藏/书籍",
  /** 卡片里显示几本。 */
  limit: 3,
  /** 只显示最近这么多天读过的书；0 = 不限。 */
  maxAgeDays: 180
};

function normalizeConfig(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    if (typeof raw.folder === "string") out.folder = raw.folder.trim().replace(/\/+$/, "");
    const limit = Number(raw.limit);
    if (Number.isFinite(limit)) out.limit = Math.max(1, Math.min(8, Math.round(limit)));
    const age = Number(raw.maxAgeDays);
    if (Number.isFinite(age)) out.maxAgeDays = Math.max(0, Math.min(3650, Math.round(age)));
  }
  return out;
}

const STYLE_ID = "hp-user-reading-style";
const STYLE = `
.hp-reading { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 0; padding: 10px 14px 12px; overflow: hidden; }
.hp-reading-summary { display: flex; flex: none; flex-wrap: wrap; gap: 4px 12px; color: var(--hp-muted); font-size: 11.5px; }
.hp-reading-summary b { color: var(--text-normal); font-weight: 700; }
.hp-reading-list { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.hp-reading-row { display: flex; align-items: flex-start; gap: 10px; padding: 7px 4px; border-bottom: 1px solid color-mix(in srgb, var(--hp-border) 65%, transparent); cursor: pointer; }
.hp-reading-row:last-child { border-bottom: none; }
.hp-reading-row:hover { background: var(--background-modifier-hover); }
.hp-reading-cover { display: flex; flex: none; align-items: center; justify-content: center; width: 34px; height: 46px; overflow: hidden; border-radius: 5px; background: var(--background-modifier-hover); color: var(--hp-muted); }
.hp-reading-cover img { width: 100%; height: 100%; object-fit: cover; }
.hp-reading-cover svg { width: 18px; height: 18px; }
.hp-reading-info { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 0; }
.hp-reading-title { display: -webkit-box; overflow: hidden; color: var(--text-normal); font-size: 12.5px; font-weight: 600; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.hp-reading-author { overflow: hidden; color: var(--hp-muted); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.hp-reading-bar { height: 4px; overflow: hidden; border-radius: 999px; background: var(--background-modifier-hover); }
.hp-reading-fill { height: 100%; border-radius: 999px; background: var(--hp-accent); }
.hp-reading-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--hp-muted); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.hp-reading-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 14px; color: var(--hp-muted); font-size: 12px; text-align: center; }
.hp-reading-empty svg { width: 26px; height: 26px; opacity: .55; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function parseProgress(value) {
  const raw = String(value ?? "").replace(/%/g, "").trim();
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.max(0, Math.min(100, number));
}

function daysSince(date) {
  if (!date) return null;
  const days = moment().startOf("day").diff(moment(date, "YYYY-MM-DD").startOf("day"), "days");
  return Number.isFinite(days) ? days : null;
}

function listBooks(app, folder) {
  const prefix = folder ? `${normalizePath(folder)}/` : "";
  const files = app.vault.getMarkdownFiles().filter((file) => !prefix || file.path.startsWith(prefix));
  const books = [];

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) continue;
    if (fm.readingStatus === undefined && fm.doc_type !== "weread-highlights-reviews") continue;

    const status = String(fm.readingStatus ?? "").replace(/["']/g, "").trim();
    const title = String(fm.title ?? file.basename).trim() || file.basename;
    const author = String(fm.author ?? "").trim();
    const cover = String(fm.cover ?? "").trim();
    const lastRead = String(fm.lastReadDate ?? "").trim();
    const progress = parseProgress(fm.progress);
    const readingTime = String(fm.readingTime ?? "").trim();

    books.push({ file, status, title, author, cover, lastRead, progress, readingTime });
  }

  return books;
}

module.exports = {
  kind: "user-reading",
  name: "在读清单",
  description: "显示最近在读的书、进度和最后阅读时间，点击打开书摘。",
  icon: "book-open",
  accent: "#14b8a6",
  defaultSize: { w: 6, h: 6 },

  defaultConfig: () => ({ ...DEFAULTS }),
  normalizeConfig,

  render(body, ctx) {
    const { app, config } = ctx;
    body.empty();
    ensureStyle();

    const books = listBooks(app, config.folder);
    const active = books
      .filter((book) => book.status === "2")
      .sort((a, b) => (b.lastRead || "").localeCompare(a.lastRead || "") || a.title.localeCompare(b.title));
    const finished = books.filter((book) => book.status === "4");

    const cutoff = config.maxAgeDays > 0
      ? moment().subtract(config.maxAgeDays, "days").format("YYYY-MM-DD")
      : "";
    let recent = cutoff ? active.filter((book) => book.lastRead && book.lastRead >= cutoff) : active;
    if (recent.length === 0) recent = active;

    ctx.setSubtitle(`${active.length} 本在读 · ${finished.length} 本已读`);

    if (active.length === 0) {
      const empty = body.createDiv({ cls: "hp-reading-empty" });
      setIcon(empty.createSpan(), "book-open");
      empty.createDiv({ text: "没有找到在读的书" });
      empty.createDiv({ text: `检查书籍目录：${config.folder || "（全库）"}` });
      return;
    }

    const wrap = body.createDiv({ cls: "hp-reading" });
    const summary = wrap.createDiv({ cls: "hp-reading-summary" });
    const windowText = config.maxAgeDays > 0 ? `近 ${config.maxAgeDays} 天` : "不限时间";
    summary.createSpan({ text: `在读 ${active.length} 本 · ${windowText}翻过 ${recent.length} 本` });

    const list = wrap.createDiv({ cls: "hp-reading-list" });
    for (const book of recent.slice(0, config.limit)) {
      const row = list.createDiv({ cls: "hp-reading-row" });
      row.addEventListener("click", (event) => {
        void ctx.openPath(book.file.path, { event });
      });

      const cover = row.createDiv({ cls: "hp-reading-cover" });
      if (book.cover) {
        const img = cover.createEl("img", { attr: { src: book.cover, alt: "" } });
        img.addEventListener("error", () => {
          cover.empty();
          setIcon(cover, "book");
        });
      } else {
        setIcon(cover, "book");
      }

      const info = row.createDiv({ cls: "hp-reading-info" });
      const title = info.createDiv({ cls: "hp-reading-title", text: book.title });
      title.setAttribute("title", book.title);
      info.createDiv({ cls: "hp-reading-author", text: book.author || "作者未知" });

      const bar = info.createDiv({ cls: "hp-reading-bar" });
      const fill = bar.createDiv({ cls: "hp-reading-fill" });
      fill.style.width = `${book.progress ?? 0}%`;

      const meta = info.createDiv({ cls: "hp-reading-meta" });
      meta.createSpan({ text: book.progress === null ? "进度未知" : `${book.progress}%` });
      const ago = daysSince(book.lastRead);
      meta.createSpan({
        text: ago === null ? "未记录阅读时间" : ago <= 0 ? "今天读过" : `${ago} 天前`
      });
    }
  },

  renderSettings(container, ctx) {
    const { Setting } = require("obsidian");

    new Setting(container)
      .setName("书籍目录")
      .setDesc("微信读书笔记所在文件夹。")
      .addText((text) => text.setValue(ctx.config.folder).onChange((value) => ctx.update({ folder: value })));

    new Setting(container)
      .setName("显示几本")
      .setDesc("1–8 本。")
      .addText((text) =>
        text.setValue(String(ctx.config.limit)).onChange((value) => {
          const n = Number(value);
          if (Number.isFinite(n)) ctx.update({ limit: Math.max(1, Math.min(8, Math.round(n))) });
        })
      );

    new Setting(container)
      .setName("只看最近多少天")
      .setDesc("按最后阅读日期过滤；0 = 不限。")
      .addText((text) =>
        text.setValue(String(ctx.config.maxAgeDays)).onChange((value) => {
          const n = Number(value);
          if (Number.isFinite(n)) ctx.update({ maxAgeDays: Math.max(0, Math.round(n)) });
        })
      );
  }
};
