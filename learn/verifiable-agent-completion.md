## "Done" can mean several different things

A command can finish successfully while the overall request is still incomplete. An AI can write a convincing summary of a file it never managed to open. A background job can start and remain unfinished. These situations all look different in the task records, even when a final chat message sounds confident.

When the result matters, separate **the action**, **the returned evidence**, and **the goal you asked for**.

## A simple review checklist

1. **Was the right operation attempted?** Check the tool name, target computer, and requested parameters.
2. **Did it return usable evidence?** A result may be incomplete, denied, timed out, or ambiguous after an interruption.
3. **Does the output match your request?** Open the generated file, inspect the changed service, or compare claims against the source material.
4. **Is anything still waiting?** Approval requests and background jobs can remain pending after another part of a task has ended.

For research, follow the cited material to the original page. A search preview is not proof that the underlying page was read or that its contents support the answer. Optional Web Research tools and the separate Browser tool require their own available setup and access; being able to search is not the same as being able to open any site.

## What the runtime can check

SMTO saves operation records and can check required results and outstanding work where supported. The optional Task Contract feature describes what the task is meant to achieve. It is not an independent proof that the requested outcome occurred. The model still judges much of the result, and its judgment may be wrong.

## Use the activity record as evidence, not decoration

If the file was never read, correct the access problem first. If a write succeeded on a different computer, inspect that target instead of assuming the file appeared on yours. If the status is uncertain, verify actual state before repeating a change.

For the operational details, consult [reading task activity](https://vinithbraj.github.io/smto/docs/operations/activity/). For interruptions and saved jobs, see [what happens when a task takes longer](https://vinithbraj.github.io/smto/learn/durable-execution-for-ai-agents/).
