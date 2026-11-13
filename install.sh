#!/bin/sh
# herdr-agent-toast installer (v0.1.0)
#
#   sh install.sh [example]            install an example (default: toast-agent)
#   sh install.sh uninstall [example]  take it out again
#
# Install, all under ~/.config/herdr-app (or $HERDR_APP_HOME):
#   1. Gets the example's mod files and checks they are what they should be.
#   2. Copies them into mods/ and runs `herdr-app check` on the result.
#   3. If you are on a layout that ships with Herdr, clones it as "<name>-toast"
#      (shipped layouts are replaced at every start, so edits do not last).
#   4. Adds two entries to your layout file: "toast": "<example>" at the root,
#      and a floating block for it over the node that holds your terminals.
#   5. Shows three sample cards.
# Uninstall takes the two entries out of every layout that has them, puts back
# the "toast" value that was there before, switches back from the clone, and
# moves the mod folder to the backups. The clone's file stays.
#
# A file is copied to .herdr-agent-toast/backups/ before it is changed. The
# layout file is rewritten as plain JSON with 2-space indentation.
# No sudo, nothing outside Herdr's folder. Needs Herdr app 0.1.15+, running,
# and python3 to edit the layout.
#
# Environment:
#   HERDR_APP_HOME     Herdr's folder (default ~/.config/herdr-app)
#   HERDR_APP_BIN      the herdr-app command (default: found on PATH)
#   HERDR_TOAST_REF    git ref to download from (default main)
#   HERDR_TOAST_FORCE  1: replace a mod folder of the same name from elsewhere

set -eu

REPO="0omin/herdr-agent-toast"
REF="${HERDR_TOAST_REF:-main}"
EXAMPLES="toast-agent"
FILES="mod.json core.js main.js"
MARK="// herdr-agent-toast v"
# Layouts Herdr ships, for when installed.json cannot be read.
SHIPPED="main terminals win98"

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
import glob, json, os, shutil, stat, sys

def load(path):
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("%s: the layout is not a JSON object" % path)
    return data

def save(path, data, backup):
    # Back up first; then write beside the real file (a symlinked layout stays
    # a symlink) with the same permissions, and swap it in.
    real = os.path.realpath(path)
    os.makedirs(os.path.dirname(backup), exist_ok=True)
    shutil.copy2(real, backup)
    tmp = real + ".tmp-toast"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.chmod(tmp, stat.S_IMODE(os.stat(real).st_mode))
        os.replace(tmp, real)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

def nodes(node, parent=None):
    yield node, parent
    for child in node.get("children") or []:
        if isinstance(child, dict):
            yield from nodes(child, node)

def mod_of(entry):
    content = entry.get("content") if isinstance(entry, dict) else None
    return content.get("mod") if isinstance(content, dict) else None

def drop_floating(data, gone):
    for node, _ in nodes(data):
        if isinstance(node.get("floating"), list):
            kept = [e for e in node["floating"] if not gone(mod_of(e))]
            if kept:
                node["floating"] = kept
            else:
                del node["floating"]

def wire(path, name, ours, state, backup):
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
    data["toast"] = name
    # Another example from this repo gives way to this one.
    drop_floating(data, lambda m: m in ours and m != name)
    if not wired:
        target.setdefault("floating", []).append(
            {"id": name, "content": {"mod": name}, "edge": "top", "align": "end"})
    if json.dumps(data, sort_keys=True) == before:
        print("unchanged")
        return 0
    save(path, data, backup)
    # Remember what "toast" was, only once the layout is really saved.
    if isinstance(prev, str) and prev and prev != name and prev not in ours:
        with open(state, "w", encoding="utf-8") as f:
            f.write(prev)
    elif not prev and os.path.exists(state):
        os.remove(state)  # the old value is gone; a stale note would bring it back
    print("changed")
    return 0

def unwire_all(layouts, name, state_dir, backups, stamp):
    for path in sorted(glob.glob(os.path.join(layouts, "*.json"))):
        stem = os.path.basename(path)[:-5]
        try:
            data = load(path)
        except (ValueError, OSError) as e:
            print("install.sh: skipped %s: %s" % (path, e), file=sys.stderr)
            continue
        before = json.dumps(data, sort_keys=True)
        state = os.path.join(state_dir, stem + ".toast-before")
        drop_floating(data, lambda m: m == name)
        restored = False
        if data.get("toast") == name:
            if os.path.exists(state):
                with open(state, encoding="utf-8") as f:
                    data["toast"] = f.read().strip()
                restored = True
            else:
                del data["toast"]
        if json.dumps(data, sort_keys=True) != before:
            save(path, data, os.path.join(backups, "layout-%s-%s.json" % (stem, stamp)))
            if restored:
                os.remove(state)
            print(stem)
    return 0

def main(argv):
    cmd = argv[1]
    if cmd == "wire":
        return wire(argv[2], argv[3], argv[4].split(","), argv[5], argv[6])
    if cmd == "unwire-all":
        return unwire_all(argv[2], argv[3], argv[4], argv[5], argv[6])
    if cmd == "layout":  # the shown layout's name, from `herdr-app status` on stdin
        name = json.load(sys.stdin).get("layout")
        if not isinstance(name, str) or not name:
            return 1
        print(name)
        return 0
    if cmd == "shipped":  # exit 0 when Herdr ships this layout
        try:
            with open(argv[2], encoding="utf-8") as f:
                return 0 if ("layout:" + argv[3]) in json.load(f) else 1
        except (ValueError, OSError):
            return 0 if argv[3] in argv[4].split(",") else 1
    if cmd == "json":  # exit 0 when the file is a JSON object
        with open(argv[2], encoding="utf-8") as f:
            return 0 if isinstance(json.load(f), dict) else 1
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
  say "The mod is installed, but no layout was changed. To finish by hand, edit your"
  say "own layout file in $HERDR_HOME/layouts/ (clone a shipped one first):"
  say "  1. at the root:  \"toast\": \"$NAME\""
  say "  2. on the node that holds your terminals:"
  say "     \"floating\": [{ \"id\": \"$NAME\", \"content\": { \"mod\": \"$NAME\" }, \"edge\": \"top\", \"align\": \"end\" }]"
  say "Then run: herdr-app do $NAME.demo"
  say "Details: https://github.com/$REPO/blob/main/docs/install.md"
}

# Is the folder one of this repo's mods?
ours() { [ -f "$1/main.js" ] && head -n 1 "$1/main.js" | grep -qF "$MARK"; }

# The shown layout's name, or nothing when Herdr does not answer.
shown_layout() {
  [ -n "$HERDR" ] || return 1
  "$HERDR" status 2>/dev/null | python3 "$WORK/helper.py" layout 2>/dev/null
}

warn_old_herdr() {
  [ -n "$HERDR" ] || return 0
  v="$("$HERDR" --version 2>/dev/null | sed -n 's/^herdr-app \([0-9][0-9.]*\).*/\1/p')"
  [ -n "$v" ] || return 0
  oldest="$(printf '%s\n%s\n' "$v" "0.1.15" | sort -t. -k1,1n -k2,2n -k3,3n | head -n 1)"
  if [ "$oldest" != "0.1.15" ]; then
    say "Warning: this is Herdr app $v. The layout \"toast\" key needs 0.1.15 or newer."
  fi
}

# Puts the example's files in $WORK/src and checks them.
fetch_files() {
  src="$WORK/src"
  mkdir -p "$src"
  here=""
  # Files next to the script count only when the script itself is a file
  # (piped into sh, $0 is the shell, and the current folder means nothing).
  case "$0" in
    *install.sh) [ -f "$0" ] && here="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)" ;;
  esac
  if [ -n "$here" ] && [ -f "$here/$NAME/mods/$NAME/main.js" ]; then
    for f in $FILES; do cp "$here/$NAME/mods/$NAME/$f" "$src/$f" || die "missing file: $f"; done
    say "Using the files next to install.sh."
  else
    command -v curl >/dev/null 2>&1 || die "curl is needed to download the files"
    for f in $FILES; do
      curl -fsSL "https://raw.githubusercontent.com/$REPO/$REF/$NAME/mods/$NAME/$f" -o "$src/$f" \
        || die "could not download $f (ref: $REF). Nothing was changed."
    done
    say "Downloaded $NAME from github.com/$REPO ($REF)."
  fi
  # A captive portal or a proxy can answer with a web page: look before installing.
  for f in core.js main.js; do
    head -n 1 "$src/$f" | grep -qF "$MARK" || die "$f is not the expected file (ref: $REF). Nothing was changed."
  done
  if [ "$PYTHON" = "1" ]; then
    python3 "$WORK/helper.py" json "$src/mod.json" 2>/dev/null || die "mod.json is not the expected file (ref: $REF). Nothing was changed."
  else
    grep -q '"place"' "$src/mod.json" || die "mod.json is not the expected file (ref: $REF). Nothing was changed."
  fi
}

install_files() {
  dest="$HERDR_HOME/mods/$NAME"
  MOD_BACKUP=""
  MOD_NEW=""
  mkdir -p "$HERDR_HOME/mods"
  if [ -e "$dest" ]; then
    if ! ours "$dest" && [ "${HERDR_TOAST_FORCE:-}" != "1" ]; then
      die "$dest exists and is not from this repo. Move it away, or set HERDR_TOAST_FORCE=1. Nothing was changed."
    fi
    same=1
    for f in $FILES; do cmp -s "$src/$f" "$dest/$f" || same=0; done
    if [ "$same" = "1" ]; then
      say "$dest is already up to date."
      return 0
    fi
    MOD_BACKUP="$STATE/backups/mod-$NAME-$STAMP"
    mkdir -p "$STATE/backups"
    cp -R "$dest" "$MOD_BACKUP" || die "could not back up $dest. Nothing was changed."
    say "Updating $dest"
    say "  backup: $MOD_BACKUP"
    # mod.json first, main.js last: Herdr reloads the mod when main.js lands.
    for f in $FILES; do cp "$src/$f" "$dest/$f"; done
  else
    # Stage the whole folder, then move it in one step, so Herdr never sees
    # main.js without mod.json (it would dock the mod as a side panel).
    stage="$STATE/stage-$$"
    mkdir -p "$stage/$NAME"
    for f in $FILES; do cp "$src/$f" "$stage/$NAME/$f"; done
    mv "$stage/$NAME" "$dest"
    rmdir "$stage" 2>/dev/null || true
    MOD_NEW="1"
    say "Installed $dest"
  fi
}

# Undo install_files: back to the previous files, or no folder at all.
rollback_files() {
  dest="$HERDR_HOME/mods/$NAME"
  if [ -n "$MOD_BACKUP" ]; then
    for f in $FILES; do [ -f "$MOD_BACKUP/$f" ] && cp "$MOD_BACKUP/$f" "$dest/$f"; done
    say "Put the previous files back in $dest."
  elif [ -n "$MOD_NEW" ]; then
    mkdir -p "$STATE/backups"
    mv "$dest" "$STATE/backups/mod-$NAME-failed-$STAMP"
    say "Took the new folder out again (kept in $STATE/backups/mod-$NAME-failed-$STAMP)."
  fi
}

wire_layout() {
  if [ -z "$HERDR" ]; then
    say "The herdr-app command was not found (set HERDR_APP_BIN to its path)."
    manual_steps
    return 0
  fi
  layout="$(shown_layout || true)"
  if [ -z "$layout" ]; then
    say "Herdr does not seem to be running (no answer from \`herdr-app status\`)."
    say "Start Herdr and run this again to finish, or:"
    manual_steps
    return 0
  fi

  # The mod must load before any layout points at it.
  if ! out="$("$HERDR" check "$HERDR_HOME/mods/$NAME" 2>&1)"; then
    say "$out"
    rollback_files
    die "\`herdr-app check\` failed for the mod, so no layout was changed."
  fi

  origin=""
  if python3 "$WORK/helper.py" shipped "$HERDR_HOME/installed.json" "$layout" "$(say "$SHIPPED" | tr ' ' ',')" 2>/dev/null; then
    origin="$layout"
    clone="$layout-toast"
    if [ -f "$HERDR_HOME/layouts/$clone.json" ]; then
      say "Layout \"$layout\" ships with Herdr; switching to your clone \"$clone\"."
      "$HERDR" do layout.switch --name "$clone" >/dev/null || die "could not switch to layout $clone. No layout was changed."
    else
      say "Layout \"$layout\" ships with Herdr; cloning it as \"$clone\"."
      "$HERDR" do layout.clone --name "$layout" --as "$clone" >/dev/null || die "could not clone layout $layout. No layout was changed."
      say "$origin" > "$STATE/$clone.cloned-from"
    fi
    layout="$clone"
    sleep 1
  fi

  file="$HERDR_HOME/layouts/$layout.json"
  backup="$STATE/backups/layout-$layout-$STAMP.json"
  rc=0
  if [ -f "$file" ]; then
    result="$(python3 "$WORK/helper.py" wire "$file" "$NAME" "$(say "$EXAMPLES" | tr ' ' ',')" "$STATE/$layout.toast-before" "$backup")" || rc=$?
  else
    rc=5
  fi
  if [ "$rc" != "0" ]; then
    if [ -n "$origin" ]; then
      "$HERDR" do layout.switch --name "$origin" >/dev/null 2>&1 && say "Switched back to layout \"$origin\"."
    fi
    if [ "$rc" = "3" ]; then
      say "Could not tell where your terminals are in layout \"$layout\"."
      manual_steps
      return 0
    fi
    die "could not edit $file. It was left as it was; the mod itself is installed in $HERDR_HOME/mods/$NAME."
  fi
  if [ "$result" = "changed" ]; then
    say "Wired layout \"$layout\" ($file)"
    say "  backup: $backup"
  else
    say "Layout \"$layout\" already uses $NAME."
  fi

  sleep 2
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
  dest="$HERDR_HOME/mods/$NAME"
  if [ -e "$dest" ] && ! ours "$dest" && [ "${HERDR_TOAST_FORCE:-}" != "1" ]; then
    die "$dest is not from this repo, so nothing was changed. Set HERDR_TOAST_FORCE=1 to remove it anyway."
  fi

  # Every layout that names the mod, shown or not, Herdr running or not.
  changed="$(python3 "$WORK/helper.py" unwire-all "$HERDR_HOME/layouts" "$NAME" "$STATE" "$STATE/backups" "$STAMP")" \
    || die "could not edit the layouts. The mod folder was left in place."
  if [ -n "$changed" ]; then
    say "$changed" | while IFS= read -r l; do
      say "Took $NAME out of layout \"$l\"."
      say "  backup: $STATE/backups/layout-$l-$STAMP.json"
    done
  else
    say "No layout uses $NAME."
  fi

  # Back from a clone this script made.
  layout="$(shown_layout || true)"
  if [ -n "$layout" ] && [ -f "$STATE/$layout.cloned-from" ]; then
    origin="$(cat "$STATE/$layout.cloned-from")"
    if "$HERDR" do layout.switch --name "$origin" >/dev/null 2>&1; then
      say "Switched back to layout \"$origin\"."
      say "  Your clone is still at $HERDR_HOME/layouts/$layout.json; delete it if you do not want it."
    fi
  fi

  if [ -d "$dest" ]; then
    [ -n "$changed" ] && sleep 1
    mkdir -p "$STATE/backups"
    mv "$dest" "$STATE/backups/mod-$NAME-$STAMP"
    say "Moved $dest to $STATE/backups/mod-$NAME-$STAMP"
  fi
  say "Done."
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
  PYTHON="0"
  if have_python; then PYTHON="1"; fi

  mkdir -p "$STATE"
  # One run at a time: mkdir either makes the folder or fails.
  mkdir "$STATE/lock" 2>/dev/null \
    || die "another install.sh seems to be running. If not, remove $STATE/lock and try again."
  WORK=""
  trap 'if [ -n "$WORK" ]; then rm -rf "$WORK"; fi; rmdir "$STATE/lock" 2>/dev/null || true' EXIT
  trap 'exit 1' INT TERM
  WORK="$(mktemp -d)"
  write_helper "$WORK/helper.py"

  if [ "$ACTION" = "uninstall" ]; then
    [ "$PYTHON" = "1" ] || die "python3 is needed to edit the layout files. Remove the \"toast\" key and the floating entry by hand, then delete $HERDR_HOME/mods/$NAME."
    uninstall
  else
    warn_old_herdr
    fetch_files
    install_files
    if [ "$PYTHON" = "1" ]; then
      wire_layout
    else
      say "python3 was not found, so no layout was changed."
      manual_steps
    fi
  fi
}

# Everything runs from here, so a partly downloaded script does nothing.
main "$@"
