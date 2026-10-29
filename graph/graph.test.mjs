// Drives graph.mjs with a fake AI and a fake shell, so the steps and loops are checked
// without spending tokens. Run: node --test ~/.claude/skills/graph/graph.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, Stop } from "./graph.mjs";

// A repo root with one feature worktree holding state.json, a spec and two tickets.
function setup(tickets = [{ id: "01" }, { id: "02", risky: true }]) {
  const root = mkdtempSync(join(tmpdir(), "graph-"));
  const dir = join(root, ".worktrees", "feature-signup", "tickets", "signup");
  mkdirSync(join(dir, "issues"), { recursive: true });
  writeFileSync(join(dir, "spec.md"), "# Sign-up page\n");
  writeFileSync(join(dir, "log.md"), "");
  const state = {
    tool: "claude",
    step: "build",
    tickets: tickets.map((t) => ({
      path: `tickets/signup/issues/${t.id}.md`,
      strength: "light",
      risky: false,
      built: null,
      ...t,
    })),
  };
  for (const t of state.tickets)
    writeFileSync(join(root, ".worktrees", "feature-signup", t.path), "Status: ready-for-agent\n");
  writeFileSync(join(dir, "state.json"), JSON.stringify(state));
  const read = () => JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  const log = () => readFileSync(join(dir, "log.md"), "utf8");
  return { root, read, log };
}

// Fake deps: `reply(prompt, strength)` gives the AI's JSON reply for each step.
function fakes(root, reply) {
  const calls = { ai: [], sh: [], notes: [] };
  return {
    calls,
    deps: {
      sh(cmd) {
        calls.sh.push(cmd);
        if (cmd.startsWith("git rev-parse --show-toplevel")) return { code: 0, out: root };
        if (cmd === "git branch --show-current") return { code: 0, out: "feature/signup\n" };
        if (cmd.startsWith("gh pr create")) return { code: 0, out: "https://github.com/me/app/pull/7\n" };
        return { code: 0, out: "" };
      },
      ai({ strength, prompt, readOnly }) {
        calls.ai.push({ strength, prompt, readOnly });
        return { json: reply(prompt, strength), tokens: 100 };
      },
      notify: (m) => calls.notes.push(m),
    },
  };
}

const happy = (prompt) => {
  if (prompt.includes("Build the ticket")) return { status: "done", sha: "abc", concerns: false };
  if (prompt.includes('{"blockers"')) return { blockers: 0, total: 1 };
  return { status: "done" };
};

test("runs every ticket, opens the PR and stops at the merge stop", () => {
  const { root, read, log } = setup();
  const { deps, calls } = fakes(root, happy);
  run("signup", undefined, deps);
  const s = read();
  assert.equal(s.step, "stop3");
  assert.equal(s.pr, 7);
  assert.deepEqual(
    s.tickets.map((t) => t.built),
    ["abc", "abc"],
  );
  assert.match(log(), /built 01 abc[\s\S]*built 02 abc/);
  assert.match(log(), /review 02 · claude\/strong/); // ticket 02 is risky, so it gets a reviewer
  assert.doesNotMatch(log(), /review 01/);
  const reviews = calls.ai.filter((c) => /Review ticket|code-review skill/.test(c.prompt));
  assert.ok(reviews.length === 2 && reviews.every((c) => c.readOnly), "review steps run read-only");
  assert.ok(calls.ai.filter((c) => c.prompt.includes("Build the ticket")).every((c) => !c.readOnly));
  assert.match(log(), /VERDICT review blockers=0/);
  assert.match(calls.notes.at(-1), /PR #7 ready/);
});

test("blockers in round 1 get fixed, round 2 comes back clean", () => {
  const { root, read } = setup([{ id: "01" }]);
  let round = 0;
  const { deps, calls } = fakes(root, (prompt, strength) => {
    if (prompt.includes("Run the code-review skill")) return { blockers: round++ === 0 ? 2 : 0, total: 3 };
    return happy(prompt, strength);
  });
  run("signup", undefined, deps);
  assert.equal(read().step, "stop3");
  assert.equal(read().round, 2);
  assert.equal(read().open, 0);
  assert.equal(calls.ai.filter((c) => c.prompt.includes("Fix only the blocker")).length, 1);
});

test("a failed light step retries on strong; a second failure stops and keeps its place", () => {
  const { root, read } = setup([{ id: "01" }, { id: "02" }]);
  const failing = (prompt, strength) =>
    prompt.includes("issues/02") && prompt.includes("Build the ticket")
      ? { status: "failed" }
      : happy(prompt, strength);
  const { deps, calls } = fakes(root, failing);
  assert.throws(() => run("signup", undefined, deps), Stop);
  const tries = calls.ai.filter((c) => c.prompt.includes("issues/02"));
  assert.deepEqual(
    tries.map((c) => c.strength),
    ["light", "strong"],
  );
  assert.equal(read().tickets[0].built, "abc");
  assert.equal(read().tickets[1].built, null);

  // Running again carries on at ticket 02 and doesn't rebuild 01.
  const again = fakes(root, happy);
  run("signup", undefined, again.deps);
  assert.equal(again.calls.ai.filter((c) => c.prompt.includes("issues/01")).length, 0);
  assert.equal(read().step, "stop3");
});

test("merge marks tickets done on the branch, adds the cost line, then merges", () => {
  const { root, read } = setup([{ id: "01" }]);
  run("signup", undefined, fakes(root, happy).deps);
  const { deps, calls } = fakes(root, happy);
  run("signup", "merge", deps);
  const t = readFileSync(join(root, ".worktrees", "feature-signup", "tickets/signup/issues/01.md"), "utf8");
  assert.equal(t, "Status: done\n");
  const order = ["git add tickets/signup", "gh pr edit 7", "gh pr merge 7 --squash", "git worktree remove", "git push origin --delete", "git branch -D"];
  const at = order.map((o) => calls.sh.findIndex((c) => c.startsWith(o)));
  assert.ok(
    at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])),
    `order was ${at}`,
  );
  assert.equal(read().step, "done");
});

test("a failed merge keeps saved progress and skips cleanup so it can be retried", () => {
  const { root, read } = setup([{ id: "01" }]);
  run("signup", undefined, fakes(root, happy).deps);
  const { deps, calls } = fakes(root, happy);
  const shell = deps.sh;
  deps.sh = (cmd, options) => {
    const result = shell(cmd, options);
    return cmd.startsWith("gh pr merge") ? { code: 1, out: "merge blocked" } : result;
  };
  assert.throws(() => run("signup", "merge", deps), /merge failed: merge blocked/);
  assert.equal(read().tickets[0].built, "abc");
  assert.equal(read().pr, 7);
  assert.ok(!calls.sh.some((cmd) => /worktree remove|push origin --delete|branch -D|git pull/.test(cmd)));
  assert.ok(!calls.notes.some((note) => note.includes("merged PR")));

  const retry = fakes(root, happy);
  run("signup", "merge", retry.deps);
  assert.ok(retry.calls.sh.some((cmd) => cmd.startsWith("gh pr merge")));
  assert.match(retry.calls.notes.at(-1), /merged PR #7/);
});

