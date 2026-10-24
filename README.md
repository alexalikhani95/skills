# Skills

My skills for Claude Code and Codex. This repo is the one real copy; both tools read from it.

## How it works

**Claude** reads skills from `~/.claude/skills`, and this repo lives there, so it needs nothing extra.

**Codex** reads skills from `~/.codex/skills`. Instead of copying skills there, each one is a shortcut (symlink) pointing back into this repo, so an edit here shows up in Codex straight away.

`sync.sh` keeps it all up to date. It:

1. pulls the latest changes from GitHub,
2. adds a Codex shortcut for any new skill,
3. removes shortcuts for skills that were deleted.

It runs automatically at the start of every Claude and Codex session (a `SessionStart` hook in `~/.claude/settings.json` and `~/.codex/hooks.json`). To run it by hand:

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

And the same for Codex, in `~/.codex/hooks.json` under `hooks.SessionStart`:

```json
{ "type": "command", "command": "sh ~/.claude/skills/sync.sh >/dev/null 2>&1 || true", "timeout": 30 }
```

`develop` also needs two plugins, installed in both tools:

```sh
# Claude (inside a session)
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
/plugin marketplace add TechGardenCode/naive-user
/plugin install naive-user@naive-user

# Codex
codex plugin marketplace add DietrichGebert/ponytail && codex plugin add ponytail@ponytail
codex plugin marketplace add TechGardenCode/naive-user && codex plugin add naive-user@naive-user
```

naive-user drives a real browser. Claude's plugin brings the browser tool with it; Codex needs it added to `~/.codex/config.toml`:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

## Skills

| Skill | What it does | Source |
|-------|--------------|--------|
| `comments` | Adds short, simple comments to new code in the current changes. | Mine |
| `commit-message` | Suggests a short, plain-English commit message for staged changes. | Mine |
| `simplify` | Rewrites the last reply in shorter, simpler language. | Mine |
| `recap` | Tells you where you left off in a project after time away, from git, PRs, tickets and your last sessions. Read-only. | Mine |
| `develop` | Runs one change from idea to merged PR using the skills below, stopping for you at the spec, the tickets and the merge. | Mine |
| `graph` | Runs the second half of `develop` (build, self-check, PR, reviews) as a program, with a fresh AI per step. Use after `develop`'s tickets are approved. | Mine |
| `grill-with-docs` | Questions you hard on a plan, writing down decisions and terms as it goes. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `grill-me` | Questions you hard on a plan, without writing any docs. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `grilling` | The shared questioning step the two grill skills use. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `to-spec` | Turns the conversation into a written plan on the issue tracker. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `to-tickets` | Splits a plan into tickets, each saying which tickets it waits on. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `implement` | Builds one ticket, or small work straight from the conversation. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `implement-spec` | Builds all the tickets in one run, using parallel agents. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `tdd` | Builds features or fixes bugs test-first, one small step at a time. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `diagnosing-bugs` | Tracks down hard bugs and slowdowns by first getting a command that reliably shows the bug. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `code-review` | Reviews changes against the repo's standards and the original plan. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `retro` | Looks back on a session and suggests changes to prevent repeat mistakes. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `wayfinder` | Plans work too big for one session as a map of decisions on the issue tracker. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `handoff` | Squashes the conversation into a note another agent can pick up. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `improve-codebase-architecture` | Scans the code for structure improvements and shows them as an HTML report. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `domain-modeling` | Pins down the words a project uses and records big decisions. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `teach` | Teaches you a new skill or concept inside the current project. | [Matt Pocock](https://github.com/mattpocock/skills) |
| `setup-matt-pocock-skills` | One-time setup of a repo (issue tracker, labels, docs) for the skills above. | [Matt Pocock](https://github.com/mattpocock/skills) |

Matt's usual order: `grill-with-docs` → `to-spec` → `to-tickets` → `implement` (or `implement-spec`) → `retro`. For small work, skip straight to `implement`. `develop` runs this order for you.

## `develop`

Runs one change from idea to merged PR. It's built on Matt's skills and works the same in Claude and Codex.

**Start it:** `/develop <what to build>` in Claude, `$develop <what to build>` in Codex. To pick up later: `/develop --resume <feature>`.

**What happens:**

1. Sets up a fresh worktree and picks a lane: **fast** (copies an existing pattern) or **full**. Tiny fixes don't need `develop` at all.
2. Talks the idea through (`grill-with-docs`) and writes the spec (`to-spec`). A fresh subagent checks it. **Stop 1: you approve the spec.**
3. Splits it into tickets (`to-tickets`), checked the same way. **Stop 2: you approve the tickets.** Then you start a new session and paste the resume command it gives you.
4. Builds each ticket with its own subagent (`implement`, tests first only where agreed). Risky tickets get an extra reviewer.
5. Self-check: build, lint and tests, `ponytail-review`, docs updated, reusable patterns noted, Playwright tests if the project has Playwright.
6. Opens the PR and runs up to 2 rounds of `code-review`, Playwright and naive-user, fixing what they find.
7. **Stop 3: you choose** merge, keep the PR open, keep working, or throw it away.
8. Cleans up and sends one summary, with a cost line in the PR.

The fast lane has a single stop before coding, plus the merge stop.

**Rules:** starting `develop` counts as permission to commit and push on its own feature branch. It never touches `main` without stop 3.

**Models:** Claude uses Sonnet for routine work and Opus for hard work, never Fable. Codex uses GPT-6.1-Sol (medium effort, or high for hard work), never Astra.

**Needs:** a project built from [agentic-template](https://github.com/alexalikhani95/agentic-template) (`AGENTS.md` commands, `tickets/`, worktree rules in `docs/agents/workflow.md`), plus the plugins above. Projects with a UI also want a `running-the-app` skill so naive-user can start the app.

## `graph`

`develop` as it is: an AI reads the steps and walks them itself, and after the tickets you switch sessions by hand. `graph` puts steps 4–8 in a program instead. The program walks the steps and starts a fresh AI for each one (`claude -p` or `codex exec`, in each tool's safety mode), so steps can't be skipped and nothing fills up. The rules for each step stay in `develop`.

**Use it** after `develop`'s stop 2, instead of `/develop --resume`:

1. `/graph <feature>` (Codex: `$graph`) writes `tickets/<feature>/state.json` from the approved tickets.
2. In a terminal: `node ~/.claude/skills/graph/graph.mjs <feature>`. It builds each ticket, self-checks, opens the PR and runs up to 2 review rounds, printing a line per step. You get a Mac notification when the PR is ready or a step fails.
3. Then `node ~/.claude/skills/graph/graph.mjs <feature> merge` (or `keep`, `iterate`, `discard`). For `iterate`, `/graph <feature> iterate` adds the new tickets first.

A failed step is retried once on the stronger model, then it stops. Running it again carries on where it left off. `--tool claude|codex` switches tool. Tests: `node --test ~/.claude/skills/graph/graph.test.mjs`.
