---
name: review-discipline
description: WHEN reviewing a PR, branch, stack, or diff in any repository; enforces measured findings over plausible ones, per-layer stack review, claim falsification, and delivery of findings to where the work lives.
---

# Review Discipline

Method for reviewing code changes so that findings are true, complete, and durable.
The founding observation: **a plausible mechanism, stated confidently, survives
review unless someone runs it.** Everything below exists to force the running.

If the repository under review carries its own review guidelines (commonly
`docs/REVIEWING.md`, `AGENTS.md`, or `CLAUDE.md`), read them first — repo-specific
rules (release semantics, public-repo constraints, CI quirks) override and extend
this method.

## Scope the review correctly

1. **Stacked PRs are reviewed per layer.** Each PR is a diff against its own base.
   The combined stack diff hides findings in files a higher layer rewrites or
   deletes, and hides every per-PR description. Review both views when a stack is
   involved.
2. **Check the prose against the diff.** PR bodies and commit messages drift —
   especially after a rebase moves work between parents. Measured claims ("N
   findings fixed", "nothing is suppressed") are re-measured against the actual
   tree, and quoted numbers are re-derived, not trusted.
3. **The goal defines the scope; the diff only locates the change.** If the PR
   claims a property ("this package is now rule-clean", "this check fails
   loudly"), test the property wherever it applies — including code the diff never
   touched.

## Find what's actually wrong

4. **Every finding carries its reproduction.** The command, test, or probe that
   demonstrates it — run before reporting. Claims about mechanisms (retry,
   caching, chunk membership, event ordering, process exit) are exercised, not
   inferred. This kills false findings as reliably as it confirms real ones.
5. **Run a skeptic pass over clean verdicts.** "Verified clean" is a finding too,
   and the sharpest misses hide behind praise. Give each clean-looking region one
   adversarial probe: non-finite numbers (`NaN`, `Infinity`), empty collections,
   duplicate or out-of-order arrivals, killed/aborted processes, and — for
   scripts — whether the event loop actually drains and the process exits.
6. **Review guards as guards.** For any validator, gate, or CI check, ask how it
   passes while verifying nothing: an empty input set going green, items
   *discovered* counted as items *compared*, unvalidated environment inputs
   silencing the comparison, a graph walk missing an edge kind. A guard that can
   pass vacuously is worse than no guard — it reads as coverage.
7. **A wrong justifying comment indicts the code.** When a comment defending a
   design is false, ask whether the design survives without the claim; do not stop
   at rewording.
8. **Exit codes, not output tails.** Piped output hides mid-stream failures;
   workspace runners keep going after one member fails. Verify green by exit
   status.

## Deliver so the findings survive

9. **Findings land where the work lives** — as PR review comments or filed issues —
   before any summary is written. A summary is an index into the record, never the
   record: anything compressed away will be re-derived later at full cost, by
   someone who cannot see that it was already found.
10. **Synthesize across dimensions before concluding.** When several reviewers or
    agents cover different angles, cross-join their outputs — the sharpest finding
    is often a fact from one report applied to code another report analyzed.
11. **Report refuted suggestions with the evidence.** When a review suggestion is
    tested and fails (the fix that reintroduces a sibling bug), record the test
    result on the thread; a rejected suggestion without evidence reads as an
    ignored one.
