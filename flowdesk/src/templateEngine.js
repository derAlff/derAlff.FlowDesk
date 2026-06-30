/**
 * Minimal Template-Engine
 *
 * Unterstützt:
 *   {{variable}}              — einfache Ersetzung (HTML-escaped)
 *   {{{variable}}}             — Ersetzung OHNE Escaping (für eigenes HTML)
 *   {{#if variable}}...{{/if}} — bedingte Anzeige
 *   {{#each list}}...{{/each}} — Schleife, innerhalb {{this.feld}}
 *
 * Kein neues Framework — nur ein paar Regex-Ersetzungen.
 */
const fs   = require('fs');
const path = require('path');

const VIEWS_DIR = path.join(__dirname, '../views');
const cache = {};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTemplate(name) {
  if (cache[name] && process.env.NODE_ENV === 'production') return cache[name];
  const filePath = path.join(VIEWS_DIR, `${name}.html`);
  const content = fs.readFileSync(filePath, 'utf8');
  cache[name] = content;
  return content;
}

function renderEach(template, data) {
  return template.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, inner) => {
    const list = data[key];
    if (!Array.isArray(list)) return '';
    return list.map(item => {
      let block = inner;
      // {{this.field}} oder {{this}} für primitive Werte
      block = block.replace(/\{\{this\.(\w+)\}\}/g, (m, field) => escapeHtml(item[field]));
      block = block.replace(/\{\{\{this\.(\w+)\}\}\}/g, (m, field) => item[field] ?? '');
      block = block.replace(/\{\{this\}\}/g, escapeHtml(item));
      return block;
    }).join('');
  });
}

function renderIf(template, data) {
  return template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, inner) => {
    return data[key] ? inner : '';
  });
}

function renderVars(template, data) {
  // {{{var}}} — unescaped (für eigenes HTML)
  template = template.replace(/\{\{\{(\w+)\}\}\}/g, (m, key) => data[key] ?? '');
  // {{var}} — escaped
  template = template.replace(/\{\{(\w+)\}\}/g, (m, key) => escapeHtml(data[key]));
  return template;
}

/**
 * Rendert ein Template mit Daten
 * @param {string} name - Dateiname ohne .html, z.B. 'login'
 * @param {object} data - Variablen für das Template
 */
function render(name, data = {}) {
  let template = getTemplate(name);
  template = renderEach(template, data);
  template = renderIf(template, data);
  template = renderVars(template, data);
  return template;
}

module.exports = { render };
