# OpenFabric (smTO) — Release Binaries

> **Small Model Task Orchestration** — self-contained, ready-to-run executables for the smTO runtime.

This repository ships the **pre-built native binaries** for [OpenFabric](https://github.com/vinithbraj/openfabric) (also called **smTO** — *Simple Model Task Orchestrator*). Instead of installing Python, building everything from source, and configuring a virtual environment, you download a single executable per component and run it.

- 🐧 **Linux x86_64** — `smto-server` and `smto-agent` (binary) and `openfabric-server` / `openfabric-gateway` (native)
- 🍎 **macOS x86_64** — `smto-server` / `smto-agent` (binary) and `OpenFabric Server.app` / `OpenFabric Gateway.app` (native)
- ✅ Every artifact comes with `SHA256SUMS`, a `manifest.json`, license/attribution files, and a locked dependency list so you can verify exactly what you downloaded.

> ⚠️ **Status:** These builds are **version 0.10.0** and are **not yet a formal, notarized release** (see [Status & caveats](#--status--caveats)). They are the latest tested builds and are great for trying the software, development, and evaluation. Read that section before relying on them in production.

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
| **Server** | The API + web UI you interact with. Serves the chat interface, the manual, and the diagnostic console. | `8011` (UI) · `8013` (manual) · `8015` (console) | `smto-server` / `openfabric-server` |
| **Gateway** | The "hands." Runs on the machine that actually executes tools (shell, files, browser, etc.). | `8787` | `smto-agent` / `openfabric-gateway` |

You typically run **both**: the Gateway does the work on your machine, and the Server talks to you and to a model.

---

## 📦 What's in this repository

```text
.
├── LINUX/
│   ├── binary/                     # Self-contained executables (no Python install needed)
│   │   ├── smto-server-linux-x86_64
│   │   ├── smto-agent-linux-x86_64
│   │   ├── manifest.json
│   │   ├── SHA256SUMS
│   │   ├── requirements-linux-x86_64.lock
│   │   ├── LICENSE
│   │   └── THIRD_PARTY_ATTRIBUTIONS.md
│   └── native/                     # Full native distribution (bigger, .app bundles on macOS)
│       ├── openfabric-server-linux-x86_64
│       ├── openfabric-gateway-linux-x86_64
│       ├── gateway-metadata/
│       ├── server-metadata/
│       ├── manifest.json
│       ├── SHA256SUMS
│       └── requirements-linux-x86_64.lock
├── MACOS/
│   ├── binary/
│   │   ├── smto-server-macos-x86_64        # Git LFS pointer
│   │   ├── smto-agent-macos-x86_64        # Git LFS pointer
│   │   ├── manifest.json
│   │   ├── SHA256SUMS
│   │   ├── requirements-macos-x86_64.lock
│   │   ├── LICENSE
│   │   └── THIRD_PARTY_ATTRIBUTIONS.md
│   └── native/
│       ├── OpenFabric Server.app.zip        # Git LFS pointer
│       ├── OpenFabric Gateway.app.zip       # Git LFS pointer
│       ├── gateway-metadata/
│       ├── server-metadata/
│       ├── manifest.json
│       ├── SHA256SUMS
│       └── requirements-macos-x86_64.lock
├── .gitattributes
├── .gitignore
└── README.md
```

### The two families of binaries

This repo ships **two styles** of Linux/macOS artifacts. Pick one family and stick with it.

| | **`binary/`** — *smto-server / smto-agent* | **`native/`** — *openfabric-server / openfabric-gateway* |
| --- | --- | --- |
| **What it is** | A single self-contained executable. Bundles a private Python interpreter so **you don't need Python installed.** | The full native distribution (e.g. a macOS `.app` bundle). |
| **Size (Linux)** | ~285 MB each | ~646–660 MB each |
| **macOS** | `smto-*.x86_64` (Git LFS pointers in this checkout) | `OpenFabric Server.app.zip` / `Gateway.app.zip` (Git LFS pointers) |
| **Best for** | Quick start, portable deployment, machines without Python | Full desktop app experience (macOS), complete native packages |
| **Documentation** | [`docs/binary-distribution.md`](https://github.com/vinithbraj/openfabric/blob/main/docs/binary-distribution.md) in the source repo | Same doc; the `.app` bundles are the macOS-native wrapper |

> **Note on macOS in this checkout:** The `MACOS/binary/` and `MACOS/native/` executables are stored as **Git LFS pointers** (small text files). When you `git clone` / `git lfs pull` with Git LFS installed, they resolve to the real binaries. See [Git LFS](#-git-lfs--large-file-support) below.

---

## 🖥️ System requirements

| | **binary/ family** | **native/ family (Linux)** | **native/ family (macOS)** |
| --- | --- | --- | --- |
| **OS** | Linux x86_64, macOS x86_64 | Linux x86_64 | macOS x86_64 (Apple clang 14) |
| **Python** | **None required** (private interpreter bundled) | **None required** (bundled) | **None required** (bundled) |
| **Linux baseline** | Built on Ubuntu 25.10 (**GLIBC 2.38**); tested on Ubuntu 24.04 | Same | — |
| **Disk** | ~300 MB executable + ~880 MB runtime cache on first launch | ~650 MB executable + runtime cache | ~175 MB `.app` zip + runtime cache |
| **Privileges** | Run as the user who will run the services | Same | Same |

> **Linux note:** The Linux binaries were built against **GLIBC 2.38**. If your Linux distro is older than that, the binary may not start. Newer distros are fine.

---

## 🚀 Quick start (Linux)

### Option A — the `binary/` self-contained executables (recommended to try)

1. **Download** the two binaries you need from the `LINUX/binary/` folder of this repo.
2. **Verify** the download (highly recommended — see [Verifying integrity](#-verifying-your-download-integrity)):

   ```bash
   cd LINUX/binary
   sha256sum -c SHA256SUMS
   ```

   You should see `OK` next to every file.

3. **Make them executable** and run them:

   ```bash
   chmod +x smto-server-linux-x86_64 smto-agent-linux-x86_64

   # Terminal 1 — the Gateway (the hands) runs on port 8787
   ./smto-agent-linux-x86_64 --host 127.0.0.1 --port 8787

   # Terminal 2 — the Server (the face you talk to) runs on port 8011
   ./smto-server-linux-x86_64 --host 127.0.0.1 --port 8011 --manual-port 8013
   ```

4. **Open your browser** to `http://127.0.0.1:8011` and you'll see the OpenFabric UI.

> The first launch extracts a private runtime cache (takes ~10–12 seconds). Subsequent launches are faster (~5 seconds).

### Option B — the `native/` full distribution

Same idea, different file names. Download `openfabric-server-linux-x86_64` and `openfabric-gateway-linux-x86_64` from `LINUX/native/`, verify with its `SHA256SUMS`, `chmod +x`, and run:

```bash
./openfabric-gateway-linux-x86_64 --host 127.0.0.1 --port 8787
./openfabric-server-linux-x86_64 --host 127.0.0.1 --port 8011 --manual-port 8013
```

---

## 🍎 Quick start (macOS)

### Option A — the `binary/` executables

1. **Clone with Git LFS** so the real binaries download (not just pointers):

   ```bash
   git clone https://github.com/vinithbraj/openfabric_release.git
   cd openfabric_release
   git lfs pull
   ```

2. **Verify** (macOS uses `shasum`, not `sha256sum`):

   ```bash
   cd MACOS/binary
   shasum -a 256 -c SHA256SUMS
   ```

3. **Unblock & run** — macOS may warn about an unsigned app the first time. You may need to right-click → **Open** once to allow it, or sign/trust it per your org policy:

   ```bash
   chmod +x smto-server-macos-x86_64 smto-agent-macos-x86_64

   # Terminal 1 — Gateway
   ./smto-agent-macos-x86_64 --host 127.0.0.1 --port 8787

   # Terminal 2 — Server
   ./smto-server-macos-x86_64 --host 127.0.0.1 --port 8011 --manual-port 8013
   ```

4. Open `http://127.0.0.1:8011`.

### Option B — the `native/` `.app` bundles

Download `OpenFabric Server.app.zip` and `OpenFabric Gateway.app.zip` from `MACOS/native/`, verify with its `SHA256SUMS`, unzip, and launch the `.app` bundles the normal macOS way (drag to Applications, or double-click).

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
- **Renaming is fine.** You can rename the executable to `smto-server`, `smto-agent`, or `smto-agent.exe` and it still works.
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

**Always verify.** Each artifact folder ships a `SHA256SUMS` file listing the expected hash of every file.

**Linux / generic (uses `sha256sum`):**

```bash
cd LINUX/binary
sha256sum -c SHA256SUMS
```

**macOS (uses `shasum`):**

```bash
cd MACOS/binary
shasum -a 256 -c SHA256SUMS
```

A clean run prints `OK` for every file. If anything says `FAILED`, re-download that artifact — do not run it.

You can also inspect the machine-readable `manifest.json` in each folder. It records the source revision, compiler, Python version, package list, payload sizes, and the SHA-256 of the payload — so you can confirm exactly what was built and from what.

---

## 🌲 Git LFS (Large File Support)

The large binaries are tracked with **Git LFS**, so the repository clone stays small and fast. In a plain `git clone` you'll see tiny files (a few hundred bytes) where the binaries should be — those are **LFS pointers**, not the real binaries.

**To get the real binaries, Git LFS must be installed and pulled:**

```bash
# Install Git LFS (once)
# macOS:
brew install git-lfs
# Linux (Debian/Ubuntu):
sudo apt-get install git-lfs

# Initialize and pull the real files
git lfs install
git clone https://github.com/vinithbraj/openfabric_release.git
cd openfabric_release
git lfs pull
```

After `git lfs pull`, the files under `LINUX/` and `MACOS/` are the full binaries. If a file still looks like a pointer (100-ish bytes starting with `version https://git-lfs.github.com/spec/v1`), run `git lfs pull` again.

---

## ⚠️ Status & caveats

Please read before relying on these builds:

- **Version 0.10.0**, and the manifests mark `release: false`. These are the latest **tested** builds, not a formally notarized signed release.
- **Acceptance is "pending clean-machine matrix"** — full clean-machine validation across all targets is still in progress.
- **Not signed / not notarized.** The macOS artifacts are `signed: false` and `notarized: false`. You may need to trust/sign them yourself, or follow your organization's software policy.
- **Linux GLIBC:** built against GLIBC 2.38 (Ubuntu 25.10), tested on Ubuntu 24.04. Older Linux distros may be incompatible.
- **macOS native dependencies:** the macOS build reports several unresolved native `.dylib` dependencies (e.g. in Pillow, numpy, cryptography). Core shell/file operations work, but some feature-dependent operations (certain image processing, Plotly PNG export via browser, etc.) may be unavailable until resolved. The Gateway can still run shell and file operations.
- **No automatic updates.** You upgrade by replacing the executable (see [Upgrading](#upgrading)).
- **A binary can't gain capabilities its host lacks.** Browser, GPU, desktop, and model-provider features depend on your machine and configuration.

---

## 🐞 Troubleshooting

| Symptom | Likely cause & fix |
| --- | --- |
| macOS says the app is "unidentified developer" | Right-click the app → **Open** → **Open** once, or trust it in System Settings. For automated environments, sign/notarize per policy. |
| Linux binary won't start ("GLIBC not found") | Your distro is too old. The binary needs GLIBC 2.38. Use a newer distro, or build from source for your platform. |
| First launch is slow (~10–12s) | Normal — the binary extracts a private runtime cache. Next launches are ~5s. |
| `sha256sum -c` reports FAILED | Re-download the artifact; the file is corrupt or was altered. |
| Nothing happens on port 8011 | Make sure **both** the Gateway (8787) and Server (8011) are running, and that a model provider is configured. Check the server logs. |
| A skill (e.g. Browser) is unavailable | The feature depends on host software (a browser, GPU, etc.) that isn't installed. Install it, or the skill reports itself unavailable. |
| Want to see what the launcher is doing | Set `SMTO_BINARY_DEBUG=1` to print the cache path and timing to stderr. |

**Health checks** (when running from source or for the served server): `/livez` reports web-server liveness; `/healthz` returns `503` until the runtime is ready.

---

## 📚 Where to learn more

- **Source repository:** [`github.com/vinithbraj/openfabric`](https://github.com/vinithbraj/openfabric) — the full source, docs, and scripts.
- **Binary distribution reference:** [`docs/binary-distribution.md`](https://github.com/vinithbraj/openfabric/blob/main/docs/binary-distribution.md)
- **macOS installation guide:** `src/gateway_macos/README.md` in the source repo
- **Linux installation guide:** `src/gateway_agent/README.md` in the source repo
- **Model configuration:** `src/manual/content/25-model-configuration.md` in the source repo
- **Manual (product docs):** served at port `8013` when you run the Server, or browse the source repo's `src/manual/`.

---

## 📄 License & third-party notices

Every artifact folder includes its own `LICENSE` and `THIRD_PARTY_ATTRIBUTIONS.md`, plus a locked dependency list (`requirements-<target>.lock`) and a full license inventory under `*metadata/` in the `native/` folders. These are included so you can review exactly what licenses your deployment is under. See the source repo's [`THIRD_PARTY_ATTRIBUTIONS.md`](https://github.com/vinithbraj/openfabric/blob/main/THIRD_PARTY_ATTRIBUTIONS.md) for the full picture.

---

## 🤝 Contributing

Contributions go to the **source repository** [`github.com/vinithbraj/openfabric`](https://github.com/vinithbraj/openfabric). This repo is the **release artifact store** — new builds are added there by maintainers after they pass the build and acceptance tests.

---

*OpenFabric / smTO — Simple Model Task Orchestrator. This README describes the pre-built binaries hosted in this repository.*
