/* Drop-as-child for Zen's tab drag and drop. Zen keeps handling the drag; we
 * wrap its handlers to add a middle-of-the-row zone: hovering it outlines the
 * row, and dropping there makes the dragged tabs that row's children.
 *
 * Folder rows have no tab of their own, so Zen has no drop position for them.
 * Dropping on a folder row's upper or lower edge places the tabs before the
 * folder or after its subtree, and dropping in the middle makes them its
 * children. Zen does its own move first; we then put the tabs and the folder
 * rows where the drop meant. */
"use strict";

class DragAndDrop {
  #tree;
  #onDrop;
  #target = null;
  #zone = null;
  /** Explicit drop being applied: { target, zone, nodes: Set }. */
  intent = null;

  /** @param onDrop called after a drop we reposition, to process the resulting moves. */
  constructor(tree, onDrop) {
    this.#tree = tree;
    this.#onDrop = onDrop;
  }

  /** Wraps Zen's drag handlers; returns the function that unwraps them. */
  attach() {
    const dnd = gBrowser.tabContainer.tabDragAndDrop;
    if (!dnd) {
      return () => {};
    }
    const self = this;
    const { handle_dragover, handle_drop, handle_dragend } = dnd;
    dnd.handle_dragover = function (event) {
      const result = handle_dragover.call(this, event);
      try {
        self.#onDragOver(event);
      } catch (e) {
        console.error(e);
      }
      return result;
    };
    dnd.handle_drop = function (event) {
      const target = self.#target;
      const zone = self.#zone;
      const nodes = self.#draggedNodes(event);
      const splitting = !!document.querySelector("zen-split-fake-tab");
      self.#setTarget(null);
      if (target && zone && nodes && !splitting) {
        self.intent = { target, zone, nodes: new Set(nodes) };
      }
      try {
        return handle_drop.call(this, event);
      } finally {
        self.#applyIntent();
      }
    };
    dnd.handle_dragend = function (event) {
      self.#setTarget(null);
      return handle_dragend.call(this, event);
    };
    return () => {
      // The originals live on the prototype.
      delete dnd.handle_dragover;
      delete dnd.handle_drop;
      delete dnd.handle_dragend;
      this.#setTarget(null);
    };
  }

  #draggedNodes(event) {
    const dragged = event.dataTransfer?.mozGetDataAt(TAB_DROP_TYPE, 0);
    const movingTabs = dragged?._dragData?.movingTabs;
    if (!movingTabs?.length || !movingTabs.every(t => gBrowser.isTab(t))) {
      return null;
    }
    return [...new Set(movingTabs.map(t => this.#tree.nodeOf(t)))];
  }

  #onDragOver(event) {
    const tree = this.#tree;
    const dragged = event.dataTransfer?.mozGetDataAt(TAB_DROP_TYPE, 0);
    const nodes = this.#draggedNodes(event);
    const row = event.target.closest?.(".tabbrowser-tab, .ztt-folder, tab-split-view-wrapper");
    const target = row && tree.nodeOf(row);
    let valid =
      nodes &&
      target &&
      isSidebarExpanded() &&
      tree.isNode(target) &&
      nodes.every(n => tree.isNode(n) && n !== target && !tree.isAncestor(n, target)) &&
      !document.querySelector("zen-split-fake-tab");
    let zone = null;
    if (valid) {
      const rect = window.windowUtils.getBoundsWithoutFlushing(target);
      const ratio = (event.clientY - rect.top) / rect.height;
      zone = ratio < CHILD_DROP_ZONE[0] ? "before" : ratio > CHILD_DROP_ZONE[1] ? "after" : "child";
      // A tab's own edges are Zen's business: it already drops before or after.
      valid = isFolder(target) || zone === "child";
    }
    if (!valid) {
      this.#setTarget(null);
      return;
    }
    this.#setTarget(target, zone);
    if (isFolder(target)) {
      // Folder rows have no tab index for Zen to aim at: aim at the last tab
      // inside, and the drop is put in place after Zen's own move anyway.
      const anchor = this.#dropAnchorFor(target);
      if (anchor) {
        dragged._dragData.dropElement = anchor;
        dragged._dragData.dropBefore = false;
      }
      return;
    }
    // Make Zen drop the tabs right after the target: they become its first children.
    dragged._dragData.dropElement = target;
    dragged._dragData.dropBefore = false;
  }

  /** A tab near a folder row that Zen can use as a drop position. */
  #dropAnchorFor(folder) {
    const tree = this.#tree;
    const last = tree.tabsOf(tree.descendantsOf(folder)).at(-1);
    if (last) {
      return last;
    }
    for (let el = folder.nextElementSibling; el; el = el.nextElementSibling) {
      const lead = tree.isNode(el) ? tree.leadOf(el) : null;
      if (lead) {
        return lead;
      }
    }
    return null;
  }

  #setTarget(node, zone = null) {
    if (this.#target === node && this.#zone === zone) {
      return;
    }
    for (const attr of [ATTR.dropTarget, ATTR.dropBefore, ATTR.dropAfter]) {
      this.#target?.removeAttribute(attr);
    }
    this.#target = node;
    this.#zone = node ? zone : null;
    if (node) {
      const attr = zone === "before" ? ATTR.dropBefore : zone === "after" ? ATTR.dropAfter : ATTR.dropTarget;
      node.setAttribute(attr, "true");
    }
    document.documentElement.toggleAttribute("ztt-dropping-child", node ? zone === "child" : false);
  }

  #applyIntent() {
    const tree = this.#tree;
    const intent = this.intent;
    if (!intent) {
      return;
    }
    if (!intent.target.isConnected || !tree.isNode(intent.target)) {
      this.intent = null;
      return;
    }
    const dropped = [...intent.nodes]
      .filter(node => node.isConnected)
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      // Keep dragged children attached to a dragged parent.
      .filter(node => !intent.nodes.has(tree.parentOf(node)));
    if (!dropped.length) {
      this.intent = null;
      return;
    }
    const target = intent.target;
    const excluded = new Set(dropped.flatMap(node => tree.subtreeOf(node)));
    const lastInside = tree.descendantsOf(target).filter(node => !excluded.has(node)).at(-1) ?? target;
    if (intent.zone === "child") {
      tree.setCollapsedAttr(target, false);
      if (isFolder(target)) {
        tree.moveSubtreesInto(dropped, lastInside);
      }
    } else if (intent.zone === "before") {
      tree.moveSubtreesBefore(dropped, target);
    } else {
      tree.moveSubtreesAfter(dropped, lastInside);
    }
    const parent = intent.zone === "child" ? target : tree.parentOf(target);
    for (const node of dropped) {
      tree.setParent(node, parent);
    }
    this.#onDrop(); // its flush clears the intent once the moves are processed
  }
}
