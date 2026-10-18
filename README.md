# OpenFabric (smTO) — Release Binaries

> **Small Model Task Orchestration** — self-contained, ready-to-run executables for the smTO runtime.

This repository ships the **pre-built native binaries** for [OpenFabric](https://github.com/vinithbraj/openfabric) (also called **smTO** — *Simple Model Task Orchestrator*). Instead of installing Python, building everything from source, and configuring a virtual environment, you download a single executable per component and run it.

- 🐧 **Linux x86_64** — `smto-server` and `smto-gateway` (self-contained executables) in `dist/compiled/linux-x86_64/`
- 🍎 **macOS x86_64** — `SMTO-server.zip` and `SMTO-gateway.zip` in `dist/compiled/macos-x86_64/`
- ✅ Each artifact folder ships a machine-readable `manifest.json`, build logs, a license inventory, and an artifact SHA-256 so you can verify exactly what you downloaded.

> ⚠️ **Status:** These builds are **product version 0.10.0**, built on the **`dev` channel**, and are **not a signed/notarized release** (see [Status & caveats](#-status--caveats)). They are the latest tested builds and are great for trying the software, development, and evaluation. Read that section before relying on them in production.

---

## 🧸 What is this, in one sentence (explain like I'm 5!)

Imagine you have a **very smart robot friend** who can do chores for you — like fetching files, running programs, reading documents, or controlling things on your computer.

This project is the **"body and brain wiring"** for that robot. The robot's brain is an AI (the *model*). But a brain alone can't *do* anything — it needs hands, eyes, and a safe little house to live in.

**OpenFabric** builds that house and gives the robot safe, reliable **hands** (called *tools*): it can run commands, read and write files, open documents, browse the web, and more. And it has a superpower: **it never forgets and always tells you the truth about what it did.** Every time the robot tries to do something, the house keeps a little **receipt** 🧾 saying *"this happened, here's the result."*

You talk to the robot through a **picture screen** (the web UI), and it does the chores for you.

So:
- The **AI model** = the robot's brain (the thinker).
- **OpenFabric** = the robot's body, hands, memory, and safety rules (the doer).
- **This repo** = the finished, packaged robot, ready to unbox and turn on. 📦➡️🤖

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

### Two moving parts

OpenFabric runs as two cooperating services:

| Component | What it is | Default port | This repo's binary |
| --- | --- | --- | --- |
| **Server** | The API + web UI you interact with. Serves the chat interface, the manual, and the diagnostic console. | `8011` (UI) · `8013` (manual) · `8015` (console) | `smto-server` |
| **Gateway** | The "hands." Runs on the machine that actually executes tools (shell, files, browser, etc.). | `8787` | `smto-gateway` |

You typically run **both**: the Gateway does the work on your machine, and the Server talks to you and to a model.

---

## 📦 What's in this repository

The release artifacts live under `dist/compiled/<target>/`. Each target folder is a self-contained build with its own metadata and inventory.

```text
.
├── dist/
│   ├── linux-x86_64/                     # Self-contained Linux executables (no Python install needed)
│   │   ├── smto-server                   # The Server (API + web UI)  [Git LFS]
│   │   ├── smto-gateway                  # The Gateway (the "hands")  [Git LFS]
│   │   ├── manifest.json                 # Build metadata + artifact SHA-256 + signature status
│   │   ├── build.log                     # Full build transcript
│   │   ├── builder-environment.json      # Base image, toolchain, glibc, Python archive hash
│   │   ├── validation-observed.json      # Machine-observed clean-machine validation results
│   │   ├── server-details/               # Server build inventory (compilation XMLs, size report)
│   │   ├── gateway-details/              # Gateway build inventory (NOTICES.txt, LICENSES/)
│   │   └── validation/                   # Per-job validation logs & receipts (server + gateway)
│   └── macos-x86_64/                     # macOS distribution (zipped app bundles)
│       ├── SMTO-server.zip               # The Server (.app bundle)
│       ├── SMTO-gateway.zip              # The Gateway (.app bundle)
│       └── manifest.json                 # Build metadata + artifact SHA-256 + signature status
├── .gitattributes                        # Git LFS tracking rules
├── .gitignore
└── README.md
```

### A single compiled distribution

Unlike older release layouts, this checkout ships **one** style of artifact: a **compiled, self-contained build**. There is no separate `binary/` vs `native/` split — every folder under `dist/compiled/` is the same kind of build for its target platform.

| | **Linux x86_64** (`dist/compiled/linux-x86_64/`) | **macOS x86_64** (`dist/compiled/macos-x86_64/`) |
| --- | --- | --- |
| **What it is** | Two self-contained executables with a private bundled Python interpreter — **no Python install required.** | Two `.app` bundles zipped up, with a private bundled Python interpreter — **no Python install required.** |
| **Files** | `smto-server`, `smto-gateway` | `SMTO-server.zip`, `SMTO-gateway.zip` |
| **Size** | ~117 MiB each | ~77 MiB each (zip) |
| **Packaging backend** | `compiled-shared-v1` | `compiled-shared-v1` |
| **Bundled runtime** | CPython 3.12.14 (Linux x86_64) | CPython 3.12.14 (macOS x86_64) |
| **Build base** | Ubuntu 22.04 container (glibc 2.35, GCC/Clang 11.4.0, CMake 3.22.1) | macOS x86_64 |

> **Note on Git LFS:** The Linux executables (`smto-server`, `smto-gateway`) are tracked with **Git LFS**; the macOS `.zip` bundles are committed as regular blobs. See [Git LFS](#-git-lfs--large-file-support) below.

---

## 🖥️ System requirements

| | **Linux x86_64** | **macOS x86_64** |
| --- | --- | --- |
| **OS** | Linux x86_64 | macOS x86_64 |
| **Python** | **None required** (private interpreter bundled) | **None required** (private interpreter bundled) |
| **Linux baseline** | Built on Ubuntu 22.04 (**glibc 2.35**) | Apple clang / bundled |
| **Disk** | ~117 MiB executable + runtime cache on first launch | ~77 MiB `.zip` + runtime cache |
| **Privileges** | Run as the user who will run the services | Run as the user who will run the services |

> **Linux note:** The Linux binaries were built against **glibc 2.35** (Ubuntu 22.04). If your Linux distro is older than that, the binary may not start. Newer distros are fine.

---

## 🚀 Quick start (Linux)

1. **Download** `smto-server` and `smto-gateway` from the `dist/compiled/linux-x86_64/` folder of this repo.

2. **Verify** the download (highly recommended — see [Verifying integrity](#-verifying-your-download-integrity)):

   ```bash
   cd dist/compiled/linux-x86_64
   sha256sum smto-server smto-gateway
   # compare against the "artifact_sha256" values in manifest.json
   ```

3. **Make them executable** and run them:

   ```bash
   chmod +x smto-server smto-gateway

   # Terminal 1 — the Gateway (the hands) runs on port 8787
   ./smto-gateway --host 127.0.0.1 --port 8787

   # Terminal 2 — the Server (the face you talk to) runs on port 8011
   ./smto-server --host 127.0.0.1 --port 8011 --manual-port 8013
   ```

4. **Open your browser** to `http://127.0.0.1:8011` and you'll see the OpenFabric UI.

> The first launch extracts a private runtime cache (takes ~10–12 seconds). Subsequent launches are faster (~5 seconds).

---

## 🍎 Quick start (macOS)

1. **Clone** (the macOS bundles are committed as regular blobs, no LFS pull needed):

   ```bash
   git clone https://github.com/vinithbraj/smto.git
   cd smto
   ```

2. **Download** `SMTO-server.zip` and `SMTO-gateway.zip` from the `dist/compiled/macos-x86_64/` folder.

3. **Verify** by comparing `shasum -a 256 SMTO-server.zip` against the `artifact_sha256` in `dist/compiled/macos-x86_64/manifest.json`.

4. **Unzip & run** — macOS may warn about an unsigned app the first time. You may need to right-click → **Open** once to allow it, or sign/trust it per your org policy:

   ```bash
   unzip SMTO-server.zip
   unzip SMTO-gateway.zip

   # Terminal 1 — the Gateway (the hands) runs on port 8787
   ./smto-gateway --host 127.0.0.1 --port 8787

   # Terminal 2 — the Server (the face you talk to) runs on port 8011
   ./smto-server --host 127.0.0.1 --port 8011 --manual-port 8013
   ```

5. Open `http://127.0.0.1:8011`.

---

## 🪟 Windows

The source repo's builder can also produce a Windows agent (`smto-agent-windows-x86_64.exe`). It isn't in this release checkout yet, but when available it runs from PowerShell like:

```powershell
./smto-agent-windows-x86_64.exe -Host 127.0.0.1 -Port 8787
```

---

## 🔧 How the binaries work (and what's special about them)

The binaries are **self-contained**: there is **no Python installation, package install, or download step** required at runtime. The executable bundles a private Python interpreter and all dependencies.

A few important things to understand:

- **Same software, different packaging.** A binary distribution must run the *exact same* OpenFabric application as the source build. Packaging only bundles, stages, verifies, and launches it — it is **not** a second, different version of the software.
- **You pass the same options** you'd pass to the source startup scripts.
  - **Server options:** `--config`, `--host`/`--hosts`, `--port`, `--manual-port`, `--reload`, `--https`/`--ssl`
  - **Gateway options:** `--host`, `--port`, `--server-host`, `--server-port`, `--server-scheme`, `--trace-commands`
- **Renaming is fine.** You can rename the executable to `smto-server`, `smto-gateway`, or `smto-gateway.exe` and it still works.
- **No capabilities are invented.** If your host or platform can't support a feature (e.g. a browser for the Web skill), the binary won't magically gain it — it reports availability honestly.
- **No model weights or browsers are downloaded by the binary itself.** You still need to configure a model provider (see below).

### Where does my data live?

- The **default instance directory** is the folder next to the executable. Keep a replacement executable in that same folder to keep the same "instance" (your settings, chats, databases, logs).
- You can point it elsewhere with the `SMTO_BINARY_INSTANCE_ROOT` environment variable (handful when the executable sits in a read-only system folder).
- Runtime cache lives under `~/.cache/SMTO/runtime` on Linux, `~/Library/Caches/SMTO/runtime` on macOS, `%LOCALAPPDATA%/SMTO/runtime` on Windows. Override with `SMTO_BINARY_CACHE_DIR`.

### Upgrading

There is **no automatic updater**. To upgrade:

1. **Stop** the running instance.
2. **Replace** the executable with the new one (in the same instance folder).
3. **Restart.**

Old runtime caches can be removed after the processes have stopped. Keep `artifacts/` and `outputs/` — they may contain your state.

---

## 🔌 Configuring a model (required to actually use it)

The binary gives you the body and hands — but you still need to connect a **brain** (an AI model provider). This is **not** done by the binary; it's configured in the OpenFabric UI / configuration:

1. Open the UI at `http://127.0.0.1:8011`.
2. Go to **Model Configuration** in Mission Control.
3. Choose a profile: **Provider Defaults**, **smTO Recommended**, or a **Custom** profile.
4. Point it at your model provider (e.g. a vLLM endpoint or another supported provider).

See the source repo's [`src/manual/content/25-model-configuration.md`](https://github.com/vinithbraj/openfabric/blob/main/src/manual/content/25-model-configuration.md) and [`src/vllm/README.md`](https://github.com/vinithbraj/openfabric/blob/main/src/vllm/README.md) for model setup details.

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

**Always verify.** Each artifact folder ships a `manifest.json` that records the artifact's `artifact_sha256`, source revision, compiler, Python version, payload sizes, signature status, and `release_eligible`.

**Linux (compare against `manifest.json`):**

```bash
cd dist/compiled/linux-x86_64
sha256sum smto-server smto-gateway
# compare against the "artifact_sha256" values in manifest.json
```

**macOS (compare against `manifest.json`):**

```bash
cd dist/compiled/macos-x86_64
shasum -a 256 SMTO-server.zip SMTO-gateway.zip
# compare against the "artifact_sha256" values in manifest.json
```

A match confirms exactly what was built and from what. The `manifest.json` also records `signature.notarized` and `signature.signed` (both `false` for these builds) and `release_eligible` (`false`), so you can see at a glance the release posture of each artifact.

> **Linux-only machine validation:** the `dist/compiled/linux-x86_64/` folder also includes `validation-observed.json`, which records the results of clean-machine acceptance testing (a validated `glibc 2.35` environment, kernel `6.17.0-41-generic`, with a list of passed and not-exercised test suites). See [Status & caveats](#-status--caveats).

---

## 🌲 Git LFS (Large File Support)

The large Linux executables are tracked with **Git LFS**, so the repository clone stays small and fast. In a plain `git clone` you'll see tiny files (a few hundred bytes) where the Linux binaries should be — those are **LFS pointers**, not the real binaries.

**To get the real Linux binaries, Git LFS must be installed and pulled:**

```bash
# Install Git LFS (once)
# macOS:
brew install git-lfs
# Linux (Debian/Ubuntu):
sudo apt-get install git-lfs

# Initialize and pull the real files
git lfs install
git clone https://github.com/vinithbraj/smto.git
cd smto
git lfs pull
```

After `git lfs pull`, the Linux executables under `dist/compiled/linux-x86_64/` are the full binaries. If a file still looks like a pointer (100-ish bytes starting with `version https://git-lfs.github.com/spec/v1`), run `git lfs pull` again.

> **macOS binaries are not LFS:** the `SMTO-server.zip` and `SMTO-gateway.zip` bundles are committed as regular Git blobs, so they download normally with a plain clone — no `git lfs pull` needed for macOS.

---

## ⚠️ Status & caveats

Please read before relying on these builds:

- **Product version 0.10.0, `dev` channel**, and the manifests mark `release_eligible: false`. These are the latest **tested** builds, not a formally signed/notarized release.
- **Linux clean-machine validation: passed.** The Linux build has a recorded `validation-observed.json` with `status: "passed"` (fresh-no-system-python, core-setup, full-headless-feature-setup, compiled-workers, browser-visualization-ocr, startup-health-tls-and-shutdown, lifecycle install/doctor/backup/uninstall/purge, offline-reuse, and more). Some suites are explicitly *not exercised* (desktop-session-permissions, external-services-and-credentials, older-kernel-and-CPU variants). macOS does not yet ship machine-observed validation in this checkout.
- **Not signed / not notarized.** The artifacts are `signature.signed: false` and `signature.notarized: false`. You may need to trust/sign them yourself, or follow your organization's software policy.
- **Linux glibc:** built against glibc 2.35 (Ubuntu 22.04), tested on kernel 6.17.0-41-generic. Older Linux distros may be incompatible.
- **macOS native dependencies:** the macOS build reports several unresolved native `.dylib` dependencies (e.g. `libitcl4.3.8.dylib`, `libtcl9itcl4.3.8.dylib`, `libpython3.12.dylib`). Core shell/file operations work, but some feature-dependent operations (certain image processing, Plotly PNG export via browser, etc.) may be unavailable until resolved. The Gateway can still run shell and file operations.
- **No automatic updates.** You upgrade by replacing the executable (see [Upgrading](#upgrading)).
- **A binary can't gain capabilities its host lacks.** Browser, GPU, desktop, and model-provider features depend on your machine and configuration.

---

## 🐞 Troubleshooting

| Symptom | Likely cause & fix |
| --- | --- |
| macOS says the app is "unidentified developer" | Right-click the app → **Open** → **Open** once, or trust it in System Settings. For automated environments, sign/notarize per policy. |
| Linux binary won't start ("glibc not found") | Your distro is too old. The binary needs glibc 2.35. Use a newer distro, or build from source for your platform. |
| First launch is slow (~10–12s) | Normal — the binary extracts a private runtime cache. Next launches are ~5s. |
| `sha256sum` doesn't match the manifest | Re-download the artifact; the file is corrupt or was altered. |
| Nothing happens on port 8011 | Make sure **both** the Gateway (8787) and Server (8011) are running, and that a model provider is configured. Check the server logs. |
| A skill (e.g. Browser) is unavailable | The feature depends on host software (a browser, GPU, etc.) that isn't installed. Install it, or the skill reports itself unavailable. |
| Want to see what the launcher is doing | Set `SMTO_BINARY_DEBUG=1` to print the cache path and timing to stderr. |

**Health checks** (when running from source or for the served server): `/livez` reports web-server liveness; `/healthz` returns `503` until the runtime is ready.

---

## 📚 Where to learn more

- **Source repository:** [`github.com/vinithbraj/openfabric`](https://github.com/vinithbraj/openfabric) — the full source, docs, and scripts.
- **macOS installation guide:** `src/gateway_macos/README.md` in the source repo
- **Linux installation guide:** `src/gateway_agent/README.md` in the source repo
- **Model configuration:** `src/manual/content/25-model-configuration.md` in the source repo
- **Manual (product docs):** served at port `8013` when you run the Server, or browse the source repo's `src/manual/`.

---

## 📄 License & third-party notices

Every artifact folder includes a `manifest.json` with a full license inventory under `*-details/` (the `server-details/` and `gateway-details/` folders contain `NOTICES.txt` and a `LICENSES/` directory, e.g. CPython, Apache-2.0), plus build metadata and the artifact's SHA-256. These are included so you can review exactly what licenses your deployment is under.

---

## 🤝 Contributing

Contributions go to the **source repository** [`github.com/vinithbraj/openfabric`](https://github.com/vinithbraj/openfabric). This repo is the **release artifact store** — new builds are added there by maintainers after they pass the build and acceptance tests.

---

*OpenFabric / smTO — Simple Model Task Orchestrator. This README describes the pre-built binaries hosted in this repository.*
