// herdr-agent-toast v1.4.0 · toast-chroma
//
// Chroma toast: every agent is a creature that grows with the tasks it
// finishes. A finished task is a cleared quest worth XP for the agent that sent
// it. A creature has ten forms of five levels each (LV 50 is the last); the
// first levels of its 3rd, 5th and 7th form (LV 11, 21, 31) each open a skill,
// and LV 5 opens its two items. A cleared quest is a fight: a mob comes in, is
// hit and falls apart, and 1 fight in 20 it drops an item the creature has not
// found yet. A skill is not a notification: it plays on the card of a cleared
// quest, as dots that fly from the creature to the mob. Only found items can
// be worn, and an item changes nothing but the creature's look.
//
// One mod, two jobs:
// - The layout's "toast" mod. Herdr opens a copy for every notification with
//   props {title, body, level, icon, action, timeout, overlay}. That copy adds
//   a card to the shared queue, adds XP for a cleared quest, and closes.
// - A floating block (edge top, align end). That copy draws the queue, under it
//   a lane with a small creature for every agent that is open, and on a key
//   the party and the gear in place of the cards.
//
// core.js tells the agent and the kind and keeps the queue; creatures.js says
// where each form sits in the PNG sheets next to it; this file draws and keeps
// the XP. Commands, each run as `herdr-app do toast-chroma.<command>`:
// - `demo` posts three sample cards.
// - `pick` numbers the cards and opens one from the keyboard (createPicker in core.js).
// - `menu` takes the keyboard for one key: P shows the party, E the gear.
//   Bind it in keys.json, e.g. "cmd-shift-j": "toast-chroma.menu", then press
//   that key, let go, and press P or E. `party` and `gear` open them directly.
// - `preview` shows a card of a creature at its last form with a skill, a
//   fight and a dropped item, a different agent each time. It earns nothing.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, fonts, notify, nextCommand, shared, setShared, agents, focused, settings } from "herdr";
import { AGENTS, cardOf, lineOf, createQueue, createPicker } from "./core.js";
import { CREATURES } from "./creatures.js";

const KEEP = 3;
// How long a card of `preview` shows. A card of the queue has no end time.
const PREVIEW_MS = 10000;
// Card width in px. A floating block can set its own, for a narrow spot such
// as a sidebar, and can leave the lane out:
// "content": { "mod": "toast-chroma", "props": { "width": 228, "lane": false } }.
const WIDTH = 360;
const MIN_WIDTH = 200;
const SHADOW = 4;
const MONO = ["JetBrains Mono", "SF Mono", "Menlo", "Cascadia Mono", "Consolas", "DejaVu Sans Mono"];
// The sheets, from Herdr's config folder.
const ART = "mods/toast-chroma/";
// The creature of an agent that has none of its own.
const FALLBACK = "Grok";

// XP is kept per agent in shared state, so it survives restarts:
// { Claude: 1250, Codex: 300 }. Every cleared quest is worth XP_PER_CLEAR and
// XP_PER_LEVEL makes a level. A form has LEVELS_PER_FORM levels, and the count
// stops at LAST_LEVEL.
const XP_KEY = "toast-chroma.xp";
const XP_PER_CLEAR = 50;
const XP_PER_LEVEL = 500;
const LEVELS_PER_FORM = 5;
const LAST_LEVEL = 50;
const SEGMENTS = 10;
// Clears by the same agent within COMBO_MS make a combo: each step adds
// COMBO_BONUS XP, up to COMBO_MAX. { Claude: { at, count } }.
const COMBO_KEY = "toast-chroma.combo";
const COMBO_MS = 120000;
const COMBO_BONUS = 10;
const COMBO_MAX = 50;
// 1 in GOLDEN_ODDS cleared quests is golden and worth GOLDEN_TIMES the XP.
const GOLDEN_ODDS = 50;
const GOLDEN_TIMES = 3;
// The forms (0 to 9) that open a skill each, and the level that opens the items.
const SKILL_FORMS = [2, 4, 6];
const GEAR_LEVEL = 5;
// The item each agent wears, by id: { Claude: "ember-core" }.
const GEAR_KEY = "toast-chroma.gear";
// The items each agent has found, by id: { Claude: ["ember-core"] }. A cleared
// quest drops one the agent lacks DROP_ODDS of the time.
const BAG_KEY = "toast-chroma.bag";
const DROP_ODDS = 0.05;
const PARTY_MAX = 6;

// A skill on a card: DOTS dots wait at the creature for WAIT_MS, fly for
// FLY_MS (each DOT_DELAY later than the one before) the way of their skill.
// A card older than FRESH_MS when first drawn (Herdr restarted) plays nothing.
const DOTS = 14;
const WAIT_MS = 120;
const FLY_MS = 650;
const DOT_DELAY = 20;
// Then they fly on to the mob in STRIKE_MS, each STRIKE_DELAY after the one
// before, and go out as they land (IMPACT_MS).
const STRIKE_MS = 220;
const STRIKE_DELAY = 10;
const IMPACT_MS = 120;
// When the dots have flown their skill's way and turn to the mob.
const SHAPED_MS = WAIT_MS + FLY_MS + DOTS * DOT_DELAY;
const FRESH_MS = 3000;
// The fight on a card of a cleared quest, over the card's text: the beats, and
// the ms after the card is first drawn at which each one starts. The mob comes
// in, is hit, is gone (its pieces burst out, a dropped item pops up and flies
// to the creature), and the text is back. On a card that plays a skill the mob
// is hit when the first dot lands, and the beats after it move as much.
const FIGHT = { enter: 1, hit: 2, gone: 3, burst: 4, fly: 5, over: 6 };
const BEATS = [60, 760, 1200, 1260, 1900, 2300];
// A mob is drawn MOB_PX px a square on a stage at least STAGE px high.
const MOB_PX = 2;
const STAGE = 40;
// How far the creature itself moves while its skill plays, in squares [right, down].
const POSE = { dash: [8, -2], slam: [0, -6], ward: [0, 1], eruption: [0, -4], other: [1, -2] };
// Motion: the bar of a level-up blinks, an agent that needs you shakes, a
// working one bobs.
const BLINK = { from: 0.3, to: 1, period: 500 };
const SHAKE = { from: -1, to: 1, period: 360 };
const BOB = { from: -1, to: 1, period: 600 };

// Words on the cards. Change them here.
const LABEL = {
  needs: "BOSS APPEARED!",
  done: "QUEST CLEAR!",
  up: "LEVEL UP!",
  evolved: "EVOLVED!",
  golden: "GOLDEN QUEST!",
  error: "GAME OVER",
  warning: "DANGER AHEAD",
  info: "NEW MESSAGE",
  open: "click to open",
  skill: "NEW SKILL",
  loot: "LOOT",
  missing: "NOT FOUND",
  fallback: "Herdr",
};

// What each kind looks like. Colors are theme names, so light and dark
// themes both work: blocked and done are the agent status colors.
// Two glyphs alternate every `ms`; one glyph stays still.
const KIND = {
  needs: { glyph: ["☠", " "], ms: 400, tone: "blocked" },
  done: { glyph: ["★", "☆"], ms: 300, tone: "done" },
  error: { glyph: ["✕"], tone: "ansi1" },
  warning: { glyph: ["▲", "△"], ms: 300, tone: "ansi3" },
  info: { glyph: ["✦", "✧"], ms: 300, tone: "accent" },
};

// The mark over a creature in the lane, by agent status; the order they stand in.
const MARK = {
  blocked: { frames: ["!", " "], ms: 400 },
  done: { frames: ["★"] },
  working: { frames: [".", "..", "..."], ms: 300 },
  idle: { frames: ["z", "zZ", "zZz"], ms: 700 },
};
const ORDER = { blocked: 0, done: 1, working: 2, idle: 3 };

// The four item shapes, mirrored like the creatures. "#" is the dark rim, "+"
// the item's color, "*" its shine.
const SHAPES = {
  plate: [".###..", "#####.", "#+*###", "#+++##", ".####.", "..##.."],
  core: ["...#...", "..#+#..", ".#+*+#.", "#+***+#", ".#+*+#.", "..#+#..", "...#..."],
  crest: ["..#....", ".###...", ".#+*#..", ".##+*#.", "..##+##", "...####", ".....##"],
  ring: ["..###..", ".##+##.", "##...##", "##...##", "##...##", ".##+##.", "..###.."],
};

// The mobs a cleared quest fights. m, n and l are the mob's color, its shade
// and its light; w and k the white and the dark of its eyes; s and S a stem.
const MOB_TONES = { w: "#F4F1EA", k: "#120F16" };
const MOBS = [
  {
    name: "SLIME",
    tones: { m: "#6CCB5F", n: "#3E8A3A", l: "#B6F0A8" },
    px: [
      "......mmmm......",
      "....mmllmmmm....",
      "...mllmmmmmmm...",
      "..mlmmmmmmmmmn..",
      "..mmmwkmmwkmmn..",
      ".mmmmwkmmwkmmmn.",
      ".mmmmmmmmmmmmmn.",
      ".mmmmmkkkkmmmmn.",
      "mmmmmmmmmmmmmmnn",
      "mmmmmmmmmmmmmnnn",
      ".nnnnnnnnnnnnnn.",
    ],
  },
  {
    name: "BAT",
    tones: { m: "#8E6CCB", n: "#5A3F8C", l: "#C3B0EA" },
    px: [
      "n................n",
      "nn......m..m....nn",
      "nnn.....mmmm...nnn",
      "nnnn...mmmmmm.nnnn",
      "nnnnn.mwmmmwmnnnnn",
      ".nnnnnmkmmmkmnnnn.",
      "..nnnnmmmmmmmnnn..",
      "...nnnmmwmwmmnn...",
      ".....n.mmmmm.n....",
      "........m.m.......",
    ],
  },
  {
    name: "MUSHROOM",
    tones: { m: "#E5484D", n: "#A8323A", l: "#F4F1EA", s: "#F2E6D0", S: "#C9B99A" },
    px: [
      ".....mmmmmm.....",
      "...mmllmmmmmm...",
      "..mmllmmmmllmm..",
      ".mmmmmmmmmllmmm.",
      ".mmllmmmmmmmmmm.",
      "mmmmmmmmmmmllmmm",
      ".nnnnnnnnnnnnnn.",
      "....ssssssss....",
      "....skssssks....",
      "....skssssks....",
      "....ssssssss....",
      "...ssssssssss...",
      "...SSSS..SSSS...",
    ],
  },
];

// Posted by `herdr-app do toast-chroma.demo`, shown top to bottom. The first
// two have the titles and levels Herdr itself uses.
const DEMO = [
  { title: "Claude Code needs you", body: "Approve edit to app.ts", level: "error", icon: "icons/claude.svg" },
  { title: "Codex finished", body: "All tests passed", level: "info", icon: "icons/codex.svg" },
  { title: "Gemini", body: "Rate limit reached", level: "error", icon: "icons/gemini.svg" },
];

const queue = createQueue("toast-chroma.queue", KEEP);

const objOf = (v) => (v && typeof v === "object" && !Array.isArray(v) ? { ...v } : {});
const xpOf = (v) => Math.max(0, Number(v) || 0);
const creatureOf = (name) => CREATURES[name] ?? CREATURES[FALLBACK];
const colorOf = (name) => AGENTS.find((g) => g.name === name)?.color ?? null;

// Where an XP total stands: the form (`stage`, 0 to 9), the `level` (1 to 50)
// and how far into that level it is (`part`, 0 to 1).
const rankOf = (xp) => {
  const level = Math.min(LAST_LEVEL, Math.floor(xp / XP_PER_LEVEL) + 1);
  return { stage: Math.floor((level - 1) / LEVELS_PER_FORM), level, part: Math.min(1, (xp - (level - 1) * XP_PER_LEVEL) / XP_PER_LEVEL) };
};
const firstLevel = (stage) => stage * LEVELS_PER_FORM + 1;

// Every agent with XP, best first.
const roster = () =>
  Object.entries(objOf(shared(XP_KEY)))
    .map(([name, v]) => ({ name, xp: xpOf(v) }))
    .filter((x) => x.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .map((x) => ({ ...x, c: creatureOf(x.name), rank: rankOf(x.xp), color: colorOf(x.name) }));

// The ids of the items an agent has found.
const foundOf = (name) => {
  const ids = objOf(shared(BAG_KEY))[name];
  return Array.isArray(ids) ? ids : [];
};
// The id of the item an agent wears: one it has found, once its level has opened the items.
const wornOf = (name, rank) => {
  const id = objOf(shared(GEAR_KEY))[name];
  return rank.level >= GEAR_LEVEL && foundOf(name).includes(id) ? id : null;
};

// Which agent a terminal runs, as core.js tells it for a notification.
const nameOf = (a) => {
  const ids = [a.app, a.program?.key].filter(Boolean).map((s) => s.toLowerCase());
  return AGENTS.find((g) => g.names.some((n) => ids.includes(n)))?.name ?? a.program?.name ?? "";
};

// "#D97757" toward [r, g, b] by t (0 to 1), as a hex color.
const mix = (hex, to, t) =>
  `#${[1, 3, 5].map((k, i) => Math.round(parseInt(hex.slice(k, k + 2), 16) * (1 - t) + to[i] * t).toString(16).padStart(2, "0")).join("")}`;

// One form cut out of its creature's sheet: a window of the form's size over
// the whole sheet, moved so the form shows. `sq` is the px of one square.
const figure = (c, [x, y, w, h], sq) =>
  div()
    .relative()
    .flex_none()
    .w(w * sq)
    .h(h * sq)
    .overflow_hidden()
    .child(image(`${ART}${c.sheet}`).absolute().left(-x * sq).top(-y * sq).w(c.size[0] * sq).h(c.size[1] * sq));

// Rows of squares drawn as blocks: a run of the same color in a row is one
// block. `tone`: the color of each letter; "." is empty.
const blocks = (rows, tone, sq) => {
  const out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      if (row[x] !== ".") out.push(div().absolute().left(x * sq).top(y * sq).w((end - x) * sq).h(sq).bg(tone[row[x]]));
      x = end;
    }
  });
  return div().relative().flex_none().w(rows[0].length * sq).h(rows.length * sq).children(out);
};

const icon = (item, sq) =>
  blocks(SHAPES[item.shape] ?? SHAPES.core, { "#": mix(item.color, [14, 18, 34], 0.68), "+": item.color, "*": mix(item.color, [255, 255, 245], 0.62) }, sq);

// A form at card size, wearing the item with id `wear` on that item's pin.
const body = (c, form, sq, wear) => {
  const [, , w, h] = form.box;
  const el = div().relative().flex_none().w(w * sq).h(h * sq).child(figure(c, form.box, sq));
  const k = c.items.findIndex((it) => it.id === wear);
  if (k < 0) return el;
  const [px, py] = form.pins[k];
  const wide = (SHAPES[c.items[k].shape] ?? SHAPES.core)[0].length;
  return el.child(
    div()
      .absolute()
      .left(Math.round(px - (wide - 1) / 2) * sq)
      .top((py - 3) * sq)
      .child(icon(c.items[k], sq)),
  );
};

// Where each dot of a skill starts and ends, in squares from the top left of a
// creature `w` by `h` that faces right: [[x, y], [x, y]].
const dotsOf = (cue, w, h) => {
  const cx = w / 2;
  const cy = h * 0.59;
  const foot = h - 2;
  return Array.from({ length: DOTS }, (_, i) => {
    const t = i / (DOTS - 1);
    const turn = (Math.PI * 2 * i) / DOTS;
    // A trail left behind the lunge, in four bands.
    if (cue === "dash") return [[cx, cy], [w * 0.45 * (1 - t), h * (0.3 + (i % 4) * 0.14)]];
    // Five lanes that spread as they go.
    if (cue === "fan") {
      const lane = (i % 5) - 2;
      const far = Math.floor(i / 5) / 2;
      return [[w - 4, cy], [w + 4 + far * 30 - Math.abs(lane) * 2, cy + lane * (2 + far * 5)]];
    }
    if (cue === "wave") return [[w - 4, cy], [w + 2 + t * 38, cy + Math.sin(t * 9) * (2 + t * 6)]];
    // An arc in front of the creature.
    if (cue === "ward") {
      const a = (t - 0.5) * 2.4;
      return [[cx, cy], [cx + Math.cos(a) * (w * 0.5 + 5), cy + Math.sin(a) * h * 0.42]];
    }
    // A ring around it, each dot a part of a turn on.
    if (cue === "orbit") {
      const at = (a) => [cx + Math.cos(a) * (w * 0.5 + 4), h * 0.5 + Math.sin(a) * h * 0.4];
      return [at(turn), at(turn + 1.2)];
    }
    // A ring that opens along the ground.
    if (cue === "slam") return [[cx, foot], [Math.max(-6, cx + Math.cos(turn) * (w * 0.5 + 12)), foot + Math.sin(turn) * 3]];
    // Eruption: seven rays that rise from the feet, a tall and a short dot each.
    const ray = (i % 7) - 3;
    return [[cx + ray * w * 0.06, foot], [cx + ray * w * 0.14, foot - h * (i < 7 ? 0.9 : 0.5) + Math.abs(ray) * 2]];
  });
};

export default class ToastChroma extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.isToast = Boolean(p.overlay) && typeof p.title === "string";
    if (this.isToast) {
      const card = cardOf(p, 0);
      const now = Date.now();
      let earned = {};
      // Only an agent's cleared quest earns: the XP is that agent's.
      if (card.kind === "done" && card.name) {
        const all = objOf(shared(XP_KEY));
        const combos = objOf(shared(COMBO_KEY));
        const last = combos[card.name];
        const combo = last && now - Number(last.at) <= COMBO_MS ? (Number(last.count) || 1) + 1 : 1;
        const golden = Math.random() < 1 / GOLDEN_ODDS;
        const gain = (XP_PER_CLEAR + Math.min((combo - 1) * COMBO_BONUS, COMBO_MAX)) * (golden ? GOLDEN_TIMES : 1);
        const before = rankOf(xpOf(all[card.name]));
        const xp = xpOf(all[card.name]) + gain;
        const after = rankOf(xp);
        setShared(XP_KEY, { ...all, [card.name]: xp });
        // Only combos still running are kept.
        const running = Object.entries(combos).filter(([, c]) => now - Number(c?.at) <= COMBO_MS);
        setShared(COMBO_KEY, { ...Object.fromEntries(running), [card.name]: { at: now, count: combo } });
        const step = after.stage > before.stage ? "evolved" : after.level > before.level ? "up" : "";
        // The skill this card plays: the one this form just opened, else any open one.
        const open = SKILL_FORMS.filter((s) => s <= after.stage).length;
        const fresh = step === "evolved" && SKILL_FORMS.includes(after.stage);
        const skill = open > 0 ? { ...creatureOf(card.name).skills[fresh ? open - 1 : Math.floor(Math.random() * open)], fresh } : null;
        // The mob of its fight, and now and then an item this agent has not found yet.
        const found = foundOf(card.name);
        const left = creatureOf(card.name).items.filter((it) => !found.includes(it.id));
        const loot = left.length > 0 && Math.random() < DROP_ODDS ? left[Math.floor(Math.random() * left.length)].id : null;
        if (loot) setShared(BAG_KEY, { ...objOf(shared(BAG_KEY)), [card.name]: [...found, loot] });
        earned = { xp, gain, combo, golden, step, skill, loot, mob: Math.floor(Math.random() * MOBS.length) };
      }
      // A cleared quest keeps the XP total of the moment it arrived, what it
      // gained, the skill it plays, the mob it fights and the item that dropped. No end time: a card stays until it is clicked.
      queue.push({ ...card, ...earned, at: now, until: 0 });
      closeOverlay(p.overlay);
      return;
    }
    const w = Number(p.width);
    this.width = Number.isFinite(w) && w > 0 ? Math.max(w, MIN_WIDTH) : WIDTH;
    this.showLane = p.lane !== false;
    const installed = fonts();
    this.mono = MONO.find((f) => installed.includes(f)) ?? null;
    this.after = (ms, f) => cx.timer.after(ms, f);
    // Cards of `preview`, drawn over the queue and never saved.
    this.samples = [];
    this.turn = 0;
    // How far each card's skill and fight have played: card id to { phase, beat }
    // (phase: 0 waiting, 1 flying, 2 striking, 3 over; beat: see FIGHT).
    this.fx = new Map();
    // What shows in place of the cards: null, "menu", "party" or "gear"; in the gear,
    // the agent `sel` of the roster. `back` is the pane the keyboard came from.
    this.view = null;
    this.viewAt = 0;
    this.sel = 0;
    this.back = null;
    this.seen = "";
    // `pick`: numbers on the cards, and the keyboard picks one. The menu uses
    // the same focus handle.
    this.picker = createPicker(cx, () => this.cards(), (n) => this.open(n));
    // Once a second: drop the previews that expired, and draw again when an agent's status
    // changed or the menu, the party or the gear lost the keyboard (a click
    // elsewhere closes it, so the cards are back).
    cx.timer.every(1000, (cx) => {
      const now = Date.now();
      let stale = false;
      const live = this.samples.filter((n) => n.until > now);
      if (live.length !== this.samples.length) {
        this.samples = live;
        stale = true;
      }
      const ids = new Set(this.cards().map((n) => n.id));
      for (const id of this.fx.keys()) if (!ids.has(id)) this.fx.delete(id);
      const seen = this.showLane ? agents().map((a) => `${a.address}:${a.status}`).join(" ") : "";
      if (seen !== this.seen) {
        this.seen = seen;
        stale = true;
      }
      if (this.view && now - this.viewAt > 500 && !this.picker.handle.is_focused()) {
        this.view = null;
        stale = true;
      }
      if (stale) cx.notify();
    });
    // cx.notify() also ends this loop when a newer build of the file replaces it.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        cx.notify();
        if (c === "demo") for (const n of [...DEMO].reverse()) notify(n);
        if (c === "pick") {
          this.view = null;
          this.picker.pick();
        }
        if (c === "menu") this.show(this.view ? null : "menu");
        if (c === "party" || c === "gear") this.show(this.view === c ? null : c);
        if (c === "preview") this.preview();
      }
    });
  }

  cards() {
    return [...this.samples, ...queue.cards()];
  }

  // What a click on a card does; picking a card from the keyboard does the same.
  open(n) {
    if (n.sample) {
      this.samples = this.samples.filter((s) => s.id !== n.id);
      return;
    }
    // Removed first: a card that stays must not survive a click that fails.
    queue.remove(n.id);
    if (n.action?.name) run(n.action.name, n.action.args ?? {});
  }

  // Shows the menu, the party or the gear and takes the keyboard, or with
  // null closes it and gives the keyboard back to the pane it came from
  // (unless a click elsewhere has taken it since).
  show(view) {
    const handle = this.picker.handle;
    if (!view) {
      if (this.view && handle.is_focused()) {
        if (this.back?.terminal) run("pane.focus", { terminal: this.back.terminal });
        else if (this.back?.pane) run("pane.focus", { pane: this.back.pane });
      }
      this.view = null;
      return;
    }
    if (!this.view) {
      const f = focused();
      this.back = f ? { terminal: f.terminal, pane: f.pane } : null;
    }
    this.picker.on = false;
    this.view = view;
    this.viewAt = Date.now();
    handle.focus();
    // Again once it is drawn: with no card and no lane there was nothing to focus yet.
    this.after(60, (cx) => {
      if (this.view) handle.focus();
      cx.notify();
    });
  }

  // Keys while the menu, the party or the gear shows; otherwise the picker's.
  key(e, cx) {
    if (!this.view) return this.picker.key(e, cx);
    const m = e.modifiers ?? {};
    const k = String(e.key ?? "").toLowerCase();
    // Chords are let through, so the menu key itself still works. P and E in
    // the menu count with the menu key's modifiers still held.
    if (m.control || m.alt || (m.platform && !(this.view === "menu" && (k === "p" || k === "e")))) return;
    const list = roster();
    if (k === "p" && this.view !== "party") this.show("party");
    else if (k === "e" && this.view !== "gear") this.show("gear");
    else if (this.view === "gear" && list.length > 0 && (k === "left" || k === "right")) this.sel = (this.sel + (k === "left" ? list.length - 1 : 1)) % list.length;
    else if (this.view === "gear" && (k === "1" || k === "2")) this.wear(list[this.sel % Math.max(1, list.length)], Number(k) - 1);
    else this.show(null);
    cx.stop_propagation();
    cx.notify();
  }

  // Puts item `i` (0 or 1) on an agent of the roster, or takes it off when worn.
  // Nothing happens with an item the agent has not found.
  wear(who, i) {
    if (!who || who.rank.level < GEAR_LEVEL) return;
    const all = objOf(shared(GEAR_KEY));
    const id = who.c.items[i].id;
    if (!foundOf(who.name).includes(id)) return;
    setShared(GEAR_KEY, { ...all, [who.name]: all[who.name] === id ? null : id });
  }

  // `preview`: a cleared quest of the next agent, at its last form. Its mob
  // drops the item the creature wears.
  preview() {
    const names = Object.keys(CREATURES);
    const name = names[this.turn % names.length];
    const c = CREATURES[name];
    const k = this.turn % c.skills.length;
    const mob = this.turn % MOBS.length;
    this.turn += 1;
    const wear = c.items[this.turn % c.items.length].id;
    const now = Date.now();
    const card = {
      id: `sample-${now}`,
      sample: true,
      kind: "done",
      name,
      color: c.color,
      title: `${name} finished`,
      body: "A preview: nothing is earned",
      xp: LAST_LEVEL * XP_PER_LEVEL,
      gain: XP_PER_CLEAR,
      combo: 1,
      step: "",
      skill: { ...c.skills[k], fresh: false },
      wear,
      loot: wear,
      mob,
      at: now,
      until: now + PREVIEW_MS,
    };
    this.samples = [card, ...this.samples].slice(0, KEEP);
  }

  // How far the skill and the fight of card `n` have played. The first time a
  // fresh card is drawn their steps are put on timers; each one draws again.
  playOf(n) {
    let f = this.fx.get(n.id);
    if (!f) {
      const fresh = Date.now() - Number(n.at) <= FRESH_MS;
      f = { phase: fresh && n.skill ? 0 : 3, beat: fresh && n.mob != null ? 0 : FIGHT.over };
      this.fx.set(n.id, f);
      const play = (key, times) =>
        times.forEach((ms, i) =>
          this.after(ms, (cx) => {
            f[key] = i + 1;
            cx.notify();
          }),
        );
      const late = f.phase === 0 ? SHAPED_MS + STRIKE_MS - BEATS[FIGHT.hit - 1] : 0;
      if (f.phase === 0) play("phase", [WAIT_MS, SHAPED_MS, SHAPED_MS + STRIKE_MS + DOTS * STRIKE_DELAY + IMPACT_MS]);
      if (f.beat === 0) play("beat", BEATS.map((ms, i) => (i < FIGHT.hit - 1 ? ms : ms + late)));
    }
    return f;
  }

  // Where the fight of card `n` is drawn, in px: a stage `wide` by `H` over
  // the card's text, as high as the creature at the least, and on it the mob,
  // `mw` by `mh`, `rest` from the left, its feet at `ground`: the line the
  // creature stands on (the stage is centered on the creature).
  stageOf(n, form, sq) {
    const mob = MOBS[(Number(n.mob) || 0) % MOBS.length];
    const px = MOB_PX * sq;
    const wide = this.width - 32 - form.box[2] * sq;
    const mw = mob.px[0].length * px;
    const H = Math.max(STAGE * sq, form.box[3] * sq);
    return { mob, px, wide, mw, mh: mob.px.length * px, H, ground: (H + form.box[3] * sq) / 2, rest: Math.max(0, wide - mw - 2 * sq) };
  }

  // The fight of a cleared quest, drawn over the card's text: the mob comes in
  // from the right under its HP bar, blinks when it is hit, and bursts into
  // four pieces; the item it dropped pops up and flies to the creature. Native
  // motion moves left, top, width and opacity.
  arena(t, n, c, form, beat, sq) {
    const F = FIGHT;
    const { mob, px, wide, mw, mh, H, ground, rest } = this.stageOf(n, form, sq);
    const mid = rest + mw / 2;
    const midY = ground - mh / 2;
    const red = t.ansi1 ?? "#E5484D";
    const item = c.items.find((it) => it.id === n.loot);
    const drawn = blocks(mob.px, { ...MOB_TONES, ...mob.tones }, px);
    const stage = div()
      .relative()
      .flex_none()
      .w(wide)
      .h(H)
      .when(beat < F.gone, (el) =>
        el.child(
          v_flex()
            .id(`toast-chroma-mob-${n.id}`)
            .absolute()
            .top(ground - mh - 7 * sq)
            .left(beat < F.enter ? wide + 8 * sq : beat === F.hit ? rest + 4 * sq : rest)
            .transition("left", { duration: 180, easing: "ease-out" })
            .items_center()
            .gap(3 * sq)
            .child(
              div()
                .w(30 * sq)
                .h(4 * sq)
                .bg(t.selection)
                .child(div().id(`toast-chroma-hp-${n.id}`).h(4 * sq).w(beat < F.hit ? 30 * sq : 0).bg(red).transition("width", { duration: 300 })),
            )
            .child(beat === F.hit ? div().relative().flex_none().child(drawn).loop("opacity", { from: 0.2, to: 1, period: 140 }) : drawn),
        ),
      )
      .when(beat >= F.gone, (el) =>
        el.children(
          [[-14, -10], [12, -14], [-18, 4], [16, 2]].map(([dx, dy], i) =>
            div()
              .id(`toast-chroma-shard-${n.id}-${i}`)
              .absolute()
              .left(mid - 2 * sq + (beat >= F.burst ? dx * sq : 0))
              .top(midY - 2 * sq + (beat >= F.burst ? dy * sq : 0))
              .w(4 * sq)
              .h(4 * sq)
              .bg(mob.tones.m)
              .opacity(beat >= F.burst ? 0 : 1)
              .transition("left", { duration: 300 })
              .transition("top", { duration: 300 })
              .transition("opacity", { duration: 300 }),
          ),
        ),
      )
      .when(Boolean(item) && beat >= F.gone, (el) =>
        el.child(
          div()
            .id(`toast-chroma-loot-${n.id}`)
            .absolute()
            .left(beat >= F.fly ? -16 * sq : mid - 7 * sq)
            .top(beat >= F.burst ? ground - 36 * sq : ground - 18 * sq)
            .opacity(beat >= F.fly ? 0 : 1)
            .transition("left", { duration: 400, easing: "ease-in" })
            .transition("top", { duration: 300, easing: "ease-out" })
            .transition("opacity", { duration: 400 })
            .child(icon(item, 2 * sq)),
        ),
      );
    return v_flex().absolute().top(0).left(0).right(0).bottom(0).justify_center().overflow_hidden().child(stage);
  }

  // The creature of a card: its body, which leans into its skill (with no
  // skill it lunges at the mob when it hits), and the skill's dots. The motion
  // is Herdr's own: the dots are drawn at their start, then at the end of their
  // skill's way, then on the mob, and `transition` moves them.
  actor(n, c, form, sq, wear) {
    const [, , w, h] = form.box;
    const { phase, beat } = this.playOf(n);
    const cue = n.skill?.cue;
    const [dx, dy] = phase === 1 ? (POSE[cue] ?? POSE.other) : !cue && beat === FIGHT.hit ? [6, 0] : [0, 0];
    const lean = { duration: 180, easing: "ease-out" };
    const el = div()
      .relative()
      .flex_none()
      .w(w * sq)
      .h(h * sq)
      .child(
        div()
          .id(`toast-chroma-body-${n.id}`)
          .absolute()
          .left(dx * sq)
          .top(dy * sq)
          .transition("left", lean)
          .transition("top", lean)
          .child(body(c, form, sq, wear)),
      );
    if (phase > 2) return el;
    const bright = mix(c.color, [255, 248, 219], 0.69);
    // The middle of the mob, from the top left of the creature: the stage
    // starts 8 px to its right, and the mob stands on the creature's line.
    const s = this.stageOf(n, form, sq);
    const hit = [w * sq + 8 + s.rest + s.mw / 2, h * sq - s.mh / 2];
    return el.children(
      dotsOf(cue, w, h).map(([from, to], i) => {
        const [x, y] = phase === 0 ? from : to;
        const size = (i % 4 === 0 ? 3 : 2) * sq;
        const strike = phase === 2;
        const fly = strike ? { duration: STRIKE_MS, delay: i * STRIKE_DELAY, easing: "ease-in" } : { duration: FLY_MS, delay: i * DOT_DELAY, easing: "ease-out" };
        return div()
          .id(`toast-chroma-dot-${n.id}-${i}`)
          .absolute()
          // On the mob the dots land a little apart.
          .left(strike ? hit[0] + ((i % 5) - 2) * 3 * sq : x * sq)
          .top(strike ? hit[1] + ((i % 3) - 1) * 4 * sq : y * sq)
          .w(size)
          .h(size)
          .bg(i % 4 === 0 ? bright : c.color)
          .opacity(phase === 1 ? 1 : 0)
          .transition("left", fly)
          .transition("top", fly)
          .transition("opacity", strike ? { duration: IMPACT_MS, delay: STRIKE_MS + i * STRIKE_DELAY } : { duration: 150 });
      }),
    );
  }

  bar(t, lit, tone) {
    return h_flex()
      .flex_1()
      .gap(2)
      .children(Array.from({ length: SEGMENTS }, (_, i) => div().h(5).flex_1().bg(i < lit ? tone : t.selection)));
  }

  card(t, n, i, sq) {
    const kind = KIND[n.kind] ?? KIND.info;
    const tone = t[kind.tone] ?? t.accent;
    const edge = n.color ?? t.accent;
    // A card of an agent shows its creature; any other card a glyph.
    const c = n.name ? creatureOf(n.name) : null;
    const xp = xpOf(n.xp ?? objOf(shared(XP_KEY))[n.name]);
    const rank = rankOf(xp);
    const form = c?.forms[rank.stage];
    const done = n.kind === "done" && Boolean(c);
    const combo = Number(n.combo) || 0;
    const heading = `${LABEL[n.step === "evolved" ? "evolved" : n.golden ? "golden" : n.step || n.kind] ?? LABEL.info}${combo > 1 ? ` x${combo}` : ""}`;
    const note = done ? `+${Number(n.gain) || XP_PER_CLEAR} XP` : n.kind === "needs" && n.action?.name ? LABEL.open : "";
    const glyph = (size) => {
      const g = div().flex_none().text_size(size).font_bold().text_color(tone);
      return kind.glyph.length > 1 ? g.frames(kind.glyph, kind.ms) : g.child(kind.glyph[0]);
    };
    const bar = this.bar(t, done ? Math.floor(rank.part * SEGMENTS) : SEGMENTS, tone);
    const lead = c ? this.actor(n, c, form, sq, n.wear ?? wornOf(n.name, rank)) : glyph(20).w(24).text_center();
    // While the fight plays it takes the place of the text.
    const beat = done ? this.playOf(n).beat : FIGHT.over;
    const loot = c?.items.find((it) => it.id === n.loot);

    const face = h_flex()
      .id(`toast-chroma-${n.id}`)
      .w(this.width)
      .px(10)
      .py(8)
      .gap(8)
      .items_center()
      .bg(t.background)
      .border_2()
      .border_color(edge)
      .cursor_pointer()
      .hover((s) => s.bg(t.selection))
      .on_click((_e, cx) => {
        this.picker.click(n);
        cx.notify();
      })
      // While picking: the number that opens this card.
      .when(this.picker.on && i < 9, (el) => el.child(div().flex_none().px(5).bg(edge).text_size(13).font_bold().text_color(t.background).child(String(i + 1))))
      // An agent that needs you shakes.
      .child(n.kind === "needs" ? div().relative().flex_none().child(lead).loop("left", SHAKE) : lead)
      .child(
        v_flex()
          .relative()
          .flex_1()
          .overflow_hidden()
          .when(beat < FIGHT.over, (el) => el.child(this.arena(t, n, c, form, beat, sq)))
          .child(
            v_flex()
              .id(`toast-chroma-text-${n.id}`)
              .w_full()
              .gap(3)
              .overflow_hidden()
              .opacity(beat < FIGHT.over ? 0 : 1)
              .transition("opacity", { duration: 200 })
              .child(
                h_flex()
                  .gap(5)
                  .items_center()
                  .overflow_hidden()
                  .when(Boolean(c), (el) => el.child(glyph(12)))
                  .child(div().flex_1().truncate().text_size(13).font_extrabold().text_color(tone).child(heading)),
              )
              .child(
                h_flex()
                  .gap(6)
                  .overflow_hidden()
                  .child(
                    div()
                      .flex_none()
                      .max_w(this.width * 0.3)
                      .truncate()
                      .text_size(12)
                      .font_bold()
                      .text_color(edge)
                      .child(n.name ?? LABEL.fallback),
                  )
                  .child(div().flex_1().truncate().text_size(12).text_color(t.foreground).child(lineOf(n))),
              )
              .when(Boolean(c), (el) => el.child(div().truncate().text_size(11).text_color(t.muted).child(`LV ${rank.level} ${form.title}`)))
              .child(
                h_flex()
                  .w_full()
                  .gap(6)
                  .items_center()
                  // A level-up's bar blinks.
                  .child(n.step ? bar.loop("opacity", BLINK) : bar)
                  .when(Boolean(note), (el) => el.child(div().flex_none().text_size(10).text_color(t.muted).child(note))),
              )
              // The item that dropped, else the skill that played.
              .when(Boolean(loot) || Boolean(n.skill), (el) =>
                el.child(
                  div()
                    .truncate()
                    .text_size(11)
                    .font_bold()
                    .text_color(loot ? loot.color : edge)
                    .child(loot ? `◆ ${LABEL.loot} · ${loot.name}` : `${n.skill.fresh ? `${LABEL.skill} · ` : "✦ "}${n.skill.name}`),
                ),
              ),
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

  // A small creature for every agent that is open, the ones that need you
  // first, as many as fit. A click goes to the agent.
  lane(t, sq) {
    const all = objOf(shared(XP_KEY));
    const list = [...agents()].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || b.seq - a.seq);
    const shown = [];
    let room = this.width - 14;
    for (const a of list) {
      const name = nameOf(a);
      const c = creatureOf(name);
      const form = c.forms[rankOf(xpOf(all[name])).stage];
      if (form.small[2] * sq > room) break;
      room -= form.small[2] * sq + 8;
      shown.push({ a, c, form });
    }
    if (shown.length === 0) return null;
    return h_flex()
      .w(this.width)
      .px(6)
      .pt(2)
      .pb(4)
      .gap(8)
      .items_end()
      .bg(t.background)
      .border_1()
      .border_color(t.selection)
      .children(
        shown.map(({ a, c, form }) => {
          const mark = MARK[a.status] ?? MARK.idle;
          const sign = div().h(12).whitespace_nowrap().text_size(10).font_bold().text_color(t[a.status] ?? t.muted);
          const pic = figure(c, form.small, sq);
          const moved =
            a.status === "working"
              ? div().relative().flex_none().child(pic).loop("top", BOB)
              : a.status === "blocked"
                ? div().relative().flex_none().child(pic).loop("left", SHAKE)
                : a.status === "idle"
                  ? pic.opacity(0.55)
                  : pic;
          // As wide as its creature: a mark wider than that hangs over both sides.
          return v_flex()
            .id(`toast-chroma-lane-${a.address}`)
            .flex_none()
            .w(form.small[2] * sq)
            .items_center()
            .cursor_pointer()
            .on_click(() => run("agent.focus", { terminal: a.address }))
            .child(mark.frames.length > 1 ? sign.frames(mark.frames, mark.ms) : sign.child(mark.frames[0]))
            .child(moved);
        }),
      );
  }

  // The box of the menu, the party and the gear. A click closes it.
  panel(t, title, hint) {
    return v_flex()
      .id("toast-chroma-panel")
      .w(this.width)
      .p(10)
      .gap(8)
      .bg(t.background)
      .border_2()
      .border_color(t.accent)
      .cursor_pointer()
      .on_click((_e, cx) => {
        this.show(null);
        cx.notify();
      })
      .child(
        v_flex()
          .child(div().text_size(13).font_extrabold().text_color(t.accent).child(title))
          .child(div().text_size(10).text_color(t.muted).child(hint)),
      );
  }

  menu(t) {
    const row = (key, text) =>
      h_flex()
        .gap(8)
        .items_center()
        .child(div().flex_none().px(5).bg(t.accent).text_size(12).font_bold().text_color(t.background).child(key))
        .child(div().text_size(12).text_color(t.foreground).child(text));
    return this.panel(t, "CHROMA", "any other key closes").child(row("P", "party")).child(row("E", "gear"));
  }

  // Name, kind, level and bar of one agent of the roster.
  about(t, who) {
    const tone = who.color ?? t.accent;
    return v_flex()
      .flex_1()
      .gap(2)
      .overflow_hidden()
      .child(div().truncate().text_size(12).font_bold().text_color(tone).child(who.name))
      .child(div().truncate().text_size(10).text_color(t.muted).child(`${who.c.alias} · ${who.c.kind}`))
      .child(div().truncate().text_size(11).text_color(t.foreground).child(`LV ${who.rank.level} ${who.c.forms[who.rank.stage].title}`))
      .child(h_flex().w_full().child(this.bar(t, Math.floor(who.rank.part * SEGMENTS), tone)));
  }

  party(t, sq) {
    const list = roster().slice(0, PARTY_MAX);
    const wide = Math.max(0, ...list.map((who) => who.c.forms[who.rank.stage].box[2])) * sq;
    return this.panel(t, "PARTY", "E gear · any key closes")
      .when(list.length === 0, (el) => el.child(div().text_size(12).text_color(t.muted).child("No quest cleared yet.")))
      .children(
        list.map((who) =>
          h_flex()
            .gap(8)
            .items_center()
            .child(
              h_flex()
                .flex_none()
                .w(wide)
                .justify_center()
                .child(body(who.c, who.c.forms[who.rank.stage], sq, wornOf(who.name, who.rank))),
            )
            .child(this.about(t, who)),
        ),
      );
  }

  gear(t, sq) {
    const list = roster();
    const box = this.panel(t, "GEAR", "1 2 wear · ← → agent · P party");
    if (list.length === 0) return box.child(div().text_size(12).text_color(t.muted).child("No quest cleared yet."));
    const who = list[this.sel % list.length];
    const level = who.rank.level >= GEAR_LEVEL;
    const found = foundOf(who.name);
    const worn = wornOf(who.name, who.rank);
    const tone = who.color ?? t.accent;
    return box
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .child(body(who.c, who.c.forms[who.rank.stage], sq, worn))
          .child(this.about(t, who)),
      )
      .children(
        who.c.items.map((item, i) => {
          const open = level && found.includes(item.id);
          return h_flex()
            .id(`toast-chroma-item-${i}`)
            .gap(8)
            .items_center()
            .opacity(open ? 1 : 0.45)
            .on_click((_e, cx) => {
              this.wear(who, i);
              cx.stop_propagation();
              cx.notify();
            })
            .child(div().flex_none().px(5).bg(open ? tone : t.selection).text_size(12).font_bold().text_color(t.background).child(String(i + 1)))
            .child(icon(item, 2 * sq))
            .child(div().flex_1().truncate().text_size(12).text_color(t.foreground).child(item.name))
            .child(
              div()
                .flex_none()
                .text_size(10)
                .font_bold()
                .text_color(worn === item.id ? tone : t.muted)
                .child(open ? (worn === item.id ? "WORN" : "") : level ? LABEL.missing : `LV ${GEAR_LEVEL}`),
            );
        }),
      )
      .children(
        who.c.skills.map((skill, i) =>
          h_flex()
            .gap(8)
            .opacity(who.rank.stage >= SKILL_FORMS[i] ? 1 : 0.45)
            .child(div().flex_none().w(40).text_size(10).text_color(t.muted).child(`LV ${firstLevel(SKILL_FORMS[i])}`))
            .child(div().flex_1().truncate().text_size(11).text_color(t.foreground).child(`✦ ${skill.name}`)),
        ),
      );
  }

  render() {
    if (this.isToast) return div();
    // The menu, the party and the gear take the cards' place while open.
    const cards = this.view ? [] : this.cards();
    const t = theme();
    // One square of the art is one px of the screen at any zoom.
    const sq = 1 / (Number(settings().zoom) || 1);
    const lane = this.showLane ? this.lane(t, sq) : null;
    if (!this.view && cards.length === 0 && !lane) return div();
    const board = v_flex()
      .id("toast-chroma")
      .gap(4)
      .track_focus(this.picker.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .when(this.view === "menu", (el) => el.child(this.menu(t)))
      .when(this.view === "party", (el) => el.child(this.party(t, sq)))
      .when(this.view === "gear", (el) => el.child(this.gear(t, sq)))
      .children(cards.map((n, i) => this.card(t, n, i, sq)))
      .when(Boolean(lane), (el) => el.child(lane));
    return this.mono ? board.font_family(this.mono) : board;
  }
}
