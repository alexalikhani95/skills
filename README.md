# Skills

My skills for Claude Code and Codex. This repo is the one real copy; both tools read from it.

## How it works

**Claude** reads skills from `~/.claude/skills`, and this repo lives there, so it needs nothing extra.

**Codex** reads skills from `~/.codex/skills`. Instead of copying skills there, each one is a shortcut (symlink) pointing back into this repo, so an edit here shows up in Codex straight away.

`sync.sh` keeps it all up to date. It:

1. pulls the latest changes from GitHub,
2. adds a Codex shortcut for any new skill,
3. removes shortcuts for skills that were deleted.

It runs automatically at the start of every Claude session (a `SessionStart` hook in `~/.claude/settings.json`). To run it by hand:

```sh
sh ~/.claude/skills/sync.sh
```

If you have uncommitted changes that clash with GitHub, the pull is skipped so nothing gets overwritten. Commit and push your changes, and the next run catches up.

## Setting up a new machine

```sh
git clone https://github.com/alexalikhani95/skills.git ~/.claude/skills
sh ~/.claude/skills/sync.sh
```

Then add the hook to `~/.claude/settings.json` under `hooks.SessionStart`:

```json
{ "type": "command", "command": "sh ~/.claude/skills/sync.sh >/dev/null 2>&1 || true", "timeout": 30, "async": true }
```

## Skills

| Skill | What it does | Source |
|-------|--------------|--------|
| `comments` | Adds short, simple comments to new code in the current changes. | Mine |
| `commit-message` | Suggests a short, plain-English commit message for staged changes. | Mine |
| `simplify` | Rewrites the last reply in shorter, simpler language. | Mine |
| `grill-with-docs` | Questions you hard on a plan, writing down decisions and terms as it goes. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `grill-me` | Questions you hard on a plan, without writing any docs. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `grilling` | The shared questioning step the two grill skills use. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `to-spec` | Turns the conversation into a written plan on the issue tracker. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `to-tickets` | Splits a plan into tickets, each saying which tickets it waits on. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `implement` | Builds one ticket, or small work straight from the conversation. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `implement-spec` | Builds all the tickets in one run, using parallel agents. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `tdd` | Builds features or fixes bugs test-first, one small step at a time. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `code-review` | Reviews changes against the repo's standards and the original plan. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `retro` | Looks back on a session and suggests changes to prevent repeat mistakes. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `wayfinder` | Plans work too big for one session as a map of decisions on the issue tracker. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `handoff` | Squashes the conversation into a note another agent can pick up. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `improve-codebase-architecture` | Scans the code for structure improvements and shows them as an HTML report. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `domain-modeling` | Pins down the words a project uses and records big decisions. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `teach` | Teaches you a new skill or concept inside the current project. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `setup-matt-pocock-skills` | One-time setup of a repo (issue tracker, labels, docs) for the skills above. | [Matt Pocock](https://github.com/mattpocock/skills) |

Matt's usual order: `grill-with-docs` → `to-spec` → `to-tickets` → `implement` (or `implement-spec`) → `retro`. For small work, skip straight to `implement`.
