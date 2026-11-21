// herdr-agent-toast v0.6.0 · toast-hud
//
// HUD toast: notifications as readouts on a control-room screen. Black
// panels, green monospace text, an uppercase status code, corner brackets in
// the color of the agent that sent them, and a blinking cursor when an agent
// needs you. The panels are black on any theme.
//
// One mod, two jobs:
// - The layout's "toast" mod. Herdr opens a copy for every notification with
//   props {title, body, level, icon, action, timeout, overlay}. That copy adds
//   a card to the shared queue and closes.
// - A floating block (edge top, align end). That copy draws the queue, and
//   draws nothing when it is empty, which hides the block.
//
// core.js tells the agent and the kind and keeps the queue; this file draws.
// `herdr-app do toast-hud.demo` posts three sample cards.
// `herdr-app do toast-hud.pick` (bind it to a key in keys.json) numbers the
// cards and opens one from the keyboard; see createPicker in core.js.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, fonts, notify, nextCommand } from "herdr";
import { cardOf, lineOf, createQueue, createPicker } from "./core.js";

const KEEP = 3;
const DEFAULT_MS = 10000;
// Card width in px. A floating block can set its own, for a narrow spot such
// as a sidebar: "content": { "mod": "toast-hud", "props": { "width": 228 } }.
// Under NARROW the heading drops "STATUS:".
const WIDTH = 360;
const MIN_WIDTH = 180;
const NARROW = 300;
const MONO = ["JetBrains Mono", "SF Mono", "Menlo", "Cascadia Mono", "Consolas", "DejaVu Sans Mono"];

// The screen's own colors, the same on every theme.
const SCREEN = {
  panel: "#0D100D",
  hover: "#1A211A",
  text: "#A9DC76",
  dim: "#5F8A3F",
  line: "#78DCE8",
};

// Words on the cards. Change them here.
const LABEL = {
  status: "STATUS:",
  prompt: ">",
  cursor: ["█", " "],
  scan: "▮▮▮▮▮▮▮▮▮▮ 100%",
  fallback: "HERDR",
};

// The status code and its color for each kind.
const KIND = {
  needs: { code: "AWAITING INPUT", tone: "#FF6188" },
  done: { code: "COMPLETE", tone: "#A9DC76" },
  error: { code: "FAULT", tone: "#FF6188" },
  warning: { code: "CAUTION", tone: "#FFD866" },
  info: { code: "NOTICE", tone: "#78DCE8" },
};

// Posted by `herdr-app do toast-hud.demo`, shown top to bottom. The first
// two have the titles and levels Herdr itself uses.
const DEMO = [
  { title: "Claude Code needs you", body: "Approve edit to app.ts", level: "error", icon: "icons/claude.svg" },
  { title: "Codex finished", body: "All tests passed", level: "info", icon: "icons/codex.svg" },
  { title: "Gemini", body: "Rate limit reached", level: "error", icon: "icons/gemini.svg" },
];

const queue = createQueue("toast-hud.queue", KEEP);

// What a click on a card does; picking a card from the keyboard does the same.
const go = (n) => {
  if (n.action?.name) run(n.action.name, n.action.args ?? {});
  queue.remove(n.id);
};

export default class ToastHud extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.isToast = Boolean(p.overlay) && typeof p.title === "string";
    if (this.isToast) {
      queue.push(cardOf(p, DEFAULT_MS));
      closeOverlay(p.overlay);
      return;
    }
    const w = Number(p.width);
    this.width = Number.isFinite(w) && w > 0 ? Math.max(w, MIN_WIDTH) : WIDTH;
    const installed = fonts();
    this.mono = MONO.find((f) => installed.includes(f)) ?? null;
    // Drop expired cards once a second, only when something expired.
    cx.timer.every(1000, () => queue.prune());
    // `pick`: numbers on the cards, and the keyboard picks one.
    this.picker = createPicker(cx, queue.cards, go);
    // cx.notify() also ends this loop when a newer build of the file replaces it.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        cx.notify();
        if (c === "demo") for (const n of [...DEMO].reverse()) notify(n);
        if (c === "pick") this.picker.pick();
      }
    });
  }

  card(n, i) {
    const kind = KIND[n.kind] ?? KIND.info;
    const edge = n.color ?? SCREEN.text;
    const line = lineOf(n);
    const corner = () => div().absolute().size(12).border_color(edge);
    const text = (s, color) => div().flex_none().text_size(12).text_color(color).child(s);

    return div()
      .id(`toast-hud-${n.id}`)
      .relative()
      .w(this.width)
      .bg(SCREEN.panel)
      .cursor_pointer()
      .hover((s) => s.bg(SCREEN.hover))
      .on_click(() => this.picker.click(n))
      .child(corner().top(0).left(0).border_t(2).border_l(2))
      .child(corner().bottom(0).right(0).border_b(2).border_r(2))
      .child(
        v_flex()
          .px(14)
          .py(10)
          .gap(3)
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .overflow_hidden()
              // While picking: the number that opens this card.
              .when(this.picker.on && i < 9, (el) => el.child(div().flex_none().px(4).bg(edge).text_size(12).font_bold().text_color(SCREEN.panel).child(String(i + 1))))
              .child(text("[", SCREEN.text))
              .child(div().flex_shrink(1).min_w(0).max_w(this.width * 0.4).truncate().text_size(12).font_bold().text_color(edge).child((n.name ?? LABEL.fallback).toUpperCase()))
              .child(text("]", SCREEN.text))
              .when(this.width >= NARROW, (el) => el.child(text(LABEL.status, SCREEN.text)))
              // The status code is never cut; a long name is cut instead.
              .child(
                h_flex()
                  .flex_none()
                  .child(div().text_size(12).font_bold().text_color(kind.tone).child(kind.code))
                  .when(n.kind === "needs", (el) => el.child(div().flex_none().text_size(12).text_color(kind.tone).frames(LABEL.cursor, 500))),
              ),
          )
          .when(Boolean(line), (el) => el.child(div().truncate().text_size(12).text_color(SCREEN.line).child(`${LABEL.prompt} ${line}`)))
          .when(n.kind === "done", (el) => el.child(div().truncate().text_size(12).text_color(SCREEN.dim).child(LABEL.scan))),
      );
  }

  render(cx) {
    if (this.isToast) return div();
    const cards = queue.cards();
    if (cards.length === 0) return div();
    const board = v_flex().id("toast-hud").gap(6).track_focus(this.picker.handle).on_key_down(this.picker.key);
    return (this.mono ? board.font_family(this.mono) : board).children(cards.map((n, i) => this.card(n, i)));
  }
}
