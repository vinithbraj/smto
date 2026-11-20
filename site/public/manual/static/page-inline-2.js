document.addEventListener('DOMContentLoaded', () => {
  const assets = window.__BRANDING__.assets;
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const update = () => document.querySelectorAll('[data-brand-image]').forEach(img => {
    const isDark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && dark.matches);
    const isMark = img.hasAttribute('data-brand-mark');
    const url = (isMark && assets.mark) || (isDark ? assets.logo_dark : assets.logo) ||
      assets.logo || assets.logo_dark || assets.mark;
    const text = img.parentElement.querySelector('[data-brand-text]');
    img.onload = () => { img.hidden = false; if (!isMark) text.hidden = true; };
    img.onerror = () => { img.hidden = true; if (!isMark) text.hidden = false; };
    if (img.getAttribute('src') !== url) {
      img.hidden = true; if (!isMark) text.hidden = false; img.src = url;
    }
    else if (img.complete && img.naturalWidth) img.onload();
  });
  update(); dark.addEventListener('change', update);
  new MutationObserver(update).observe(document.documentElement,
    {attributes:true, attributeFilter:['data-theme']});
});
