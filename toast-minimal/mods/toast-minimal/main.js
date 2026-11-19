// herdr-agent-toast v0.3.0 · toast-minimal
//
// Minimal toast: each notification is one thin pill that says who and what
// ("Claude needs you"), with a dot in the color of its kind. Point at a pill
// to read the rest. Of the examples here it covers the least screen.
//
// One mod, two jobs:
// - The layout's "toast" mod. Herdr opens a copy for every notification with
//   props {title, body, level, icon, action, timeout, overlay}. That copy adds
//   a card to the shared queue and closes.
// - A floating block (edge top, align end). That copy draws the queue, and
//   draws nothing when it is empty, which hides the block.
//
// core.js tells the agent and the kind and keeps the queue; this file draws.
// `herdr-app do toast-minimal.demo` posts three sample pills.
// `herdr-app do toast-minimal.pick` (bind it to a key in keys.json) numbers the
// pills and opens one from the keyboard; see createPicker in core.js.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, notify, nextCommand, placement } from "herdr";
import { cardOf, lineOf, createQueue, createPicker } from "./core.js";

const KEEP = 3;
const DEFAULT_MS = 5000;
// The most a pill may be wide, in px; a pill is as wide as its words until
// then. A floating block can set its own, for a narrow spot such as a
// sidebar: "content": { "mod": "toast-minimal", "props": { "width": 228 } }.
const WIDTH = 360;
const MIN_WIDTH = 180;

// Words on the pills, after the agent's name. Change them here.
const LABEL = {
  needs: "needs you",
  done: "is done",
  error: "hit an error",
  warning: "has a warning",
  info: "has news",
  fallback: "Herdr",
};

// The dot's color for each kind. Colors are theme names, so light and dark
// themes both work: blocked and done are the agent status colors.
const TONE = { needs: "blocked", done: "done", error: "ansi1", warning: "ansi3", info: "accent" };

// Posted by `herdr-app do toast-minimal.demo`, shown top to bottom. The first
// two have the titles and levels Herdr itself uses.
const DEMO = [
  { title: "Claude Code needs you", body: "Approve edit to app.ts", level: "error", icon: "icons/claude.svg" },
  { title: "Codex finished", body: "All tests passed", level: "info", icon: "icons/codex.svg" },
  { title: "Gemini", body: "Rate limit reached", level: "error", icon: "icons/gemini.svg" },
];

const queue = createQueue("toast-minimal.queue", KEEP);

// What a click on a pill does; picking a pill from the keyboard does the same.
const go = (n) => {
  if (n.action?.name) run(n.action.name, n.action.args ?? {});
  queue.remove(n.id);
};

export default class ToastMinimal extends View {
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
    // The id of the pill the pointer is on.
    this.open = null;
    // Drop expired cards once a second, only when something expired.
    cx.timer.every(1000, () => queue.prune());
    // `pick`: numbers on the pills, and the keyboard picks one.
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

  pill(t, n, i) {
    const tone = t[TONE[n.kind] ?? TONE.info] ?? t.accent;
    const edge = n.color ?? t.accent;
    const more = this.open === n.id ? lineOf(n) : "";
    const dot = div().flex_none().size(7).rounded_full().bg(tone);

    return h_flex()
      .id(`toast-minimal-${n.id}`)
      .h(26)
      .max_w(this.width)
      .pl(6)
      .pr(10)
      .gap(7)
      .items_center()
      .rounded_full()
      .bg(t.background)
      .cursor_pointer()
      .hover((s) => s.bg(t.selection))
      .on_hover((hovered, cx) => {
        if (hovered) this.open = n.id;
        else if (this.open === n.id) this.open = null;
        cx.notify();
      })
      .on_click(() => go(n))
      // While picking: the number that opens this pill.
      .when(this.picker.on && i < 9, (el) => el.child(div().flex_none().px(5).rounded_full().bg(edge).text_size(12).font_bold().text_color(t.background).child(String(i + 1))))
      .child(
        !n.icon
          ? div().size(18).flex_none().rounded_full().bg(edge)
          : n.tint
            ? svg(n.icon).w(18).h(18).flex_none().text_color(edge)
            : image(n.icon).w(18).h(18).flex_none(),
      )
      .child(div().flex_none().max_w(this.width * 0.4).truncate().text_size(12).font_bold().text_color(edge).child(n.name ?? LABEL.fallback))
      // The words give way first when a pill is at its widest.
      .child(div().min_w(0).truncate().text_size(12).text_color(t.foreground).child(LABEL[n.kind] ?? LABEL.info))
      .when(Boolean(more), (el) => el.child(div().flex_1().truncate().text_size(12).text_color(t.muted).child(more)))
      // Only a pill that waits for you blinks.
      .child(n.kind === "needs" ? dot.loop("opacity", { from: 1, to: 0.2, period: 800 }) : dot);
  }

  render(cx) {
    if (this.isToast) return div();
    const cards = queue.cards();
    if (cards.length === 0) return div();
    const t = theme();
    // Pills differ in width, so they line up on the side the block sits on.
    const at = placement();
    const side = at?.edge === "left" ? "start" : at?.edge === "right" ? "end" : (at?.align ?? "end");
    // Herdr's frame leaves 5 px above and below; the same on the sides.
    const column = v_flex().id("toast-minimal").px(5).gap(4).track_focus(this.picker.handle).on_key_down(this.picker.key);
    return (side === "start" ? column.items_start() : side === "center" ? column.items_center() : column.items_end()).children(
      cards.map((n, i) => this.pill(t, n, i)),
    );
  }
}
