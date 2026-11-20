/**
 * Static SMTO manual shim. Copied by site/tools/export_manual.py to manual/static/static-manual.js
 * and loaded before every other script on the exported page.
 *
 * The manual page (src/manual/static/app.js) and the shared UI modules are unmodified. They call
 * the manual service's API with server-absolute paths; this file answers those calls from the
 * files exported next to the page, so nothing needs a server:
 *   /api/manual/catalog, /tags, /document/<id>, /related/<id>  ->  api/manual/*.json
 *   /api/manual/search  ->  ranked in the browser over api/manual/search-index.json, with the
 *                           service's rules (manual/search.py ManualSearch: FTS5 bm25 candidates,
 *                           lexical re-ranking, lexical fallback)
 *   /api/agent/errors/<ref>  ->  the exported browser error catalog (window.SMTOErrorDefinitions)
 *   any other same-origin /api/*  ->  JSON 503 without a network request (there is no server)
 * It also defines window.SMTOManualLinks (manual_links.js is not exported), so links the shared
 * modules build to "the manual", e.g. an error's explanation page, point at this copy.
 */
(() => {
  "use strict";
  const script = document.currentScript;
  const root = new URL("../", script.src); // the exported manual/ folder
  const revision = script.dataset.revision || "";
  const nativeFetch = window.fetch.bind(window);
  const DOC_ID = /^[a-z0-9][a-z0-9-]{0,119}$/;

  const json = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body),
    {status, headers: {"content-type": "application/json"}});
  const fileUrl = path => {
    const url = new URL(path, root);
    if (revision) url.searchParams.set("v", revision);
    return url;
  };
  async function load(path) {
    const response = await nativeFetch(fileUrl(path), {headers: {accept: "application/json"}});
    if (!response.ok) throw new TypeError(`Static manual file unavailable: ${path} (HTTP ${response.status})`);
    return response.json();
  }
  /** Share one load; a failure is not cached so a later request retries. */
  const once = factory => {
    let promise = null;
    return () => promise ||= factory().catch(error => { promise = null; throw error; });
  };

  const catalog = once(async () => {
    const stored = await load("api/manual/catalog.json");
    const documents = stored.documents;
    const payload = {
      groups: stored.groups.map(group => ({...group, documents: documents.filter(doc => doc.kind === group.kind)})),
      documents, tags: stored.tags, total: stored.total,
    };
    return {payload, text: JSON.stringify(payload), documents, byId: new Map(documents.map(doc => [doc.id, doc]))};
  });
  const errorPayloads = once(() => load("api/manual/errors.json"));

  /** Validate like manual.documents.validate_doc_id, then require a catalog entry. */
  async function knownDocument(raw) {
    let id;
    try { id = decodeURIComponent(raw).trim(); } catch (_) { id = ""; }
    if (!DOC_ID.test(id)) return {response: json((await errorPayloads()).invalid, 400)};
    const {byId} = await catalog();
    if (!byId.has(id)) return {response: json((await errorPayloads()).not_found, 404)};
    return {id, byId};
  }

  // ------------------------------------------------------------------ search
  const searchIndex = once(async () => {
    const [raw, {documents}] = await Promise.all([load("api/manual/search-index.json"), catalog()]);
    if (raw.ids.length !== documents.length || raw.ids.some((id, i) => documents[i].id !== id)) {
      throw new TypeError("The static search index does not match the catalog");
    }
    const runs = raw.vocab.split("\n");
    const starts = new Int32Array(runs.length);
    for (let i = 0, offset = 0; i < runs.length; offset += runs[i].length + 1, i++) starts[i] = offset;
    const decoded = new Map();
    const postings = run => {
      let list = decoded.get(run);
      if (!list) {
        list = [];
        let doc = 0;
        for (const item of raw.postings[run].split(",")) {
          const [delta, count] = item.split(":");
          doc += parseInt(delta, 36);
          list.push(doc, count ? parseInt(count, 36) : 1);
        }
        decoded.set(run, list);
      }
      return list; // [document, count, document, count, ...]
    };
    const lengths = raw.lengths;
    const avgdl = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    return {vocab: raw.vocab, runs, starts, postings, lengths, avgdl, documents, lower: [], fields: []};
  });

  /** Indexes of vocabulary runs that contain `needle`. */
  function runsContaining(index, needle) {
    const found = [];
    let at = index.vocab.indexOf(needle);
    while (at >= 0) {
      let lo = 0, hi = index.starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (index.starts[mid] <= at) lo = mid; else hi = mid - 1; }
      found.push(lo);
      at = index.vocab.indexOf(needle, index.starts[lo] + index.runs[lo].length + 1);
    }
    return found;
  }
  /** Non-overlapping occurrences, like Python's str.count. */
  function occurrences(text, needle) {
    let count = 0;
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) count++;
    return count;
  }
  /** Per document: body_markdown.lower().count(token). */
  function bodyCounts(index, token) {
    const counts = new Map();
    for (const run of runsContaining(index, token)) {
      const times = occurrences(index.runs[run], token), list = index.postings(run);
      for (let i = 0; i < list.length; i += 2) counts.set(list[i], (counts.get(list[i]) || 0) + list[i + 1] * times);
    }
    return counts;
  }
  /** SQLite unicode61 (default options): case-folded, diacritics removed, split on non-alphanumerics. */
  const ftsTokens = text => String(text || "").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  function phraseHits(tokens, phrase) {
    let hits = 0;
    outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
      for (let j = 0; j < phrase.length; j++) if (tokens[i + j] !== phrase[j]) continue outer;
      hits++;
    }
    return hits;
  }
  /** Per document: FTS5 phrase frequency over title, summary, body, tags and kind. */
  function phraseFrequencies(index, phrase) {
    const frequencies = new Map();
    if (!phrase.length) return frequencies;
    for (const run of runsContaining(index, phrase[0])) {
      const hits = phraseHits(index.runs[run].split("_").filter(Boolean), phrase);
      if (!hits) continue;
      const list = index.postings(run);
      for (let i = 0; i < list.length; i += 2) frequencies.set(list[i], (frequencies.get(list[i]) || 0) + list[i + 1] * hits);
    }
    index.documents.forEach((doc, i) => {
      const fields = index.fields[i] ||= [doc.title, doc.summary, doc.tags.join(" "), doc.kind].map(ftsTokens);
      let hits = 0;
      for (const tokens of fields) hits += phraseHits(tokens, phrase);
      if (hits) frequencies.set(i, (frequencies.get(i) || 0) + hits);
    });
    return frequencies;
  }

  const truthy = value => !/^(?:0|f|false|n|no|off)$/i.test(String(value).trim());
  const byScore = (a, b) => b.score - a.score || a.doc.order - b.doc.order
    || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);

  async function search(url) {
    const params = url.searchParams;
    const q = params.get("q") ?? "", tagsParam = params.get("tags"), kindParam = params.get("kind");
    const limit = Math.max(1, Math.min(50, parseInt(params.get("limit") ?? "20", 10) || 20));
    const includeHistorical = params.has("include_historical") ? truthy(params.get("include_historical")) : true;
    const query = q.trim();
    const tags = new Set((tagsParam || "").split(/[, ]+/).map(tag => tag.trim().toLowerCase()).filter(Boolean));
    const kind = (kindParam || "").trim() || null;
    const tokens = (query.match(/[A-Za-z0-9_]{2,}/g) || []).map(token => token.toLowerCase());
    const {documents} = await catalog();
    const passes = doc => (includeHistorical || doc.kind !== "legacy") && (!kind || doc.kind === kind)
      && [...tags].every(tag => doc.tags.includes(tag));
    const entry = (i, score) => ({i, doc: documents[i], score, title: documents[i].title.toLowerCase()});
    let lexical = () => 1.0; // manual.search.fallback_score without query tokens
    let results = [];

    if (tokens.length) {
      const index = await searchIndex();
      const body = new Map([...new Set(tokens)].map(token => [token, bodyCounts(index, token)]));
      lexical = i => {
        const doc = documents[i];
        const [title, tagText, summary] = index.lower[i] ||= [doc.title.toLowerCase(), doc.tags.join(" ").toLowerCase(), doc.summary.toLowerCase()];
        let score = 0;
        for (const token of tokens) {
          if (title.includes(token)) score += 8;
          if (tagText.includes(token)) score += 5;
          if (summary.includes(token)) score += 3;
          const count = body.get(token).get(i);
          if (count) score += Math.min(count, 8) * 0.75;
        }
        return score;
      };
      // FTS5 stage: "t1 OR t2 ..." over the first 12 tokens; bm25 picks limit*4 candidates.
      const k1 = 1.2, b = 0.75, total = documents.length, cache = new Map();
      const phrases = tokens.slice(0, 12).map(token => {
        const parts = token.split("_").filter(Boolean), key = parts.join(" ");
        if (!cache.has(key)) {
          const frequencies = phraseFrequencies(index, parts);
          let idf = Math.log((total - frequencies.size + 0.5) / (frequencies.size + 0.5));
          if (idf <= 0) idf = 1e-6;
          cache.set(key, {frequencies, idf});
        }
        return cache.get(key);
      });
      const matched = new Set();
      for (const {frequencies} of phrases) for (const i of frequencies.keys()) matched.add(i);
      const bm25 = i => {
        let score = 0;
        for (const {frequencies, idf} of phrases) {
          const f = frequencies.get(i);
          if (f) score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * index.lengths[i] / index.avgdl));
        }
        return -score;
      };
      const candidates = [...matched]
        .filter(i => includeHistorical || documents[i].kind !== "legacy")
        .map(i => ({i, rank: bm25(i)}))
        .sort((x, y) => x.rank - y.rank || x.i - y.i)
        .slice(0, Math.max(limit * 4, limit));
      results = candidates.filter(({i}) => passes(documents[i]))
        .map(({i, rank}) => entry(i, lexical(i) + 1 / (1 + Math.abs(rank))))
        .sort(byScore).slice(0, limit);
    }
    if (!results.length) {
      for (let i = 0; i < documents.length; i++) {
        if (!passes(documents[i])) continue;
        const score = lexical(i);
        if (query && score <= 0) continue;
        results.push(entry(i, score));
      }
      results = results.sort(byScore).slice(0, limit);
    }
    const rows = results.map(({doc, score}) => ({...doc, score: Number(score.toFixed(4))}));
    return json({query: q, tags: tagsParam || "", kind: kindParam || "", count: rows.length, results: rows, engine: "static"});
  }

  // ------------------------------------------------------------------ routes
  async function route(url) {
    const path = url.pathname;
    if (path === "/api/manual/catalog") return json((await catalog()).text);
    if (path === "/api/manual/tags") return json({tags: (await catalog()).payload.tags});
    if (path === "/api/manual/search") return search(url);
    for (const prefix of ["/api/manual/document/", "/api/manual/related/"]) {
      if (!path.startsWith(prefix)) continue;
      const found = await knownDocument(path.slice(prefix.length));
      if (found.response) return found.response;
      if (prefix.endsWith("document/")) return nativeFetch(fileUrl(`api/manual/document/${found.id}.json`));
      const limit = Math.max(1, Math.min(12, parseInt(url.searchParams.get("limit") ?? "6", 10) || 6));
      const rows = await load(`api/manual/related/${found.id}.json`);
      return json({document_id: found.id, results: rows.slice(0, limit).map(([id, score]) => ({...found.byId.get(id), score}))});
    }
    if (path.startsWith("/api/agent/errors/") && path !== "/api/agent/errors/catalog") {
      let ref = "";
      try { ref = decodeURIComponent(path.slice("/api/agent/errors/".length)); } catch (_) {}
      const match = (window.SMTOErrorDefinitions || []).find(item => [item.error_id, item.error_guid, item.slug].includes(ref)
        || item.aliases?.error_kinds?.includes(ref));
      return match ? json(match) : json({detail: "This error reference is not in the static manual's catalog."}, 404);
    }
    return json({detail: "This is a static copy of the SMTO manual; no SMTO server is available here."}, 503);
  }

  window.fetch = function fetch(input, init) {
    let url;
    try { url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href); }
    catch (_) { return nativeFetch(input, init); }
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return nativeFetch(input, init);
    return route(url).catch(error => { throw error instanceof TypeError ? error : new TypeError(String(error?.message || error)); });
  };

  // ------------------------------------------------------------------ manual links
  // Replaces manual_links.js (not exported), which sends visitors of non-local hosts to the
  // public manual host. Same API; links point at this copy. The accessor keeps it in place
  // even if a page loads manual_links.js after all.
  const links = Object.freeze({
    manualUrl(docId = "manual-home", _port = "", headingId = "") {
      const url = new URL(root.href);
      url.hash = `doc=${encodeURIComponent(String(docId ?? "").trim() || "manual-home")}`;
      if (headingId) url.hash += `&heading=${encodeURIComponent(headingId)}`;
      return url.toString();
    },
  });
  Object.defineProperty(window, "SMTOManualLinks", {configurable: true, enumerable: true, get: () => links, set: () => {}});
})();
