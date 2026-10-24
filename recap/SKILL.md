---
name: recap
description: Tell the user where they left off in this project after time away. Reads git, PRs, tickets, docs and the end of their last sessions, then reports in a short fixed layout. Read-only.
disable-model-invocation: true
---

# /recap

The user has been away and has lost track of this project. Work out where they left off and tell them in plain, short words. **Only read and report: never change, commit, push or fix anything**, even if you spot a problem. Raise it in the recap instead.

Typed as `/recap` in Claude and `$recap` in Codex. It covers the project you're in, not other projects.

## 1. Gather

Run these from the repo root. Skip anything the project doesn't have.

- **Last sessions:** `sh <this skill's folder>/sessions.sh`. It prints the end of the last two Claude or Codex sessions run in this repo or its worktrees, newest first. Note what was being worked on, what was decided, and any question left unanswered.
- **Git:**
  - `git fetch -q origin`
  - `git status -sb`
  - `git log --oneline -15 origin/main`
  - `git worktree list`
  - for each worktree: `git -C <path> status -s` and its ahead/behind count against `origin/main`
  - local branches with no worktree: `git branch -vv`
- **PRs:** `gh pr list --json number,title,headRefName,reviewDecision,statusCheckRollup,updatedAt`.
- **`/develop` progress:** each `tickets/*/log.md`: the last stop reached, tickets built, open PR. Plus ticket `Status:` lines and the latest `## Comments`.
- **Docs:** `docs/status.md`, `PLAN.md` (current phase), and any ADR added in the last two weeks.

## 2. Report

Use this layout and nothing else. Drop any section that's empty. Use dates or "3 days ago", not commit hashes, unless a hash is the only way to name something.

```
**Where you left off**
<1–3 sentences: what you were doing, in which tool, how long ago, and how far it got.>

**Waiting on you**
- <PRs ready to merge or needing a reply, unanswered questions from the last session, a /develop stop waiting for approval>

**In progress**
- <worktrees and branches with unsaved or unpushed work, or behind main; half-built tickets>

**Changed while you were away**
- <commits on main since your last session, merged PRs, anything not done by you>

**Next step**
<One suggestion, with the exact command if there is one, e.g. `/develop --resume signup`.>
```

If the sources disagree (e.g. a ticket is marked in progress but its PR is merged), say so in one line under the section it affects.
