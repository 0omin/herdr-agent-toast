// herdr-agent-toast v0.4.0 · toast-focus
//
// Focus toast: only what needs your hands gets a card. An agent that needs
// you and an error stay on screen until you click them. Finished tasks and
// other news get no card: they are counted in a small chip under the cards,
// and a click on the chip clears it.
//
// One mod, two jobs:
// - The layout's "toast" mod. Herdr opens a copy for every notification with
//   props {title, body, level, icon, action, timeout, overlay}. That copy adds
//   a card to the shared queue, or counts the notification, and closes.
// - A floating block (edge top, align end). That copy draws the cards and the
//   chip, and draws nothing when there are neither, which hides the block.
//
// core.js tells the agent and the kind and keeps the queue; this file draws.
// `herdr-app do toast-focus.demo` posts three sample notifications.
// `herdr-app do toast-focus.pick` (bind it to a key in keys.json) numbers the
// cards and opens one from the keyboard; see createPicker in core.js.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, fonts, notify, nextCommand, shared, setShared } from "herdr";
import { cardOf, lineOf, createQueue, createPicker } from "./core.js";

const KEEP = 3;
// Card width in px. A floating block can set its own, for a narrow spot such
// as a sidebar: "content": { "mod": "toast-focus", "props": { "width": 228 } }.
// Under NARROW the "stays until clicked" note gets a row of its own.
const WIDTH = 360;
const MIN_WIDTH = 180;
const NARROW = 300;
const MONO = ["JetBrains Mono", "SF Mono", "Menlo", "Cascadia Mono", "Consolas", "DejaVu Sans Mono"];

// What was counted instead of shown: { done, more, names }.
const QUIET_KEY = "toast-focus.quiet";
// How many agent names the chip keeps, newest first.
const NAMES = 3;

// Words on the cards and the chip. Change them here.
const LABEL = {
  needs: "Needs you",
  error: "Error",
  stays: "stays until clicked",
  done: "done",
  more: "more",
  fallback: "Herdr",
};

// The kinds that get a card, and what each looks like. Every other kind is
// only counted. Colors are theme names, so light and dark themes both work.
// Two glyphs alternate every `ms`; one glyph stays still.
const KIND = {
  needs: { glyph: ["!", " "], ms: 400, tone: "blocked" },
  error: { glyph: ["✕"], tone: "ansi1" },
};

// Posted by `herdr-app do toast-focus.demo`: two cards and one finished task
// on the chip. The first two have the titles and levels Herdr itself uses.
const DEMO = [
  { title: "Claude Code needs you", body: "Approve edit to app.ts", level: "error", icon: "icons/claude.svg" },
  { title: "Codex finished", body: "All tests passed", level: "info", icon: "icons/codex.svg" },
  { title: "Gemini", body: "Rate limit reached", level: "error", icon: "icons/gemini.svg" },
];

const queue = createQueue("toast-focus.queue", KEEP);

// What a click on a card does; picking a card from the keyboard does the same.
const go = (n) => {
  // Removed first: a card that stays must not survive a click that fails.
  queue.remove(n.id);
  if (n.action?.name) run(n.action.name, n.action.args ?? {});
};

const quiet = () => {
  const q = shared(QUIET_KEY);
  return { done: Number(q?.done) || 0, more: Number(q?.more) || 0, names: Array.isArray(q?.names) ? q.names : [] };
};

export default class ToastFocus extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.isToast = Boolean(p.overlay) && typeof p.title === "string";
    if (this.isToast) {
      const card = cardOf(p, 0);
      if (KIND[card.kind]) {
        // No end time: the card stays until it is clicked.
        queue.push({ ...card, until: 0 });
      } else {
        // The agent has moved on, so its waiting card is old news.
        const term = card.action?.args?.terminal;
        if (term) for (const c of queue.cards()) if (c.action?.args?.terminal === term) queue.remove(c.id);
        const q = quiet();
        const name = card.name ?? LABEL.fallback;
        if (card.kind === "done") setShared(QUIET_KEY, { ...q, done: q.done + 1, names: [name, ...q.names.filter((x) => x !== name)].slice(0, NAMES) });
        else setShared(QUIET_KEY, { ...q, more: q.more + 1 });
      }
      closeOverlay(p.overlay);
      return;
    }
    const w = Number(p.width);
    this.width = Number.isFinite(w) && w > 0 ? Math.max(w, MIN_WIDTH) : WIDTH;
    const installed = fonts();
    this.mono = MONO.find((f) => installed.includes(f)) ?? null;
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

  card(t, n, i) {
    const kind = KIND[n.kind] ?? KIND.error;
    const tone = t[kind.tone] ?? t.accent;
    const edge = n.color ?? t.accent;
    const note = n.kind === "needs" ? LABEL.stays : "";
    const narrow = this.width < NARROW;
    // The note is the first thing to give way when the card is short of room.
    const noteEl = () => div().min_w(0).truncate().text_size(12).text_color(t.muted).child(note);
    const glyph = div().flex_none().w(12).text_size(13).font_bold().text_color(tone);

    return h_flex()
      .id(`toast-focus-${n.id}`)
      .w(this.width)
      .px(12)
      .py(8)
      .gap(10)
      .items_center()
      .bg(t.background)
      .border_2()
      .border_color(edge)
      .cursor_pointer()
      .hover((s) => s.bg(t.selection))
      .on_click(() => this.picker.click(n))
      // While picking: the number that opens this card.
      .when(this.picker.on && i < 9, (el) => el.child(div().flex_none().px(5).bg(edge).text_size(13).font_bold().text_color(t.background).child(String(i + 1))))
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
              .child(div().flex_none().max_w(this.width * 0.4).truncate().text_size(13).font_bold().text_color(edge).child(n.name ?? LABEL.fallback))
              .child(div().min_w(0).truncate().text_size(13).font_bold().text_color(tone).child(KIND[n.kind] ? LABEL[n.kind] : LABEL.error))
              .when(Boolean(note) && !narrow, (el) => el.child(noteEl().flex_1().text_right())),
          )
          .child(div().truncate().text_size(12).text_color(t.foreground).child(lineOf(n)))
          .when(Boolean(note) && narrow, (el) => el.child(noteEl())),
      );
  }

  // What was counted: "✓ 2 done Codex, Claude +1 more". A click clears it.
  chip(t, q) {
    return h_flex()
      .id("toast-focus-chip")
      .max_w(this.width)
      .px(10)
      .py(3)
      .gap(6)
      .items_center()
      .rounded(6)
      .bg(t.background)
      .cursor_pointer()
      .hover((s) => s.bg(t.selection))
      .on_click(() => setShared(QUIET_KEY, null))
      .when(q.done > 0, (el) =>
        el
          .child(div().flex_none().text_size(12).font_bold().text_color(t.done).child(`✓ ${q.done} ${LABEL.done}`))
          .child(div().min_w(0).truncate().text_size(12).text_color(t.muted).child(q.names.join(", "))),
      )
      .when(q.more > 0, (el) =>
        el.child(div().flex_none().text_size(12).text_color(t.muted).child(`${q.done > 0 ? "+" : ""}${q.more} ${LABEL.more}`)),
      );
  }

  render(cx) {
    if (this.isToast) return div();
    const cards = queue.cards();
    const q = quiet();
    const counted = q.done + q.more > 0;
    if (cards.length === 0 && !counted) return div();
    const t = theme();
    const board = v_flex().id("toast-focus").gap(6).items_start().track_focus(this.picker.handle).on_key_down(this.picker.key);
    return (this.mono ? board.font_family(this.mono) : board)
      .children(cards.map((n, i) => this.card(t, n, i)))
      .when(counted, (el) => el.child(this.chip(t, q)));
  }
}
