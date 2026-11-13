# Install

Every example in this repo is one Herdr mod.
The steps below use `toast-agent`; for another example, put its name everywhere `toast-agent` appears.

Needs Herdr app 0.1.15 or newer (the layout `"toast"` key), with Herdr running.

## One command (macOS, Linux)

```
curl -fsSL https://raw.githubusercontent.com/0omin/herdr-agent-toast/main/install.sh | sh -s toast-agent
```

Three sample cards appear in the top-right corner when it is done.

What the script does, all inside `~/.config/herdr-app`:

1. Copies the mod folder into `mods/`.
2. If you are on a layout that ships with Herdr (such as `main`), clones it as `main-toast` and switches to the clone.
   Shipped layouts are replaced at every start, so edits to them do not last.
3. Adds two entries to your layout file: `"toast": "toast-agent"` at the root, and a floating block over your terminals.
4. Runs `herdr-app check` and the demo.

It is careful with your files:

- Every file it changes is first copied to `~/.config/herdr-app/.herdr-agent-toast/backups/`.
- It does not use `sudo` and touches nothing outside that folder.
- If it cannot tell where your terminals are in a custom layout, it leaves the layout alone and prints the two entries to add.
- Running it again changes nothing that is already in place.
- It needs `python3` to edit the layout file. Without it, the mod is copied and the two entries are printed.

Take it out again (the layout gets its old `"toast"` value back, the mod folder moves to the backups):

```
curl -fsSL https://raw.githubusercontent.com/0omin/herdr-agent-toast/main/install.sh | sh -s uninstall toast-agent
```

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

- `herdr-app do layout.set` replaces your layout and resets its theme and side panel sizes.
  Editing the JSON file keeps them.
- To move the cards, change `edge` (`top`, `right`, `bottom`, `left`) and `align` (`start`, `center`, `end`), or drag the block.
- The agent colors are fixed.
  On a light theme the pale ones (Cursor, Antigravity) are faint; change them in the `AGENTS` table in `core.js`.
- To go back to Herdr's own toast by hand, remove the `"toast"` key and the floating entry, then delete `~/.config/herdr-app/mods/toast-agent/`.
