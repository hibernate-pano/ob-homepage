#!/usr/bin/env node
/**
 * 校验 widgets/ 下的每个自定义组件是否符合 Home Pages 的组件契约。
 *
 * 只做静态加载（mock 掉 obsidian 与 DOM），不执行 render，所以不会碰真实库。
 * 用法：node scripts/validate.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIDGETS_DIR = path.join(ROOT, "widgets");

/** 内置 kind 不可覆盖。 */
const BUILTIN_KINDS = new Set([
  "hero",
  "recent",
  "quicklinks",
  "countdown",
  "pomodoro",
  "quote",
  "habit",
  "kanban",
  "stats",
  "onthisday",
  "note",
  "duowei",
  "annotations",
  "insights",
  "wechat",
  "media"
]);

/** 递归 stub：用作 require("obsidian") 和 DOM 的占位，任何属性访问都返回自己。 */
const stub = new Proxy(function obsidianStub() {}, {
  get(target, prop) {
    if (prop === Symbol.toPrimitive) return () => "";
    if (prop === Symbol.toStringTag) return "ObsidianStub";
    if (prop === "prototype") return target.prototype;
    return stub;
  },
  apply() {
    return undefined;
  },
  construct() {
    return {};
  }
});

function loadWidget(file) {
  const code = fs.readFileSync(file, "utf8");
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require(id) {
      if (id === "obsidian") return stub;
      throw new Error(`不允许 require("${id}")：组件必须自包含，只能用 require("obsidian")`);
    },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    document: stub,
    window: stub,
    localStorage: stub,
    indexedDB: stub,
    IDBKeyRange: stub,
    navigator: stub,
    fetch: stub
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(code, { filename: file }).runInContext(sandbox);
  return module.exports;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const errors = [];
const warnings = [];
const seenKinds = new Map();
const widgets = [];

if (!fs.existsSync(WIDGETS_DIR)) {
  console.error(`找不到 widgets 目录：${WIDGETS_DIR}`);
  process.exit(1);
}

const dirs = fs
  .readdirSync(WIDGETS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .sort();

if (dirs.length === 0) {
  console.error("widgets 下没有任何组件目录");
  process.exit(1);
}

for (const slug of dirs) {
  const dir = path.join(WIDGETS_DIR, slug);
  const jsFiles = fs.readdirSync(dir).filter((name) => name.endsWith(".js"));

  if (jsFiles.length !== 1) {
    errors.push(`${slug}: 目录下必须恰好有一个 .js 文件，当前 ${jsFiles.length} 个`);
    continue;
  }

  const file = path.join(dir, jsFiles[0]);
  let exported;
  try {
    exported = loadWidget(file);
  } catch (error) {
    errors.push(`${slug}: 加载失败 —— ${error.message}`);
    continue;
  }

  let def = exported;
  if (typeof def === "function") {
    try {
      def = await def();
    } catch (error) {
      errors.push(`${slug}: 导出函数执行失败 —— ${error.message}`);
      continue;
    }
  }

  if (!isPlainObject(def)) {
    errors.push(`${slug}: module.exports 必须是一个组件对象（或返回对象的函数）`);
    continue;
  }

  const where = `${slug}/${jsFiles[0]}`;
  const { kind, name, render, defaultConfig, normalizeConfig, defaultSize } = def;

  if (typeof kind !== "string" || !kind.trim()) {
    errors.push(`${where}: 缺少 kind`);
  } else {
    if (!kind.startsWith("user-")) errors.push(`${where}: kind "${kind}" 必须以 user- 开头`);
    if (BUILTIN_KINDS.has(kind)) errors.push(`${where}: kind "${kind}" 与内置组件冲突`);
    if (seenKinds.has(kind)) errors.push(`${where}: kind "${kind}" 与 ${seenKinds.get(kind)} 重复`);
    seenKinds.set(kind, where);

    const expected = `${kind.replace(/^user-/, "")}.js`;
    if (jsFiles[0] !== expected) {
      warnings.push(`${where}: 文件名建议改成 ${expected}（与 kind 对齐，便于部署和排查）`);
    }
  }

  if (typeof name !== "string" || !name.trim()) errors.push(`${where}: 缺少 name`);
  if (typeof render !== "function") errors.push(`${where}: 缺少 render(body, ctx)`);
  if (defaultConfig !== undefined && typeof defaultConfig !== "function") {
    errors.push(`${where}: defaultConfig 必须是函数`);
  }
  if (typeof defaultConfig === "function") {
    let config;
    try {
      config = defaultConfig();
    } catch (error) {
      errors.push(`${where}: defaultConfig() 执行失败 —— ${error.message}`);
    }
    if (config !== undefined && !isPlainObject(config)) {
      errors.push(`${where}: defaultConfig() 必须返回对象`);
    }
  }
  if (normalizeConfig !== undefined && typeof normalizeConfig !== "function") {
    errors.push(`${where}: normalizeConfig 必须是函数`);
  }
  if (defaultSize !== undefined) {
    const { w, h } = defaultSize ?? {};
    if (!Number.isInteger(w) || w < 1 || w > 12) errors.push(`${where}: defaultSize.w 必须是 1–12 的整数`);
    if (!Number.isInteger(h) || h < 1 || h > 24) errors.push(`${where}: defaultSize.h 必须是 1–24 的整数`);
  }

  widgets.push({
    slug,
    file: where,
    kind: kind ?? "?",
    name: name ?? "?",
    icon: def.icon ?? "box",
    accent: def.accent ?? "#64748b",
    size: defaultSize ? `${defaultSize.w}×${defaultSize.h}` : "默认",
    settings: typeof def.renderSettings === "function" ? "有" : "无"
  });
}

const pad = (value, width) => String(value).padEnd(width);
console.log("\nHome Pages 自定义组件校验\n");
console.log(
  `${pad("目录", 16)}${pad("kind", 22)}${pad("名称", 12)}${pad("尺寸", 8)}${pad("设置面板", 10)}文件`
);
console.log("-".repeat(90));
for (const widget of widgets) {
  console.log(
    `${pad(widget.slug, 16)}${pad(widget.kind, 22)}${pad(widget.name, 12)}${pad(widget.size, 8)}${pad(
      widget.settings,
      10
    )}${widget.file}`
  );
}

if (warnings.length) {
  console.log("\n警告：");
  for (const warning of warnings) console.log(`  ⚠️  ${warning}`);
}

if (errors.length) {
  console.log("\n错误：");
  for (const error of errors) console.log(`  ❌  ${error}`);
  console.log(`\n失败：${errors.length} 项\n`);
  process.exit(1);
}

console.log(`\n✅ ${widgets.length} 个组件全部通过\n`);
