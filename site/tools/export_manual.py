#!/usr/bin/env python3
"""Export the public SMTO product manual as a static folder for GitHub Pages.

    python site/tools/export_manual.py --source ~/Desktop/openfabric --out site/public/manual

``export_manual(source_root, out_dir)`` renders the manual once, in-process, the way the
public website container runs it (``python -m manual.cli --bundled`` in
``src/smto_site/container.py``): authored content plus build-time generated references,
product branding, no saved Agent name and no controller URL. Nothing is served and no
port is opened; requests go through FastAPI's TestClient.

The result is a self-contained folder that works under any base path:

    manual/
      index.html                      the rendered /manual page, every URL made relative
      static/                         app.js, app.css, Mermaid, the shared UI modules, branding
      static/static-manual.js         shim, loaded first (copied from export_manual_shim.js);
                                      it also stands in for manual_links.js, which is omitted
      static/static-site.css          static-only presentation overrides
      static/page-inline-N.js         inline <script> blocks of the page, moved to files
      api/agent/errors/client.js      browser error catalog (/api/agent/errors/client.js)
      api/manual/catalog.json         /api/manual/catalog (groups list their documents by kind)
      api/manual/tags.json            /api/manual/tags
      api/manual/errors.json          the API's 404 and 400 answers for unknown/invalid ids
      api/manual/document/<id>.json   /api/manual/document/<id>, internal links rewritten
      api/manual/related/<id>.json    /api/manual/related/<id>?limit=12 as [id, score] pairs
      api/manual/search-index.json    data for client-side /api/manual/search

The manual's own app.js is not modified. The shim answers its /api/manual/* requests from
the files above, implements search in the browser with the server's ranking rules, and
keeps every other /api/* request off the network.

Re-running against the same source produces byte-identical output. Only ``out_dir`` is
replaced, and only when it is named ``manual`` and is empty or a previous export.
"""

from __future__ import annotations

import argparse
import bisect
import contextlib
import hashlib
import html
import json
import logging
import os
import posixpath
import re
import shutil
import sys
import tempfile
import time
import warnings
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote, urlencode, urlsplit

TOOLS_DIR = Path(__file__).resolve().parent
SHIM_SOURCE = TOOLS_DIR / "export_manual_shim.js"
MARKER = "smto-static-manual"
PUBLIC_HOST = "smtorch.com"
PUBLIC_ORIGIN = f"https://manual.{PUBLIC_HOST}"  # base URL for the in-process requests
RELATED_LIMIT = 12  # the API's maximum; the page asks for 6
# Production settings that would personalise the page or point it at a local controller.
PRIVATE_ENVIRONMENT = (
    "SMTO_CONTROLLER_URL",
    "SMTO_NAVIGATION_PORT",
    "AOR_PORT",
    "SMTO_NAVIGATION_INFERENCE",
    "SMTO_BRANDING_PATH",
    "JARVMKS_BRANDING_PATH",
)
STATIC_SITE_CSS = """\
/* Static manual only (site/tools/export_manual.py): no SMTO installation is reachable, so
   destinations that need one are dropped from the App navigation, and the header wordmark
   links back to the site root. */
#product-navigation-menu [aria-disabled="true"] { display: none; }
#product-navigation-menu .product-navigation-group:not(:has(a[href])) { display: none; }
.product-navigation-brand a.static-home-link { color: inherit; text-decoration: none; }
.product-navigation-brand a.static-home-link:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 4px; }
"""
# Shared modules the shim replaces: manual_links.js only builds links to the (offline) public
# manual host for non-local pages; the shim defines window.SMTOManualLinks for this copy.
REPLACED_BY_SHIM = ("manual_links.js",)
JSON_SEPARATORS = (",", ":")
RUN_RE = re.compile(r"[a-z0-9_]{2,}")  # maximal runs of characters a search token can contain
DOC_FILE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,119}$")
ANCHOR_RE = re.compile(r'<a href="([^"]*)"([^>]*)>(.*?)</a>', re.S)


class ExportError(RuntimeError):
    """The source or the output directory is not in the expected state."""


def _dump(value) -> bytes:
    """Serialize like Starlette's JSONResponse (compact, UTF-8)."""
    return json.dumps(
        value, ensure_ascii=False, allow_nan=False, separators=JSON_SEPARATORS
    ).encode("utf-8")


# --------------------------------------------------------------------------- environment


@contextlib.contextmanager
def _source_imports(source_root: Path):
    """Import the manual from ``<source>/src``; refuse a copy imported from elsewhere."""
    src = str(source_root / "src")
    added = src not in sys.path
    if added:
        sys.path.insert(0, src)
    try:
        import manual

        location = Path(manual.__file__).resolve()
        if not location.is_relative_to(Path(src).resolve()):
            raise ExportError(f"'manual' is already imported from {location}, not {src}")
        yield
    finally:
        if added and src in sys.path:
            sys.path.remove(src)


@contextlib.contextmanager
def _public_environment():
    """Hide settings that would make the render personal or controller-linked."""
    saved = {name: os.environ.pop(name) for name in PRIVATE_ENVIRONMENT if name in os.environ}
    quiet = logging.getLogger("error_catalog")
    level = quiet.level
    quiet.setLevel(logging.CRITICAL)  # the deliberate 404/400 probes would log as failures
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            yield
    finally:
        quiet.setLevel(level)
        os.environ.update(saved)


def _bundled_app(source_root: Path):
    """Build the app like ``manual.cli.create_bundled_app`` after ``build-smto-manual.py``.

    The wheel build writes the generated reference resource with
    ``reference_builder.write_resource(root, ...)`` and the container reads it back with
    ``read_reference_pages``; the same round trip is made here through a temporary file.
    """
    from manual.app import create_app
    from manual.corpus import ManualCorpus
    from manual.documents import generated_documents, load_static_documents
    from manual.reference_builder import write_resource
    from manual.reference_resource import read_reference_pages

    with tempfile.TemporaryDirectory(prefix="smto-manual-export-") as temporary:
        resource = Path(temporary) / "manual-references.json"
        write_resource(source_root, resource)
        pages = read_reference_pages(resource)
    authored = load_static_documents()
    if not authored:
        raise ExportError("Bundled manual content is missing")
    corpus = ManualCorpus(
        authored, generated_documents=generated_documents(pages), build_identity="bundled"
    )
    return create_app(corpus=corpus, personalize=False), corpus


def _version(content: bytes) -> str:
    """Cache-busting query value for files this exporter writes (Pages caches for 10 min)."""
    return hashlib.sha256(content).hexdigest()[:10]


def _get(client, path: str, status: int = 200):
    response = client.get(path)
    if response.status_code != status:
        raise ExportError(f"GET {path} returned {response.status_code}, expected {status}")
    return response


# --------------------------------------------------------------------------- page


def _render_page(client, revision: str) -> tuple[str, dict[str, bytes], list[str]]:
    """Render /manual and make it static: relative URLs, external scripts, shim first."""
    page = _get(client, "/manual/").text
    files: dict[str, bytes] = {}
    notes: list[str] = []

    # The template's source-documentation comment pushes <meta charset> past the first
    # 1024 bytes; static hosts may omit the charset header, so drop the comment and put
    # the charset first in <head>.
    page = re.sub(r"\A(<!doctype html>\s*)<!--.*?-->\s*", r"\1", page, count=1, flags=re.S | re.I)
    page, count = re.subn(r'\s*<meta charset="utf-8" />', "", page, count=1)
    if count != 1:
        raise ExportError("Expected <meta charset> in the rendered page")

    # Every server-absolute URL becomes relative to manual/index.html.
    page = re.sub(r'((?:src|href)=")/manual/static/', r"\1static/", page)
    page = page.replace('src="/api/agent/errors/client.js"', 'src="api/agent/errors/client.js"')
    page = page.replace('"/agent-ui/static/branding/', '"static/branding/')
    for name in REPLACED_BY_SHIM:
        page, count = re.subn(rf'\s*<script src="static/{re.escape(name)}(?:\?[^"]*)?"></script>', "", page)
        if count != 1:
            raise ExportError(f"Expected one {name} script tag in the rendered page")

    # Navigation context: no controller; the Manual destination is this folder.
    def navigation(match: re.Match) -> str:
        context = json.loads(html.unescape(match.group(1)))
        if context.get("controllerUrl"):
            raise ExportError("The rendered page names a controller URL")
        context["destinations"] = {**context.get("destinations", {}), "manual": "./"}
        payload = html.escape(json.dumps(context, separators=JSON_SEPARATORS), quote=True)
        return f'<meta name="smto-navigation" content="{payload}">'

    page, count = re.subn(r'<meta name="smto-navigation" content="([^"]*)">', navigation, page)
    if count != 1:
        raise ExportError("Expected one smto-navigation meta tag in the rendered page")

    # Inline scripts (branding bootstrap and logo switcher) move to files so a strict
    # script-src CSP needs no 'unsafe-inline'. Order and position are unchanged.
    inline = 0

    def externalize(match: re.Match) -> str:
        nonlocal inline
        inline += 1
        name = f"static/page-inline-{inline}.js"
        files[name] = match.group(1).strip().encode("utf-8") + b"\n"
        return f'<script src="{name}?v={_version(files[name])}"></script>'

    page = re.sub(r"<script>(.*?)</script>", externalize, page, flags=re.S)

    # The wordmark links home (the site root above manual/). The link goes inside <strong>
    # so the header's `.product-navigation-brand > strong` styling still applies.
    brand = '<div class="product-navigation-brand"><strong>'
    start = page.find(brand)
    end = page.find("</strong>", start)
    if start < 0 or end < 0:
        notes.append("header wordmark not found; no home link added")
    else:
        head = start + len(brand)
        page = (
            page[:head]
            + '<a class="static-home-link" href="../" title="Home">'
            + page[head:end]
            + "</a>"
            + page[end:]
        )

    files["static/static-manual.js"] = SHIM_SOURCE.read_bytes()
    files["static/static-site.css"] = STATIC_SITE_CSS.encode("utf-8")
    shim = (
        '<meta charset="utf-8" />'
        f'<meta name="{MARKER}" content="{revision}">'
        f'<script src="static/static-manual.js?v={_version(files["static/static-manual.js"])}"'
        f' data-revision="{revision}"></script>'
    )
    page = page.replace("<head>", "<head>\n  " + shim, 1)
    css = f'static/static-site.css?v={_version(files["static/static-site.css"])}'
    page = page.replace("</head>", f'<link rel="stylesheet" href="{css}"></head>', 1)
    if page.count(MARKER) != 1 or page.find('<meta charset="utf-8" />') > 1000:
        raise ExportError("Could not inject the static shim into <head>")
    return page, files, notes


# --------------------------------------------------------------------------- documents


def _content_paths(documents) -> dict[str, str]:
    """Map content-relative Markdown paths (``architecture/01-overview.md``) to ids."""
    return {
        posixpath.normpath(doc.source_path): doc.id
        for doc in documents
        if doc.source_type != "generated" and doc.source_path
    }


def _rewrite_links(doc, rendered: str, by_path: dict[str, str], stats: Counter) -> str:
    """Make document links work from the static page.

    * ``/manual#doc=...`` (and the public host's form) becomes ``#doc=...``.
    * ``#heading`` becomes ``#doc=<this>&heading=heading`` so the page stays on this
      document instead of treating the fragment as a missing document id.
    * Relative ``*.md`` links that name another manual document become ``#doc=<id>``.
    * Other relative links point into the source repository, which is not published;
      the link is removed and its text kept. External links are unchanged.
    """
    base = posixpath.dirname(doc.source_path or "")

    def replace(match: re.Match) -> str:
        href, attributes, inner = match.groups()
        target = html.unescape(href)
        parts = urlsplit(target)
        if parts.scheme in {"http", "https", "mailto"} and not target.startswith(PUBLIC_ORIGIN):
            stats["external"] += 1
            return match.group(0)
        if target.startswith(PUBLIC_ORIGIN):
            parts = urlsplit(target[len(PUBLIC_ORIGIN) :])
        new = None
        if parts.path in {"/manual", "/manual/"} and parts.fragment.startswith("doc="):
            new, kind = "#" + parts.fragment, "manual"
        elif not parts.scheme and not parts.netloc and not parts.path and parts.fragment:
            if parts.fragment.startswith("doc="):
                new, kind = "#" + parts.fragment, "manual"
            else:
                query = urlencode({"doc": doc.id, "heading": unquote(parts.fragment)})
                new, kind = "#" + query, "heading"
        elif not parts.scheme and not parts.netloc and not parts.path.startswith("/"):
            resolved = posixpath.normpath(posixpath.join(base, unquote(parts.path)))
            if parts.path.endswith(".md") and resolved in by_path:
                values = {"doc": by_path[resolved]}
                if parts.fragment:
                    values["heading"] = unquote(parts.fragment)
                new, kind = "#" + urlencode(values), "markdown"
        if new is None:
            stats["unlinked"] += 1
            return inner
        stats[kind] += 1
        return f'<a href="{html.escape(new, quote=True)}"{attributes}>{inner}</a>'

    rewritten = ANCHOR_RE.sub(replace, rendered)
    if re.search(r'(?:href|src)="/', rewritten):
        raise ExportError(f"Document {doc.id} still has a server-absolute link")
    return rewritten


# --------------------------------------------------------------------------- search data


def _base36(value: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    text = ""
    while True:
        value, rest = divmod(value, 36)
        text = digits[rest] + text
        if not value:
            return text


class RunIndex:
    """Lower-cased body text as maximal ``[a-z0-9_]`` runs with per-document counts.

    A query token only contains those characters, so ``body.lower().count(token)`` equals
    the sum over runs containing the token of ``run count * run.count(token)``. The same
    data gives SQLite unicode61 term frequencies (runs split at ``_``).
    """

    def __init__(self, documents):
        postings: dict[str, list[tuple[int, int]]] = defaultdict(list)
        for index, doc in enumerate(documents):
            for run, count in sorted(Counter(RUN_RE.findall(doc.body_markdown.lower())).items()):
                postings[run].append((index, count))
        self.runs = sorted(postings)
        self.postings = [postings[run] for run in self.runs]
        self.vocab = "\n".join(self.runs)
        self.starts, offset = [], 0
        for run in self.runs:
            self.starts.append(offset)
            offset += len(run) + 1

    def body_counts(self, token: str) -> dict[int, int]:
        """Return ``{document index: body.lower().count(token)}`` for non-zero counts."""
        counts: dict[int, int] = defaultdict(int)
        position = self.vocab.find(token)
        while position >= 0:
            run_index = bisect.bisect_right(self.starts, position) - 1
            run = self.runs[run_index]
            occurrences = run.count(token)
            for index, count in self.postings[run_index]:
                counts[index] += count * occurrences
            position = self.vocab.find(token, self.starts[run_index] + len(run) + 1)
        return counts

    def encoded_postings(self) -> list[str]:
        """``"delta[:count],..."`` per run in base 36; a count of 1 is omitted."""
        encoded = []
        for postings in self.postings:
            items, previous = [], 0
            for index, count in postings:
                delta = _base36(index - previous)
                items.append(delta if count == 1 else f"{delta}:{_base36(count)}")
                previous = index
            encoded.append(",".join(items))
        return encoded


class Joined:
    """Find which of many short strings contain a token with one scan of their join."""

    def __init__(self, texts: list[str]):
        if any("\0" in text for text in texts):
            raise ExportError("Unexpected NUL in document metadata")
        self.text = "\0".join(texts)
        self.starts, offset = [], 0
        for text in texts:
            self.starts.append(offset)
            offset += len(text) + 1

    def containing(self, token: str) -> list[int]:
        found, position = [], self.text.find(token)
        while position >= 0:
            index = bisect.bisect_right(self.starts, position) - 1
            found.append(index)
            following = self.starts[index + 1] if index + 1 < len(self.starts) else len(self.text)
            position = self.text.find(token, following)
        return found


def _fts_lengths(documents) -> list[int]:
    """Token count per row of the browser search's FTS5 table (bm25 document length)."""
    from manual.search import ManualSearch

    search = ManualSearch(list(documents), use_fts=True)
    if search.connection is None:
        raise ExportError("SQLite FTS5 is unavailable; cannot mirror the search ranking")
    connection = search.connection
    connection.execute(
        "CREATE VIRTUAL TABLE temp.export_vocab USING fts5vocab(main, manual_fts, instance)"
    )
    sizes = dict(connection.execute("SELECT doc, count(*) FROM temp.export_vocab GROUP BY doc"))
    connection.close()
    return [sizes.get(row, 0) for row in range(1, len(documents) + 1)]


def _search_index(documents, runs: RunIndex) -> dict:
    return {
        "version": 1,
        "ids": [doc.id for doc in documents],
        "lengths": _fts_lengths(documents),
        "vocab": runs.vocab,
        "postings": runs.encoded_postings(),
    }


def _related(documents, runs: RunIndex, limit: int = RELATED_LIMIT) -> dict[str, list]:
    """``manual.app._related_documents`` for every document, computed in bulk.

    Same score (8 per shared tag + ``fallback_score(title + " " + summary, candidate)``),
    same order and limit; the results are compared with the live endpoint afterwards.
    """
    import numpy as np
    from manual.search import tokenize

    count = len(documents)
    titles = [doc.title.lower() for doc in documents]
    fields = [
        (8.0, Joined(titles)),
        (5.0, Joined([" ".join(doc.tags).lower() for doc in documents])),
        (3.0, Joined([doc.summary.lower() for doc in documents])),
    ]
    legacy = np.array([doc.kind == "legacy" for doc in documents])
    order = np.array([float(doc.order) for doc in documents])
    ranks = {title: rank for rank, title in enumerate(sorted(set(titles)))}
    title_rank = np.array([ranks[title] for title in titles])
    position = np.arange(count)
    with_tag: dict[str, list[int]] = defaultdict(list)
    for index, doc in enumerate(documents):
        for tag in set(doc.tags):
            with_tag[tag].append(index)
    contributions: dict[str, np.ndarray] = {}

    def contribution(token: str) -> np.ndarray:
        if token not in contributions:
            values = np.zeros(count)
            for index, body in runs.body_counts(token).items():
                values[index] = min(body, 8) * 0.75
            for weight, joined in fields:
                values[joined.containing(token)] += weight
            contributions[token] = values
        return contributions[token]

    related = {}
    for index, doc in enumerate(documents):
        tokens = tokenize(doc.title + " " + doc.summary)
        lexical = np.ones(count) if not tokens else sum(contribution(t) for t in tokens)
        overlap = np.zeros(count)
        for tag in set(doc.tags):
            overlap[with_tag[tag]] += 1
        score = overlap * 8.0 + lexical
        keep = score > 0
        keep[index] = False
        candidates = position[keep]
        mismatch = legacy[candidates] != legacy[index]
        chosen = candidates[
            np.lexsort(
                (
                    candidates,
                    title_rank[candidates],
                    order[candidates],
                    -score[candidates],
                    mismatch,
                )
            )[:limit]
        ]
        related[doc.id] = [[documents[c].id, round(float(score[c]), 4)] for c in chosen]
    return related


def _related_sample(documents) -> list:
    """A few documents of every kind, for comparing bulk results with the endpoint."""
    sample, seen = [], Counter()
    for doc in documents:
        if seen[doc.kind] < 2:
            seen[doc.kind] += 1
            sample.append(doc)
    return sample + [documents[len(documents) // 2], documents[-1]]


# --------------------------------------------------------------------------- assets


def _static_assets(source_root: Path) -> dict[str, bytes]:
    from manual.assets import SHARED_UI_FILES

    manual_static = source_root / "src/manual/static"
    shared = source_root / "src/agent_runtime/api/static/agent_ui"
    sources = {"static/app.js": manual_static / "app.js", "static/app.css": manual_static / "app.css"}
    for path in sorted((manual_static / "vendor").rglob("*")):
        if path.is_file() and path.parent != manual_static / "vendor":
            sources["static/" + path.relative_to(manual_static).as_posix()] = path
    for name in SHARED_UI_FILES:
        if name not in REPLACED_BY_SHIM:
            sources[f"static/{name}"] = shared / name
    for path in sorted((shared / "branding").iterdir()):
        if path.is_file() and path.suffix == ".svg":
            sources[f"static/branding/{path.name}"] = path
    files = {}
    for name, path in sources.items():
        if path.is_symlink() or not path.is_file():
            raise ExportError(f"Manual asset missing or a symlink: {path}")
        files[name] = path.read_bytes()
    return files


def _check_references(files: dict[str, bytes]) -> None:
    """Every URL the page or its stylesheets load must exist in the export and be relative."""
    page = files["index.html"].decode("utf-8")
    leftovers = re.findall(r'(?:src|href|content)="(/[^"]*)"', page)
    leftovers += re.findall(r"&quot;(/[^&]*)&quot;", page)
    for name, content in files.items():
        if name == "index.html" or "page-inline-" in name:
            leftovers += re.findall(r'"(/(?:manual|agent-ui|api)\b[^"]*)"', content.decode("utf-8"))
    if leftovers:
        raise ExportError(f"Page still has absolute URLs: {sorted(set(leftovers))[:5]}")
    # The public hosts are offline: only authored document text may still name them.
    for name, content in files.items():
        if not name.startswith("api/manual/document/") and PUBLIC_HOST.encode() in content:
            raise ExportError(f"{name} still refers to {PUBLIC_HOST}")
    references = [("index.html", value) for value in re.findall(r'(?:src|href)="([^"#]+)"', page)]
    for name, content in files.items():
        if name.endswith(".css"):
            for value in re.findall(r"url\(\s*['\"]?([^'\")]+)", content.decode("utf-8")):
                if not value.startswith(("data:", "#")):
                    references.append((name, value))
    missing = []
    for owner, value in references:
        if urlsplit(value).scheme:
            continue
        target = posixpath.normpath(
            posixpath.join(posixpath.dirname(owner), urlsplit(value).path)
        )
        if target == "..":  # the home link: the site root, outside this export
            continue
        if target not in files:
            missing.append(f"{owner} -> {value}")
    if missing:
        raise ExportError(f"Missing referenced files: {missing[:10]}")


# --------------------------------------------------------------------------- output


def _is_previous_export(out_dir: Path) -> bool:
    index = out_dir / "index.html"
    try:
        return index.is_file() and f'name="{MARKER}"' in index.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return False


def _check_out_dir(out_dir: Path, source_root: Path) -> None:
    if out_dir.name != "manual":
        raise ExportError(f"Refusing to write {out_dir}: the output folder must be named 'manual'")
    if out_dir.parent == out_dir or out_dir == Path.home() or len(out_dir.parts) < 3:
        raise ExportError(f"Refusing to write {out_dir}")
    if out_dir.is_relative_to(source_root) or source_root.is_relative_to(out_dir):
        raise ExportError(f"Refusing to write {out_dir}: it overlaps the source tree")
    if out_dir.is_symlink() or (out_dir.exists() and not out_dir.is_dir()):
        raise ExportError(f"Refusing to replace {out_dir}: not a plain directory")
    if out_dir.exists() and any(out_dir.iterdir()) and not _is_previous_export(out_dir):
        raise ExportError(
            f"Refusing to wipe {out_dir}: it is not empty and is not a previous manual export"
        )


def _write_tree(out_dir: Path, files: dict[str, bytes]) -> None:
    """Write into a sibling folder, then swap it in so a failure leaves no partial export."""
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".manual-export-", dir=out_dir.parent))
    retired = None
    try:
        for name in sorted(files):
            path = staging / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(files[name])
        os.chmod(staging, 0o755)
        if out_dir.exists():
            retired = Path(tempfile.mkdtemp(prefix=".manual-retired-", dir=out_dir.parent))
            os.rmdir(retired)
            out_dir.rename(retired)
        try:
            staging.rename(out_dir)
        except OSError:
            if retired is not None:
                retired.rename(out_dir)  # put the previous export back
                retired = None
            raise
    finally:
        if staging.exists():
            shutil.rmtree(staging)
        if retired is not None and retired.exists():
            shutil.rmtree(retired)


# --------------------------------------------------------------------------- export


def export_manual(source_root: Path, out_dir: Path) -> dict:
    """Export the public manual from ``source_root`` into ``out_dir`` (named ``manual``).

    Returns summary counts: ``docs``, ``files`` and ``bytes`` plus a breakdown.
    """
    started = time.monotonic()
    source_root = Path(source_root).expanduser().resolve()
    out_dir = Path(out_dir).expanduser().resolve()
    if not (source_root / "src/manual/app.py").is_file():
        raise ExportError(f"{source_root} is not an SMTO checkout (src/manual/app.py missing)")
    if not SHIM_SOURCE.is_file():
        raise ExportError(f"Missing {SHIM_SOURCE}")
    _check_out_dir(out_dir, source_root)

    with _source_imports(source_root), _public_environment():
        from fastapi.testclient import TestClient
        from manual.app import _related_documents
        from manual.documents import validate_doc_id

        app, corpus = _bundled_app(source_root)
        documents = list(corpus.snapshot.documents)
        revision = corpus.snapshot.revision[:16]
        client = TestClient(app, base_url=PUBLIC_ORIGIN)

        page, files, notes = _render_page(client, revision)
        files["index.html"] = page.encode("utf-8")
        files.update(_static_assets(source_root))
        files["api/agent/errors/client.js"] = _get(client, "/api/agent/errors/client.js").content

        catalog = _get(client, "/api/manual/catalog").json()
        if [doc["id"] for doc in catalog["documents"]] != [doc.id for doc in documents]:
            raise ExportError("Catalog order differs from the corpus snapshot")
        for group in catalog["groups"]:
            if group["documents"] != [d for d in catalog["documents"] if d["kind"] == group["kind"]]:
                raise ExportError(f"Catalog group {group['kind']} is not its kind's documents")
            del group["documents"]  # the shim rebuilds groups from the document list
        files["api/manual/catalog.json"] = _dump(catalog)
        files["api/manual/tags.json"] = _get(client, "/api/manual/tags").content

        def canonical_error(path: str, status: int):
            """The API's error answer with its per-request occurrence id replaced by the nil
            UUID (it also appears inside message_markdown), so exports stay identical."""
            response = _get(client, path, status)
            occurrence = response.json().get("error_detail", {}).get("occurrence_id")
            text = response.text
            if occurrence:
                text = text.replace(occurrence, "00000000-0000-0000-0000-000000000000")
            payload = json.loads(text)
            detail = payload.get("error_detail") or {}
            # Actions that navigate to server pages (e.g. /system-health) do not exist here.
            if isinstance(detail.get("recovery_actions"), list):
                detail["recovery_actions"] = [
                    action for action in detail["recovery_actions"] if not action.get("path")
                ]
            return payload

        files["api/manual/errors.json"] = _dump(
            {
                "not_found": canonical_error("/api/manual/document/static-export-missing", 404),
                "invalid": canonical_error("/api/manual/document/Invalid_Id", 400),
            }
        )

        by_path = _content_paths(documents)
        links: Counter = Counter()
        for doc in documents:
            if not DOC_FILE_RE.fullmatch(doc.id) or validate_doc_id(doc.id) != doc.id:
                raise ExportError(f"Unexpected document id {doc.id!r}")
            payload = _get(client, f"/api/manual/document/{doc.id}").json()
            payload["html"] = _rewrite_links(doc, payload["html"], by_path, links)
            files[f"api/manual/document/{doc.id}.json"] = _dump(payload)

        runs = RunIndex(documents)
        try:
            related = _related(documents, runs)
            sample = _related_sample(documents)
        except ImportError:  # no numpy: use the service's own ranking for every document
            related = {
                doc.id: [
                    [row["id"], row["score"]]
                    for row in _related_documents(doc, documents, limit=RELATED_LIMIT)
                ]
                for doc in documents
            }
            sample = []
        for doc in sample:
            live = _get(client, f"/api/manual/related/{doc.id}?limit={RELATED_LIMIT}").json()
            if [[row["id"], row["score"]] for row in live["results"]] != related[doc.id]:
                raise ExportError(f"Related documents for {doc.id} differ from the live endpoint")
        for doc_id, rows in related.items():
            files[f"api/manual/related/{doc_id}.json"] = _dump(rows)
        files["api/manual/search-index.json"] = _dump(_search_index(documents, runs))
        client.close()

    _check_references(files)
    _write_tree(out_dir, files)

    def size(prefix: str) -> int:
        return sum(len(content) for name, content in files.items() if name.startswith(prefix))

    return {
        "docs": len(documents),
        "files": len(files),
        "bytes": sum(len(content) for content in files.values()),
        "kinds": dict(Counter(doc.kind for doc in documents)),
        "bytes_by_area": {
            "documents": size("api/manual/document/"),
            "related": size("api/manual/related/"),
            "catalog": len(files["api/manual/catalog.json"]),
            "search_index": len(files["api/manual/search-index.json"]),
            "static": size("static/"),
            "error_catalog": len(files["api/agent/errors/client.js"]),
        },
        "links": dict(sorted(links.items())),
        # Authored text (not links) that still names the offline public hosts.
        "documents_mentioning_public_host": sorted(
            name.rsplit("/", 1)[1][: -len(".json")]
            for name, content in files.items()
            if name.startswith("api/manual/document/") and PUBLIC_HOST.encode() in content
        ),
        "inline_scripts_moved": sorted(name for name in files if "page-inline-" in name),
        "revision": revision,
        "fingerprint": hashlib.sha256(
            b"".join(name.encode() + b"\0" + files[name] for name in sorted(files))
        ).hexdigest()[:16],
        "notes": notes,
        "seconds": round(time.monotonic() - started, 1),
        "out_dir": str(out_dir),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Export the public SMTO manual as static files.")
    parser.add_argument("--source", type=Path, required=True, help="SMTO checkout (openfabric)")
    parser.add_argument("--out", type=Path, required=True, help="output folder, named 'manual'")
    args = parser.parse_args(argv)
    try:
        summary = export_manual(args.source, args.out)
    except ExportError as error:
        print(f"export_manual: {error}", file=sys.stderr)
        return 1
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
