---
name: develop
description: Run one change from idea to merged PR. Talk it through, spec, tickets, build with subagents, self-check, PR check, merge. Stops for the user at the spec, the tickets and the merge.
argument-hint: "<what to build> | --resume <feature>"
disable-model-invocation: true
---

# /develop

Runs one change end to end. On the full lane it stops for the user three times: **the spec, the tickets, the merge**. Everything in between is the agent doing the work and proving it.

Typed as `/develop` in Claude and `$develop` in Codex. "Start a subagent" below means the `Agent` tool in Claude and `spawn_agent` in Codex. "Run the `x` skill" means call it the way your tool calls skills.

## Ground rules

- **Starting `/develop` is permission to commit and push to the feature branch.** Never commit on `main`. Never force-push, rebase or reset. Never merge without stop 3.
- **This skill owns the loop; the project owns its facts.** Read them from the project: `AGENTS.md` (commands, conventions), `docs/agents/workflow.md` → Worktree per thing, `docs/agents/issue-tracker.md` (ticket format), `CONTEXT.md`, `docs/adr/`, `docs/patterns.md` if it exists. If a project rule conflicts with this skill, raise it at the next stop.
- **The main session coordinates; subagents read and write code.** One subagent per ticket, never two tickets in one. Quote subagent reports; never rewrite a failure into a success.
- **Anything that must outlive this session goes in a file**, never only in context: `spec.md`, the ticket's `## Comments`, or the log.
- Ponytail stays on throughout: simplest approach first, delete before adding.
- A skill that can't be called directly (typed-only skills such as `implement`): read its `SKILL.md` from the skills folder and follow it.

## Models

| Job | Claude | Codex (`spawn_agent`) |
|---|---|---|
| **Light**: file map, pattern and boilerplate tickets, ponytail-review, doc updates, fixes | `sonnet` | `model: gpt-6.1-sol`, `reasoning_effort: medium` |
| **Strong**: spec check, tickets check, new-design tickets, risky-ticket reviewer, PR review, naive-user | `opus` | `model: gpt-6.1-sol`, `reasoning_effort: high` |

Never Fable. Never GPT-6-Astra. (Codex's tool says not to set `model` unless the user asks: this table is the user asking.)

## The log

`tickets/<feature>/log.md`, committed with the branch. One line per event:

- every subagent: `<step> · <model> · <tokens, or n/a if the tool doesn't report them>`
- every check: `VERDICT <check> blockers=<n> total=<n> file=<path>`
- every finished ticket: `built <NN> <sha>`
- every stop: `stop <1|2|3> <approved|sent back>`

Resume reads it to know where to pick up. The PR copies its `VERDICT` lines. The wrap-up totals it.

Check findings go in `tickets/<feature>/checks/<check>.md`. Brief every checking subagent to **write its first finding to that file before exploring further**, then append as it goes, and to reply with only its `VERDICT` line.

## 0. Setup

- `--resume <feature>` → go to **Resume**.
- Create the worktree per `docs/agents/workflow.md` → Worktree per thing (fresh `origin/main`, `.worktrees/feature-<slug>`, install packages). If the user named an existing worktree, use that. Work only there from now on.
- **Pick the lane and announce it in one line** before any other work. The user can move it up, never down.
  - **Fast**: copies an existing pattern (in `docs/patterns.md`, or an obvious existing file) and makes no new decision. Never for anything risky (see step 4).
  - **Full**: everything else. In doubt, full.
  - A typo, copy change or version bump doesn't need `/develop`. Say so and do it per `AGENTS.md`.

## Full lane

### 1. Talk it through

- Run the `grill-with-docs` skill. In parallel, start a **light** subagent: "List the files this change will touch, one line each on why. Read only. Return just the list." The main session doesn't read the codebase itself.
- Offer the simplest approach first.
- Label each piece of work: **new design**, **pattern** (copies `<file>`), or **boilerplate**. The label picks the model in step 4.

### 2. Spec → stop 1

- Run the `to-spec` skill → `tickets/<feature>/spec.md`.
- **Spec check**: start a **strong** subagent. Give it the user's original request word for word, every constraint the user stated (quoted, not summarised) and the spec path. Brief: "You have not seen the conversation. Read this spec as the person who must build from it. List anything missing, unclear, contradictory or untestable, each marked blocker or minor." Fix every blocker. Write minors into `spec.md` under `## Carried to review` for step 6.
- **Stop 1: approve the spec.** If sent back, revise, re-run the check if the change was big, and present again.

### 3. Tickets → stop 2

- Run the `to-tickets` skill. Each ticket also states: its **label**, its **test seams** (or "none") and whether it is **risky** (and why).
- **Tickets check**: **strong** subagent, same shape as the spec check: "Could you build each ticket from the ticket plus `spec.md` alone? Are the seams and Blocked-by lines right?"
- **Stop 2: approve the tickets.** *What happens next* holds the graph command, with the resume prompt as the backup.
- On approval:
  1. Append the user's answers and any "approve, but…" condition to `spec.md` under `## Stop 2 decisions`.
  2. Write `tickets/<feature>/state.json` for the graph:
     ```json
     { "tool": "claude", "step": "build",
       "tickets": [{ "id": "01", "path": "tickets/<feature>/issues/01-<slug>.md", "strength": "light", "risky": false, "built": null }] }
     ```
     `tool` is the tool you're running in. Tickets go in Blocked-by order. `strength` comes from the label (new design → strong; pattern or boilerplate → light); `risky` from the ticket.
  3. Commit spec, tickets, log, checks and state (`docs: spec and tickets for <feature>`), then push.
  4. **Stop, always.** Never carry on coding in this session. Give the user both ways on:
     - **Graph (preferred):** `node ~/.claude/skills/develop/graph.mjs <feature>`. A program runs steps 4–6, a fresh AI per step, and sends a Mac notification when the PR is ready or a step fails. They then run it again with `merge`, `keep`, `iterate` or `discard` (step 8 is done by the program). It uses the tool from `state.json`; `--tool codex` or `--tool claude` switches.
     - **Backup:** open a new session and paste `/develop --resume <feature>` (Codex: `$develop --resume <feature>`).

### Resume

Go to `.worktrees/feature-<feature>` and work there. Read `spec.md` (including `## Stop 2 decisions` and `## Discovered`), the tickets and `log.md`. Pick up at the first step the log hasn't finished: skip tickets with a `built` line, and if a PR is already open, go to the step the log points at.

**After the graph's `iterate`:** turn what the user wants changed into new tickets (append them to `state.json` with `"built": null`), set `"step": "build"` and `"round": 0`, commit, push, and give them the graph command again.

### 4. Build

For each ticket, in Blocked-by order:

- **Start one subagent**: **strong** for new design, **light** for pattern or boilerplate. Brief: the ticket path, the `spec.md` path, everything under `## Discovered` in bold, and: "Run the `implement` skill on this ticket. Use `tdd` only at the ticket's listed seams. Run the project's checks from `AGENTS.md`. Commit to this branch with a Conventional Commit. Your work will be reviewed. Report: status, what changed, what you skipped, test output, known gaps."
- **Risky ticket**: touches login or security, secrets, database migrations, CI, a published API, or a file several tickets share. Also if the coder reports a concern or a change of plan. Start a **strong** reviewer with the ticket and `git show <sha>`. Fix and re-review until clean.
- Something later tickets must know, especially a silent trap (no error, no failing test)? Append it to `spec.md` under `## Discovered`.
- A failure → the subagent runs the `diagnosing-bugs` skill. No blind fixes.
- Log `built <NN> <sha>`.
- **The context check fires** → finish the ticket in progress, write where things stand in that ticket's `## Comments`, commit, push, stop, and give the resume prompt.

### 5. Self-check (whole branch)

1. Run the project's typecheck, lint and tests from `AGENTS.md`. Quote the output. Red → fix first.
2. **Light** subagent runs the `ponytail-review` skill over `git diff origin/main...HEAD`. Apply what it says to delete.
3. **Light** subagent updates the docs to match what was built: `docs/status.md` (write the state as it will be once this merges), `docs/design/hld.md` / `lld.md` if a table, route, flow or component changed, `PRD.md` if what v1 *is* changed, `CONTEXT.md` for new terms.
4. Built something likely to repeat? Add it to `docs/patterns.md` (create it if missing): the name, the files to copy, what to change.
5. If `playwright.config.*` exists: add a Playwright test for each UI flow this branch made stable. If that flow is listed in `qa/naive-user/<app>/config.json`, mark it `scripted`.

Commit and push.

### 6. PR check

1. If the change has a UI, start the app (`AGENTS.md`, or the project's `running-the-app` skill).
2. `git fetch origin && git merge origin/main` (merge, never rebase). Fix conflicts, push, and open the PR with `gh pr create`: a summary, the spec path and the log's `VERDICT` lines.
3. **Up to 2 rounds.** Each round runs:
   - **Review**: **strong** subagent runs the `code-review` skill against `origin/main`, with the spec path and `## Carried to review`.
   - **Playwright**: if it exists, run the tests. Any failure is a blocker.
   - **Naive-user** (UI only): **strong** subagent runs the `naive-user` skill on the pages this branch changed, skipping flows already marked `scripted`.

   No blockers → done. Otherwise a **light** fix subagent fixes only blocker and important findings, commits each fix and pushes. Use **strong** if it skips any. After round 2, anything still open goes to stop 3.

### 7. Stop 3: merge

Present the PR, results and anything still open. Choices: **merge** (squash), **keep the PR open**, **keep working** (back to step 4 with the asks as new tickets), **throw away** (close the PR, delete the branch).

### 8. Wrap-up

1. On merge: set `Status: done` on every ticket of the feature, commit and push. This happens on the branch, before merging, so `main` never gets a direct commit.
2. Append the cost line to the PR body from the log: `Cost: <n> subagents · <tokens> tokens · <n> blockers at PR check`. `gh pr edit` has no append, so read the body and write it back in one command.
3. Merge or throw away: `gh pr merge --squash --delete-branch` (or close), remove the worktree, delete the local branch, `git pull --ff-only` on `main`. Keep open or keep working: leave the worktree and say where it is.
4. Stop the app if this run started it.
5. Check `main` is clean. Report anything that isn't.
6. If the project deploys on merge (`PLAN.md` → Deploy pipeline), check the live site actually serves the change. If a status doc is now wrong, offer a fix PR.
7. Send one summary in the close-out form below. Nothing after it.

## Fast lane

1. Setup as above.
2. **Stop (fast lane)** in the stop form: the pattern copied, what changes, and why nothing risky is touched. The PR description is the spec.
3. On approval, one **light** subagent builds it with the step 4 brief, using the description in place of a ticket.
4. Steps 5–8 as normal, minus the ticket status update. No spec or tickets checks, no session switch.

## Stop messages

Every stop and the wrap-up summary use this form, in **short, simple words with no jargon**. Explain any term the user hasn't seen this session, or cut it.

```
**<The ask: one sentence naming the decision.>**

**What this is**
<The work in plain words, for someone who has lost all context.>

**What happened**
<At most two sentences: the outcome, not a list. "The check found 6 problems, 1 serious; all fixed." Detail: <path>>

**Needs your decision**: <one line per choice, with my pick; or "nothing">

**Decided without asking**
- <one line each: only what an ADR, the repo or a measurement already settles. Omit if empty.>

**What happens next**
<The next one or two steps. At stop 2: the paste-ready resume prompt.>

**To review:** <path> · <what it holds> · ~<n> min
```

*What this is* and *What happens next* are never left out. The wrap-up summary swaps the ask for where things stand and drops *To review*.

Example:

```
**Approve this spec, or send it back.**

**What this is**
Editing a note's type today wipes its title, with no way to undo it. The fix only changes the title when you actually edit it.

**What happened**
The check found 4 problems, none serious; all fixed. Detail: tickets/note-title/checks/spec.md

**Needs your decision**: nothing.

**What happens next**
Once you approve, I split it into tickets for you to approve.

**To review:** tickets/note-title/spec.md · the fix and its 3 rules · ~3 min
```
