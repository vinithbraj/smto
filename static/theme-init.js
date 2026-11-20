// Apply a saved appearance before CSS paints. Automatic remains a CSS fallback.
try {
  const theme = localStorage.getItem('smto.site.theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (_) {}
