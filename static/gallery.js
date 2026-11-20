/* Gallery lightbox for the GitHub Pages edition of the SMTO website.
 * Progressive enhancement: each screenshot is an ordinary link to the image file;
 * with JavaScript it opens in a <dialog> showing the variant for the active theme. */
(() => {
  const dialog = document.querySelector('.shot-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const image = dialog.querySelector('.shot-dialog__img');
  const title = dialog.querySelector('.shot-dialog__title');
  const caption = dialog.querySelector('.shot-dialog__caption');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const activeTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');
  let opener = null;

  document.querySelectorAll('[data-shot-open]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const data = link.dataset;
      const theme = activeTheme();
      const src = (theme === 'dark' ? data.shotDark : data.shotLight) || data.shotLight || data.shotDark || link.href;
      const alt = (theme === 'dark' ? data.shotDarkAlt : data.shotLightAlt) || data.shotLightAlt || data.shotDarkAlt || '';
      image.src = src;
      image.alt = alt;
      title.textContent = data.shotTitle || '';
      caption.textContent = data.shotCaption || '';
      opener = link;
      dialog.showModal();
    });
  });
  // Clicking the backdrop (outside the dialog box) closes it.
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) dialog.close();
  });
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    if (opener) opener.focus();
  });
})();
