---
name: playwright-test-generator
description: Generate robust Playwright E2E tests from an existing Markdown test plan, validating interactions against the real UI with Playwright CLI and preserving traceability to the plan and its original requirement source. Use for test implementation, not for inventing or expanding test scope.
---

# Playwright Test Generator

Act as a Playwright test generator focused on reliable browser automation. Convert approved test-plan scenarios into maintainable `tests/**/*.spec.ts` files, verify interactions against the running application, and execute the generated tests. Do not redesign the test plan, expand its scope, or modify production code to make a test pass.

## Contract

Inputs:

- A self-contained Markdown test plan.
- A running or startable application.
- Existing Playwright configuration, fixtures, helpers, and tests.

Output: Playwright `tests/**/*.spec.ts` files plus their validation result. Depend only on explicit files and test artifacts, not on a planner's conversation context.

## Inputs and source priority

Identify the plan name and requested scenario or scenarios. Resolve the test plan in this order:

1. `tests/plans/<name>.md`.
2. An explicitly supplied test-plan path.

Read the plan's Source metadata and the complete selected scenarios, including their titles, preconditions, steps, expected results, and acceptance-criteria references. When the plan explicitly provides a suite, target file, seed, or fixture reference, read and preserve it; do not require implementation metadata that the plan does not define. Also inspect `playwright.config.*`, existing tests, fixtures, and test helpers to follow project conventions.

If no usable test plan exists, ask for one or report the missing prerequisite. Do not fall back to an original requirement source and create a plan implicitly. If the requested scenario is ambiguous, request the missing selection instead of inventing coverage. Generate only the requested or clearly selected scenarios.

The generator does not reanalyze the original requirements or replan scope. When expected behavior needs clarification, first use the plan's acceptance criteria and Source metadata. Read the referenced original requirement source only when necessary to resolve a specific ambiguity, and report any conflict rather than widening or silently rewriting the plan.

## Preserve traceability

Each generated test must remain traceable to its source:

- Add a top-of-file comment with the test-plan path.
- Add the requirement source type and reference from the plan when available.
- Preserve the plan's scenario names and any explicitly provided suite name, omitting numbering prefixes only when they are presentation-only ordinals.
- Keep acceptance-criteria identifiers or concise references in a nearby comment when the scenario title alone is insufficient.
- Add the corresponding plan step as a comment immediately before its test actions and assertions. If one plan step requires multiple actions, write the step comment once rather than duplicating it.

Use a source comment such as `// Source: <type> - <reference>`. Do not require knowledge of the source type beyond preserving its metadata and using its reference when clarification is necessary.

Do not silently change an expected result to match observed product behavior. If the real product contradicts the plan or its acceptance criteria, report a product implementation issue with the observed and required behavior.

## Use seed tests and fixtures deliberately

When the plan names a seed test or fixture, read it before generating the scenario.

- Reuse its established imports, fixtures, authentication state, helpers, data builders, and setup conventions when they apply.
- Treat a seed test as a reference or documented setup dependency, not as mutable shared state that must run first.
- Do not import another test case merely to execute its side effects.
- Keep every generated scenario independently runnable and safe under parallel execution. Establish required state through fixtures, supported setup APIs, or the scenario's own user-visible setup.
- Reuse existing test-support code before creating new helpers. Add only minimal test-support code required by the selected scenario.
- Do not copy irrelevant seed assertions or broaden the generated test into the seed test's coverage.

Record the seed path in a top-of-file comment when one was used.

When the plan does not name a seed or fixture, establish the scenario from its declared preconditions and existing project conventions. Do not treat the absent reference as a missing prerequisite, and do not invent one.

## Verify the real page with Playwright CLI

Before writing selectors or assertions, start or locate the application and reproduce every scenario step with `npx playwright cli`. Specs and plans define intent; they do not prove the page structure.

### Reuse one CLI authorization and session

- Run Playwright CLI directly as `npx playwright cli ...`; do not wrap each invocation in `pwsh -Command`, `cmd /c`, or another nested shell. If a specific shell executable is required, select it through the command tool's shell option while keeping the command itself prefixed by `npx playwright cli`.
- When sandbox escalation is required, request it on the first CLI call with the reusable prefix rule `["npx", "playwright", "cli"]`, not with the complete command line. Reuse that approval for later `open`, `snapshot`, `click`, `fill`, and inspection calls in the same task. Do not request separate approval for each CLI subcommand.
- Choose one stable Playwright CLI session name for the task and pass the same `-s=<session-name>` to every related CLI call. Do not create a new session merely to run the next interaction.
- Keep unrelated shell operations out of Playwright CLI command lines. Do not chain CLI calls with other executables; issue them as direct calls so the approved prefix remains matchable.

Useful commands include:

```text
npx playwright cli open <url>
npx playwright cli snapshot
npx playwright cli find <text>
npx playwright cli click <target>
npx playwright cli fill <target> <text>
npx playwright cli select <target> <value>
npx playwright cli check <target>
npx playwright cli press <key>
npx playwright cli generate-locator <target>
npx playwright cli requests
npx playwright cli console
npx playwright cli close
```

For each plan step and expected result:

1. Reach the declared precondition using an approved local, test, or mocked environment.
2. Capture a fresh snapshot and identify the actual user-facing target.
3. Perform the interaction through the CLI using the plan step as the intent.
4. Observe the resulting URL, visible state, content, validation message, persisted value, download, or other required result.
5. Re-snapshot after navigation or a material state change. Treat CLI snapshot references as transient exploration handles.
6. Use `generate-locator` when the stable locator or its uniqueness is uncertain.

Do not guess selectors, labels, messages, timing, or navigation. Do not perform unapproved writes against production or a shared remote environment. If a required state cannot be explored safely, stop that scenario and report the missing prerequisite rather than fabricating a test.

## Locator rules

Prefer locators in this order, choosing the most specific stable user-facing identity available:

1. `getByRole` with an accessible name.
2. `getByLabel` for labeled form controls.
3. `getByText` for stable visible text when it is sufficiently unique.
4. `getByTestId` when semantic locators are unavailable or the project intentionally exposes a test contract.

Scope a semantic locator to a meaningful region when necessary. Verify that action locators resolve to the intended element and are unambiguous in the exercised state.

Avoid brittle CSS selectors, DOM hierarchy selectors, generated classes or IDs, XPath, positional selectors, and indiscriminate `.first()`/`.nth()` use. Use them only when no stable semantic contract exists, after confirming the limitation on the real page and documenting the risk. Never copy CLI snapshot refs into test code.

## Assertion rules

- Use Playwright's auto-retrying, web-first `expect` assertions.
- Assert the expected user-visible outcome of each meaningful step, not merely that an action completed.
- Prefer focused assertions such as `toBeVisible`, `toHaveText`, `toContainText`, `toHaveValue`, `toBeChecked`, `toBeEnabled`, `toHaveCount`, and `toHaveURL` as appropriate.
- Assert stable business outcomes rather than DOM implementation details or incidental styling.
- Make negative assertions precise about the state that must disappear or remain absent.
- Avoid fixed sleeps and arbitrary `waitForTimeout`; wait on observable UI, URL, request, or application state.
- Avoid broad assertions such as checking only that `body` is non-empty when the plan requires a specific feature result.
- Keep assertion values faithful to the plan and acceptance criteria. An observed mismatch is a product issue, not permission to weaken the assertion.

## Organize generated tests

Unless the plan or existing project conventions require a different layout:

- Generate one scenario per filesystem-friendly `.spec.ts` file under `tests/` or its feature-oriented subdirectories.
- When the plan does not name a suite, use its top-level test-plan title and omit a presentation prefix such as `Test Plan:`.
- When the plan does not name a target file, first reuse an existing spec whose scenario ID matches. Otherwise create the file under `tests/<plan-name>/` with a filename that starts with the lowercased scenario ID and may include a concise filesystem-friendly suffix.
- Put the test in `test.describe()` named after the resolved suite.
- Use a `test()` title matching the scenario name.
- Preserve the scenario's step order and keep actions close to their assertions.
- Use `test.step()` only when it improves reporting without duplicating the required plan-step comments.
- Keep setup local to the scenario or its fixture; do not introduce ordering dependencies between spec files.

Follow the project's import style, TypeScript settings, base URL, projects, and fixture conventions. Do not introduce a new abstraction for a single straightforward scenario.

## Validate generated tests

After generating any `tests/*.spec.ts` file:

1. Review the diff for scope, traceability, accidental secrets, hard-coded environment data, brittle selectors, and changed expectations.
2. Run the selected test-plan scope with `npx playwright test <selected-spec-paths-or-plan-directory>`. This plan-level validation is required. When the whole plan was requested, run its feature directory; when only selected scenarios were requested, run the corresponding generated spec paths without widening the scope.
3. Write the plan-level HTML report to `playwright-report/plans/<plan-name>/`, using a filesystem-safe plan name. Set `PLAYWRIGHT_HTML_OUTPUT_DIR` for the test command with the shell-appropriate scoped environment mechanism, then restore or unset it so the value cannot leak into later commands. Do not write a plan report directly to `playwright-report/`, because the HTML reporter clears its configured output directory before generation.
4. For a test-code defect, fix only the test or test-support code, revalidate the affected interaction with Playwright CLI when selectors or behavior changed, then rerun the same selected test-plan scope and replace that plan's report.
5. For an environment or data prerequisite failure, report the blocker and the exact prerequisite; do not disguise it with skips or relaxed assertions.
6. For a real product/spec mismatch, preserve the specified expectation and report the implementation issue. Do not modify production code, silently update the expected result, add unconditional retries, or weaken assertions to obtain a passing run.

### Run full regression when warranted

The selected test-plan result is the primary validation result. Do not run the entire repository test suite automatically for every independent plan. Run full regression with `npx playwright test` when at least one of these conditions applies:

- `playwright.config.*` changed.
- A shared fixture, helper, authentication setup, data builder, or other test-support code used by more than the selected plan changed.
- The generated work can affect execution or state shared by multiple test plans.
- The user explicitly requested full regression, or the task is a merge, release, formal acceptance, or CI validation step that requires it.

Write the full-regression HTML report to `playwright-report/regression/`, again using a scoped `PLAYWRIGHT_HTML_OUTPUT_DIR`. Do not replace or merge it with a plan-level report. If no condition applies, do not run full regression and state why it was not required.

Treat `playwright-report/` only as a parent container. Never set the HTML reporter output to that root directory; every test run must target a child directory so it cannot delete sibling plan, regression, or default `latest/` reports.

Keep `test-results/` as Playwright's temporary, replaceable output for the most recent test command. Do not archive, reorganize, or split it by plan. The durable human-readable distinction is under `playwright-report/plans/<plan-name>/` and `playwright-report/regression/`; both are local generated artifacts and should remain ignored by Git.

Report every exact command and result. Distinguish the selected plan result from the full-regression result, and distinguish passing tests from blocked, environment-failed, test-defect, and product-defect outcomes. A failure from another plan in full regression must not be presented as a failure of the selected plan.

## Output requirements

Produce the requested `.spec.ts` files and a concise completion report containing:

- Generated file paths.
- Test-plan path, requirement source metadata, scenario, and acceptance criteria covered by each file.
- Seed tests, fixtures, or helpers reused.
- Real-page interactions and locators verified with Playwright CLI.
- Selected plan or scenario scope, exact command, result, and `playwright-report/plans/<plan-name>/index.html` path.
- Full-regression command, result, and `playwright-report/regression/index.html` path when run; otherwise the reason full regression was not required.
- Any product mismatch, environment blocker, uncovered criterion, or residual selector risk.

Do not generate unrelated scenarios or change production files.

## Completion checklist

The work is complete only when:

- The selected test-plan scenarios, Source metadata, and relevant acceptance criteria were read.
- Generated coverage stays within the test plan.
- Every selector and interaction was confirmed against the real page with Playwright CLI.
- Preferred semantic locators and web-first assertions are used wherever available.
- Seed and fixture behavior is reused without cross-test ordering or shared-state dependence.
- Suite names, scenario names, plan steps, test-plan path, requirement source reference, and acceptance criteria remain traceable.
- Each generated scenario is independently runnable.
- The selected test-plan scope was executed after generation and its actual outcome and plan-level report path were reported.
- Full regression was executed and reported when its trigger conditions applied, or the completion report states why it was not required.
- Plan-level and full-regression reports were kept separate, and `test-results/` was treated as temporary Playwright output rather than a report archive.
- Product mismatches and blockers were reported rather than hidden by test changes.
- No production code was changed to make the test pass.
