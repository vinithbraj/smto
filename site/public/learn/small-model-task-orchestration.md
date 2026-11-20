## The name describes the design goal

SMTO stands for **Small Model Task Orchestration**. It was built with smaller models in mind, where context space and multi-step reasoning can become practical constraints. The idea isn't to pretend that software around a model can supply knowledge it doesn't have. It's to make the work more structured and easier to follow.

## Keep the useful part of a long task in view

An AI model reads a limited amount of information in each request. A long chat, a large file, and several complete tool outputs can fill that space. SMTO keeps task records outside the model's immediate context and can present a more focused view of a result when appropriate. The model may still need to request additional details.

This distinction is important: **a saved result is not the same thing as information the model has read**. A short excerpt can also leave out something significant. Review important outputs rather than assuming the context layer caught everything.

## Put relevant tools in front of the model

A task about a local text file does not need every available integration explained at once. SMTO can select tool descriptions relevant to the request, while access checks still decide which actions are permitted. If more capability is needed, the assistant can ask for it.

## Use structure, not wishful thinking

Try a small, verifiable task on the model you actually plan to use. Check whether it selected the right tool, interpreted the result, and produced the requested artifact. If it fails at reasoning about the content, a cleaner tool list may help with coordination but won't guarantee a correct answer. Larger compatible models can use the same structure; don't infer that model size alone determines success.

Next, read [context, notes, and memory](https://vinithbraj.github.io/smto/learn/context-and-memory/), or adjust your [model settings](https://vinithbraj.github.io/smto/docs/configuration/models/).
