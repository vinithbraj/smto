# Integration execution API

Use this API when another program needs to submit an Agent request and read a JSON
result. It delegates to the same Controller request and continuation services used
by the product. Normal access, accepted terms, tool selection and execution policy
still apply. The API does not create a separate executor or permission bypass.

The running service's `/docs` and `/openapi.json` describe the exact schemas. This
guide explains the request lifecycle and the fields clients must interpret.

## Submit a request

Send `POST /api/agent/integrations/execute` with a JSON body such as:

```json
{
  "prompt": "Describe the task status.",
  "agent_mode": "agent",
  "timeout_seconds": 0
}
```

| Field | Meaning |
| --- | --- |
| `prompt` | Required text, 1–24,000 characters. |
| `agent_mode` | Defaults to `agent`. The API also retains `conversation` and `advisory` compatibility values; the UI's Plan selection is not an `agent_mode` enum value. |
| `conversation_id` | Optional existing conversation identity, up to 160 characters. Normal conversation admission still applies. |
| `context` | Optional context object passed through the ordinary request boundary. It is not a grant of execution authority. |
| `behavior_effort` | Optional `low`, `medium`, `high`, `extra_high` or `ultra`; the existing behavior policy resolves it. |
| `timeout_seconds` | Response wait after submission, from 0 to 1,800 seconds; default 120. It is not an execution deadline or an end-to-end HTTP timeout. |

The Controller owns model routing. Configure models through
[Model Configuration](https://vinithbraj.github.io/smto/docs/configuration/models/); per-request model, endpoint,
credential and reserved generation overrides are rejected at the public boundary.
Capability selection and execution permissions remain with their existing owners.

## Interpret the response

Save `request_id` from every submission or continuation. The response includes a
`trace_url`, a possibly empty `conversation_id`, body `status`, final text/error
fields and any available output, display, progress, metrics or action information.

| HTTP response | Meaning |
| --- | --- |
| `200` from execute/confirm/clarify | The wait reached a completed, failed, cancelled or awaiting-input state. Inspect the body; 200 does not mean the task succeeded. |
| `202` from execute/confirm/clarify | The wait expired. The current snapshot is returned and execution remains owned by the Controller. |
| `200` from result lookup | A current snapshot was found. It may still be `running`. |
| `404` | The requested trace is not available in retained history, including if it disappears during a wait. |
| `422` | The submitted body failed schema/public-input validation. |

The body status is one of `running`, `completed`, `failed`, `cancelled`,
`awaiting_confirmation` or `awaiting_clarification`. Internal nonterminal states
are represented as `running`; this envelope is not a detailed scheduler-state API.
A pending confirmation or clarification flag can keep an otherwise completed trace
in an awaiting-input state. When present, `needs_action` carries the corresponding
actions or question details.

Read current state with `GET /api/agent/integrations/results/{request_id}`. This GET
returns immediately; it neither restarts work nor follows a newer continuation for
you. A wait timeout also does not cancel the task. Clients should accommodate normal
submission time in addition to their chosen response-wait interval.

Unavailable request handlers return `503`; a submission/continuation that fails to
return a request identity produces `500`. Ordinary admission or continuation errors
can also propagate from the existing request service.

## Continue a request that needs input

For a confirmation, send
`POST /api/agent/integrations/confirm/{request_id}` with an explicit decision:

```json
{"action": "approve", "timeout_seconds": 120}
```

Use `"action": "deny"` to reject it. The schema defaults omitted `action` to
`approve`, so clients should always send the intended action. Denial returns a
`cancelled` envelope for the original request immediately. Approval uses the
existing confirmation service and waits on the request identity it returns.

For a clarification, send
`POST /api/agent/integrations/clarify/{request_id}`:

```json
{"answer": "Read only", "timeout_seconds": 120}
```

The answer is required. Optional `selected_option_id`, `parameter_choice_id`,
`parameter_key`, `parameter_field` and `persist_for_event` fields support the
existing question/parameter-choice workflow. Use the choices offered by that
workflow; the continuation owner validates them. Both continuation payloads also
accept a `context` object.

**Use the returned request ID for subsequent reads.** Approval and clarification
can create a child request, and the original result URL does not automatically
track it. Retain the original ID as well when correlating the full interaction.

## Outputs, retention and retries

`final_response` and `error` are response text; optional `error_detail` carries
structured diagnostics. `outputs` projects raw payloads still present on the trace,
with `data_ref`, source operation identity, type, command diagnostics, preview,
metadata and a `full_payload_available` flag when supplied by the producer.

The adapter uses a diagnostics object in preference to a preview object for command
fields. It normalizes and limits stdout, stderr and error previews to a 12,000-character
prefix plus a truncation marker. Structured `output`, `preview` and `metadata` are
not subjected to that text limit. They retain the source representation; the
integration adapter adds no independent credential-redaction pass.

An empty `outputs` list is not proof that no tool ran. Raw provider payloads are not
part of the durable trace journal, and available previews can differ after recovery
or retention. Use the reported status, evidence references and existing artifact
interfaces for the result you need; this response is not a complete durable transcript.

The execute payload has no idempotency-key field. If a reply is lost, use the known
request ID to inspect the original work before submitting again. A missing reply
or missing retained trace does not prove an external change did not happen.

## Older database requests

The historical `POST /api/agent/sql/query` route remains available. It invokes a
registered Database tool directly through the execution engine and returns that
tool's execution result, rather than the integration response envelope above.

Its required `parameter_key` identifies the saved database profile. `operation`
defaults to `execute` and accepts only:

- `execute`: call `database.execute`, forwarding `sql` and `refresh_schema`.
- `discover_schema`: call `database.discover_schema`, forwarding `refresh_schema`.

Other operation values receive HTTP 422. Optional `instruction` supplies prompt
context, and the compatibility `approval_mode` defaults to `manual`; execution-engine
checks remain authoritative. This route has no integration response-wait field.
See [Parameter Store and databases](https://manual.smtorch.com/manual#doc=parameter-store-context-sql) for profile setup.

Implementation owners are
[IntegrationRoutes](https://github.com/vinithbraj/smto/blob/main/src/agent_runtime/api/agent_ui_support/route_groups/integrations.py),
[request/response models](https://github.com/vinithbraj/smto/blob/main/src/agent_runtime/api/agent_ui_support/models.py) and
[the retained SQL route](https://github.com/vinithbraj/smto/blob/main/src/agent_runtime/api/app.py). The
[request lifecycle](https://manual.smtorch.com/manual#doc=architecture-request-lifecycle) explains ordinary admission
and continuation ownership.
