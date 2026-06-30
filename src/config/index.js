/**
 * FlowDesk Config Loader
 * Liest config/config.json — fällt auf Defaults zurück wenn nicht vorhanden
 */
const fs   = require('fs');
const path = require('path');

const CONFIG_PATH   = path.join(__dirname, '../../config/config.json');
const DEFAULTS_PATH = path.join(__dirname, '../../config/config.example.json');

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadConfig() {
  let defaults = {};
  let custom   = {};

  try {
    defaults = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));
  } catch (_) {}

  try {
    custom = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    console.warn('[Config] config.json nicht gefunden — benutze Defaults');
  }

  return deepMerge(defaults, custom);
}

const config = loadConfig();

/**
 * Generiert CSS-Variablen aus dem Theme
 */
function generateThemeCSS(theme) {
  const c = theme.colors;
  const f = theme.font;
  const r = theme.borderRadius;

  return `
    :root {
      --bg:           ${c.bg};
      --surface:      ${c.surface};
      --surface2:     ${c.surface2};
      --border:       ${c.border};
      --accent:       ${c.accent};
      --accent-dim:   ${c.accentDim};
      --accent-text:  ${c.accentText};
      --green:        ${c.green};
      --red:          ${c.red};
      --yellow:       ${c.yellow};
      --text:         ${c.text};
      --muted:        ${c.muted};
      --font:         ${f.family};
      --font-size:    ${f.size};
      --radius-card:  ${r.card};
      --radius-btn:   ${r.button};
      --radius-input: ${r.input};
      --nav-height:   ${theme.nav.height};
    }
  `;
}

module.exports = { config, generateThemeCSS };
