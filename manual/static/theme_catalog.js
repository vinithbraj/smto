/* Bundled day/night palette catalog and contrast arithmetic shared by the editor
 * and every palette-enabled page. Defines immutable semantic colors and local
 * attribution metadata; it never fetches upstream themes or fonts. */
(() => {
  "use strict";
  const fields = Object.freeze({
    text: "Primary text", secondary: "Secondary text", bg: "Page background",
    surface: "Panel background", code: "Code background", userBg: "User message background",
    userText: "User message text", answerBg: "Assistant message background",
    answerText: "Assistant message text", accent: "Accent", button: "Button background",
    buttonText: "Button text", border: "Borders",
  });
  /** Decode a six-digit catalog color into channel integers for palette arithmetic; callers supply
   * already validated colors. */
  const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
  /** Interpolate RGB channels and round them back to a hex color; palette builders use this to
   * derive surfaces from their three seed colors. */
  const mix = (a, b, amount) => "#" + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * amount).toString(16).padStart(2, "0")).join("");
  /** Convert sRGB channels to linear light and combine their luminance weights for contrast
   * calculations. */
  function luminance(hex) {
    return rgb(hex).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  }
  /** Return the lighter-to-darker relative luminance ratio used by palette construction and editor
   * feedback. */
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  /** Move a candidate toward black or white until it meets the minimum on every supplied
   * background; existing themes supply one background, low-brightness themes supply all surfaces. */
  function legible(color, background, minimum = 4.5) {
    const backgrounds = Array.isArray(background) ? background : [background];
    const weakest = candidate => Math.min(...backgrounds.map(bg => contrast(candidate, bg)));
    const target = weakest("#000000") > weakest("#ffffff") ? "#000000" : "#ffffff";
    for (let i = 0; i <= 20; i++) {
      const candidate = mix(color, target, i / 20);
      if (weakest(candidate) >= minimum) return candidate;
    }
    return target;
  }
  /** Derive frozen semantic surface, message, text and status colors from background/text/accent
   * seeds. Text pairs target 4.5:1; decorative borders use a subtle blend of each variant's own
   * colors. Explicit high contrast and user overrides are handled separately. */
  function palette(bg, text, accent, dark) {
    const surface = mix(bg, text, .055), code = mix(bg, text, .035);
    const userBg = mix(surface, accent, .12), answerBg = mix(bg, accent, .035);
    return Object.freeze({bg, text: legible(text, bg), secondary: legible(mix(bg, text, .65), bg),
      surface, code, userBg, userText: legible(text, userBg), answerBg, answerText: legible(text, answerBg),
      accent: legible(accent, bg), button: legible(accent, bg),
      buttonText: contrast("#ffffff", legible(accent, bg)) >= 4.5 ? "#ffffff" : "#000000",
      border: mix(bg, text, dark ? .14 : .16),
      danger: dark ? "#ff9ba1" : "#b42332", warning: dark ? "#edc275" : "#865600",
      success: dark ? "#83d3aa" : "#176c49"});
  }
  /** Keep labels readable on panels, messages and hover/selected surfaces at reduced brightness.
   * Account for the palette bridge's surface and border blends, including its softer dividers.
   * These are stronger app adaptations, not the upstream schemes' official contrast variants. */
  function lowBrightnessPalette(bg, text, accent, dark) {
    const base = palette(bg, text, accent, dark), endpoint = dark ? "#ffffff" : "#000000";
    const readingSurfaces = [bg, base.surface, base.code, base.userBg, base.answerBg];
    const surfaces = [...readingSurfaces, mix(base.surface, endpoint, .12)];
    const readable = color => legible(legible(color, readingSurfaces, 7), surfaces);
    const button = legible(accent, readingSurfaces, 7);
    let border = endpoint;
    for (let i = 0; i <= 20; i++) {
      const candidate = mix(base.border, endpoint, i / 20), soft = mix(bg, candidate, .7);
      if (surfaces.every(surface => contrast(candidate, surface) >= 3)
        && [bg, base.surface].every(surface => contrast(soft, surface) >= 3)) {
        border = candidate; break;
      }
    }
    return Object.freeze({...base, text: readable(text), secondary: readable(mix(bg, text, .8)),
      userText: readable(text), answerText: readable(text), accent: legible(accent, surfaces), button,
      buttonText: contrast("#ffffff", button) >= 7 ? "#ffffff" : "#000000", border,
      danger: legible(base.danger, surfaces), warning: legible(base.warning, surfaces), success: legible(base.success, surfaces)});
  }
  const definitions = [];
  /** Append an immutable day/night pair with its source attribution and adaptation note; this only
   * builds the local catalog and performs no network lookup. */
  function add(id, name, category, light, dark, source = "", note = "", build = palette) {
    definitions.push(Object.freeze({id, name, category, source, note,
      light: build(...light, false), dark: build(...dark, true)}));
  }
  // Default is only used for the editor and explicit modifiers. Without modifiers,
  // the application keeps its original, surface-specific CSS completely intact.
  definitions.push(Object.freeze({id: "default", name: "Default", category: "Default", source: "", note: "The original application theme.",
    light: Object.freeze({bg: "#ffffff", surface: "#f5f5f7", code: "#f5f5f7", text: "#1d1d1f", secondary: "#6a6a6f", accent: "#0066cc", button: "#0071e3", buttonText: "#ffffff", border: "#d2d2d7", userBg: "#e6eff9", userText: "#1d1d1f", answerBg: "#f6f6f6", answerText: "#1d1d1f", danger: "#d70015", warning: "#a2560b", success: "#1e7b34"}),
    dark: Object.freeze({bg: "#1c1c1e", surface: "#262628", code: "#232325", text: "#f5f5f7", secondary: "#a8a8ad", accent: "#4aa1ff", button: "#0071e3", buttonText: "#ffffff", border: "#3a3a3d", userBg: "#212b37", userText: "#f5f5f7", answerBg: "#242426", answerText: "#f5f5f7", danger: "#ff6961", warning: "#ffb340", success: "#4cd471"})}));
  // All Gray: the Default theme with every accent replaced by neutral grays (links, focus, buttons
  // and your message bubble). Status colors stay meaningful. Default itself is unchanged.
  definitions.push(Object.freeze({id: "all-gray", name: "All Gray", category: "Default", source: "", note: "The default theme with neutral grays instead of accent colors.",
    light: Object.freeze({bg: "#ffffff", surface: "#f5f5f7", code: "#f5f5f7", text: "#1d1d1f", secondary: "#6a6a6f", accent: "#48484a", button: "#3a3a3c", buttonText: "#ffffff", border: "#d2d2d7", userBg: "#ececee", userText: "#1d1d1f", answerBg: "#f6f6f6", answerText: "#1d1d1f", danger: "#d70015", warning: "#a2560b", success: "#1e7b34"}),
    dark: Object.freeze({bg: "#1c1c1e", surface: "#262628", code: "#232325", text: "#f5f5f7", secondary: "#a8a8ad", accent: "#c7c7cc", button: "#636366", buttonText: "#ffffff", border: "#3a3a3d", userBg: "#2c2c2e", userText: "#f5f5f7", answerBg: "#242426", answerText: "#f5f5f7", danger: "#ff6961", warning: "#ffb340", success: "#4cd471"})}));
  const established = [
    ["solarized", "Solarized", ["#fdf6e3", "#586e75", "#268bd2"], ["#002b36", "#93a1a1", "#2aa198"], "https://ethanschoonover.com/solarized/", "Light / Dark"],
    ["catppuccin", "Catppuccin", ["#eff1f5", "#4c4f69", "#8839ef"], ["#1e1e2e", "#cdd6f4", "#cba6f7"], "https://catppuccin.com/palette/", "Latte / Mocha"],
    ["gruvbox", "Gruvbox", ["#fbf1c7", "#3c3836", "#9d0006"], ["#282828", "#ebdbb2", "#fabd2f"], "https://github.com/morhetz/gruvbox", "Medium Light / Medium Dark"],
    ["gruvbox-material", "Gruvbox Material", ["#fbf1c7", "#654735", "#b47109"], ["#282828", "#d4be98", "#a9b665"], "https://github.com/sainnhe/gruvbox-material", "Medium Light / Medium Dark"],
    ["everforest", "Everforest", ["#fdf6e3", "#5c6a72", "#8da101"], ["#2d353b", "#d3c6aa", "#a7c080"], "https://github.com/sainnhe/everforest", "Medium Light / Medium Dark"],
    ["rose-pine", "Rosé Pine", ["#faf4ed", "#575279", "#b4637a"], ["#191724", "#e0def4", "#ebbcba"], "https://rosepinetheme.com/palette/", "Dawn / Rosé Pine"],
    ["ayu", "Ayu", ["#fafafa", "#575f66", "#ff9940"], ["#0b0e14", "#bfbdb6", "#e6b450"], "https://github.com/ayu-theme/ayu-colors", "Light / Dark"],
    ["kanagawa", "Kanagawa", ["#f2ecbc", "#545464", "#4d699b"], ["#1f1f28", "#dcd7ba", "#7e9cd8"], "https://github.com/rebelot/kanagawa.nvim", "Lotus / Wave"],
    ["tokyo-night", "Tokyo Night", ["#e1e2e7", "#3760bf", "#9854f1"], ["#1a1b26", "#c0caf5", "#7aa2f7"], "https://github.com/folke/tokyonight.nvim", "Day / Night"],
    ["night-owl", "Night Owl", ["#fbfbfb", "#403f53", "#4876d6"], ["#011627", "#d6deeb", "#c792ea"], "https://github.com/sdras/night-owl-vscode-theme", "Light Owl / Night Owl"],
    ["one", "One", ["#fafafa", "#383a42", "#4078f2"], ["#282c34", "#abb2bf", "#61afef"], "https://github.com/atom/one-dark-syntax", "One Light / One Dark"],
    ["github", "GitHub", ["#ffffff", "#1f2328", "#0969da"], ["#0d1117", "#e6edf3", "#58a6ff"], "https://github.com/primer/github-vscode-theme", "Light / Dark"],
    ["material", "Material", ["#fafafa", "#546e7a", "#00897b"], ["#212121", "#eeffff", "#80cbc4"], "https://github.com/material-theme/vsc-material-theme", "Lighter / Darker adaptation"],
    ["nord", "Nord", ["#eceff4", "#2e3440", "#5e81ac"], ["#2e3440", "#eceff4", "#88c0d0"], "https://www.nordtheme.com/docs/colors-and-palettes/", "Adapted Snow Storm / Polar Night"],
    ["dracula", "Dracula", ["#f7f3ff", "#343045", "#7746b8"], ["#282a36", "#f8f8f2", "#bd93f9"], "https://draculatheme.com/contribute", "Original companion day / Dracula-inspired night"],
    ["monokai", "Monokai", ["#faf8ed", "#383830", "#a3235c"], ["#272822", "#f8f8f2", "#a6e22e"], "https://monokai.pro/", "Original companion day / Classic-inspired night"],
    ["tomorrow", "Tomorrow", ["#ffffff", "#4d4d4c", "#4271ae"], ["#1d1f21", "#c5c8c6", "#81a2be"], "https://github.com/chriskempson/tomorrow-theme", "Tomorrow / Tomorrow Night"],
    ["papercolor", "PaperColor", ["#eeeeee", "#444444", "#005f87"], ["#1c1c1c", "#d0d0d0", "#87d7af"], "https://github.com/NLKNguyen/papercolor-theme", "Light / Dark"],
    ["nightfox", "Nightfox", ["#faf4ed", "#575279", "#286983"], ["#192330", "#cdcecf", "#719cd6"], "https://github.com/EdenEast/nightfox.nvim", "Dawnfox / Nightfox"],
    ["oxocarbon", "Oxocarbon", ["#ffffff", "#262626", "#0f62fe"], ["#161616", "#f2f4f8", "#78a9ff"], "https://github.com/nyoom-engineering/oxocarbon.nvim", "Light / Dark"],
    ["edge", "Edge", ["#fafafa", "#4b505b", "#5079be"], ["#2c2e34", "#c5cdd9", "#76b8e5"], "https://github.com/sainnhe/edge", "Light / Dark"],
    ["modus", "Modus", ["#ffffff", "#000000", "#3548cf"], ["#000000", "#ffffff", "#79a8ff"], "https://protesilaos.com/emacs/modus-themes", "Operandi / Vivendi adaptation"],
    ["horizon", "Horizon", ["#fdf0ed", "#403638", "#b23c56"], ["#1c1e26", "#e0d6d2", "#e95678"], "https://github.com/jolaleye/horizon-theme-vscode", "Adapted day / night"],
    ["cobalt", "Cobalt", ["#f0f5fc", "#18354a", "#1265a8"], ["#193549", "#ffffff", "#ffc600"], "https://github.com/wesbos/cobalt2-vscode", "Original companion day / Cobalt2-inspired night"],
  ];
  const lowBrightness = [
    ["travel-warm", "Travel Warm", ["#f2e5bc", "#3c3836", "#9d0006"], ["#32302f", "#ebdbb2", "#fabd2f"],
      "https://github.com/morhetz/gruvbox", "Gruvbox-inspired parchment / warm charcoal. Stronger text and borders for a dimmed screen."],
    ["travel-slate", "Travel Slate", ["#d8dee9", "#2e3440", "#5e81ac"], ["#3b4252", "#eceff4", "#88c0d0"],
      "https://www.nordtheme.com/docs/colors-and-palettes/", "Nord-inspired cool gray / lifted slate. Stronger text and borders for a dimmed screen."],
    ["travel-sage", "Travel Sage", ["#e5e6c5", "#5c6a72", "#8da101"], ["#333c43", "#d3c6aa", "#a7c080"],
      "https://github.com/sainnhe/everforest", "Everforest-inspired sage / forest charcoal. Stronger text and borders for a dimmed screen."],
  ];
  for (const [id, name, light, dark, source, note] of lowBrightness)
    add(id, name, "Low brightness", light, dark, source, note, lowBrightnessPalette);
  for (const [id, name, light, dark, source, note] of established) add(id, name, "Established", light, dark, source, note);
  const world = [
    ["kyoto-sakura", "Kyoto Sakura", "#fff4f7", "#342334", "#a74370", "#281d29", "#f6dfec", "#e6a1c2", "Blush and plum · Asia"],
    ["kerala-monsoon", "Kerala Monsoon", "#eff6ee", "#253e35", "#307556", "#152c25", "#e0eee3", "#83c5a0", "Sage and deep green · Asia"],
    ["jaipur-rose", "Jaipur Rose", "#fff0e5", "#553235", "#b54e61", "#321f29", "#f4dfd5", "#e5a08e", "Sandstone and rose · Asia"],
    ["seoul-han-river", "Seoul Han River", "#eff5f8", "#263b50", "#326e9b", "#182a3c", "#e2edf4", "#8bbcd9", "Mist and slate blue · Asia"],
    ["bali-rice-terrace", "Bali Rice Terrace", "#f5f7e8", "#32422b", "#4e7c35", "#1b3023", "#e3edcf", "#a0cb76", "Cream and emerald · Asia"],
    ["himalaya-dawn", "Himalaya Dawn", "#f0f3ff", "#30334f", "#5c59a6", "#20213e", "#e5e8fa", "#b3a5ed", "Ice and indigo · Asia"],
    ["santorini", "Santorini", "#f8fbff", "#233d5c", "#2466af", "#142b47", "#e3f0ff", "#80b9ee", "White and Aegean blue · Europe"],
    ["amalfi", "Amalfi", "#fffce9", "#2f4851", "#297b88", "#16353d", "#f4edcf", "#e6c85b", "Lemon and marine · Europe"],
    ["provence", "Provence", "#f8f3ff", "#443654", "#8260a9", "#2c233c", "#ede3f5", "#c5a4df", "Ivory and lavender · Europe"],
    ["nordic-fjord", "Nordic Fjord", "#edf4f4", "#30464a", "#367b80", "#192e33", "#dcebed", "#8ac4c6", "Silver and deep teal · Europe"],
    ["marrakech", "Marrakech", "#fcf0e7", "#533b32", "#ab512c", "#36241e", "#f4e2ce", "#e7a471", "Terracotta and copper · Africa"],
    ["sahara", "Sahara", "#faf2dd", "#52442c", "#956526", "#30291e", "#eee2c2", "#dbb26a", "Sand and umber · Africa"],
    ["serengeti", "Serengeti", "#f5f4e5", "#3e4430", "#6d7735", "#272e20", "#e9e9cc", "#c4ba68", "Grass and gold · Africa"],
    ["cape-fynbos", "Cape Fynbos", "#f5f1f7", "#453f49", "#8a5c88", "#292a2c", "#ece1ed", "#c6a1c1", "Sage and heather · Africa"],
    ["pacific-northwest", "Pacific Northwest", "#edf3f0", "#2c4039", "#3e7564", "#182d29", "#dcebe3", "#88bb9d", "Fog and pine · Americas"],
    ["california-coast", "California Coast", "#fbf5e9", "#354851", "#347b96", "#1c303a", "#efe8d9", "#86c0ce", "Sand and ocean · Americas"],
    ["new-york", "New York", "#f3f3f0", "#303234", "#566875", "#202326", "#e9e9e3", "#a3b8c6", "Limestone and graphite · Americas"],
    ["new-mexico-adobe", "New Mexico Adobe", "#faeee4", "#513d34", "#287d7d", "#342620", "#f0dfcf", "#78c5bc", "Clay and turquoise · Americas"],
    ["oaxaca", "Oaxaca", "#fcf5e1", "#4f382e", "#a05b1e", "#342522", "#f6e4c8", "#e6b65e", "Cream and ochre · Americas"],
    ["patagonia", "Patagonia", "#edf6fa", "#314753", "#3a7897", "#1b2b36", "#dceef6", "#87c5df", "Glacier and slate · Americas"],
    ["sydney-harbour", "Sydney Harbour", "#f2f9fa", "#26454f", "#147a98", "#122e3a", "#e0eff4", "#6ec1d9", "Pearl and harbour blue · Oceania"],
    ["new-zealand-alpine", "New Zealand Alpine", "#f2f7ee", "#304638", "#42734f", "#1c3028", "#e4efde", "#9bc49a", "Snow and alpine green · Oceania"],
    ["cappadocia", "Cappadocia", "#f7efe8", "#51414b", "#85638e", "#322733", "#f0e3e7", "#c9a5ca", "Warm stone and dusty violet · Middle East"],
    ["petra", "Petra", "#fceee9", "#54353a", "#a45361", "#351f2a", "#f4dfe2", "#e3a0aa", "Rose sandstone and burgundy · Middle East"],
  ];
  for (const [id, name, lb, lt, la, db, dt, da, note] of world) add(id, name, "World-inspired", [lb, lt, la], [db, dt, da], "", note);
  const byId = new Map(definitions.map(theme => [theme.id, theme]));
  window.SMTOThemeCatalog = Object.freeze({themes: Object.freeze(definitions), fields, mix, contrast,
    get: id => byId.get(id) || byId.get("default"), has: id => byId.has(id)});
})();
