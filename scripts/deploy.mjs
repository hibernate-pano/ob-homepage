#!/usr/bin/env node
/**
 * 把 widgets/<slug>/<slug>.js 部署到 Obsidian 库的自定义组件目录。
 *
 * 插件会扫描该目录（含子目录）下的所有 .js，但这里统一平铺复制为 <slug>.js，
 * 保持与插件设置里的约定一致，也避免目录改名导致重复注册。
 *
 * 配置：home-pages.config.json（参考 home-pages.config.example.json）
 *   { "vault": "/path/to/vault", "customWidgetsFolder": "_scripts/home-pages" }
 *
 * 用法：
 *   node scripts/deploy.mjs                  # 部署全部
 *   node scripts/deploy.mjs daily-note ...   # 只部署指定组件
 *   node scripts/deploy.mjs --dry-run        # 只看差异，不写文件
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIDGETS_DIR = path.join(ROOT, "widgets");
const CONFIG_CANDIDATES = ["home-pages.config.json", "home-pages.local.json"];
const DEFAULT_FOLDER = "_scripts/home-pages";

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { dryRun: false, only: [], config: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "-n") options.dryRun = true;
    else if (arg === "--config") options.config = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log(`用法：node scripts/deploy.mjs [--dry-run] [--config <path>] [slug ...]`);
      process.exit(0);
    } else if (arg.startsWith("-")) fail(`未知参数：${arg}`);
    else options.only.push(arg);
  }
  return options;
}

function readConfig(explicit) {
  const candidates = explicit ? [explicit] : CONFIG_CANDIDATES.map((name) => path.join(ROOT, name));
  for (const candidate of candidates) {
    const file = path.isAbsolute(candidate) ? candidate : path.join(ROOT, candidate);
    if (!fs.existsSync(file)) continue;
    try {
      const config = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof config.vault !== "string" || !config.vault.trim()) {
        fail(`${path.relative(ROOT, file)} 缺少 vault 字段`);
      }
      const vault = config.vault.trim().replace(/^~(?=$|\/)/, os.homedir());
      return {
        file,
        vault,
        folder: (config.customWidgetsFolder || DEFAULT_FOLDER).trim()
      };
    } catch (error) {
      fail(`读取 ${path.relative(ROOT, file)} 失败：${error.message}`);
    }
  }
  fail(
    `找不到配置文件。先执行：\n   cp home-pages.config.example.json home-pages.config.json\n然后填写库路径。`
  );
}

function listWidgets() {
  return fs
    .readdirSync(WIDGETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

const options = parseArgs(process.argv.slice(2));
const config = readConfig(options.config);

if (!fs.existsSync(config.vault)) fail(`库路径不存在：${config.vault}`);
const destRoot = path.resolve(config.vault, config.folder);
if (!options.dryRun) fs.mkdirSync(destRoot, { recursive: true });

const available = listWidgets();
const selected = options.only.length ? options.only : available;
const unknown = selected.filter((slug) => !available.includes(slug));
if (unknown.length) {
  fail(`未知组件：${unknown.join(", ")}\n可用组件：${available.join(", ")}`);
}

console.log(`\n库：${config.vault}`);
console.log(`目标：${path.relative(config.vault, destRoot) || "."}`);
console.log(`模式：${options.dryRun ? "预演（不写文件）" : "写入"}\n`);

let changed = 0;
for (const slug of selected) {
  const dir = path.join(WIDGETS_DIR, slug);
  const jsFiles = fs.readdirSync(dir).filter((name) => name.endsWith(".js"));
  if (jsFiles.length !== 1) {
    fail(`${slug}: 目录下必须恰好有一个 .js 文件，当前 ${jsFiles.length} 个`);
  }

  const source = path.join(dir, jsFiles[0]);
  const target = path.join(destRoot, `${slug}.js`);
  const next = fs.readFileSync(source);
  const prev = fs.existsSync(target) ? fs.readFileSync(target) : null;

  let status = "新建";
  if (prev) status = prev.equals(next) ? "无变化" : "更新";
  if (status !== "无变化") changed += 1;

  console.log(`  ${status.padEnd(4)} ${slug}.js`);

  if (!options.dryRun && status !== "无变化") {
    fs.writeFileSync(target, next);
  }
}

console.log(
  options.dryRun
    ? `\n${changed} 个文件需要同步（预演，未写入）\n`
    : `\n完成：${changed} 个文件已同步。插件通常会自动热重载；若没有，重载 Home Pages 插件。\n`
);
