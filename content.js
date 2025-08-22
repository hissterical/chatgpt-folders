(function () {
  const HIDE_CLASS = "cgpf-hidden";
  const ACTIVE_FOLDER_CLASS = "cgpf-active-folder";
  let chatIndex = new Map(); // ========== HELPERS ==========

  function getIdFromHref(href) {
    const m = href && href.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  function getSidebarContainer() {
    return (
      document.querySelector('[data-testid="conversation-list"]') ||
      document.querySelector("nav") ||
      document.querySelector("aside")
    );
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
      injectHoverAssign(row, id);
    });
  } // ========== FOLDERS ==========

  function applyFilter() {
    chrome.storage.local.get(["folders", "activeFolder"], (data) => {
      const { folders = {}, activeFolder = "All" } = data || {};
      const allowedIds = new Set(
        activeFolder === "All" ? [] : folders[activeFolder] || []
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
    chrome.storage.local.get(
      ["folders", "activeFolder"],
      ({ folders = {}, activeFolder = "All" }) => {
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
        Object.keys(folders)
          .sort()
          .forEach((f) => list.appendChild(makeBtn(f)));
      }
    );
  } // ========== Hover Assign ==========

  function injectHoverAssign(row, chatId) {
    if (row.querySelector(".cgpf-hover-assign")) return;
    const assignBtn = document.createElement("span");
    assignBtn.textContent = "＋";
    assignBtn.className = "cgpf-hover-assign";
    assignBtn.title = "Assign to folder";

    assignBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      chrome.storage.local.get(["folders"], ({ folders = {} }) => {
        const names = Object.keys(folders);
        if (!names.length) {
          alert("No folders yet. Add one via the 📁 panel.");
          return;
        }
        const choice = prompt("Assign to which folder?\n\n" + names.join("\n"));
        if (!choice || !folders[choice]) return;
        folders[choice] = Array.from(
          new Set([...(folders[choice] || []), chatId])
        );
        chrome.storage.local.set({ folders }, applyFilter);
      });
    });

    row.appendChild(assignBtn);
  } // ========== OBSERVERS ==========

  function startObserving() {
    const container = getSidebarContainer();
    if (!container) {
      setTimeout(startObserving, 500); // Retry if not found yet
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
  }); // ========== INIT ==========

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
