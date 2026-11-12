// herdr-agent-toast v0.1.0 · toast-agent
//
// Agent toast: notifications as small cards in a corner, framed in the color
// of the agent that sent them (Claude, Codex, Gemini, ...) and labeled by what
// they are (needs you, done, error, warning, notice).
//
// One mod, two jobs:
// - The layout's "toast" mod. Herdr opens a copy for every notification with
//   props {title, body, level, icon, action, timeout, overlay}. That copy works
//   out the agent and the kind, adds a card to the shared queue, and closes.
// - A floating block (edge top, align end). That copy draws the queue, and
//   draws nothing when it is empty, which hides the block.
//
// `herdr-app do toast-agent.demo` posts three sample cards.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import {
  props, closeOverlay, shared, setShared, agents, run, theme, fonts, notify, nextCommand,
} from "herdr";

const QUEUE = "toast-agent.queue";
const KEEP = 3;
const DEFAULT_MS = 10000;
const WIDTH = 360;
const MONO = ["JetBrains Mono", "SF Mono", "Menlo", "Cascadia Mono", "Consolas", "DejaVu Sans Mono"];

// Words on the cards. Change them here.
const LABEL = {
  needs: "Needs you",
  done: "Done",
  error: "Error",
  warning: "Warning",
  info: "Notice",
  open: "click to open",
  fallback: "Herdr",
};

// What each kind looks like. Colors are theme names, so light and dark
// themes both work: blocked and done are the agent status colors.
const KIND = {
  needs: { glyph: ["!", " "], ms: 400, tone: "blocked" },
  done: { glyph: ["★", "☆"], ms: 300, tone: "done" },
  error: { glyph: ["✕"], tone: "ansi1" },
  warning: { glyph: ["▲", "△"], ms: 300, tone: "ansi3" },
  info: { glyph: ["✦", "✧"], ms: 300, tone: "accent" },
};

// Agents with a frame color each. Icons ship with Herdr (icons/*.svg); tint:
// a one-color glyph drawn in the frame color. `names`: Herdr's program key,
// the name the agent reports, and other process names. Agents not listed
// still get Herdr's own name and icon, in the theme's accent color.
const AGENTS = [
  { key: "claude", name: "Claude", color: "#D97757", icon: "icons/claude.svg", tint: false, names: ["claude", "claude-code", "claude code"] },
  { key: "codex", name: "Codex", color: "#7B8CFF", icon: "icons/codex.svg", tint: false, names: ["codex"] },
  { key: "gemini", name: "Gemini", color: "#8E75B2", icon: "icons/gemini.svg", tint: true, names: ["gemini"] },
  { key: "cursor", name: "Cursor", color: "#D6D8DB", icon: "icons/cursor.svg", tint: true, names: ["cursor", "cursor-agent"] },
  { key: "copilot", name: "Copilot", color: "#3FB950", icon: "icons/copilot.svg", tint: true, names: ["copilot", "github-copilot"] },
  { key: "opencode", name: "OpenCode", color: "#F5A742", icon: "icons/opencode.svg", tint: true, names: ["opencode"] },
  { key: "amp", name: "Amp", color: "#F34E3F", icon: "icons/amp.svg", tint: false, names: ["amp"] },
  { key: "kiro", name: "Kiro", color: "#9046FF", icon: "icons/kiro.svg", tint: false, names: ["kiro", "kiro-cli"] },
  { key: "grok", name: "Grok", color: "#A0A4AB", icon: "icons/grok.svg", tint: true, names: ["grok", "grok-build"] },
  { key: "kimi", name: "Kimi", color: "#1783FF", icon: "icons/kimi.svg", tint: false, names: ["kimi", "kimi-code", "kimicodecli"] },
  { key: "crush", name: "Crush", color: "#FF6DAA", icon: "icons/crush.svg", tint: false, names: ["crush"] },
  { key: "antigravity", name: "Antigravity", color: "#FFE432", icon: "icons/antigravity.svg", tint: false, names: ["antigravity", "agy"] },
];

// Posted by `herdr-app do toast-agent.demo`, shown top to bottom.
const DEMO = [
  { title: "Claude Code needs you", body: "Approve edit to app.ts", level: "warning", icon: "icons/claude.svg" },
  { title: "Codex finished", body: "All tests passed", level: "success", icon: "icons/codex.svg" },
  { title: "Gemini", body: "Rate limit reached", level: "error", icon: "icons/gemini.svg" },
];

// The queue is saved with Herdr's shared state, so it can outlive a restart:
// always drop expired cards when reading it.
const stored = () => {
  const q = shared(QUEUE);
  return Array.isArray(q) ? q : [];
};
const live = (q) => q.filter((n) => !n.until || n.until > Date.now());
const queue = () => live(stored());

// Keep the newest KEEP cards, but drop other cards before a "needs you" one.
function keep(q) {
  const out = [...q];
  while (out.length > KEEP) {
    let i = out.length - 1;
    while (i >= 0 && out[i].kind === "needs") i--;
    out.splice(i >= 0 ? i : out.length - 1, 1);
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (hay, name) => new RegExp(`(^|[^a-z0-9])${esc(name)}([^a-z0-9]|$)`).test(hay);
// Herdr's own notifications are titled "<Program> needs you" / "<Program> finished".
const OWN = /^(.*?)\s+(needs you|finished)\s*$/i;

// Which agent: the terminal the click goes to (Herdr's own notifications focus
// the agent), else the icon file, else the program named in Herdr's own title.
function agentOf(p) {
  const term = p.action?.args?.terminal;
  const a = term ? agents().find((x) => x.address === term) : null;
  const ids = [a?.app, a?.program?.key].filter(Boolean).map((s) => s.toLowerCase());
  const iconFile = (p.icon ?? "").toLowerCase().split("/").pop().replace(/\.svg$/, "");
  const program = (OWN.exec(p.title ?? "")?.[1] ?? "").toLowerCase();
  const hit =
    AGENTS.find((g) => g.names.some((n) => ids.includes(n))) ??
    AGENTS.find((g) => g.names.includes(iconFile)) ??
    AGENTS.find((g) => g.names.some((n) => word(program, n)));
  const status = a?.status ?? null;
  if (hit) return { name: hit.name, color: hit.color, icon: hit.icon, tint: hit.tint, status };
  if (a?.program?.agent) return { name: a.program.name, color: null, icon: a.program.icon, tint: a.program.tint, status };
  return { name: null, color: null, icon: p.icon ?? null, tint: false, status };
}

// What it is: an error level first, then the agent's status (blocked: waiting
// for an answer or an approval; done: finished) or Herdr's own title, then the level.
function kindOf(p, status) {
  if (p.level === "error") return "error";
  const own = OWN.exec(p.title ?? "")?.[2]?.toLowerCase();
  if (status === "blocked" || own === "needs you") return "needs";
  if (status === "done" || own === "finished" || p.level === "success") return "done";
  if (p.level === "warning") return "warning";
  return "info";
}

export default class ToastAgent extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.isToast = Boolean(p.overlay) && typeof p.title === "string";
    if (this.isToast) {
      this.enqueue(p);
      closeOverlay(p.overlay);
      return;
    }
    this.mono = MONO.find((f) => fonts().includes(f)) ?? null;
    // Drop expired cards once a second, only when something expired.
    cx.timer.every(1000, () => {
      const q = stored();
      const l = live(q);
      if (l.length !== q.length) setShared(QUEUE, l);
    });
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c === "demo") for (const n of [...DEMO].reverse()) notify(n);
      }
    });
  }

  enqueue(p) {
    const who = agentOf(p);
    const ms = typeof p.timeout === "number" && p.timeout > 0 ? p.timeout : DEFAULT_MS;
    const card = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: p.title ?? "",
      body: p.body ?? "",
      kind: kindOf(p, who.status),
      name: who.name,
      color: who.color,
      icon: who.icon,
      tint: who.tint,
      action: p.action ?? null,
      until: Date.now() + ms,
    };
    setShared(QUEUE, keep([card, ...queue()]));
  }

  card(t, n) {
    const kind = KIND[n.kind] ?? KIND.info;
    const tone = t[kind.tone] ?? t.accent;
    const edge = n.color ?? t.accent;
    const note = n.kind === "needs" && n.action?.name ? LABEL.open : "";
    const glyph = div().flex_none().w(12).text_size(13).font_bold().text_color(tone);
    // The heading already says who and what, so drop "X needs you" / "X finished"
    // (only when the agent is known: else the title is the only place it is named).
    const plain = Boolean(n.name) && (OWN.test(n.title) || n.title === n.name);
    const line = (plain && n.body ? [n.body] : [n.title, n.body]).filter(Boolean).join(" · ");

    return h_flex()
      .id(`toast-agent-${n.id}`)
      .w(WIDTH)
      .px(12)
      .py(8)
      .gap(10)
      .items_center()
      .bg(t.background)
      .border_2()
      .border_color(edge)
      .cursor_pointer()
      .hover((s) => s.bg(t.selection))
      .on_click(() => {
        if (n.action?.name) run(n.action.name, n.action.args ?? {});
        setShared(QUEUE, queue().filter((m) => m.id !== n.id));
      })
      .child(
        !n.icon
          ? div().size(22).flex_none().bg(edge)
          : n.tint
            ? svg(n.icon).w(22).h(22).flex_none().text_color(edge)
            : image(n.icon).w(22).h(22).flex_none(),
      )
      .child(
        v_flex()
          .flex_1()
          .gap(3)
          .overflow_hidden()
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .overflow_hidden()
              .child(kind.glyph.length > 1 ? glyph.frames(kind.glyph, kind.ms) : glyph.child(kind.glyph[0]))
              .child(div().flex_none().text_size(13).font_bold().text_color(edge).child(n.name ?? LABEL.fallback))
              .child(div().flex_1().truncate().text_size(13).font_bold().text_color(tone).child(LABEL[n.kind] ?? LABEL.info)),
          )
          .child(
            h_flex()
              .gap(6)
              .overflow_hidden()
              .child(div().flex_1().truncate().text_size(12).text_color(t.foreground).child(line))
              .when(Boolean(note), (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child(note))),
          ),
      );
  }

  render(cx) {
    if (this.isToast) return div();
    const q = queue();
    if (q.length === 0) return div();
    const t = theme();
    const board = v_flex().id("toast-agent").gap(6);
    return (this.mono ? board.font_family(this.mono) : board).children(q.map((n) => this.card(t, n)));
  }
}
