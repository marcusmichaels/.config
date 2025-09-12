#!/usr/bin/env node

import { exec } from "child_process";

// Helper function to execute AppleScript
async function executeAppleScript(script) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e '${script}'`, (err, stdout, stderr) => {
      if (err || stderr) {
        reject(`Error: ${stderr || err}`);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function setWindowPosition(app, x, y, width, height, delay = 0) {
  const script = `
    tell application "${app}"
      activate
    end tell

    delay "${delay}"

    tell application "System Events"
      try
        tell process "${app}"
          set win to front window

          -- Set position and size
          set position of win to {${x}, ${y}}
          set size of win to {${width}, ${height}}
        end tell
      end try
    end tell
  `;

  try {
    // Execute the script to set window position and handle minimized state
    await executeAppleScript(script);
    console.log(`Positioned ${app} to ${x}, ${y} with size ${width}x${height}`);
  } catch (err) {
    console.error(`Error setting window position for ${app}:`, err);
  }
}

async function getAllWindows() {
  const script = `
    tell application "System Events"
      set windowInfo to ""

      -- Get all processes that have windows open
      set appProcesses to (every process whose background only is false)

      -- Loop through each process
      repeat with appProc in appProcesses
          set appName to name of appProc

          try
              -- Loop through each window of the app
              repeat with win in (every window of appProc)
                  set winPos to position of win
                  set winSize to size of win

                  -- Extract the position and size
                  set xPos to item 1 of winPos
                  set yPos to item 2 of winPos
                  set width to item 1 of winSize
                  set height to item 2 of winSize

                  -- Add window info to the string
                  set windowInfo to windowInfo & "{\\"app\\":"  & "\\"" & appName & "\\", x:" & xPos & ", y:" & yPos & ", width:" & width & ", height:" & height & "},"
              end repeat
          end try
      end repeat
    end tell

    -- Return the window info as a string
    return windowInfo
  `;

  try {
    const rawResult = await executeAppleScript(script);
    // console.log(rawResult);
    let cleaned = rawResult.trim().replace(/,\s*$/, "");

    cleaned = `[${cleaned}]`;
    cleaned = cleaned.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":'); // keys
    const result = JSON.parse(cleaned);
    console.log(result);
  } catch (err) {
    console.error("Error getting window information:", err);
  }
}

// Layouts to be manually set
const layouts = {
  home: [
    { app: "ghostty", x: -1080, y: -262, width: 1079, height: 708 },
    { app: "Arc", x: 1438, y: 25, width: 2002, height: 1415 },
    { app: "thunderbird", x: -1080, y: 1437, width: 1080, height: 836 },
    { app: "Slack", x: -1080, y: 447, width: 1080, height: 989 },
    { app: "zed", x: 0, y: 25, width: 1437, height: 1415 },
  ],
  work: [
    { app: "ghostty", x: 4018, y: 836, width: 790, height: 1125 },
    { app: "Arc", x: 0, y: 25, width: 1674, height: 1667 },
    { app: "Slack", x: 3008, y: 836, width: 1009, height: 1125 },
    { app: "zed", x: 1675, y: 25, width: 1332, height: 1665 },
  ],
  "work-v": [
    { app: 'ghostty', x: -1693, y: 1311, width: 1692, height: 1421 },
    { app: 'Slack', x: 0, y: 1062, width: 1440, height: 897 },
    { app: 'zed', x: -1692, y: -251, width: 1691, height: 1561 },
    { app: 'Arc', x: 0, y: 25, width: 1440, height: 1036 },
    { app: 'Spotify', x: 1, y: 1960, width: 1440, height: 600 }
  ]
};

// Function to arrange windows based on a given layout
async function arrangeWindows(layoutName) {
  console.log(`Arranging windows for the "${layoutName}" layout...`);

  const layout = layouts[layoutName];

  if (!layout) {
    console.log(`No layout found for: ${layoutName}`);
    return;
  }

  // Loop through each window in the layout and set its position
  for (const { app, x, y, width, height } of layout) {
    await setWindowPosition(app, x, y, width, height, 0.5);
  }

  console.log(`Finished arranging windows for the "${layoutName}" layout.`);
}

// Get the layout argument (home or work)
const layoutName = process.argv[2] || "home"; // Default to 'home' if no argument is passed

if (process.argv[2] === "get") {
  getAllWindows();
} else {
  arrangeWindows(layoutName);
}
