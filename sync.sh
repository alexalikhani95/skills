#!/bin/sh
# Pull the latest skills from GitHub and link each one into Codex's skills folder.
# Claude reads this folder directly, so it needs no links.
repo="$(cd "$(dirname "$0")" && pwd)"
codex="$HOME/.codex/skills"

git -C "$repo" pull --ff-only -q

mkdir -p "$codex"
for dir in "$repo"/*/; do
  dir="${dir%/}"
  [ -L "$dir" ] && continue           # skip links to skills that live elsewhere
  [ -f "$dir/SKILL.md" ] || continue  # skip folders that aren't skills
  target="$codex/$(basename "$dir")"
  [ -L "$target" ] || rm -rf "$target"  # replace an old copy with a link
  ln -sfn "$dir" "$target"
done

# Remove links to skills that were deleted from the repo.
for link in "$codex"/*; do
  [ -L "$link" ] && [ ! -e "$link" ] || continue
  case "$(readlink "$link")" in "$repo"/*) rm "$link" ;; esac
done
