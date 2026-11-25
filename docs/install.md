# Install

Every example in this repo is one Herdr mod.
The steps below use `toast-agent`; for another example, put its name everywhere `toast-agent` appears.

Needs Herdr app 0.1.15 or newer (the layout `"toast"` key), with Herdr running.
`toast-chroma` was tested with 0.1.17 only.

## One command (macOS, Linux)

```
curl -fsSL https://raw.githubusercontent.com/0omin/herdr-agent-toast/main/install.sh | sh -s toast-agent
```

Three sample cards appear in the top-right corner when it is done.

What the script does, all inside `~/.config/herdr-app`:

1. Copies the mod folder into `mods/` (for `toast-chroma` that includes its drawings: `creatures.js` and 12 PNG sheets).
2. If you are on a layout that ships with Herdr (such as `main`), clones it as `main-toast` and switches to the clone.
   Shipped layouts are replaced at every start, so edits to them do not last.
3. Adds two entries to your layout file: `"toast": "toast-agent"` at the root, and a floating block over your terminals.
4. Runs `herdr-app check` and the demo.

It is careful with your files:

- A file is copied to `~/.config/herdr-app/.herdr-agent-toast/backups/` before it is changed.
- It does not use `sudo` and touches nothing outside `~/.config/herdr-app`.
- Downloaded files are checked before they are installed, and the mod must pass `herdr-app check` before any layout points at it.
- If it cannot tell where your terminals are in a custom layout, it leaves the layout alone and prints the two entries to add.
- Running it again when everything is in place changes nothing.
- Installing another example from this repo puts it in the spot of the one you have (same node, edge, align and props) in the layout you are on, and `"toast"` points at the new one.
  The earlier example's folder stays in `mods/`.
- It will not replace or remove a mod folder named `toast-agent` that did not come from this repo.
- It needs `python3` to edit the layout file.
  Without it, the mod is copied and the two entries are printed.
- The layout file is rewritten as plain JSON with 2-space indentation, so hand formatting is not kept.

Tested on macOS.
It is written for Linux too, but has not been run there yet.

Take it out again:

```
curl -fsSL https://raw.githubusercontent.com/0omin/herdr-agent-toast/main/install.sh | sh -s uninstall toast-agent
```

Uninstall takes the two entries out of every layout that has them and puts back the `"toast"` value that was there before.
If the installer cloned your layout, it switches back to the original; the clone's file stays, for you to delete or keep.
The mod folder moves to the backups.

## Read it first

Prefer to look before you run? Clone the repo, read `install.sh`, then run it from the clone:

```
git clone https://github.com/0omin/herdr-agent-toast
cd herdr-agent-toast
sh install.sh toast-agent
```

## Ask your Herdr agent

On Windows, or if you would rather not run a script, give your agent this in a Herdr terminal:

```
Read ~/.config/herdr-app/AGENTS.md, then add the mod in this folder:
https://github.com/0omin/herdr-agent-toast/tree/main/toast-agent
Then wire it into my own layout (clone the shipped layout first if I am still on it):
set the root "toast" to "toast-agent", and add a floating block for "toast-agent"
(edge top, align end) on the node that holds my terminals.
Edit the layout file; do not use layout.set. Finish with: herdr-app do toast-agent.demo
```

## By hand

1. Get the files: `git clone https://github.com/0omin/herdr-agent-toast`
2. Use a layout of your own.
   If you are on Herdr's default layout, clone it first (this also switches to the clone):
   ```
   herdr-app do layout.clone --name main --as main-toast
   ```
3. Copy the mod folder in one step, so Herdr never sees it half-copied
   (if it sees `main.js` before `mod.json`, it may dock the mod as a side panel):
   ```
   cp -R herdr-agent-toast/toast-agent/mods/toast-agent ~/.config/herdr-app/toast-agent.tmp
   mv ~/.config/herdr-app/toast-agent.tmp ~/.config/herdr-app/mods/toast-agent
   ```
4. Edit your layout file, `~/.config/herdr-app/layouts/main-toast.json`:
   - At the root, add `"toast": "toast-agent"`.
   - On the node that holds your terminals, add the floating block.
     In a clone of the default layout that node has `"id": "work-body"`.
     In other layouts it is the parent of the block whose `content` has `"tab"`.
     ```json
     "floating": [{ "id": "toast-agent", "content": { "mod": "toast-agent" }, "edge": "top", "align": "end" }]
     ```
5. Check it:
   ```
   herdr-app check ~/.config/herdr-app/mods/toast-agent
   herdr-app status
   herdr-app do toast-agent.demo
   ```
   `status` should show `"errors": []` and `toast-agent` under `floats`.
   If the layout file has a mistake, Herdr keeps the last good version and writes why to `layout.error` in `~/.config/herdr-app/`.
   Then three sample cards appear in the top-right corner.

## Good to know

- Edit the layout file rather than using `herdr-app do layout.set`.
  On the author's machine (Herdr 0.1.15), `layout.set` also reset the layout's theme and side panel sizes.
- To move the cards, change `edge` (`top`, `right`, `bottom`, `left`) and `align` (`start`, `center`, `end`), or drag the block.
  To put them over another part of the window, move the floating entry to that node in the layout file.
- `toast-agent`, `toast-quest`, `toast-focus` and `toast-hud` cards, `toast-retro` boxes and the `toast-history` list can be narrower than 360 px, for a spot such as a sidebar: `"content": { "mod": "toast-quest", "props": { "width": 228 } }` (180 at the least).
  `toast-minimal` takes the same prop: there it is the widest a pill may be.
  `toast-chroma` takes it too (200 at the least), and `"lane": false` leaves out its lane of open agents.
- The agent colors are fixed.
  On a light theme the pale ones (Cursor, Antigravity, oh-my-pi) are faint; change them in the `AGENTS` table in `core.js`.
- To open cards from the keyboard, bind the example's `pick` command to a free key in the `global` section of `~/.config/herdr-app/keys.json`:
  ```json
  "cmd-j": "toast-agent.pick"
  ```
  `toast-chroma` has a second command to bind, `menu`: press its key, let go, then P for the party or E for the gear.
  ```json
  "cmd-shift-j": "toast-chroma.menu"
  ```
  The script does not touch `keys.json`.
  Herdr's own notes say an edited `keys.json` is kept as yours: new default keys from a Herdr upgrade are no longer added to it.
- To go back to Herdr's own toast by hand, remove the `"toast"` key and the floating entry, then delete `~/.config/herdr-app/mods/toast-agent/`.
