// herdr-agent-toast v0.1.0 · core
//
// Shared by every mod in herdr-agent-toast: which agent sent a notification,
// what kind it is, and the queue of cards. Each mod's main.js only draws.
// In the repo, edit shared/core.js and run scripts/sync-core.sh; the core.js
// in each mod folder is a copy.

import { shared, setShared, agents } from "herdr";

// Agents with a color each. Icons ship with Herdr (icons/*.svg); tint: a
// one-color glyph, drawn in the agent color. `names`: Herdr's program key, the
// name the agent reports, and other process names. Agents not listed still
// get Herdr's own name and icon, with no color (the mod picks a theme color).
export const AGENTS = [
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

// Herdr's own notifications are titled "<Program> needs you" / "<Program> finished".
const OWN = /^(.*?)\s+(needs you|finished)\s*$/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (hay, name) => new RegExp(`(^|[^a-z0-9])${esc(name)}([^a-z0-9]|$)`).test(hay);

// Which agent: the terminal the click goes to (Herdr's own notifications focus
// the agent), else an icon from Herdr's icons/ folder, else the program named
// in Herdr's own title. Titles are trusted only on notifications that focus an
// agent, so "Amp server finished" from another mod is not Amp.
// `name` is null when no agent could be told.
export function agentOf(p) {
  const focuses = p.action?.name === "agent.focus";
  const term = p.action?.args?.terminal;
  const a = term ? agents().find((x) => x.address === term) : null;
  const ids = [a?.app, a?.program?.key].filter(Boolean).map((s) => s.toLowerCase());
  const iconFile = /^icons\/([^/]+)\.svg$/i.exec(p.icon ?? "")?.[1]?.toLowerCase() ?? "";
  const titled = focuses ? (OWN.exec(p.title ?? "")?.[1] ?? "").trim() : "";
  const hit =
    AGENTS.find((g) => g.names.some((n) => ids.includes(n))) ??
    AGENTS.find((g) => g.names.includes(iconFile)) ??
    AGENTS.find((g) => g.names.some((n) => word(titled.toLowerCase(), n)));
  if (hit) return { name: hit.name, color: hit.color, icon: hit.icon, tint: hit.tint };
  if (a?.program?.agent) return { name: a.program.name, color: null, icon: a.program.icon, tint: a.program.tint };
  // An agent Herdr named in its own title, whose terminal is already gone.
  if (titled) return { name: titled, color: null, icon: p.icon ?? null, tint: false };
  return { name: null, color: null, icon: p.icon ?? null, tint: false };
}

// What it is: "needs", "done", "error", "warning" or "info". Herdr's own
// titles win for a known agent (its "needs you" comes with level "error" and
// its "finished" with level "info"); everything else goes by its level.
export function kindOf(p, who) {
  const own = who.name ? OWN.exec(p.title ?? "")?.[2]?.toLowerCase() : null;
  if (own === "needs you") return "needs";
  if (own === "finished") return "done";
  if (p.level === "error") return "error";
  if (p.level === "warning") return "warning";
  if (p.level === "success") return "done";
  return "info";
}

// A notification's props as a card: who, what, and when it expires.
export function cardOf(p, defaultMs) {
  const who = agentOf(p);
  const ms = typeof p.timeout === "number" && p.timeout > 0 ? p.timeout : defaultMs;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: p.title ?? "",
    body: p.body ?? "",
    kind: kindOf(p, who),
    name: who.name,
    color: who.color,
    icon: who.icon,
    tint: who.tint,
    action: p.action ?? null,
    until: Date.now() + ms,
  };
}

// The text under the heading. The heading already says who and what, so
// Herdr's "X needs you" / "X finished" is dropped when the agent is known.
export function lineOf(card) {
  const plain = Boolean(card.name) && (OWN.test(card.title) || card.title === card.name);
  return (plain && card.body ? [card.body] : [card.title, card.body]).filter(Boolean).join(" · ");
}

// Cards in shared state under `key`, newest first, at most `max`. Shared state
// is saved to disk, so expired cards are dropped on every read.
export function createQueue(key, max) {
  const stored = () => {
    const q = shared(key);
    return Array.isArray(q) ? q : [];
  };
  const live = (q) => q.filter((n) => !n.until || n.until > Date.now());
  return {
    cards: () => live(stored()),
    // The new card always shows, and replaces older cards about the same
    // terminal (an agent's latest news is the one that counts). Over `max`,
    // the oldest card that is not a "needs" card goes first; when all are
    // "needs", the oldest of those.
    push(card) {
      const term = card.action?.args?.terminal;
      const old = live(stored()).filter((n) => !term || n.action?.args?.terminal !== term);
      while (old.length > 0 && old.length >= max) {
        let i = old.length - 1;
        while (i >= 0 && old[i].kind === "needs") i--;
        old.splice(i >= 0 ? i : old.length - 1, 1);
      }
      setShared(key, [card, ...old]);
    },
    remove(id) {
      setShared(key, live(stored()).filter((n) => n.id !== id));
    },
    // Writes only when something expired.
    prune() {
      const q = stored();
      const l = live(q);
      if (l.length !== q.length) setShared(key, l);
    },
  };
}
