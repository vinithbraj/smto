## Start from source

This guide installs SMTO from source code, meaning the original project files
rather than a ready-made installer. You need Python 3.11 or newer, a copy of the
project supplied by the maintainer, and an AI model that works with SMTO. These steps
use a terminal, an app for entering commands. You may need help from someone with
technical experience.

For ready-made downloads, visit the
[release repository](https://github.com/vinithbraj/smto) and choose
the folder for your operating system. Follow the instructions supplied with those
files; the commands below apply to a source checkout. For compiled dependency setup,
status and repair, use the [compiled installation instructions](https://github.com/vinithbraj/smto/blob/main/build/README.md#first-start-and-storage).
The dependency flow guide explains
what happens internally and how interrupted setup resumes.

SMTO has a main program that manages tasks and a Gateway program that runs tools
on the computer you choose. The AI model runs in an engine process or online service.
On Linux, the controller can manage vLLM and llama.cpp through **Inference**.
Read the installer before running it, and use a computer you are allowed to manage.

The installer displays the License and EULA before it changes anything. It asks
you to accept the License, then to accept the EULA and proceed with installation.
Type `y` or `yes` at each prompt; uppercase answers also work. Pressing Enter without
an answer or entering anything else cancels. Read them without installing with
`./install.sh --show-license` and `./install.sh --show-eula`. Windows PowerShell
uses `-ShowLicense` and `-ShowEula` on its Gateway installer.

For unattended setup, supply both `--accept-license VERSION` and
`--accept-eula VERSION` using the versions displayed by that installer. PowerShell
uses `-AcceptLicense VERSION` and `-AcceptEula VERSION`. `--non-interactive`
(`-NonInteractive` in PowerShell) disables prompting but does not accept the terms.
Piped answers and `--yes` cannot accept them. Each install, upgrade or repair
requires acceptance; the main installer shares it with its local Gateway setup
only during that invocation. Installer acceptance is separate from the product's
first-use EULA acceptance.

On Linux and macOS, installation shows
the current step, a spinner with elapsed time, and a completion or failure message.
Redirected output uses plain status lines. Password prompts remain visible and
pause progress animation. Add `--verbose` for full command output, for example
`./install.sh --verbose`. The Windows PowerShell installer uses `-Verbose`.

Source installers compile the prompt catalog before installing runtime packages.
You do not need to run the prompt compiler separately after updating the source.
If compilation fails, installation stops before changing runtime packages; inspect
the reported log, correct the prompt sources, and rerun the installer. Wheel,
source-archive and compiled binary builds generate and validate the catalog in
their staging directories without changing the checkout.


### Install on Linux

Open a terminal in the project folder. Run the installer:

```bash
./install.sh
```

Start the Gateway, which runs tools on this computer:

```bash
./src/gateway_agent/startup.sh
```

In another terminal in the project folder, start the main SMTO program:

```bash
./startup.sh
```

Each Gateway start prints **Gateway connection details**: its host/IP, port,
HTTPS URL, node name, and public key fingerprint. Copy these fields into
**Settings > Gateways > Add Gateway** on the server and choose a nickname.
The output identifies local-only listeners and explains how to enable connections
from another computer. Outbound Gateways show their server destination and node
instead, since they do not open an inbound listener.

Each server start prints **Server connection details**, including browser URLs
with the active HTTP or HTTPS scheme and port. For wildcard listeners, the output
lists local interface addresses as well as a URL for the same computer. These
sections also appear in redirected startup logs and on subsequent restarts.

Linux source installation includes inference management automatically; no extra
enable flag is needed. Use `./install.sh --launch` to install and immediately start
the controller instead. Open **Inference** at `/inference` to configure a runtime,
model and instance, then explicitly launch it. Installation does not download or
launch a model, or adopt an existing standalone portal.

For compiled Linux x86_64 installations, select `smto-server-inference` for
integrated management or `smto-server-external` for external endpoints. The compiled
builder's `--inference=both|enabled|disabled` selects the artifacts; Linux server
builds default to `both`. That option belongs to `./build/build`, not `install.sh`.
A runtime setting cannot add inference to an external-only binary. See
[Inference management](https://vinithbraj.github.io/smto/docs/configuration/inference/) for the complete setup workflow.

### Install on macOS

Use the same installer and main startup command. For the Gateway, use
`./src/gateway_macos/startup.sh` instead of the Linux command.

To use a Mac only as a computer that runs tools, use
`./src/gateway_macos/install.sh` and `./src/gateway_macos/startup.sh`.
This installs the Gateway and its required software without installing the main
SMTO program. It also attempts to set up optional tools such as Browser.

### Use a Windows computer to run tools

The Windows Gateway uses `src/gateway_windows/install.ps1` and
`src/gateway_windows/startup.ps1` in PowerShell. These set up the computer that
runs tools; they are not instructions for installing the main SMTO program on Windows.

### Set up portal sign-in

The Server installer asks you to create a local owner account and preserves an
existing valid account. Follow Portal owner sign-in below
for private password-file input, local setup/reset commands and password changes.
Gateway-only installation uses its separate pairing workflow.

### Enable HTTPS and browser trust

Open **Settings → HTTPS & Certificates** and enter the hostnames and IP addresses
used to reach this server. Choose **Install trusted root certificate** to prepare
its persistent root CA before switching to HTTPS. Preparation does not restart
anything. Compare the displayed SHA-256 fingerprint before trusting the root.

Under **Generate a local HTTPS certificate**, use **IPv4 range → Add range** to
fill the IP address list. For example, `192.168.1.x` adds every address from
`192.168.1.0` through `192.168.1.255`, including `.0` and `.255`. Trailing `X` or
`*` also works, and you can use any IPv4 prefix. Existing entries are preserved
and duplicates removed. The list supports up to 1,024 IP addresses. Broader
patterns such as `192.168.x.x` contain 65,536 addresses and must be narrowed.
Certificates require individual IP addresses, so the helper expands the pattern
before submission. Adding a range only edits the form; choose **Generate & Apply**
when ready to save the certificate and restart web services.

On a local desktop server, **Install on this computer** installs system-wide trust
using the operating system's administrator prompt. For a remote server, container,
WSL instance, or system service, download the bundle for the device running your
browser. Open that bundle on the browser's device and follow its instructions;
smTO and Python are not needed there. A download is not an installed certificate.

Windows and macOS use their system certificate stores. Linux uses its distribution's
trust tools and also imports the certificate into the invoking user's Chromium and
Firefox databases. Read each installation result: a locked browser profile or missing
NSS utility can require closing the browser, installing the named utility, or importing
the public root through the browser's certificate settings. New profiles and other
users may need a separate import. Restart browsers after installing trust.

On Android, download the root and import it as a **CA certificate** in the device's
security settings. On iOS/iPadOS, install the downloaded profile in **General → VPN &
Device Management**, then enable **Full Trust** in **General → About → Certificate
Trust Settings**. Managed devices may restrict these actions.

After installing trust, choose **Apply trusted certificate & restart**. The server
saves active work and restarts the application, console, and bundled manual using
HTTPS. Existing application-generated self-signed certificates are reissued under
the root while preserving their hostnames and compatible key. Uploaded certificates
remain unchanged by trust setup. New certificates default to 365 days, with a maximum
of 825; migration previews 365 days for an older certificate configured above that
limit. The root lasts ten years and survives certificate regeneration and upgrades.

Root trust fixes an unknown issuer only for certificates signed by that root. The
address in your browser must also match a DNS name or IP address on the certificate,
and the certificate must be valid. Settings identifies address mismatches. Installing
trust never disables certificate verification, changes the active protocol, or restarts
web services. Cancelled authorization or partial installation can be retried.

### Open SMTO and connect your AI

After the main program starts, open its `/agent-ui` page in a browser. With the
default setup on the same computer, the address is `http://127.0.0.1:8011/agent-ui`.
While saved data loads, an initialization page shows the current stage and elapsed
time. It opens the requested page automatically when the program is ready.

If startup fails, the page says **SMTO couldn't start** and explains in plain words what
went wrong and how to fix it. **Technical details** shows the exact error, with passwords,
tokens and keys removed, and **Copy error details** copies it for whoever helps you. When
SMTO recognizes a problem it can repair safely, a **SMTO can fix this for you** box offers
**Auto Fix**. For example, it can stop another copy of SMTO that is using the same data (that
copy saves its work first), or give your account back access to a data folder it owns. After
you fix a cause yourself, select **Start again**. Only an admin account can use Auto Fix and
Start again. Refreshing the page does not retry startup.

Requesting `/restart` switches the workspace to the same progress screen for shutdown.
A flashing red indicator shows that shutdown is underway; normal workspace controls
remain unavailable. Expand the phases to see service stops, pending operations,
repository saves, validation, durable publication, and elapsed timings. Remaining-time
estimates use measured progress or previous shutdowns when available. The screen then
shows startup and returns to your original page when the new process is ready. If the
final save fails, the screen explains the failure and offers **Retry restart** while
keeping the workspace locked.

`/shutdown` stops the server and every enabled Gateway; `/shutdownserver` stops only the
server and leaves Gateways running. Both are administrator commands. The same progress
screen shows the final save, then **Server stopped** once the save is confirmed and the
server, manual and troubleshooting console have exited. Nothing restarts on its own: start
SMTO again on the host (installed services stay stopped until started). The open page
checks periodically and returns to the workspace when the server is back. If the final save
fails, the server keeps running with its data in memory and the screen offers **Retry
shutdown**. A Gateway that is running a Gateway-managed LLM refuses to shut down; stop the
model first.

In Mission Control, choose the Gateway and configure your model connection.
With integrated inference, launch an instance and select **Use this connection**
in **Inference → Overview**. For external models, enter the connection details in
Model Configuration. Select the model before asking the assistant to do work.

The main program uses port 8011 and the Gateway uses 8787 by default. A port is the
number in a network address that identifies a service. The startup script also opens
the manual on port 8013 and a troubleshooting console on port 8015. They close when
the main startup script exits. The Gateway and external AI services have their own
start and stop commands. Managed inference instances use the **Inference** controls;
inference subsystem restart/shutdown keeps the controller UI available.

For a direct Uvicorn launch from the project folder, use:

```bash
.venv/bin/python -m uvicorn --app-dir src smto_runtime.server:create_app --factory --host 127.0.0.1 --port 8011 --timeout-graceful-shutdown 5
```

Service monitors can use `/livez` to check that the web server is responding and
`/healthz` to check runtime readiness. `/healthz` and runtime APIs return HTTP 503
during initialization or after initialization failure; `/api/startup` reports the
stage and status without reading the database. Detailed startup diagnostics require
portal sign-in. Anonymous health probes receive only the availability result and
its HTTP status, rather than startup errors or runtime identifiers. The eager
`agent_runtime.api.app:create_app` factory remains available for embedded callers.

While saved data loads, the browser shows **Preparing your workspace**, the current
startup step, and elapsed time. The page uses the app’s shared theme and cube mark;
it follows your tab’s light/dark override, or your device theme until saved settings
are available. The progress animation respects reduced-motion preferences. Leave
the page open: it reconnects automatically and opens your original page, including
any conversation link, when startup finishes. If startup fails, it shows the failed
step and recovery instructions instead of continuing the loading animation.

Expand the report to inspect measured phases and work counts. An unknown total or
missing remaining-time estimate is left unknown; it does not mean progress has
stopped. `/diagnostics/startup` retains this process's startup report after it is
ready. See Server lifecycle ownership for
the implementation boundaries, history limits and shutdown guarantees.

For advanced setup, `AOR_MANUAL_AUTOSTART=0` and `AOR_CONSOLE_AUTOSTART=0` turn off
those automatic starts. `./startmanual.sh` starts the manual separately. Do not start
a second copy on a port already in use. Availability of ready-made downloads is
listed separately on the website's Download page.
