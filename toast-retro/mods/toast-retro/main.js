// herdr-agent-toast v0.7.0 · toast-retro
//
// Retro toast: notifications as old desktop dialog boxes. A grey raised box,
// a title bar that fades from the agent's color (Claude, Codex, Gemini, ...),
// an icon for the kind, the message, and two buttons: Open goes to the agent,
// Dismiss closes the box. The boxes are grey on any theme.
//
// One mod, two jobs:
// - The layout's "toast" mod. Herdr opens a copy for every notification with
//   props {title, body, level, icon, action, timeout, overlay}. That copy adds
//   a card to the shared queue and closes.
// - A floating block (edge top, align end). That copy draws the queue, and
//   draws nothing when it is empty, which hides the block.
//
// core.js tells the agent and the kind and keeps the queue; this file draws.
// `herdr-app do toast-retro.demo` posts three sample notifications; two show.

import { View, div, PathBuilder, Background } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, notify, nextCommand } from "herdr";
import { cardOf, lineOf, createQueue } from "./core.js";

// Dialog boxes are big, so only the newest two show.
const KEEP = 2;
const DEFAULT_MS = 10000;
// Box width in px. A floating block can set its own, for a narrow spot such
// as a sidebar: "content": { "mod": "toast-retro", "props": { "width": 228 } }.
const WIDTH = 360;
const MIN_WIDTH = 180;

// The desktop's own colors, the same on every theme.
const DESK = {
  face: "#C0C0C0",
  pressed: "#B4B4B4",
  hi: "#FFFFFF",
  shade: "#808080",
  dark: "#000000",
  text: "#000000",
  title: "#FFFFFF",
  // Where every title bar fades to, and its start for a non-agent notification.
  fade: "#1B1B3A",
  plain: "#000080",
};

// Words on the boxes. Change them here. The message is "<name> <said>".
const LABEL = {
  open: "Open",
  dismiss: "Dismiss",
  close: "×",
  fallback: "Herdr",
};

// What each kind says and its icon: a shape, a mark and their colors.
const KIND = {
  needs: { said: "needs you.", shape: "triangle", mark: "!", fill: "#FFD866", ink: "#000000" },
  done: { said: "is done.", shape: "circle", mark: "✓", fill: "#FFFFFF", ink: "#0A7D2A" },
  error: { said: "hit an error.", shape: "circle", mark: "✕", fill: "#D32F2F", ink: "#FFFFFF" },
  warning: { said: "has a warning.", shape: "triangle", mark: "!", fill: "#FC9867", ink: "#000000" },
  info: { said: "says:", shape: "circle", mark: "i", fill: "#2F6FD6", ink: "#FFFFFF" },
};

// Posted by `herdr-app do toast-retro.demo`. The first two have the titles
// and levels Herdr itself uses, and show top to bottom; the Gemini one is
// posted first and pushed out, as only two boxes fit. The samples have no
// agent of their own, so their Open shows the next agent (agent.next).
const NEXT = { name: "agent.next", args: {} };
const DEMO = [
  { title: "Claude Code needs you", body: "Approve edit to app.ts", level: "error", icon: "icons/claude.svg", action: NEXT },
  { title: "Codex finished", body: "All tests passed", level: "info", icon: "icons/codex.svg", action: NEXT },
  { title: "Gemini", body: "Rate limit reached", level: "error", icon: "icons/gemini.svg" },
];

const queue = createQueue("toast-retro.queue", KEEP);

// A full-size layer of `paint` in the shape of `points` (corners in %).
const shape = (points, paint) => {
  const [first, ...rest] = points;
  let path = PathBuilder.fill().move_to(...first);
  for (const p of rest) path = path.line_to(...p);
  return window.paint_path(path.close().build(), paint).absolute().top(0).left(0).size_full();
};
const RECT = [["0%", "0%"], ["100%", "0%"], ["100%", "100%"], ["0%", "100%"]];
const TRIANGLE = [["50%", "0%"], ["100%", "100%"], ["0%", "100%"]];

// A raised edge: 1 px of white on the top and left; 1 px of grey, then 1 px
// of black, on the bottom and right.
const raised = (content) =>
  div()
    .border_b(1)
    .border_r(1)
    .border_color(DESK.dark)
    .child(div().border_t(1).border_l(1).border_color(DESK.hi).child(div().border_b(1).border_r(1).border_color(DESK.shade).child(content)));

export default class ToastRetro extends View {
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
    // Drop expired cards once a second, only when something expired.
    cx.timer.every(1000, () => queue.prune());
    // cx.notify() also ends this loop when a newer build of the file replaces it.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        cx.notify();
        if (c === "demo") for (const n of [...DEMO].reverse()) notify(n);
      }
    });
  }

  // A push button. `main` adds the dark outer line of the default button.
  button(id, words, onClick, main) {
    const face = div()
      .id(id)
      .min_w(64)
      .px(8)
      .py(2)
      .bg(DESK.face)
      .text_center()
      .text_size(12)
      .text_color(DESK.text)
      .cursor_pointer()
      .active((s) => s.bg(DESK.pressed))
      .on_click(onClick)
      .child(words);
    const b = raised(face);
    return main ? div().border_1().border_color(DESK.dark).child(b) : b;
  }

  icon(kind) {
    const box = div().relative().flex_none().size(28).flex().items_center().justify_center();
    const mark = div().text_size(15).font_extrabold().text_color(kind.ink).child(kind.mark);
    if (kind.shape === "triangle") return box.child(shape(TRIANGLE, Background.solid(kind.fill))).child(mark.pt(8));
    return box.rounded_full().bg(kind.fill).border_2().border_color(kind.ink === DESK.title ? kind.fill : kind.ink).child(mark);
  }

  card(n) {
    const kind = KIND[n.kind] ?? KIND.info;
    const name = n.name ?? LABEL.fallback;
    const line = lineOf(n);
    const gone = () => queue.remove(n.id);
    const go = n.action?.name
      ? () => {
          run(n.action.name, n.action.args ?? {});
          gone();
        }
      : null;

    const bar = h_flex()
      .relative()
      .h(20)
      .pl(6)
      .pr(3)
      .gap(6)
      .items_center()
      .child(shape(RECT, Background.linear_gradient(90, n.color ?? DESK.plain, DESK.fade)))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_bold().text_color(DESK.title).child(name))
      .child(
        raised(
          div()
            .id(`toast-retro-x-${n.id}`)
            .w(14)
            .h(12)
            .flex()
            .items_center()
            .justify_center()
            .bg(DESK.face)
            .text_size(11)
            .font_bold()
            .text_color(DESK.text)
            .cursor_pointer()
            .active((s) => s.bg(DESK.pressed))
            .on_click(gone)
            .child(LABEL.close),
        ).flex_none(),
      );

    const body = h_flex()
      .p(10)
      .gap(10)
      .items_start()
      .child(this.icon(kind))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          // What happened is never cut short; a long name is cut instead.
          .child(
            h_flex()
              .gap(7)
              .child(div().flex_shrink(1).min_w(0).truncate().text_size(12).text_color(DESK.text).child(name))
              .child(div().flex_none().text_size(12).text_color(DESK.text).child(kind.said)),
          )
          .when(Boolean(line), (el) => el.child(div().truncate().text_size(12).text_color(DESK.text).child(line))),
      );

    const buttons = h_flex()
      .justify_end()
      .gap(6)
      .px(10)
      .pb(10)
      .when(Boolean(go), (el) => el.child(this.button(`toast-retro-open-${n.id}`, LABEL.open, go, true)))
      .child(this.button(`toast-retro-dismiss-${n.id}`, LABEL.dismiss, gone, !go));

    // The raised edge adds 3 px to the width.
    return raised(v_flex().w(this.width - 3).p(2).bg(DESK.face).child(bar).child(body).child(buttons));
  }

  render(cx) {
    if (this.isToast) return div();
    const cards = queue.cards();
    if (cards.length === 0) return div();
    return v_flex().id("toast-retro").gap(6).children(cards.map((n) => this.card(n)));
  }
}
