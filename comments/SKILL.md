---
name: comments
description: Review the current file changes and add short, simple comments to new code. Use when the user asks to comment a diff/PR, or wants new code explained for a beginner.
disable-model-invocation: true
---

# Comments

Add comments to newly written code so a brand new developer — someone who just started coding — can follow what's happening.

## Process

1. Figure out the scope:
   - **File(s) named in the invocation** (e.g. `/comments path/to/file.py`) — review those files in full, top to bottom. They may be fully committed with no pending changes, so don't rely on `git diff` for these; just read the file.
   - **No file named** — fall back to the diff: `git diff` (unstaged), `git diff --staged` (staged), or `git diff <base>...HEAD` (a branch/PR). Only touch added/changed lines in this mode — never add comments to untouched existing code.
2. Go through the target file(s). In diff mode, only consider added/changed lines. In named-file mode, consider every line in the file.
3. For each function, block, or non-obvious line that lacks a useful comment, add a short comment directly above (or beside, for one-liners) explaining what it does.
4. Write the comment, then edit the file to insert it.

## Comment rules

- One short sentence per comment. No multi-line comment blocks, no docstring essays.
- Plain English only. No jargon, no abbreviations, no framework-insider terms. If a technical word is unavoidable (e.g. "loop", "array"), use the simplest version of it.
- Explain the **what and why**, not how the language syntax works. ("Skip rows with no email" not "Use `.filter()` to filter the array.")
- Skip comments on lines that are already self-explanatory from naming (e.g. `const userCount = users.length` needs nothing).
- Don't comment every single line — comment at the level a new developer would actually need: new functions, conditionals with non-obvious intent, loops, regexes, tricky math, error handling.
- For lists of declarations (model/struct/dataclass fields, type/interface properties, function params, enum members, config keys, etc.), don't put one comment above every single one. Add one comment for the whole block explaining what it's for, then comment only the individual entries whose name/type doesn't already explain themselves (an odd default, a non-obvious constraint, a business rule). Trust good naming to speak for itself.
- Match the file's existing comment style (`//`, `#`, `/* */`, etc.) and indentation.
- Never remove or rewrite existing comments unless they're flat wrong about the new code.

## Done

After editing, briefly tell the user which files got comments and roughly how many were added. Don't re-explain the code in the chat — the comments are the explanation.
