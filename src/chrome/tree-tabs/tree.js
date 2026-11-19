/* The tree model: queries and link edits.
 *
 * The tree lives on the tab elements themselves:
 *   ztt-parent="<id>"  the parent tab's (or folder's) DOM id. Zen gives every
 *                      tab a stable id (its window-sync id), persisted across
 *                      sessions and shared by the mirrored copies of a tab in
 *                      other windows. Folders get a generated id instead.
 *   ztt-collapsed      the tab's (or folder's) children are hidden.
 *
 * Tree *nodes* are the direct children of a space's normal tab list: a tab, a
 * split-view group acting as a single node, or a folder row (`div.ztt-folder`).
 * A split group takes its parent from its member tabs, and a tab whose parent
 * is any member of a group is a child of that group. A folder sorts its
 * children by their place in the DOM like any other node.
 *
 * Node order is the DOM order; a node's subtree always directly follows it.
 */
"use strict";

class Tree {
  /** > 0 while we move tabs ourselves, so those moves aren't treated as the user's. */
  internalMoves = 0;

  // ------------------------------------------------------------------ nodes

  splitGroupOf(tab) {
    if (!tab) {
      return null;
    }
    if (isSplitNode(tab.splitview)) {
      return tab.splitview;
    }
    return tab.group?.hasAttribute("split-view-group") ? tab.group : null;
  }

  /** The tree node a tab (or folder) belongs to: its split view, or itself. */
  nodeOf(el) {
    if (!el || isFolder(el) || isSplitNode(el)) {
      return el ?? null;
    }
    return this.splitGroupOf(el) ?? el;
  }

  isNode(el) {
    if (sectionOf(el) !== el?.parentElement) {
      return false;
    }
    if (isFolder(el)) {
      return true;
    }
    if (gBrowser.isTab(el)) {
      return !el.pinned && !el.hasAttribute("zen-empty-tab") && !el.hasAttribute("zen-glance-tab");
    }
    return isSplitNode(el) && this.membersOf(el).length > 0;
  }

  membersOf(node) {
    if (!node || isFolder(node)) {
      return [];
    }
    return gBrowser.isTab(node) ? [node] : node.tabs.filter(t => !t.closing);
  }

  /** The tab that represents a node: links point to it, decorations live on it. */
  leadOf(node) {
    if (!node || isFolder(node)) {
      return null;
    }
    return this.membersOf(node)[0] ?? null;
  }

  /** The element a child's ztt-parent points at. */
  linkIdOf(node) {
    return isFolder(node) ? node.id : this.idOf(this.leadOf(node));
  }

  /** The first tab in a node's subtree, folders included. */
  firstTabOf(node) {
    return this.membersOf(node)[0] ?? this.tabsOf(this.descendantsOf(node))[0] ?? null;
  }

  tabsOf(nodes) {
    return nodes.flatMap(n => this.membersOf(n));
  }

  /** Items the tree logic steps over without breaking a tree. */
  isTransparent(el) {
    if (gBrowser.isTabGroup(el)) {
      // A split group being dissolved.
      return el.hasAttribute("split-view-group") && !el.tabs.some(t => !t.closing);
    }
    return (
      gBrowser.isTab(el) &&
      (el.closing || el.hidden || el.hasAttribute("zen-glance-tab") || el.hasAttribute("zen-empty-tab"))
    );
  }

  sections() {
    return document.querySelectorAll(`.${SECTION_CLASS}`);
  }

  allNodes() {
    const nodes = [];
    for (const section of this.sections()) {
      for (const el of section.children) {
        if (!this.isTransparent(el) && this.isNode(el)) {
          nodes.push(el);
        }
      }
    }
    return nodes;
  }

  nextNode(node) {
    for (let el = node.nextElementSibling; el; el = el.nextElementSibling) {
      if (!this.isTransparent(el)) {
        return this.isNode(el) ? el : null;
      }
    }
    return null;
  }

  previousNode(node) {
    for (let el = node.previousElementSibling; el; el = el.previousElementSibling) {
      if (!this.isTransparent(el)) {
        return this.isNode(el) ? el : null;
      }
    }
    return null;
  }

  // ------------------------------------------------------------- relations

  /** The element a parent link points at, if it is still around in the same space. */
  #parentElementOf(el) {
    const id = el.getAttribute(ATTR.parent);
    const parent = id ? document.getElementById(id) : null;
    if (!parent || parent === el || !(gBrowser.isTab(parent) || isFolder(parent))) {
      return null;
    }
    // Each space has its own trees: a tab moved to another space leaves its
    // old parent behind.
    if (sectionOf(parent) !== sectionOf(el)) {
      return null;
    }
    // A parent always comes first in the tab strip; a link pointing forward is
    // stale (the tab was dragged out of its tree).
    if (!(parent.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      return null;
    }
    return parent;
  }

  parentOf(node) {
    if (isFolder(node)) {
      const parent = this.#parentElementOf(node);
      return parent ? this.nodeOf(parent) : null;
    }
    for (const member of this.membersOf(node)) {
      const parentEl = this.#parentElementOf(member);
      if (parentEl) {
        const parent = this.nodeOf(parentEl);
        if (parent !== node) {
          return parent;
        }
      }
    }
    return null;
  }

  isAncestor(ancestor, node) {
    let current = node;
    for (let i = 0; i < MAX_DEPTH_WALK && current; i++) {
      current = this.parentOf(current);
      if (current === ancestor) {
        return true;
      }
    }
    return false;
  }

  /** Direct children, in tab order. Works for a node that is closing. */
  childrenOf(node) {
    return this.allNodes().filter(n => n !== node && this.parentOf(n) === node);
  }

  /** Nodes in other spaces whose parent link still points at `node`. */
  strayChildrenOf(node) {
    const section = sectionOf(node);
    const ids = new Set([node.id, ...this.membersOf(node).map(m => m.id)].filter(Boolean));
    return this.allNodes().filter(
      n => n !== node && sectionOf(n) !== section && ids.has(n.getAttribute(ATTR.parent))
    );
  }

  /**
   * Gives a node's leftover children in its old space the node's own parent, so
   * they stay where they were when the node moves to another space.
   */
  promoteStrays(node, strays) {
    const parentId = this.parentIdOf(node);
    const [first, ...rest] = strays;
    this.setParentId(first, parentId);
    this.setCollapsedAttr(first, this.isCollapsed(node));
    for (const stray of rest) {
      this.setParent(stray, first);
    }
  }

  /** All descendants, in tab order. */
  descendantsOf(node) {
    return this.allNodes().filter(n => n !== node && this.isAncestor(node, n));
  }

  /** Node plus descendants, for moving or closing a whole subtree. */
  subtreeOf(node) {
    return [node, ...this.descendantsOf(node)];
  }

  /** The closest earlier node with the same parent, or null. */
  previousSibling(node) {
    const parent = this.parentOf(node);
    let sibling = this.previousNode(node);
    while (sibling && sibling !== parent && this.parentOf(sibling) !== parent) {
      sibling = this.previousNode(sibling);
    }
    return sibling && sibling !== parent ? sibling : null;
  }

  /** The closest later node with the same parent, or null. */
  nextSibling(node) {
    const parent = this.parentOf(node);
    let sibling = this.nextNode(node);
    while (sibling && sibling !== parent && this.parentOf(sibling) !== parent) {
      sibling = this.nextNode(sibling);
    }
    return sibling && sibling !== parent ? sibling : null;
  }

  /** Whether `node` sits inside `ancestor`'s subtree region (only its descendants in between). */
  isInsideSubtree(node, ancestor) {
    if (sectionOf(ancestor) !== sectionOf(node)) {
      return false;
    }
    for (let el = this.nextNode(ancestor); el; el = this.nextNode(el)) {
      if (el === node) {
        return true;
      }
      if (!this.isAncestor(ancestor, el)) {
        return false;
      }
    }
    return false;
  }

  isCollapsed(node) {
    if (isFolder(node)) {
      return node.hasAttribute(ATTR.collapsed);
    }
    return this.membersOf(node).some(t => t.hasAttribute(ATTR.collapsed));
  }

  // ------------------------------------------------------------- link edits

  idOf(tab) {
    if (!tab.id) {
      // Zen assigns ids to every tab of synced windows; private / workspace-less
      // windows don't get one, so give the tab a local one.
      tab.id = `ztt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    }
    return tab.id;
  }

  /** The parent id a node links to outside of itself (may be dangling). */
  parentIdOf(node) {
    if (isFolder(node)) {
      return node.getAttribute(ATTR.parent);
    }
    const members = this.membersOf(node);
    for (const member of members) {
      const id = member.getAttribute(ATTR.parent);
      if (id && !members.some(m => m.id === id)) {
        return id;
      }
    }
    return null;
  }

  setParentId(node, id) {
    if (isFolder(node)) {
      if (id) {
        node.setAttribute(ATTR.parent, id);
      } else {
        node.removeAttribute(ATTR.parent);
      }
      return;
    }
    for (const member of this.membersOf(node)) {
      if (id) {
        member.setAttribute(ATTR.parent, id);
      } else {
        member.removeAttribute(ATTR.parent);
      }
    }
  }

  setParent(node, parent) {
    this.setParentId(node, parent ? this.linkIdOf(parent) : null);
  }

  setCollapsedAttr(node, collapsed) {
    if (isFolder(node)) {
      node.toggleAttribute(ATTR.collapsed, collapsed);
      return;
    }
    for (const member of this.membersOf(node)) {
      member.toggleAttribute(ATTR.collapsed, collapsed);
    }
  }

  /**
   * Removes `node` from the tree, keeping its subtree together: the first
   * child takes its place and the other children become that child's children.
   */
  promoteChildren(node) {
    const [first, ...rest] = this.childrenOf(node);
    if (!first) {
      return;
    }
    this.setParentId(first, this.parentIdOf(node));
    this.setCollapsedAttr(first, this.isCollapsed(node));
    for (const child of rest) {
      this.setParent(child, first);
    }
  }

  /** Takes a tab out of the tree (pinned, put in a folder), its children closing ranks. */
  detach(tab) {
    this.promoteChildren(tab);
    tab.removeAttribute(ATTR.parent);
    tab.removeAttribute(ATTR.collapsed);
  }

  moveNodesAfter(nodes, target) {
    this.internalMoves++;
    try {
      gBrowser.moveTabsAfter(nodes, target);
    } finally {
      this.internalMoves--;
    }
  }

  /** The last element of a node's subtree, where its children end. */
  lastElementOf(node) {
    return this.subtreeOf(node).at(-1) ?? node;
  }

  /** Moves nodes (folders included, with their subtrees) right after `refEl`. */
  moveSubtreesAfter(nodes, refEl) {
    this.#moveSubtrees(nodes, tabs => gBrowser.moveTabsAfter(tabs, refEl), (el, prev, firstTab) => {
      if (prev) {
        prev.after(el);
      } else if (firstTab) {
        firstTab.before(el);
      } else {
        refEl.after(el);
      }
    });
  }

  /** Moves nodes (folders included, with their subtrees) right before `refEl`. */
  moveSubtreesBefore(nodes, refEl) {
    this.#moveSubtrees(nodes, tabs => gBrowser.moveTabsBefore(tabs, refEl), (el, prev, firstTab) => {
      if (prev) {
        prev.after(el);
      } else if (firstTab) {
        firstTab.before(el);
      } else {
        refEl.before(el);
      }
    });
  }

  /** Moves nodes into a folder, as its last children. */
  moveSubtreesInto(nodes, refEl) {
    this.#moveSubtrees(nodes, tabs => gBrowser.moveTabsAfter(tabs, refEl), (el, prev, firstTab) => {
      if (prev) {
        prev.after(el);
      } else if (firstTab) {
        firstTab.before(el);
      } else {
        refEl.after(el);
      }
    });
  }

  /**
   * Moves whole subtrees. Tabs and split groups go through Zen's move API, so
   * tab bookkeeping and the session stay right; folder rows are plain elements
   * and are moved in the DOM to sit next to the block's tabs.
   */
  #moveSubtrees(nodes, moveTabs, placeRow) {
    const block = nodes.flatMap(n => this.subtreeOf(n));
    const items = block.filter(el => !isFolder(el));
    this.internalMoves++;
    try {
      if (items.length) {
        moveTabs(items);
      }
      let previous = null;
      for (const el of block) {
        if (!isFolder(el)) {
          previous = el;
          continue;
        }
        placeRow(el, previous, items[0] ?? null);
        previous = el;
      }
    } finally {
      this.internalMoves--;
    }
  }
}
