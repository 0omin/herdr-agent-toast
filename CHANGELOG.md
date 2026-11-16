# Changelog

One version for the whole repo, [Semantic Versioning](https://semver.org).
Each mod's `main.js` starts with the version it was released in.

- MAJOR: you must change your setup (a mod renamed, layout wiring changed, shared state keys renamed, an example removed).
- MINOR: something new (an example, an agent, a kind of notification).
- PATCH: fixes (bugs, colors, words, docs).

## v0.5.0

- Add `toast-history`: every notification becomes a row in a list of the last 20, kept across restarts.
  A new one opens the list for 10 s; then it folds into a badge with the number of new rows (`≡ 3`).
  Click the badge to open the list, a row to go to that agent, `clear` to empty it.
- `toast-history` takes a list width from its floating block (`"props": { "width": 228 }`), like `toast-quest`.
- `install.sh`: the last line now says "Three sample notifications should be showing", as not every example shows cards.

## v0.4.0

- Add `toast-focus`: only an agent that needs you and an error get a card, and those cards stay until they are clicked.
  Finished tasks, warnings and notices are counted in a chip under the cards (`✓ 2 done Codex, Claude +1 more`); a click clears it.
- `toast-focus` takes a card width from its floating block (`"props": { "width": 228 }`), like `toast-quest`.

## v0.3.0

- Add `toast-minimal`: each notification as one thin pill that says who and what (`Claude needs you`), with a dot in the color of its kind.
  Point at a pill to read the rest; pills leave after 5 s.
- `toast-minimal` takes `"props": { "width": 228 }` from its floating block too: there it is the widest a pill may be.

## v0.2.0

- Add `toast-quest`: notifications as 8-bit game cards (`BOSS APPEARED!`, `QUEST CLEAR!`, `GAME OVER`) with a hard shadow in the agent color.
  Every finished task adds 50 XP, and 500 XP make a level.
- `toast-quest` takes a card width from its floating block (`"props": { "width": 228 }`), for a narrow spot such as a sidebar.
- `install.sh`: installing another example puts it where the one you have is (same node, edge, align and props) instead of back in the top-right corner.

## v0.1.0

- Add `toast-agent`: notifications as cards in the top-right corner, framed in each agent's color and labeled Needs you, Done, Error, Warning or Notice.
- Supported agents: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Amp, Kiro, Grok, Kimi, Crush, Antigravity.
  Others use Herdr's own name and icon.
- `herdr-app do toast-agent.demo` shows three sample cards.
- Add `install.sh`: one command to copy a mod, wire it into your layout (with backups) and show the demo.
  `uninstall` takes it out of every layout and puts back the previous `"toast"` value.
