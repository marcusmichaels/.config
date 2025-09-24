# `tilewindows`

Arrange/save macOS window layouts from the terminal using AppleScript.
No deps. Super fast. Human-editable JSON config.

## TL;DR (Quick start)

1) **Put the script somewhere** (e.g. `~/.config/scripts/tilewindows/tilewindows.js`) and make it executable:

```bash
mkdir -p ~/.config/scripts/tilewindows
# copy your tilewindows.js into that folder
chmod +x ~/.config/scripts/tilewindows/tilewindows.js
```

2) **Add an alias** (one-liner):

```bash
echo 'alias tilewindows="~/.config/scripts/tilewindows/tilewindows.js"' >> ~/.zshrc && source ~/.zshrc
```

3) **Grant macOS permissions** (first run will likely prompt):
- System Settings → Privacy & Security → **Accessibility** → allow your terminal app.
- System Settings → Privacy & Security → **Automation** → allow your terminal to control “System Events” and target apps.

4) **Save your current layout**:

```bash
tilewindows save work
```

5) **Apply it later**:

```bash
tilewindows work
# or: tilewindows apply work
```

Done 🎉

---

## Commands

```text
tilewindows <layout>         Apply a layout (alias of "apply <layout>")
tilewindows apply <layout>   Apply a saved layout
tilewindows save <layout>    Save current windows to a named layout
tilewindows get              Print current windows as JSON (live)
tilewindows list             List saved layouts
tilewindows print <layout>   Show JSON for a saved layout
tilewindows rm <layout>      Remove a saved layout
tilewindows path             Show config file location
tilewindows help             Show this help message
```

### Examples

```bash
tilewindows save home
tilewindows apply home
tilewindows list
tilewindows print home
tilewindows rm old-layout
jq '.' "$(tilewindows path)"       # pretty-print the config file
```

---

## How it works (short version)

- `save` captures all visible app windows with their **screen coordinates**.
- `apply` arranges windows **per app**. If a layout contains multiple entries for the same app, they’re applied to **distinct windows**:
  - If an item has an `index`, it targets that app’s window index first (front-to-back ordering).
  - Otherwise it fills the **next unused standard window**.
  - Minimized windows are **unminimized** before resizing.
  - Non-standard windows (sheets/panels) are skipped.

The config is plain JSON, so you can hand-edit sizes/positions or remove entries.

---

## Config file location

By default the tool keeps config **coupled to the script** (same folder), using:

```
tilewindows.config.json
```

You can override the location any time:

**Order of resolution (highest → lowest):**
1. `--config=/path/to/tilewindows.config.json`
2. `TILEWINDOWS_CONFIG=/path/to/tilewindows.config.json`
3. **Script-relative**: `tilewindows.config.json` (next to the script)
4. `$XDG_CONFIG_HOME/tilewindows.config.json`
5. `~/Library/Application Support/tilewindows.config.json` (macOS)
6. `~/.config/tilewindows.config.json`

Show the active path:

```bash
tilewindows path
```

---

## Installing for others (options)

**A) Alias (simple, works everywhere)**
Ship the file and have users add:

```bash
echo 'alias tilewindows="/ABSOLUTE/PATH/TO/tilewindows.js"' >> ~/.zshrc && source ~/.zshrc
```

**B) Curl one-liner (host it somewhere)**

```bash
mkdir -p ~/.local/bin
curl -fsSL https://example.com/tilewindows.js -o ~/.local/bin/tilewindows
chmod +x ~/.local/bin/tilewindows
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

*(If you later package for npm or brew, add those here.)*

---

## Project-based configs

`tilewindows` supports per-project layouts using a visible config file in your project root:

```bash
tilewindows.config.json
```

If this file exists in the current directory, it is used automatically instead of the global config.
This makes it easy to keep project-specific window layouts alongside your code.

### Creating a project config

From inside a project directory:

```bash
tilewindows init
```

This will create an empty `tilewindows.config.json` file in the current working directory.

You can now save and apply layouts as usual:

```bash
tilewindows save dev
tilewindows dev
```

### Forcing project mode

If you want to save/apply to a project file even if it doesn’t exist yet:

```bash
tilewindows --here save dev
tilewindows --here dev
```

This will create and use `./tilewindows.config.json`.

### Config resolution order

When choosing which config file to use, tilewindows follows this order:

1. `--config=/path/to/tilewindows.config.json` (explicit flag)
2. `TILEWINDOWS_CONFIG=/path/to/tilewindows.config.json` (environment variable)
3. `--here flag` → force CWD `tilewindows.config.json`
4. `tilewindows.config.json` in the current directory (auto-detected if present)
5. Script-relative: `tilewindows.config.json` next to the script
6. `$XDG_CONFIG_HOME/tilewindows.config.json` (if set)
7. `~/Library/Application Support/tilewindows.config.json` (macOS default)
8. `~/.config/tilewindows.config.json` (legacy fallback)

Show the active config path with:

```bash
tilewindows path
```

### Sharing with your team

- **Commit it:** if your team uses the same monitor setups, check in tilewindows.config.json into your repo.

- **Ignore it**: if setups differ, add it to .gitignore and let each developer manage their own project layouts.

---

## Tips

- If you frequently move/close windows, `index` may shift. That’s fine — the script falls back to the next unused standard window per app.
- Want strict behavior (error if a specific index isn’t found)? That’s easy to add later as a `--strict` flag.
- Apps with **no standard windows** (just panels) won’t be moved.
- If nothing happens, check macOS permissions again (Accessibility + Automation).

---

## Troubleshooting

- **“Operation not permitted” / no movement** → Terminal app not allowed under **Accessibility** and/or **Automation**.
- **Layout only moves one window of an app** → Make sure you saved a layout when multiple windows were open (`tilewindows save ...`). The apply step assigns each rectangle to a **different** window.
- **Weird positions on multi-monitor** → macOS uses a global coordinate space that can include negative values (left/above primary display). That’s expected.
- **See current windows** → `tilewindows get`

---

## Uninstall

Remove the script + config:

```bash
rm -f ~/.config/scripts/tilewindows/tilewindows.js
rm -f "$(tilewindows path)"  # remove config file
# and remove the alias line from ~/.zshrc if you added one
```

---

## Security note

This tool uses `osascript` (AppleScript) to control apps via **System Events**. macOS will explicitly ask for your permission to allow this automation. You’re always in control.

---

Happy tiling! If you want project-specific layouts (e.g., per repo), we can also add support for a `.tilewindows.json` in the current directory that overrides the global config.
