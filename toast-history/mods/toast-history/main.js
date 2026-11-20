// herdr-agent-toast v0.5.0 · toast-history
//
// History toast: every notification becomes a row in a list that is kept.
// A new notification opens the list for 10 s; then the list folds into a
// badge with the number of rows that are new. Click the badge to open the
// list again, and a row to go to that agent.
//
// One mod, two jobs:
// - The layout's "toast" mod. Herdr opens a copy for every notification with
//   props {title, body, level, icon, action, timeout, overlay}. That copy adds
//   a row to the shared log, says until when the list stays open, and closes.
// - A floating block (edge top, align end). That copy draws the list or the
//   badge, and draws nothing when the log is empty, which hides the block.
//
// core.js tells the agent and the kind; this file keeps the log and draws.
// `herdr-app do toast-history.demo` posts three sample notifications.
// `herdr-app do toast-history.pick` (bind it to a key in keys.json) opens the
// list, numbers the rows and goes to one from the keyboard; see createPicker
// in core.js.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, fonts, notify, nextCommand, shared, setShared, placement } from "herdr";
import { cardOf, lineOf, createPicker } from "./core.js";

// How many rows are kept, and how many show before the list scrolls.
const KEEP = 20;
const SHOW = 8;
const ROW = 26;
// How long a new notification keeps the list open.
const DEFAULT_MS = 10000;
// List width in px. A floating block can set its own, for a narrow spot such
// as a sidebar: "content": { "mod": "toast-history", "props": { "width": 228 } }.
// Under NARROW the rows drop the time.
const WIDTH = 360;
const MIN_WIDTH = 180;
const NARROW = 300;
const MONO = ["JetBrains Mono", "SF Mono", "Menlo", "Cascadia Mono", "Consolas", "DejaVu Sans Mono"];

// Shared state: the rows (newest first), until when the list stays open, and
// the time of the last fold or row click (rows after it are new).
const LOG_KEY = "toast-history.log";
const PEEK_KEY = "toast-history.peek";
const SEEN_KEY = "toast-history.seen";

// Words on the list and the badge. Change them here.
const LABEL = {
  title: "Notifications",
  clear: "clear",
  fold: "▾",
  badge: "≡",
  fallback: "Herdr",
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// The glyph at the end of a row. Colors are theme names, so light and dark
// themes both work: blocked and done are the agent status colors.
const KIND = {
  needs: { glyph: "!", tone: "blocked" },
  done: { glyph: "★", tone: "done" },
  error: { glyph: "✕", tone: "ansi1" },
  warning: { glyph: "▲", tone: "ansi3" },
  info: { glyph: "✦", tone: "accent" },
};

// Posted by `herdr-app do toast-history.demo`, shown top to bottom. The first
// two have the titles and levels Herdr itself uses.
const DEMO = [
  { title: "Claude Code needs you", body: "Approve edit to app.ts", level: "error", icon: "icons/claude.svg" },
  { title: "Codex finished", body: "All tests passed", level: "info", icon: "icons/codex.svg" },
  { title: "Gemini", body: "Rate limit reached", level: "error", icon: "icons/gemini.svg" },
];

const log = () => {
  const l = shared(LOG_KEY);
  return Array.isArray(l) ? l : [];
};
const peek = () => Number(shared(PEEK_KEY)) || 0;
const seen = () => Number(shared(SEEN_KEY)) || 0;

// "14:02" for today, "Nov 15" for an earlier day.
const two = (n) => String(n).padStart(2, "0");
const timeOf = (at) => {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString()
    ? `${two(d.getHours())}:${two(d.getMinutes())}`
    : `${LABEL.months[d.getMonth()]} ${d.getDate()}`;
};

// What a click on a row does; picking a row from the keyboard does the same.
const go = (n) => {
  // Marked first: a click that fails must not leave the row new.
  setShared(SEEN_KEY, Date.now());
  if (n.action?.name) run(n.action.name, n.action.args ?? {});
};

export default class ToastHistory extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.isToast = Boolean(p.overlay) && typeof p.title === "string";
    if (this.isToast) {
      const { until, ...row } = cardOf(p, DEFAULT_MS);
      // The open time first, so the row is not drawn as a badge for a moment.
      setShared(PEEK_KEY, Math.max(until, peek()));
      setShared(LOG_KEY, [{ ...row, at: Date.now() }, ...log()].slice(0, KEEP));
      closeOverlay(p.overlay);
      return;
    }
    const w = Number(p.width);
    this.width = Number.isFinite(w) && w > 0 ? Math.max(w, MIN_WIDTH) : WIDTH;
    const installed = fonts();
    this.mono = MONO.find((f) => installed.includes(f)) ?? null;
    // Opened by a click on the badge: stays open until it is folded.
    this.pinned = false;
    // Whether the last draw showed the list.
    this.wasOpen = false;
    // Fold once the time is up and the pointer is off the block: redraws only
    // at that moment.
    cx.timer.every(1000, (cx) => {
      if (this.wasOpen && !this.isOpen()) cx.notify();
    });
    // `pick`: numbers on the rows that show without scrolling, and the
    // keyboard picks one.
    this.picker = createPicker(cx, () => log().slice(0, SHOW), go);
    // cx.notify() also ends this loop when a newer build of the file replaces it.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        cx.notify();
        if (c === "demo") for (const n of [...DEMO].reverse()) notify(n);
        if (c === "pick") {
          // The list opens to be picked from, and stays open like a click on the badge.
          if (log().length > 0) this.pinned = true;
          this.picker.pick();
        }
      }
    });
  }

  isOpen() {
    if (this.pinned || peek() > Date.now()) return true;
    // Time is up, but an open list does not fold under the pointer. Herdr
    // says whether the pointer is on the floating block.
    return this.wasOpen && Boolean(placement()?.hovered);
  }

  // Folds the list; no row is new any more. setShared redraws.
  fold() {
    this.pinned = false;
    this.wasOpen = false;
    setShared(PEEK_KEY, 0);
    setShared(SEEN_KEY, Date.now());
  }

  row(t, n, isNew, i) {
    const kind = KIND[n.kind] ?? KIND.info;
    const tone = t[kind.tone] ?? t.accent;
    const edge = n.color ?? t.accent;
    return h_flex()
      .id(`toast-history-${n.id}`)
      .flex_none()
      .h(ROW)
      .px(10)
      .gap(8)
      .items_center()
      .cursor_pointer()
      .when(isNew, (el) => el.bg(t.selection))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.picker.click(n))
      // While picking: the number that picks this row.
      .when(this.picker.on && i < SHOW, (el) => el.child(div().flex_none().px(5).bg(edge).text_size(11).font_bold().text_color(t.background).child(String(i + 1))))
      .when(this.width >= NARROW, (el) =>
        el.child(div().flex_none().w(44).text_size(11).text_color(t.muted).child(timeOf(n.at))),
      )
      .child(
        !n.icon
          ? div().size(16).flex_none().bg(edge)
          : n.tint
            ? svg(n.icon).w(16).h(16).flex_none().text_color(edge)
            : image(n.icon).w(16).h(16).flex_none(),
      )
      .child(div().flex_none().max_w(this.width * 0.3).truncate().text_size(12).font_bold().text_color(edge).child(n.name ?? LABEL.fallback))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(lineOf(n)))
      .child(div().flex_none().text_size(12).font_bold().text_color(tone).child(kind.glyph));
  }

  // The open list: a heading (click to fold, "clear" empties the log) and the rows.
  list(t, rows, since) {
    return v_flex()
      .id("toast-history-list")
      .w(this.width)
      .bg(t.background)
      .border_1()
      .border_color(t.border)
      .child(
        h_flex()
          .px(10)
          .py(5)
          .gap(8)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .child(
            h_flex()
              .id("toast-history-fold")
              .flex_1()
              .min_w(0)
              .gap(6)
              .items_center()
              .cursor_pointer()
              .on_click(() => this.fold())
              .child(div().flex_none().text_size(12).text_color(t.muted).child(LABEL.fold))
              .child(div().truncate().text_size(12).font_bold().text_color(t.foreground).child(LABEL.title))
              .child(div().flex_none().text_size(12).text_color(t.muted).child(String(rows.length))),
          )
          .child(
            div()
              .id("toast-history-clear")
              .flex_none()
              .text_size(12)
              .text_color(t.muted)
              .cursor_pointer()
              .hover((s) => s.text_color(t.foreground))
              .on_click(() => {
                this.pinned = false;
                setShared(PEEK_KEY, 0);
                setShared(LOG_KEY, null);
              })
              .child(LABEL.clear),
          ),
      )
      .child(
        v_flex()
          .id("toast-history-rows")
          .max_h(SHOW * ROW)
          .min_h(0)
          .overflow_y_scroll()
          .children(rows.map((n, i) => this.row(t, n, n.at > since, i))),
      );
  }

  // The folded list: a glyph, and how many rows are new.
  badge(t, fresh) {
    return h_flex()
      .id("toast-history-badge")
      .h(22)
      .px(8)
      .gap(6)
      .items_center()
      .rounded(6)
      .bg(t.background)
      .cursor_pointer()
      .hover((s) => s.bg(t.selection))
      .on_click((_e, cx) => {
        this.pinned = true;
        cx.notify();
      })
      .child(div().flex_none().text_size(12).text_color(t.muted).child(LABEL.badge))
      .when(fresh > 0, (el) =>
        el.child(div().flex_none().px(6).rounded_full().bg(t.blocked).text_size(11).font_bold().text_color(t.background).child(String(fresh))),
      );
  }

  render(cx) {
    if (this.isToast) return div();
    const rows = log();
    this.wasOpen = rows.length > 0 && this.isOpen();
    if (rows.length === 0) return div();
    const t = theme();
    const since = seen();
    const board = v_flex().id("toast-history").track_focus(this.picker.handle).on_key_down(this.picker.key);
    return (this.mono ? board.font_family(this.mono) : board).child(
      this.wasOpen ? this.list(t, rows, since) : this.badge(t, rows.filter((n) => n.at > since).length),
    );
  }
}
