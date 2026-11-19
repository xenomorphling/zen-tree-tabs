/* The tab context menu's "Tree" submenu and the keyboard shortcuts. Each
 * creator returns the function that removes what it added. */
"use strict";

function createTreeMenu(ctrl) {
  const tree = ctrl.tree;
  const menu = document.getElementById("tabContextMenu");
  if (!menu) {
    return () => {};
  }
  const make = (tag, attrs = {}) => {
    const el = document.createXULElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  };
  const contextNode = () => {
    const tab = TabContextMenu.contextTab;
    return tab ? tree.nodeOf(tab) : null;
  };

  const separatorAbove = make("menuseparator", { id: "ztt-context-separator-above" });
  const separatorBelow = make("menuseparator", { id: "ztt-context-separator-below" });
  const submenu = make("menu", { id: "ztt-context-menu", label: "Tree" });
  const popup = make("menupopup", { id: "ztt-context-popup" });
  submenu.append(popup);
  const items = {
    toggle: { label: "Collapse Tree", run: n => ctrl.toggleCollapsed(n) },
    closeTree: { label: "Close Tree", run: n => ctrl.closeTree(n) },
    closeChildren: { label: "Close Children", run: n => ctrl.closeChildren(n) },
    newFolder: { label: "New Folder", key: "Alt+Shift+N", run: n => ctrl.createFolderAround(n) },
    sep1: null,
    nest: { label: "Nest Under Sibling Above", key: "Alt+Shift+→", run: n => ctrl.nestUnderSiblingAbove(n) },
    moveOut: { label: "Move Out of Parent", key: "Alt+Shift+←", run: n => ctrl.moveOutOfParent(n) },
    detach: { label: "Detach from Tree", run: n => ctrl.detachFromTree(n) },
    sep2: null,
    collapseAll: { label: "Collapse All Trees", run: () => ctrl.setAllCollapsed(true) },
    expandAll: { label: "Expand All Trees", run: () => ctrl.setAllCollapsed(false) },
  };
  const elements = {};
  for (const [name, item] of Object.entries(items)) {
    if (!item) {
      popup.append(make("menuseparator"));
      continue;
    }
    const el = make("menuitem", { id: `ztt-context-${name}`, label: item.label });
    if (item.key) {
      el.setAttribute("acceltext", item.key);
    }
    el.addEventListener("command", () => {
      const node = contextNode();
      if (node) {
        item.run(node);
      }
    });
    popup.append(el);
    elements[name] = el;
  }
  const anchor = document.getElementById("context_closeTab");
  if (anchor) {
    anchor.before(separatorAbove, submenu, separatorBelow);
  } else {
    menu.append(separatorAbove, submenu, separatorBelow);
  }

  // Native separators next to the anchor come and go (Zen's sync separator is
  // hidden without sync), so only show ours where no visible one already sits.
  const isVisible = el => !el.hidden && getComputedStyle(el).display !== "none";
  const needsSeparator = (from, step) => {
    for (let el = from[step]; el; el = el[step]) {
      if (isVisible(el)) {
        return el.localName !== "menuseparator";
      }
    }
    return false;
  };

  const onShowing = event => {
    if (event.target !== menu) {
      return;
    }
    const node = contextNode();
    const isNode = !!node && tree.isNode(node);
    separatorAbove.hidden = separatorBelow.hidden = submenu.hidden = !isNode;
    if (!isNode) {
      return;
    }
    separatorAbove.hidden = !needsSeparator(separatorAbove, "previousElementSibling");
    separatorBelow.hidden = !needsSeparator(separatorBelow, "nextElementSibling");
    const hasChildren = node.hasAttribute(ATTR.hasChildren);
    const hasParent = !!tree.parentOf(node);
    elements.toggle.setAttribute("label", tree.isCollapsed(node) ? "Expand Tree" : "Collapse Tree");
    elements.toggle.disabled = !hasChildren;
    elements.closeTree.disabled = !hasChildren;
    elements.closeChildren.disabled = !hasChildren;
    elements.newFolder.hidden = isFolder(node);
    elements.nest.disabled = !tree.previousSibling(node);
    elements.moveOut.disabled = !hasParent;
    elements.detach.disabled = !hasParent;
  };
  menu.addEventListener("popupshowing", onShowing);
  return () => {
    menu.removeEventListener("popupshowing", onShowing);
    separatorAbove.remove();
    separatorBelow.remove();
    submenu.remove();
  };
}

function createFolderMenu(ctrl) {
  const tree = ctrl.tree;
  const make = (tag, attrs = {}) => {
    const el = document.createXULElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  };
  const popup = make("menupopup", { id: "ztt-folder-context" });
  const items = {
    rename: { label: "Rename Folder…", run: f => ctrl.folders.startRename(f) },
    subfolder: { label: "New Subfolder", run: f => ctrl.createSubfolder(f) },
    sepA: null,
    toggle: { label: "Collapse Folder", run: f => ctrl.toggleCollapsed(f) },
    sepB: null,
    nest: { label: "Nest Under Sibling Above", run: f => ctrl.nestUnderSiblingAbove(f) },
    moveOut: { label: "Move Out of Parent", run: f => ctrl.moveOutOfParent(f) },
    detach: { label: "Detach from Tree", run: f => ctrl.detachFromTree(f) },
    up: { label: "Move Up", run: f => ctrl.moveNodeUp(f) },
    down: { label: "Move Down", run: f => ctrl.moveNodeDown(f) },
    sepC: null,
    close: { label: "Close Folder", run: f => ctrl.closeTree(f) },
    unpack: { label: "Unpack Folder", run: f => ctrl.deleteFolder(f) },
  };
  const elements = {};
  let folder = null;
  for (const [name, item] of Object.entries(items)) {
    if (!item) {
      popup.append(make("menuseparator"));
      continue;
    }
    const el = make("menuitem", { id: `ztt-folder-${name}`, label: item.label });
    el.addEventListener("command", () => {
      if (folder?.isConnected) {
        item.run(folder);
      }
    });
    popup.append(el);
    elements[name] = el;
  }

  const onContextMenu = event => {
    const row = event.target.closest?.(`.${FOLDER_CLASS}`);
    if (!row || !row.parentElement?.classList.contains(SECTION_CLASS)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    folder = row;
    const hasParent = !!tree.parentOf(folder);
    const hasChildren = folder.hasAttribute(ATTR.hasChildren);
    // The collapsed sidebar shows no labels, so there is nothing to rename there.
    elements.rename.disabled = !isSidebarExpanded();
    elements.toggle.setAttribute("label", tree.isCollapsed(folder) ? "Expand Folder" : "Collapse Folder");
    elements.toggle.disabled = !hasChildren;
    elements.close.disabled = !hasChildren;
    elements.nest.disabled = !tree.previousSibling(folder);
    elements.moveOut.disabled = !hasParent;
    elements.detach.disabled = !hasParent;
    elements.up.disabled = !tree.previousSibling(folder);
    elements.down.disabled = !tree.nextSibling(folder);
    popup.openPopupAtScreen(event.screenX, event.screenY, true);
  };

  const popupSet = document.getElementById("mainPopupSet") ?? document.documentElement;
  popupSet.append(popup);
  window.addEventListener("contextmenu", onContextMenu, true);
  return () => {
    window.removeEventListener("contextmenu", onContextMenu, true);
    popup.remove();
  };
}

function createShortcuts(ctrl) {
  const tree = ctrl.tree;
  const keyset = document.createXULElement("keyset");
  keyset.id = "ztt-keyset";
  const commandset = document.createXULElement("commandset");
  commandset.id = "ztt-commandset";
  const shortcuts = [
    ["VK_RIGHT", node => ctrl.nestUnderSiblingAbove(node)],
    ["VK_LEFT", node => ctrl.moveOutOfParent(node)],
    ["VK_N", node => ctrl.createFolderAround(node)],
    [
      "VK_DOWN",
      node => {
        // Toggle the current branch: the tab itself if it has children, else its parent.
        const target = node.hasAttribute(ATTR.hasChildren) ? node : tree.parentOf(node);
        if (target) {
          ctrl.toggleCollapsed(target);
        }
      },
    ],
  ];
  for (const [keycode, run] of shortcuts) {
    // Keys are only active when bound to a <command>.
    const command = document.createXULElement("command");
    command.id = `ztt-cmd-${keycode}`;
    command.addEventListener("command", () => {
      const node = tree.nodeOf(gBrowser.selectedTab);
      if (tree.isNode(node)) {
        run(node);
      }
    });
    commandset.append(command);
    const key = document.createXULElement("key");
    key.id = `ztt-key-${keycode}`;
    key.setAttribute("keycode", keycode);
    key.setAttribute("modifiers", "alt,shift");
    key.setAttribute("command", command.id);
    keyset.append(key);
  }
  document.documentElement.append(commandset, keyset);
  return () => {
    keyset.remove();
    commandset.remove();
  };
}
