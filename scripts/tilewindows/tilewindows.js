#!/usr/bin/env node

/**
 * tilewindows — arrange/save macOS window layouts via AppleScript
 * No deps. Stores layouts at ~/.config/tilewindows/tilewindows.config.json
 */

import { exec } from "child_process";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const PROJECT_FILE = path.join(process.cwd(), "tilewindows.config.json");
const FORCE_HERE = process.argv.includes("--here");

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_FILE);

// Prefer explicit → coupled → XDG → mac → ~/.config
const COUPLED_CONFIG = path.join(SCRIPT_DIR, ".", "tilewindows.config.json");
const LEGACY_DOT = path.join(os.homedir(), ".config", "tilewindows.config.json");


function getConfigPath() {
  // 1) CLI flag
  const flag = process.argv.find(a => a.startsWith("--config="));
  if (flag) return flag.split("=")[1];

  // 2) Env var
  if (process.env.TILEWINDOWS_CONFIG) return process.env.TILEWINDOWS_CONFIG;

  // 3) Project file (forced via --here)
  if (FORCE_HERE) return PROJECT_FILE;

  // 4) Auto-project (if file exists in CWD)
  try {
    if (fs.existsSync(PROJECT_FILE)) return PROJECT_FILE;
  } catch {}

  // 5) Script-relative (coupled)
  if (COUPLED_CONFIG) return COUPLED_CONFIG;

  // 6) XDG
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "tilewindows.config.json");
  }

  // 7) macOS Application Support
  if (process.platform === "darwin")) {
    return path.join(os.homedir(), "Library", "Application Support", "tilewindows.config.json");
  }

  // 8) ~/.config fallback
  return LEGACY_DOT;
}


// Use the resolved path everywhere below
const CONFIG_FILE = getConfigPath();
const CONFIG_DIR = path.dirname(CONFIG_FILE);

function ensureConfig() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ layouts: {} }, null, 2));
  }
}

function loadConfig() {
  ensureConfig();
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const data = JSON.parse(raw || "{}");
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

// ---------- AppleScript helpers ----------
function escapeAS(str) {
  // escape double-quotes for AppleScript string literals
  return String(str).replace(/"/g, '\\"');
}

// targets: [{ index?, x, y, width, height }, ...]
async function applyWindowsForApp(app, targets, delaySeconds = 0.15) {
  if (!targets?.length) return;

  const assignments = targets.map((t, idx) => ({
    n: idx + 1,
    idx: Number.isInteger(t.index) ? t.index : null,
    x: t.x,
    y: t.y,
    w: t.width,
    h: t.height,
  }));

  const declRects = assignments.map((a) => `set rect_${a.n} to {${a.x}, ${a.y}, ${a.w}, ${a.h}}`).join("\n");

  const assignBlocks = assignments
    .map((a) => {
      const idxMatchLine = a.idx ? `set match_idx to (i is ${a.idx})` : `set match_idx to false`;
      return `
      -- Assignment ${a.n}
      set assigned_${a.n} to false

      -- Primary pass: match by index (if provided), each window used at most once
      repeat with i from 1 to count of wins
        if (item i of used_flags) is false then
          set win to item i of wins

          -- filter: only standard windows (avoids sheets/panels)
          set is_standard to true
          try
            set subroleStr to value of attribute "AXSubrole" of win
            if subroleStr is not "AXStandardWindow" then set is_standard to false
          end try

          if is_standard then
            ${idxMatchLine}
            if match_idx then
              -- unminimize if needed
              try
                set value of attribute "AXMinimized" of win to false
              end try
              set item i of used_flags to true
              set position of win to {item 1 of rect_${a.n}, item 2 of rect_${a.n}}
              set size of win to {item 3 of rect_${a.n}, item 4 of rect_${a.n}}
              set assigned_${a.n} to true
              exit repeat
            end if
          end if
        end if
      end repeat

      -- Fallback: first unused standard window
      if assigned_${a.n} is false then
        repeat with i from 1 to count of wins
          if (item i of used_flags) is false then
            set win to item i of wins
            set is_standard to true
            try
              set subroleStr to value of attribute "AXSubrole" of win
              if subroleStr is not "AXStandardWindow" then set is_standard to false
            end try

            if is_standard then
              try
                set value of attribute "AXMinimized" of win to false
              end try
              set item i of used_flags to true
              set position of win to {item 1 of rect_${a.n}, item 2 of rect_${a.n}}
              set size of win to {item 3 of rect_${a.n}, item 4 of rect_${a.n}}
              exit repeat
            end if
          end if
        end repeat
      end if
    `;
    })
    .join("\n");

  const s = `
    tell application "${escapeAS(app)}" to activate
    delay ${Number(delaySeconds).toFixed(2)}
    tell application "System Events"
      try
        tell process "${escapeAS(app)}"
          set wins to every window
          if (count of wins) is 0 then return

          -- one boolean per window to avoid reusing
          set used_flags to {}
          repeat with i from 1 to count of wins
            set end of used_flags to false
          end repeat

${declRects}

${assignBlocks}

        end tell
      end try
    end tell
  `;

  try {
    await runOSA(s);
    console.log(`✓ Applied ${targets.length} rect(s) to ${app}`);
  } catch (e) {
    console.error(`✗ ${app}: ${e.message}`);
  }
}

async function runOSA(script) {
  return new Promise((resolve, reject) => {
    // Use double quotes inside AS, single quotes around -e payload
    exec(`osascript -e '${script}'`, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.trim() || String(err)));
      if (stderr && stderr.trim()) return reject(new Error(stderr.trim()));
      resolve((stdout || "").trim());
    });
  });
}

async function setWindowPosition(app, x, y, width, height, delaySeconds = 0.2) {
  const s = `
    tell application "${escapeAS(app)}"
      activate
    end tell
    delay ${Number(delaySeconds).toFixed(2)}
    tell application "System Events"
      try
        tell process "${escapeAS(app)}"
          set win to front window
          set position of win to {${x}, ${y}}
          set size of win to {${width}, ${height}}
        end tell
      end try
    end tell
  `;
  try {
    await runOSA(s);
    console.log(`✓ ${app} → (${x},${y}) ${width}x${height}`);
  } catch (e) {
    console.error(`✗ ${app}: ${e.message}`);
  }
}

// async function getAllWindows() {
//   const s = `
//     tell application "System Events"
//       set windowInfo to ""
//       set appProcesses to (every process whose background only is false)
//       repeat with appProc in appProcesses
//         set appName to name of appProc
//         try
//           repeat with win in (every window of appProc)
//             set winPos to position of win
//             set winSize to size of win
//             set xPos to item 1 of winPos
//             set yPos to item 2 of winPos
//             set w to item 1 of winSize
//             set h to item 2 of winSize
//             set windowInfo to windowInfo & "{\\"app\\":\\"" & appName & "\\",\\"x\\":" & xPos & ",\\"y\\":" & yPos & ",\\"width\\":" & w & ",\\"height\\":" & h & "},"
//           end repeat
//         end try
//       end repeat
//     end tell
//     if windowInfo ends with "," then set windowInfo to text 1 thru -2 of windowInfo
//     return "[" & windowInfo & "]"
//   `;
//   const raw = await runOSA(s);
//   try {
//     return JSON.parse(raw || "[]");
//   } catch {
//     // fallback: try to repair minimal issues
//     return [];
//   }
// }

async function getAllWindows() {
  const s = `
    tell application "System Events"
      set windowInfo to ""
      set appProcesses to (every process whose background only is false)
      repeat with appProc in appProcesses
        set appName to name of appProc
        try
          set wCount to count of windows of appProc
          repeat with i from 1 to wCount
            set win to window i of appProc
            try
              set winPos to position of win
              set winSize to size of win
              set xPos to item 1 of winPos
              set yPos to item 2 of winPos
              set w to item 1 of winSize
              set h to item 2 of winSize
              set windowInfo to windowInfo & "{\\"app\\":\\"" & appName & "\\",\\"index\\":" & i & ",\\"x\\":" & xPos & ",\\"y\\":" & yPos & ",\\"width\\":" & w & ",\\"height\\":" & h & "},"
            end try
          end repeat
        end try
      end repeat
    end tell
    if windowInfo ends with "," then set windowInfo to text 1 thru -2 of windowInfo
    return "[" & windowInfo & "]"
  `;
  const raw = await runOSA(s);
  try {
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

// ---------- Actions ----------
// async function applyLayout(name) {
//   const cfg = loadConfig();
//   const layout = cfg.layouts?.[name];
//   if (!layout || !Array.isArray(layout) || layout.length === 0) {
//     console.error(`No layout found: ${name}`);
//     process.exitCode = 1;
//     return;
//   }
//   console.log(`Arranging windows for "${name}"…`);
//   for (const item of layout) {
//     const { app, x, y, width, height } = item;
//     if (!app) continue;
//     await setWindowPosition(app, x, y, width, height, 0.2);
//   }
//   console.log(`Done.`);
// }

async function applyLayout(name) {
  const cfg = loadConfig();
  const layout = cfg.layouts?.[name];
  if (!layout?.length) {
    console.error(`No layout found: ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Arranging windows for "${name}"…`);

  // Group targets by app
  const byApp = new Map();
  for (const item of layout) {
    if (!item?.app) continue;
    if (!byApp.has(item.app)) byApp.set(item.app, []);
    byApp.get(item.app).push(item);
  }

  // For stable behavior, keep the saved order
  for (const [app, targets] of byApp.entries()) {
    await applyWindowsForApp(app, targets, 0.15);
  }

  console.log(`Done.`);
}

function cmdInit() {
  const target = PROJECT_FILE; // always in CWD
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, JSON.stringify({ layouts: {} }, null, 2) + "\n");
    console.log(`Created ${target}`);
  } else {
    console.log(`Already exists: ${target}`);
  }
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
  console.log(`Saved ${windows.length} windows to layout "${name}".`);
}

function cmdList() {
  const cfg = loadConfig();
  const names = Object.keys(cfg.layouts || {});
  if (names.length === 0) {
    console.log("(no layouts saved yet)");
  } else {
    for (const n of names) console.log(n);
  }
}

function cmdRm(name) {
  const cfg = loadConfig();
  if (!cfg.layouts?.[name]) {
    console.error(`No layout found: ${name}`);
    process.exitCode = 1;
    return;
  }
  delete cfg.layouts[name];
  saveConfig(cfg);
  console.log(`Removed layout "${name}".`);
}

function cmdPrint(name) {
  const cfg = loadConfig();
  const layout = cfg.layouts?.[name];
  if (!layout) {
    console.error(`No layout found: ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(layout, null, 2));
}

function cmdPath() {
  ensureConfig();
  console.log(CONFIG_FILE);
}

function cmdHelp() {
  console.log(`
Usage:
  tilewindows <layout>         Apply a layout (alias of "apply <layout>")
  tilewindows apply <layout>   Apply a saved layout
  tilewindows save <layout>    Save current windows to a named layout
  tilewindows get              Print current windows as JSON
  tilewindows list             List saved layouts
  tilewindows print <layout>   Show JSON for a saved layout
  tilewindows rm <layout>      Remove a saved layout
  tilewindows path             Show config file location
  tilewindows init             Create an empty .tilewindows.json in the current directory
  tilewindows help             Show this help message

Project configs:
  If tilewindows.config.json exists in the current directory, it's used automatically.
  Use --here to force using CWD/tilewindows.config.json (creating on first save).

Environment:
  TILEWINDOWS_CONFIG=/path/to/tilewindows.config.json   Use a specific config file
  XDG_CONFIG_HOME=~/.config                             Standard XDG base dir (if set)

Flags:
  --config=/path/to/tilewindows.config.json             Explicit config location
  --here                                                Use CWD/tilewindows.config.json

Config resolution (highest → lowest):
  --config → TILEWINDOWS_CONFIG → (--here or CWD/tilewindows.config.json if exists)
  → script-relative → $XDG_CONFIG_HOME → ~/Library/Application Support → ~/.config
`);
}


// ---------- CLI parsing ----------
const [, , cmdOrLayout, maybeArg] = process.argv;

// Back-compat: `tilewindows work` should apply layout "work"
const command = (() => {
  switch (cmdOrLayout) {
    case "init":
    case "apply":
    case "get":
    case "save":
    case "list":
    case "rm":
    case "print":
    case "path":
    case "help":
      return cmdOrLayout;
    case undefined:
      return "help";
    default:
      return "apply";
  }
})();

(async () => {
  try {
    switch (command) {
      case "init":
        cmdInit();
        break;
      case "apply": {
        const name = cmdOrLayout === "apply" ? maybeArg || "home" : cmdOrLayout || "home";
        await applyLayout(name);
        break;
      }
      case "get":
        await cmdGet();
        break;
      case "save":
        await cmdSave(maybeArg);
        break;
      case "list":
        cmdList();
        break;
      case "rm":
        cmdRm(maybeArg);
        break;
      case "print":
        cmdPrint(maybeArg);
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
