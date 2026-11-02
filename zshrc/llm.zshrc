# llama.cpp coding server — backs Zed's "Local Coder" provider.
# See ~/.config/zed/settings.json → language_models.openai_compatible.
# Independent of Luna (~/Sites/localluna); it just shares the models dir.

LLM_CODER_PORT=1337
# Shared with Luna today so nothing has to move. Point this somewhere else if
# you want the coder's models fully separate — code-llm-download writes here.
LLM_CODER_MODELS_DIR="$HOME/.luna/models"
LLM_CODER_MODEL="$LLM_CODER_MODELS_DIR/Huihui-Qwen3.5-9B-Claude-4.6-Opus-abliterated.i1-Q4_K_M.gguf"
LLM_CODER_LOG="$HOME/.luna/logs/coder.log"
LLM_CODER_PID="$HOME/.luna/coder.pid"

# Start the server in the background and wait until it answers /health.
# Flags worth remembering:
#   --parallel 1     one slot, so the cached prompt prefix is always reused.
#                    The default (auto) picks 4 and routes by LRU, which can
#                    re-prefill Zed's whole ~20k-token preamble every turn.
#   --cache-reuse    reuse partially-matching prefixes via KV shifting.
#   --jinja          use the model's own chat template — required for tool
#                    calls to format correctly.
#   -ctk/-ctv q8_0   quantised KV cache; q4_0 halves it again if memory is tight.
code-llm() {
  local model="${1:-$LLM_CODER_MODEL}"

  if [[ -f $LLM_CODER_PID ]] && kill -0 "$(<$LLM_CODER_PID)" 2>/dev/null; then
    echo "already running (PID $(<$LLM_CODER_PID)) — run code-llm-stop first"
    return 1
  fi

  if [[ ! -f $model ]]; then
    echo "model not found: $model"
    return 1
  fi

  mkdir -p "${LLM_CODER_LOG:h}"
  nohup llama-server -m "$model" \
    --port $LLM_CODER_PORT \
    -c 65536 \
    --jinja \
    -fa on \
    --parallel 1 \
    --cache-reuse 256 \
    -ctk q8_0 -ctv q8_0 \
    -cram 4096 \
    -ctxcp 8 \
    > "$LLM_CODER_LOG" 2>&1 &
  echo $! > "$LLM_CODER_PID"
  disown

  echo "starting ${model:t} (PID $(<$LLM_CODER_PID))"
  echo "  log: $LLM_CODER_LOG"

  local i
  for i in {1..180}; do
    if curl -sf "http://127.0.0.1:$LLM_CODER_PORT/health" >/dev/null 2>&1; then
      echo "  ready on http://127.0.0.1:$LLM_CODER_PORT"
      return 0
    fi
    sleep 1
  done
  echo "  still loading after 180s — check: code-llm-log"
}

code-llm-stop() {
  if [[ -f $LLM_CODER_PID ]] && kill -0 "$(<$LLM_CODER_PID)" 2>/dev/null; then
    kill "$(<$LLM_CODER_PID)" && echo "stopped (PID $(<$LLM_CODER_PID))"
  elif pkill -f "llama-server.*--port $LLM_CODER_PORT"; then
    echo "stopped (found by port $LLM_CODER_PORT)"
  else
    echo "not running"
  fi
  rm -f "$LLM_CODER_PID"
}

code-llm-log() { tail -f "$LLM_CODER_LOG" }

code-llm-status() {
  if [[ -f $LLM_CODER_PID ]] && kill -0 "$(<$LLM_CODER_PID)" 2>/dev/null; then
    echo "running (PID $(<$LLM_CODER_PID)) on port $LLM_CODER_PORT"
    ps -o rss= -p "$(<$LLM_CODER_PID)" | awk '{printf "  resident: %.1f GB\n", $1/1048576}'
  else
    echo "not running"
  fi
}

# Fetch a GGUF from Hugging Face into $LLM_CODER_MODELS_DIR.
#   code-llm-download <repo>              list the GGUFs in that repo
#   code-llm-download <repo> <file.gguf>  download it (resumable)
#
# Listing first is the point: most model repos publish a dozen-plus quants, and
# the plain <name> repo is usually safetensors — you want <name>-GGUF.
code-llm-download() {
  local repo="$1" file="$2"

  if [[ -z $repo ]]; then
    echo "usage: code-llm-download <hf-repo> [file.gguf]"
    echo "  e.g. code-llm-download unsloth/Qwen3.8-27B-GGUF"
    return 1
  fi

  local json
  if ! json=$(curl -fsSL "https://huggingface.co/api/models/$repo?blobs=true" 2>/dev/null); then
    echo "repo not found or not readable: $repo"
    return 1
  fi

  if [[ -z $file ]]; then
    print -r -- "$json" | python3 -c '
import json, sys
d = json.load(sys.stdin)
g = [(f["rfilename"], f.get("size") or 0)
     for f in d.get("siblings", []) if f["rfilename"].endswith(".gguf")]
if not g:
    print("  no GGUF files here — this is probably the full-precision repo.")
    print("  try the -GGUF variant of the same name.")
    sys.exit(1)
print("GGUFs available (smallest first):")
for n, s in sorted(g, key=lambda x: x[1]):
    print(f"  {s/2**30:6.1f} GB  {n}")
'
    local rc=$?
    [[ $rc -eq 0 ]] && echo "\nthen: code-llm-download $repo <file.gguf>"
    return $rc
  fi

  local want
  want=$(print -r -- "$json" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(next((f.get("size") or 0
            for f in d.get("siblings", []) if f["rfilename"] == sys.argv[1]), 0))
' "$file")

  if [[ -z $want || $want == 0 ]]; then
    echo "no such file in $repo: $file"
    echo "run without a filename to see what's there"
    return 1
  fi

  mkdir -p "$LLM_CODER_MODELS_DIR"
  local dest="$LLM_CODER_MODELS_DIR/${file:t}"

  if [[ -f $dest && $(stat -f '%z' "$dest") == $want ]]; then
    echo "already have it: $dest"
    return 0
  fi

  printf '→ %s / %s\n  %.1f GB → %s\n' "$repo" "$file" $((want/1073741824.0)) "$dest"
  if ! curl -fL -C - --progress-bar \
        "https://huggingface.co/$repo/resolve/main/$file" -o "$dest"; then
    echo "download failed — re-run to resume from where it stopped"
    return 1
  fi

  # A truncated GGUF fails at model load with an opaque tensor error rather
  # than anything that points at the download, so check the size here.
  local got=$(stat -f '%z' "$dest" 2>/dev/null)
  if [[ $got != $want ]]; then
    echo "size mismatch: got $got, expected $want — re-run to resume"
    return 1
  fi

  echo "✓ $dest"
  echo "  start it: code-llm $dest"
}
