#!/bin/sh
# postinstall — add tilewindows zsh completions to ~/.zshrc (idempotent)

ZSHRC="$HOME/.zshrc"
LINE='eval "$(tilewindows completions)"'

# Only target zsh on macOS; skip silently elsewhere
if [ "$(uname)" != "Darwin" ]; then
  exit 0
fi

# Create ~/.zshrc if it doesn't exist
if [ ! -f "$ZSHRC" ]; then
  touch "$ZSHRC"
fi

# Append only if the line isn't already present
if ! grep -qF "$LINE" "$ZSHRC" 2>/dev/null; then
  printf '\n# tilewindows tab completions\n%s\n' "$LINE" >> "$ZSHRC"
  echo "tilewindows: added completions to $ZSHRC (restart your shell or run: source $ZSHRC)"
else
  echo "tilewindows: completions already in $ZSHRC"
fi
