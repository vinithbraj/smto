#!/usr/bin/env python3
"""Stage and capture the SMTO product screenshots shown in the website gallery.

Every scene runs against an isolated controller started by the openfabric test
harness (``tests/e2e/ui_server.py``) with scripted inference from
``tests/test_native_conversation.py``. Nothing reads the operator's own SMTO
state, model server or Gateway: HOME, TMPDIR and every state directory point
into a throwaway work directory, the fixture Gateway and model URL point at a
loopback port that refuses connections (also used as the HTTP proxy for
server-side requests), and the browser blocks requests to any other origin.

    ~/Desktop/openfabric/.venv/bin/python site/tools/capture_product.py \\
        --source ~/Desktop/openfabric --out site/overlay/screenshots/product

``--list`` prints the scene ids; ``--only conversation,phone`` re-captures those
scenes and merges them into the existing manifest.json. Every capture is scanned
for the local user name, host name, home and temporary paths, e-mail addresses,
non-loopback IP addresses and API-key shapes; a hit fails the run. Look at every
image before publishing it.
Needs the openfabric virtualenv (Playwright with Chromium, pytest) and Pillow.
"""

from __future__ import annotations

import argparse
import getpass
import importlib.util
import json
import os
import re
import shutil
import socket
import sys
import tempfile
from pathlib import Path

SITE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUT = SITE_DIR / "overlay" / "screenshots" / "product"
DESKTOP = {"width": 1440, "height": 900}
PHONE = {"width": 390, "height": 844}
# Ports of a locally installed SMTO (UI, manual, console, inference, Gateway).
RESERVED_PORTS = {8011, 8013, 8015, 8017, 8787}
ENV = "SMTO_CAPTURE_CONFIG"


# --------------------------------------------------------------------------- runner


def _parse(argv):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--source", required=True, type=Path, help="openfabric checkout")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output folder")
    parser.add_argument(
        "--work-dir",
        type=Path,
        help="scratch folder for HOME, TMPDIR and state (default: a new temporary folder)",
    )
    parser.add_argument("--keep-work", action="store_true", help="keep the scratch folder")
    parser.add_argument("--only", default="", help="comma-separated scene ids to capture")
    parser.add_argument("--scale", type=float, default=2, help="device scale factor")
    parser.add_argument("--quality", type=int, default=85, help="WebP quality")
    parser.add_argument("--list", action="store_true", help="list scene ids and exit")
    return parser.parse_args(argv)


def _forbidden_strings(work):
    """Identifiers of this machine and user that must never appear in a capture."""
    values = {getpass.getuser(), str(Path.home()), str(work), str(Path(tempfile.gettempdir()))}
    for name in (socket.gethostname(), socket.getfqdn()):
        values.add(name)
        values.update(part for part in name.split(".") if len(part) >= 4)
    values.discard("localhost")
    values.discard("/tmp")  # Covered by the generic temporary-path pattern.
    return sorted(v for v in values if v and len(v) >= 3)


def _dead_port():
    """Bind a loopback port that never listens, so connections to it are refused.

    The fixture Gateway, the model endpoint and the outbound HTTP proxy all point here, so
    nothing in the capture reaches a real local service or the internet. 8080 is preferred
    because it reads as an ordinary local model-server port in Settings.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", 8080))
    except OSError:
        sock.bind(("127.0.0.1", 0))
    _HELD_SOCKETS.append(sock)
    return sock.getsockname()[1]


_HELD_SOCKETS = []


def _isolate_process(work, dead_port):
    """Point every per-user location at the work folder before anything is imported."""
    home = work / "home"
    for path in (home, work / "tmp", work / "pytest"):
        path.mkdir(parents=True, exist_ok=True)
    browsers = os.environ.get("PLAYWRIGHT_BROWSERS_PATH") or str(
        Path.home() / ".cache" / "ms-playwright"
    )
    os.environ.update(
        PLAYWRIGHT_BROWSERS_PATH=browsers,
        HOME=str(home),
        XDG_CONFIG_HOME=str(home / ".config"),
        XDG_DATA_HOME=str(home / ".local" / "share"),
        XDG_STATE_HOME=str(home / ".local" / "state"),
        XDG_CACHE_HOME=str(home / ".cache"),
        TMPDIR=str(work / "tmp"),
        USER="smto",
        LOGNAME="smto",
        PYTHONDONTWRITEBYTECODE="1",
        AOR_CONSOLE_PUBLISH_ENABLED="0",
        GATEWAY_NODE_LEASE_DIR=str(home / "gateway-owner-locks"),
        # Server-side HTTP clients (release checks, model discovery) honour these.
        HTTP_PROXY=f"http://127.0.0.1:{dead_port}",
        HTTPS_PROXY=f"http://127.0.0.1:{dead_port}",
        ALL_PROXY=f"http://127.0.0.1:{dead_port}",
        NO_PROXY="127.0.0.1,localhost",
    )
    for name in ("http_proxy", "https_proxy", "all_proxy", "no_proxy"):
        os.environ[name] = os.environ[name.upper()]
    tempfile.tempdir = None
    sys.dont_write_bytecode = True
    # Host names reach Settings (TLS defaults) and the Inference page; show a neutral one.
    real_fqdn = socket.getfqdn
    socket.gethostname = lambda: "localhost"
    socket.getfqdn = lambda name="": "localhost" if not name else real_fqdn(name)
    os.chdir(work)


def _load_conftest(source):
    """Load tests/conftest.py as a global plugin so its isolation fixtures apply here."""
    spec = importlib.util.spec_from_file_location(
        "smto_capture_conftest", source / "tests" / "conftest.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _convert(raw, out, quality):
    from PIL import Image

    entries = []
    for meta_path in sorted(raw.glob("*.json")):
        meta = json.loads(meta_path.read_text())
        png = raw / (meta_path.stem + ".png")
        with Image.open(png) as image:
            image = image.convert("RGB")
            target = out / (meta_path.stem + ".webp")
            image.save(target, "WEBP", quality=quality, method=6)
            meta.update(file=target.name, width=image.width, height=image.height)
            if meta.pop("png", False):
                png_target = out / (meta_path.stem + ".png")
                image.save(png_target, "PNG", optimize=True)
                meta["png_file"] = png_target.name
        entries.append(meta)
    return entries


def _write_manifest(out, entries, replaced_ids):
    manifest_path = out / "manifest.json"
    kept = []
    if manifest_path.exists() and replaced_ids is not None:
        kept = [
            e for e in json.loads(manifest_path.read_text()) if e.get("scene") not in replaced_ids
        ]
    keys = ("file", "title", "caption", "alt", "theme", "viewport", "order")
    extra = ("png_file", "width", "height", "scene")
    merged = sorted(kept + entries, key=lambda e: (e["order"], e["file"]))
    clean = [{k: e[k] for k in keys + extra if k in e} for e in merged]
    manifest_path.write_text(json.dumps(clean, indent=2, ensure_ascii=False) + "\n")
    listed = {e["file"] for e in clean} | {e["png_file"] for e in clean if "png_file" in e}
    for stale in out.iterdir():
        if stale.suffix in {".webp", ".png"} and stale.name not in listed:
            stale.unlink()
    return clean


def main(argv=None):
    args = _parse(argv)
    if args.list:
        for scene_id, _ in SCENES:
            print(scene_id)
        return 0
    source = args.source.expanduser().resolve()
    out = args.out.expanduser().resolve()
    if not (source / "tests" / "e2e" / "ui_server.py").exists():
        sys.exit(f"{source} is not an openfabric checkout (tests/e2e/ui_server.py is missing)")
    only = [s.strip() for s in args.only.split(",") if s.strip()]
    unknown = set(only) - {scene_id for scene_id, _ in SCENES}
    if unknown:
        sys.exit("Unknown scene(s): " + ", ".join(sorted(unknown)))
    created = args.work_dir is None
    work = (
        Path(tempfile.mkdtemp(prefix="smto-capture-"))
        if created
        else args.work_dir.expanduser().resolve()
    )
    marker = work / ".smto-capture-work"
    if not created and work.exists() and any(work.iterdir()):
        if not marker.exists():
            sys.exit(f"--work-dir {work} is not empty and was not made by this script")
        shutil.rmtree(work)
    work.mkdir(parents=True, exist_ok=True)
    marker.touch()
    raw = work / "raw"
    raw.mkdir()
    out.mkdir(parents=True, exist_ok=True)
    forbidden = _forbidden_strings(work)
    dead_port = _dead_port()
    _isolate_process(work, dead_port)
    os.environ[ENV] = json.dumps(
        {
            "raw": str(raw),
            "scale": args.scale,
            "forbidden": forbidden,
            "source": str(source),
            "dead_port": dead_port,
        }
    )
    conftest = _load_conftest(source)
    import pytest

    selected = only or [scene_id for scene_id, _ in SCENES]
    pytest_args = [
        __file__,
        "-c",
        str(source / "pyproject.toml"),
        "--rootdir",
        str(source),
        "-p",
        "no:cacheprovider",
        "--basetemp",
        str(work / "pytest"),
        "-q",
        "-W",
        "ignore::DeprecationWarning",
        "-k",
        " or ".join(f"test_{s.replace('-', '_')}" for s in selected),
    ]
    status = pytest.main(pytest_args, plugins=[conftest])
    if status != 0:
        print(f"Capture failed (pytest exit {status}); raw images are in {raw}", file=sys.stderr)
        return int(status)
    entries = _convert(raw, out, args.quality)
    manifest = _write_manifest(out, entries, set(only) if only else None)
    total = sum(p.stat().st_size for p in out.iterdir() if p.is_file())
    for entry in manifest:
        size = (out / entry["file"]).stat().st_size
        print(f"{entry['order']:>3}  {entry['file']:<44} {size / 1024:7.0f} KB")
    print(f"{len(manifest)} images, {total / 1024 / 1024:.2f} MB in {out}")
    if created and not args.keep_work:
        shutil.rmtree(work, ignore_errors=True)
    return 0


# --------------------------------------------------------------------------- scenes
# Everything below runs inside pytest, with the openfabric test fixtures active.

SCENES = [
    ("conversation", "Disk-space task: start, answer, approval and verification"),
    ("activity", "The same task in Debug mode, with commands and output expanded"),
    ("ask-user", "A question from the model with suggested answers"),
    ("capabilities", "The Capabilities dialog opened from the composer"),
    ("settings", "Settings: model routing and Gateways"),
    ("workflows", "Saved workflows"),
    ("schedules", "Scheduled tasks"),
    ("manual", "The product manual"),
    ("phone", "Phone-width start screen, answer and navigation drawer"),
]

if __name__ != "__main__" and os.environ.get(ENV):
    import contextlib
    import datetime
    import threading
    import time

    import pytest
    from playwright.sync_api import expect, sync_playwright

    CONFIG = json.loads(os.environ[ENV])
    RAW = Path(CONFIG["raw"])
    SCALE = CONFIG["scale"]
    FORBIDDEN = CONFIG["forbidden"]
    PATTERNS = [
        (re.compile(r"/home/[^\s\"'<>]*"), "home path"),
        (re.compile(r"/Users/[^\s\"'<>]*"), "home path"),
        (re.compile(r"/tmp/[^\s\"'<>]+"), "temporary path"),
        (re.compile(r"/var/folders/[^\s\"'<>]+"), "temporary path"),
        (re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+"), "e-mail address"),
        (re.compile(r"\b(?:sk|pk|rk|hf|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{12,}"), "API key"),
        (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "API key"),
        (re.compile(r"pytest|fixture-model|test-owner|claude-\d+"), "test harness detail"),
    ]
    IPV4 = re.compile(r"(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.])")

    # A loopback port bound by the runner that never listens (see _dead_port).
    DEAD_PORT = CONFIG["dead_port"]

    def _daytime_zone():
        """An Etc/GMT zone in which it is late morning now, for natural timestamps."""
        hour = datetime.datetime.now(datetime.timezone.utc).hour
        offset = (10 - hour) % 24
        offset = offset - 24 if offset > 14 else offset
        return "UTC" if offset == 0 else f"Etc/GMT{'-' if offset > 0 else '+'}{abs(offset)}"

    ZONE = _daytime_zone()

    import tests.portal_auth_fixtures as _auth

    # The account chip shows the portal user name; the fixtures read it when they log in.
    _auth.USERNAME = "admin"

    # ------------------------------------------------------------------ harness tweaks

    @pytest.fixture(autouse=True)
    def _neutral_endpoints(monkeypatch):
        """Keep the fixture Gateway and model URL off every real local service."""
        import tests.e2e.ui_server as ui_server
        import tests.test_native_conversation as native

        original_settings = ui_server._settings

        def settings(tmp_path):
            return original_settings(tmp_path).model_copy(
                update={"llm_base_url": f"http://127.0.0.1:{DEAD_PORT}/v1"}
            )

        def pair_fixture_gateway(app):
            gateways = app.state.agent_gateway_store
            gateways.seed_from_config(
                default_node="localhost", gateway_url=f"http://127.0.0.1:{DEAD_PORT}"
            )
            for record in gateways.list():
                if record.source == "builtin":
                    continue
                gateways.record_tls_peer(record, {"spki_sha256": "a" * 64, "not_after": "future"})
                gateways._record_health(gateways.get(record.gateway_id), status="connected")
            return app

        # No release discovery: it would contact GitHub and show the result in Settings.
        monkeypatch.setattr("agent_runtime.gateways.releases.REPOSITORY", "")
        monkeypatch.setattr(ui_server, "_settings", settings)
        monkeypatch.setattr(native, "pair_fixture_gateway", pair_fixture_gateway)
        monkeypatch.setenv("AOR_CONSOLE_PORT", str(DEAD_PORT))
        monkeypatch.setenv("AOR_CONSOLE_UDP_PORT", str(DEAD_PORT))
        monkeypatch.setenv("AOR_MANUAL_PORT", str(DEAD_PORT))
        monkeypatch.setenv("AOR_PORT", str(DEAD_PORT))

    OPEN_SHOTS = []

    @pytest.fixture(autouse=True)
    def _debug_on_failure(request):
        """Keep a screenshot and the page text of every open page when a scene fails."""
        failed = request.session.testsfailed
        yield
        if request.session.testsfailed > failed:
            for index, shot in enumerate(OPEN_SHOTS):
                with contextlib.suppress(Exception):
                    shot.debug(f"{request.node.name}-failure-{index}")
        for shot in OPEN_SHOTS[:]:
            with contextlib.suppress(Exception):
                shot.close()

    @pytest.fixture(scope="module")
    def browser():
        with sync_playwright() as playwright:
            instance = playwright.chromium.launch(args=["--no-proxy-server"])
            yield instance
            instance.close()

    class Shot:
        """One browser context plus the checks every published image must pass."""

        def __init__(self, browser, *, phone=False, theme="light", zone=None):
            viewport = PHONE if phone else DESKTOP
            self.phone, self.viewport = phone, viewport
            self.context = browser.new_context(
                viewport=viewport,
                device_scale_factor=SCALE,
                is_mobile=phone,
                has_touch=phone,
                locale="en-US",
                timezone_id=zone or ZONE,
                color_scheme=theme,
                reduced_motion="reduce",
            )
            self.blocked = []
            self.context.route("**/*", self._guard)
            self.page = self.context.new_page()
            self.errors = []
            self.page.on("pageerror", lambda error: self.errors.append(str(error)))
            OPEN_SHOTS.append(self)

        def _guard(self, route):
            from urllib.parse import urlsplit

            parts = urlsplit(route.request.url)
            if parts.scheme in {"data", "blob", "about"}:
                return route.continue_()
            if parts.hostname not in {"127.0.0.1", "localhost"} or parts.port in RESERVED_PORTS:
                self.blocked.append(route.request.url)
                return route.abort()
            return route.continue_()

        def __enter__(self):
            return self

        def __exit__(self, kind, error, trace):
            if kind is not None:
                with contextlib.suppress(Exception):
                    self.debug(f"failure-{int(time.time())}")
            self.close()

        def close(self):
            if self in OPEN_SHOTS:
                OPEN_SHOTS.remove(self)
            self.context.close()

        def debug(self, name):
            """Save what the browser shows, for diagnosing a failed scene."""
            folder = RAW.parent / "debug"
            folder.mkdir(exist_ok=True)
            self.page.screenshot(path=str(folder / f"{name}.png"))
            (folder / f"{name}.txt").write_text(
                self.page.evaluate("document.body ? document.body.innerText : ''")
                + "\n\nERRORS: "
                + json.dumps(self.errors)
                + "\nBLOCKED: "
                + json.dumps(self.blocked)
            )

        def open(self, url, ready="#prompt-input"):
            try:
                self.page.goto(url)
                expect(self.page.locator(ready).first).to_be_visible(timeout=30000)
            except Exception:
                self.debug("open-failure")
                raise

        def check_privacy(self):
            text = self.page.evaluate(
                """() => {
                const parts = [document.title, document.body.innerText];
                for (const el of document.querySelectorAll('input, textarea, select')) {
                    const box = el.getBoundingClientRect();
                    if (!box.width || !box.height) continue;
                    parts.push(el.tagName === 'SELECT'
                        ? (el.selectedOptions[0] || {}).text || '' : el.value || '');
                }
                return parts.join('\\n');
            }"""
            )
            hits = [value for value in FORBIDDEN if value.lower() in text.lower()]
            hits += [f"{label}: {m.group(0)}" for rx, label in PATTERNS for m in rx.finditer(text)]
            for match in IPV4.finditer(text):
                octets = [int(x) for x in match.groups()]
                if match.group(0) not in {"127.0.0.1", "0.0.0.0"} and max(octets) <= 255:
                    hits.append("IP address: " + match.group(0))
            assert not hits, f"Privacy check failed: {sorted(set(hits))}"

        def capture(self, name, *, scene, order, title, caption, alt, theme, png=False):
            page = self.page
            page.evaluate("document.fonts.ready")
            page.evaluate("() => document.activeElement && document.activeElement.blur()")
            page.mouse.move(0, 0)
            page.wait_for_timeout(500)
            self.check_privacy()
            shown = page.evaluate("document.documentElement.dataset.theme || ''")
            assert shown in ("", theme), f"{name}: page shows the {shown} theme, not {theme}"
            assert not self.errors, f"Page errors: {self.errors}"
            assert not self.blocked, f"Blocked requests: {self.blocked}"
            page.screenshot(path=str(RAW / f"{name}.png"), animations="disabled", caret="hide")
            meta = {
                "scene": scene,
                "title": title,
                "caption": caption,
                "alt": alt,
                "theme": theme,
                "viewport": "phone" if self.phone else "desktop",
                "order": order,
                "png": png,
            }
            (RAW / f"{name}.json").write_text(json.dumps(meta, indent=2))

    def set_theme(page, theme):
        """Switch theme with the product's theme button where the page has one.

        Pages without that button (Settings, Workflows, Schedules) take the theme from the
        root data-theme attribute, which is what the repository's own visual tests set.
        """
        if page.evaluate("document.documentElement.dataset.theme") == theme:
            return
        alias = {"dark": "night", "light": "day"}[theme]
        button = page.get_by_role(
            "button", name=re.compile(f"^Switch to ({theme}|{alias}) theme$")
        ).filter(visible=True)
        if button.count():
            button.first.click()
        else:
            page.evaluate("theme => { document.documentElement.dataset.theme = theme; }", theme)
        page.wait_for_function("t => document.documentElement.dataset.theme === t", arg=theme)
        page.wait_for_timeout(400)

    # ------------------------------------------------------------------ content

    def say(text, name, arguments, call_id):
        """A scripted model turn: public commentary plus one native tool call."""
        from tests.test_native_conversation import response

        turn = response(name, arguments, call_id)
        turn["choices"][0]["message"]["content"] = text
        return turn

    def ok(stdout):
        return {"stdout": stdout, "stderr": "", "exit_code": 0}

    DISK_PROMPT = "Find what's using disk space in ~/Downloads and summarise it"
    CLEAN_PROMPT = "Move the two Ubuntu ISOs to /mnt/backup/isos, then check free space again"
    DF_BEFORE = (
        "Filesystem      Size  Used Avail Use% Mounted on\n"
        "/dev/nvme0n1p2  468G  431G   14G  97% /\n"
    )
    DF_AFTER = (
        "Filesystem      Size  Used Avail Use% Mounted on\n"
        "/dev/nvme0n1p2  468G  420G   25G  95% /\n"
    )
    DU = (
        "18G\t./vm-images\n"
        "6.1G\t./ubuntu-24.04.1-desktop-amd64.iso\n"
        "4.7G\t./ubuntu-22.04.4-desktop-amd64.iso\n"
        "2.3G\t./dataset-2023-archive.tar.gz\n"
        "1.1G\t./screen-recordings\n"
        "612M\t./installers\n"
        "208M\t./photos-export.zip\n"
        "96M\t./pdfs\n"
    )
    DISK_ANSWER = (
        "`~/Downloads` holds about **33 GB**, and the root filesystem has **14 GB free** "
        "(97% used).\n\n"
        "| Item | Size |\n|---|---:|\n"
        "| vm-images/ | 18 GB |\n"
        "| ubuntu-24.04.1-desktop-amd64.iso | 6.1 GB |\n"
        "| ubuntu-22.04.4-desktop-amd64.iso | 4.7 GB |\n"
        "| dataset-2023-archive.tar.gz | 2.3 GB |\n"
        "| screen-recordings/ | 1.1 GB |\n\n"
        "The two Ubuntu installer images (10.8 GB together) are the easiest space to "
        "reclaim. I haven't changed anything."
    )
    CLEAN_ANSWER = (
        "Moved `ubuntu-24.04.1-desktop-amd64.iso` and `ubuntu-22.04.4-desktop-amd64.iso` "
        "to `/mnt/backup/isos/` after your approval.\n\n"
        "Free space on `/` went from **14 GB to 25 GB** (97% → 95% used)."
    )

    PHONE_DISK_ANSWER = (
        "`~/Downloads` holds about **33 GB**; `/` has **14 GB free** (97% used).\n\n"
        "- vm-images/: 18 GB\n"
        "- Two Ubuntu ISO files: 10.8 GB together\n"
        "- dataset-2023-archive.tar.gz: 2.3 GB\n\n"
        "The ISOs are the easiest space to reclaim. I haven't changed anything."
    )

    def disk_runtime(tmp_path, answer=DISK_ANSWER):
        from tests.test_native_conversation import runtime, scripted_finish

        (tmp_path / "Downloads").mkdir(exist_ok=True)
        downloads = {"cwd": "Downloads"}
        return runtime(
            tmp_path,
            [
                say(
                    "Checking free space on the root filesystem first.",
                    "shell__command",
                    {"command": "df -h /"},
                    "call_df",
                ),
                say(
                    "Measuring the largest items in ~/Downloads.",
                    "shell__command",
                    {"command": "du -sh ./* | sort -rh | head -n 8", **downloads},
                    "call_du",
                ),
                scripted_finish(answer),
                say(
                    "Moving the two installer images to /mnt/backup/isos. This changes files, "
                    "so it needs your approval.",
                    "shell__command",
                    {
                        "command": "mv -- ubuntu-24.04.1-desktop-amd64.iso "
                        "ubuntu-22.04.4-desktop-amd64.iso /mnt/backup/isos/",
                        **downloads,
                    },
                    "call_mv",
                ),
                say(
                    "Checking free space again to confirm the result.",
                    "shell__command",
                    {"command": "df -h /"},
                    "call_df_after",
                ),
                scripted_finish(CLEAN_ANSWER, status="completed"),
            ],
            outputs=[ok(DF_BEFORE), ok(DU), ok(""), ok(DF_AFTER)],
        )

    def new_chat(page):
        """Start from an empty conversation, as the "New chat" button does."""
        page.locator("#new-chat-button").click()
        expect(page.locator("#prompt-input")).to_be_visible()
        expect(page.locator(".assistant-answer")).to_have_count(0)

    def submit_prompt(page, text):
        """Type and send a prompt once the composer reports it is ready to submit."""
        # Sending before the agreement status and conversation settings have loaded is
        # refused by the UI (agreement dialog or "Your message can't be sent yet").
        page.wait_for_function("window.SMTOLegal && window.SMTOLegal.canExecute()")
        prompt = page.locator("#prompt-input")
        for _ in range(4):
            page.wait_for_function(
                """() => {
                    const composer = document.querySelector('#composer');
                    const status = document.querySelector('#composer-profile-status');
                    return composer && !composer.hasAttribute('data-profile-loading')
                        && composer.getAttribute('aria-busy') !== 'true'
                        && !(status && status.textContent.trim());
                }"""
            )
            prompt.click()
            prompt.fill(text)
            prompt.press("Enter")
            try:
                expect(prompt).to_have_value("", timeout=5000)
                return
            except AssertionError:
                close = page.locator("#toast").get_by_role(
                    "button", name=re.compile("Close|Dismiss")
                )
                if close.count():
                    close.first.click()
                page.wait_for_timeout(1500)
        raise AssertionError(f"The composer did not accept the prompt {text!r}")

    # ------------------------------------------------------------------ scenes

    def open_details(details):
        """Open a <details> disclosure through its summary, as a click would."""
        if not details.evaluate("el => el.open"):
            details.locator(":scope > summary").click()
            expect(details).to_have_attribute("open", "")

    def place(locator, y):
        """Scroll the element's scroll container so the element's top is at viewport y."""
        locator.evaluate(
            """(el, y) => {
                let parent = el.parentElement;
                while (parent && !(parent.scrollHeight > parent.clientHeight
                        && /(auto|scroll)/.test(getComputedStyle(parent).overflowY))) {
                    parent = parent.parentElement;
                }
                if (parent) parent.scrollTop += el.getBoundingClientRect().top - y;
            }""",
            y,
        )
        locator.page.wait_for_timeout(600)

    def both_themes(shot, name, order, png=False, **meta):
        """Capture light, then switch with the theme button and capture dark.

        png=True also keeps a lossless PNG of the light capture (the hero image).
        """
        for offset, theme in enumerate(("light", "dark")):
            set_theme(shot.page, theme)
            shot.capture(
                f"{name}-{theme}",
                order=order + offset,
                theme=theme,
                png=png and theme == "light",
                **meta,
            )
        set_theme(shot.page, "light")

    def run_disk_task(page):
        new_chat(page)
        submit_prompt(page, DISK_PROMPT)
        expect(page.locator(".assistant-answer").last).to_contain_text(
            "I haven't changed anything", timeout=30000
        )
        page.wait_for_timeout(1500)

    def test_conversation(tmp_path, browser):
        owner, model, gateway = disk_runtime(tmp_path)
        with _live_agent_ui_ctx(
            tmp_path, owner, configure_app=seed_history, use_installation_defaults=True
        ) as base:
            with Shot(browser) as shot:
                page = shot.page
                shot.open(base + "/agent-ui")
                new_chat(page)
                page.locator("#prompt-input").fill(DISK_PROMPT)
                both_themes(
                    shot,
                    "start",
                    10,
                    scene="conversation",
                    title="Start a task",
                    caption=(
                        "A new conversation with a request typed into the composer. The chip under "
                        "the prompt shows the computer (Gateway) the task will run on; earlier "
                        "conversations are listed on the left."
                    ),
                    alt=(
                        "SMTO web UI start screen. A navigation sidebar lists earlier "
                        "conversations; "
                        "the main area shows the heading 'What can I help you do?' and a composer "
                        f"containing the request '{DISK_PROMPT}' with a 'localhost' Gateway chip."
                    ),
                )
                page.locator("#prompt-input").fill("")
                run_disk_task(page)
                place(page.locator("article.turn").last, 122)
                both_themes(
                    shot,
                    "answer",
                    20,
                    scene="conversation",
                    png=True,
                    title="A completed task",
                    caption=(
                        "The model's plan and progress notes, followed by its answer: a table of "
                        "the largest items and a note that nothing was changed."
                    ),
                    alt=(
                        f"SMTO conversation. The request '{DISK_PROMPT}' is followed by the plan "
                        "'Checking free space on the root filesystem first', the note 'Measuring "
                        "the "
                        "largest items in ~/Downloads' and an answer stating that ~/Downloads "
                        "holds "
                        "about 33 GB with 14 GB free on the root filesystem, with a table of the "
                        "five largest items."
                    ),
                )
                submit_prompt(page, CLEAN_PROMPT)
                card = page.locator(".approval-card")
                expect(card).to_be_visible(timeout=30000)
                page.wait_for_timeout(1500)
                place(page.locator("article.turn").last, 122)
                both_themes(
                    shot,
                    "approval",
                    40,
                    scene="conversation",
                    title="Approve before files change",
                    caption=(
                        "A follow-up request that moves files. The task pauses on an approval card "
                        "showing the exact command, with a choice of how widely the decision "
                        "applies."
                    ),
                    alt=(
                        f"SMTO conversation with the request '{CLEAN_PROMPT}'. An 'Approval "
                        "needed' "
                        "card shows the shell command 'mv -- ubuntu-24.04.1-desktop-amd64.iso "
                        "ubuntu-22.04.4-desktop-amd64.iso /mnt/backup/isos/', an 'Apply decision "
                        "to' "
                        "selector set to 'This action', and the buttons 'Approve once', "
                        "'Deny / stop task' and 'Open Permissions'."
                    ),
                )
                card.get_by_role("button", name="Approve once", exact=True).click()
                expect(page.locator(".assistant-answer").last).to_contain_text(
                    "14 GB to 25 GB", timeout=30000
                )
                page.wait_for_timeout(1500)
                place(page.locator("article.turn").last, 122)
                shot.capture(
                    "verified-light",
                    scene="conversation",
                    order=50,
                    theme="light",
                    title="Approved change, then verification",
                    caption=(
                        "After approval the task moves the files, checks free space again and "
                        "reports "
                        "the before-and-after numbers from that second check."
                    ),
                    alt=(
                        f"SMTO conversation with the request '{CLEAN_PROMPT}'. The plan note says "
                        "the "
                        "move needs approval, a later note reads 'Checking free space again to "
                        "confirm "
                        "the result', and the answer says both ISO files were moved to "
                        "/mnt/backup/isos/ and free space on / went from 14 GB to 25 GB."
                    ),
                )

    def test_activity(tmp_path, browser):
        owner, _, _ = disk_runtime(tmp_path)
        # Debug mode (the full activity view) is on from the first page load here.
        with _live_agent_ui_ctx(tmp_path, owner, configure_app=seed_history) as base:
            with Shot(browser) as shot:
                page = shot.page
                shot.open(base + "/agent-ui")
                run_disk_task(page)
                groups = page.locator(".work-disclosure details.prose-activity:has(.command-row)")
                for index in range(groups.count()):
                    open_details(groups.nth(index))
                page.locator(".command-row").last.locator(
                    ".activity-section-toggle", has_text="Tool output"
                ).click()
                page.wait_for_timeout(800)
                place(groups.first, 122)
                both_themes(
                    shot,
                    "activity",
                    30,
                    scene="activity",
                    title="Activity and receipts",
                    caption=(
                        "The same task with Debug mode on. Each step shows the shell command the "
                        "model chose, where it ran (Gateway and folder), its exit status and the "
                        "captured output."
                    ),
                    alt=(
                        "SMTO conversation in Debug mode. An expanded activity group, 'Measuring "
                        "the "
                        "largest items in ~/Downloads', lists two completed shell steps, 'df -h /' "
                        "and "
                        "'du -sh ./* | sort -rh | head -n 8', each with exit 0, and the du output: "
                        "vm-images 18G, two Ubuntu ISO files and smaller items."
                    ),
                )

    NOTES = """# Release planning, 18 November

Attendees: Priya, Sam, Lee, Morgan

- Release candidate is feature complete; QA starts Monday.
- Sam to update the install guide for the new Gateway setup by Friday.
- Lee to rerun the upgrade test on the staging machines.
- Priya to draft the release notes and share them on Wednesday.
- Morgan to book the retrospective for the week after release.
- Open question: keep the old export format for one more release?
"""
    EXISTING_ITEMS = (
        "# Action items\n\n"
        "- [ ] Lee: archive last quarter's test reports\n"
        "- [x] Sam: renew the staging certificates\n"
    )
    NOTES_PROMPT = "Read meeting-notes.md and save the action items to action-items.md"
    QUESTION = {
        "question": (
            "I found 4 action items in meeting-notes.md. action-items.md already exists and "
            "lists 2 items. How should I save the new ones?"
        ),
        "options": [
            {"id": "append", "label": "Append them below the existing items"},
            {"id": "replace", "label": "Replace the file with the new list"},
            {"id": "dated", "label": "Save them to a new dated file instead"},
        ],
        "allow_other": True,
    }

    def notes_runtime(tmp_path):
        from tests.test_native_conversation import runtime, scripted_finish

        return runtime(
            tmp_path,
            [
                say(
                    "Reading the meeting notes.",
                    "shell__command",
                    {"command": "cat meeting-notes.md"},
                    "call_notes",
                ),
                say(
                    "Checking what action-items.md already contains.",
                    "shell__command",
                    {"command": "cat action-items.md"},
                    "call_items",
                ),
                say(
                    "I need one decision before writing the file.", "ask_user", QUESTION, "call_ask"
                ),
                scripted_finish("Appended 4 action items to `action-items.md`."),
            ],
            outputs=[ok(NOTES), ok(EXISTING_ITEMS)],
        )

    def test_ask_user(tmp_path, browser):
        owner, _, _ = notes_runtime(tmp_path)
        with _live_agent_ui_ctx(
            tmp_path, owner, configure_app=seed_history, use_installation_defaults=True
        ) as base:
            with Shot(browser) as shot:
                page = shot.page
                shot.open(base + "/agent-ui")
                new_chat(page)
                submit_prompt(page, NOTES_PROMPT)
                field = page.get_by_role("textbox", name="Other answer", exact=True)
                expect(field).to_be_visible(timeout=30000)
                page.wait_for_timeout(1500)
                place(page.locator("article.turn").last, 122)
                shot.capture(
                    "ask-user-light",
                    scene="ask-user",
                    order=60,
                    theme="light",
                    title="The model asks before choosing",
                    caption=(
                        "When a choice belongs to the user, the model asks. The question card "
                        "offers "
                        "suggested answers and a free-text field, and the task waits for the reply."
                    ),
                    alt=(
                        f"SMTO conversation with the request '{NOTES_PROMPT}'. After two progress "
                        "notes, a question card asks how to save 4 new action items because "
                        "action-items.md already lists 2, with three suggested answers (append, "
                        "replace, save to a new dated file) and an 'Other answer' field."
                    ),
                )

    def test_capabilities(tmp_path, browser):
        owner, _, _ = disk_runtime(tmp_path)
        with _live_agent_ui_ctx(tmp_path, owner, configure_app=seed_history) as base:
            with Shot(browser) as shot:
                page = shot.page
                shot.open(base + "/agent-ui")
                new_chat(page)
                page.locator("#composer-controls-toggle").click()
                expect(page.locator("#capability-button")).to_be_enabled()
                page.locator("#capability-button").click()
                dialog = page.get_by_role("dialog", name="Capabilities", exact=True)
                expect(dialog).to_be_visible()
                expect(dialog.get_by_text("Loading capabilities…")).to_have_count(0, timeout=20000)
                page.wait_for_timeout(1500)
                # Start the list at the skills this fixture Gateway provides; the controller
                # management skills above them report "unavailable" in the test harness.
                place(
                    dialog.get_by_text("Register and retrieve immutable run-generated files."), 330
                )
                shot.capture(
                    "capabilities-light",
                    scene="capabilities",
                    order=70,
                    theme="light",
                    title="Capabilities",
                    caption=(
                        "The Capabilities dialog lists the skills and tools the model may use, "
                        "with include and exclude controls and an 'Apply to' scope selector."
                    ),
                    alt=(
                        "SMTO Capabilities dialog over the chat: an 'Automatic Capability "
                        "Selection' switch, an 'Apply to' selector set to Global, and skills "
                        "such as Artifacts, Agent Introspection, Task Context and Docs, each "
                        "with include and exclude controls or marked 'Built in · Always enabled'."
                    ),
                )

    def test_settings(tmp_path, browser):
        from tests.e2e.settings_navigation import select_settings_section

        owner, _, _ = disk_runtime(tmp_path)
        with _live_agent_ui_ctx(tmp_path, owner, use_installation_defaults=True) as base:
            with Shot(browser) as shot:
                page = shot.page
                shot.open(base + "/settings", ready="#settings-section-nav a")
                section = select_settings_section(page, "model-routing")
                main = section.locator("details").filter(has_text="Main").first
                open_details(main)
                page.wait_for_timeout(1000)
                place(section, 96)
                shot.capture(
                    "settings-models-light",
                    scene="settings",
                    order=80,
                    theme="light",
                    title="Model routing",
                    caption=(
                        "Model routing in Settings. The Main model entry is open, showing its "
                        "endpoint, automatic model selection, API key and generation profile."
                    ),
                    alt=(
                        "SMTO Settings page with the Model routing section open. The Main model "
                        "entry shows the endpoint http://127.0.0.1:8080/v1, an Auto-select model "
                        "switch turned on, an empty API key field and the 'smTO recommended' "
                        "generation profile; a list of settings sections is on the left."
                    ),
                )
                section = select_settings_section(page, "gateways")
                page.wait_for_timeout(1000)
                # Release discovery is switched off for the capture (no GitHub request), so
                # fold its "Update check results" panel instead of showing that it is off.
                results = section.locator("details").filter(
                    has=page.locator(":scope > summary", has_text="Update check results")
                )
                if results.count() and results.first.evaluate("el => el.open"):
                    results.first.locator(":scope > summary").click()
                place(section, 96)
                set_theme(page, "dark")
                shot.capture(
                    "settings-gateways-dark",
                    scene="settings",
                    order=81,
                    theme="dark",
                    title="Gateways",
                    caption=(
                        "The Gateways section lists the computers SMTO can run tasks on, with "
                        "their "
                        "connection status, an on/off switch and software update status."
                    ),
                    alt=(
                        "SMTO Settings page in dark mode with the Gateways section: a table with "
                        "two "
                        "Gateways, 'localhost' and 'LocalMachine', both Connected and enabled, and "
                        "buttons to add a Gateway and check for updates."
                    ),
                )
                set_theme(page, "light")

    WORKFLOWS = [
        (
            "Weekly disk space report",
            "Check free space on every enabled Gateway and list the five largest folders "
            "under ~/Downloads and /var/log. Summarise anything above 80% use.",
        ),
        (
            "Nightly backup check",
            "Read the latest nightly backup log and report failed or skipped jobs.",
        ),
        (
            "Meeting notes to action items",
            "Read meeting-notes.md and append new action items to action-items.md.",
        ),
    ]

    def enable_events(monkeypatch, store):
        """Turn scheduled events on for this controller without starting real runs."""
        monkeypatch.setattr(
            "agent_runtime.events.scheduler.AgentEventScheduler.start", lambda _: None
        )

        def configure(app):
            services = app.state.agent_services
            monkeypatch.setattr(app.state.conversation_task_queue, "start", lambda: None)
            monkeypatch.setattr(services.tasks, "_queue_or_start_task", lambda *a, **k: {})
            services.settings.agent_events_enabled = True
            services.controls._apply_runtime_control_values({"agent_events_enabled": True})
            store["services"] = services

        return configure

    def test_workflows(tmp_path, browser, monkeypatch):
        owner, _, _ = disk_runtime(tmp_path)
        captured = {}
        configure = enable_events(monkeypatch, captured)
        with _live_agent_ui_ctx(tmp_path, owner, configure_app=configure) as base:
            with Shot(browser) as shot:
                page = shot.page
                shot.open(base + "/workflows", ready="#new-workflow")
                set_theme(page, "light")
                for name, prompt in WORKFLOWS:
                    page.locator("#new-workflow").click()
                    editor = page.locator("#workflow-editor")
                    editor.get_by_label("Name", exact=True).fill(name)
                    editor.get_by_label("Prompt", exact=True).fill(prompt)
                    editor.get_by_role("button", name="Save workflow", exact=True).click()
                    expect(editor).not_to_be_visible()
                expect(page.locator(".schedule-card")).to_have_count(len(WORKFLOWS))
                page.wait_for_timeout(1000)
                shot.capture(
                    "workflows-light",
                    scene="workflows",
                    order=90,
                    theme="light",
                    title="Workflows",
                    caption=(
                        "Saved workflows are reusable requests. Each card can be run now, "
                        "scheduled, edited or opened to see its run history."
                    ),
                    alt=(
                        "SMTO Workflows page listing three saved workflows, 'Weekly disk space "
                        "report', 'Nightly backup check' and 'Meeting notes to action items', each "
                        "with its prompt and buttons including Run now, Schedule, Edit and History."
                    ),
                )

    def seed_schedules(services):
        from agent_runtime.events.models import AgentEventCreate
        from agent_runtime.events.scope import scheduled_agent_scope

        store = services.event_store
        gateway = services.gateway_store.list()[0]
        scope = scheduled_agent_scope(
            {"llm_model": "auto", "gateway_id": gateway.gateway_id, "gateway_node": gateway.node}
        )
        report = store.create_event(
            AgentEventCreate(
                title="Weekly disk space report",
                prompt="Check free space and list the largest folders under ~/Downloads.",
                schedule_type="calendar",
                recurrence={"frequency": "weekly", "time": "08:00", "weekdays": [0]},
                timezone="UTC",
                context=scope,
            )
        )
        backup = store.create_event(
            AgentEventCreate(
                title="Nightly backup check",
                prompt="Read the latest backup log and report failed jobs.",
                schedule_type="calendar",
                recurrence={"frequency": "daily", "time": "06:30"},
                timezone="UTC",
                context=scope,
            )
        )
        store.create_event(
            AgentEventCreate(
                title="Rotate old build archives",
                prompt="Move build archives older than 90 days to /mnt/backup/builds.",
                status="paused",
                schedule_type="calendar",
                recurrence={
                    "frequency": "absolute_monthly",
                    "time": "02:00",
                    "day_of_month": 1,
                    "start_date": datetime.date.today().replace(day=1).isoformat(),
                },
                timezone="UTC",
            )
        )
        store.create_event(
            AgentEventCreate(
                title="Stretch break",
                prompt="Reminder",
                notification_message="Time for a short break.",
                action_type="notification",
                interval_seconds=7200,
            )
        )
        now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
        for event, days in ((backup, 1), (report, 7)):
            ran = (now - datetime.timedelta(days=days)).isoformat().replace("+00:00", "Z")
            run = store.create_run(event_id=event.event_id, scheduled_for=ran, status="completed")
            store.update_run(
                run.event_run_id,
                completed_at=ran,
                final_response_preview="Completed without errors.",
            )

    def test_schedules(tmp_path, browser, monkeypatch):
        owner, _, _ = disk_runtime(tmp_path)
        captured = {}
        enable = enable_events(monkeypatch, captured)

        def configure(app):
            enable(app)
            seed_schedules(captured["services"])

        with _live_agent_ui_ctx(tmp_path, owner, configure_app=configure) as base:
            with Shot(browser, zone="UTC", theme="dark") as shot:
                page = shot.page
                shot.open(base + "/schedules", ready="#schedule-count")
                expect(page.locator("#schedule-count")).not_to_have_text("Loading schedules…")
                expect(page.locator(".schedule-card")).to_have_count(4)
                set_theme(page, "dark")
                page.wait_for_timeout(1000)
                shot.capture(
                    "schedules-dark",
                    scene="schedules",
                    order=100,
                    theme="dark",
                    title="Schedules",
                    caption=(
                        "Scheduled tasks and reminders with their recurrence, status and most "
                        "recent run. Schedules can be paused, edited or run on demand."
                    ),
                    alt=(
                        "SMTO Schedules page in dark mode listing four schedules: 'Weekly disk "
                        "space report', 'Nightly backup check', a paused 'Rotate old build "
                        "archives' and a 'Stretch break' reminder, each with recurrence and status."
                    ),
                )
                set_theme(page, "light")

    @contextlib.contextmanager
    def live_manual():
        import uvicorn
        from manual.app import create_app as manual_app

        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        server = uvicorn.Server(
            uvicorn.Config(
                manual_app(include_generated=False),
                host="127.0.0.1",
                port=port,
                log_level="error",
            )
        )
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        deadline = time.monotonic() + 20
        while not server.started and time.monotonic() < deadline:
            time.sleep(0.05)
        assert server.started, "The manual server did not start."
        try:
            yield f"http://127.0.0.1:{port}"
        finally:
            server.should_exit = True
            thread.join(5)

    def test_manual(browser):
        with live_manual() as base:
            with Shot(browser) as shot:
                page = shot.page
                page.goto(base + "/manual")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1500)
                shot.capture(
                    "manual-light",
                    scene="manual",
                    order=110,
                    theme="light",
                    title="Built-in manual",
                    caption=(
                        "The product manual ships with SMTO and is searchable. Pages are listed "
                        "on the left, with an outline and related pages on the right."
                    ),
                    alt=(
                        "SMTO Manual home page: a list of manual pages on the left including "
                        "'Install and startup' and 'Configuration and storage', the 'smTO "
                        "Manual' introduction in the centre, and outline and related-page "
                        "panels on the right."
                    ),
                )

    def scroll_to_end(page):
        """Scroll every scrolled container to its end, as reading the latest reply does."""
        page.evaluate(
            """() => {
                for (const el of document.querySelectorAll('*')) {
                    if (el.scrollHeight > el.clientHeight + 4
                            && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
                        el.scrollTop = el.scrollHeight;
                    }
                }
                window.scrollTo(0, document.documentElement.scrollHeight);
            }"""
        )
        page.wait_for_timeout(800)

    def test_phone(tmp_path, browser):
        owner, _, _ = disk_runtime(tmp_path, answer=PHONE_DISK_ANSWER)
        with _live_agent_ui_ctx(
            tmp_path, owner, configure_app=seed_history, use_installation_defaults=True
        ) as base:
            with Shot(browser, phone=True) as shot:
                page = shot.page
                shot.open(base + "/agent-ui?ui=mobile", ready="#message")
                page.locator("#new-chat").click()
                page.wait_for_timeout(1000)
                page.locator("#message").fill(DISK_PROMPT)
                shot.capture(
                    "phone-start-light",
                    scene="phone",
                    order=120,
                    theme="light",
                    title="On a phone",
                    caption=(
                        "The phone layout of the same web UI, with a request typed into the "
                        "message box."
                    ),
                    alt=(
                        "SMTO on a phone-width screen: the heading 'What can I help you do?' "
                        f"and a message box containing '{DISK_PROMPT}' with a send button."
                    ),
                )
                page.locator("#send").click()
                expect(
                    page.locator("p:visible", has_text="I haven't changed anything.")
                ).to_have_count(1, timeout=30000)
                page.wait_for_timeout(1500)
                set_theme(page, "dark")
                scroll_to_end(page)
                shot.capture(
                    "phone-answer-dark",
                    scene="phone",
                    order=121,
                    theme="dark",
                    title="Answers on a phone",
                    caption=(
                        "A completed task on a phone in dark mode: the answer, built from the "
                        "commands the model ran, and a box to continue the conversation."
                    ),
                    alt=(
                        "SMTO phone layout in dark mode: an answer saying ~/Downloads holds "
                        "about 33 GB with 14 GB free on /, a short list of the largest items, "
                        "and a 'Continue this conversation' box with Continue and Queue buttons."
                    ),
                )
                set_theme(page, "light")
                page.locator("#history").click()
                expect(
                    page.get_by_text("Search chats").or_(page.get_by_placeholder("Search chats"))
                ).to_be_visible()
                page.wait_for_timeout(1000)
                shot.capture(
                    "phone-navigation-light",
                    scene="phone",
                    order=122,
                    theme="light",
                    title="Conversations on a phone",
                    caption=(
                        "The navigation drawer on a phone, with New chat, search and the list "
                        "of conversations."
                    ),
                    alt=(
                        "SMTO phone navigation drawer with App and Conversations tabs, a New chat "
                        "button, a 'Search chats' field and four conversations, the newest "
                        "being the disk-space request."
                    ),
                )

    HISTORY = [
        (
            "Convert quarterly-report.docx to PDF",
            "Saved `quarterly-report.pdf` (12 pages) next to the original.",
            26,
        ),
        (
            "Check the nightly backup log for errors",
            "The last 7 nightly backups completed without errors.",
            50,
        ),
        (
            "Summarise yesterday's web server error log",
            "Found 42 errors, 38 of them HTTP 502 responses between 02:10 and 02:25.",
            75,
        ),
    ]

    def seed_history(app):
        """A few earlier conversations, so the sidebar looks like a used installation."""
        from unittest import mock

        import agent_runtime.api.memory_conversations as conversations

        store = app.state.agent_conversation_store
        now = datetime.datetime.now(datetime.timezone.utc)
        for index, (prompt, answer, hours) in enumerate(HISTORY):
            stamp = (now - datetime.timedelta(hours=hours)).isoformat()
            # Record the turn as the store would have at that time.
            with mock.patch.object(conversations, "utc_now_iso", lambda: stamp):
                cid = store.create(prompt)
                store.upsert_turn(
                    cid,
                    request_id=f"history-{index}",
                    prompt=prompt,
                    final_response=answer,
                    created_at=stamp,
                )

    @contextlib.contextmanager
    def _live_agent_ui_ctx(tmp_path, owner, **kwargs):
        from tests.e2e.ui_server import _live_agent_ui

        with _live_agent_ui(tmp_path, agent_runtime=owner, **kwargs) as base:
            yield base


if __name__ == "__main__":
    sys.exit(main())
