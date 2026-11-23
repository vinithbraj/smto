## One place to coordinate, distinct places to execute

The controller is the main SMTO service. It holds accepted task state and routes allowed actions. A compatible AI model endpoint provides model decisions. A Gateway is the component that runs machine-local tools on a selected computer. Those parts can share one machine or run on different computers.

A separate Gateway is not a second AI model. You can keep one controller connected to several configured Gateways and choose the right one for different tasks. This is useful when a file is on a workstation but another task needs software installed on a server.

## What stays specific to each computer

- **Files and paths.** A tool sees the target computer's filesystem, not every connected computer's files.
- **Tools and accounts.** Each target needs the relevant installed programs, credentials, and available services.
- **Permissions.** Selecting a different computer does not erase access checks.
- **Availability.** A saved target entry is not proof that the machine is currently online.

Selecting a Gateway is not automatic broadcasting, file synchronization, or failover. Some tools execute inside the controller or access online services rather than using a Gateway at all.

## Choose the model separately

Configure a supported local model endpoint or a compatible online provider. The model chooses actions; the controller manages their execution. Choosing a Gateway doesn't automatically switch the model, and changing general model settings should not silently rewrite settings for tasks that have already been accepted.

With an inference-enabled Linux controller, **Inference** manages vLLM and
llama.cpp runtimes and instances. Launch an instance and select **Use this
connection** for the agent or helper role. External-only controllers continue to
use separately configured endpoints. Model files and hardware remain your choice;
installation does not automatically download or launch a model.

If you use a remote provider, review the information included in model requests. Online tools may send additional data to their own services.

## Prepare for disconnected work

1. Install SMTO and the Gateway component where each is needed.
2. Prepare a compatible local model and download its required files.
3. Install the tools and software the planned tasks need.
4. Confirm the controller and execution targets can communicate on the chosen private network.
5. Disable internet access for a test and verify an actual small task.

Offline tasks must use local models, files, and resources already available. Web research, online model providers, and remote service integrations still need internet access. For exact setup, use the [installation guide](https://vinithbraj.github.io/smto/docs/getting-started/install/); for the data-boundary implications, read [what stays local](https://vinithbraj.github.io/smto/learn/local-first-ai-agents/).
