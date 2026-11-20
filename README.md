# OpenFabric (smTO) — Releases

> **Small Model Task Orchestration** — self-contained, ready-to-run executables for the smTO runtime.

🌐 **Website:** https://vinithbraj.github.io/smto/ &nbsp;·&nbsp; 📘 **Manual:** https://vinithbraj.github.io/smto/manual/ &nbsp;·&nbsp; ⬇️ **Downloads:** [latest GitHub Release](https://github.com/vinithbraj/smto/releases/latest)

This repository is the release home of [OpenFabric](https://github.com/vinithbraj/openfabric) (also called **smTO** — *Simple Model Task Orchestrator*). The pre-built binaries are published as **[GitHub Releases](https://github.com/vinithbraj/smto/releases)**: instead of installing Python, building from source and configuring a virtual environment, you download one executable per component and run it. The repository itself holds the website ([`site/`](site/README.md)) and this guide.

- 🐧 **Linux x86_64** — four self-contained executables (two Server variants, the Gateway and the Inference Portal) plus `.deb` packages for Debian/Ubuntu. See [The Linux binaries](#-linux-binaries-explained).
- 🍎 **macOS x86_64** — the Server and the Gateway as zipped `.app` bundles.
- ✅ Every release attaches `SHA256SUMS` files, machine-readable build records and a build-details archive (software bill of materials, licenses and notices), so you can verify exactly what you downloaded.

> ⚠️ **Status:** product version **0.10.0**, **`dev`** channel, **unsigned** (macOS builds are not notarized), and artifact validation was **skipped** for the current build. These are the latest builds — good for trying SMTO, development and evaluation. Read [Status & caveats](#-status--caveats) before relying on them in production.

---

## 📦 Latest release

**[SMTO `1ce43f7d0f3b`](https://github.com/vinithbraj/smto/releases/latest)** — published 2026-11-19, built from openfabric commit [`1ce43f7`](https://github.com/vinithbraj/openfabric/commit/1ce43f7d0f3bba954b759dd67c3709b19ce9dbe2) (build `dev.1ce43f7d0f3b.20261119…`). Releases are named after the source commit they were built from.

| Platform | Asset | What it is | Size |
| --- | --- | --- | --- |
| Linux x86_64 | `smto-server-inference` | The Server **with** local inference management (vLLM / llama.cpp) | 147.9 MiB |
| Linux x86_64 | `smto-server-external` | The Server **without** local inference, for an external model provider | 143.7 MiB |
| Linux x86_64 | `smto-gateway` | The Gateway (the "hands" that run tools) | 143.7 MiB |
| Linux x86_64 | `smto-inference-portal` | The Inference Portal service that supervises local model servers | 72.8 MiB |
| Debian/Ubuntu | `smto-server_<version>_amd64.deb` | Package of the Server (inference variant) | 144.8 MiB |
| Debian/Ubuntu | `smto-gateway_<version>_amd64.deb` | Package of the Gateway | 140.6 MiB |
| macOS x86_64 | `SMTO-server-macos-x86_64.zip` | `SMTO-server.app` | 100.2 MiB |
| macOS x86_64 | `SMTO-gateway-macos-x86_64.zip` | `SMTO-gateway.app` | 100.2 MiB |

Supporting files attached to each release:

| File | Purpose |
| --- | --- |
| `SHA256SUMS-linux`, `SHA256SUMS-macos-x86_64` | Expected SHA-256 of every asset — [verify your download](#-verifying-your-download-integrity) |
| `linux-build.json`, `macos-x86_64-build.json` | Build record: source commit, build version, per-artifact SHA-256, validation status, signature status |
| `linux-build-details.tar.gz`, `macos-x86_64-build-details.tar.gz` | Build inventory per component: SBOM (CycloneDX, CSV, JSON), `LICENSES/`, notices and compilation reports |
| `native-packages-linux-x86_64.json` | Record of the `.deb` packages: versions, SHA-256, package checks |
| `server-update-*.json`, `gateway-update-*.json` | Update descriptors that installed copies use for [in-app updates](#upgrading) |

---

## 🧸 What is this, in one sentence (explain like I'm 5!)

Imagine you have a **very smart robot friend** who can do chores for you — like fetching files, running programs, reading documents, or controlling things on your computer.

This project is the **"body and brain wiring"** for that robot. The robot's brain is an AI (the *model*). But a brain alone can't *do* anything — it needs hands, eyes, and a safe little house to live in.

**OpenFabric** builds that house and gives the robot safe, reliable **hands** (called *tools*): it can run commands, read and write files, open documents, browse the web, and more. And it has a superpower: **it never forgets and always tells you the truth about what it did.** Every time the robot tries to do something, the house keeps a little **receipt** 🧾 saying *"this happened, here's the result."*

You talk to the robot through a **picture screen** (the web UI), and it does the chores for you.

So:
- The **AI model** = the robot's brain (the thinker).
- **OpenFabric** = the robot's body, hands, memory, and safety rules (the doer).
- **The releases** = the finished, packaged robot, ready to unbox and turn on. 📦➡️🤖

---

## 🤔 What is OpenFabric / smTO, really?

OpenFabric (code name **smTO**) is a **model-led agent runtime** for durable tool execution and automation.

The design splits responsibilities cleanly:

| Who | Owns |
| --- | --- |
| **The model (AI)** | Understanding your request, choosing which tool to use, passing arguments, and deciding when a task is done. |
| **The runtime (OpenFabric)** | Deterministic execution, authorization, scoped credentials, durable jobs & waits, receipts, artifacts, conversations, and tasks. |

The flow looks like this:

```text
USER → MODEL → TOOL → EXECUTION → REAL RESULT + RECEIPT → MODEL
```

The model drives the conversation; the runtime guarantees that what the model *says* it did actually *happened* — safely, with authorization checks, scoped credentials, and a durable record it can look back on later.

### The moving parts

OpenFabric runs as cooperating pieces:

| Component | What it is | Default port | Linux asset | macOS asset |
| --- | --- | --- | --- | --- |
| **Server** | The API + web UI you interact with. Serves the chat interface, the manual, and the diagnostic console. | `8011` (UI) · `8013` (manual) · `8015` (console) | `smto-server-inference` or `smto-server-external` | `SMTO-server.app` |
| **Gateway** | The "hands." Runs on the machine that actually executes tools (shell, files, browser, etc.). | `8787` | `smto-gateway` | `SMTO-gateway.app` |
| **Inference Portal** | The local model server. Runs as a system service and manages the vLLM / llama.cpp inference servers and their workers on a host. | — | `smto-inference-portal` | — |

You typically run **both** the Gateway and the Server; and, if you run models locally on Linux, the Inference Portal too.

---

## 🐧 Linux binaries explained

Each release attaches **four** self-contained Linux executables. Three of them are the pieces of the **Server + Inference** stack, and one is the **Gateway**.

### `smto-server-inference` — the Server **with** inference

The main piece you talk to — the **API + web UI** that serves the chat interface, the manual, and the diagnostic console (ports `8011` UI, `8013` manual, `8015` console). The `-inference` variant **includes the Inference management subsystem compiled in**, so its **`/inference`** area can manage local models (vLLM and llama.cpp) directly from the controller.

- Choose this if you want an all-in-one Server that also handles local model inference.
- It still needs a **Gateway** (`smto-gateway`) for tool execution, and — if you run models locally — the **Inference Portal** (`smto-inference-portal`).
- The `smto-server_<version>_amd64.deb` package installs this variant.

### `smto-server-external` — the Server **without** inference

The **same** Server (same web UI, same ports), **without** the local Inference subsystem. Built for the case where your **model lives elsewhere** — a remote vLLM endpoint or another external provider.

- Choose this if your model runs on a different host, in the cloud, or at a remote endpoint.
- Everything else (chat, tools via the Gateway, manual, console) works the same; only the local Inference controller is omitted.

> **In short:** `server-inference` and `server-external` are the **same Server**. They differ only in whether the local Inference management subsystem is compiled in. Pick `external` to reduce surface area and point at a remote model; pick `inference` to manage local models from the UI.

### `smto-inference-portal` — the local model server service

A **separate, standalone process** that runs as a **system service** (`inference-portal.service`) and **manages your local model inference servers** — vLLM and llama.cpp — on a host. It owns the job workers and the cgroup runner that run the models; the Server's `/inference` area reports on the resources it manages.

- Install and run it once, as a service:
  ```bash
  sudo ./smto-inference-portal --install --service --user "$USER"
  ```
- You do **not** need it if you only use an external/remote model provider.

### `smto-gateway` — the "hands"

Runs on the machine that actually **executes tools** — shell, files, Python, browser, and so on — on port `8787`. Every deployment that runs tools needs one, regardless of which Server variant you pick.

### Which combination do I run?

| Your setup | Server | Gateway | Inference Portal |
| --- | --- | --- | --- |
| Local models, manage them from the UI | `smto-server-inference` | ✅ required | ✅ recommended |
| Remote / external model provider | `smto-server-external` | ✅ required | ❌ not needed |
| Just want to try it (no local models) | `smto-server-inference` or `smto-server-external` | ✅ required | ❌ not needed |

---

## 🖥️ System requirements

| | **Linux x86_64** | **macOS x86_64** |
| --- | --- | --- |
| **Python** | **None required** (private CPython 3.12 bundled) | **None required** (private CPython 3.12 bundled) |
| **Baseline** | Built on Ubuntu 22.04 (**glibc 2.35**); newer distributions are fine | macOS on Intel (x86_64) |
| **Disk** | ~144–148 MiB per executable, plus a runtime cache on first launch | ~100 MiB per `.zip`, plus a runtime cache |
| **Privileges** | Run as the user who will run the services | Run as the user who will run the services |

> **Linux note:** the binaries need glibc 2.35 or newer. On an older distribution they may not start.

---

## 🚀 Quick start (Linux)

1. **Download** the Gateway, one Server variant and the checksums (see [The Linux binaries](#-linux-binaries-explained) for which variant):

   ```bash
   mkdir -p ~/smto && cd ~/smto
   base=https://github.com/vinithbraj/smto/releases/latest/download
   curl -L -O "$base/smto-gateway" -O "$base/smto-server-inference" -O "$base/SHA256SUMS-linux"
   ```

2. **Verify** (see [Verifying your download](#-verifying-your-download-integrity)):

   ```bash
   sha256sum -c --ignore-missing SHA256SUMS-linux
   ```

3. **Make them executable** and run them:

   ```bash
   chmod +x smto-gateway smto-server-inference

   # Terminal 1 — the Gateway (the hands) on port 8787
   ./smto-gateway --host 127.0.0.1 --port 8787

   # Terminal 2 — the Server (the face you talk to) on port 8011
   ./smto-server-inference --host 127.0.0.1 --port 8011 --manual-port 8013
   ```

   Use `smto-server-external` instead if your model is remote. If you run models locally, also install the `smto-inference-portal` service.

4. **Open your browser** at `http://127.0.0.1:8011`.

> The first launch extracts a private runtime cache, so it takes longer than later launches.

### Debian / Ubuntu packages

Download `smto-server_<version>_amd64.deb` and `smto-gateway_<version>_amd64.deb` from the [release page](https://github.com/vinithbraj/smto/releases/latest), check them against `SHA256SUMS-linux`, then:

```bash
sudo apt install ./smto-server_*_amd64.deb ./smto-gateway_*_amd64.deb
```

The packages need an internet connection during setup.

---

## 🍎 Quick start (macOS)

1. **Download and verify** the two bundles:

   ```bash
   mkdir -p ~/smto && cd ~/smto
   base=https://github.com/vinithbraj/smto/releases/latest/download
   curl -L -O "$base/SMTO-server-macos-x86_64.zip" -O "$base/SMTO-gateway-macos-x86_64.zip" -O "$base/SHA256SUMS-macos-x86_64"
   grep -E 'SMTO-(server|gateway)-macos' SHA256SUMS-macos-x86_64 | shasum -a 256 -c -
   ```

2. **Unzip** — you get `SMTO-server.app` and `SMTO-gateway.app`:

   ```bash
   unzip -q SMTO-server-macos-x86_64.zip && unzip -q SMTO-gateway-macos-x86_64.zip
   ```

   The apps are not signed or notarized. If you downloaded the zips in a browser, macOS quarantines them: right-click each app → **Open** once, or clear the flag with `xattr -dr com.apple.quarantine SMTO-server.app SMTO-gateway.app` (follow your organization's software policy).

3. **Run** them:

   ```bash
   # Terminal 1 — the Gateway on port 8787
   ./SMTO-gateway.app/Contents/MacOS/gateway --host 127.0.0.1 --port 8787

   # Terminal 2 — the Server on port 8011
   ./SMTO-server.app/Contents/MacOS/server --host 127.0.0.1 --port 8011 --manual-port 8013
   ```

4. Open `http://127.0.0.1:8011`.

---

## 🪟 Windows

The source repo's builder can also produce a Windows agent (`smto-agent-windows-x86_64.exe`). It isn't published in the releases yet, but when available it runs from PowerShell like:

```powershell
./smto-agent-windows-x86_64.exe -Host 127.0.0.1 -Port 8787
```

---

## 🔧 How the binaries work (and what's special about them)

The binaries are **self-contained**: there is **no Python installation, package install, or download step** required at runtime. The executable bundles a private Python interpreter and all dependencies.

A few important things to understand:

- **Same software, different packaging.** A binary distribution runs the *exact same* OpenFabric application as the source build. Packaging only bundles, stages, verifies, and launches it — it is **not** a second, different version of the software.
- **You pass the same options** you'd pass to the source startup scripts.
  - **Server options:** `--config`, `--host`/`--hosts`, `--port`, `--manual-port`, `--reload`, `--https`/`--ssl`
  - **Gateway options:** `--host`, `--port`, `--server-host`, `--server-port`, `--server-scheme`, `--trace-commands`
- **Renaming is fine.** You can rename the executable to `smto-server`, `smto-gateway`, or `smto-gateway.exe` and it still works.
- **No capabilities are invented.** If your host or platform can't support a feature (e.g. a browser for the Web skill), the binary won't magically gain it — it reports availability honestly.
- **No model weights or browsers are downloaded by the binary itself.** You still need to configure a model provider (see below).

### Where does my data live?

- The **default instance directory** is the folder next to the executable. Keep a replacement executable in that same folder to keep the same "instance" (your settings, chats, databases, logs).
- You can point it elsewhere with the `SMTO_BINARY_INSTANCE_ROOT` environment variable (handy when the executable sits in a read-only system folder).
- Runtime cache lives under `~/.cache/SMTO/runtime` on Linux, `~/Library/Caches/SMTO/runtime` on macOS, `%LOCALAPPDATA%/SMTO/runtime` on Windows. Override with `SMTO_BINARY_CACHE_DIR`.

### Upgrading

**In-app updates:** a compiled Server can update itself from **Settings → Setup → Server updates**, which shows the installed build, the available release, progress and the last result. Installing always takes an explicit action, and the platform and Server variant stay the same. An existing installation needs one manual installation of an updater-capable release before this works. See [Configuration and storage](https://vinithbraj.github.io/smto/manual/#doc=configuration-storage) in the manual.

**Manual upgrade:**

1. **Stop** the running instance.
2. **Replace** the executable with the new one (in the same instance folder).
3. **Restart.**

Old runtime caches can be removed after the processes have stopped. Keep `artifacts/` and `outputs/` — they may contain your state.

---

## 🔌 Configuring a model (required to actually use it)

The binary gives you the body and hands — but you still need to connect a **brain** (an AI model provider). This is configured in the OpenFabric UI:

1. Open the UI at `http://127.0.0.1:8011`.
2. Go to **Model Configuration** in Mission Control.
3. Choose a profile: **Provider Defaults**, **smTO Recommended**, or a **Custom** profile.
4. Point it at your model provider (e.g. a vLLM endpoint or another supported provider).

See [Model Configuration](https://vinithbraj.github.io/smto/manual/#doc=model-configuration) in the manual for details.

> The installer/binary does **not** configure Web Search providers, service accounts, database servers, GPU drivers, desktop permissions, or local-AI engines. Those are set up separately.

---

## 🧰 Skills & capabilities you unlock

Once a model is connected, the Gateway can expose many **skills** (each a set of tools). Some highlights:

| Skill | What it does |
| --- | --- |
| **Shell** | Run shell commands on the Gateway machine. |
| **Files** | Read/write/search/manage files with exact, revision-checked edits. |
| **Python** | Run Python for computation, data analysis, and transformation. |
| **Office** | Inspect, create, and edit Word (DOCX), Excel (XLSX), PowerPoint (PPTX). |
| **PDF** | Extract text, render, transform, fill forms, OCR. |
| **Web / Browser** | Search public info and read websites; automate a real browser. |
| **GitHub** | Read issues, PRs, reviews, Actions, releases. (needs a PAT parameter) |
| **Memory** | Recall/save reusable lessons across conversations. |
| **Proxmox VE** | Manage servers, VMs, containers (disabled by default). |
| **Agent KV Store** | A small durable notebook inside each conversation. |

Capabilities are **selected/authorized separately** from installing their dependencies, and some features depend on your host (e.g. a working browser for the Web skill).

---

## 🔐 Verifying your download (integrity)

**Always verify.** Each release attaches `SHA256SUMS-linux` and `SHA256SUMS-macos-x86_64`; the release notes repeat the Linux hashes, and `linux-build.json` / `macos-x86_64-build.json` record them again with the source commit.

**Linux:**

```bash
sha256sum -c --ignore-missing SHA256SUMS-linux
```

**macOS:**

```bash
grep -E 'SMTO-(server|gateway)-macos' SHA256SUMS-macos-x86_64 | shasum -a 256 -c -
```

Every line should end in `OK`. A matching checksum shows the file wasn't damaged or altered after the checksums were published. It does not prove who published the file, and these builds are not signed.

---

## ⚠️ Status & caveats

Please read before relying on these builds:

- **Product version 0.10.0, `dev` channel.** Releases are development builds named after their source commit.
- **Validation skipped for this build.** The release notes record that artifact validation was not run (`--validate` was not supplied). For the `.deb` packages, structure checks passed; extraction, launcher, install/upgrade/remove, boot services, desktop permissions and Gatekeeper were not exercised. The macOS build's validation was also skipped.
- **Not signed / not notarized.** You may need to trust the files yourself, or follow your organization's software policy.
- **Linux glibc:** built on Ubuntu 22.04 (glibc 2.35). Older distributions may be incompatible.
- **A binary can't gain capabilities its host lacks.** Browser, GPU, desktop, and model-provider features depend on your machine and configuration.

---

## 🐞 Troubleshooting

| Symptom | Likely cause & fix |
| --- | --- |
| macOS says the app is from an "unidentified developer" | Right-click the app → **Open** → **Open** once, or clear the quarantine flag (see [Quick start (macOS)](#-quick-start-macos)). |
| Linux binary won't start ("glibc not found") | Your distribution is too old; the binaries need glibc 2.35. Use a newer distribution, or build from source. |
| First launch is slow | Normal — the binary extracts a private runtime cache. Later launches are faster. |
| A checksum doesn't match | Download the file again; it is corrupt or was altered. |
| Nothing happens on port 8011 | Make sure **both** the Gateway (8787) and Server (8011) are running, and that a model provider is configured. Check the server logs. |
| A skill (e.g. Browser) is unavailable | The feature depends on host software (a browser, GPU, etc.) that isn't installed. Install it, or the skill reports itself unavailable. |
| Want to see what the launcher is doing | Set `SMTO_BINARY_DEBUG=1` to print the cache path and timing to stderr. |

**Health checks:** `/livez` reports web-server liveness; `/healthz` returns `503` until the runtime is ready.

---

## 📚 Where to learn more

- **Website:** https://vinithbraj.github.io/smto/ — what SMTO is, examples, how it works, a screenshot and diagram [gallery](https://vinithbraj.github.io/smto/gallery/), and the [FAQ](https://vinithbraj.github.io/smto/faq/).
- **Manual:** https://vinithbraj.github.io/smto/manual/ — start with [Install and startup](https://vinithbraj.github.io/smto/manual/#doc=install-startup). A running Server also serves it on port `8013`.
- **Releases:** https://github.com/vinithbraj/smto/releases
- **Source repository:** [`github.com/vinithbraj/openfabric`](https://github.com/vinithbraj/openfabric) — the full source, docs, and scripts.

---

## 🌐 The website (`site/`)

The website at https://vinithbraj.github.io/smto/ is published from this repository:

- `site/public/` is the generated website, including the full manual. `site/tools/build_site.py` renders it from the website and manual code in the openfabric repository.
- Every push to `main` that changes `site/public/` runs the **Publish website** workflow ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)). It checks every link and asset, then copies `site/public/` to the `gh-pages` branch, which GitHub Pages serves.

See [`site/README.md`](site/README.md) for how to rebuild and publish it.

---

## 📄 License & third-party notices

The license terms are on the website: [License](https://vinithbraj.github.io/smto/license/), [EULA](https://vinithbraj.github.io/smto/legal/eula/) and [third-party notices](https://vinithbraj.github.io/smto/legal/third-party/). Each release's `*-build-details.tar.gz` contains, per component, the `LICENSES/` folder (including CPython and Apache-2.0 texts and the EULA versions), the notices, and a software bill of materials in CycloneDX, CSV and JSON.

---

## 🤝 Contributing

Contributions go to the **source repository** [`github.com/vinithbraj/openfabric`](https://github.com/vinithbraj/openfabric). This repository is the **release home**: maintainers publish new builds here as GitHub Releases.

---

*OpenFabric / smTO — Simple Model Task Orchestrator. This README describes the pre-built releases published from this repository.*
