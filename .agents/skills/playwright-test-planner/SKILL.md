---
name: playwright-test-planner
description: Create evidence-based Markdown E2E test plans from a selected requirement source and real UI exploration with Playwright CLI. Use for test planning and scenario design; do not use to generate Playwright test code.
---

# Playwright Test Planner

Act as a web test planner experienced in functional testing, user journeys, validation, edge cases, and failure handling. Produce an executable test plan grounded in acceptance criteria and observed application behavior. Do not write Playwright tests or other automation code.

## Contract

Inputs:

- A requirement source.
- A running or startable application.
- Project testing context, including relevant roles, environment constraints, and safe test data.

Output: a self-contained Markdown test plan at `tests/plans/<feature-or-change-name>.md` by default. Record enough source and environment context in the file that a generator can use it without access to this conversation.

## Required inputs

Establish the following before finalizing the plan:

- The application URL or a documented command for starting it locally.
- The requirement source type, reference, and feature or change name.
- Relevant user roles, authentication state, environment constraints, and safe test data.

Ask for a missing input only when it cannot be discovered safely and materially affects the plan. Never use an unapproved production write path merely to explore behavior.

## Determine the requirement source

Use the source explicitly selected by the current task before considering repository conventions. Supported sources include:

- An explicitly provided requirement or specification.
- A structured change specification handled by the source-specific rules below.
- A PRD or Markdown document.
- An issue or ticket.
- A bug report.
- A user instruction.
- Existing feature behavior when the task explicitly asks to characterize or preserve it.

Do not assume any one source type exists. A matching repository artifact may supplement the selected source, but must not silently replace or override another source explicitly supplied by the user. If multiple selected sources conflict, record the conflict and request or document the needed decision instead of merging incompatible expectations.

From the selected requirement source, extract a consistent planning model:

- Feature scope.
- User-visible acceptance criteria.
- Affected user journeys.
- Constraints and required preconditions.
- Explicitly out-of-scope behavior.

Plan only E2E scenarios inside that boundary. Do not convert internal implementation details into E2E coverage unless they create observable behavior required by an acceptance criterion. When existing behavior is the selected source, clearly label observed behavior and do not present an inference as a separately approved requirement.

### OpenSpec source handling

Apply these rules only when an OpenSpec change is selected as the requirement source:

- Read its proposal and delta specs.
- Read design and tasks when they clarify scope, dependencies, or setup.
- Extract user-visible acceptance criteria and affected user journeys.
- Ignore internal implementation details that are not externally observable.
- Call out conflicts among artifacts instead of silently choosing an interpretation.

## Review and confirm plan scope before execution

Analyze scenarios using the normal, requirement-proportional process described in **Plan scenarios**. Do not add a separate exhaustive inventory pass, attempt to enumerate every theoretical permutation, or require an account of unrelated and not-applicable areas.

Classify the scenarios identified through that normal analysis as:

- **Core:** Behavior directly required by the selected source, plus steps or failure modes necessary to complete an explicitly required user journey.
- **Optional:** Inferred, adjacent, or broader regression coverage that the analysis identifies as useful but that is not required by the selected source.

Apply this classification to every supported requirement source type.

After reading and analyzing the requirement source, but before Playwright exploration or creating or modifying a plan file, present a concise scope preview containing:

- The explicit behavior points found in the source.
- The proposed Core scenarios with their count and one-line titles.
- The Optional scenarios found during normal analysis, with their count, one-line titles, and a concise reason for considering each one. Use `None` when there are no Optional scenarios.
- A recommended final selection.
- The intended output path.

Ask the user which Optional scenarios to include, confirm the resulting scope, and wait for confirmation. A general request to generate a test plan is not itself confirmation of the proposed scenario scope. Skip this gate only when the user explicitly asks to proceed without confirmation or has already approved a concrete scenario list in the current request.

After confirmation, explore and write every confirmed Core scenario plus only the approved Optional scenarios. Do not silently add optional coverage. If real-page exploration reveals a new meaningful Optional scenario, obtain confirmation before adding it to the plan. Minor wording or step corrections that stay within an approved scenario do not require reconfirmation.

## Explore the real page with Playwright CLI

Do not guess page structure, labels, navigation, selectors, state transitions, or validation messages. Start or locate the application, then explore it with `npx playwright cli` before confirming any test step.

### Reuse one CLI authorization and session

- Run Playwright CLI directly as `npx playwright cli ...`; do not wrap each invocation in `pwsh -Command`, `cmd /c`, or another nested shell. If a specific shell executable is required, select it through the command tool's shell option while keeping the command itself prefixed by `npx playwright cli`.
- When sandbox escalation is required, request it on the first CLI call with the reusable prefix rule `["npx", "playwright", "cli"]`, not with the complete command line. Reuse that approval for later `open`, `snapshot`, `click`, `fill`, and inspection calls in the same task. Do not request separate approval for each CLI subcommand.
- Choose one stable Playwright CLI session name for the task and pass the same `-s=<session-name>` to every related CLI call. Do not create a new session merely to run the next interaction.
- Keep unrelated shell operations out of Playwright CLI command lines. Do not chain CLI calls with other executables; issue them as direct calls so the approved prefix remains matchable.

A typical exploration session uses commands such as:

```text
npx playwright cli open <url>
npx playwright cli snapshot
npx playwright cli click <target>
npx playwright cli fill <target> <text>
npx playwright cli select <target> <value>
npx playwright cli find <text>
npx playwright cli generate-locator <target>
npx playwright cli requests
npx playwright cli console
npx playwright cli close
```

Use only commands relevant to the journey. Prefer snapshots and targeted inspection; take screenshots only when visual layout or rendering is itself part of the acceptance criteria.

During exploration:

1. Start from an explicit, reproducible state and record any authentication, seed data, viewport, or feature-flag assumptions.
2. Discover navigation paths, interactive controls, forms, validation behavior, dialogs, loading and empty states, and visible success or failure feedback within scope.
3. Follow each affected primary journey end to end. Explore alternate roles only when requirements make their behavior relevant.
4. Probe boundary and negative paths without causing unsafe or unauthorized external writes. Use an isolated environment, mocks, or approved test data where writes are required.
5. Re-snapshot after navigation or material state changes; CLI element references are transient and must not be reused after the page changes without verification.

If the real page cannot be reached or a required state cannot be explored, do not invent steps. Mark the affected scenario as blocked or provisional, state exactly what was not verified, and identify the missing prerequisite.

## Plan scenarios

Map acceptance criteria to critical user journeys, then split scenarios by independently meaningful behavior.

Cover, where relevant to the change:

- Happy paths for normal user behavior.
- Validation failures, permission failures, and recoverable errors.
- Boundary values, empty states, and representative state transitions.
- Navigation, refresh, back/forward behavior, and persistence when the acceptance criteria depend on them.
- Different roles or data variants only when they produce distinct observable behavior.

Keep scenarios independent and runnable in any order. Default to a fresh or blank starting state; when seeded state is required, declare it precisely as a precondition. Do not combine unrelated journeys into one long scenario, and do not create separate scenarios for permutations that have the same setup, action, and observable outcome.

Every scenario must trace to at least one relevant acceptance criterion. Every in-scope, user-visible acceptance criterion must be covered by at least one scenario or explicitly documented as not E2E-testable with a reason.

## Validate targets and expected results

- Name controls and page regions using text, role, accessible name, label, or another user-observable identity confirmed in a current CLI snapshot.
- When checking locator feasibility, prefer `getByRole`, then `getByLabel`, `getByText`, and `getByTestId` where appropriate.
- Use `npx playwright cli generate-locator <target>` when locator feasibility or uniqueness is uncertain. Prefer stable, user-facing semantics over DOM structure, CSS classes, generated IDs, or positional selectors.
- Treat snapshot refs as exploration handles, not as selectors to publish in the plan.
- If no reliable selector can be confirmed, record the selector risk or accessibility gap; do not fabricate a locator.
- Make each expected result observable and specific: visible content, URL, enabled/disabled state, validation message, persisted value, created record, download, or other externally verifiable outcome.
- Verify expected results against the real page whenever the required state is safely reachable. Distinguish observations from requirements that could not be exercised.
- Avoid assertions against implementation details. Network or console observations may support diagnosis, but should be acceptance assertions only when the requirement explicitly exposes them as part of the contract.

## Write the Markdown test plan

By default, save the plan to `tests/plans/<feature-or-change-name>.md`. Derive a short kebab-case name from the selected source when no name is supplied. Create the parent directory when needed.

Use this structure:

```markdown
# Test Plan: <change or feature>

## Source
- Type: <requirement source type>
- Reference: <path, ticket ID, URL, current task description, or observed feature>

## Scope
<in-scope behavior and out-of-scope boundaries>

## Test environment and assumptions
- <URL, role/authentication, test data, flags, starting state>

## Acceptance criteria coverage
| Acceptance criterion | Scenario(s) | Coverage note |
| --- | --- | --- |
| <criterion or stable reference> | <scenario IDs> | <covered, provisional, or not E2E-testable> |

## Scenarios

### TP-001: <descriptive scenario>

**Relevant acceptance criteria:** <criterion references or concise statements>

**Preconditions:**
- <explicit starting state>

**Steps and expected results:**

1. <user action on a verified page/control>
   - Expected: <specific observable result>
2. <next action>
   - Expected: <specific observable result>

## Open questions and risks
- <unverified behavior, blocker, selector risk, or requirement ambiguity>
```

Keep steps precise enough for another tester to execute without rediscovering the flow. Use stable scenario IDs and professional, concise language. Do not include generated Playwright code, pseudocode test bodies, or agent-runtime configuration.

## Completion checklist

Before declaring the plan complete, confirm that:

- The user confirmed the scope preview, explicitly waived confirmation, or supplied an already-approved concrete scenario list.
- Scenario analysis remained proportional to the requirement and did not add a separate exhaustive inventory exercise.
- The scenarios found during normal analysis were presented as Core and Optional before Playwright exploration or file creation.
- The plan contains every confirmed Core scenario, contains only approved Optional scenarios, and stays within the confirmed change or feature scope.
- The selected requirement source and its reference are recorded, and source-specific materials were read when needed.
- Feature scope, user-visible acceptance criteria, affected journeys, constraints, and out-of-scope behavior were extracted.
- Each finalized step reflects a journey explored on the real page with `npx playwright cli`.
- Preconditions make scenarios independent and order-agnostic.
- Happy paths, meaningful boundaries, validation, and error handling are covered where relevant.
- Targets and locator assumptions were verified; no page structure was guessed.
- Expected results are observable, specific, and tied to acceptance criteria.
- Coverage gaps, inaccessible states, ambiguities, and non-E2E criteria are explicit.
- The Markdown file is saved at the requested path, or at `tests/plans/<feature-or-change-name>.md` by default.
- No Playwright test code or tool-specific agent configuration was generated.
