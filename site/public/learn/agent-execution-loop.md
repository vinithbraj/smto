## The result of one action informs the next

An agent loop is the repeating part of a task: decide on a useful action, try it through an allowed tool, inspect what happened, and decide whether more work is needed. The model supplies the decisions. SMTO manages execution and records what the tools report.

A simple example is extracting action items from a notes file. The model might request a read, then a write. It needs the file contents—or a meaningful error—before it can make an informed next decision.

## Eight conceptual checkpoints

1. **Accept the request.** SMTO records the task and accepted settings.
2. **Choose an action.** The model requests a tool or produces another kind of next step.
3. **Check access.** SMTO validates the action and its available capability and permission requirements.
4. **Execute.** The selected Gateway, controller tool, or connected service attempts the action.
5. **Record the observation.** The outcome may be success, a failure, or an uncertain result.
6. **Return useful information.** SMTO supplies relevant result details to the model.
7. **Decide again.** The model can request more work, ask for input, or propose an answer.
8. **Check the stopping conditions.** SMTO examines required results and outstanding work where supported before the task finishes.

This is a conceptual lifecycle, not a promise that every task runs eight separate processes or completes successfully.

## Pausing is not the same as failing

A task that needs your approval can wait for your answer. A supported long-running tool can become a background job. Neither situation means the model should keep inventing new steps until a real result arrives.

If the task is interrupted after a potentially non-idempotent action, SMTO may need to inspect the saved records and real state before proceeding. A missing reply does not prove an action was never performed.

## Completion still deserves inspection

The last message is not the whole audit trail. Compare the promised output with the actual artifact, and use the [activity records reference](https://vinithbraj.github.io/smto/docs/operations/activity/) to understand the execution history. For a shorter practical walkthrough, see [how SMTO works](https://vinithbraj.github.io/smto/how-it-works/).
