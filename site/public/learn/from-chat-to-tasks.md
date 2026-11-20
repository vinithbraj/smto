## Pick something small and harmless

Start with a text file you can read yourself and that contains nothing private. Put a few short notes in it. The first goal isn't an impressive demonstration; it's a task whose result you can inspect without trusting the model's word for it.

Before trying the exercise, [install SMTO](https://vinithbraj.github.io/smto/docs/getting-started/install/) and configure a supported [AI model endpoint](https://vinithbraj.github.io/smto/docs/configuration/models/). Make sure a Gateway or another supported execution route can read the file where it actually lives.

## Make the request testable

Try this instruction:

> Read the text file I selected and list its three main points. Do not change the original file. If you cannot read it, tell me what prevented the read.

Choose the correct computer for the file. The assistant needs a relevant file-reading tool and sufficient access. If an approval request appears, confirm what it asks to read and which target it will use.

## Follow the observation

Look for the read operation in the activity history. A successful tool result can support the summary. A missing file, denied permission, or failed connection needs to be resolved instead of replaced with a guess.

If the AI misunderstood a detail, point out the error and ask for a correction. A tool finishing successfully does not guarantee the summary is faithful to its contents.

## Check before attempting something larger

Compare the three main points with the file. Confirm the original was not changed. Then consider a second exercise that creates a *new* file, leaving the original alone. This adds a write operation you can verify separately.

When you're ready for longer or scheduled work, read [following tasks that take longer](https://vinithbraj.github.io/smto/docs/concepts/jobs/). For a deeper understanding of action/result cycles, see [inside the agent execution loop](https://vinithbraj.github.io/smto/learn/agent-execution-loop/).
