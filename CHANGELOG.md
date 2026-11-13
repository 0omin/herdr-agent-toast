# Changelog

One version for the whole repo, [Semantic Versioning](https://semver.org).
Each mod's `main.js` starts with the version it was released in.

- MAJOR: you must change your setup (a mod renamed, layout wiring changed, shared state keys renamed, an example removed).
- MINOR: something new (an example, an agent, a kind of notification).
- PATCH: fixes (bugs, colors, words, docs).

## v0.1.0

- Add `toast-agent`: notifications as cards in the top-right corner, framed in each agent's color and labeled Needs you, Done, Error, Warning or Notice.
- Supported agents: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, Amp, Kiro, Grok, Kimi, Crush, Antigravity.
  Others use Herdr's own name and icon.
- `herdr-app do toast-agent.demo` shows three sample cards.
- Add `install.sh`: one command to copy a mod, wire it into your layout (with backups) and show the demo; `uninstall` reverses it.
