# Turn on in-built zsh autocomplete
autoload -Uz compinit && compinit

# Open Ffern PR from current branch
# https://github.com/<origin>/pull/new/<branch-name>

function dpr() {
  local git_remote_path=$(git remote get-url origin | sed 's|.*:||;s|\.git.*||' | head -n 1)
  local git_branch_name=$(git rev-parse --abbrev-ref HEAD)
  local git_pr_url="https://github.com/$git_remote_path/pull/new/$git_branch_name"

  echo "Opening: $git_pr_url"

  # Open PR url in browser
  open "$git_pr_url"
}

alias nodecontainer="docker run --rm -it --network none --cap-drop ALL -p 3000:3000 -v "$(pwd)":/app -w /app node:22 /bin/bash"

# Using `npm link` instead of this
# alias tilewindows="~/.config/scripts/tilewindows/tilewindows.js"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

export PATH="/Applications/CMake.app/Contents/bin":"$PATH"
alias prunebranches="git branch | grep -vE '^\*|main|master' | xargs git branch -D"

optimisejpg() {
  local quality=65  # default quality

  # Check if the first argument is a number (override quality)
  if [[ "$1" =~ ^[0-9]+$ ]]; then
    quality="$1"
    shift  # remove the quality argument from the list
  fi

  # Make sure at least one file is provided
  if [ $# -eq 0 ]; then
    echo "Usage: optimise [quality] file1 file2 ..."
    return 1
  fi

  for file in "$@"; do
    # Get filename without extension
    base="${file%.*}"
    # Save optimised image as base-optimised.jpg
    sips -s format jpeg -s formatOptions "$quality" "$file" --out "${base}-optimised.jpg"
    echo "Optimised ($quality): $file -> ${base}-optimised.jpg"
  done
}
