## A tool being visible doesn't mean it can act

The assistant might know that a tool for reading files exists, but that alone grants no permission to read your files. SMTO groups related tools into Skills and makes relevant capabilities available to a task. A capability is a kind of work the tools can perform; authorization is a separate question.

## Five conditions worth separating

| Condition | Question to ask |
| --- | --- |
| Installed | Is the required tool present in this SMTO setup? |
| Selected | Is the tool relevant and available to this task? |
| Allowed | Does the task have permission to use it? |
| Approved | Has any approval required for this specific action been given? |
| Connected | Is the necessary computer, service, or account reachable? |

This table describes distinct conditions, not a required software check order. A read action and a write action may have different access rules. Some permitted operations need no additional approval; others need a decision from you.

## What happens if more access is needed?

A task may discover that its current capabilities are insufficient. The assistant can ask for another Skill or permission. You review the specific request; a permitted change can let the saved task proceed. It doesn't sign you into an unrelated account, grant access to every future action, or erase an existing restriction.

If an action is blocked, the assistant should not switch to an alternative route just to defeat that decision. An unavailable Gateway and a denied permission are different problems and need different fixes.

## Review the operation, not only the approval

Before accepting a request, check the intended action and target computer. Afterward, inspect the tool result: approval means the action was authorized, not necessarily that it succeeded. The [activity records reference](https://vinithbraj.github.io/smto/docs/operations/activity/) explains where to look; [privacy and permissions](https://vinithbraj.github.io/smto/security/) explains how these decisions affect data access.
