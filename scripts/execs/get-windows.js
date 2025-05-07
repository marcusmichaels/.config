#!/usr/bin/env node

import { exec } from 'child_process';

// Helper function to execute AppleScript and return the result
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

// Function to get all window information
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
    let cleaned = rawResult.trim().replace(/,\s*$/, '');

    cleaned = `[${cleaned}]`;
    cleaned = cleaned.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');       // keys
    const result = JSON.parse(cleaned);
    console.log(result);

  } catch (err) {
    console.error("Error getting window information:", err);
  }
  }

  // Call the function to get all window information
  getAllWindows();
