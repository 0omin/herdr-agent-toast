// herdr-agent-toast v0.2.0 · toast-quest
//
// Quest toast: notifications as 8-bit game cards. An agent that needs you is
// a boss, a finished task is a cleared quest worth XP, an error is game over.
// Each card is framed in the color of the agent that sent it.
//
// One mod, two jobs:
// - The layout's "toast" mod. Herdr opens a copy for every notification with
//   props {title, body, level, icon, action, timeout, overlay}. That copy adds
//   a card to the shared queue, adds XP for a cleared quest, and closes.
// - A floating block (edge top, align end). That copy draws the queue, and
//   draws nothing when it is empty, which hides the block.
//
// core.js tells the agent and the kind and keeps the queue; this file draws
// and keeps the XP. `herdr-app do toast-quest.demo` posts three sample cards.
// `herdr-app do toast-quest.pick` (bind it to a key in keys.json) numbers the
// cards and opens one from the keyboard; see createPicker in core.js.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, fonts, notify, nextCommand, shared, setShared } from "herdr";
import { cardOf, lineOf, createQueue, createPicker } from "./core.js";

const KEEP = 3;
const DEFAULT_MS = 10000;
// Card width in px. A floating block can set its own, for a narrow spot such
// as a sidebar: "content": { "mod": "toast-quest", "props": { "width": 228 } }.
// Under NARROW the XP note gets a row of its own.
const WIDTH = 360;
const MIN_WIDTH = 180;
const NARROW = 300;
const SHADOW = 4;
const MONO = ["JetBrains Mono", "SF Mono", "Menlo", "Cascadia Mono", "Consolas", "DejaVu Sans Mono"];

// XP: every cleared quest is worth XP_PER_CLEAR, and XP_PER_LEVEL makes a level.
// The total is kept in shared state, so it survives restarts.
const XP_KEY = "toast-quest.xp";
const XP_PER_CLEAR = 50;
const XP_PER_LEVEL = 500;
const SEGMENTS = 10;

// Words on the cards. Change them here.
const LABEL = {
  needs: "BOSS APPEARED!",
  done: "QUEST CLEAR!",
  error: "GAME OVER",
  warning: "DANGER AHEAD",
  info: "NEW MESSAGE",
  open: "click to open",
  fallback: "Herdr",
};

// What each kind looks like. Colors are theme names, so light and dark
// themes both work: blocked and done are the agent status colors.
// Two glyphs alternate every `ms`; one glyph stays still.
// `full`: the bar is all lit; otherwise it shows the XP inside the level.
const KIND = {
  needs: { glyph: ["☠", " "], ms: 400, tone: "blocked", full: true },
  done: { glyph: ["★", "☆"], ms: 300, tone: "done" },
  error: { glyph: ["✕"], tone: "ansi1", full: true },
  warning: { glyph: ["▲", "△"], ms: 300, tone: "ansi3", full: true },
  info: { glyph: ["✦", "✧"], ms: 300, tone: "accent" },
};

// Posted by `herdr-app do toast-quest.demo`, shown top to bottom. The first
// two have the titles and levels Herdr itself uses.
const DEMO = [
  { title: "Claude Code needs you", body: "Approve edit to app.ts", level: "error", icon: "icons/claude.svg" },
  { title: "Codex finished", body: "All tests passed", level: "info", icon: "icons/codex.svg" },
  { title: "Gemini", body: "Rate limit reached", level: "error", icon: "icons/gemini.svg" },
];

const queue = createQueue("toast-quest.queue", KEEP);

// What a click on a card does; picking a card from the keyboard does the same.
const go = (n) => {
  if (n.action?.name) run(n.action.name, n.action.args ?? {});
  queue.remove(n.id);
};
const totalXp = () => Math.max(0, Number(shared(XP_KEY)) || 0);

export default class ToastQuest extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.isToast = Boolean(p.overlay) && typeof p.title === "string";
    if (this.isToast) {
      const card = cardOf(p, DEFAULT_MS);
      let xp = totalXp();
      if (card.kind === "done") {
        xp += XP_PER_CLEAR;
        setShared(XP_KEY, xp);
      }
      // Each card keeps the XP total of the moment it arrived.
      queue.push({ ...card, xp });
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

  card(t, n, i) {
    const kind = KIND[n.kind] ?? KIND.info;
    const tone = t[kind.tone] ?? t.accent;
    const edge = n.color ?? t.accent;
    const xp = Number(n.xp) || 0;
    const level = Math.floor(xp / XP_PER_LEVEL) + 1;
    const lit = kind.full ? SEGMENTS : Math.floor(((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * SEGMENTS);
    const note =
      n.kind === "done" ? `+${XP_PER_CLEAR} XP · LV ${level}` : n.kind === "needs" && n.action?.name ? LABEL.open : "";
    const narrow = this.width < NARROW;
    const noteEl = () => div().flex_none().text_size(12).text_color(t.muted).child(note);
    const glyph = div().flex_none().w(24).text_center().text_size(20).font_bold().text_color(tone);

    const face = h_flex()
      .id(`toast-quest-${n.id}`)
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
      .on_click(() => go(n))
      // While picking: the number that opens this card.
      .when(this.picker.on && i < 9, (el) => el.child(div().flex_none().px(5).bg(edge).text_size(13).font_bold().text_color(t.background).child(String(i + 1))))
      .child(kind.glyph.length > 1 ? glyph.frames(kind.glyph, kind.ms) : glyph.child(kind.glyph[0]))
      .child(
        v_flex()
          .flex_1()
          .gap(3)
          .overflow_hidden()
          .child(div().truncate().text_size(13).font_extrabold().text_color(tone).child(LABEL[n.kind] ?? LABEL.info))
          .child(
            h_flex()
              .gap(6)
              .overflow_hidden()
              .child(
                div()
                  .flex_none()
                  .max_w(this.width * 0.4)
                  .truncate()
                  .text_size(12)
                  .font_bold()
                  .text_color(edge)
                  .child(n.name ?? LABEL.fallback),
              )
              .child(div().flex_1().truncate().text_size(12).text_color(t.foreground).child(lineOf(n)))
              .when(Boolean(note) && !narrow, (el) => el.child(noteEl())),
          )
          .when(Boolean(note) && narrow, (el) => el.child(noteEl()))
          .child(
            h_flex()
              .w_full()
              .gap(2)
              .children(Array.from({ length: SEGMENTS }, (_, i) => div().h(5).flex_1().bg(i < lit ? tone : t.selection))),
          ),
      );

    // A hard drop shadow, pixel-game style: a dimmed block in the agent color
    // behind the card, shifted down and right.
    return div()
      .relative()
      .w(this.width + SHADOW)
      .pb(SHADOW)
      .child(div().absolute().top(SHADOW).left(SHADOW).right(0).bottom(0).bg(edge).opacity(0.4))
      .child(face);
  }

  render(cx) {
    if (this.isToast) return div();
    const cards = queue.cards();
    if (cards.length === 0) return div();
    const t = theme();
    const board = v_flex().id("toast-quest").gap(4).track_focus(this.picker.handle).on_key_down(this.picker.key);
    return (this.mono ? board.font_family(this.mono) : board).children(cards.map((n, i) => this.card(t, n, i)));
  }
}
