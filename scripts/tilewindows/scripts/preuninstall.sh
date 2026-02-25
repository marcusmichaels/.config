#!/bin/sh
# preuninstall — remove tilewindows zsh completions from ~/.zshrc

ZSHRC="$HOME/.zshrc"

if [ ! -f "$ZSHRC" ]; then
  exit 0
fi

# Remove the comment line and the eval line
if grep -qF 'tilewindows completions' "$ZSHRC" 2>/dev/null; then
  sed -i '' '/# tilewindows tab completions/d' "$ZSHRC"
  sed -i '' '/eval "\$(tilewindows completions)"/d' "$ZSHRC"
  echo "tilewindows: removed completions from $ZSHRC"
fi
