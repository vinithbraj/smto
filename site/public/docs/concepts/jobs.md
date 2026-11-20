# Jobs, waits and resume

A **job** is an action that takes time, such as a long command running in the
background. SMTO keeps a record of the job so the assistant can follow it later.
You do not need to keep the browser open, but the computer running the work and
SMTO's main service must stay available for progress to continue.

A task can also **wait** for your answer, a tool result, a set time, or another
event. SMTO saves what it is waiting for and continues the task when that condition
is met. While waiting, it does not repeatedly ask the AI to make another decision.

Starting a job is not the same as finishing it. Check the completed result before
relying on the answer. After an interruption, SMTO checks the saved job and the
running program to find out whether work is still running, finished, or lost.
If an action may have changed something but no result was received, it needs to
be checked before being repeated. A cancellation stays tied to the job and task
that were allowed to run.

### Tool names for developers

These are the technical controls used by the assistant and integrations. You do
not need to type them to follow a task in the activity history.

- `background=true` starts a long command as a background job. Keep its job ID,
  which identifies that particular action.
- `inspect_execution` reads saved progress and status without contacting the computer
  doing the work.
- `manage_job` can check the computer for a fresh status, read a limited amount of
  output, cancel a job, check an unclear result, or wait for it.
- `wait_for_event` saves a wait for a time, monitor, schedule, or trusted service event.

The implementation is in `native/jobs.py` and `native/continuation.py`. Saved results
show what actually happened; a message saying a job started is not final output.
