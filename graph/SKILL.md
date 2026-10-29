---
name: graph
description: Hand a feature's approved tickets to graph.mjs, a program that builds them, self-checks, opens the PR and runs the review rounds with a fresh AI per step. Use after /develop's stop 2, in place of /develop --resume.
argument-hint: "<feature> | <feature> iterate"
disable-model-invocation: true
---

# /graph

Sets up a feature for `graph.mjs`, the program in this folder that runs the second half of `/develop` (steps 4–8) without a chat. A program walks the steps and starts a fresh Claude or Codex run for each one, so no step is skipped and nothing fills up. The rules for each step stay in the `develop` skill; the program points each AI at them.

Typed as `/graph` in Claude and `$graph` in Codex. Use it after `/develop`'s stop 2 (tickets approved and committed), instead of `/develop --resume`.

## `/graph <feature>`

1. Go to `.worktrees/feature-<feature>`. Check that `tickets/<feature>/spec.md` and the tickets exist and that stop 2 was approved (`log.md` has `stop 2 approved`, or the user says so). If not, say so and stop.
2. Write `tickets/<feature>/state.json`:
   ```json
   { "tool": "claude", "step": "build",
     "tickets": [{ "id": "01", "path": "tickets/<feature>/issues/01-<slug>.md", "strength": "light", "risky": false, "built": null }] }
   ```
   - `tool`: the tool you're running in.
   - Tickets in Blocked-by order. Skip any ticket `log.md` already marks `built`.
   - `strength`: `strong` for new design, `light` for pattern or boilerplate (from the ticket's label; in doubt, strong).
   - `risky`: true if the ticket touches login or security, secrets, database migrations, CI, a published API, or a file several tickets share.
3. Commit it (`chore: hand <feature> to the graph`) and push.
4. Tell the user, briefly:
   - Run `node ~/.claude/skills/graph/graph.mjs <feature>` in a terminal. It prints a line per step and sends a Mac notification when the PR is ready or a step fails.
   - When it's done: run it again with `merge`, `keep`, `iterate` or `discard`.
   - A failed step is retried once on the stronger model; after that it stops, and running the same command again carries on.
   - `--tool codex` or `--tool claude` switches tool.

Don't run the program from this chat: it takes a long time, and keeping it out of the chat is the point.

## `/graph <feature> iterate`

After the user chose `iterate` at the merge stop.

1. Ask what they want changed, if they haven't said.
2. Turn it into new tickets with the `to-tickets` skill, numbered after the existing ones.
3. Append them to `state.json` with `"built": null`, and set `"step": "build"` and `"round": 0`.
4. Commit, push, and give them the run command again.

## Files

- `graph.mjs`: the program. Its steps, retries and prompts are all in that one file.
- `graph.test.mjs`: runs the program with a fake AI. `node --test ~/.claude/skills/graph/graph.test.mjs`.
