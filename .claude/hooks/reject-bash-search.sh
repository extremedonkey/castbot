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

# Escape hatch: if you need grep/cat/find/head/tail for something the
# dedicated tools genuinely can't do, use node -e instead:
#   node -e "require('fs').readFileSync('file','utf8')"  instead of cat
#   node -e "console.log(require('child_process').execSync('grep ...'))"  for complex pipelines

case "$FIRST_CMD" in
  grep|rg)
    echo "Use the Grep tool instead of bash $FIRST_CMD — it's built-in and optimized. No Grep tool in this session (check ToolSearch)? Approved fallbacks: 'git grep' or the node -e escape hatch above — say which one you're using and why." >&2
    exit 2
    ;;
  find)
    echo "Use the Glob tool instead of bash find — it's built-in pattern matching. No Glob tool in this session? Approved fallback: 'git ls-files | ...' for tracked files." >&2
    exit 2
    ;;
  cat|head)
    echo "Use the Read tool instead of bash $FIRST_CMD — it's built-in file reading. (Read exists in every session — there is no fallback case for this one.)" >&2
    exit 2
    ;;
  tail)
    # Allow tail -f (live streaming), block tail for file reading
    if echo "$COMMAND" | grep -qE 'tail\s+-f'; then
      exit 0
    fi
    echo "Use the Read tool instead of bash tail — it's built-in file reading." >&2
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
