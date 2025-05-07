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

// Layouts to be manually set
const layouts = {
  home: [
    { app: 'ghostty', x: -1080, y: -262, width: 1079, height: 708 },
    { app: 'Terminal', x: 1621, y: 160, width: 1080, height: 1018 },
    { app: 'Arc', x: 1438, y: 25, width: 2002, height: 1415 },
    { app: 'thunderbird', x: -1080, y: 1437, width: 1080, height: 836 },
    { app: 'Slack', x: -1080, y: 447, width: 1080, height: 989 },
    { app: 'zed', x: 0, y: 25, width: 1437, height: 1415 }
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
const layoutName = process.argv[2] || 'home'; // Default to 'home' if no argument is passed
arrangeWindows(layoutName);
