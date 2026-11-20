## Two pieces of software, two jobs

An AI model produces responses and can propose tool calls. A model server, or compatible online provider, runs that model and exposes an address SMTO can connect to. That address is often called a model endpoint.

SMTO does not bundle model weights. Its inference-enabled Linux controller can
install or register a runtime, launch your chosen model, and manage its process
through **Inference**. It can also connect to an external model service; the
external-only controller uses those connections exclusively. In either case,
the model endpoint supplies decisions while SMTO presents tools, checks permissions,
dispatches allowed actions, and preserves results and task progress.

| Part | Main responsibility |
| --- | --- |
| Model endpoint | Runs the model and returns its output or proposed tool actions. |
| SMTO controller | Manages tasks, access checks, results, waiting, and saved progress; inference-enabled Linux installations also manage model engines. |
| Gateway or other execution route | Performs allowed actions on the selected computer or connected service. |

## Follow the boundary through one action

Imagine a model requests the contents of a file. The model has **requested** a read; it has not completed one. SMTO validates and routes the operation. A tool attempts the read and returns contents, an error, or another meaningful status. SMTO records the outcome and sends relevant information back to the model.

This separation matters when something goes wrong. A model may produce fluent text even after a tool failure. The runtime's saved observation lets you inspect whether the requested action succeeded.

## Compatible does not mean equally capable

A model endpoint must speak a supported request/response format. Even then, models differ in tool use, reasoning, and how they handle longer tasks. Changing the model does not automatically solve a missing tool or a blocked permission. Conversely, changing a Gateway will not improve a model's interpretation of a difficult document.

Start with [AI model settings](https://vinithbraj.github.io/smto/docs/configuration/models/). To understand which computer receives a tool call, see [one controller, multiple computers](https://vinithbraj.github.io/smto/learn/model-and-gateway/).
