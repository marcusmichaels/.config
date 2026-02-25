# `tilewindows`

Arrange/save macOS window layouts from the terminal using AppleScript.
No deps. Super fast. Human-editable JSON config.

**Per-project layouts** — `tilewindows` automatically detects a `tilewindows.config.json` in your current directory, so different projects can have completely different window arrangements. `cd` into a repo, run `tilewindows dev`, and your editor, browser, terminal, and Slack snap into the right places for that project.

## Quick start

```bash
# 1. Clone it (or copy it wherever you like)
git clone <repo-url> ~/.config/scripts/tilewindows

# 2. Install globally (also sets up zsh tab completions)
cd ~/.config/scripts/tilewindows
npm link

# 3. Restart your shell (or: source ~/.zshrc)

# 4. Save your current window arrangement
tilewindows save work

# 5. Apply it any time
tilewindows work
```

On first run macOS will prompt for permissions — grant both:

- System Settings → Privacy & Security → **Accessibility** → allow your terminal app.
- System Settings → Privacy & Security → **Automation** → allow your terminal to control "System Events" and target apps.

> **No npm?** You can set it up manually instead:
>
> ```bash
> echo 'alias tilewindows="~/.config/scripts/tilewindows/tilewindows.js"' >> ~/.zshrc
> echo 'eval "$(tilewindows completions)"' >> ~/.zshrc
> source ~/.zshrc
> ```

---

## Commands

```text
tilewindows <layout>         Apply a layout (shorthand for "apply")
tilewindows apply <layout>   Apply a saved layout
tilewindows save <layout>    Save current windows to a named layout
tilewindows get              Print current windows as JSON (live)
tilewindows list             List saved layouts
tilewindows print <layout>   Show JSON for a saved layout
tilewindows rm <layout>      Remove a saved layout
tilewindows path             Show config file location
tilewindows init             Create tilewindows.config.json in the current directory
tilewindows completions      Print zsh completions script
tilewindows help             Show this help message
```

### Examples

```bash
tilewindows save home
tilewindows apply home
tilewindows home              # shorthand
tilewindows list
tilewindows print home
tilewindows rm old-layout
jq '.' "$(tilewindows path)" # pretty-print the config file
```

---

## Tab completions

Tab completions for zsh are set up **automatically** when you install via `npm link`. They are added to your `~/.zshrc` as:

```bash
eval "$(tilewindows completions)"
```

This gives you completions for all commands and your saved layout names:

```text
tilewindows <tab>            →  commands + layout names
tilewindows apply <tab>      →  layout names
tilewindows rm <tab>         →  layout names
tilewindows print <tab>      →  layout names
```

Layout names are fetched live from your config, so new layouts appear in completions immediately.

If you installed manually (without `npm link`), add the eval line to your `~/.zshrc` yourself:

```bash
echo 'eval "$(tilewindows completions)"' >> ~/.zshrc && source ~/.zshrc
```

---

## How it works (short version)

- `save` captures all visible app windows with their **screen coordinates**.
- `apply` arranges windows **per app**, launching apps that aren't running and waiting for them to be ready. All apps are tiled **in parallel** so a slow-launching app doesn't block the rest.
- If a layout contains multiple entries for the same app, they're applied to **distinct windows**:
  - If an item has an `index`, it targets that app's window index first (front-to-back ordering).
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

You can override the location any time.

**Config resolution (highest → lowest):**

1. `--config=/path/to/tilewindows.config.json` (explicit flag)
2. `TILEWINDOWS_CONFIG=/path/to/tilewindows.config.json` (environment variable)
3. `--here` flag → force `CWD/tilewindows.config.json`
4. `tilewindows.config.json` in the current directory (auto-detected if present)
5. Script-relative `tilewindows.config.json` (if it already exists)
6. `$XDG_CONFIG_HOME/tilewindows/tilewindows.config.json` (if set)
7. `~/Library/Application Support/tilewindows.config.json` (macOS)
8. `~/.config/tilewindows/tilewindows.config.json`

Show the active path:

```bash
tilewindows path
```

---

## Per-project layouts

One of the most useful features of `tilewindows` is **per-directory configs**. Every project can have its own window arrangement — your frontend repo might want a browser and devtools side-by-side, while your backend repo might want two terminals and a database GUI.

`tilewindows` automatically detects a `tilewindows.config.json` in the current directory and uses it instead of the global config. No flags needed — just `cd` and go:

```bash
cd ~/projects/frontend
tilewindows dev          # uses ~/projects/frontend/tilewindows.config.json

cd ~/projects/backend
tilewindows dev          # uses ~/projects/backend/tilewindows.config.json

cd ~
tilewindows home         # no project config here, uses global config
```

Each config file is independent — same layout names can mean different things in different projects.

### Creating a project config

From inside a project directory:

```bash
tilewindows init         # creates tilewindows.config.json in the current directory
```

Then save and apply layouts as usual:

```bash
tilewindows save dev     # saved to this project's config
tilewindows dev          # applied from this project's config
```

### Forcing project mode

If you want to save/apply to a project file even if it doesn't exist yet:

```bash
tilewindows --here save dev
tilewindows --here dev
```

This will create and use `./tilewindows.config.json`.

### Sharing with your team

Since the config is just a JSON file in your project root, you can check it in alongside your code:

- **Commit it:** if your team uses the same monitor setups, check `tilewindows.config.json` into your repo. Everyone gets the same layout with `tilewindows dev`.
- **Ignore it:** if setups differ, add it to `.gitignore` and let each developer manage their own project layouts.

---

## Installing for others

**A) npm link (recommended)**

```bash
git clone <repo-url> ~/.config/scripts/tilewindows
cd ~/.config/scripts/tilewindows
npm link
```

Completions are added automatically. Restart your shell or run `source ~/.zshrc`.

**B) Alias (simple, works everywhere)**

Ship the file and have users add:

```bash
echo 'alias tilewindows="/ABSOLUTE/PATH/TO/tilewindows.js"' >> ~/.zshrc
echo 'eval "$(tilewindows completions)"' >> ~/.zshrc
source ~/.zshrc
```

**C) Curl one-liner (host it somewhere)**

```bash
mkdir -p ~/.local/bin
curl -fsSL https://example.com/tilewindows.js -o ~/.local/bin/tilewindows
chmod +x ~/.local/bin/tilewindows
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
echo 'eval "$(tilewindows completions)"' >> ~/.zshrc
source ~/.zshrc
```

---

## Tips

- If you frequently move/close windows, `index` may shift. That's fine — the script falls back to the next unused standard window per app.
- Apps with **no standard windows** (just panels) won't be moved.
- If nothing happens, check macOS permissions again (Accessibility + Automation).
- All apps in a layout are tiled **in parallel**. A slow-launching app (e.g. one that's updating) won't block the rest.
- Each app has up to 20 seconds to produce a window before timing out.

---

## Troubleshooting

- **"Operation not permitted" / no movement** → Terminal app not allowed under **Accessibility** and/or **Automation** in System Settings.
- **Layout only moves one window of an app** → Make sure you saved a layout when multiple windows were open (`tilewindows save ...`). The apply step assigns each rectangle to a **different** window.
- **App launches but doesn't move** → The app may be taking too long to create its window. Try running the command again once the app is fully loaded.
- **Weird positions on multi-monitor** → macOS uses a global coordinate space that can include negative values (left/above primary display). That's expected.
- **See current windows** → `tilewindows get`

---

## Uninstall

If installed via `npm link`:

```bash
cd ~/.config/scripts/tilewindows
npm unlink
```

This removes the global `tilewindows` command and cleans up the completions from `~/.zshrc` automatically.

To also remove the script and config:

```bash
rm -rf ~/.config/scripts/tilewindows
```

If installed manually, remove the alias and completions lines from your `~/.zshrc` and delete the script.

---

## Security note

This tool uses `osascript` (AppleScript) to control apps via **System Events**. macOS will explicitly ask for your permission to allow this automation. You're always in control.

---

Happy tiling!
