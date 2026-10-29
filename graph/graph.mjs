#!/usr/bin/env node
// The second half of /develop as a program: builds the tickets, self-checks, opens the PR,
// runs up to 2 review rounds, then stops for the merge decision.
// A program walks the steps; each step is one fresh AI run (Claude or Codex, no chat).
//
//   node graph.mjs <feature>            start, or carry on from where it stopped
//   node graph.mjs <feature> merge      squash-merge and clean up   (also: keep, iterate, discard)
//   --tool claude|codex                 use that tool instead of the one /develop started in
//
// Reads and writes tickets/<feature>/state.json in the feature's worktree; the graph skill writes it.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS = dirname(dirname(fileURLToPath(import.meta.url)));
const MODELS = {
  claude: { light: ["--model", "sonnet"], strong: ["--model", "opus"] },
  codex: {
    light: ["-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="medium"'],
    strong: ["-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="high"'],
  },
};
const ROUNDS = 2;
// ponytail: one time limit for every AI step; give steps their own limits if some need longer.
const STEP_MINUTES = 45;
// Checking steps can read the code and git history, but not change anything.
const READ_ONLY = "Read,Grep,Glob,Agent,Skill,Bash(git diff *),Bash(git show *),Bash(git log *),Bash(git status *)";
const DONE = '{"status":"done"}';

export class Stop extends Error {}

// Run a shell command; returns { code, out } with stdout and stderr together.
function sh(cmd, { cwd, input } = {}) {
  const r = spawnSync("sh", ["-c", cmd], { cwd, input, encoding: "utf8", maxBuffer: 1 << 28 });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const q = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

function notify(msg) {
  console.log(msg);
  sh(`osascript -e ${q(`display notification ${JSON.stringify(msg)} with title "graph"`)}`);
}

// One fresh AI run in the worktree, in the tool's safety mode (or read-only). Returns its reply,
// the JSON object from the reply's last line (null if there isn't one) and the tokens it used.
// A run past STEP_MINUTES is killed and counts as a failed step.
export function ai({ tool, strength, prompt, cwd, readOnly = false }) {
  const tmp = join(tmpdir(), `graph-${process.pid}-${Date.now()}.txt`);
  const args =
    tool === "claude"
      ? [
          "claude",
          "-p",
          prompt,
          ...MODELS.claude[strength],
          "--output-format",
          "json",
          ...(readOnly
            ? // user settings may allow any shell command, which would let a "read-only" run write files
              ["--setting-sources", "project", "--permission-mode", "dontAsk", "--allowedTools", READ_ONLY]
            : ["--permission-mode", "auto"]),
        ]
      : [
          "codex",
          "exec",
          "--json",
          ...MODELS.codex[strength],
          "-o",
          tmp,
          ...(readOnly
            ? ["-s", "read-only"]
            : [
                "--approve-for-me",
                "--add-dir",
                sh("git rev-parse --path-format=absolute --git-common-dir", { cwd }).out.trim(),
                "-c",
                "sandbox_workspace_write.network_access=true",
              ]),
          prompt,
        ];
  const r = spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    maxBuffer: 1 << 28,
    timeout: STEP_MINUTES * 60_000,
  });
  let text = "",
    tokens = 0;
  try {
    if (tool === "claude") {
      const j = JSON.parse(r.stdout);
      const u = j.usage ?? {};
      text = j.result ?? "";
      tokens =
        (u.input_tokens ?? 0) +
        (u.output_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0);
    } else {
      text = readFileSync(tmp, "utf8");
      for (const line of r.stdout.split("\n")) {
        const e = line.startsWith("{") ? JSON.parse(line) : null;
        if (e?.type === "turn.completed") tokens += (e.usage.input_tokens ?? 0) + (e.usage.output_tokens ?? 0);
      }
    }
  } catch {} // no usable reply: json stays null and the caller retries or stops
  const last = text
    .trim()
    .split("\n")
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  let json = null;
  try {
    json = last ? JSON.parse(last.trim()) : null;
  } catch {}
  return { json, tokens, text, timedOut: r.error?.code === "ETIMEDOUT" };
}

export function run(feature, action, deps = { sh, ai, notify }, tool) {
  const root = deps
    .sh("git rev-parse --show-toplevel")
    .out.trim()
    .replace(/\/\.worktrees\/.*$/, "");
  const wt = join(root, ".worktrees", `feature-${feature}`);
  const dir = join(wt, "tickets", feature);
  const stateFile = join(dir, "state.json");
  if (!existsSync(stateFile)) throw new Stop(`no ${stateFile}; run /graph <feature> first, after /develop's stop 2`);
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  if (tool) state.tool = tool;
  const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
  const log = (line) => appendFileSync(join(dir, "log.md"), line + "\n");
  const git = (cmd) => deps.sh(`git ${cmd}`, { cwd: wt });
  const push = () => git("push -q -u origin HEAD");
  const spec = `tickets/${feature}/spec.md`;
  const title = (readFileSync(join(wt, spec), "utf8").match(/^# (.+)$/m) ?? [, feature])[1];

  // One AI step, retried once on the strong model. `ok(reply, strength)` decides if the reply counts.
  // `readOnly` steps can't change files, so the program saves their reply to `saveTo` for them.
  function step(name, strength, prompt, ok = (j) => j?.status === "done", { readOnly = false, saveTo } = {}) {
    for (const s of strength === "light" ? ["light", "strong"] : ["strong"]) {
      const { json, tokens, text, timedOut } = deps.ai({ tool: state.tool, strength: s, prompt, cwd: wt, readOnly });
      log(
        `${name} · ${state.tool}/${s} · ${tokens || "n/a"}${timedOut ? ` · timed out after ${STEP_MINUTES} min` : ""}`,
      );
      if (saveTo && json)
        writeFileSync(join(wt, saveTo), (text ?? "").trim().split("\n").slice(0, -1).join("\n") + "\n");
      if (ok(json, s)) return json;
    }
    throw new Stop(`${name} failed twice; see tickets/${feature}/log.md`);
  }

  const brief = (job) =>
    `You are one step of the /develop loop (${SKILLS}/develop/SKILL.md) for the feature in ${spec}. ` +
    `If a skill can't be called directly, read its SKILL.md under ${SKILLS}/ and follow it. ${job} ` +
    `Finish your reply with one line of JSON and nothing after it.`;

  // Project checks from package.json; returns failing output, or "" when green.
  function checks() {
    const pkg = join(wt, "package.json");
    const scripts = existsSync(pkg) ? (JSON.parse(readFileSync(pkg, "utf8")).scripts ?? {}) : {};
    for (const s of ["typecheck", "lint", "test"].filter((s) => scripts[s])) {
      const r = deps.sh(`npm run -s ${s}`, { cwd: wt });
      if (r.code !== 0) return `npm run ${s} failed:\n${r.out.slice(-4000)}`;
    }
    return "";
  }

  function greenOrFix(when) {
    const failed = checks();
    if (!failed) return;
    step(
      `fix checks ${when}`,
      "light",
      brief(
        `The project's checks fail. Fix the cause (no skipping tests), commit with a Conventional Commit. Output:\n${failed}\nEnd with ${DONE}`,
      ),
    );
    if (checks()) throw new Stop(`checks still fail ${when}`);
  }

  if (action) return decide(action);

  mkdirSync(join(dir, "checks"), { recursive: true });
  try {
    while (state.step !== "stop3") {
      if (state.step === "build") {
        for (const t of state.tickets.filter((t) => !t.built)) {
          const done = step(
            `build ${t.id}`,
            t.strength,
            brief(
              `Build the ticket ${t.path} by following the implement skill. Use tdd only at the ticket's listed seams. Read spec.md's "## Discovered" first and append anything later tickets must know. Run the project's checks. Commit to this branch with a Conventional Commit. Your work will be reviewed. End with {"status":"done","sha":"<commit>","concerns":<true if you changed the plan or are unsure>,"summary":"<one line>"}`,
            ),
          );
          if (t.risky || done.concerns) {
            let clean = false;
            for (let i = 1; i <= 2 && !clean; i++) {
              const r = step(
                `review ${t.id}`,
                "strong",
                brief(
                  `Review ticket ${t.path} as built in \`git show ${done.sha}\` and any later commits. Don't change any files: list your findings in your reply, most serious first, each marked blocker or minor. End with {"blockers":<n>}`,
                ),
                (j) => Number.isInteger(j?.blockers),
                { readOnly: true, saveTo: `tickets/${feature}/checks/ticket-${t.id}.md` },
              );
              clean = r.blockers === 0;
              if (!clean)
                step(
                  `fix ${t.id}`,
                  "light",
                  brief(
                    `Fix the blocker findings in tickets/${feature}/checks/ticket-${t.id}.md and commit. End with ${DONE}`,
                  ),
                );
            }
            if (!clean) throw new Stop(`ticket ${t.id} still has blockers after 2 reviews`);
          }
          t.built = done.sha;
          log(`built ${t.id} ${done.sha}`);
          push();
          save();
          console.log(`✓ ticket ${t.id} built`);
        }
        state.step = "selfcheck";
      } else if (state.step === "selfcheck") {
        greenOrFix("before self-check");
        step(
          "self-check",
          "light",
          brief(
            `Do steps 5.2 to 5.5 of the develop skill on \`git diff origin/main...HEAD\`: ponytail-review (apply its deletions), update docs, the pattern list, Playwright tests if the project has Playwright. Commit. End with ${DONE}`,
          ),
        );
        greenOrFix("after self-check");
        push();
        console.log("✓ self-check");
        state.step = "pr";
      } else if (state.step === "pr") {
        git("fetch -q origin");
        if (git("merge -q --no-edit origin/main").code !== 0) {
          git("merge --abort");
          throw new Stop("merge conflict with main; resolve it in the worktree, then run graph again");
        }
        push();
        if (!state.pr) {
          const verdicts = readFileSync(join(dir, "log.md"), "utf8")
            .split("\n")
            .filter((l) => l.startsWith("VERDICT"));
          const body = `Spec: \`${spec}\`\n\n## Checks\n\n${verdicts.join("\n") || "none"}\n\n🤖 Built by /develop graph`;
          const url = deps
            .sh(`gh pr create --title ${q(title)} --body-file -`, { cwd: wt, input: body })
            .out.trim()
            .split("\n")
            .pop();
          state.pr = Number(url.split("/").pop());
          if (!state.pr) throw new Stop(`could not open the PR: ${url}`);
        }
        console.log(`✓ PR #${state.pr} open`);
        state.step = "review";
      } else if (state.step === "review") {
        state.round = (state.round ?? 0) + 1;
        const n = state.round;
        let blockers = 0;
        const review = step(
          `review round ${n}`,
          "strong",
          brief(
            `Run the code-review skill on origin/main...HEAD against ${spec}, including its "## Carried to review". Don't change any files: list your findings in your reply, most serious first, each marked blocker, important or minor. End with {"blockers":<n>,"total":<n>}`,
          ),
          (j) => Number.isInteger(j?.blockers),
          { readOnly: true, saveTo: `tickets/${feature}/checks/review-${n}.md` },
        );
        log(
          `VERDICT review blockers=${review.blockers} total=${review.total ?? "?"} file=tickets/${feature}/checks/review-${n}.md`,
        );
        blockers += review.blockers;
        for (const cfg of git("ls-files '*playwright.config.*'").out.split("\n").filter(Boolean)) {
          const r = deps.sh(`npx playwright test -c ${q(cfg)}`, { cwd: wt });
          writeFileSync(join(dir, "checks", `playwright-${n}.md`), r.out.slice(-20000));
          log(`VERDICT playwright blockers=${r.code === 0 ? 0 : 1} file=tickets/${feature}/checks/playwright-${n}.md`);
          if (r.code !== 0) blockers += 1;
        }
        if (existsSync(join(wt, "qa", "naive-user"))) {
          const nu = step(
            `naive-user round ${n}`,
            "strong",
            brief(
              `Start the app (the running-the-app skill, or AGENTS.md) and use the naive-user skill on the pages this branch changed, skipping flows marked scripted. End with {"blockers":<n>,"total":<n>,"file":"<findings path>"}`,
            ),
            (j) => Number.isInteger(j?.blockers),
          );
          log(`VERDICT naive-user blockers=${nu.blockers} total=${nu.total ?? "?"} file=${nu.file ?? "?"}`);
          blockers += nu.blockers;
        }
        state.open = blockers;
        console.log(`${blockers ? "✗" : "✓"} review round ${n}: ${blockers} blockers`);
        if (blockers === 0 || n >= ROUNDS) {
          state.step = "stop3";
        } else {
          step(
            `fix round ${n}`,
            "light",
            brief(
              `Fix only the blocker and important findings from this round in tickets/${feature}/checks/ (review-${n}.md, playwright-${n}.md, naive-user findings). Commit each fix. End with {"status":"done","skipped":<findings left unfixed>}`,
            ),
            (j, s) => j?.status === "done" && (s === "strong" || !j.skipped),
          );
          push();
        }
      }
      save();
    }
  } finally {
    save(); // a stop keeps its place, so running graph again carries on
  }

  log("stop 3 reached");
  save();
  const pick = state.open ? "iterate" : "merge";
  console.log(`
**Merge PR #${state.pr}, keep it open, keep working, or throw it away.**

**What this is**
${title}. ${state.tickets.length} tickets built, ${state.round} review round(s).

**What happened**
${state.open ? `${state.open} blocker(s) still open after ${state.round} rounds.` : "Everything passed."} Detail: tickets/${feature}/checks/

**Needs your decision**: merge, keep, iterate or discard. My pick: ${pick}.

**What happens next**
Run \`graph ${feature} <merge|keep|iterate|discard>\` when you're ready.

**To review:** PR #${state.pr} · the change and its checks`);
  deps.notify(`${feature}: PR #${state.pr} ready, ${state.open} blocker(s) open`);

  function decide(choice) {
    if (state.step !== "stop3" && state.step !== "done")
      throw new Stop(`not at the merge stop yet (at: ${state.step})`);
    if (choice === "keep") return console.log(`PR #${state.pr} stays open. Worktree: ${wt}`);
    if (choice === "iterate") {
      return console.log(
        `Run /graph ${feature} iterate and say what to change. It adds tickets and sets the step back to build; then run graph ${feature} again.`,
      );
    }
    if (choice === "discard") {
      deps.sh(`git worktree remove --force ${q(wt)}`, { cwd: root });
      deps.sh(`gh pr close ${state.pr} --delete-branch`, { cwd: root });
      return deps.notify(`${feature}: PR #${state.pr} closed and cleaned up`);
    }
    if (choice !== "merge") throw new Stop(`unknown choice: ${choice} (merge, keep, iterate, discard)`);

    // Mark tickets done on the branch, so main never gets a direct commit.
    for (const t of state.tickets) {
      const p = join(wt, t.path);
      writeFileSync(p, readFileSync(p, "utf8").replace(/^Status:.*$/m, "Status: done"));
    }
    state.step = "done";
    save();
    git(`add tickets/${feature} && git commit -q -m ${q(`chore: mark ${feature} tickets done`)}`);
    push();

    const lines = readFileSync(join(dir, "log.md"), "utf8").split("\n");
    const runs = lines.filter((l) => / · (claude|codex)\//.test(l));
    const tokens = runs.reduce((s, l) => s + (Number(l.split(" · ").pop()) || 0), 0);
    const round2 = lines.findIndex((l) => l.startsWith("review round 2"));
    const firstRound = lines
      .slice(0, round2 < 0 ? lines.length : round2)
      .filter((l) => l.startsWith("VERDICT"))
      .reduce((s, l) => s + Number(l.match(/blockers=(\d+)/)?.[1] ?? 0), 0);
    const cost = `Cost: ${runs.length} AI runs · ${tokens.toLocaleString("en")} tokens · ${firstRound} blockers at PR check`;
    const body = deps.sh(`gh pr view ${state.pr} --json body -q .body`, { cwd: wt }).out;
    if (!/^Cost: /m.test(body))
      // a retried merge shouldn't add the line twice
      deps.sh(`gh pr edit ${state.pr} --body-file -`, { cwd: wt, input: `${body.trimEnd()}\n\n${cost}\n` });

    const branch = git("branch --show-current");
    if (branch.code !== 0 || !branch.out.trim()) throw new Stop("could not read the feature branch");
    // Keep the worktree and saved progress until GitHub confirms the merge.
    // A retry after a failed cleanup finds the PR already merged; skip straight to cleanup.
    if (deps.sh(`gh pr view ${state.pr} --json state -q .state`, { cwd: root }).out.trim() !== "MERGED") {
      const merged = deps.sh(`gh pr merge ${state.pr} --squash`, { cwd: root });
      if (merged.code !== 0) throw new Stop(`merge failed: ${merged.out.trim()}`);
    }
    const removed = deps.sh(`git worktree remove ${q(wt)}`, { cwd: root });
    if (removed.code !== 0)
      throw new Stop(`PR merged, but worktree cleanup failed; saved progress remains at ${wt}: ${removed.out.trim()}`);
    for (const cmd of [`git push origin --delete ${q(branch.out.trim())}`, `git branch -D ${q(branch.out.trim())}`]) {
      const deleted = deps.sh(cmd, { cwd: root });
      if (deleted.code !== 0) throw new Stop(`PR merged, but branch cleanup failed: ${deleted.out.trim()}`);
    }
    deps.sh("git pull -q --ff-only", { cwd: root });
    const dirty = deps.sh("git status --porcelain", { cwd: root }).out.trim();
    if (existsSync(join(root, "PLAN.md")) && /Deploy pipeline/.test(readFileSync(join(root, "PLAN.md"), "utf8"))) {
      deps.ai({
        tool: state.tool,
        strength: "light",
        cwd: root,
        prompt: brief(
          `PR #${state.pr} just merged. Do step 8.6 of the develop skill: check the live site serves the change. Change nothing; report in one line. End with ${DONE}`,
        ),
      });
    }
    console.log(`Merged PR #${state.pr} and cleaned up. ${cost}.${dirty ? `\nmain is not clean:\n${dirty}` : ""}`);
    deps.notify(`${feature}: merged PR #${state.pr}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--tool");
  const tool = at >= 0 ? args.splice(at, 2)[1] : undefined;
  const [feature, action] = args;
  if (!feature || (tool && !MODELS[tool])) {
    console.error("usage: graph.mjs <feature> [merge|keep|iterate|discard] [--tool claude|codex]");
    process.exit(2);
  }
  try {
    run(feature, action, undefined, tool);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    notify(`${feature}: stopped — ${e.message}`);
    process.exit(1);
  }
}
