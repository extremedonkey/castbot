#!/bin/bash
# PreToolUse hook: blocks bash grep/find/cat/etc and redirects to dedicated tools.
# Works for main session AND all subagents (Explore, Plan, etc).

INPUT=$(cat)

# Extract command from JSON without jq — match "command": "..." pattern
COMMAND=$(echo "$INPUT" | grep -oP '"command"\s*:\s*"\K[^"]+' | head -1)

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Extract the first word (the actual command before args)
FIRST_CMD=$(echo "$COMMAND" | sed 's/[|;&].*//' | awk '{print $1}')

case "$FIRST_CMD" in
  grep|rg)
    echo "Use the Grep tool instead of bash $FIRST_CMD — it's built-in and optimized." >&2
    exit 2
    ;;
  find)
    echo "Use the Glob tool instead of bash find — it's built-in pattern matching." >&2
    exit 2
    ;;
  cat|head|tail)
    echo "Use the Read tool instead of bash $FIRST_CMD — it's built-in file reading." >&2
    exit 2
    ;;
  echo)
    # Block echo > file patterns, allow echo for debugging
    if echo "$COMMAND" | grep -qE 'echo\s+.*>\s+'; then
      echo "Use the Write tool instead of echo redirection." >&2
      exit 2
    fi
    exit 0
    ;;
esac

exit 0
