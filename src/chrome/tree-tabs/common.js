/* Constants and small DOM helpers shared by every part (loaded first). */
"use strict";

const ATTR = {
  // The tree itself, persisted:
  parent: "ztt-parent",
  collapsed: "ztt-collapsed",
  // Computed by the renderer, on nodes:
  depth: "ztt-depth",
  hasChildren: "ztt-has-children",
  hidden: "ztt-hidden",
  // Computed by the renderer, on the tab showing a node's decorations:
  twisty: "ztt-twisty", // "open" | "closed"
  guides: "ztt-guides",
  // Drag and drop feedback:
  dropTarget: "ztt-drop-target",
  dropBefore: "ztt-drop-before",
  dropAfter: "ztt-drop-after",
  dragging: "ztt-dragging-folder",
};
const NODE_COMPUTED_ATTRS = [ATTR.depth, ATTR.hasChildren, ATTR.hidden];
const STORE_KEY = "zenTreeTabs";
const SECTION_CLASS = "zen-workspace-normal-tabs-section";
const FOLDER_CLASS = "ztt-folder";
const FOLDER_ID_PREFIX = "ztt-folder-";
const TAB_DROP_TYPE = "application/x-moz-tabbrowser-tab";
const INDENT_PX = 18;
const CHILD_DROP_ZONE = [0.25, 0.75]; // middle band of a row = drop as child
const CLICK_DELAY_MS = 220; // wait this long to tell a click from a double-click
const MAX_DEPTH_WALK = 1000;

/** Folder rows are plain elements, not tabs: `div.ztt-folder` in a tab section. */
const isFolder = el => !!el?.classList?.contains(FOLDER_CLASS);

/**
 * A split view as one element: Zen's `tab-split-view-wrapper`, or the
 * `tab-group[split-view-group]` older versions use.
 */
const isSplitNode = el => {
  if (!el || gBrowser.isTab(el) || !Array.isArray(el.tabs)) {
    return false;
  }
  return el.localName === "tab-split-view-wrapper" || !!el.hasAttribute?.("split-view-group");
};

/** The tab section an element lives in, if any. */
const sectionOf = el => el?.closest?.(`.${SECTION_CLASS}`) ?? null;

// The renderer runs on every tab switch: only touch the DOM when a value really
// changes, so it doesn't trigger restyles or wake other attribute observers.
const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
};

const setDepthVar = (el, depth) => {
  const value = depth ? String(depth) : "";
  if (el.style.getPropertyValue("--ztt-depth") !== value) {
    if (value) {
      el.style.setProperty("--ztt-depth", value);
    } else {
      el.style.removeProperty("--ztt-depth");
    }
  }
};

const isSidebarExpanded = () => document.documentElement.getAttribute("zen-sidebar-expanded") === "true";
