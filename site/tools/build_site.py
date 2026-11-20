#!/usr/bin/env python3
"""Build the GitHub Pages edition of the SMTO website.

The public website lives in the openfabric repository (``src/smto_site``): a FastAPI
application that renders reviewed content through Jinja templates. This script imports
that application, lets it render every public page exactly as the server would, and
writes the result as a static tree that GitHub Pages can serve from any base path
(``https://<user>.github.io/smto/``, a custom domain, or a local preview).

What the build does
-------------------
* Renders every public page, Markdown/text resource, legal document and fingerprinted
  asset from the website's own registries; nothing is hand-copied.
* Adds a Gallery page (product screenshots + the site's registered diagrams), rendered
  through the same base template, and a "Gallery" item in the main navigation.
* Exports the product manual (``manual.smtorch.com``) to ``manual/`` via
  ``export_manual.py`` and points the site's manual links at it.
* Rewrites root-relative links to relative ones, so the tree works under any base path;
  ``404.html`` uses absolute base-path links because GitHub serves it at any depth.
* Replaces server-only behaviour: 308 redirects become small redirect pages, response
  CSP headers become a ``<meta>`` CSP, robots/sitemap/feed use the GitHub Pages URL.
* Finishes with ``check_site.py`` (link, asset and leftover-URL checks).

Usage (run with the openfabric virtualenv, which has the website's dependencies)::

    ~/Desktop/openfabric/.venv/bin/python site/tools/build_site.py \\
        --source ~/Desktop/openfabric

The output directory (default ``site/public``) is deleted and regenerated on every run.
The openfabric checkout is only read.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree.ElementTree import Element, SubElement, tostring

SITE_DIR = Path(__file__).resolve().parents[1]
TOOLS_DIR = SITE_DIR / "tools"
DEFAULT_SOURCE = Path.home() / "Desktop" / "openfabric"
DEFAULT_SITE_URL = "https://vinithbraj.github.io/smto"
# Rendering origin. Every absolute URL the website renders starts with this value and is
# rewritten afterwards, so no real origin is ever guessed or baked in by accident.
SENTINEL = "https://smto-static-export.invalid"
MANUAL_ORIGINS = ("https://manual.smtorch.com",)
GALLERY_ROUTE = "/gallery"
SCREENSHOT_DIR = Path("screenshots") / "product"

ATTRIBUTE_URL = re.compile(r'(\s(?:href|src|poster|action|formaction|data-[\w-]+)=")([^"]*)(")')
SENTINEL_URL = re.compile(re.escape(SENTINEL) + r"""[^\s"'<>)\]]*""")
MANUAL_URL = re.compile(
    "(?:" + "|".join(re.escape(o) for o in MANUAL_ORIGINS) + r""")[^\s"'<>)\]]*"""
)
MARKDOWN_LINK = re.compile(r"(\]\()(/[^)\s]*)")
MARKDOWN_REFERENCE = re.compile(r"^(\[[^\]]+\]:[ \t]*)(/\S+)", re.M)
INLINE_SCRIPT = re.compile(r"<script(?![^>]*\ssrc=)[^>]*>(.*?)</script>", re.S)

# smtorch.com is not used by this edition. Remove every link to it, and the sentences
# that only send readers there, from the rendered pages. The binding legal documents
# (legal/eula, legal/proprietary-license and their .txt) are published byte-for-byte
# and keep their wording; they contain the address as plain text, not as a link.
SMTORCH = r"https://smtorch\.com/?"
SMTORCH_REMOVALS = (
    # Licensing summary (footer, Get SMTO section, FAQ answers, license page).
    (r"\s*Visit smtorch\.com for details\.", ""),
    # "SMTO website" links (footer, legal page headers, download section).
    (rf'\s*<a href="{SMTORCH}">SMTO website</a>', ""),
    # FAQ answers and the license page.
    (rf'\s*<a href="{SMTORCH}">Visit smtorch\.com</a>\.', ""),
    (rf'Visit <a href="{SMTORCH}">smtorch\.com</a> for commercial licensing information\.\s*', ""),
    (rf'\s*Commercial licensing information is maintained at <a href="{SMTORCH}">smtorch\.com</a>\.', ""),
)
MARKDOWN_MANUAL_LINK = re.compile(r"\[([^\]]+)\]\(https://manual\.smtorch\.com[^)]*\)")


def remove_smtorch(document: str, counts: dict) -> str:
    for pattern, replacement in SMTORCH_REMOVALS:
        document, n = re.subn(pattern, replacement, document)
        counts[pattern] = counts.get(pattern, 0) + n
    return document

GALLERY_COPY = {
    "title": "See SMTO at work",
    "description": (
        "Screenshots of the SMTO workspace and reference diagrams of how a task moves "
        "from your request to a reviewed result."
    ),
    "lede": (
        "A look at the SMTO workspace: asking for a task, following the tool activity, "
        "approving access, and reviewing what actually happened. Below the screenshots are "
        "the reference diagrams behind the design."
    ),
    "screenshots_note": (
        "Captured from a local SMTO installation with sample files and scripted model "
        "responses, so every screen is reproducible. Your own tasks, models and computers "
        "will look different. Select an image to view it full size."
    ),
}


def fingerprint(data: bytes) -> str:
    """Same 16-hex SHA-256 prefix the website uses for its asset URLs."""
    return hashlib.sha256(data).hexdigest()[:16]


def git_info(source: Path) -> dict:
    """Describe the source checkout without changing it."""

    def run(*args):
        try:
            return subprocess.run(
                ["git", "-C", str(source), *args], capture_output=True, text=True, check=True
            ).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            return ""

    return {
        "commit": run("rev-parse", "HEAD"),
        "commit_date": run("log", "-1", "--format=%cI"),
        "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
        "dirty": bool(run("status", "--porcelain", "--", "src/smto_site", "src/manual")),
    }


# --------------------------------------------------------------------------------------
# Rendering through the website's own application
# --------------------------------------------------------------------------------------


def load_website(source: Path, manual: bool):
    """Create the public website app in production mode; return (app, renderer).

    manual: whether the static manual is part of this build. Without it, the
    navigation's link to the (offline) manual host is dropped."""
    sys.path.insert(0, str(source / "src"))
    # The optional CMS replaces the reviewed public pages; the static edition never uses it.
    os.environ.pop("SMTO_CMS_ENABLED", None)
    from jinja2 import ChoiceLoader, FileSystemLoader

    import smto_site.pages as pages_module

    renderers = []
    original_init = pages_module.Renderer.__init__

    def init_with_gallery(self, config, assets):
        """Keep every website template; add the gallery template and its nav item."""
        original_init(self, config, assets)
        self.env.loader = ChoiceLoader([self.env.loader, FileSystemLoader(SITE_DIR / "templates")])
        site_copy = json.loads(json.dumps(self.env.globals["site_copy"]))
        navigation = site_copy["navigation"]
        position = next(
            (i for i, item in enumerate(navigation) if item["label"].lower().startswith("manual")),
            len(navigation),
        )
        navigation.insert(
            position, {"label": "Gallery", "href": GALLERY_ROUTE, "cms_only": False, "button": False}
        )
        if not manual:
            navigation[:] = [item for item in navigation if "smtorch.com" not in item["href"]]
        self.env.globals["site_copy"] = site_copy
        self.env.globals["manual_available"] = manual
        renderers.append(self)

    pages_module.Renderer.__init__ = init_with_gallery
    try:
        from smto_site.app import create_app
        from smto_site.build_content import prepare_content
        from smto_site.config import SiteConfig

        config = SiteConfig(environment="production", base_url=SENTINEL)
        app = create_app(config, content_registry=prepare_content())
    finally:
        pages_module.Renderer.__init__ = original_init
    return app, renderers[-1]


def image_size(path: Path) -> tuple[int, int]:
    from PIL import Image

    with Image.open(path) as image:
        return image.size


def gallery_screenshots(overlay: Path) -> tuple[list, list]:
    """Group manifest entries into theme pairs; split desktop and phone captures."""
    folder = overlay / SCREENSHOT_DIR
    manifest = folder / "manifest.json"
    if not manifest.is_file():
        return [], []
    entries = json.loads(manifest.read_text(encoding="utf-8"))
    if isinstance(entries, dict):
        entries = entries.get("screenshots") or entries.get("scenes") or []
    groups: dict[tuple, dict] = {}
    for index, entry in enumerate(sorted(entries, key=lambda e: (e.get("order", 1e9)))):
        path = folder / entry["file"]
        if not path.is_file():
            print(f"warning: screenshot listed but missing: {path}", file=sys.stderr)
            continue
        viewport = str(entry.get("viewport", "")).lower()
        kind = "phone" if any(k in viewport for k in ("phone", "mobile", "390", "375", "360")) else "desktop"
        theme = "dark" if str(entry.get("theme", "")).lower() == "dark" else "light"
        key = (entry.get("group") or entry["title"], kind)
        width, height = image_size(path)
        data = path.read_bytes()
        group = groups.setdefault(
            key,
            {
                "slug": re.sub(r"[^a-z0-9]+", "-", str(key[0]).lower()).strip("-") + f"-{kind}",
                "title": entry["title"],
                "caption": entry.get("caption", ""),
                "viewport": kind,
                "light": None,
                "dark": None,
                "index": index,
            },
        )
        if group[theme] is None:
            group[theme] = {
                "src": f"/{SCREENSHOT_DIR.as_posix()}/{entry['file']}?v={fingerprint(data)}",
                "alt": entry.get("alt") or entry["title"],
                "width": width,
                "height": height,
            }
    shots = sorted(groups.values(), key=lambda g: g["index"])
    return [s for s in shots if s["viewport"] == "desktop"], [s for s in shots if s["viewport"] == "phone"]


def registered_diagrams(renderer) -> list:
    """Every non-decorative registered figure whose artwork actually ships."""
    from smto_site.visuals import VISUALS

    diagrams = []
    for visual_id, visual in sorted(VISUALS.items()):
        if visual.decorative:
            continue
        if all(variant.filename in renderer.assets for variant in visual.variants.values()):
            diagrams.append((visual_id, visual))
    return diagrams


def render_gallery(renderer, overlay: Path, overlay_assets: dict):
    desktop, phone = gallery_screenshots(overlay)
    diagrams = registered_diagrams(renderer)
    page = renderer.html(
        "gallery.html",
        GALLERY_ROUTE,
        GALLERY_COPY["title"],
        GALLERY_COPY["description"],
        seo_title="Gallery — SMTO screenshots and diagrams",
        lede=GALLERY_COPY["lede"],
        screenshots_note=GALLERY_COPY["screenshots_note"],
        screenshots=desktop,
        mobile_screenshots=phone,
        diagrams=diagrams,
        gallery_assets=overlay_assets,
    )
    return page, {"desktop": len(desktop), "phone": len(phone), "diagrams": len(diagrams)}


# --------------------------------------------------------------------------------------
# URL mapping
# --------------------------------------------------------------------------------------


class Linker:
    """Map website URLs to their published location on the static site."""

    def __init__(self, site_url: str, html_routes: set[str], files: set[str], manual: bool):
        self.site_url = site_url.rstrip("/")
        self.base_path = (urlsplit(self.site_url).path.rstrip("/") or "") + "/"
        self.html_routes = html_routes
        self.files = files
        self.manual = manual
        self.unresolved: set[str] = set()

    def target(self, path: str) -> str:
        """Root-relative path (no query/fragment) -> path relative to the site root."""
        if path in ("", "/"):
            return ""
        normalized = path.rstrip("/") or "/"
        if normalized in self.html_routes:
            return normalized[1:] + "/"
        if normalized[1:] in self.files:
            return normalized[1:]
        if self.manual and (normalized == "/manual" or normalized.startswith("/manual/")):
            return normalized[1:] + ("/" if normalized == "/manual" else "")
        self.unresolved.add(path)
        return path[1:]

    @staticmethod
    def split(url: str) -> tuple[str, str, str]:
        path, _, fragment = url.partition("#")
        path, _, query = path.partition("?")
        return path, ("?" + query if query else ""), ("#" + fragment if fragment else "")

    def join(self, target: str, query: str, fragment: str, prefix: str | None) -> str:
        base = self.site_url + "/" if prefix is None else prefix
        url = base + target + query + fragment
        if url == "" or url.startswith("?"):
            return "./" + url
        return url

    def map(self, url: str, prefix: str | None) -> str:
        """prefix=None gives an absolute URL; otherwise prefix is '', '../', ... or a base path."""
        if url.startswith(SENTINEL):
            path, query, fragment = self.split(url[len(SENTINEL):] or "/")
            return self.join(self.target(path or "/"), query, fragment, None)
        for origin in MANUAL_ORIGINS:
            if url == origin or url.startswith((origin + "/", origin + "#", origin + "?")):
                if not self.manual:
                    return url
                path, _query, fragment = self.split(url[len(origin):])
                if path.rstrip("/") in ("", "/manual"):
                    return self.join("manual/", "", fragment, prefix)
                self.unresolved.add(url)
                return url
        if url.startswith("/") and not url.startswith("//"):
            path, query, fragment = self.split(url)
            return self.join(self.target(path), query, fragment, prefix)
        return url

    def rewrite_html(self, text: str, prefix: str) -> str:
        text = SENTINEL_URL.sub(lambda m: self.map(m.group(0), None), text)
        return ATTRIBUTE_URL.sub(
            lambda m: m.group(1) + self.map(html.unescape(m.group(2)), prefix).replace("&", "&amp;") + m.group(3),
            text,
        )

    def rewrite_text(self, text: str, markdown: bool = False) -> str:
        """Plain-text resources are read outside the site, so they get absolute URLs."""
        text = SENTINEL_URL.sub(lambda m: self.map(m.group(0), None), text)
        text = MANUAL_URL.sub(lambda m: self.map(m.group(0), None), text)
        if markdown:
            text = MARKDOWN_LINK.sub(lambda m: m.group(1) + self.map(m.group(2), None), text)
            text = MARKDOWN_REFERENCE.sub(lambda m: m.group(1) + self.map(m.group(2), None), text)
        return text


def published_file(route: str) -> str:
    """Where an HTML route is written: '/' -> index.html, '/faq' -> faq/index.html."""
    return "index.html" if route == "/" else route.strip("/") + "/index.html"


def depth_prefix(file_path: str) -> str:
    return "../" * file_path.count("/")


def meta_csp(page_csp: str, document: str) -> str:
    """Server CSP as a <meta>: hash the final inline scripts; drop header-only directives."""
    hashes = " ".join(
        "'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
        for body in INLINE_SCRIPT.findall(document)
    )
    directives = []
    for directive in page_csp.split(";"):
        directive = directive.strip()
        name = directive.split(" ", 1)[0]
        if not directive or name in {"frame-ancestors", "report-uri", "sandbox"}:
            continue
        if name == "script-src":
            directive = "script-src 'self'" + (" " + hashes if hashes else "")
        directives.append(directive)
    return "; ".join(directives)


def add_meta_csp(document: str, csp: str) -> str:
    tag = f'<meta http-equiv="Content-Security-Policy" content="{html.escape(csp, quote=False)}">'
    marker = '<meta charset="utf-8">'
    if marker not in document:
        raise ValueError("Page has no <meta charset> to anchor the CSP")
    return document.replace(marker, marker + "\n  " + tag, 1)


REDIRECT_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'">
  <title>Redirecting · SMTO</title>
  <meta name="robots" content="noindex">
  <link rel="canonical" href="{absolute}">
  <meta http-equiv="refresh" content="0; url={relative}">
</head>
<body>
  <p>This page has moved to <a href="{relative}">{absolute}</a>.</p>
</body>
</html>
"""


# --------------------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------------------


def safe_reset(out: Path) -> None:
    out = out.resolve()
    if out.name != "public" or out == out.parent or (out / ".git").exists():
        raise SystemExit(f"Refusing to clear unexpected output directory: {out}")
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)


def export_manual_into(source: Path, destination: Path):
    """Run the manual exporter if it is present; return its summary or None."""
    if not (TOOLS_DIR / "export_manual.py").is_file():
        return None
    sys.path.insert(0, str(TOOLS_DIR))
    from export_manual import export_manual

    return export_manual(source, destination)


def build(args) -> dict:
    source = args.source.expanduser().resolve()
    out = args.out.expanduser().resolve()
    overlay = args.overlay.expanduser().resolve()
    site_url = args.site_url.rstrip("/")
    if not (source / "src" / "smto_site" / "app.py").is_file():
        raise SystemExit(f"{source} does not look like an openfabric checkout (src/smto_site missing)")

    safe_reset(out)
    # The manual goes first: whether it exists decides the site's manual links.
    manual_summary = None
    if not args.no_manual:
        manual_summary = export_manual_into(source, out / "manual")
        if manual_summary is None:
            print("warning: tools/export_manual.py not found; building without the manual", file=sys.stderr)

    app, renderer = load_website(source, manual=manual_summary is not None)
    from smto_site.config import PACKAGE

    pages = app.state.pages

    # 1. Collect every published output in memory first, so links can be checked as they
    #    are rewritten.
    html_pages: dict[str, object] = {}  # route -> Page
    files: dict[str, bytes | Path] = {}  # relative path -> content or source path
    skipped = []
    for route, page in sorted(pages.items()):
        if page.status != 200:
            skipped.append(f"{route} ({page.status})")
            continue
        if page.media_type == "text/html":
            html_pages[route] = page
        else:
            files[route.lstrip("/")] = page.body

    for name, url in sorted(app.state.asset_urls.items()):
        files["static/" + name] = PACKAGE / "static" / name

    overlay_assets = {}
    for path in sorted((overlay / "static").glob("*")) if (overlay / "static").is_dir() else []:
        if path.is_file():
            files["static/" + path.name] = path
            overlay_assets[path.name] = f"/static/{path.name}?v={fingerprint(path.read_bytes())}"
    shots_dir = overlay / SCREENSHOT_DIR
    if shots_dir.is_dir():
        for path in sorted(shots_dir.iterdir()):
            if path.suffix.lower() in {".webp", ".png", ".jpg", ".jpeg", ".avif"}:
                files[(SCREENSHOT_DIR / path.name).as_posix()] = path

    gallery_page, gallery_counts = render_gallery(renderer, overlay, overlay_assets)
    html_pages[GALLERY_ROUTE] = gallery_page

    # Legacy routes the server answers with 308 redirects (aliases resolved to one hop).
    redirects = dict(app.state.redirects)
    for alias, target in app.state.content.redirects.items():
        redirects.setdefault(alias, redirects.get(target, target))
    redirects = {k: v for k, v in redirects.items() if k not in html_pages}

    linker = Linker(
        site_url,
        html_routes=set(html_pages) | set(redirects),
        files=set(files),
        manual=manual_summary is not None,
    )

    # 2. HTML pages: relative links, no smtorch.com links, meta CSP.
    removal_counts: dict = {}
    for route, page in html_pages.items():
        target = published_file(route)
        document = linker.rewrite_html(page.body.decode("utf-8"), depth_prefix(target))
        document = remove_smtorch(document, removal_counts)
        document = add_meta_csp(document, meta_csp(page.csp, document))
        files[target] = document.encode("utf-8")

    for route, destination in sorted(redirects.items()):
        target = published_file(route)
        relative = linker.map(destination, depth_prefix(target))
        absolute = linker.map(destination, None)
        files[target] = REDIRECT_PAGE.format(
            relative=html.escape(relative), absolute=html.escape(absolute)
        ).encode("utf-8")

    # 404.html is served for any missing path at any depth, so it needs absolute paths.
    not_found = renderer.error(404)
    document = linker.rewrite_html(not_found.body.decode("utf-8"), linker.base_path)
    document = remove_smtorch(document, removal_counts)
    files["404.html"] = add_meta_csp(document, meta_csp(not_found.csp, document)).encode("utf-8")
    for pattern, count in removal_counts.items():
        if count == 0:  # upstream wording changed; check_site.py catches anything left over
            print(f"warning: smtorch.com removal pattern matched nothing: {pattern}", file=sys.stderr)

    # 3. Text resources get absolute URLs (they are read outside the site's pages).
    for path in list(files):
        content = files[path]
        if isinstance(content, Path) or path.startswith("legal/"):
            continue  # assets and legal texts are published byte-for-byte
        if path.endswith(".md"):
            text = content.decode("utf-8")
            if manual_summary is None:  # no manual in this build: keep the label, drop the link
                text = MARKDOWN_MANUAL_LINK.sub(r"\1", text)
            files[path] = linker.rewrite_text(text, markdown=True).encode("utf-8")
        elif path.endswith((".txt", ".xml")) and not path.endswith("robots.txt"):
            files[path] = linker.rewrite_text(content.decode("utf-8")).encode("utf-8")

    llms = files["llms.txt"].decode("utf-8")
    faq_line = f"- [Frequently asked questions]({site_url}/faq/)"
    extra = [faq_line, f"- [Gallery: screenshots and diagrams]({site_url}/gallery/)"]
    if manual_summary is not None:
        extra.append(f"- [Product manual]({site_url}/manual/)")
    files["llms.txt"] = llms.replace(faq_line, "\n".join(extra)).encode("utf-8")

    indexable = ["/", "/faq", GALLERY_ROUTE] + (["/manual"] if manual_summary is not None else [])
    urlset = Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for route in indexable:
        loc = site_url + "/" + (route.strip("/") + "/" if route != "/" else "")
        SubElement(SubElement(urlset, "url"), "loc").text = loc
    files["sitemap.xml"] = tostring(urlset, encoding="utf-8", xml_declaration=True)
    files["robots.txt"] = (
        "User-agent: *\nAllow: /\n"
        f"Disallow: {linker.base_path}docs/search\n"
        f"Sitemap: {site_url}/sitemap.xml\n"
    ).encode("utf-8")
    files[".nojekyll"] = b""
    if args.cname:
        files["CNAME"] = (args.cname.strip() + "\n").encode("utf-8")

    # 4. Write.
    for path, content in sorted(files.items()):
        destination = out / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, Path):
            shutil.copyfile(content, destination)
        else:
            destination.write_bytes(content)

    if linker.unresolved:
        print("warning: unresolved site links:", *sorted(linker.unresolved), sep="\n  ", file=sys.stderr)
    summary = {
        "site_url": site_url + "/",
        "source": {"repository": "openfabric", **git_info(source)},
        "html_pages": sorted(html_pages),
        "redirect_pages": len(redirects),
        "files_written": sum(1 for p in out.rglob("*") if p.is_file()),
        "bytes_written": sum(p.stat().st_size for p in out.rglob("*") if p.is_file()),
        "gallery": gallery_counts,
        "manual": manual_summary,
        "skipped_routes": skipped,
        "unresolved_links": sorted(linker.unresolved),
    }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="openfabric checkout")
    parser.add_argument("--out", type=Path, default=SITE_DIR / "public", help="output directory (wiped)")
    parser.add_argument("--overlay", type=Path, default=SITE_DIR / "overlay", help="extra assets")
    parser.add_argument("--site-url", default=DEFAULT_SITE_URL, help="public URL the site is served from")
    parser.add_argument("--cname", help="custom domain to write to CNAME (also pass a matching --site-url)")
    parser.add_argument("--no-manual", action="store_true", help="skip the static manual export")
    parser.add_argument("--require-manual", action="store_true", help="fail if the manual cannot be exported")
    parser.add_argument("--skip-check", action="store_true", help="do not run check_site.py afterwards")
    args = parser.parse_args()

    summary = build(args)
    if args.require_manual and summary["manual"] is None:
        raise SystemExit("Manual export was required but did not run")
    (SITE_DIR / "build-info.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "html_pages"}, indent=2))
    if not args.skip_check:
        sys.path.insert(0, str(TOOLS_DIR))
        from check_site import check

        problems = check(args.out.expanduser().resolve(), site_url=args.site_url)
        if problems:
            print(f"check_site: {len(problems)} problem(s)", *problems, sep="\n  ", file=sys.stderr)
            return 1
        print("check_site: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
