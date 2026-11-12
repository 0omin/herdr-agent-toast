# Install

Every example in this repo is one Herdr mod.
Pick one, copy it, and point your layout at it.
The steps below use `toast-agent`; for another example, put its name everywhere `toast-agent` appears.

## Ask your Herdr agent

In a Herdr terminal, ask the agent:

```
Read ~/.config/herdr-app/AGENTS.md, then add this mod: herdr.dev/mods/0omin/herdr-agent-toast--toast-agent
```

Then ask it to wire the mod into your layout as described in step 2 below.

## By hand

1. Copy `toast-agent/mods/toast-agent/` to `~/.config/herdr-app/mods/toast-agent/`.
   Copy the whole folder at once, with its `mod.json`.
   If Herdr sees `main.js` before `mod.json`, it may dock the mod as a side panel.
2. Edit your own layout, `~/.config/herdr-app/layouts/<yours>.json`:
   - At the root, add `"toast": "toast-agent"`.
   - On the node that holds your terminals, add:
     ```json
     "floating": [{ "id": "toast-agent", "content": { "mod": "toast-agent" }, "edge": "top", "align": "end" }]
     ```
3. Check it:
   ```
   herdr-app check ~/.config/herdr-app/mods/toast-agent
   herdr-app do toast-agent.demo
   ```
   Three sample cards should appear in the top-right corner.

## Good to know

- Shipped layouts (such as `main`) are replaced when Herdr starts.
  Clone one first (`herdr-app do layout.clone --name main`) and edit the clone.
- The node id for the floating block differs between layouts.
  Look for the node that contains your terminal block.
- `herdr-app do layout.set` replaces your layout and resets its theme and side panel sizes.
  Editing the JSON file keeps them.
- To go back to Herdr's own toast, remove the `"toast"` key and the floating entry.
