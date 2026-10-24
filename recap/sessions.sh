#!/bin/sh
# Print the end of the last two Claude or Codex sessions run in this repo or its worktrees.
# Usage: sessions.sh [repo-root]   (defaults to the current git repo)
root="${1:-$(git rev-parse --show-toplevel)}"
root="${root%%/.worktrees/*}"   # a worktree counts as its repo
keep=2      # sessions to show
msgs=30     # messages from the end of each

# Claude names a session folder after its path, with every non-alphanumeric turned into "-".
claude_prefix=$(printf '%s' "$root" | sed 's/[^A-Za-z0-9]/-/g')

{
  for dir in "$HOME/.claude/projects/$claude_prefix" "$HOME/.claude/projects/$claude_prefix"--worktrees-*; do
    [ -d "$dir" ] && find "$dir" -maxdepth 1 -name '*.jsonl' -mmin +2 | sed 's/^/claude /'
  done
  # Codex keeps sessions by date; the first line records the folder it ran in.
  find "$HOME/.codex/sessions" -name '*.jsonl' -mtime -90 -mmin +2 2>/dev/null | while read -r f; do
    head -n 1 "$f" | jq -e --arg r "$root" '.payload.cwd | startswith($r)' >/dev/null 2>&1 && echo "codex $f"
  done
} | while read -r tool f; do
  echo "$(stat -f %m "$f") $tool $f"   # ponytail: macOS stat; use stat -c %Y on Linux
done | sort -rn | head -n "$keep" | while read -r _ tool f; do
  echo "=== $tool · last active $(date -r "$f" '+%a %d %b %H:%M') · $f"
  if [ "$tool" = claude ]; then
    jq -r 'select((.type == "user" or .type == "assistant") and .isSidechain != true)
      | .type as $who | .message.content
      | (if type == "string" then . else map(select(.type == "text") | .text) | join("\n") end)
      | select(length > 0 and (startswith("<") | not))
      | "\($who): \(.[0:400])"' "$f"
  else
    jq -r 'select(.type == "response_item" and .payload.type == "message"
        and (.payload.role == "user" or .payload.role == "assistant"))
      | .payload.role as $who | .payload.content | map(.text // "") | join("\n")
      | select(length > 0 and (startswith("<") or startswith("# AGENTS.md") | not))
      | "\($who): \(.[0:400])"' "$f"
  fi 2>/dev/null | tail -n "$msgs"
  echo
done
