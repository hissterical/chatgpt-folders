(function () {
  const HIDE_CLASS = "cgpf-hidden";
  const ACTIVE_FOLDER_CLASS = "cgpf-active-folder";
  let chatIndex = new Map();

  // ========== HELPERS ==========
  function getIdFromHref(href) {
    const m = href && href.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  function getSidebarContainer() {
    return document.querySelector('[data-testid="conversation-list"]')
      || document.querySelector("nav")
      || document.querySelector("aside");
  }

  function indexSidebar() {
    chatIndex.clear();
    const container = getSidebarContainer();
    if (!container) return;
    const links = container.querySelectorAll('a[href^="/c/"]');
    links.forEach((a) => {
      const id = getIdFromHref(a.getAttribute("href"));
      if (!id) return;
      const row = a.closest("li") || a;
      chatIndex.set(id, row);
      // Changed function call to reflect new integration method
      integrateAssignMenu(row, id);
    });
  }

  // ========== FOLDERS ==========
  function applyFilter() {
    chrome.storage.local.get(["folders", "activeFolder"], (data) => {
      const { folders = {}, activeFolder = "All" } = data || {};
      const allowedIds = new Set(
        activeFolder === "All" ? [] : (folders[activeFolder] || [])
      );
      indexSidebar();
      chatIndex.forEach((row, id) => {
        const show = activeFolder === "All" || allowedIds.has(id);
        row.classList.toggle(HIDE_CLASS, !show);
      });
    });
  }

  function injectFoldersUI() {
    if (document.querySelector("#cgpf-floating")) return;

    const btn = document.createElement("div");
    btn.id = "cgpf-floating";
    btn.textContent = "📁";

    const panel = document.createElement("div");
    panel.id = "cgpf-panel";
    panel.innerHTML = `
      <div id="cgpf-folder-list"></div>
      <div id="cgpf-add-folder-group">
        <input id="cgpf-new-folder" placeholder="New folder"/>
        <button id="cgpf-add-btn">Add</button>
      </div>
    `;

    btn.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      if (panel.style.display === "block") {
        renderFolders();
      }
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    panel.querySelector("#cgpf-add-btn").addEventListener("click", () => {
      const input = panel.querySelector("#cgpf-new-folder");
      const name = input.value.trim();
      if (!name) return;
      chrome.storage.local.get(["folders"], ({ folders = {} }) => {
        if (folders[name]) return;
        folders[name] = [];
        chrome.storage.local.set({ folders }, () => {
          input.value = ""; // Clear input after adding
          renderFolders();
        });
      });
    });
  }

  function renderFolders() {
    chrome.storage.local.get(["folders", "activeFolder"], ({ folders = {}, activeFolder = "All" }) => {
      const list = document.querySelector("#cgpf-folder-list");
      if (!list) return;
      list.innerHTML = "";

      const makeBtn = (name) => {
        const b = document.createElement("button");
        b.textContent = name;
        if (activeFolder === name) b.classList.add(ACTIVE_FOLDER_CLASS);
        b.onclick = () => chrome.storage.local.set({ activeFolder: name });
        return b;
      };

      list.appendChild(makeBtn("All"));
      Object.keys(folders).sort().forEach((f) => list.appendChild(makeBtn(f)));
    });
  }

  // ========== NEW: Dropdown Folder Assignment ==========

  // This function creates the dropdown of folders to choose from
  function showFolderDropdown(targetElement, chatId) {
    // Remove any existing dropdown first
    document.querySelector("#cgpf-folder-dropdown")?.remove();

    chrome.storage.local.get(["folders"], ({ folders = {} }) => {
      const folderNames = Object.keys(folders);
      if (folderNames.length === 0) {
        alert("No folders yet. Add one via the 📁 panel.");
        return;
      }

      const dropdown = document.createElement("div");
      dropdown.id = "cgpf-folder-dropdown";

      folderNames.sort().forEach(name => {
        const option = document.createElement("div");
        option.className = "cgpf-folder-option";
        option.textContent = name;
        option.addEventListener("click", () => {
          folders[name] = Array.from(new Set([...(folders[name] || []), chatId]));
          chrome.storage.local.set({ folders }, applyFilter);
          dropdown.remove();
        });
        dropdown.appendChild(option);
      });

      const rect = targetElement.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom}px`;
      dropdown.style.left = `${rect.left}px`;
      document.body.appendChild(dropdown);

      // Add a listener to close the dropdown if clicking elsewhere
      setTimeout(() => {
        window.addEventListener('click', function closeDropdown(e) {
          if (!dropdown.contains(e.target)) {
            dropdown.remove();
            window.removeEventListener('click', closeDropdown);
          }
        });
      }, 0);
    });
  }

  // This function finds the 3-dot menu and adds our new option to it
  function integrateAssignMenu(row, chatId) {
    // Find the button that opens the menu (usually the three dots)
    const menuButton = row.querySelector("button[id^='radix-']");
    if (!menuButton || menuButton.dataset.cgpfBound) {
      return; // Already processed this button
    }

    menuButton.dataset.cgpfBound = "true"; // Mark as processed
    menuButton.addEventListener("click", () => {
      // The menu is created dynamically, so we wait a moment for it to appear
      setTimeout(() => {
        const menu = document.querySelector('div[role="menu"]');
        if (menu && !menu.querySelector(".cgpf-assign-menu-item")) {
          const assignMenuItem = document.createElement("div");
          assignMenuItem.className = "cgpf-assign-menu-item";
          assignMenuItem.textContent = "Assign to Folder";
          assignMenuItem.addEventListener("click", (e) => {
            e.stopPropagation();
            showFolderDropdown(assignMenuItem, chatId);
          });
          menu.appendChild(assignMenuItem);
        }
      }, 50); // 50ms is usually enough time for the menu to render
    });
  }


  // ========== OBSERVERS & INIT ==========
  function startObserving() {
    const container = getSidebarContainer();
    if (!container) {
      setTimeout(startObserving, 500);
      return;
    }
    const observer = new MutationObserver(() => applyFilter());
    observer.observe(container, { childList: true, subtree: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.folders || changes.activeFolder)) {
      renderFolders();
      applyFilter();
    }
  });

  function init() {
    injectFoldersUI();
    startObserving();
    applyFilter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();