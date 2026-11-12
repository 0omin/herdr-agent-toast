# Install

Every example in this repo is one Herdr mod.
Pick one, copy it, and point your layout at it.
The steps below use `toast-agent`; for another example, put its name everywhere `toast-agent` appears.

Needs Herdr app 0.1.15 or newer (the layout `"toast"` key).

## Ask your Herdr agent

In a Herdr terminal, give your agent this:

```
Read ~/.config/herdr-app/AGENTS.md, then add the mod in this folder:
https://github.com/0omin/herdr-agent-toast/tree/main/toast-agent
Then wire it into my own layout (clone the shipped layout first if I am still on it):
set the root "toast" to "toast-agent", and add a floating block for "toast-agent"
(edge top, align end) on the node that holds my terminals.
Edit the layout file; do not use layout.set. Finish with: herdr-app do toast-agent.demo
```

## By hand

1. Use a layout of your own.
   If you are on Herdr's default layout, clone it first (this also switches to the clone):
   ```
   herdr-app do layout.clone --name main --as my-main
   ```
2. Copy the folder `toast-agent/mods/toast-agent/` to `~/.config/herdr-app/mods/toast-agent/`.
   Copy the whole folder at once: `mod.json`, `main.js` and `core.js`.
   If Herdr sees `main.js` before `mod.json`, it may dock the mod as a side panel.
3. Edit your layout file, `~/.config/herdr-app/layouts/my-main.json`:
   - At the root, add `"toast": "toast-agent"`.
   - On the node that holds your terminals, add the floating block.
     In a clone of the default layout that node has `"id": "work-body"`.
     ```json
     "floating": [{ "id": "toast-agent", "content": { "mod": "toast-agent" }, "edge": "top", "align": "end" }]
     ```
4. Check it:
   ```
   herdr-app check ~/.config/herdr-app/mods/toast-agent
   herdr-app do toast-agent.demo
   ```
   Three sample cards should appear in the top-right corner.

## Good to know

- Shipped layouts (such as `main`) are replaced when Herdr starts, so edits to them do not last.
  That is why step 1 clones.
- `herdr-app do layout.set` replaces your layout and resets its theme and side panel sizes.
  Editing the JSON file keeps them.
- To move the cards, change `edge` (`top`, `right`, `bottom`, `left`) and `align` (`start`, `center`, `end`), or drag the block.
- To go back to Herdr's own toast, remove the `"toast"` key and the floating entry.
- To remove the mod, also delete `~/.config/herdr-app/mods/toast-agent/`.
