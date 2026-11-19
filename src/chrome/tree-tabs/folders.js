/* Folder rows: named, unpinned groups of tree nodes.
 *
 * A folder is a plain row (`div.ztt-folder`) in a space's tab section, so it
 * nests in the tree like any other node: it has a ztt-parent link and a
 * ztt-collapsed state, and its children are the nodes after it whose parent
 * points at it.
 *
 * Persistence: a folder row has no tab to save state on, so its record is
 * saved on the tab that comes right after it (see Store). That tab's saved
 * state lists the folder rows that must be (re)created before it, in order.
 * A tab that follows several nested folders gets them all in one list. A folder
 * left without any tab is dropped (see Controller.pruneFolder).
 */
"use strict";

class Folders {
  #tree;
  #onChange;
  /** Per-section folder ownership, valid while a persist pass runs. */
  #owners = null;

  /** @param onChange called after a rename, to re-render and save. */
  constructor(tree, onChange) {
    this.#tree = tree;
    this.#onChange = onChange;
  }

  nameOf(folder) {
    return folder.querySelector(":scope > .ztt-folder-label")?.textContent?.trim() || "Folder";
  }

  create({ id, name = "Folder", parent = null, collapsed = false } = {}) {
    const folder = document.createElement("div");
    folder.className = FOLDER_CLASS;
    folder.id = id || `${FOLDER_ID_PREFIX}${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    if (parent) {
      folder.setAttribute(ATTR.parent, parent);
    }
    if (collapsed) {
      folder.setAttribute(ATTR.collapsed, "");
    }

    const icon = document.createElement("span");
    icon.className = "ztt-folder-icon";
    const twisty = document.createXULElement("image");
    twisty.className = "ztt-twisty";
    const count = document.createElement("span");
    count.className = "ztt-count";
    icon.append(twisty, count);

    const label = document.createElement("span");
    label.className = "ztt-folder-label";
    label.textContent = name;

    folder.append(icon, label);
    return folder;
  }

  /** Applies a saved record to an existing folder row. */
  update(folder, record) {
    folder.id = record.id;
    if (record.parent) {
      folder.setAttribute(ATTR.parent, record.parent);
    } else {
      folder.removeAttribute(ATTR.parent);
    }
    folder.toggleAttribute(ATTR.collapsed, !!record.collapsed);
    const label = folder.querySelector(":scope > .ztt-folder-label");
    if (label && record.name && label.textContent !== record.name) {
      label.textContent = record.name;
    }
  }

  /** What a tab saves about the folder rows just before it. */
  recordOf(folder) {
    return {
      id: folder.id,
      name: this.nameOf(folder),
      parent: folder.getAttribute(ATTR.parent) || null,
      collapsed: folder.hasAttribute(ATTR.collapsed),
    };
  }

  /** A folder with no tab left in it is not worth keeping. */
  isEmpty(folder) {
    return this.#tree.tabsOf(this.#tree.descendantsOf(folder)).length === 0;
  }

  /** Saves nothing about folders that are not anchored below a tree node. */
  recordsAround(tab) {
    const node = this.#tree.nodeOf(tab);
    if (tab !== this.#tree.leadOf(node)) {
      return [];
    }
    return this.#ownedBy(node).map(folder => this.recordOf(folder));
  }

  /** Recreates or updates the folder rows saved on `tab`'s state. */
  applyAround(tab, records = []) {
    const node = this.#tree.nodeOf(tab);
    if (tab !== this.#tree.leadOf(node)) {
      return;
    }
    this.#dropUnwanted(this.#ownedBy(node), records);
    this.#ensure(node, records);
  }

  /** Caches folder ownership for the duration of one persist pass. */
  beginPass() {
    this.#owners = new WeakMap();
  }

  endPass() {
    this.#owners = null;
  }

  /**
   * Moves the row's label aside for an inline rename.
   *
   * @param cancel  called when the edit is cancelled; a folder that was just
   *                created passes its own removal, so Escape drops it.
   */
  startRename(folder, { cancel } = {}) {
    const label = folder.querySelector(":scope > .ztt-folder-label");
    if (!label || !isSidebarExpanded() || folder.querySelector(":scope > .ztt-folder-input")) {
      // The collapsed sidebar shows no labels: there is nothing to edit.
      return;
    }
    const input = document.createElement("input");
    input.className = "ztt-folder-input";
    input.value = this.nameOf(folder);
    label.hidden = true;
    label.after(input);
    input.focus();
    input.select();

    let done = false;
    const finish = commit => {
      if (done) {
        return;
      }
      done = true;
      const name = input.value.replace(/\s+/g, " ").trim();
      input.remove();
      label.hidden = false;
      if (commit && name && name !== label.textContent) {
        label.textContent = name;
        this.#onChange();
      }
    };
    input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Enter") {
        finish(true);
      } else if (event.key === "Escape") {
        finish(false);
        cancel?.();
      }
    });
    input.addEventListener("blur", () => finish(true));
  }

  // ---------------------------------------------------------------- private

  /** Folder rows a node owns: the rows right before it. */
  #ownedBy(node) {
    const section = sectionOf(node);
    if (!section) {
      return [];
    }
    return this.#ownersOf(section).get(node) ?? [];
  }

  #ownersOf(section) {
    if (this.#owners) {
      const cached = this.#owners.get(section);
      if (cached) {
        return cached;
      }
    }
    const map = new Map();
    let pending = [];
    for (const el of section.children) {
      if (isFolder(el)) {
        pending.push(el);
        continue;
      }
      if (!this.#tree.isNode(el)) {
        continue; // closing tabs and other transient elements
      }
      if (pending.length) {
        map.set(el, pending);
        pending = [];
      }
    }
    // Empty folder rows at the end of the section have no tab after them.
    if (this.#owners) {
      this.#owners.set(section, map);
    }
    return map;
  }

  #dropUnwanted(local, records) {
    const wanted = new Set(records.map(record => record.id));
    for (const folder of local) {
      if (!wanted.has(folder.id)) {
        folder.remove();
      }
    }
  }

  #ensure(node, records) {
    let previous = null;
    for (const record of records) {
      let folder = document.getElementById(record.id);
      if (!isFolder(folder)) {
        folder = this.create(record);
        if (previous) {
          previous.after(folder);
        } else {
          node.before(folder);
        }
      } else {
        this.update(folder, record);
        if (sectionOf(folder) !== sectionOf(node)) {
          // Moved to another space: keep the row with the tab that carries it.
          if (previous) {
            previous.after(folder);
          } else {
            node.before(folder);
          }
        }
      }
      previous = folder;
    }
  }
}

this.Folders = Folders;
