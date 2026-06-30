/**
 * Simple JSON-based storage
 * Swap this out for PostgreSQL/MySQL later without touching anything else
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadCollection(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveCollection(name, data) {
  const file = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const db = {
  find(collection, query = {}) {
    const data = loadCollection(collection);
    return data.filter(item =>
      Object.entries(query).every(([k, v]) => item[k] === v)
    );
  },

  findOne(collection, query = {}) {
    return this.find(collection, query)[0] || null;
  },

  insert(collection, doc) {
    const data = loadCollection(collection);
    data.push(doc);
    saveCollection(collection, data);
    return doc;
  },

  update(collection, query, changes) {
    const data = loadCollection(collection);
    let updated = 0;
    const result = data.map(item => {
      if (Object.entries(query).every(([k, v]) => item[k] === v)) {
        updated++;
        return { ...item, ...changes };
      }
      return item;
    });
    saveCollection(collection, result);
    return updated;
  },

  all(collection) {
    return loadCollection(collection);
  }
};

module.exports = db;
