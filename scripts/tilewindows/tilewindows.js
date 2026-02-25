#!/usr/bin/env node

/**
 * tilewindows — arrange/save macOS window layouts via AppleScript
 * No dependencies. Stores layouts in a human-editable JSON config file.
 *
 * Usage:
 *   tilewindows <layout>         Apply a saved layout
 *   tilewindows save <layout>    Capture current windows
 *   tilewindows help             Show all commands
 */

import { execFile } from "child_process";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

// ─── Config resolution ───────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_FILE = path.join(process.cwd(), "tilewindows.config.json");
const FORCE_HERE = process.argv.includes("--here");

/**
 * Resolve the config file path. Highest priority wins:
 *
 *   1. --config=/path/to/file
 *   2. $TILEWINDOWS_CONFIG env var
 *   3. --here  → CWD/tilewindows.config.json (force)
 *   4. CWD/tilewindows.config.json (if it already exists)
 *   5. Script-relative tilewindows.config.json (if it already exists)
 *   6. $XDG_CONFIG_HOME/tilewindows/tilewindows.config.json
 *   7. ~/Library/Application Support/tilewindows.config.json (macOS)
 *   8. ~/.config/tilewindows/tilewindows.config.json
 */
function resolveConfigPath() {
  // 1) Explicit flag
  const flag = process.argv.find((a) => a.startsWith("--config="));
  if (flag) return flag.split("=").slice(1).join("=");

  // 2) Env var
  if (process.env.TILEWINDOWS_CONFIG) return process.env.TILEWINDOWS_CONFIG;

  // 3) Forced CWD
  if (FORCE_HERE) return PROJECT_FILE;

  // 4) CWD file (auto-detected)
  if (fileExists(PROJECT_FILE)) return PROJECT_FILE;

  // 5) Script-relative (coupled install)
  const coupled = path.join(SCRIPT_DIR, "tilewindows.config.json");
  if (fileExists(coupled)) return coupled;

  // 6) XDG
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "tilewindows", "tilewindows.config.json");
  }

  // 7) macOS Application Support
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "tilewindows.config.json");
  }

  // 8) ~/.config fallback
  return path.join(os.homedir(), ".config", "tilewindows", "tilewindows.config.json");
}

const CONFIG_FILE = resolveConfigPath();

// ─── Config I/O ──────────────────────────────────────────────────────

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function ensureConfig() {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ layouts: {} }, null, 2) + "\n");
  }
}

function loadConfig() {
  ensureConfig();
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8") || "{}");
    if (!data.layouts || typeof data.layouts !== "object") data.layouts = {};
    return data;
  } catch {
    return { layouts: {} };
  }
}

function saveConfig(cfg) {
  ensureConfig();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

// ─── AppleScript helpers ─────────────────────────────────────────────

/** Escape a value for use inside an AppleScript double-quoted string. */
function escapeAS(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Run an AppleScript via `osascript` using stdin (avoids all shell-quoting issues).
 * Returns the trimmed stdout. Rejects on error or timeout.
 */
function runOSA(script, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const opts = {};
    if (timeoutMs > 0) opts.timeout = timeoutMs;

    // Pass script on stdin (`-` flag) so we never need to shell-escape it.
    const child = execFile("osascript", ["-"], opts, (err, stdout, stderr) => {
      if (err) {
        if (err.killed) return reject(new Error("osascript timed out"));
        return reject(new Error(stderr?.trim() || String(err)));
      }
      if (stderr?.trim()) return reject(new Error(stderr.trim()));
      resolve((stdout || "").trim());
    });

    child.stdin.end(script);
  });
}

// ─── Window operations ───────────────────────────────────────────────

/**
 * Capture every visible window across all foreground apps.
 * Returns an array of { app, index, x, y, width, height }.
 *
 * Uses a tab-delimited format from AppleScript to avoid JSON-escaping bugs
 * (app names with quotes/backslashes would break in-AS JSON construction).
 */
async function getAllWindows() {
  const script = `
tell application "System Events"
  set output to ""
  repeat with proc in (every process whose background only is false)
    set appName to name of proc
    try
      set winCount to count of windows of proc
      repeat with i from 1 to winCount
        try
          set win to window i of proc
          set {xPos, yPos} to position of win
          set {w, h} to size of win
          set output to output & appName & tab & i & tab & xPos & tab & yPos & tab & w & tab & h & linefeed
        end try
      end repeat
    end try
  end repeat
  return output
end tell`;

  const raw = await runOSA(script, 30_000);
  if (!raw) return [];

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [app, index, x, y, width, height] = line.split("\t");
      return {
        app,
        index: parseInt(index, 10),
        x: parseInt(x, 10),
        y: parseInt(y, 10),
        width: parseInt(width, 10),
        height: parseInt(height, 10),
      };
    })
    .filter((w) => w.app && !Number.isNaN(w.x));
}

/**
 * Activate an app and position one or more of its windows.
 *
 * Instead of generating N separate code blocks per target, we pass the data
 * as parallel AppleScript lists and loop over them in two passes:
 *   Pass 1 — match targets that have an index hint to that specific window.
 *   Pass 2 — assign remaining targets to the first unused standard window.
 */
async function applyWindowsForApp(app, targets) {
  if (!targets?.length) return;

  // Build parallel lists for AppleScript
  const xs = [],
    ys = [],
    ws = [],
    hs = [],
    idxHints = [];

  for (const t of targets) {
    xs.push(t.x);
    ys.push(t.y);
    ws.push(t.width);
    hs.push(t.height);
    idxHints.push(Number.isInteger(t.index) ? t.index : -1);
  }

  const asList = (arr) => `{${arr.join(", ")}}`;

  const script = `
tell application "${escapeAS(app)}" to activate

tell application "System Events"
  try
    tell process "${escapeAS(app)}"
      -- Wait for at least one window to appear (up to 20 seconds).
      -- For already-running apps this exits immediately; for cold launches
      -- it polls every 0.5s until the app has created a window.
      repeat 40 times
        if (count of windows) > 0 then exit repeat
        delay 0.5
      end repeat

      set wins to every window
      set winCount to count of wins
      if winCount is 0 then return

      -- Data: parallel lists describing each target rect
      set tXs to ${asList(xs)}
      set tYs to ${asList(ys)}
      set tWs to ${asList(ws)}
      set tHs to ${asList(hs)}
      set tIdx to ${asList(idxHints)}
      set tCount to count of tXs

      -- Bookkeeping: track which windows and targets are spoken for
      set usedWin to {}
      repeat winCount times
        set end of usedWin to false
      end repeat
      set assigned to {}
      repeat tCount times
        set end of assigned to false
      end repeat

      -- Helper: check if window i is a standard window
      -- (We'll inline this since AS doesn't have first-class functions)

      -- Pass 1: match by index hint
      repeat with t from 1 to tCount
        set idx to item t of tIdx
        if idx > 0 and idx ≤ winCount and (item idx of usedWin) is false then
          set win to item idx of wins
          set isStd to true
          try
            if value of attribute "AXSubrole" of win is not "AXStandardWindow" then set isStd to false
          end try
          if isStd then
            try
              set value of attribute "AXMinimized" of win to false
            end try
            set position of win to {item t of tXs, item t of tYs}
            set size of win to {item t of tWs, item t of tHs}
            set item idx of usedWin to true
            set item t of assigned to true
          end if
        end if
      end repeat

      -- Pass 2: assign unmatched targets to next unused standard window
      repeat with t from 1 to tCount
        if (item t of assigned) is false then
          repeat with i from 1 to winCount
            if (item i of usedWin) is false then
              set win to item i of wins
              set isStd to true
              try
                if value of attribute "AXSubrole" of win is not "AXStandardWindow" then set isStd to false
              end try
              if isStd then
                try
                  set value of attribute "AXMinimized" of win to false
                end try
                set position of win to {item t of tXs, item t of tYs}
                set size of win to {item t of tWs, item t of tHs}
                set item i of usedWin to true
                exit repeat
              end if
            end if
          end repeat
        end if
      end repeat

    end tell
  end try
end tell`;

  try {
    await runOSA(script, 30_000);
    console.log(`  ✓ ${app} — ${targets.length} window(s)`);
  } catch (e) {
    console.error(`  ✗ ${app} — ${e.message}`);
  }
}

// ─── Commands ────────────────────────────────────────────────────────

async function cmdApply(name) {
  const layout = loadConfig().layouts?.[name];
  if (!layout?.length) {
    console.error(`No layout found: "${name}"`);
    process.exitCode = 1;
    return;
  }

  console.log(`Applying layout "${name}"…`);

  // Group targets by app (preserving order of first appearance)
  const byApp = new Map();
  for (const item of layout) {
    if (!item?.app) continue;
    if (!byApp.has(item.app)) byApp.set(item.app, []);
    byApp.get(item.app).push(item);
  }

  // Launch and position all apps in parallel so a slow-launching app
  // can't block the rest from being tiled.
  const apps = [...byApp.keys()];
  const results = await Promise.allSettled(apps.map((app) => applyWindowsForApp(app, byApp.get(app))));

  const failed = apps.filter((_, i) => results[i].status === "rejected");
  if (failed.length) {
    console.log(`  ⚠ Failed/timed out: ${failed.join(", ")}`);
  }

  console.log("Done.");
}

async function cmdGet() {
  const windows = await getAllWindows();
  console.log(JSON.stringify(windows, null, 2));
}

async function cmdSave(name) {
  if (!name) {
    console.error("Usage: tilewindows save <name>");
    process.exitCode = 1;
    return;
  }
  const windows = await getAllWindows();
  const cfg = loadConfig();
  cfg.layouts[name] = windows;
  saveConfig(cfg);
  console.log(`Saved ${windows.length} window(s) to layout "${name}".`);
}

function cmdList() {
  const names = Object.keys(loadConfig().layouts || {});
  if (names.length === 0) {
    console.log("(no layouts saved yet)");
  } else {
    names.forEach((n) => console.log(n));
  }
}

function cmdRm(name) {
  const cfg = loadConfig();
  if (!cfg.layouts?.[name]) {
    console.error(`No layout found: "${name}"`);
    process.exitCode = 1;
    return;
  }
  delete cfg.layouts[name];
  saveConfig(cfg);
  console.log(`Removed layout "${name}".`);
}

function cmdPrint(name) {
  const layout = loadConfig().layouts?.[name];
  if (!layout) {
    console.error(`No layout found: "${name}"`);
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(layout, null, 2));
}

function cmdInit() {
  if (fs.existsSync(PROJECT_FILE)) {
    console.log(`Already exists: ${PROJECT_FILE}`);
  } else {
    const dir = path.dirname(PROJECT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PROJECT_FILE, JSON.stringify({ layouts: {} }, null, 2) + "\n");
    console.log(`Created ${PROJECT_FILE}`);
  }
}

function cmdPath() {
  ensureConfig();
  console.log(CONFIG_FILE);
}

function cmdCompletions() {
  const script = [
    "# tilewindows zsh completions",
    '# Add to ~/.zshrc:  eval "$(tilewindows completions)"',
    "",
    "_tilewindows() {",
    "  local -a commands layouts",
    "  commands=(init apply get save list rm print path help)",
    "",
    "  if (( CURRENT == 2 )); then",
    '    layouts=("${(@f)$(tilewindows list 2>/dev/null)}")',
    "    _alternative \\",
    "      'commands:command:(${commands[@]})' \\",
    "      'layouts:layout:(${layouts[@]})'",
    "  elif (( CURRENT == 3 )); then",
    "    case ${words[2]} in",
    "      apply|print|rm)",
    '        layouts=("${(@f)$(tilewindows list 2>/dev/null)}")',
    "        _alternative 'layouts:layout:(${layouts[@]})'",
    "        ;;",
    "    esac",
    "  fi",
    "}",
    "",
    "compdef _tilewindows tilewindows",
  ].join("\n");
  console.log(script);
}

function cmdHelp() {
  console.log(`
Usage:
  tilewindows <layout>         Apply a layout (shorthand for "apply")
  tilewindows apply <layout>   Apply a saved layout
  tilewindows save <layout>    Save current windows to a named layout
  tilewindows get              Print current windows as JSON
  tilewindows list             List saved layouts
  tilewindows print <layout>   Show JSON for a saved layout
  tilewindows rm <layout>      Remove a saved layout
  tilewindows path             Show config file location
  tilewindows init             Create tilewindows.config.json in the current directory
  tilewindows completions      Print zsh completions script
  tilewindows help             Show this help message

Flags:
  --config=<path>   Use a specific config file
  --here            Force using CWD/tilewindows.config.json

Environment:
  TILEWINDOWS_CONFIG   Path to config file (overrides auto-detection)
  XDG_CONFIG_HOME      XDG base directory (used in fallback chain)

Config resolution (highest → lowest):
  --config flag → $TILEWINDOWS_CONFIG → --here → CWD (if exists)
  → script-relative (if exists) → XDG → ~/Library/Application Support → ~/.config
`);
}

// ─── CLI entry point ─────────────────────────────────────────────────

const COMMANDS = new Set(["init", "apply", "get", "save", "list", "rm", "print", "path", "completions", "help"]);
const [, , rawCmd, rawArg] = process.argv;

const command = COMMANDS.has(rawCmd) ? rawCmd : rawCmd === undefined ? "help" : "apply";
const arg = command === "apply" && rawCmd !== "apply" ? rawCmd : rawArg;

(async () => {
  try {
    switch (command) {
      case "apply":
        await cmdApply(arg || "home");
        break;
      case "save":
        await cmdSave(rawArg);
        break;
      case "get":
        await cmdGet();
        break;
      case "list":
        cmdList();
        break;
      case "rm":
        cmdRm(rawArg);
        break;
      case "print":
        cmdPrint(rawArg);
        break;
      case "init":
        cmdInit();
        break;
      case "completions":
        cmdCompletions();
        break;
      case "path":
        cmdPath();
        break;
      case "help":
        cmdHelp();
        break;
    }
  } catch (e) {
    console.error(e?.message || e);
    process.exitCode = 1;
  }
})();
