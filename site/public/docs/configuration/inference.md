## Which installation includes inference?

Linux source installations include inference management automatically:

```bash
./install.sh --launch
```

Run this from the project folder. `--launch` starts the controller after setup.
To install without starting it, use `./install.sh`, then `./startup.sh` when ready.
There is no inference enable flag on `install.sh`. Installation prepares management
dependencies; you still choose your runtime, model and launch settings.

For compiled Linux x86_64 controllers, the build selects the feature:

| Build option | Result |
| --- | --- |
| `--inference=both` | Both controller artifacts; the default for Linux server builds. |
| `--inference=enabled` | `smto-server-inference`, including managed inference and external connections. |
| `--inference=disabled` | `smto-server-external`, using externally configured model endpoints. |

From the repository root, for example:

```bash
./build/build --component server --inference=both
```

These are options for the compiled builder, not the installer or startup command.
The feature is immutable in a compiled artifact. An external-only binary has no
inference management UI, API, tools, workers or state; a runtime setting cannot add
them. Existing external endpoint and controller prompt-caching settings remain
available. Gateway builds are unchanged. Non-Linux controllers and packages from
the older builders use external endpoints.


## Find the controls

Use the magnifying glass or **Ctrl+F / ⌘F** to open the shared search popup.
It filters workflow navigation and highlights matching text on the current page.
**Escape** closes search and restores all tabs. Tab links can be bookmarked, for
example `/inference#models` or `/inference#runtimes`.

| Tab | What you can do |
| --- | --- |
| Overview | Check health, resources, recent operations and agent/helper connections. |
| Hosts & GPUs | Manage local/remote hosts, watch live NVIDIA-SMI output, inspect hardware and reservations, and review placement. |
| Storage & Preferences | Set storage paths, scanning/log retention and credentials; start, restart or shut down inference management. |
| Environments & Builds | Register and inspect existing environments/binaries, install managed vLLM, build llama.cpp and remove runtimes. |
| Models | Configure roots, scan files, inspect metadata/context, and select or download Hugging Face repository revisions and files. |
| Caching | Inspect engine cache configuration/evidence and edit controller prompt-caching settings. |
| Jobs & Logs | Follow installations, builds, downloads and diagnostics; cancel, retry where supported, and export logs. |
| Instances | Find instances across both backends, open details, configure, validate, start and stop. |

The sidebar groups setup before operation, with **Instances** last. Storage &
Preferences keeps its existing `#preferences` bookmark.

Each **Hosts & GPUs** section can be collapsed independently. Monitoring panels
start collapsed; open them to view live readings. Collapsing a panel pauses its
display updates, while an explicitly started timeline capture continues.

**Hosts & GPUs → GPU power limits** lists NVIDIA GPUs in a compact table on the
selected **Power host**, with current limits, saved targets and status. Expand a
GPU row to see its slider, supported range, default limit and UUID. Drag to choose
watts, then select **Apply**. Collapsing a row preserves unapplied slider edits.
A saved target does not mean the change succeeded.
Limits affect all work on that physical GPU, including already-running instances.

If the host requires sudo, expand **Sudo password** and save the password for the
OS account running its portal. **Update password** replaces it and retries saved
limits. Passwords are kept in that host's private server-side secrets store and
are never returned to the browser. Remote hosts need the updated standalone portal.
Each host remembers targets by GPU UUID and attempts restoration in the background
when its portal starts. Failed restoration shows a warning; it never prevents the
controller or inference instances from starting. Use **Apply** to retry.

This feature uses only `nvidia-smi`; missing drivers/tools and unsupported devices
show an error. Existing installed portals need a service update/reinstall to remove
`NoNewPrivileges=true` so sudo can run. Custom service definitions must also permit
elevation, and the portal's OS account must be allowed to use sudo. The portal still
runs as its normal user; no extra service or GPU driver is installed.

**Hosts & GPUs → Live NVIDIA-SMI** shows the selected host’s GPU utilization,
memory, temperature, power and process table. It refreshes every two seconds
while the pane is open and the browser tab is visible. Use **Pause** to inspect
a sample, **Refresh output** for a single update, or the copy icon to copy the
table. The most recent sample replaces the previous one; it is not saved as a
log. Remote hosts need an updated standalone portal with live GPU output support.
Missing NVIDIA-SMI, driver errors and connection failures appear in the pane.
This read-only view does not launch inference or change GPU settings.

**Server resources**, directly below NVIDIA-SMI, has **llama.cpp** and **vLLM**
tabs for the same **Trace host**. Each shows the combined system RAM and CPU used
by that host’s portal-managed servers and workers, including RPC and Ray workers.
CPU is normalized to the entire host: 100% means all logical CPUs are busy.
RAM uses proportional resident memory (PSS) to apportion shared pages; when those
counters are unavailable, an explicitly labelled RSS estimate can count shared
memory more than once. Incomplete readings are marked unavailable rather than zero.

The two graphs retain up to ten minutes of samples in this browser page and
clear on reload. Both backends update every two seconds while the pane is open
and visible. **Pause resource monitoring** and **Refresh resources** operate
independently of NVIDIA-SMI. Use the arrow keys on a graph to inspect samples.
Collection gaps remain visible, and CPU shows **Collecting…** while establishing
its first baseline. This monitor also works on hosts without NVIDIA hardware.
Remote hosts need a portal version supporting the server-resources operation.

**Requests & GPU timeline** adds a correlated view below Server resources.
Choose a **Host**, then **Start monitoring**. The selected GPU's utilization and
fan setting use the percentage axis; temperature uses the °C axis. Shaded
intervals show SMTO model HTTP attempts, including retries and cancelled or failed
attempts. The capture can also include marked routing preflight failures that sent
no HTTP request; those carry no usage. Dense traffic is grouped visually. Choose an
instance and a 1, 5 (default), or 10 minute window to narrow the view.

Hover over the graph or use its arrow keys to inspect readings at the same time.
Select up to two requests to compare input/output tokens, reported cached tokens,
time to first output, provider prompt-processing time, and request duration.
Unsupported or missing measurements remain **Unknown**. Non-streaming responses
do not expose a first-output timestamp. Backend totals under the chart include
direct clients and overlap the SMTO requests; they are not additional calls.
Those counters retain their backend sampling interval and reset on a new launch.

GPU readings are device-wide, including unrelated workloads, and one-second
sampling can miss shorter spikes. Fan setting is the percentage reported by
NVIDIA, not measured RPM; some devices do not report it and some report more
than 100%. Remote readings carry an alignment uncertainty. Cached-token reports
provide evidence of prefix reuse; a quiet GPU or shorter request alone does not
establish a cache hit. Prompt-processing time and time to first output are
different measurements.

Monitoring continues while you navigate to Chat or Settings, with a shared
indicator and **Stop monitoring** button. **Pause chart** freezes inspection
without stopping collection; **Jump to live** catches up. Hidden views stop
rendering and fetching chart records. Changing hosts starts a fresh capture.
**Export JSON/CSV** exports the retained capture, including numerical usage and
timings but no prompt or response content. A live capture can change during export;
the export includes change and gap indicators. Stop monitoring first to freeze
the retained observations for export.

Captures are held in controller memory: the most recent ten minutes, at most
600 samples per GPU, 5,000 request records, and 8 MiB per session. Eviction and
collection gaps are explicit. A connected page renews the session every 15
seconds; collection expires after 120 seconds without renewal. Stopped captures
remain exportable for ten minutes. Controller restart ends these sessions.
Older remote portals show an upgrade message while available request observations
continue. Monitoring does not generate model requests or change cache settings.

**Instances** opens a compact list with search and status, backend and host
filters. Open an instance for **Overview**, **Configuration**, **Logs** and
**Diagnostics**. Returning to the list keeps its filters and scroll position.
Expand a list row to find Duplicate and Delete profile. In instance details,
these actions are in the **More** menu.

Configuration groups Basics, GPU & Context, Performance & Cache, and collapsed
Advanced controls. Runtime inspection supplies the option catalog. Advanced
controls preserve explicit options, imported aliases, environment variables, raw
argument ordering and custom templates. JSON edits are validated before saving
or leaving the editor. Save/Discard appears for configuration edits; saving never
restarts a process. Switching detail tabs retains the draft; leaving a dirty
instance asks whether to save, discard, or cancel. Diagnostics contains cache and
cancellation experiments; cancellation route configuration is under Basics.

For llama.cpp instances, **Configuration → Basics → Detect repeat** discourages
repeated text. It starts off for new instances, with **History length (tokens)**
set to **64**. Turning it on uses a repetition penalty of **1.1** over that window;
turning it off sets the penalty to **1.0** and retains the length. Save the profile,
then use **Apply / Restart** to apply the change. Saving alone does not restart it.
This is a generation setting, not a detector that stops repeated tool calls.
Existing custom values are preserved until edited. Raw arguments, environment
overrides and special history values remain editable in Advanced. If the selected
runtime does not advertise both options, the simple controls are unavailable;
use **Refresh runtime options** in Advanced to refresh its capabilities.


## First setup

1. In **Hosts & GPUs**, choose the local host or register a remote portal host.
2. In **Storage & Preferences**, choose storage locations, model roots and credentials.
3. In **Environments & Builds**, register and inspect an existing environment or
   llama-server binary, or create a managed runtime.
4. In **Models**,
   scan existing files or select a Hugging Face repository, revision and files to
   download. Select every required GGUF shard and any needed projector. Gated
   repositories require your authorized token.
5. In **Instances**, choose **New instance**. The four steps cover backend/host,
   runtime/model, GPU/context, and review/validation. Networking and advanced
   controls are optional disclosures. Links to missing prerequisites retain the
   draft during this session; return to Instances and choose **Resume setup**.
6. In **GPU & Context**, select eligible devices. **Always use recommended model weight split**
   defaults on for new and existing instances. It calculates and validates a split
   at every start, restart, and recovery. Pipeline mode may use fewer GPUs when the model fits.
   Manual split values are preserved while their controls are disabled. Switch it
   off to edit TP/PP, layer allocation, and GPU weight proportions, or to apply
   **Recommend split** once. GPU selection, context, headroom, split mode, and GPU
   offload settings stay editable. Changes apply on the next launch.
   With at least two GPUs, choose **Pipeline Parallelism** (current behavior) or
   **Tensor Parallelism**. Tensor uses every selected GPU on the serving host:
   vLLM uses equal tensor shards with one pipeline stage; llama.cpp offers
   recommended or manual tensor proportions. Its diagram shows GPUs sharing layers.
   Tensor's context, offload depth, proportions, and cache formats are saved separately,
   so switching back restores Pipeline settings. llama.cpp Tensor is experimental,
   requires Flash Attention and non-quantized KV cache, and disables native auto-fit.
   Incompatible advanced Pipeline values remain saved but inactive in Tensor.
   With one GPU the selector is disabled and single-GPU execution applies; the
   Tensor preference is remembered when a second GPU is selected. Explicit Tensor
   currently requires one host. The preview always shows the actual resolved mode.
7. Choose **Create profile**, or **Create & start**. With automatic splitting on,
   Create & start validates automatically; errors block launch. The preview and
   Validate controls remain available. With automatic splitting off, validate first.
   A saved profile can be started later from its list row or Overview. Follow
   loading in Logs and confirm readiness.
8. In **Overview → Agent & helper connections**, choose the ready instance and
   served model, then **Use this connection**. You do not need to copy its URL.
   Each button saves its own role; changes in the other form remain unsaved until
   you use that form's button. Changing the instance clears the previous model name.

For compatible llama.cpp runtimes, **GPU & Context → Auto-fit context to GPU memory**
lets llama.cpp choose context size at startup. It defaults off. Enabling it disables
the saved context controls without discarding their values; turning it off restores
them. Your K/V cache formats and GPU placement remain configured. **Advanced fitting
options** exposes the runtime's minimum context and GPU memory margin when supported.
The fitting margin is separate from headroom used for planning estimates. Save the
profile, then explicitly start or restart to apply changes. Context capacity and KV
estimates remain unknown until the runtime provides evidence of the chosen size.

Model downloads open **Jobs & Logs**, where each download shows a live progress bar,
percentage, downloaded/total size, current file and completed file count. Progress
includes resumed transfers and validated cached files across the selected model's
shards. Unknown totals use an indeterminate bar. **Finalizing download** means the
files have downloaded and the library is updating; **Download complete** confirms
both are finished. Failed or cancelled jobs retain their last reported progress.
Remote downloads report progress from the selected host's updated portal.


## Change a running instance

Saved configuration, the running launch snapshot and observed evidence describe
different things. Editing a profile does not change its process.

1. Edit the profile and choose **Save profile**.
2. Choose **Validate**, then **Review changes** to inspect the saved-versus-running
   difference, active requests and affected tasks.
3. Choose **Apply / Restart** and confirm the change.
4. Follow the operation in **Overview** and the instance logs.

The controller blocks new requests to the affected endpoint and queues a background
checkpoint. Launch proceeds without waiting for the checkpoint or active requests
to finish. Active requests are interrupted when workers stop. It verifies
readiness and model compatibility, refreshes bindings and invalidates stale
capability/cache/continuation evidence, then releases the operation's admission
hold. Waiting requests can recheck admission; this does not restart a cancelled
task or guarantee recovery of an interrupted request.

If the candidate fails, the controller attempts restoration of the previous
successful launch snapshot. The failed saved candidate and logs remain available
for correction. Failed restoration retains the endpoint hold while management
remains available. **Stop** takes precedence over a pending restart, and cancelled
tasks stay cancelled. Stop also works with invalid unsaved form edits.

**Force Stop**, next to **Stop**, immediately kills the selected instance's owned
worker processes, including worker descendants on its participating hosts. It
skips the graceful process shutdown period, and can escalate
a Stop that is already waiting. Active model requests are interrupted. Unsaved
profile edits are not applied. Cleanup verifies process exit before releasing
reservations; a failed or unreachable host remains reported as a cleanup failure.
The instance stays stopped until explicitly started again.

Once Stop or Force Stop finishes successfully, its model-capacity hold is released.
Deleting a task or conversation also cancels its model requests and releases their
capacity immediately; this does not wait for background history cleanup. Controller
restart discards old request reservations and inference holds without an unfinished
lifecycle operation. A failed worker cleanup remains visible in the operation's logs.

Concurrent manual and agent edits use revisions; a conflict requires refreshing
the saved state before applying another change. Duplicate lifecycle requests can
use the same idempotency key without starting another operation.


## Build a runtime

In **Environments & Builds**, select the host and managed llama.cpp build workflow.
Choose the source release or commit, installed/custom/managed CUDA toolkit, GPU
architecture and build preset. Opening the page only inspects local settings and
toolkits; it never contacts GitHub or NVIDIA's release catalog. Use **Check now
for releases** to fetch available versions. **Download & build** validates the
selected source and toolkit before starting compilation.

The CUDA toolkit defaults to **Automatic — latest supported CUDA** for custom
builds. It selects the newest published NVIDIA toolkit compatible with the host's
driver and GPU architectures that provides the required packages for its platform.
Starting the build resolves the selected version and pins it for retries.
Specific managed versions and installed toolkits remain selectable, and named
build presets retain their pinned CUDA versions. Package resolution uses the CUDA
capability reported by the NVIDIA driver, so an older system toolkit does not
prevent building a newer supported runtime.

**Jobs & Logs** preserves stage progress and output through download, configuration,
compilation and verification. A successful build registers the runtime; select it
in a profile and validate before launch. Cancellation and supported retries use
the existing job controls. Runtime removal provides a preview before removal.


## Investigate caching

In **Caching**, choose an instance to compare requested engine settings, its
running snapshot, finite RAM reservations and observed cache evidence.
Unknown or unsupported evidence is not a cache hit. Controls shown in multiple
views edit the same backend values; save and explicitly restart to apply them.

For llama.cpp, **RAM prompt-cache budget** offers Backend default, Off, 8/16/24/32
GiB, or a custom integer MiB value. A positive budget enables prompt reuse;
**Retain idle contexts** controls whether idle contexts are saved into that cache.
The preview shows the actual cache launch arguments, including `--cache-ram N`.
GPU KV offloading is separate and stays unchanged. Check memory fit before using
**Apply / Restart**. Saving only updates the profile; the running budget remains
visible until a new launch uses the saved arguments.

**Recent model calls** shows the latest 64 controller observations in a sortable,
filterable table. Expand a row for retries and configuration details. Unknown
telemetry is shown as an em dash, not zero. Auto-refresh is pausable, and retained
history clears on controller restart.

The controller prompt-caching editor is shared with **Settings → Prompt caching**.
Its switches default off and affect request construction and controller reuse.
Turning Prompt caching on here also enables the advertised `--cache-prompt`
(llama.cpp) or `--enable-prefix-caching` (vLLM) option in the saved profiles
connected to the agent or helpers. Connecting an instance while caching is on
prepares its flag too. Unsupported or offline runtimes are reported for correction.
Other profiles, external endpoints and cache RAM budgets stay unchanged.
Running instances require **Apply / Restart**; the toggle does not restart them.
Turning it off preserves backend options, which remain editable in each instance.
The Settings entry point shares the controller policy and keeps engine setup manual.

Reading status, opening a page or refreshing evidence does not submit inference.
Explicit diagnostics and comparisons can submit bounded test requests; use their
progress and cancellation controls. This integration does not add native cache
eviction, slot snapshots, or cache save/restore operations.


## State, shutdown and remote hosts

Fresh management state lives in `inference/` beside the controller's current-run
database, normally beneath `AOR_AGENT_STATE_DIR` (default `artifacts` for source
launches). The inference database, private secrets, jobs and rotating logs remain
the authoritative stores. Model roots, permanent installations and build-work
locations are configurable separately.

An existing standalone portal is not discovered, imported, adopted or removed.
A fresh controller state directory starts without its profiles or bindings.
There are no automatic model downloads or background tuning. The standalone
portal remains available for independent and remote hosts; its worker protocol
continues to handle leases, reservations, remote builds/downloads, Ray and RPC.

**Preferences → Restart inference** restarts management and restores requested
running profiles while keeping the controller UI available. **Shutdown inference**
stops its workers and jobs; use **Start inference** to start management again.
An intentional instance shutdown stays stopped. Controller shutdown also cleans up
owned workers and jobs; cleanup failures retain ownership for retry. Controller
startup recovers accepted operations and requested running profiles.
