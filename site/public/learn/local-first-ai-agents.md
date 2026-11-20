## Local-first is a deployment choice, not a privacy slogan

You install the SMTO controller on a computer you control. It manages the task and stores progress there rather than requiring an SMTO-hosted cloud controller. That is useful when you want to decide which machines and connections are part of the workflow.

It does **not** mean that every task is automatically offline or that no information leaves your network. The model and the selected tools matter just as much as where the controller runs.

## Follow the data for one task

If you configure a local model, model requests go to the model service in your selected environment. If you configure a compatible online model provider, the provider receives information sent with the request, which can include instructions and relevant tool output.

A separate tool may contact an online service even when the AI model is local. Web research, for example, needs access to websites. Account integrations may use their providers' APIs. Treat the full task path—not just the controller's location—as the privacy boundary.

## Choose the operating mode deliberately

For tasks that must stay on a private network, prepare a local model, its files, the relevant Gateway, and the necessary tools ahead of time. Keep the required computers connected, then test the actual task with internet access disabled. A saved Gateway connection is not proof that a target is reachable.

For hybrid work, document which model endpoint and services you are comfortable using. Review the task's permissions before giving access to private files or accounts.

## A good next decision

If you're selecting hardware and execution targets, read [one controller, multiple computers](https://vinithbraj.github.io/smto/learn/model-and-gateway/). For more detail about authority and credentials, see [privacy and permissions](https://vinithbraj.github.io/smto/security/).
