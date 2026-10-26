/**
 * 笔记活跃热力图 —— Home Pages 自定义组件
 *
 * GitHub 风格热力图：某天只要改过任意一篇笔记就算一次活跃，一篇笔记一天只算一次。
 *
 * 数据来源（两个合并，互补）：
 *   1. 笔记的最后修改时间（mtime）——覆盖全部历史；
 *   2. Obsidian 核心「文件恢复」插件的快照记录（IndexedDB）——精确到每一次编辑，
 *      能看出「同一天改过两篇 / 同一篇改过多次」，但核心插件只保留 7 天。
 * 两者合并后的结果会存进组件配置，这样快照过期后历史依然保留。
 *
 * 安装：Home Pages 设置 →「自定义组件目录」放本文件，或命令面板「粘贴代码新建组件」。
 */
const { TFile, setIcon } = require("obsidian");

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

/** 可选时间范围（周数）。 */
const RANGES = { "12w": 12, "26w": 26, "52w": 52 };
const DEFAULTS = { range: "52w" };

/** 保留多少天的历史，超出的旧数据丢弃（避免配置文件无限膨胀）。 */
const KEEP_DAYS = 420;

function normalizeConfig(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") {
    if (typeof raw.range === "string" && RANGES[raw.range]) out.range = raw.range;
  }
  return out;
}

/**
 * 路径明细放在 localStorage（按库隔离），配置里只存每天的数量。
 * 这样 data.json 不会因为上千条路径而变大。
 */
function storageKey(app) {
  return `${app.appId ?? "vault"}-home-pages-note-activity`;
}

function loadPaths(app) {
  try {
    const raw = localStorage.getItem(storageKey(app));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out = {};
    for (const [day, paths] of Object.entries(parsed)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(paths)) continue;
      out[day] = paths.filter((p) => typeof p === "string");
    }
    return out;
  } catch (error) {
    console.error("Home Pages: 读取活跃历史失败", error);
    return {};
  }
}

function savePaths(app, history) {
  try {
    localStorage.setItem(storageKey(app), JSON.stringify(history));
  } catch (error) {
    console.error("Home Pages: 保存活跃历史失败", error);
  }
}

// ---- 日期工具 --------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function isoOfTs(ts) {
  return isoOf(new Date(ts));
}

function addDays(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(y, m - 1, d + delta));
}

// ---- 组件自带样式 ----------------------------------------------------------

const STYLE_ID = "hp-user-note-activity-style";
const STYLE = `
.hp-activity { display: flex; flex: 1; flex-direction: column; gap: 10px; min-height: 0; padding: 10px 14px 12px; overflow: hidden; }
.hp-activity-bar { display: flex; flex: none; align-items: center; gap: 6px; }
.hp-activity-range { display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px; background: var(--background-modifier-hover); }
.hp-activity-range button {
  padding: 2px 10px; border: none; border-radius: 999px; background: transparent;
  color: var(--hp-muted); font-size: 11px; font-weight: 700; cursor: pointer; box-shadow: none;
}
.hp-activity-range button.is-active { background: var(--hp-accent); color: #fff; }
.hp-activity-legend { display: flex; align-items: center; gap: 4px; margin-left: auto; color: var(--hp-muted); font-size: 10px; }
.hp-activity-legend i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
.hp-activity-cal { display: flex; gap: 7px; min-height: 0; padding: 2px 2px 6px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.hp-activity-dow { display: grid; flex: none; grid-template-rows: repeat(7, 12px); gap: 3px; padding-top: 16px; }
.hp-activity-dow span { display: flex; align-items: center; height: 12px; color: var(--hp-muted); font-size: 8.5px; line-height: 1; }
.hp-activity-right { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.hp-activity-months { display: grid; height: 13px; gap: 3px; }
.hp-activity-months span { color: var(--hp-muted); font-size: 8.5px; line-height: 1; white-space: nowrap; }
.hp-activity-grid { display: grid; grid-auto-flow: column; grid-auto-columns: 12px; grid-template-rows: repeat(7, 12px); gap: 3px; }
.hp-activity-cell { width: 12px; height: 12px; border-radius: 3px; background: var(--background-modifier-hover); cursor: pointer; transition: transform 0.1s ease; }
.hp-activity-cell:hover { transform: scale(1.25); }
.hp-activity-cell.is-empty { background: transparent; cursor: default; }
.hp-activity-cell.is-empty:hover { transform: none; }
.hp-activity-cell.lv-1 { background: rgba(34, 197, 94, 0.32); }
.hp-activity-cell.lv-2 { background: rgba(34, 197, 94, 0.54); }
.hp-activity-cell.lv-3 { background: rgba(22, 163, 74, 0.76); }
.hp-activity-cell.lv-4 { background: rgba(21, 128, 61, 0.96); }
.hp-activity-cell.is-today { outline: 2px solid var(--interactive-accent); outline-offset: 1px; }
.hp-activity-popover {
  position: fixed; z-index: var(--layer-popover, 30); min-width: 170px; max-width: 280px;
  padding: 8px 10px; border: 1px solid var(--hp-border); border-radius: 10px;
  background: var(--background-primary); box-shadow: var(--shadow-s);
}
.hp-activity-popover h4 { margin: 0 0 5px; color: var(--hp-muted); font-size: 11px; font-weight: 700; }
.hp-activity-popover a { display: block; padding: 2px 0; color: var(--text-normal); font-size: 12px; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hp-activity-popover a:hover { color: var(--hp-accent); }
.hp-activity-popover .is-empty { color: var(--hp-muted); font-size: 12px; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

// ---- 数据采集 --------------------------------------------------------------

/**
 * 读取核心「文件恢复」插件的快照记录（IndexedDB）。
 * 只保留最近几天，但能精确反映「哪一天改过哪篇笔记」。
 */
async function readSnapshots(app) {
  const name = `${app.appId}-backup`;
  const rows = [];
  try {
    // 先确认库存在，避免误建一个空库影响核心插件。
    if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return rows;
    const dbs = await indexedDB.databases();
    if (!dbs.some((db) => db.name === name)) return rows;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("blocked"));
    });
    if (db.objectStoreNames.contains("backups")) {
      const store = db.transaction("backups", "readonly").objectStore("backups");
      // 只取最近 30 天的快照：核心插件默认只保留 7 天，范围放宽一点足够。
      const lower = Date.now() - 30 * 86400000;
      const index = store.index("ts");
      const all = await new Promise((resolve) => {
        const request = index.getAll(IDBKeyRange.lowerBound(lower));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve([]);
      });
      for (const row of all) {
        if (!row || typeof row.path !== "string" || typeof row.ts !== "number") continue;
        if (!row.path.toLowerCase().endsWith(".md")) continue;
        rows.push({ path: row.path, ts: row.ts });
      }
    }
    db.close();
  } catch (error) {
    console.error("Home Pages: 读取文件恢复快照失败", error);
  }
  return rows;
}

/**
 * 采集活跃数据：最后修改时间 + 快照记录。
 * 返回 Map<日期, Set<笔记路径>>，同一篇笔记同一天只算一次。
 */
async function collectActivity(app) {
  const map = new Map();
  const add = (day, path) => {
    if (!day || !path) return;
    let set = map.get(day);
    if (!set) {
      set = new Set();
      map.set(day, set);
    }
    set.add(path);
  };

  // 1) 每篇笔记的最后修改日（覆盖全部历史）
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.stat.mtime > 0) add(isoOfTs(file.stat.mtime), file.path);
  }

  // 2) 快照记录里的每次编辑（近几天，能看出当天的多次改动）
  for (const snapshot of await readSnapshots(app)) {
    add(isoOfTs(snapshot.ts), snapshot.path);
  }

  return map;
}

/** 把新采集的数据并进历史（取并集，历史只会越来越全）。 */
function mergeHistory(stored, collected, keepFrom) {
  const merged = {};
  for (const [day, paths] of Object.entries(stored ?? {})) {
    if (day < keepFrom) continue;
    merged[day] = [...new Set(paths)];
  }
  for (const [day, paths] of collected) {
    if (day < keepFrom) continue;
    const set = new Set(merged[day] ?? []);
    for (const path of paths) set.add(path);
    merged[day] = [...set];
  }
  return merged;
}
/** 连续活跃天数（今天还没写不算中断）。 */
function streakOf(history) {
  const today = isoOf(new Date());
  let day = today;
  if (!history[day]?.length) day = addDays(day, -1);
  let streak = 0;
  while (history[day]?.length) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

// ---- 组件 ------------------------------------------------------------------

module.exports = {
  kind: "user-note-activity",
  name: "笔记活跃",
  description: "GitHub 风格热力图：当天改过任意笔记就算活跃，一篇笔记一天只算一次。",
  icon: "layout-grid",
  accent: "#16a34a",
  defaultSize: { w: 6, h: 6 },

  defaultConfig: () => ({ ...DEFAULTS }),
  normalizeConfig,

  async render(body, ctx) {
    const { app, config } = ctx;
    body.empty();
    ensureStyle();

    const weeks = RANGES[config.range] ?? RANGES["52w"];
    const totalDays = weeks * 7;
    const today = isoOf(new Date());
    const startIso = addDays(today, -(totalDays - 1));
    const keepFrom = addDays(today, -KEEP_DAYS);

    const collected = await collectActivity(app);
    if (!ctx.isAlive()) return;

    const stored = loadPaths(app);
    const history = mergeHistory(stored, collected, keepFrom);
    // 只有数据变了才写回，避免每次渲染都改配置。
    if (JSON.stringify(history) !== JSON.stringify(stored)) savePaths(app, history);

    const counts = new Map();
    for (const [day, paths] of Object.entries(history)) counts.set(day, paths.length);
    const todayCount = counts.get(today) ?? 0;
    const activeDays = [...counts.values()].filter((n) => n > 0).length;
    const maxCount = Math.max(1, ...counts.values());

    ctx.setSubtitle(`近 ${weeks} 周 · ${activeDays} 天有记录`);

    // ---- 顶部统计 ----
    const tiles = body.createDiv({ cls: "hp-kpis" });
    const tile = (value, label, tone) => {
      const el = tiles.createDiv({ cls: `hp-kpi hp-tone-${tone}` });
      el.createDiv({ cls: "hp-kpi-value", text: String(value) });
      el.createDiv({ cls: "hp-kpi-label", text: label });
    };
    tile(todayCount, "今天编辑", 0);
    tile(streakOf(history), "连续天数", 1);
    tile(activeDays, "活跃天数", 2);

    // ---- 范围切换 + 图例 ----
    const bar = body.createDiv({ cls: "hp-activity-bar" });
    const range = bar.createDiv({ cls: "hp-activity-range" });
    for (const [key, label] of [["12w", "12 周"], ["26w", "26 周"], ["52w", "一年"]]) {
      const button = range.createEl("button", {
        cls: key === config.range ? "is-active" : "",
        text: label,
        attr: { type: "button" }
      });
      button.addEventListener("click", () => {
        if (config.range === key) return;
        void ctx.saveConfig({ range: key }).then(() => ctx.rerender());
      });
    }
    const legend = bar.createDiv({ cls: "hp-activity-legend" });
    legend.createSpan({ text: "少" });
    for (let level = 0; level <= 4; level++) {
      const swatch = legend.createEl("i");
      swatch.style.background = level === 0
        ? "var(--background-modifier-hover)"
        : ["", "rgba(34,197,94,0.32)", "rgba(34,197,94,0.54)", "rgba(22,163,74,0.76)", "rgba(21,128,61,0.96)"][level];
    }
    legend.createSpan({ text: "多" });

    // ---- 热力图 ----
    const cal = body.createDiv({ cls: "hp-activity-cal" });
    const dow = cal.createDiv({ cls: "hp-activity-dow" });
    for (const label of WEEKDAYS) dow.createSpan({ text: label });
    const right = cal.createDiv({ cls: "hp-activity-right" });

    // 首列要落在周日上，前面补空格
    const firstDow = new Date(`${startIso}T12:00:00`).getDay();
    const padded = [];
    for (let i = 0; i < firstDow; i++) padded.push(null);
    for (let i = 0; i < totalDays; i++) padded.push(addDays(startIso, i));

    // 月份标签：每列第一个有效日期落在新月份时标注
    const monthLabels = [];
    let lastMonth = -1;
    for (let week = 0; week < padded.length / 7; week++) {
      monthLabels.push("");
      for (let row = 0; row < 7; row++) {
        const day = padded[week * 7 + row];
        if (!day) continue;
        const month = Number(day.slice(5, 7)) - 1;
        if (month !== lastMonth) {
          monthLabels[week] = MONTHS[month];
          lastMonth = month;
        }
        break;
      }
    }
    const months = right.createDiv({ cls: "hp-activity-months" });
    months.style.gridTemplateColumns = `repeat(${padded.length / 7}, 12px)`;
    for (const label of monthLabels) months.createSpan({ text: label });

    const grid = right.createDiv({ cls: "hp-activity-grid" });
    for (const day of padded) {
      if (!day) {
        grid.createDiv({ cls: "hp-activity-cell is-empty" });
        continue;
      }
      const count = counts.get(day) ?? 0;
      const level = count <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / maxCount) * 4)));
      const cell = grid.createDiv({
        cls: `hp-activity-cell lv-${level}${day === today ? " is-today" : ""}`,
        attr: { title: `${day} · ${count} 篇` }
      });
      cell.addEventListener("click", () => openDayPopover(ctx, day, history[day] ?? [], cell));
    }

    // 滚到最右（今天）
    window.requestAnimationFrame(() => {
      cal.scrollLeft = cal.scrollWidth;
    });
  },

  renderSettings(container, ctx) {
    const { Setting } = require("obsidian");
    const days = Object.keys(loadPaths(ctx.app)).length;
    container.createDiv({
      cls: "setting-item-description",
      text: `已记录 ${days} 天的活跃历史（来自笔记修改时间 + 文件恢复快照，保留最近 ${KEEP_DAYS} 天）。`
    });
    new Setting(container).setName("默认时间范围")
      .addDropdown((dropdown) => dropdown
        .addOptions({ "12w": "近 12 周", "26w": "近 26 周", "52w": "近一年" })
        .setValue(ctx.config.range)
        .onChange((value) => ctx.update({ range: RANGES[value] ? value : "52w" })));
    new Setting(container).setName("清空历史记录")
      .setDesc("删除已累积的活跃历史（下次渲染会按当前笔记重新统计）。")
      .addButton((button) => button.setButtonText("清空").setWarning().onClick(() => {
        savePaths(ctx.app, {});
        ctx.refresh();
      }));
  }
};

/** 点击某天：弹出当天改动过的笔记。 */
function openDayPopover(ctx, day, paths, anchor) {
  document.querySelector(".hp-activity-popover")?.remove();
  const popover = document.body.createDiv({ cls: "hp-activity-popover" });
  popover.createEl("h4", { text: `${day} · ${paths.length} 篇` });
  if (paths.length === 0) {
    popover.createDiv({ cls: "is-empty", text: "当天没有记录" });
  } else {
    for (const path of paths) {
      const file = ctx.app.vault.getAbstractFileByPath(path);
      const link = popover.createEl("a", { text: file instanceof TFile ? file.basename : path });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        void ctx.openPath(path, { event });
        close(false);
      });
    }
  }

  let closed = false;
  const close = (rerender) => {
    if (closed) return;
    closed = true;
    popover.remove();
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    if (rerender) ctx.rerender();
  };
  const onDown = (event) => {
    if (!popover.contains(event.target)) close(false);
  };
  const onKey = (event) => {
    if (event.key === "Escape") close(false);
  };
  window.setTimeout(() => {
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  ctx.registerCleanup(() => close(false));

  const rect = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - popover.offsetWidth - 8));
  const below = rect.bottom + 6;
  const top = below + popover.offsetHeight > window.innerHeight - 8 ? rect.top - 8 - popover.offsetHeight : below;
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(8, top)}px`;
}
