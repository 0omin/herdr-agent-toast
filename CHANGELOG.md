# Changelog

One version for the whole repo, [Semantic Versioning](https://semver.org).
Each mod's `main.js` starts with the version it was released in.

- MAJOR: you must change your setup (a mod renamed, layout wiring changed, shared state keys renamed, an example removed).
- MINOR: something new (an example, an agent, a kind of notification).
- PATCH: fixes (bugs, colors, words, docs).

## v1.2.0

- Every example has a `pick` command for the keyboard.
  It numbers the cards (1 to 9) and takes the keyboard: a digit opens that card as a click would, Enter or `pick` again opens the top one, and any other key without cmd, ctrl or alt gives the keyboard back to the pane it came from.
  `toast-history` opens its list first and numbers the 8 rows that show without scrolling; in `toast-retro` a number does what `Open` does, or `Dismiss` when there is no `Open`.
- To use it, bind it to a key in the `global` section of `keys.json`, for example `"cmd-j": "toast-agent.pick"`.
  `install.sh` does not do this for you.
- `core.js` adds `createPicker`, the picking every example shares.
- Nothing in your setup needs to change.

## v1.1.0

- Add two agents that Herdr app 0.1.16 knows: goose `#2EC4B6` and oh-my-pi `#A3E635`. Their icons come with Herdr app 0.1.16.
  On a light theme oh-my-pi is faint, like Cursor and Antigravity.
- `toast-agent` takes a card width from its floating block (`"props": { "width": 228 }`), like the other examples.
- Tested with Herdr app 0.1.16. Earlier releases were tested with 0.1.15; this one was not.
- Nothing in your setup needs to change.

## v1.0.0

- First stable release. It marks the start of the promise below, not a change: nothing in your setup needs to change.
  From here on, a change you must follow in your setup raises the MAJOR version.
- No mod, install step or layout wiring changed since v0.7.0; `install.sh` changed only its version comment.
- The README no longer says more examples are on the way.

## v0.7.0

- Add `toast-retro`: notifications as grey dialog boxes with a title bar that fades from the agent color, an icon for the kind, and `Open` and `Dismiss` buttons.
  Only the newest two show.
  The boxes are grey on every theme, with no font or sound of their own.
- `toast-retro` takes a box width from its floating block (`"props": { "width": 228 }`), like `toast-quest`.
- `install.sh`: the closing message now says "Sample notifications should be showing", as `toast-retro` shows two of its three.

## v0.6.0

- Add `toast-hud`: notifications as black control-room readouts with an uppercase status code (`AWAITING INPUT`, `COMPLETE`, `FAULT`, `CAUTION`, `NOTICE`).
  Corner brackets are in the agent color, and a cursor blinks on a card that needs you.
  The panels are black on every theme.
- `toast-hud` takes a card width from its floating block (`"props": { "width": 228 }`), like `toast-quest`.

## v0.5.0

- Add `toast-history`: every notification becomes a row in a list of the last 20, kept across restarts.
  A new one opens the list for 10 s; then it folds into a badge with the number of new rows (`≡ 3`).
  Click the badge to open the list, a row to go to that agent, `clear` to empty it.
- `toast-history` takes a list width from its floating block (`"props": { "width": 228 }`), like `toast-quest`.
- `install.sh`: the closing message now says "Three sample notifications should be showing", as not every example shows cards.

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
