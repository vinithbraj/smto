#!/usr/bin/env python3
"""Check a built static SMTO site before it is published.

Standard library only, so the GitHub Pages workflow can run it without installing
anything:

    python3 site/tools/check_site.py site/public --site-url https://vinithbraj.github.io/smto

Checks
------
* every local href/src/poster/data-* URL and meta-refresh target in every HTML page
  resolves to a published file (directories need an index.html);
* same-site #fragments point at an element id that exists in the target page;
* no root-relative URLs outside 404.html (they would break under /smto/);
* CSS url(...) references resolve;
* no rendering-origin placeholder and no link to smtorch.com (or its manual host) is left;
  smtorch.com may appear as text only inside the legal documents;
* required GitHub Pages files exist and the sitemap uses the configured URL.

Exits non-zero and lists every problem when anything fails.
"""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urljoin, urlsplit

URL_ATTRIBUTES = {"href", "src", "poster", "action", "formaction"}
FILE_LIKE = re.compile(r"\.(?:html|css|js|svg|png|webp|jpe?g|avif|gif|ico|txt|md|xml|json)(?:[?#]|$)", re.I)
CSS_URL = re.compile(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)")
SENTINEL = "smto-static-export.invalid"
OFFLINE_HOSTS = ("smtorch.com",)  # covers manual.smtorch.com
REQUIRED = ("index.html", "404.html", ".nojekyll", "faq/index.html", "gallery/index.html",
            "robots.txt", "sitemap.xml")


class PageScan(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.urls: list[tuple[str, str]] = []  # (attribute, value)
        self.ids: set[str] = set()

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        for name, value in attrs:
            if value is None:
                continue
            if name in ("id", "name") and value:
                self.ids.add(value)
            if name in URL_ATTRIBUTES:
                self.urls.append((name, value))
            elif name.startswith("data-") and (value.startswith(("/", "./", "../")) or FILE_LIKE.search(value)):
                self.urls.append((name, value))
        if tag == "meta" and (attributes.get("http-equiv") or "").lower() == "refresh":
            match = re.search(r"url=(.+)$", attributes.get("content") or "", re.I)
            if match:
                self.urls.append(("meta-refresh", match.group(1).strip()))

    handle_startendtag = handle_starttag


def resolve(root: Path, site_path: str) -> Path | None:
    """Map a path under the site root to the file GitHub Pages would serve."""
    relative = unquote(site_path).lstrip("/")
    candidate = root / relative
    if site_path.endswith("/") or relative == "":
        candidate = candidate / "index.html"
    if candidate.is_file():
        return candidate
    if candidate.is_dir() and (candidate / "index.html").is_file():
        return candidate / "index.html"  # GitHub Pages adds the trailing slash
    return None


def check(root: Path, site_url: str | None = None) -> list[str]:
    root = root.resolve()
    problems: list[str] = []
    base_path = "/"
    if site_url:
        base_path = (urlsplit(site_url.rstrip("/")).path or "") + "/"
    for required in REQUIRED:
        if not (root / required).exists():
            problems.append(f"missing required file: {required}")

    html_files = sorted(root.rglob("*.html"))
    ids: dict[Path, set[str]] = {}
    scans: dict[Path, PageScan] = {}
    for path in html_files:
        scan = PageScan()
        scan.feed(path.read_text(encoding="utf-8"))
        scans[path] = scan
        ids[path] = scan.ids

    for path, scan in scans.items():
        relative_page = path.relative_to(root).as_posix()
        page_url = "https://site.invalid" + base_path + relative_page
        for attribute, value in scan.urls:
            label = f"{relative_page}: {attribute}={value!r}"
            if any(host in value for host in OFFLINE_HOSTS):
                problems.append(f"{label} links to smtorch.com, which this edition does not use")
                continue
            parts = urlsplit(value)
            if parts.scheme in {"http", "https", "mailto", "tel", "data", "javascript"} or value.startswith("//"):
                continue
            if value.startswith("/") and relative_page != "404.html":
                problems.append(f"{label} is root-relative and breaks under a base path")
                continue
            if value.startswith("#") or value == "":
                fragment = value[1:]
                if fragment and "=" not in fragment and fragment not in scan.ids:
                    problems.append(f"{label}: no element with id {fragment!r} on this page")
                continue
            absolute = urlsplit(urljoin(page_url, value))
            if not absolute.path.startswith(base_path):
                problems.append(f"{label} escapes the site base path")
                continue
            target = resolve(root, absolute.path[len(base_path) - 1:])
            if target is None:
                problems.append(f"{label} -> {absolute.path} does not exist")
                continue
            fragment = absolute.fragment
            if fragment and "=" not in fragment and target.suffix == ".html":
                if fragment not in ids.get(target, set()):
                    problems.append(f"{label}: {target.relative_to(root)} has no id {fragment!r}")

    for css in sorted(root.rglob("*.css")):
        css_url = "https://site.invalid" + base_path + css.relative_to(root).as_posix()
        for value in CSS_URL.findall(css.read_text(encoding="utf-8", errors="replace")):
            if value.startswith(("data:", "http:", "https:", "#")):
                continue
            absolute = urlsplit(urljoin(css_url, value))
            if resolve(root, absolute.path[len(base_path) - 1:]) is None:
                problems.append(f"{css.relative_to(root)}: url({value}) does not exist")

    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix in {".html", ".txt", ".md", ".xml", ".json", ".js", ".css"}:
            text = path.read_text(encoding="utf-8", errors="replace")
            relative = path.relative_to(root).as_posix()
            if SENTINEL in text:
                problems.append(f"{relative} still contains the rendering placeholder origin")
            # The binding legal documents and the manual's operator guide (which documents the
            # server deployment) keep their wording as plain text. Nothing may link there.
            if "smtorch.com" in text:
                if not relative.startswith(("legal/", "manual/api/manual/document/")):
                    problems.append(f"{relative} mentions smtorch.com")
                elif re.search(r"""(?:href=\\?["']|\]\()https?://[\w.-]*smtorch\.com""", text):
                    problems.append(f"{relative} links to smtorch.com")

    sitemap = root / "sitemap.xml"
    if site_url and sitemap.is_file():
        for loc in re.findall(r"<loc>([^<]+)</loc>", sitemap.read_text(encoding="utf-8")):
            if not loc.startswith(site_url.rstrip("/") + "/"):
                problems.append(f"sitemap.xml: {loc} is not under {site_url}")
            elif resolve(root, urlsplit(loc).path[len(base_path) - 1:]) is None:
                problems.append(f"sitemap.xml: {loc} does not exist in the build")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Check a built static SMTO site.")
    parser.add_argument("root", type=Path, help="built site directory (site/public)")
    parser.add_argument("--site-url", help="public URL the site will be served from")
    args = parser.parse_args()
    problems = check(args.root, args.site_url)
    pages = sum(1 for _ in args.root.rglob("*.html"))
    if problems:
        print(f"{len(problems)} problem(s) in {pages} HTML files:", *problems, sep="\n  ")
        return 1
    print(f"OK: {pages} HTML files checked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
