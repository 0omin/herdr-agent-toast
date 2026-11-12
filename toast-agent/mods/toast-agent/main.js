// herdr-agent-toast v0.1.0 · toast-agent
//
// Agent toast: notifications as small cards in a corner, framed in the color
// of the agent that sent them (Claude, Codex, Gemini, ...) and labeled by what
// they are (needs you, done, error, warning, notice).
//
// One mod, two jobs:
// - The layout's "toast" mod. Herdr opens a copy for every notification with
//   props {title, body, level, icon, action, timeout, overlay}. That copy adds
//   a card to the shared queue and closes.
// - A floating block (edge top, align end). That copy draws the queue, and
//   draws nothing when it is empty, which hides the block.
//
// core.js tells the agent and the kind and keeps the queue; this file draws.
// `herdr-app do toast-agent.demo` posts three sample cards.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, fonts, notify, nextCommand } from "herdr";
import { cardOf, lineOf, createQueue } from "./core.js";

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
// Two glyphs alternate every `ms`; one glyph stays still.
const KIND = {
  needs: { glyph: ["!", " "], ms: 400, tone: "blocked" },
  done: { glyph: ["★", "☆"], ms: 300, tone: "done" },
  error: { glyph: ["✕"], tone: "ansi1" },
  warning: { glyph: ["▲", "△"], ms: 300, tone: "ansi3" },
  info: { glyph: ["✦", "✧"], ms: 300, tone: "accent" },
};

// Posted by `herdr-app do toast-agent.demo`, shown top to bottom. The first
// two have the titles and levels Herdr itself uses.
const DEMO = [
  { title: "Claude Code needs you", body: "Approve edit to app.ts", level: "error", icon: "icons/claude.svg" },
  { title: "Codex finished", body: "All tests passed", level: "info", icon: "icons/codex.svg" },
  { title: "Gemini", body: "Rate limit reached", level: "error", icon: "icons/gemini.svg" },
];

const queue = createQueue("toast-agent.queue", KEEP);

export default class ToastAgent extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.isToast = Boolean(p.overlay) && typeof p.title === "string";
    if (this.isToast) {
      queue.push(cardOf(p, DEFAULT_MS));
      closeOverlay(p.overlay);
      return;
    }
    const installed = fonts();
    this.mono = MONO.find((f) => installed.includes(f)) ?? null;
    // Drop expired cards once a second, only when something expired.
    cx.timer.every(1000, () => queue.prune());
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c === "demo") for (const n of [...DEMO].reverse()) notify(n);
      }
    });
  }

  card(t, n) {
    const kind = KIND[n.kind] ?? KIND.info;
    const tone = t[kind.tone] ?? t.accent;
    const edge = n.color ?? t.accent;
    const note = n.kind === "needs" && n.action?.name ? LABEL.open : "";
    const glyph = div().flex_none().w(12).text_size(13).font_bold().text_color(tone);

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
        queue.remove(n.id);
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
              .child(div().flex_1().truncate().text_size(12).text_color(t.foreground).child(lineOf(n)))
              .when(Boolean(note), (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child(note))),
          ),
      );
  }

  render(cx) {
    if (this.isToast) return div();
    const cards = queue.cards();
    if (cards.length === 0) return div();
    const t = theme();
    const board = v_flex().id("toast-agent").gap(6);
    return (this.mono ? board.font_family(this.mono) : board).children(cards.map((n) => this.card(t, n)));
  }
}
