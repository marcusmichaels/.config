# llama.cpp coding server — backs Zed's "Local Coder" provider.
# See ~/.config/zed/settings.json → language_models.openai_compatible.
# Independent of Luna (~/Sites/localluna); it just shares the models dir.

LLM_CODER_PORT=1337
LLM_CODER_MODEL="$HOME/.luna/models/Huihui-Qwen3.5-9B-Claude-4.6-Opus-abliterated.i1-Q4_K_M.gguf"
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
