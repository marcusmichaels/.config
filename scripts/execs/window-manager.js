#!/usr/bin/env node

import { exec } from 'child_process';

// Helper function to execute AppleScript
async function executeAppleScript(script) {
  return new Promise((resolve, reject) => {
    exec(`osascript -e '${script}'`, (err, stdout, stderr) => {
      if (err || stderr) {
        reject(`Error: ${stderr || err}`);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function setWindowPosition(app, position, width, height) {
  const script = `
    tell application "${app}"
      activate
      delay 0.5
    end tell

    tell application "System Events"
      tell process "${app}"
        if (count of windows) > 0 then
          set position of front window to {${position.x}, ${position.y}}
          set size of front window to {${width}, ${height}}
        end if
      end tell
    end tell
  `;

  try {
    await executeAppleScript(script);
    console.log(`Positioned ${app} to ${position.x}, ${position.y} with size ${width}x${height}`);
  } catch (err) {
    console.error(`Error setting window position for ${app}:`, err);
  }
}

// Layouts to be manually set
const layouts = {
  home: [
    { app: 'ghostty', x: -1080, y: -262, width: 1079, height: 708 },
    { app: 'Slack', x: -1080, y: 447, width: 1080, height: 989 },
    { app: 'Arc', x: 1439, y: 25, width: 2001, height: 1415 },
    { app: 'thunderbird', x: -1080, y: 1437, width: 1080, height: 836 },
    { app: 'zed', x: 1, y: 25, width: 1437, height: 1415 }
  ],
  work: [
    { app: 'Safari', position: { x: 0, y: 0 }, width: 1080, height: 360 },
    { app: 'Thunderbird', position: { x: 0, y: 360 }, width: 1080, height: 360 },
    { app: 'Terminal', position: { x: 0, y: 720 }, width: 1080, height: 360 },
    { app: 'Zed', position: { x: 1080, y: 0 }, width: 960, height: 1080 },
    { app: 'Arc', position: { x: 2040, y: 0 }, width: 960, height: 1080 }
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
  for (const { app, position, width, height } of layout) {
    await setWindowPosition(app, position, width, height);
  }

  console.log(`Finished arranging windows for the "${layoutName}" layout.`);
}

// Get the layout argument (home or work)
const layoutName = process.argv[2] || 'home'; // Default to 'home' if no argument is passed
arrangeWindows(layoutName);

