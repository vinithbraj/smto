## Not every saved detail is in the next model request

A model receives a limited amount of information at a time. That material is its context: instructions, some conversation history, and relevant tool results. Longer tasks create more information than may fit in any one request. SMTO can retain records outside that immediate context and provide shorter or selected details when needed.

Saving a full tool result does not mean the model examined every line of it. A focused excerpt can be useful, but an omitted detail may still matter to the task.

## Conversation notes are a working notebook

SMTO can keep notes inside the current conversation. In technical settings this is called **Agent KV**. The assistant may write information it wants to reuse, such as a checked path or a reminder about the current task, and read it later. Notes can outlast a shortened chat history, but they are not automatically pasted into every model request.

## Memory crosses conversations

Memory tools are always available when you ask the Agent to read or remember information. Automatic memory lookup, injection, guidance and proactive learning are off by default. Add `@use_memory` to a request, or choose **Special actions → Use memory**, to enable automatic support for that task and its continuations. Each new task requires its own opt-in for automatic support.

The separate Memory feature can retain selected useful information for later conversations—perhaps a lasting preference, a correction, or a command that has been verified. Retrieval depends on relevance and the available memory tools. If you tell the assistant not to remember something, that instruction takes priority.

Do not use notes or Memory as a secret vault. Avoid passwords, API keys, unverified claims, or entire private chat histories. Information retrieved from Memory can be sent to the model provider in later requests.

## Fresh evidence beats old recollection

A command that worked last month may fail after an update. A saved note about a server doesn't prove that server is currently reachable. Use present-day tool results for conditions that can change.

To understand how the runtime retains work between steps, read [how smaller models benefit from task structure](https://vinithbraj.github.io/smto/learn/small-model-task-orchestration/). For a practical check of current results, see [when a task is actually finished](https://vinithbraj.github.io/smto/learn/verifiable-agent-completion/).
