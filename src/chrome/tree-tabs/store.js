/* Persistence and window sync. Each tab's links are saved in Zen's session
 * data (survives restarts and add-on updates) and pushed to the mirrored copy
 * of the tab in Zen's other synced windows, matched by tab id.
 *
 * Folder rows have no tab of their own, so the tab right after a folder saves
 * that folder's record in its own state (see Folders). Rows after the last tab
 * of a space have nothing to ride on, so they are saved on the window instead,
 * per space: that keeps empty folders alive across restarts. */
"use strict";

class Store {
  /** tab -> last persisted state string, to only write/broadcast changes. */
  #saved = new WeakMap();
  /** Last saved window-level folder list, to only write changes. */
  #savedTails = null;
  #onRemoteChange;
  #folders;

  /** @param onRemoteChange called when another window changed one of our tabs. */
  constructor(onRemoteChange, folders) {
    this.#onRemoteChange = onRemoteChange;
    this.#folders = folders;
  }

  /** Serialized links of a tab ("" when it has none). */
  stateOf(tab) {
    const parent = tab.getAttribute(ATTR.parent);
    const collapsed = tab.hasAttribute(ATTR.collapsed);
    const folders = this.#folders.recordsAround(tab);
    if (!parent && !collapsed && !folders.length) {
      return "";
    }
    const state = { parent: parent || null, collapsed };
    if (folders.length) {
      state.folders = folders;
    }
    return JSON.stringify(state);
  }

  #applyState(tab, value) {
    let state = {};
    try {
      state = value ? JSON.parse(value) : {};
    } catch {}
    if (state.parent) {
      tab.setAttribute(ATTR.parent, state.parent);
    } else {
      tab.removeAttribute(ATTR.parent);
    }
    tab.toggleAttribute(ATTR.collapsed, !!state.collapsed);
    this.#folders.applyAround(tab, Array.isArray(state.folders) ? state.folders : []);
  }

  /** Reads a tab's links back from the session. */
  restore(tab) {
    const value = SessionStore.getCustomTabValue(tab, STORE_KEY) || "";
    this.#applyState(tab, value);
    this.#saved.set(tab, value);
  }

  /** Saves and broadcasts every tab whose links changed. */
  persistAll() {
    this.#folders.beginPass();
    try {
      for (const tab of gBrowser.tabs) {
        this.#persist(tab);
      }
      this.#persistTails();
    } finally {
      this.#folders.endPass();
    }
  }

  /** Saves the folder rows that no tab carries (empty or trailing folders). */
  #persistTails() {
    const values = {};
    for (const [key, records] of this.#folders.savedTails()) {
      if (key) {
        values[key] = records;
      }
    }
    const value = Object.keys(values).length ? JSON.stringify(values) : "";
    if (value === this.#savedTails) {
      return;
    }
    this.#savedTails = value;
    if (value) {
      SessionStore.setCustomWindowValue(window, TAILS_KEY, value);
    } else {
      SessionStore.deleteCustomWindowValue(window, TAILS_KEY);
    }
  }

  /** Puts back the folder rows saved on the window, for every space. */
  restoreTails() {
    let values = {};
    try {
      values = JSON.parse(SessionStore.getCustomWindowValue(window, TAILS_KEY) || "{}");
    } catch {
      return;
    }
    for (const section of document.querySelectorAll(`.${SECTION_CLASS}`)) {
      const records = values[sectionKey(section)];
      if (Array.isArray(records) && records.length) {
        this.#folders.restoreTails(section, records);
      }
    }
  }

  #persist(tab) {
    const value = this.stateOf(tab);
    if (this.#saved.get(tab) === value) {
      return;
    }
    this.#saved.set(tab, value);
    if (tab.closing) {
      return;
    }
    if (value) {
      SessionStore.setCustomTabValue(tab, STORE_KEY, value);
    } else {
      SessionStore.deleteCustomTabValue(tab, STORE_KEY);
    }
    for (const mirror of this.#mirrorsOf(tab)) {
      mirror.ownerDocument.defaultView.gZenTreeTabs.receiveState(mirror, value);
    }
  }

  /** Copies a tab's links from its mirror in another window, if any. */
  pull(tab) {
    for (const mirror of this.#mirrorsOf(tab)) {
      this.#applyState(tab, mirror.ownerDocument.defaultView.gZenTreeTabs.stateOf(mirror));
      return;
    }
  }

  /** Another window changed the mirrored copy of `tab`. */
  receive(tab, value) {
    if (this.stateOf(tab) !== value) {
      this.#applyState(tab, value);
      this.#onRemoteChange();
    }
  }

  *#mirrorsOf(tab) {
    if (!tab.id) {
      return;
    }
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win === window || !win.gZenTreeTabs || win.closed) {
        continue;
      }
      const mirror = win.document.getElementById(tab.id);
      if (mirror && win.gBrowser.isTab(mirror)) {
        yield mirror;
      }
    }
  }
}
