#!/bin/sh
# herdr-agent-toast installer (v0.1.0)
#
#   sh install.sh [example]            install an example (default: toast-agent)
#   sh install.sh uninstall [example]  take it out again
#
# What it does, all under ~/.config/herdr-app (or $HERDR_APP_HOME):
#   1. Copies the example's mod folder into mods/.
#   2. If you are on a layout that ships with Herdr, clones it (shipped layouts
#      are replaced at every start, so edits to them do not last).
#   3. Adds two entries to your layout file: "toast": "<example>" at the root,
#      and a floating block for it over the node that holds your terminals.
#   4. Runs `herdr-app check` and shows three sample cards.
# Every file it changes is first copied to .herdr-agent-toast/backups/.
# No sudo, nothing outside that folder. Needs Herdr app 0.1.15+ and python3.
#
# Environment: HERDR_APP_HOME (Herdr's folder), HERDR_TOAST_REF (git ref to
# download from, default main), HERDR_TOAST_FORCE=1 (replace a mod folder of
# the same name that is not from this repo).

set -eu

REPO="0omin/herdr-agent-toast"
REF="${HERDR_TOAST_REF:-main}"
EXAMPLES="toast-agent"
FILES="mod.json core.js main.js"

say() { printf '%s\n' "$*"; }
die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }

have_python() {
  command -v python3 >/dev/null 2>&1 || return 1
  # On macOS /usr/bin/python3 is a stub that opens an install dialog
  # unless the Command Line Tools are present.
  if [ "$(uname)" = "Darwin" ] && [ "$(command -v python3)" = "/usr/bin/python3" ]; then
    xcode-select -p >/dev/null 2>&1 || return 1
  fi
  python3 -c 'import json' >/dev/null 2>&1
}

find_herdr() {
  if [ -n "${HERDR_APP_BIN:-}" ]; then say "$HERDR_APP_BIN"; return 0; fi
  if command -v herdr-app >/dev/null 2>&1; then command -v herdr-app; return 0; fi
  if [ -x "$HOME/.local/bin/herdr-app" ]; then say "$HOME/.local/bin/herdr-app"; return 0; fi
  return 1
}

write_helper() {
  cat > "$1" <<'PY'
import json, os, sys

def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def save(path, data):
    tmp = path + ".tmp-toast"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)

def nodes(node, parent=None):
    yield node, parent
    for child in node.get("children") or []:
        if isinstance(child, dict):
            yield from nodes(child, node)

def mod_of(entry):
    content = entry.get("content") if isinstance(entry, dict) else None
    return content.get("mod") if isinstance(content, dict) else None

def wire(path, name, ours, state):
    data = load(path)
    before = json.dumps(data, sort_keys=True)
    # Where the block goes: the default layout's work area, else the parent of
    # the block that shows the terminals ({"tab": ...}), else that block.
    target = None
    for node, parent in nodes(data):
        if node.get("id") == "work-body":
            target = node
            break
    if target is None:
        for node, parent in nodes(data):
            content = node.get("content")
            if isinstance(content, dict) and "tab" in content:
                target = parent or node
                break
    wired = any(mod_of(e) == name for node, _ in nodes(data) for e in node.get("floating") or [])
    if target is None and not wired:
        return 3
    prev = data.get("toast")
    if prev and prev != name and prev not in ours:
        with open(state, "w", encoding="utf-8") as f:
            f.write(prev)
    data["toast"] = name
    # Another example from this repo gives way to this one.
    for node, _ in nodes(data):
        if "floating" in node:
            kept = [e for e in node["floating"] if not (mod_of(e) in ours and mod_of(e) != name)]
            if kept:
                node["floating"] = kept
            else:
                del node["floating"]
    if not wired:
        target.setdefault("floating", []).append(
            {"id": name, "content": {"mod": name}, "edge": "top", "align": "end"})
    if json.dumps(data, sort_keys=True) != before:
        save(path, data)
        print("changed")
    else:
        print("unchanged")
    return 0

def unwire(path, name, state):
    data = load(path)
    before = json.dumps(data, sort_keys=True)
    for node, _ in nodes(data):
        if "floating" in node:
            kept = [e for e in node["floating"] if mod_of(e) != name]
            if kept:
                node["floating"] = kept
            else:
                del node["floating"]
    if data.get("toast") == name:
        if os.path.exists(state):
            with open(state, encoding="utf-8") as f:
                data["toast"] = f.read().strip()
            os.remove(state)
        else:
            del data["toast"]
    if json.dumps(data, sort_keys=True) != before:
        save(path, data)
        print("changed")
    else:
        print("unchanged")
    return 0

def main(argv):
    cmd = argv[1]
    if cmd == "wire":
        return wire(argv[2], argv[3], argv[4].split(","), argv[5])
    if cmd == "unwire":
        return unwire(argv[2], argv[3], argv[4])
    if cmd == "layout":  # the shown layout's name, from `herdr-app status` on stdin
        name = json.load(sys.stdin).get("layout")
        if not isinstance(name, str) or not name:
            return 1
        print(name)
        return 0
    if cmd == "shipped":  # exit 0 when Herdr ships this layout
        return 0 if ("layout:" + argv[3]) in load(argv[2]) else 1
    if cmd == "healthy":  # `herdr-app status` on stdin: no errors and the block is there
        status = json.load(sys.stdin)
        errors = status.get("errors") or []
        for e in errors:
            print(e if isinstance(e, str) else json.dumps(e))
        return 0 if not errors and argv[2] in (status.get("floats") or {}) else 1
    return 2

try:
    sys.exit(main(sys.argv))
except (ValueError, OSError) as e:
    print("install.sh: %s" % e, file=sys.stderr)
    sys.exit(4)
PY
}

manual_steps() {
  say ""
  say "The mod is installed, but your layout was not changed. To finish by hand, edit"
  say "your own layout file in $HERDR_HOME/layouts/ (clone a shipped one first):"
  say "  1. at the root:  \"toast\": \"$NAME\""
  say "  2. on the node that holds your terminals:"
  say "     \"floating\": [{ \"id\": \"$NAME\", \"content\": { \"mod\": \"$NAME\" }, \"edge\": \"top\", \"align\": \"end\" }]"
  say "Then run: herdr-app do $NAME.demo"
  say "Details: https://github.com/$REPO/blob/main/docs/install.md"
}

backup() {
  mkdir -p "$STATE/backups"
  cp -R "$1" "$STATE/backups/$2-$STAMP"
  say "  backup: $STATE/backups/$2-$STAMP"
}

# The shown layout's name, or nothing when Herdr is not running.
shown_layout() {
  [ -n "$HERDR" ] || return 1
  "$HERDR" status 2>/dev/null | python3 "$WORK/helper.py" layout 2>/dev/null
}

install_files() {
  src=""
  here="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
  if [ -n "$here" ] && [ -f "$here/$NAME/mods/$NAME/main.js" ]; then
    src="$here/$NAME/mods/$NAME"
    say "Using the files next to install.sh."
  else
    command -v curl >/dev/null 2>&1 || die "curl is needed to download the files"
    src="$WORK/download"
    mkdir -p "$src"
    for f in $FILES; do
      curl -fsSL "https://raw.githubusercontent.com/$REPO/$REF/$NAME/mods/$NAME/$f" -o "$src/$f" \
        || die "could not download $f (ref: $REF)"
    done
    say "Downloaded $NAME from github.com/$REPO ($REF)."
  fi
  for f in $FILES; do [ -s "$src/$f" ] || die "missing file: $f"; done

  dest="$HERDR_HOME/mods/$NAME"
  mkdir -p "$HERDR_HOME/mods"
  if [ -e "$dest" ]; then
    if ! grep -q "herdr-agent-toast" "$dest/main.js" 2>/dev/null && [ "${HERDR_TOAST_FORCE:-}" != "1" ]; then
      die "$dest exists and is not from this repo. Move it away, or set HERDR_TOAST_FORCE=1."
    fi
    say "Updating $dest"
    backup "$dest" "mod-$NAME"
    # mod.json first, main.js last: Herdr reloads the mod when main.js lands.
    for f in $FILES; do cp "$src/$f" "$dest/$f"; done
  else
    # Stage the whole folder, then move it in one step, so Herdr never sees
    # main.js without mod.json (it would dock the mod as a side panel).
    stage="$STATE/stage/$NAME"
    rm -rf "$stage"
    mkdir -p "$stage"
    for f in $FILES; do cp "$src/$f" "$stage/$f"; done
    mv "$stage" "$dest"
    say "Installed $dest"
  fi
}

wire_layout() {
  layout="$(shown_layout || true)"
  if [ -z "$layout" ]; then
    say "Herdr does not seem to be running (no answer from \`herdr-app status\`)."
    manual_steps
    return 0
  fi
  if python3 "$WORK/helper.py" shipped "$HERDR_HOME/installed.json" "$layout" 2>/dev/null; then
    clone="$layout-toast"
    if [ -f "$HERDR_HOME/layouts/$clone.json" ]; then
      say "Layout \"$layout\" ships with Herdr; switching to your clone \"$clone\"."
      "$HERDR" do layout.switch --name "$clone" >/dev/null || die "could not switch to layout $clone"
    else
      say "Layout \"$layout\" ships with Herdr; cloning it as \"$clone\"."
      "$HERDR" do layout.clone --name "$layout" --as "$clone" >/dev/null || die "could not clone layout $layout"
    fi
    layout="$clone"
    sleep 1
  fi
  file="$HERDR_HOME/layouts/$layout.json"
  [ -f "$file" ] || die "layout file not found: $file"
  cp "$file" "$WORK/layout.before"
  rc=0
  result="$(python3 "$WORK/helper.py" wire "$file" "$NAME" "$(say "$EXAMPLES" | tr ' ' ',')" "$STATE/$layout.toast-before")" || rc=$?
  if [ "$rc" = "3" ]; then
    say "Could not tell where your terminals are in layout \"$layout\"."
    manual_steps
    return 0
  fi
  [ "$rc" = "0" ] || die "could not edit $file (it was not changed)"
  if [ "$result" = "changed" ]; then
    mkdir -p "$STATE/backups"
    cp "$WORK/layout.before" "$STATE/backups/layout-$layout-$STAMP.json"
    say "Wired layout \"$layout\" ($file)"
    say "  backup: $STATE/backups/layout-$layout-$STAMP.json"
  else
    say "Layout \"$layout\" already uses $NAME."
  fi

  sleep 2
  "$HERDR" check "$HERDR_HOME/mods/$NAME" >/dev/null 2>&1 || say "Warning: \`herdr-app check\` reported a problem with the mod."
  if "$HERDR" status 2>/dev/null | python3 "$WORK/helper.py" healthy "$NAME"; then
    "$HERDR" do "$NAME.demo" >/dev/null 2>&1 || true
    say ""
    say "Done. Three sample cards should be showing in the top-right corner."
    say "To remove it, run install.sh again with: uninstall $NAME"
  else
    say ""
    say "Installed, but Herdr does not show the block yet (see any errors above)."
    say "Check with: herdr-app status"
  fi
}

uninstall() {
  layout="$(shown_layout || true)"
  if [ -n "$layout" ] && [ -f "$HERDR_HOME/layouts/$layout.json" ]; then
    file="$HERDR_HOME/layouts/$layout.json"
    cp "$file" "$WORK/layout.before"
    result="$(python3 "$WORK/helper.py" unwire "$file" "$NAME" "$STATE/$layout.toast-before")" || die "could not edit $file"
    if [ "$result" = "changed" ]; then
      mkdir -p "$STATE/backups"
      cp "$WORK/layout.before" "$STATE/backups/layout-$layout-$STAMP.json"
      say "Took $NAME out of layout \"$layout\"."
      say "  backup: $STATE/backups/layout-$layout-$STAMP.json"
      sleep 1
    else
      say "Layout \"$layout\" does not use $NAME."
    fi
  else
    say "Herdr is not running, so no layout was changed."
    say "If a layout still names $NAME, remove its \"toast\" key and floating entry."
  fi
  dest="$HERDR_HOME/mods/$NAME"
  if [ -d "$dest" ]; then
    mkdir -p "$STATE/backups"
    mv "$dest" "$STATE/backups/mod-$NAME-$STAMP"
    say "Moved $dest to $STATE/backups/mod-$NAME-$STAMP"
  fi
  say "Done. Other layouts that name $NAME need the same two entries removed."
}

main() {
  ACTION="install"
  if [ "${1:-}" = "uninstall" ]; then ACTION="uninstall"; shift; fi
  NAME="${1:-toast-agent}"
  case " $EXAMPLES " in *" $NAME "*) ;; *) die "unknown example \"$NAME\". Available: $EXAMPLES" ;; esac

  HERDR_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
  [ -d "$HERDR_HOME" ] || die "Herdr's folder was not found at $HERDR_HOME. Install and start Herdr first (https://herdr.dev)."
  HERDR="$(find_herdr || true)"
  STATE="$HERDR_HOME/.herdr-agent-toast"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT
  write_helper "$WORK/helper.py"

  if [ "$ACTION" = "uninstall" ]; then
    have_python || die "python3 is needed to edit the layout file. Remove the \"toast\" key and the floating entry by hand, then delete $HERDR_HOME/mods/$NAME."
    uninstall
  else
    install_files
    if have_python; then
      wire_layout
    else
      say "python3 was not found, so the layout file was left alone."
      manual_steps
    fi
  fi
}

# Everything runs from here, so a partly downloaded script does nothing.
main "$@"
