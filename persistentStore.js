/**
 * PersistentStore - Named disk-backed Map stores with debounced auto-save.
 *
 * Usage:
 *   const store = PersistentStore.create('whispers');
 *   await store.load();
 *   store.set('key', { data: 'value' });  // auto-saves to data_whispers.json
 *   store.get('key');                      // synchronous read from memory
 *   store.delete('key');                   // auto-saves
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Registry of all created stores (singleton per name)
const stores = new Map();

export class PersistentStore {
  constructor(name) {
    this._name = name;
    this._filePath = path.join(__dirname, `data_${name}.json`);
    this._data = new Map();
    this._dirty = false;
    this._saveTimer = null;
    this._saving = false;
  }

  /**
   * Factory: creates or returns existing store for the given name.
   * Call .load() after to read from disk.
   */
  static create(name) {
    if (stores.has(name)) return stores.get(name);
    const store = new PersistentStore(name);
    stores.set(name, store);
    return store;
  }

  /**
   * Load data from disk into memory. Call once after create().
   */
  async load() {
    try {
      const raw = await fs.readFile(this._filePath, 'utf8');
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        this._data.set(k, v);
      }
      console.log(`✅ [STORE:${this._name}] Loaded ${this._data.size} entries from disk`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`📦 [STORE:${this._name}] No existing file — starting empty`);
      } else {
        console.error(`❌ [STORE:${this._name}] Failed to load:`, err.message);
      }
    }
    return this;
  }

  get(key) {
    return this._data.get(key);
  }

  has(key) {
    return this._data.has(key);
  }

  values() {
    return this._data.values();
  }

  entries() {
    return this._data.entries();
  }

  keys() {
    return this._data.keys();
  }

  get size() {
    return this._data.size;
  }

  set(key, value) {
    this._data.set(key, value);
    this._scheduleSave();
    return this;
  }

  delete(key) {
    const existed = this._data.delete(key);
    if (existed) this._scheduleSave();
    return existed;
  }

  _scheduleSave() {
    this._dirty = true;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 1000);
  }

  async _save() {
    if (!this._dirty || this._saving) return;
    this._saving = true;
    try {
      const obj = Object.fromEntries(this._data);
      const json = JSON.stringify(obj, null, 2);
      const tmpPath = this._filePath + '.tmp';
      await fs.writeFile(tmpPath, json);
      await fs.rename(tmpPath, this._filePath);
      this._dirty = false;
      console.log(`💾 [STORE:${this._name}] Saved ${this._data.size} entries`);
    } catch (err) {
      console.error(`❌ [STORE:${this._name}] Save failed:`, err.message);
    } finally {
      this._saving = false;
    }
  }

  /**
   * Force immediate save (for graceful shutdown).
   */
  async flush() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._dirty = true;
    await this._save();
  }
}
