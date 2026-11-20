## The browser isn't the task

Closing a browser tab and stopping the computer that runs SMTO are not the same event. After the controller has accepted a task, its progress is saved independently of that browser connection. The task can continue, wait for your input, or remain pending while another operation finishes.

The necessary computers and services must still be available. Saved state cannot make a powered-off Gateway execute a command, and a scheduled task cannot contact a model service that is unavailable.

## Three kinds of time away

- **Background job:** a supported long-running operation continues while SMTO tracks its status.
- **Waiting:** the task pauses until a question, approval, or expected result is resolved. SMTO need not repeatedly ask the AI to guess whether anything changed.
- **Schedule:** work is recorded to begin at a later time, subject to the same access and availability requirements as other tasks.

A job starting is not proof that it finished. A schedule being saved is not proof that its action ran. Check the current status and actual result.

## Why interruptions need care

Suppose a write tool saves a file, then its connection breaks before the reply reaches SMTO. The file may already exist. Blindly repeating the write could create an unwanted second change. SMTO uses available records to investigate interrupted work before a retry where supported. Some outcomes cannot be determined conclusively, and exactly-once execution is not guaranteed.

## What to inspect

Look for the last confirmed operation, any outstanding input, the selected computer, and the saved result. If the result is uncertain, verify the underlying file or service before asking for another write.

The practical reference is [following longer tasks](https://vinithbraj.github.io/smto/docs/concepts/jobs/). For the details behind the statuses, read [the agent execution loop](https://vinithbraj.github.io/smto/learn/agent-execution-loop/).
