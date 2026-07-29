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

function createTab(url = 'https://www.google.com') {
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
  if (activeWebview) activeWebview.loadURL('https://www.google.com');
});

// Initialize with one tab
createTab();
