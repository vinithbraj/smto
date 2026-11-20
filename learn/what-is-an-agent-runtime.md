## A reply and an action are different things

Ask a chat model what a command does, and it can explain the command. Ask it to read a file on your computer, and something must actually perform the read. That's the distinction an agent runtime addresses: it connects a model's proposed actions to tools that can carry them out.

SMTO is an agent runtime. It keeps the task organized while a compatible model decides which step to attempt next. The public SMTO website is only for information and downloads; tasks run in your own SMTO controller.

## What the runtime is responsible for

A tool request isn't permission to act. Before a file is read or a command is run, the runtime checks the available tool, selected execution target, and applicable access rules. It records the tool's response, including errors, so the next model decision can be based on what happened rather than what was supposed to happen.

A task might also need a response from you, an operation that runs for a while, or another action after the first result. The runtime keeps track of those conditions beyond the assistant's chat text.

## A small example

You ask for three main points from a text file. The model chooses a read tool; the selected computer returns the contents or an error; the model writes a summary from that observation. If the file could not be read, a plausible summary would still be an unreliable result. The activity history is where you can confirm whether a read actually happened.

## Where to go next

To understand the exact division of responsibilities, read [AI model vs. task runtime](https://vinithbraj.github.io/smto/learn/model-server-vs-agent-runtime/). For a task you can try with a file you own, follow [your first SMTO task](https://vinithbraj.github.io/smto/learn/from-chat-to-tasks/). If you are setting up the software, use the [installation reference](https://vinithbraj.github.io/smto/docs/getting-started/install/).
