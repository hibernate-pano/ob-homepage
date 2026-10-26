/**
 * Home Pages 自定义组件模板
 *
 * 复制成 _scripts/home-pages/<kind>.js，改 kind / name / render 即可。
 * 保存后插件自动热重载并把它加到首页。
 */
const { Notice, setIcon } = require("obsidian");

const DEFAULTS = {
  /** 一个示例配置项。 */
  greeting: "你好"
};

function normalizeConfig(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object" && typeof raw.greeting === "string") out.greeting = raw.greeting;
  return out;
}

/** 组件自带样式（自定义脚本改不了插件的 styles.css，自己注入一段）。 */
const STYLE_ID = "hp-user-template-style";
const STYLE = `
.hp-template { display: flex; flex: 1; flex-direction: column; gap: 8px; min-height: 0; padding: 10px 14px 12px; overflow: hidden; }
.hp-template-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.appendChild(style);
}

module.exports = {
  // 1. 唯一标识（小写 + 中划线，不能与内置组件重复）
  kind: "user-template",

  // 2. 显示名称与描述
  name: "模板组件",
  description: "一个 Home Pages 自定义组件的起点模板。",

  // 3. Lucide 图标名 + 强调色
  icon: "box",
  accent: "#6366f1",

  // 4. 默认尺寸（w: 1-12 列，h: 行数）
  defaultSize: { w: 4, h: 6 },

  // 5. 默认配置
  defaultConfig: () => ({ ...DEFAULTS }),
  normalizeConfig,

  // 6. 渲染
  async render(body, ctx) {
    const { app, config } = ctx;
    body.empty();
    ensureStyle();

    ctx.setSubtitle("示例");

    const wrap = body.createDiv({ cls: "hp-template" });
    const list = wrap.createDiv({ cls: "hp-template-list" });

    // 复用插件的通用列表行样式
    const row = list.createDiv({ cls: "hp-list-row" });
    setIcon(row.createSpan({ cls: "hp-list-icon" }), "sparkles");
    const text = row.createDiv({ cls: "hp-list-text" });
    text.createDiv({ cls: "hp-list-title", text: config.greeting });

    // 标题栏加个按钮
    ctx.addHeaderAction("refresh-cw", "刷新", () => ctx.rerender());
  },

  // 7. 齿轮设置面板
  renderSettings(container, ctx) {
    const { Setting } = require("obsidian");
    new Setting(container)
      .setName("问候语")
      .setDesc("显示在卡片里的文字。")
      .addText((text) => text.setValue(ctx.config.greeting).onChange((value) => ctx.update({ greeting: value })));
  }
};
