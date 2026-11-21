// herdr-agent-toast v0.2.0 · toast-quest
//
// Quest toast: notifications as 8-bit game cards. An agent that needs you is
// a boss, a finished task is a cleared quest worth XP, an error is game over.
// Each card is framed in the color of the agent that sent it.
// Clears by the same agent within 2 minutes are a combo worth extra XP. Past
// LV 50 the levels earn metal trim, bronze to rainbow; past LV 200 the count
// starts again from LV 1 with a star. Milestones earn achievements, each shown
// as a card of its own. A level-up blinks the bar, and a boss shakes.
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
// Under NARROW the XP note gets a row of its own, and the combo ends the bar row.
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
// Clears by the same agent within COMBO_MS make a combo: each step adds
// COMBO_BONUS XP, up to COMBO_MAX.
const COMBO_MS = 120000;
const COMBO_BONUS = 10;
const COMBO_MAX = 50;
// Past PLAIN_LEVELS the levels earn trim: STEPS steps in each metal,
// LEVELS_PER_STEP levels a step, and the XP bar in the metal. Past the last
// step (LV 200) the count starts again from LV 1, with a star.
const PLAIN_LEVELS = 50;
const LEVELS_PER_STEP = 5;
const STEPS = 5;
const METALS = [
  { name: "BRONZE", color: "#CD7F32" },
  { name: "SILVER", color: "#C0C0C0" },
  { name: "GOLD", color: "#FFD700" },
  { name: "PLATINUM", color: "#E5E4E2" },
  { name: "DIAMOND", color: "#7FE7FF" },
  { name: "RAINBOW", color: "#FF77E9" },
];
const CYCLE = PLAIN_LEVELS + METALS.length * STEPS * LEVELS_PER_STEP;
// Days, combos and achievements, kept next to the XP:
// { total, days: { "2026-11-21": { n, err } }, combo: { Claude: { at, count } }, badges: ["q10", ...] }.
const STATS_KEY = "toast-quest.stats";
const DAYS_KEPT = 60;
// Motion: the bar of a level-up blinks, a boss's glyph shakes.
const BLINK = { from: 0.3, to: 1, period: 500 };
const SHAKE = { from: -1, to: 1, period: 360 };

// Words on the cards. Change them here.
const LABEL = {
  needs: "BOSS APPEARED!",
  done: "QUEST CLEAR!",
  up: "LEVEL UP!",
  reborn: "REBORN!",
  badge: "ACHIEVEMENT!",
  error: "GAME OVER",
  warning: "DANGER AHEAD",
  info: "NEW MESSAGE",
  combo: "COMBO",
  open: "click to open",
  fallback: "Herdr",
};

// Achievements, each earned once. `test` gets { s: stats, day, combo, streak,
// star, clean }. The quest counts (ids starting with "q") already passed when
// the stats start are marked as earned, so no flood of cards.
const BADGES = [
  { id: "q10", title: "ROOKIE", about: "10 quests cleared", test: (x) => x.s.total >= 10 },
  { id: "q100", title: "VETERAN", about: "100 quests cleared", test: (x) => x.s.total >= 100 },
  { id: "q500", title: "HERO", about: "500 quests cleared", test: (x) => x.s.total >= 500 },
  { id: "q1000", title: "LEGEND", about: "1,000 quests cleared", test: (x) => x.s.total >= 1000 },
  { id: "q5000", title: "MYTH", about: "5,000 quests cleared", test: (x) => x.s.total >= 5000 },
  { id: "day50", title: "MARATHON", about: "50 quests in one day", test: (x) => x.day.n >= 50 },
  { id: "day100", title: "IRONMAN", about: "100 quests in one day", test: (x) => x.day.n >= 100 },
  { id: "combo5", title: "COMBO MASTER", about: "a x5 combo", test: (x) => x.combo >= 5 },
  { id: "combo10", title: "UNSTOPPABLE", about: "a x10 combo", test: (x) => x.combo >= 10 },
  { id: "streak7", title: "ON FIRE", about: "7 days in a row", test: (x) => x.streak >= 7 },
  { id: "streak30", title: "DEVOTED", about: "30 days in a row", test: (x) => x.streak >= 30 },
  { id: "reborn", title: "REBORN", about: "reborn with a star", test: (x) => x.star >= 1 },
  { id: "clean", title: "CLEAN DAY", about: "10+ quests and no errors in a day", test: (x) => x.clean },
];

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
  badge: { glyph: ["✪", "✫"], ms: 400, tone: "ansi3", full: true },
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

// Where an XP total stands: `lv` (1 to CYCLE), `star` (times the count started
// again), and past PLAIN_LEVELS the `metal` and the `step` inside it (1 to 5).
const rankOf = (xp) => {
  const level = Math.floor(xp / XP_PER_LEVEL);
  const star = Math.floor(level / CYCLE);
  const lv = (level % CYCLE) + 1;
  const over = Math.max(0, Math.floor((lv - PLAIN_LEVELS - 1) / LEVELS_PER_STEP) + 1);
  return {
    lv,
    star,
    metal: over > 0 ? METALS[Math.floor((over - 1) / STEPS)] : null,
    step: over > 0 ? ((over - 1) % STEPS) + 1 : 0,
    label: `${star > 0 ? `★${star} ` : ""}LV ${lv}`,
  };
};

// A day as "2026-11-21", in local time.
const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Noon of the day before, by the calendar: a day is not always 24 hours.
const dayBefore = (t) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12).getTime();
};
// Days in a row with a cleared quest, up to today (or yesterday, before
// today's first).
const streakOf = (days, now) => {
  let n = 0;
  let t = now;
  if (!(days[dayKey(t)]?.n > 0)) t = dayBefore(t);
  while (days[dayKey(t)]?.n > 0) {
    n++;
    t = dayBefore(t);
  }
  return n;
};
const objOf = (v) => (v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {});

// Stats from shared state, or a fresh start: the quests cleared so far from
// the XP, and the quest-count achievements already passed marked as earned.
const statsOf = () => {
  const v = shared(STATS_KEY);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return {
      total: Math.max(0, Number(v.total) || 0),
      days: objOf(v.days),
      combo: objOf(v.combo),
      badges: Array.isArray(v.badges) ? [...v.badges] : [],
    };
  }
  const s = { total: Math.floor(totalXp() / XP_PER_CLEAR), days: {}, combo: {}, badges: [] };
  s.badges = BADGES.filter((b) => b.id.startsWith("q") && b.test({ s })).map((b) => b.id);
  return s;
};

export default class ToastQuest extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.isToast = Boolean(p.overlay) && typeof p.title === "string";
    if (this.isToast) {
      const card = cardOf(p, DEFAULT_MS);
      const now = Date.now();
      const s = statsOf();
      const today = dayKey(now);
      const kept = objOf(s.days[today]);
      const day = { n: Math.max(0, Number(kept.n) || 0), err: Math.max(0, Number(kept.err) || 0) };
      let xp = totalXp();
      let gain = 0;
      let combo = 0;
      let step = "";
      const earned = [];
      if (card.kind === "done") {
        const who = card.name ?? LABEL.fallback;
        const last = s.combo[who];
        combo = last && now - Number(last.at) <= COMBO_MS ? (Number(last.count) || 1) + 1 : 1;
        s.combo[who] = { at: now, count: combo };
        gain = XP_PER_CLEAR + Math.min((combo - 1) * COMBO_BONUS, COMBO_MAX);
        const before = rankOf(xp);
        xp += gain;
        setShared(XP_KEY, xp);
        const after = rankOf(xp);
        step = after.star > before.star ? "reborn" : after.lv > before.lv ? "up" : "";
        // A clean day: today's first quest, after a day of 10 or more and no errors.
        const yesterday = s.days[dayKey(dayBefore(now))];
        const clean = day.n === 0 && Boolean(yesterday) && yesterday.n >= 10 && !yesterday.err;
        s.total += 1;
        day.n += 1;
        s.days[today] = day;
        const x = { s, day, combo, streak: streakOf(s.days, now), star: after.star, clean };
        for (const b of BADGES) {
          if (!s.badges.includes(b.id) && b.test(x)) {
            s.badges.push(b.id);
            earned.push(b);
          }
        }
      } else if (card.kind === "error") {
        day.err += 1;
        s.days[today] = day;
      }
      // Only the last DAYS_KEPT days, and combos still running.
      s.days = Object.fromEntries(Object.entries(s.days).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, DAYS_KEPT));
      s.combo = Object.fromEntries(Object.entries(s.combo).filter(([, c]) => now - Number(c?.at) <= COMBO_MS));
      setShared(STATS_KEY, s);
      // Achievement cards go in first, so they sit under the quest that earned
      // them, and the quest card stays when the column is full.
      for (const b of [...earned].reverse()) queue.push({ ...card, id: `${card.id}-${b.id}`, kind: "badge", title: b.title, body: b.about, action: null });
      // Each card keeps the XP total of the moment it arrived, what it gained
      // and whether it made a level.
      queue.push({ ...card, xp, gain, combo, step });
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
    const rank = rankOf(xp);
    const lit = kind.full ? SEGMENTS : Math.floor(((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * SEGMENTS);
    // Past LV 50 the XP bar is in the metal, with its name and step beside it.
    const metal = kind.full ? null : rank.metal;
    const combo = Number(n.combo) || 0;
    const narrow = this.width < NARROW;
    // A combo goes after the heading, so the note stays short. A narrow card
    // has no room there, so it goes at the end of the bar row as "x2".
    const tag = combo > 1 ? `x${combo}` : "";
    const heading = `${LABEL[n.step] ?? LABEL[n.kind] ?? LABEL.info}${tag && !narrow ? ` ${tag} ${LABEL.combo}` : ""}`;
    const note =
      n.kind === "done" ? `+${Number(n.gain) || XP_PER_CLEAR} XP · ${rank.label}` : n.kind === "needs" && n.action?.name ? LABEL.open : "";
    const noteEl = () => div().flex_none().text_size(12).text_color(t.muted).child(note);
    const glyph = div().flex_none().w(24).text_center().text_size(20).font_bold().text_color(tone);
    const mark = kind.glyph.length > 1 ? glyph.frames(kind.glyph, kind.ms) : glyph.child(kind.glyph[0]);
    const bar = h_flex()
      .flex_1()
      .gap(2)
      .children(Array.from({ length: SEGMENTS }, (_, i) => div().h(5).flex_1().bg(i < lit ? (metal?.color ?? tone) : t.selection)));

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
      .on_click(() => this.picker.click(n))
      // While picking: the number that opens this card.
      .when(this.picker.on && i < 9, (el) => el.child(div().flex_none().px(5).bg(edge).text_size(13).font_bold().text_color(t.background).child(String(i + 1))))
      // A boss's glyph shakes.
      .child(n.kind === "needs" ? div().relative().flex_none().child(mark).loop("left", SHAKE) : mark)
      .child(
        v_flex()
          .flex_1()
          .gap(3)
          .overflow_hidden()
          .child(div().truncate().text_size(13).font_extrabold().text_color(tone).child(heading))
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
              .gap(6)
              .items_center()
              // A level-up's bar blinks.
              .child(n.step ? bar.loop("opacity", BLINK) : bar)
              .when(Boolean(metal), (el) =>
                el.child(div().flex_none().text_size(10).font_bold().text_color(metal.color).child(`${metal.name} ${rank.step}`)),
              )
              // On a narrow card the combo; the bar gives way, not the text.
              .when(Boolean(tag) && narrow, (el) => el.child(div().flex_none().text_size(10).font_bold().text_color(tone).child(tag))),
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
