/* Wires everything together: listens to Zen's tab events, turns them into
 * tree edits, and re-renders. Event handlers and user actions are the only
 * code that changes links; rendering just reflects them.
 *
 * The instance is window.gZenTreeTabs (see tree-tabs.uc.js). */
"use strict";

const TAB_EVENTS = [
  "TabOpen",
  "TabClose",
  "TabMove",
  "TabSelect",
  "TabPinned",
  "TabGrouped",
  "TabUngrouped",
  "ZenSplitViewTabsSplit",
  "ZenTabRemovedFromSplit",
  "TabGroupRemoved",
  "SSTabRestoring",
];

class ZenTreeTabs {
  tree = new Tree();
  folders = new Folders(this.tree, () => this.rebuild());
  renderer = new Renderer(this.tree);
  store = new Store(() => this.scheduleFlush(), this.folders);
  dnd = new DragAndDrop(this.tree, () => this.scheduleFlush());
  folderDrag = new FolderDrag(this);

  #flushQueued = false;
  #pendingOpens = new Set();
  #pendingMoves = new Set();
  #pendingGrouped = new Set();
  #cleanups = [];
  #stopped = false;

  // ------------------------------------------------------------ lifecycle

  init() {
    document.documentElement.style.setProperty("--ztt-indent-step", `${INDENT_PX}px`);
    for (const type of TAB_EVENTS) {
      window.addEventListener(type, this);
    }
    window.addEventListener("mousedown", this, true);
    window.addEventListener("click", this, true);
    this.#cleanups.push(
      () => {
        for (const type of TAB_EVENTS) {
          window.removeEventListener(type, this);
        }
        window.removeEventListener("mousedown", this, true);
        window.removeEventListener("click", this, true);
      },
      this.dnd.attach(),
      this.folderDrag.attach(),
      createTreeMenu(this),
      createFolderMenu(this),
      createShortcuts(this)
    );

    for (const tab of gBrowser.tabs) {
      this.store.restore(tab);
    }
    // Windows that mirror ours (Zen window sync) hold the freshest state.
    for (const tab of gBrowser.tabs) {
      this.store.pull(tab);
    }
    this.rebuild();
  }

  uninit() {
    this.#stopped = true; // a flush still queued must not redecorate afterwards
    for (const cleanup of this.#cleanups.reverse()) {
      try {
        cleanup();
      } catch (e) {
        console.error(e);
      }
    }
    this.#cleanups = [];
    // Leave ztt-parent/ztt-collapsed alone: they are harmless without the
    // stylesheet and let a re-enabled mod pick the tree back up.
    this.renderer.clear();
    document.documentElement.style.removeProperty("--ztt-indent-step");
  }

  // --------------------------------------------------------------- events

  handleEvent(event) {
    const target = event.target;
    switch (event.type) {
      case "TabOpen":
        this.#pendingOpens.add(target);
        this.scheduleFlush();
        break;
      case "TabClose":
        this.#onTabClose(target);
        break;
      case "TabMove":
      case "TabUngrouped":
      case "ZenSplitViewTabsSplit":
      case "ZenTabRemovedFromSplit":
        if (!this.tree.internalMoves && !this.#isMirroredChange()) {
          this.#pendingMoves.add(target);
        }
        this.scheduleFlush();
        break;
      case "TabGrouped":
        this.#pendingGrouped.add(target);
        this.scheduleFlush();
        break;
      case "TabGroupRemoved":
        // The emptied group element can outlive the last tab move.
        setTimeout(() => this.scheduleFlush(), 0);
        break;
      case "TabSelect":
        if (this.nodeOf(target).hasAttribute(ATTR.hidden)) {
          this.#expandAncestors(this.nodeOf(target));
        }
        this.scheduleFlush(); // highlight the new active path
        break;
      case "TabPinned": {
        const folder = this.tree.parentOf(this.nodeOf(target));
        this.tree.detach(target);
        this.pruneFolder(folder);
        this.scheduleFlush();
        break;
      }
      case "SSTabRestoring":
        this.store.restore(target);
        this.scheduleFlush();
        break;
      case "mousedown":
      case "click":
        this.#onTwistyMouse(event);
        break;
    }
  }

  #onTabOpen(tab) {
    const tree = this.tree;
    let opener = tab.openerTab;
    if (opener?.hasAttribute("zen-glance-tab")) {
      opener = gZenGlanceManager.getTabOrGlanceParent(opener);
    }
    if (!opener || opener.closing || !tree.isNode(tab) || tab.hasAttribute(ATTR.parent)) {
      return;
    }
    const parent = tree.nodeOf(opener);
    if (!tree.isNode(parent) || sectionOf(parent) !== sectionOf(tab)) {
      return;
    }
    tree.setParent(tab, parent);
    tree.setCollapsedAttr(parent, false);
    // New children go to the end of the opener's subtree.
    const last = tree.descendantsOf(parent).filter(n => n !== tab).at(-1) ?? parent;
    if (tree.nextNode(last) !== tab) {
      tree.moveNodesAfter([tab], last);
    }
  }

  #onTabClose(tab) {
    const tree = this.tree;
    const folder = tree.parentOf(tree.nodeOf(tab));
    // Zen may already have dissolved the split group, so use the remembered mates.
    const others = (this.renderer.splitMates.get(tab) ?? []).filter(t => t.isConnected && !t.closing);
    if (others.length) {
      // The split group lives on: hand this tab's links over to another member.
      const heir = others[0];
      const isOutside = id => id && id !== tab.id && !others.some(t => t.id === id);
      const ownParentId = tab.getAttribute(ATTR.parent);
      const parentId = isOutside(ownParentId)
        ? ownParentId
        : (others.map(t => t.getAttribute(ATTR.parent)).find(isOutside) ?? null);
      const collapsed = tab.hasAttribute(ATTR.collapsed) || others.some(t => t.hasAttribute(ATTR.collapsed));
      for (const t of gBrowser.tabs) {
        if (t.getAttribute(ATTR.parent) === tab.id) {
          tree.setParent(t, heir);
        }
      }
      for (const member of others) {
        tree.setParentId(member, parentId);
        member.toggleAttribute(ATTR.collapsed, collapsed);
      }
    } else {
      tree.promoteChildren(tab);
    }
    this.pruneFolder(folder);
    this.scheduleFlush();
  }

  /** A node was moved by something other than us: keep its subtree with it and re-derive its parent. */
  #onNodeMoved(node) {
    const tree = this.tree;
    if (!tree.isNode(node)) {
      return;
    }
    const oldParent = tree.parentOf(node);
    // Children the node left behind in its old space take its place there.
    const strays = tree.strayChildrenOf(node);
    if (strays.length) {
      tree.promoteStrays(node, strays);
    }
    let descendants = tree.descendantsOf(node);
    if (descendants.some(d => sectionOf(d) !== sectionOf(node))) {
      // Moved to another space: it leaves its tree behind, and its folders stay
      // in the space they belong to (an empty one is pruned below).
      tree.promoteChildren(node);
      tree.setCollapsedAttr(node, false);
      descendants = [];
    } else if (descendants.length) {

      const children = tree.childrenOf(node);
      const inPlace = children.every((child, i) => tree.nextNode(i ? children[i - 1] : node) === child);
      if (!inPlace) {
        tree.moveSubtreesAfter(children, node);
      }
    }

    if (this.dnd.intent?.nodes.has(node)) {
      return; // Parent set explicitly by the drop.
    }
    const next = tree.nextNode(descendants.at(-1) ?? node);
    const nextParent = next ? tree.parentOf(next) : null;
    let newParent = nextParent;
    if (oldParent && tree.isInsideSubtree(node, oldParent)) {
      // Still among its siblings: keep the parent, unless the next node needs
      // a deeper one to stay attached to its own parent.
      newParent = nextParent && tree.isAncestor(oldParent, nextParent) ? nextParent : oldParent;
    }
    if (newParent !== oldParent || (!newParent && tree.parentIdOf(node)) || !gBrowser.isTab(node)) {
      // For split groups this also gives every member the same parent, so
      // whichever tab survives the split keeps the group's place.
      tree.setParent(node, newParent);
    }
    if (newParent !== oldParent) {
      this.pruneFolder(oldParent);
    }
  }

  /**
   * Zen mirrors tab moves into every synced window. Those replayed moves are
   * already reflected by the tree state pushed from the window the user acts in.
   */
  #isMirroredChange() {
    const active = Services.focus.activeWindow;
    return !!active && active !== window && !!active.gZenTreeTabs;
  }

  #onTwistyMouse(event) {
    if (event.button !== 0) {
      return;
    }
    const tab = event.target.closest?.(`.tabbrowser-tab[${ATTR.twisty}]`);
    const icon = event.target.closest?.(".tab-icon-stack");
    if (!tab || !icon || !tab.contains(icon) || !isSidebarExpanded()) {
      return;
    }
    // Keep the tab from being selected or dragged.
    event.stopPropagation();
    event.preventDefault();
    if (event.type === "click") {
      this.toggleCollapsed(this.nodeOf(tab));
    }
  }

  // ---------------------------------------------------------------- flush

  scheduleFlush() {
    if (this.#flushQueued) {
      return;
    }
    this.#flushQueued = true;
    // After the current event (and Zen's own synchronous handling) completes.
    queueMicrotask(() => this.#flush());
  }

  #flush() {
    this.#flushQueued = false;
    if (this.#stopped) {
      return;
    }
    try {
      const opens = [...this.#pendingOpens];
      this.#pendingOpens.clear();
      for (const tab of opens) {
        this.store.pull(tab);
        this.#onTabOpen(tab);
      }

      const grouped = [...this.#pendingGrouped];
      this.#pendingGrouped.clear();
      for (const tab of grouped) {
        // Folders take tabs out of the tree; split views keep them in as a group node.
        if (tab.isConnected && tab.group && !this.tree.splitGroupOf(tab)) {
          const folder = this.tree.parentOf(this.tree.nodeOf(tab));
          this.tree.detach(tab);
          this.pruneFolder(folder);
        }
      }

      const moved = new Set();
      for (const el of this.#pendingMoves) {
        if (el.isConnected) {
          moved.add(gBrowser.isTab(el) ? this.nodeOf(el) : el);
        }
      }
      this.#pendingMoves.clear();
      const sorted = [...moved].sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      );
      for (const node of sorted) {
        this.#onNodeMoved(node);
      }
      this.pruneLooseFolders();
    } catch (e) {
      console.error("zen-tree-tabs: flush failed", e);
    }
    this.dnd.intent = null;
    this.rebuild();
  }

  /** Re-renders and saves. Never edits links. */
  rebuild() {
    this.renderer.render(this.nodeOf(gBrowser.selectedTab));
    this.store.persistAll();
  }

  // --------------------------------------------------------- user actions

  setCollapsed(node, collapsed) {
    const tree = this.tree;
    if (collapsed === tree.isCollapsed(node)) {
      return;
    }
    if (collapsed && tree.isAncestor(node, this.nodeOf(gBrowser.selectedTab))) {
      gBrowser.selectedTab = tree.firstTabOf(node) ?? gBrowser.selectedTab;
    }
    tree.setCollapsedAttr(node, collapsed);
    this.rebuild();
  }

  toggleCollapsed(node) {
    this.setCollapsed(node, !this.tree.isCollapsed(node));
  }

  setAllCollapsed(collapsed) {
    const tree = this.tree;
    const selected = this.nodeOf(gBrowser.selectedTab);
    for (const node of tree.allNodes()) {
      if (node.hasAttribute(ATTR.hasChildren)) {
        if (collapsed && tree.isAncestor(node, selected) && !tree.parentOf(node)) {
          gBrowser.selectedTab = tree.firstTabOf(node) ?? gBrowser.selectedTab;
        }
        tree.setCollapsedAttr(node, collapsed);
      }
    }
    this.rebuild();
  }

  #expandAncestors(node) {
    const tree = this.tree;
    for (let p = tree.parentOf(node), i = 0; p && i < MAX_DEPTH_WALK; p = tree.parentOf(p), i++) {
      tree.setCollapsedAttr(p, false);
    }
    this.rebuild();
  }

  /** "Nest Under Sibling Above": `node` becomes the last child of its previous sibling. */
  nestUnderSiblingAbove(node) {
    const tree = this.tree;
    const sibling = tree.isNode(node) && tree.previousSibling(node);
    if (!sibling) {
      return;
    }
    const oldParent = tree.parentOf(node);
    tree.setParent(node, sibling);
    tree.setCollapsedAttr(sibling, false);
    this.pruneFolder(oldParent);
    this.rebuild();
  }

  /** "Move Out of Parent": `node` (with its subtree) becomes its parent's next sibling. */
  moveOutOfParent(node) {
    const tree = this.tree;
    const parent = tree.isNode(node) && tree.parentOf(node);
    if (!parent) {
      return;
    }
    const oldParent = tree.parentOf(parent);
    this.#moveSubtreeAfterTree(node, parent);
    tree.setParentId(node, tree.parentIdOf(parent));
    this.pruneFolder(oldParent);
    this.rebuild();
  }

  /** Make `node` (with its subtree) a top-level node right after its current tree. */
  detachFromTree(node) {
    const tree = this.tree;
    if (!tree.isNode(node) || !tree.parentOf(node)) {
      return;
    }
    let root = node;
    while (tree.parentOf(root)) {
      root = tree.parentOf(root);
    }
    const oldParent = tree.parentOf(node);
    this.#moveSubtreeAfterTree(node, root);
    tree.setParent(node, null);
    this.pruneFolder(oldParent);
    this.rebuild();
  }

  /** Moves `node`'s subtree right after the end of `ancestor`'s subtree. */
  #moveSubtreeAfterTree(node, ancestor) {
    const tree = this.tree;
    const subtree = tree.subtreeOf(node);
    const last = tree.descendantsOf(ancestor).filter(n => !subtree.includes(n)).at(-1) ?? ancestor;
    if (tree.nextNode(last) !== node) {
      tree.moveSubtreesAfter([node], last);
    }
  }

  // --------------------------------------------------------------- folders

  /** "New Folder": wraps a node in a new folder, in place. */
  createFolderAround(node) {
    const tree = this.tree;
    if (!tree.isNode(node)) {
      return null;
    }
    const parent = tree.parentOf(node);
    const folder = this.folders.create({ parent: parent ? tree.linkIdOf(parent) : null });
    node.before(folder);
    tree.setParent(node, folder);
    this.rebuild();
    this.folders.startRename(folder, { cancel: () => this.deleteFolder(folder) });
    return folder;
  }

  /** "New Subfolder": wraps the folder's first child, or adds a row to it. */
  createSubfolder(folder) {
    const tree = this.tree;
    const first = tree.childrenOf(folder)[0];
    const sub = this.folders.create({ parent: tree.linkIdOf(folder) });
    if (first) {
      first.before(sub);
      tree.setParent(first, sub);
    } else {
      tree.lastElementOf(folder).after(sub);
    }
    this.rebuild();
    this.folders.startRename(sub, { cancel: () => this.deleteFolder(sub) });
    return sub;
  }

  /** "Unpack Folder": the row goes away, its tabs move up to the folder's parent. */
  deleteFolder(folder) {
    if (!isFolder(folder)) {
      return;
    }
    const tree = this.tree;
    const parentId = tree.parentIdOf(folder);
    for (const child of tree.childrenOf(folder)) {
      tree.setParentId(child, parentId);
    }
    const parent = tree.parentOf(folder);
    folder.remove();
    this.pruneFolder(parent);
    this.rebuild();
  }

  /** Removes a folder row that lost its last tab, and empty folders above it. */
  pruneFolder(folder) {
    let current = folder;
    while (isFolder(current) && current.isConnected && this.folders.isEmpty(current)) {
      const parent = this.tree.parentOf(current);
      current.remove();
      current = parent;
    }
  }

  /** Removes folders left empty by moves Zen made on its own (e.g. to another space). */
  pruneLooseFolders() {
    for (const folder of document.querySelectorAll(`.${FOLDER_CLASS}`)) {
      if (folder.isConnected && this.folders.isEmpty(folder)) {
        this.pruneFolder(folder);
      }
    }
  }

  /** Swaps `node` with the sibling above it, subtree and all. */
  moveNodeUp(node) {
    const previous = this.tree.isNode(node) && this.tree.previousSibling(node);
    if (!previous) {
      return;
    }
    this.tree.moveSubtreesBefore([node], previous);
    this.rebuild();
  }

  /** Swaps `node` with the sibling below it, subtree and all. */
  moveNodeDown(node) {
    const tree = this.tree;
    const next = tree.isNode(node) && tree.nextSibling(node);
    if (!next) {
      return;
    }
    tree.moveSubtreesAfter([node], tree.lastElementOf(next));
    this.rebuild();
  }

  closeTree(node) {
    gBrowser.removeTabs(this.tree.tabsOf(this.tree.subtreeOf(node)));
  }

  closeChildren(node) {
    gBrowser.removeTabs(this.tree.tabsOf(this.tree.descendantsOf(node)));
  }

  // ------------------------------------- public API (other windows, tools)

  nodeOf(tab) {
    return this.tree.nodeOf(tab);
  }

  descendantsOf(node) {
    return this.tree.descendantsOf(node);
  }

  /** Called by another window when the mirrored copy of `tab` changed. */
  receiveState(tab, value) {
    this.store.receive(tab, value);
  }

  stateOf(tab) {
    return this.store.stateOf(tab);
  }
}

this.ZenTreeTabs = ZenTreeTabs;
