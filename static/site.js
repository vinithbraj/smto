/** @file src/smto_site/static/site.js
@brief Enhance theme selection and mobile navigation without hiding the no-JavaScript path.
@details
Responsibilities:
- Toggle expanded state and close with Escape or an outside click.
- Remember an optional theme choice while automatic mode follows the device.
Boundaries:
- Navigation anchors and content are server-rendered.
Lifecycle:
- Attach local event listeners after deferred script load.
State:
- Open controls live in DOM classes and ARIA; the theme preference stays in this browser.
Security:
- A validated theme preference uses local storage; the optional counter uses a first-party cookie.
- A fixed YouTube player loads only after explicit demo activation.
Collaborators:
- base.html declares the button and navigation targets.
Public surface:
- An optional enhancement with visible keyboard focus and no focus trap.
@see src/smto_site/templates/base.html
*/
// Confirm cookie acceptance before registering; cached HTML never contains a count.
(async () => {
  const counter = document.querySelector('[data-visitor-count]');
  if (!counter) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const options = { credentials: 'same-origin', cache: 'no-store', signal: controller.signal };
    const initial = await fetch('/api/visitors', options);
    if (!initial.ok) return;
    const response = await fetch('/api/visitors', { ...options, method: 'POST' });
    if (!response.ok) return;
    const { count } = await response.json();
    if (!Number.isSafeInteger(count) || count < 0) return;
    counter.querySelector('span').textContent = count.toLocaleString('en-US');
    counter.hidden = false;
  } catch (_) {
    // The optional count must not interfere with navigation or page content.
  } finally {
    clearTimeout(timeout);
  }
})();

// Preserve the ordinary external link until the visitor chooses in-page playback.
(() => {
  document.querySelectorAll('[data-smto-demo="disk-cleanup"], [data-smto-video]').forEach(player => {
    const preview = player.querySelector('.smto-demo-poster');
    const videoId = player.dataset.smtoVideo || player.dataset.videoId;
    if (!preview || !/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return;
    preview.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1&playsinline=1&rel=0';
      iframe.title = player.dataset.videoTitle || 'SMTO video';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.className = 'smto-demo-iframe';
      iframe.tabIndex = 0;
      preview.replaceWith(iframe);
      iframe.focus();
    });
  });
})();

// Narrow-screen comparison uses the already-rendered matrix as its only data source.
(() => {
  const matrix = document.getElementById('compare-matrix');
  const select = document.getElementById('compare-product');
  if (!matrix || !select) return;
  const cells = matrix.querySelectorAll('[data-product]');
  const update = () => {
    cells.forEach(cell => {
      cell.toggleAttribute('data-selected', cell.dataset.product === select.value || cell.dataset.product === 'smto');
    });
  };
  update();
  select.addEventListener('change', update);
  matrix.dataset.compareReady = '';
  select.closest('.comparison-picker').hidden = false;
})();

(() => {
  const picker = document.querySelector('.theme-picker');
  if (!picker) return;
  const button = picker.querySelector('.theme-toggle');
  const options = picker.querySelector('#theme-options');
  const choices = picker.querySelectorAll('input[name="theme"]');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const storageKey = 'smto.site.theme';
  const normalize = value => ['light', 'dark'].includes(value) ? value : 'auto';
  let preference = 'auto';
  try { preference = normalize(localStorage.getItem(storageKey)); } catch (_) {}

  /** Apply a manual override or let CSS continue following system appearance. */
  const apply = () => {
    if (preference === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = preference;
    const theme = preference === 'auto' ? (systemTheme.matches ? 'dark' : 'light') : preference;
    const label = preference === 'auto' ? `Automatic (${theme})` : (theme === 'dark' ? 'Dark' : 'Light');
    const description = `Theme: ${label}. Choose theme`;
    button.setAttribute('aria-label', description);
    button.title = description;
    picker.querySelector('.theme-sun').toggleAttribute('hidden', theme !== 'light');
    picker.querySelector('.theme-moon').toggleAttribute('hidden', theme !== 'dark');
    for (const choice of choices) choice.checked = choice.value === preference;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.content = theme === 'dark' ? '#11141b' : '#fafbfd';
    }
  };
  const close = () => {
    options.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  button.addEventListener('click', () => {
    if (!options.hidden) return close();
    options.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    options.querySelector('input:checked').focus();
  });
  for (const choice of choices) {
    choice.addEventListener('change', () => {
      preference = normalize(choice.value);
      try {
        if (preference === 'auto') localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, preference);
      } catch (_) {}
      apply();
      close();
      button.focus();
    });
  }
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !options.hidden) {
      close();
      button.focus();
      event.stopPropagation();
    }
  });
  picker.addEventListener('focusout', event => {
    // A label press can blur the radio with no next focus target before the
    // browser forwards the click to its input. Keep that activation available;
    // the outside-click handler still dismisses clicks on non-focusable content.
    if (event.relatedTarget && !picker.contains(event.relatedTarget)) close();
  });
  document.addEventListener('click', event => {
    if (!picker.contains(event.target)) close();
  });
  systemTheme.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      preference = normalize(event.key === null ? null : event.newValue);
      apply();
    }
  });
  apply();
  picker.hidden = false;
})();

(() => {
  const button = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#primary-nav');
  if (!button || !navigation) return;
  document.documentElement.classList.add('js');
  button.hidden = false;
  /** Close navigation and synchronize its accessible expanded state. */
  const close = () => {
    navigation.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  };
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    navigation.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
  });
  navigation.addEventListener('click', event => {
    const link = event.target.closest('a[href*="#"]');
    if (!link) return;
    close();
    const url = new URL(link.href);
    if (url.pathname === location.pathname) {
      const section = document.getElementById(url.hash.slice(1));
      const heading = section && section.querySelector('h1, h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        // Native fragment navigation runs after this click handler and may
        // replace focus. Move focus once it has finished scrolling the section.
        requestAnimationFrame(() => heading.focus({preventScroll: true}));
      }
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      close();
      button.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!navigation.contains(event.target) && !button.contains(event.target)) close();
  });
})();
