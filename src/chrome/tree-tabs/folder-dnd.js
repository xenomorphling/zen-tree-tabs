/* Folder row interactions: drag a folder (with its subtree) anywhere in the
 * tree, click to collapse it, double-click its label to rename it.
 *
 * Folder rows are plain elements, so Zen's tab drag and drop never starts on
 * them; this is a small mouse-driven drag of our own. */
"use strict";

class FolderDrag {
  #ctrl;
  #tree;
  #start = null;
  #target = null;
  #zone = null;
  #moved = false;
  #suppressClick = false;
  /** Pending single-click toggle, waiting to see whether a double-click follows. */
  #clickTimer = 0;

  constructor(ctrl) {
    this.#ctrl = ctrl;
    this.#tree = ctrl.tree;
  }

  /** Adds the listeners; returns the function that removes them. */
  attach() {
    window.addEventListener("mousedown", this, true);
    window.addEventListener("click", this, true);
    window.addEventListener("dblclick", this, true);
    return () => {
      window.removeEventListener("mousedown", this, true);
      window.removeEventListener("click", this, true);
      window.removeEventListener("dblclick", this, true);
      clearTimeout(this.#clickTimer);
      this.#stop();
    };
  }

  handleEvent(event) {
    switch (event.type) {
      case "mousedown":
        this.#onMouseDown(event);
        break;
      case "mousemove":
        this.#onMouseMove(event);
        break;
      case "mouseup":
        this.#onMouseUp(event);
        break;
      case "keydown":
        this.#stop();
        break;
      case "click":
        this.#onClick(event);
        break;
      case "dblclick":
        this.#onDoubleClick(event);
        break;
    }
  }

  // ---------------------------------------------------------------- events

  #folderRowOf(event) {
    const row = event.target.closest?.(`.${FOLDER_CLASS}`);
    return sectionOf(row) ? row : null;
  }

  #onMouseDown(event) {
    if (event.button !== 0 || event.defaultPrevented || !isSidebarExpanded()) {
      return;
    }
    const folder = this.#folderRowOf(event);
    if (!folder || event.target.closest(".ztt-folder-input")) {
      return;
    }
    event.preventDefault(); // no text selection, no native drag
    this.#start = { folder, x: event.clientX, y: event.clientY };
    window.addEventListener("mousemove", this, true);
    window.addEventListener("mouseup", this, true);
    window.addEventListener("keydown", this, true);
  }

  #onMouseMove(event) {
    if (!this.#start) {
      return;
    }
    if (!this.#moved) {
      if (Math.abs(event.clientX - this.#start.x) < 4 && Math.abs(event.clientY - this.#start.y) < 4) {
        return;
      }
      this.#moved = true;
      this.#start.folder.setAttribute(ATTR.dragging, "true");
      document.documentElement.setAttribute(ATTR.dragging, "true");
    }
    event.preventDefault();
    this.#updateTarget(event);
  }

  #onMouseUp() {
    if (!this.#start) {
      return;
    }
    const { folder } = this.#start;
    const moved = this.#moved;
    const target = this.#target;
    const zone = this.#zone;
    this.#stop();
    if (moved) {
      this.#suppressClick = true;
      // A drag that ends outside any row produces no click.
      setTimeout(() => (this.#suppressClick = false), 0);
    }
    if (moved && target && zone) {
      this.#apply(folder, target, zone);
    }
  }

  #onClick(event) {
    if (this.#suppressClick) {
      this.#suppressClick = false;
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }
    const folder = this.#folderRowOf(event);
    if (!folder || event.detail > 1) {
      // The second click of a double-click renames instead.
      return;
    }
    if (event.target.closest(".ztt-folder-input")) {
      return;
    }
    event.stopPropagation();
    // A double-click must not also collapse the folder.
    clearTimeout(this.#clickTimer);
    this.#clickTimer = setTimeout(() => {
      this.#clickTimer = 0;
      if (folder.isConnected) {
        this.#ctrl.toggleCollapsed(folder);
      }
    }, CLICK_DELAY_MS);
  }

  #onDoubleClick(event) {
    const folder = this.#folderRowOf(event);
    if (folder && event.target.closest(".ztt-folder-label")) {
      event.stopPropagation();
      clearTimeout(this.#clickTimer);
      this.#clickTimer = 0;
      this.#ctrl.folders.startRename(folder);
    }
  }

  // ------------------------------------------------------------ drag state

  #updateTarget(event) {
    const tree = this.#tree;
    const folder = this.#start.folder;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const row = hit?.closest?.(".tabbrowser-tab, .ztt-folder, tab-split-view-wrapper, tab-group[split-view-group]");
    const node = row ? tree.nodeOf(row) : null;
    let valid =
      node &&
      tree.isNode(node) &&
      sectionOf(node) === sectionOf(folder) &&
      node !== folder &&
      !tree.isAncestor(folder, node);
    let zone = null;
    if (valid) {
      const rect = window.windowUtils.getBoundsWithoutFlushing(node);
      const ratio = (event.clientY - rect.top) / rect.height;
      zone = ratio < CHILD_DROP_ZONE[0] ? "before" : ratio > CHILD_DROP_ZONE[1] ? "after" : "child";
    }
    this.#setIndicator(valid ? node : null, zone);
  }

  #setIndicator(node, zone) {
    if (this.#target === node && this.#zone === zone) {
      return;
    }
    if (this.#target) {
      for (const attr of [ATTR.dropTarget, ATTR.dropBefore, ATTR.dropAfter]) {
        this.#target.removeAttribute(attr);
      }
    }
    this.#target = node;
    this.#zone = zone;
    if (node) {
      const attr = zone === "child" ? ATTR.dropTarget : zone === "before" ? ATTR.dropBefore : ATTR.dropAfter;
      node.setAttribute(attr, "true");
    }
  }

  #stop() {
    window.removeEventListener("mousemove", this, true);
    window.removeEventListener("mouseup", this, true);
    window.removeEventListener("keydown", this, true);
    const folder = this.#start?.folder;
    folder?.removeAttribute(ATTR.dragging);
    document.documentElement.removeAttribute(ATTR.dragging);
    this.#setIndicator(null, null);
    this.#start = null;
    this.#moved = false;
  }

  // ------------------------------------------------------------------ drop

  #apply(folder, target, zone) {
    const tree = this.#tree;
    // Find the spot before the folder joins the target's tree: otherwise the
    // folder's own subtree is part of the target's descendants.
    const anchor = zone === "before" ? target : tree.lastElementOf(target);
    if (zone === "child") {
      tree.setParent(folder, target);
      tree.setCollapsedAttr(target, false);
      tree.moveSubtreesAfter([folder], anchor);
    } else {
      tree.setParent(folder, tree.parentOf(target));
      if (zone === "before") {
        tree.moveSubtreesBefore([folder], anchor);
      } else {
        tree.moveSubtreesAfter([folder], anchor);
      }
    }
    this.#ctrl.rebuild();
  }
}

this.FolderDrag = FolderDrag;
