# herdr-agent-toast

Notification mods for [Herdr](https://herdr.dev): see at a glance which agent needs you and which one is done.
Every example tells agents apart by color and icon (Claude, Codex, Gemini, ...) and notifications apart by kind (Needs you, Done, Error, ...).
They differ in how they look and behave.

## Examples

| Example | What it is | Preview |
|---|---|---|
| [`toast-agent`](toast-agent/RECIPE.md) | Cards in the top-right corner, framed in each agent's color (start here) | ![toast-agent](toast-agent/preview.png) |

More examples are on the way.

## Install

Pick an example and follow [docs/install.md](docs/install.md).
In short: copy its `mods/<name>/` folder into `~/.config/herdr-app/mods/`, then set `"toast": "<name>"` and a floating block in your layout.

Each example lives in its own folder with a `RECIPE.md` (what it does and how it is built) and a `preview.png`.

## Develop

`shared/core.js` is the one source for the code every example shares.
After editing it, run `scripts/sync-core.sh` to copy it into each mod folder.
`scripts/sync-core.sh --check` fails when a copy differs.

## Customize

The words, glyphs and timing are constants at the top of each `main.js`.
The agents and their colors are the `AGENTS` table in `core.js`.

## Versions

One version for the whole repo.
See [CHANGELOG.md](CHANGELOG.md).
Tested with Herdr app 0.1.15 on macOS.

## License

MIT.
Agent icons are not included; the mods use the ones that ship with Herdr.
