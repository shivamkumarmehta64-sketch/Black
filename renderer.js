const tabsContainer = document.getElementById('tabs-container');
const browserContainer = document.getElementById('browser-container');
const newTabBtn = document.getElementById('new-tab-btn');

const urlInput = document.getElementById('url-input');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const homeBtn = document.getElementById('home-btn');

let tabs = [];
let activeTabId = null;
let tabCounter = 0;

const NEW_TAB_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #000; color: #fff; font-family: 'Inter', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    h1 { font-size: 4rem; font-weight: 800; letter-spacing: -2px; margin-bottom: 10px; }
    p { color: #888; font-size: 1.2rem; margin-bottom: 2rem; }
    .search-box { width: 100%; max-width: 600px; padding: 16px 24px; border-radius: 30px; border: none; background: #1a1a1a; color: white; font-size: 1.2rem; outline: none; box-shadow: 0 4px 20px rgba(0,0,0,0.5); transition: 0.3s; }
    .search-box:focus { background: #222; box-shadow: 0 0 0 2px #4a4a4a; }
  </style>
</head>
<body>
  <h1>Black.</h1>
  <p>Fast. Furious. Secure.</p>
  <form action="https://www.google.com/search" method="get" style="width: 100%; display: flex; justify-content: center;">
    <input type="text" name="q" class="search-box" placeholder="Search the web..." autofocus>
  </form>
</body>
</html>
`)}`;

function createTab(url = NEW_TAB_HTML) {
  const tabId = 'tab-' + tabCounter++;
  
  // Create Tab Element
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = `ui-${tabId}`;
  
  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.innerText = 'New Tab';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '<span class="material-icons-round">close</span>';
  
  tabEl.appendChild(titleEl);
  tabEl.appendChild(closeBtn);
  tabsContainer.appendChild(tabEl);
  
  // Create Webview Element
  const webviewEl = document.createElement('webview');
  webviewEl.id = tabId;
  webviewEl.src = url;
  webviewEl.setAttribute('autosize', 'on');
  webviewEl.className = 'webview-hidden';
  browserContainer.appendChild(webviewEl);
  
  const tabObj = { id: tabId, el: tabEl, webview: webviewEl, titleEl };
  tabs.push(tabObj);
  
  // Event Listeners for Webview
  webviewEl.addEventListener('did-start-loading', () => {
    if (activeTabId === tabId) {
      reloadBtn.innerHTML = '<span class="material-icons-round">close</span>';
    }
    titleEl.innerText = 'Loading...';
  });

  webviewEl.addEventListener('did-stop-loading', () => {
    if (activeTabId === tabId) {
      urlInput.value = webviewEl.getURL();
      reloadBtn.innerHTML = '<span class="material-icons-round">refresh</span>';
    }
    if (typeof addToHistory === 'function') {
      addToHistory(webviewEl.getURL(), titleEl.innerText);
    }
  });

  webviewEl.addEventListener('page-title-updated', (e) => {
    titleEl.innerText = e.title;
  });
  
  // Event Listeners for Tab UI
  tabEl.addEventListener('click', () => switchTab(tabId));
  
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tabId);
  });
  
  switchTab(tabId);
}

function switchTab(tabId) {
  activeTabId = tabId;
  
  tabs.forEach(tab => {
    if (tab.id === tabId) {
      tab.el.classList.add('active');
      tab.webview.classList.remove('webview-hidden');
      urlInput.value = tab.webview.getURL() || '';
    } else {
      tab.el.classList.remove('active');
      tab.webview.classList.add('webview-hidden');
    }
  });
}

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;
  
  const tab = tabs[index];
  tab.el.remove();
  tab.webview.remove();
  tabs.splice(index, 1);
  
  if (tabs.length === 0) {
    createTab();
  } else if (activeTabId === tabId) {
    const newActive = tabs[index] ? tabs[index] : tabs[index - 1];
    switchTab(newActive.id);
  }
}

function getActiveWebview() {
  const tab = tabs.find(t => t.id === activeTabId);
  return tab ? tab.webview : null;
}

// UI Actions
newTabBtn.addEventListener('click', () => createTab());

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    let url = urlInput.value.trim();
    if (url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
          url = 'https://' + url;
        } else {
          url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
      }
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        activeWebview.loadURL(url);
        urlInput.blur();
      }
    }
  }
});

backBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview && activeWebview.canGoBack()) activeWebview.goBack();
});

forwardBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview && activeWebview.canGoForward()) activeWebview.goForward();
});

reloadBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview) {
    if (activeWebview.isLoading()) {
      activeWebview.stop();
    } else {
      activeWebview.reload();
    }
  }
});

homeBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview) activeWebview.loadURL(NEW_TAB_HTML);
});

window.addEventListener('keydown', (e) => {
  // F12 to open Webview DevTools
  if (e.key === 'F12') {
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      if (activeWebview.isDevToolsOpened()) {
        activeWebview.closeDevTools();
      } else {
        activeWebview.openDevTools();
      }
    }
  }
});

// Initialize with one tab
createTab();

// --- BOOKMARKS LOGIC ---
const starBtn = document.getElementById('star-btn');
const bookmarksBtn = document.getElementById('bookmarks-btn');
const bookmarksMenu = document.getElementById('bookmarks-menu');
const bookmarksList = document.getElementById('bookmarks-list');

let savedBookmarks = [];

function loadBookmarks() {
  savedBookmarks = window.api.loadBookmarks();
}

function saveBookmarks() {
  window.api.saveBookmarks(savedBookmarks);
}

function renderBookmarks() {
  bookmarksList.innerHTML = '';
  savedBookmarks.forEach((b, index) => {
    const li = document.createElement('li');
    li.innerText = b.title || b.url;
    li.title = b.url;
    li.addEventListener('click', () => {
      const activeWebview = getActiveWebview();
      if (activeWebview) activeWebview.loadURL(b.url);
      bookmarksMenu.classList.add('hidden');
    });
    bookmarksList.appendChild(li);
  });
}

starBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview) {
    const url = activeWebview.getURL();
    const tab = tabs.find(t => t.id === activeTabId);
    const title = tab ? tab.titleEl.innerText : url;
    
    // Avoid duplicates
    if (!savedBookmarks.find(b => b.url === url)) {
      savedBookmarks.push({ url, title });
      saveBookmarks();
      renderBookmarks();
      
      // Visual feedback
      starBtn.innerHTML = '<span class="material-icons-round" style="color: #ffd700">star</span>';
      setTimeout(() => {
        starBtn.innerHTML = '<span class="material-icons-round">star_border</span>';
      }, 1000);
    }
  }
});

historyBtn.addEventListener('click', () => {
  historyMenu.classList.toggle('hidden');
  bookmarksMenu.classList.add('hidden');
  downloadsMenu.classList.add('hidden');
});

bookmarksBtn.addEventListener('click', () => {
  bookmarksMenu.classList.toggle('hidden');
  historyMenu.classList.add('hidden');
  downloadsMenu.classList.add('hidden');
});

// --- DOWNLOADS LOGIC ---
const downloadsBtn = document.getElementById('downloads-btn');
const downloadsMenu = document.getElementById('downloads-menu');
const downloadsList = document.getElementById('downloads-list');

downloadsBtn.addEventListener('click', () => {
  downloadsMenu.classList.toggle('hidden');
  bookmarksMenu.classList.add('hidden');
  historyMenu.classList.add('hidden');
});

function createOrUpdateDownload(filename, progress = 0, state = 'progressing') {
  let li = document.getElementById('dl-' + filename);
  if (!li) {
    li = document.createElement('li');
    li.id = 'dl-' + filename;
    li.className = 'download-item';
    
    const nameEl = document.createElement('div');
    nameEl.innerText = filename;
    nameEl.className = 'download-name';
    
    const progressBg = document.createElement('div');
    progressBg.className = 'download-progress-bg';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'download-progress-bar';
    progressBar.id = 'dl-bar-' + filename;
    
    progressBg.appendChild(progressBar);
    li.appendChild(nameEl);
    li.appendChild(progressBg);
    
    downloadsList.insertBefore(li, downloadsList.firstChild);
  }
  
  const progressBar = document.getElementById('dl-bar-' + filename);
  if (progressBar) {
    progressBar.style.width = progress + '%';
  }
  
  if (state === 'completed') {
    li.classList.add('download-complete');
  } else if (state === 'cancelled' || state === 'interrupted') {
    li.classList.add('download-failed');
  }
}

window.api.onDownloadStart((e, data) => {
  createOrUpdateDownload(data.filename, 0);
  downloadsBtn.style.color = '#4a90e2'; // Highlight
});

window.api.onDownloadProgress((e, data) => {
  createOrUpdateDownload(data.filename, data.progress);
});

window.api.onDownloadDone((e, data) => {
  createOrUpdateDownload(data.filename, 100, data.state);
  downloadsBtn.style.color = ''; // Reset
});

// --- HISTORY LOGIC ---
const historyBtn = document.getElementById('history-btn');
const historyMenu = document.getElementById('history-menu');
const historyList = document.getElementById('history-list');

let savedHistory = [];

function loadHistory() {
  savedHistory = window.api.loadHistory();
}

function saveHistory() {
  window.api.saveHistory(savedHistory);
}

function renderHistory() {
  historyList.innerHTML = '';
  savedHistory.slice(0, 50).forEach(h => {
    const li = document.createElement('li');
    li.innerText = h.title && h.title !== 'Loading...' ? h.title : h.url;
    li.title = h.url;
    li.addEventListener('click', () => {
      const activeWebview = getActiveWebview();
      if (activeWebview) activeWebview.loadURL(h.url);
      historyMenu.classList.add('hidden');
    });
    historyList.appendChild(li);
  });
}

function addToHistory(url, title) {
  if (!url || url === 'about:blank') return;
  if (savedHistory.length > 0 && savedHistory[0].url === url) return;
  
  savedHistory.unshift({ url, title, time: Date.now() });
  if (savedHistory.length > 200) savedHistory.pop();
  saveHistory();
  renderHistory();
}

loadHistory();
renderHistory();
