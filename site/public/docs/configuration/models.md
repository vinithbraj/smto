# Model configuration and routing

## Assign Main and Helper

Assign **Main** and optional **Helper** in Inference or Settings → Model routing. Each role can use a different provider, model, context ceiling, API key and generation profile. Additional installed models and managed instance profiles remain available for later assignment.

An optional **Vision** connection in Settings → Model routing serves explicit OCR
and image-analysis calls. With Vision unassigned, those routes use Main. The active
endpoint must advertise image input; names alone do not establish capability. Each
Vision task uses its captured configuration and normal inference budget. See
[attachments and Vision](https://vinithbraj.github.io/smto/manual/#doc=attachments-vision&heading=configure-and-use-vision) for
authorized sources, dependency placement and coverage limits.

The composer follows the global configuration. Its thinking and output controls tune agent decisions without changing model assignments.

Each role has an **Auto-select model** toggle. When on, new requests use the first
model reported by that role's endpoint. Manual model entry and discovery controls
are disabled; the endpoint, API key and generation settings remain editable. Turn
Auto off to enter or discover a specific model, then use **Save Main** or
**Save Helper**. New configurations start with Auto on; saved model names keep it off.

Settings provides a destination and **Allow fallback to Main** for each supported call:

- Agent decisions and final answers: Main.
- Fresh agent recovery: Main.
- Task-contract compilation: Helper.
- Task-contract retries and corrections: Main.
- Automatic capability selection: Helper.
- Schedule drafting, monitor drafting, monitor judgments and parameter drafting: Helper.
- Vision OCR and visual understanding: Vision, or Main when Vision is unassigned.

With no Helper configured, Helper rows with fallback enabled use Main. Disable fallback when a call must use Helper. A missing or unavailable strict Helper produces an actionable error.

A configured Vision route can fall back once to Main on an eligible failure when
its fallback setting allows it. Main must also advertise image input. A failed
Vision connection followed by text-only Main retains the connection/capability
failure rather than implying that the attached image is missing. An unassigned
Vision role resolves to Main even when transport fallback is disabled.

Generation and context controls belong to each role. Provider Default omits optional provider parameters; Custom lets you configure them individually. Provider support is negotiated separately for each endpoint. Saving one role preserves the other role's saved configuration and draft edits. A concurrent edit reports a revision conflict instead of silently replacing newer settings.

**smTO Recommended** resolves a starting preset when you save the role. That saved
parameter map stays fixed for accepted work; changing a recommendation later does
not rewrite it. Unknown provider/model combinations use the common small-agent
preset, with unsupported optional fields handled by wire compatibility negotiation.
An explicit zero, false or empty list in Custom is a configured value, not the same
as leaving that parameter at Provider Default. Internal phases can impose their
own output and thinking policy on the selected role.

Saving Main or Helper refreshes model discovery for new requests, including when a
different model replaces the previous one at the same endpoint. With **Context
ceiling** left blank (**Auto**), new requests use the server's reported context capacity.

## Output limit and context space

The provider's output limit and smTO's internal output reservation serve different
purposes. Provider Default may omit an output limit from the request, while smTO
still reserves space for the answer when preparing input and conversation history.
An explicit completion-token limit (`max_completion_tokens`) becomes the execution
reservation. Increasing it leaves less room for input within the same context window.

If a request does not fit, inspect the selected model's context ceiling and output
settings together. A large output allowance does not increase the model's context
capacity. See [context and memory](https://vinithbraj.github.io/smto/manual/#doc=context-compaction-kv) for how
retained conversation material is projected into a request.

## Thinking effort and budget

Thinking On/Off, reasoning effort and a thinking-token budget are separate provider
controls. Their availability depends on the selected endpoint and model. An explicit
Thinking choice uses the model template's `enable_thinking` setting; reasoning effort
does not universally mean the same thing. Provider Default leaves optional choices
to the provider.

Task Contract compilation and recovery use their own saved thinking policies.
Changing normal execution settings does not replace those policies. See
[Task Contract thinking](https://vinithbraj.github.io/smto/manual/#doc=task-contract-compiler&heading=thinking-during-task-contract-generation)
for the compilation-specific controls.

**Force budget and stop thinking** is off by default. When enabled, the next normal
execution decision can send its numeric thinking target to a server whose control
support has been detected. A completion-token limit is required, and the target must
leave space for the answer. Unknown support produces an availability notice;
the setting does not establish support by itself. For llama.cpp, smTO checks
advertised capabilities or guarded zero-token validation requests, independently
of the server's build hash. Results refresh periodically at execution decisions.
Compiler and selection phases
keep their own policy.

With forcing off, an eligible llama.cpp stream can offer a live stop-thinking
control after it exceeds the soft target. That action addresses the current
completion while its response continues; it does not start a replacement task or
execute partial tool arguments. An acknowledgement is distinct from an observed
stop. Changing the global toggle affects the next decision, while an active
response and its output-limit continuations retain their policy.

The live button is labeled **Stop reasoning and act…**. While its request is pending,
it shows **Stopping reasoning…** and prevents duplicate clicks for that attempt.
An unavailable or replaced attempt removes the action. If the request fails and
the same attempt is still eligible, the page offers retry and explains that the
response is still running. The task's **Stop** control remains the way to stop the
task; the reasoning button requests a transition within the current response.

## Automatic budget increases

When normal execution rejects an incomplete model response because its output was
truncated, smTO can reserve a larger output allowance and retry the pending decision.
The default policy permits three consecutive increases of 1,000 output tokens each.
The rejected partial response is not executed. Cancellation, exhausted run budgets,
provider limits and insufficient context capacity can prevent an increase.

An unknown provider output limit cannot be guessed from usage counts. An explicit
limit reported by the provider can establish the starting allowance. A provider-
rejected increase restores the last usable allowance; the attempted increase remains
counted. Accepting a complete response resets the consecutive-increase counter while
retaining the effective output allowance for that conversation.

The thinking percentage is a soft target; it does not trigger this output-retry
mechanism. Internal model phases do not use these execution-only overrides.

## Tool-call repetition

Open **Settings → Setup → Model routing → Tool-call repetition** to configure
protection against unfinished tool calls that keep generating the same data.

- **Stop extreme tool-call repetition** is on by default.
- **Minimum repeated characters** defaults to 16,384; allowed range: 2,048–65,536.
- **Minimum repetitions** defaults to 8; allowed range: 4–32.

Both thresholds must be met across two consecutive checks. Higher values allow
larger repetitive payloads. Deliberately repeated data can also trigger the guard;
use compact code to generate it or adjust these controls for your workload.

Changes save automatically and apply at the next model call, including active
tasks and task-contract compilation. A response already in progress keeps its
settings. Turning this switch off preserves the threshold values and leaves
reasoning-loop and inactivity protection unchanged. The **Generation quality**
check must also be enforced for this guard to interrupt a response. Rejected
partial calls do not execute; the existing bounded recovery policy still applies.

## Accepted tasks and diagnostics

Accepted tasks keep their configuration while running, queued or paused. New prompts, follow-ups, scheduled runs and workflow runs use current settings. A failed Helper request may fall back once to Main before accepting a complete response; context is rebuilt using Main's limits. Cancellation and exhausted budgets prevent fallback. Fresh recovery can use another role; continuation of an unfinished response stays on its original model.

Saving routing settings does not require a controller restart. A later API-key
change applies to new work; an accepted task retains its captured credential
version. Removing Helper likewise does not rewrite a task's accepted snapshot.

Use **Check saved model** on a role's card to test that model directly. Diagnostics never fall back. Task traces and the Inference timeline display the actual model, call type, revision and fallback reason.

Task summaries, context compaction and tool execution remain local operations. They have no model-routing rows.

## Local AI runtimes

The optional **Local AI Runtimes** skill manages model servers on the selected
Gateway using accepted Parameter profiles. Starting one leaves model assignments
unchanged. Its explicit preview/activate/restore workflow can update Main through
revisioned routing for future work; accepted tasks retain their configuration.
See [Gateway Local AI runtimes](https://vinithbraj.github.io/smto/manual/#doc=architecture-gateway-local-ai) for setup,
provider limits, credential/reachability requirements and recovery. The controller's
[Inference area](https://vinithbraj.github.io/smto/docs/configuration/inference/) owns its separate installation and instance UI.
