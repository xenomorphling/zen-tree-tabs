# Zen Tree Tabs with Folders

Tree Style Tab–like tab trees for [Zen](https://zen-browser.app), right in Zen's own
tab list, plus named folders you can create anywhere in the tree. Links you open
land under the page they came from, so a rabbit hole stays one tidy branch.

This is a fork of [Ludonope/zen-tree-tabs](https://github.com/Ludonope/zen-tree-tabs)
that adds [folders](#folders). It installs under its own name and IDs, so you can
tell it apart from the original in Sine's mod list and in `about:addons`.

| Collapse and expand | Move a branch |
| :---: | :---: |
| <img src="docs/screenshots/collapse.gif" width="300" alt="Animation: hovering the History of coffee tab's icon turns it into an arrow; clicking collapses its three child tabs and a badge showing 3 appears. Collapsing the Coffee tab folds the whole tree into one row with a badge showing 8. Expanding Coffee again shows History of coffee still collapsed, which is then expanded too."> | <img src="docs/screenshots/drag-subtree.gif" width="300" alt="Animation: the Espresso tab, which has three tabs under it, is dragged onto the Coffeehouse tab; Coffeehouse gets outlined, and after the drop Espresso and all its children sit nested under Coffeehouse."> |
| Hover a parent's icon and click. Collapsed branches show how many tabs they hide. | Drop a tab on another and its children come along. |

## Features

- **Automatic nesting.** A link you open from a page becomes that page's child.
  Tabs you open yourself (new tab, address bar, bookmarks) stay at the top level.
- **Collapse and expand.** Hover a parent's icon and click the arrow. A collapsed
  parent shows how many tabs it hides.
- **Drag to rearrange.** Drop a tab on the middle of another to put it inside.
  Drop near the top or bottom edge to place it before or after. Children always
  come along.
- **See where you are.** Guide lines connect parents and children, and the branch
  leading to your current tab is highlighted.
- **Folders.** Group a part of a tree under a named folder and nest folders in
  folders. A folder takes its place in the tree like a tab: it can be collapsed,
  dragged around with its contents, and dropped inside a tab or another folder.
  Unlike Zen's pinned folders, these live in the normal tab list next to your
  tabs. Right-click any tab and choose **Tree → New Folder** to wrap it, or
  right-click a folder to rename it, add a subfolder, or unpack it.
- **Tree menu.** Right-click a tab and open **Tree** to collapse, close a whole
  tree, nest a tab under the sibling above it, move it out of its parent, and more.
  The most common actions also have [keyboard shortcuts](#keyboard-shortcuts).
- **Split views stay in the tree.** A split counts as one entry, with its place and
  its children kept.
- **Saved automatically.** Trees and folders survive restarts and look the same in
  every window.

### Keyboard shortcuts

| Shortcut      | Action                                                        |
| ------------- | ------------------------------------------------------------- |
| `Alt+Shift+→` | Nest under sibling above (the tab becomes its last child)     |
| `Alt+Shift+←` | Move out of parent (the tab becomes the parent's next sibling) |
| `Alt+Shift+↓` | Collapse or expand the current branch                         |
| `Alt+Shift+N` | New folder around the current tab                             |

### Folders

A folder is a row in the tab list with a name, so it nests like any other tree
node. Only the rows you see exist: closing the last tab inside a folder removes
the folder.

| Where | Action |
| --- | --- |
| Tab menu → **Tree → New Folder** | Wraps the tab in a new folder and opens its name for editing |
| Folder menu → **Rename Folder…** (or double-click the name) | Renames the folder |
| Folder menu → **New Subfolder** | Wraps the folder's first child in a nested folder |
| Folder menu → **Unpack Folder** | Removes the folder and moves its tabs up one level |
| Click a folder | Collapses or expands it (the badge shows how many tabs it hides) |
| Drag a tab onto the middle of a folder | Puts the tab inside the folder |
| Drag a folder | Moves the folder and everything inside it |

Dropping on the upper or lower edge of a folder row puts the tabs before the folder
or after everything inside it. Press `Enter` to keep the name of a folder you just
created, or `Esc` to drop the folder again.

### Good to know

- Closing a parent doesn't close its children: the first child takes its place.
- Pinned tabs and essentials are never part of a tree. Pinning a tab, or moving it
  into a folder, takes it out of its tree.
- Each space has its own trees. A folder belongs to the space its tabs are in;
  moving its last tab to another space leaves the folder behind.
- Tabs that were already open when you install stay flat; trees form as you browse.
- Zen's drag-to-split still works: hold the dragged tab over another one a little
  longer, until the split preview appears.

## Install

There are two ways to install Zen Tree Tabs with Folders. Both run the same code and
use the same saved trees, so you can switch between them without losing anything.

- **[As a Sine mod](#as-a-sine-mod).** Best if you already use the
  [Sine](https://github.com/CosmoCreeper/Sine) mod manager. You get updates from
  inside Zen, and there's nothing to change in `about:config`.
- **[As an add-on (`.xpi`)](#as-an-add-on-xpi).** Needs no extra tools, only two
  prefs.

If both are installed, only one copy runs and the other stays idle. The one in use is
the **Zen Tree Tabs with Folders** entry.

### As a Sine mod

You need Sine installed already. See
[Sine's installation guide](https://github.com/sineorg/docs/blob/main/src/installation.md).

> [!IMPORTANT]
> **Turn on Sine's "Enable installing JS from unofficial sources" first.** Zen Tree
> Tabs isn't in Sine's store yet, so Sine counts it as an unofficial mod. Without
> this setting, Sine still installs the mod and lists it as enabled, but never runs
> it, and no error is shown.
>
> The setting lets any mod you install from a GitHub link run code with full browser
> access, so only install mods you trust.

1. Open Zen's settings and go to the **Sine Mods** page.
2. Click the gear button next to the `username/repo` install field, and turn on
   **Enable installing JS from unofficial sources**. This is the
   `sine.allow-unsafe-js` pref.
3. In the install field, enter `xenomorphling/zen-tree-tabs` and click **Install**.
4. Restart Zen.

**Troubleshooting:** if the mod shows as installed but links don't nest, the setting
from step 2 is off. Turn it on and restart Zen. To check whether the mod is running,
right-click any tab: if the mod is running, the menu has a **Tree** submenu.

Sine checks the repository for updates. To remove the mod, use Sine's mod list. You
can disable it from there too, without restarting.

### As an add-on (`.xpi`)

The add-on comes as a single `.xpi` file. Get the latest one from the
[Releases page](https://github.com/xenomorphling/zen-tree-tabs/releases), or build it
yourself (see [Distributing](#distributing)).

#### Why it needs two prefs

To change Zen's own tab strip, the add-on has to run with full browser privileges
through a WebExtension *experiment API*. Mozilla's add-on site (AMO) only signs
experiment add-ons made by Mozilla itself, so this add-on is unsigned. Zen's
release builds still accept unsigned and experiment add-ons, but only once you turn
two prefs on.

> [!WARNING]
> `xpinstall.signatures.required = false` turns off the signature check for **every**
> add-on in that profile, not just this one. Only install `.xpi` files from sources
> you trust. Also note that this add-on, like any experiment add-on, has full access
> to the browser.

#### Steps

Do this once for each Zen profile:

1. Open `about:config` and accept the warning.
2. Set these two prefs. Double-click a pref to toggle it.
   - `xpinstall.signatures.required` → `false`
   - `extensions.experiments.enabled` → `true`
3. Open `about:addons`, click the gear icon, and choose **Install Add-on From File…**.
   Pick `zen-tree-tabs-with-folders-<version>.xpi` and confirm. You can also drag the
   `.xpi` onto a Zen window.

The add-on starts right away, without a restart. Your existing tabs stay flat; new
trees form as you open links. It should now appear as **Zen Tree Tabs with Folders**
in `about:addons`.

**Troubleshooting**

- **Zen says the add-on could not be verified.** `xpinstall.signatures.required` is
  still `true` in **this** profile. Prefs are per profile, so check `about:profiles` to
  see which one you're in.
- **The add-on is listed and enabled, but links don't nest.** It was installed before
  `extensions.experiments.enabled` was set to `true`. Set the pref, then disable and
  re-enable the add-on in `about:addons`, or restart Zen.

#### Setting it up with a script (many profiles or machines)

Instead of using `about:config`, put the two prefs in a `user.js` file in the
profile folder. Zen applies it at every startup:

```js
// <profile folder>/user.js
user_pref("xpinstall.signatures.required", false);
user_pref("extensions.experiments.enabled", true);
```

You can find the profile folder in `about:profiles`. On Linux it's usually
`~/.zen/<id>.<name>/`. Restart Zen, then install the `.xpi` as in step 3.

#### Updating

Install the newer `.xpi` the same way. It has the same add-on ID, so it replaces the
old version in place. Your trees are stored in Zen's session data, not in the
add-on, so they carry over.

The add-on doesn't update itself, so check the Releases page for new versions.

#### Uninstalling

Remove the add-on in `about:addons`. The indentation and decorations disappear
immediately, and no tabs are hidden or lost. If you don't use other unsigned
add-ons, you can then set the two prefs back to their defaults (right-click the
pref in `about:config` and choose **Reset**).

#### Compatibility

- This version was developed and tested with Zen 1.21.6b (Gecko 152) on Linux.
- It hooks into Zen internals (tab containers, split view, drag and drop), so a
  major Zen update can break parts of it. If tabs act strangely after a Zen update,
  disable the add-on: your tabs stay intact.
- Any Zen build that allows unsigned add-ons when `xpinstall.signatures.required` is
  `false` can run it. This is true of official Zen release builds on Linux.

## Distributing

To publish a new version:

1. Bump `version` in [src/manifest.json](src/manifest.json) and in
   [theme.json](theme.json). Zen only treats a higher version number as an upgrade.
2. Commit, then tag the commit with the same version and push both:

   ```sh
   git tag v0.4.2 && git push origin main v0.4.2
   ```

   The [Release workflow](.github/workflows/release.yml) builds
   `zen-tree-tabs-with-folders-<version>.xpi` and publishes it as a GitHub release.
   It refuses to publish if the tag doesn't match the manifest version.

To build the `.xpi` locally, run `tools/build.sh`. The file goes to `dist/`, which is
gitignored.

Don't change the add-on ID (`zen-tree-tabs-with-folders@ludonope` in the manifest).
Zen uses it to recognize updates, so a different ID would install yet another copy
alongside this one, and the Sine mod ID (`zen-tree-tabs-with-folders` in
[theme.json](theme.json)) likewise names the folder Sine keeps the mod in.

### Sine

Sine installs the mod straight from this repository, using
[theme.json](theme.json) at the repository root. So pushing to `main` is what
publishes a new version to Sine users.

- Keep `version` in `theme.json` the same as in `src/manifest.json`. `tools/build.sh`
  refuses to build if they differ.
- Sine downloads the whole repository, and `theme.json` points straight at
  `src/chrome/tree-tabs.uc.js`. That script loads `tree-tabs.css` from its own folder,
  so the mod and the add-on share the same files.
- Don't change the mod `id` (`zen-tree-tabs`). Sine stores the mod in a folder
  named after it.
- To get the mod listed in Sine's store, open a submission issue on
  [sineorg/store](https://github.com/sineorg/store). Once it's listed, users no
  longer need the "unofficial sources" option.

## Development

```sh
tools/dev.sh [--fresh]   # throwaway Zen profile, add-on loaded from src/, Marionette on :2829
tools/marionette.py eval 'return gZenTreeTabs.descendantsOf(gBrowser.selectedTab).length'
tools/marionette.py evalf tools/reload.js   # hot-reload tree-tabs.uc.js and its CSS into every window
tools/marionette.py shot out.png
tools/zoom.sh out.png        # zoomed screenshot of the sidebar
```

`tools/fixture.js` builds a sample tree and `tools/drag.js` simulates a drag through
Zen's handlers. Both expect test pages served on `127.0.0.1:8765`.

The README GIFs are recorded from a real Zen. Run `tools/demo.js` to build the
demo session from real sites, then `tools/gif-collapse.py` or `tools/gif-drag.py`
(rebuild the session before each one). Both use `tools/gifkit.py`, which adds the
mouse cursor that screenshots leave out.

Layout:

- `src/chrome/tree-tabs.uc.js` is the entry point. It loads the parts below into a
  private scope, starts itself, and exposes `window.gZenTreeTabs`, so the same file
  serves both loaders.
  - `tree-tabs/tree.js`: the tree model (tabs and split views as nodes, parent links,
    queries and edits).
  - `tree-tabs/controller.js`: tab events, tree edits and user actions.
  - `tree-tabs/render.js`: depth, collapsing, twisty, badge and guide lines.
  - `tree-tabs/store.js`: saving in the session and syncing across windows.
  - `tree-tabs/dnd.js`: drop-as-child on top of Zen's drag and drop.
  - `tree-tabs/ui.js`: the context menu and keyboard shortcuts.
  - `tree-tabs/common.js`: shared constants and helpers.
- `src/chrome/tree-tabs.css` holds all the styling.
- `src/experiment/parent.js` is the add-on loader. It registers `chrome://zentreetabs/`
  and loads the entry point into each browser window.
- `theme.json` is the Sine loader. It points Sine at the same entry point.
