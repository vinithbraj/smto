#!/usr/bin/env python3
"""Browser-check the built site and capture the screenshots used in site/README.md.

Serves the build under a sub-path (``/smto/``, like GitHub project pages) on a free
local port, visits every page in Chromium, fails on console errors, CSP violations,
page errors or failed requests, and writes WebP screenshots.

    ~/Desktop/openfabric/.venv/bin/python site/tools/capture_site.py            # check + capture
    ~/Desktop/openfabric/.venv/bin/python site/tools/capture_site.py --check-only

Needs Playwright with Chromium (the openfabric virtualenv has both) and Pillow.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import io
import socket
import threading
from pathlib import Path

SITE_DIR = Path(__file__).resolve().parents[1]
BASE = "/smto/"

# (file name, path under the site, viewport, theme, options)
SHOTS = [
    ("home-desktop-light", "", (1440, 900), "light", {}),
    ("home-desktop-dark", "", (1440, 900), "dark", {}),
    ("home-examples-light", "#examples", (1440, 900), "light", {}),
    ("home-how-it-works-dark", "#how-it-works", (1440, 900), "dark", {}),
    ("home-computers-light", "#computers", (1440, 900), "light", {}),
    ("home-control-dark", "#control", (1440, 900), "dark", {}),
    ("home-get-smto-light", "#get-smto", (1440, 900), "light", {}),
    ("gallery-desktop-light", "gallery/", (1440, 900), "light", {}),
    ("gallery-diagrams-dark", "gallery/#diagrams", (1440, 900), "dark", {}),
    ("faq-desktop-light", "faq/", (1440, 900), "light", {}),
    ("manual-desktop-light", "manual/", (1440, 900), "light", {"optional": True}),
    ("manual-desktop-dark", "manual/#doc=install-startup", (1440, 900), "dark", {"optional": True}),
    ("legal-desktop-light", "legal/proprietary-license/", (1440, 900), "light", {}),
    ("home-phone-light", "", (390, 844), "light", {}),
    ("home-phone-dark", "", (390, 844), "dark", {}),
    ("faq-phone-dark", "faq/", (390, 844), "dark", {}),
]


class PagesHandler(http.server.SimpleHTTPRequestHandler):
    """Static file server that answers missing paths like GitHub Pages: 404 + 404.html."""

    not_found: Path | None = None

    def send_error(self, code, message=None, explain=None):
        if code == 404 and self.not_found is not None and self.not_found.is_file():
            body = self.not_found.read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def log_message(self, *args):
        pass


class QuietServer(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        pass  # the browser cancelling a request (e.g. on navigation) is not a site problem


def serve(root: Path):
    """Serve root's parent so the build appears at /smto/ (root is symlinked as 'smto')."""
    mount = Path(SITE_DIR / ".preview")
    mount.mkdir(exist_ok=True)
    link = mount / BASE.strip("/")
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(root.resolve(), target_is_directory=True)
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    PagesHandler.not_found = root.resolve() / "404.html"
    handler = functools.partial(PagesHandler, directory=str(mount))
    server = QuietServer(("127.0.0.1", port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{port}{BASE}", mount


def all_pages(root: Path) -> list[str]:
    pages = []
    for path in sorted(root.rglob("index.html")):
        rel = path.relative_to(root).parent.as_posix()
        pages.append("" if rel == "." else rel + "/")
    return pages


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--root", type=Path, default=SITE_DIR / "public")
    parser.add_argument("--out", type=Path, default=SITE_DIR / "screenshots")
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--scale", type=float, default=2.0, help="device scale factor")
    args = parser.parse_args()

    from PIL import Image
    from playwright.sync_api import sync_playwright

    root = args.root.resolve()
    server, base_url, mount = serve(root)
    problems: list[str] = []
    checked = 0
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()

            def new_page(viewport, theme):
                context = browser.new_context(
                    viewport={"width": viewport[0], "height": viewport[1]},
                    device_scale_factor=args.scale,
                    color_scheme=theme,
                    reduced_motion="reduce",
                )
                page = context.new_page()
                events: list[str] = []
                page.on("console", lambda m: events.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
                page.on("pageerror", lambda e: events.append(f"pageerror: {e}"))
                page.on("requestfailed", lambda r: events.append(f"requestfailed: {r.url} {r.failure}"))
                page.on("response", lambda r: events.append(f"HTTP {r.status}: {r.url}") if r.status >= 400 and r.url.startswith(base_url) else None)
                return context, page, events

            # 1. Every page, light and dark, desktop: no errors of any kind.
            for theme in ("light", "dark"):
                context, page, events = new_page((1280, 800), theme)
                for path in all_pages(root):
                    events.clear()
                    page.goto(base_url + path, wait_until="networkidle")
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    page.wait_for_timeout(150)
                    checked += 1
                    problems += [f"[{theme}] /{path}: {e}" for e in events]
                context.close()

            # 2. A missing path deep in the tree gets the branded 404 with working assets.
            context, page, events = new_page((1280, 800), "light")
            response = page.goto(base_url + "no/such/page/", wait_until="networkidle")
            if response is None or response.status != 404:
                problems.append("missing page did not return 404")
            if not page.locator("link[rel=stylesheet]").count() or page.evaluate(
                "getComputedStyle(document.body).backgroundColor") in ("rgba(0, 0, 0, 0)", ""):
                problems.append("404 page rendered without the site stylesheet")
            # Chrome logs the (intended) 404 of the document itself as a console error;
            # only failures of other resources (stylesheets, scripts, images) count.
            other_failures = [e for e in events if e.startswith("HTTP ") and "no/such/page" not in e]
            problems += [f"404 page: {e}" for e in other_failures]
            problems += [
                f"404 page: {e}" for e in events
                if not e.startswith("HTTP ")
                and not (e.startswith("console.error: Failed to load resource") and not other_failures)
            ]
            # 3. Legacy URL redirects land on the right anchor.
            page.goto(base_url + "how-it-works/", wait_until="networkidle")
            page.wait_for_timeout(300)
            if not page.url.endswith(BASE + "#how-it-works"):
                problems.append(f"legacy redirect landed on {page.url}")
            context.close()

            # 4. Screenshots for the README.
            if not args.check_only:
                args.out.mkdir(parents=True, exist_ok=True)
                for name, path, viewport, theme, options in SHOTS:
                    if path.startswith("manual/") and not (root / "manual" / "index.html").is_file():
                        continue
                    context, page, events = new_page(viewport, theme)
                    # Use the site's own theme preference so the theme picker shows it too.
                    page.add_init_script(f"try{{localStorage.setItem('smto.site.theme','{theme}')}}catch(_){{}}")
                    page.goto(base_url + path, wait_until="networkidle")
                    page.wait_for_timeout(900)
                    png = page.screenshot(full_page=False)
                    image = Image.open(io.BytesIO(png)).convert("RGB")
                    image.save(args.out / f"{name}.webp", "WEBP", quality=82, method=6)
                    problems += [f"screenshot {name}: {e}" for e in events]
                    context.close()
            browser.close()
    finally:
        server.shutdown()
        for child in mount.iterdir():
            child.unlink()
        mount.rmdir()

    print(f"checked {checked} page loads under {BASE}")
    if problems:
        print(f"{len(problems)} problem(s):", *problems, sep="\n  ")
        return 1
    print("OK: no console errors, CSP violations, page errors or failed requests")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
