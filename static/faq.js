/** @file src/smto_site/static/faq.js
@brief Enhance FAQ disclosures with local search, fragment focus and printing.
@details
Responsibilities:
- Filter rendered answers and reveal fragment targets while preserving history.
Boundaries:
- Native disclosures remain usable without this script; no server search API.
Lifecycle:
- Attach listeners after deferred loading; temporarily reveal answers for printing.
State:
- Search and prior disclosure states stay in memory for this page only.
Security:
- No requests, storage, HTML injection, or query-string state.
Collaborators:
- faq.html provides stable IDs; faq.css presents matching and empty states.
Public surface:
- Input, clear buttons, question/topic links and browser hash/print events.
@see src/smto_site/templates/faq.html
 */
(() => {
  const root = document.querySelector('[data-faq]');
  if (!root) return;
  const input = root.querySelector('#faq-search');
  const count = root.querySelector('[data-faq-count]');
  const empty = root.querySelector('[data-faq-empty]');
  const categories = [...root.querySelectorAll('.faq-category')];
  const items = [...root.querySelectorAll('.faq-item')];
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase().trim();
  const searchable = new Map(items.map(item => [item, normalize(item.textContent + ' ' + item.dataset.keywords)]));
  let beforeSearch = null;
  let beforePrint = null;

  const filter = () => {
    const terms = normalize(input.value).split(/\s+/).filter(Boolean);
    if (terms.length && !beforeSearch) beforeSearch = new Map(items.map(item => [item, item.open]));
    let matches = 0;
    for (const item of items) {
      const match = terms.every(term => searchable.get(item).includes(term));
      item.hidden = !match;
      if (terms.length) item.open = match;
      else if (beforeSearch) item.open = beforeSearch.get(item);
      if (match) matches += 1;
    }
    if (!terms.length) beforeSearch = null;
    for (const category of categories) category.hidden = ![...category.querySelectorAll('.faq-item')].some(item => !item.hidden);
    empty.hidden = matches !== 0;
    count.textContent = terms.length ? `${matches} of ${items.length} questions match your search.` : `${items.length} questions across ${categories.length} topics.`;
  };
  const clear = () => { input.value = ''; filter(); };
  const reveal = (hash, focus = false) => {
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch (_) { return; }
    const target = document.getElementById(id);
    if (!target || !root.contains(target)) return;
    clear();
    if (target.matches('.faq-item')) target.open = true;
    target.scrollIntoView({block: 'start', behavior: 'instant'});
    if (focus) {
      const heading = target.querySelector('summary, h2') || target;
      if (heading.tagName !== 'SUMMARY') heading.setAttribute('tabindex', '-1');
      heading.focus({preventScroll: true});
    }
  };
  input.addEventListener('input', filter);
  root.querySelectorAll('[data-faq-clear]').forEach(button => button.addEventListener('click', () => { clear(); input.focus(); }));
  root.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    // A repeated fragment emits no hashchange; prevent its default focus reset.
    if (link.hash === location.hash) event.preventDefault();
    // Let native navigation own history for new fragments.
    reveal(link.hash, true);
  });
  window.addEventListener('hashchange', () => reveal(location.hash, true));
  window.addEventListener('beforeprint', () => {
    if (beforePrint) return;
    beforePrint = items.map(item => ({item, open: item.open, hidden: item.hidden}));
    categories.forEach(category => { category.hidden = false; });
    items.forEach(item => { item.hidden = false; item.open = true; });
  });
  window.addEventListener('afterprint', () => {
    if (!beforePrint) return;
    beforePrint.forEach(({item, open, hidden}) => { item.open = open; item.hidden = hidden; });
    categories.forEach(category => { category.hidden = ![...category.querySelectorAll('.faq-item')].some(item => !item.hidden); });
    beforePrint = null;
  });
  filter();
  root.querySelector('.faq-search').hidden = false;
  if (location.hash) reveal(location.hash);
})();
