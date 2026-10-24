---
name: commit-message
description: Analyze the staged files and suggest a short, plain-English commit message. Use when the user asks for a commit message, or wants help describing staged changes.
disable-model-invocation: true
---

# Commit Message

Look at what's staged and suggest a commit message for it. Then ask before committing — don't run `git commit` until the user confirms.

## Process

1. Run `git diff --staged` to see what's actually staged. Run `git status` too, so untracked-but-not-staged files don't get mistaken for part of the change.
2. If nothing is staged, say so and stop — don't write a message for unstaged changes or guess at intent.
3. Run `git log --oneline -10` to see the repo's existing message style (length, prefix conventions like `fix:`/`feat:`, tense). Match it if there's a clear pattern; otherwise default to the rules below.
4. Read the diff to understand *why* the change was made, not just what lines moved. Look at surrounding code if the diff alone doesn't make the reason obvious.
5. Suggest one commit message. Offer a second alternative only if the change genuinely reads two different ways.

## Message rules

- One line, under ~70 characters. No body paragraph unless the change is large enough that a one-liner would hide something important — and even then, keep it to one short follow-up sentence.
- Plain English. No jargon, no internal abbreviations, nothing that needs domain context to parse. Someone outside the project should understand what happened.
- Jargon includes process and methodology words, not just technical ones: "domain glossary", "ADR", "ubiquitous language", "spec", "scaffold", "tracer bullet", "bounded context". Say what the thing *is* in everyday words instead — "list of the words the app uses", "notes on why we chose the tech", "outline of the first version". Before presenting, check each word: would someone who has never seen this repo know what it means? If not, swap it.
- Lead with what changed in plain terms; only add why if it's not obvious from the what.
- Use plain verbs (add, fix, remove, rename, move) instead of vague ones (update, improve, enhance, handle).
- Don't describe the diff mechanically ("changed 3 files", "modified function"). Describe the actual change in the code's behavior or purpose.
- Don't invent a reason the diff doesn't support — if the "why" isn't visible in the change, leave it out rather than guessing.

## Done

1. Present the suggested message in a code block so it's easy to copy.
2. Ask: "Would you like me to run this commit?"
3. If the user replies with anything affirmative (y, yes, do it, sure, etc.), stage nothing extra — the files are already staged — and run `git commit -m "<message>"` with that exact message. Then show the result of `git status` so the user can confirm it landed.
4. If the user declines or doesn't confirm, don't commit. Leave the staged files as they are.
