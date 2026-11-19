/* Zen Tree Tabs with Folders: tree style tabs in Zen's native vertical tab strip,
 * with named folders in the tree.
 *
 * Entry point, loaded into every browser window either by the add-on
 * (experiment/parent.js) or by the Sine mod manager (theme.json). It loads the
 * parts in tree-tabs/ into a private scope, starts itself once Zen is ready,
 * loads tree-tabs.css, and exposes window.gZenTreeTabs; stop() removes
 * everything again.
 *
 *   tree-tabs/common.js      constants and DOM helpers
 *   tree-tabs/tree.js        the tree model: nodes, links, queries, edits
 *   tree-tabs/folders.js     named folder rows and their saved records
 *   tree-tabs/render.js      depth, visibility, twisty, badge, guide lines
 *   tree-tabs/store.js       session persistence and window sync
 *   tree-tabs/dnd.js         drop-as-child for Zen's drag and drop
 *   tree-tabs/folder-dnd.js  dragging folder rows, click and rename
 *   tree-tabs/ui.js          context menus and keyboard shortcuts
 *   tree-tabs/controller.js  tab events, tree edits, user actions
 */
"use strict";

(function () {
  // Another copy (add-on and Sine mod both installed) already runs here.
  if (window.gZenTreeTabs) {
    return;
  }
  const PARTS = ["common", "tree", "folders", "render", "store", "dnd", "folder-dnd", "ui", "controller"];

  const scriptURL = Components.stack.filename;
  const sibling = path => {
    const url = new URL(path, scriptURL);
    url.search = new URL(scriptURL).search; // same cache-buster as this script
    return url.href;
  };
  // A private scope: the parts share it (and see window globals through it)
  // without adding anything to the window.
  const scope = {};
  for (const part of PARTS) {
    Services.scriptloader.loadSubScriptWithOptions(sibling(`tree-tabs/${part}.js`), {
      target: scope,
      ignoreCache: true,
    });
  }
  const styleURL = sibling("tree-tabs.css");
  const instance = new scope.ZenTreeTabs();
  let state = "starting"; // -> "running" -> "stopped"

  Object.assign(instance, {
    scriptURL,
    /** Tears everything down; safe to call at any point. */
    stop() {
      if (state === "running") {
        instance.uninit();
        window.windowUtils.removeSheetUsingURIString(styleURL, window.windowUtils.AUTHOR_SHEET);
      }
      state = "stopped";
      if (window.gZenTreeTabs === instance) {
        delete window.gZenTreeTabs;
      }
    },
  });
  window.gZenTreeTabs = instance;
  // Sine: lets the mod be disabled without a restart (no-op elsewhere).
  window.addUnloadListener?.(() => instance.stop());

  (async () => {
    // Zen builds its space tab containers asynchronously.
    await window.gZenStartup?.promiseInitialized;
    if (state !== "starting" || window.closed) {
      return;
    }
    window.windowUtils.loadSheetUsingURIString(styleURL, window.windowUtils.AUTHOR_SHEET);
    state = "running"; // before init(), so stop() also undoes a partial init
    instance.init();
  })().catch(e => console.error("zen-tree-tabs: failed to start", e));
})();
