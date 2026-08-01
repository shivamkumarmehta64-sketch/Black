// renderer.js

const DOM = {
    tabStrip: document.getElementById('tab-strip'),
    browserContainer: document.getElementById('browser-container'),
    urlInput: document.getElementById('url-input'),
    btnBack: document.getElementById('btn-back'),
    btnFwd: document.getElementById('btn-fwd'),
    btnReload: document.getElementById('btn-reload'),
    btnMenu: document.getElementById('btn-menu'),
    btnPip: document.getElementById('btn-pip'),
    btnShield: document.getElementById('btn-shield'),
    btnBookmark: document.getElementById('btn-bookmark-star'),
    btnAi: document.getElementById('btn-ai'),
    mainMenu: document.getElementById('main-menu'),
    loadingBar: document.getElementById('loading-bar'),
    sidebarRail: document.getElementById('sidebar-rail'),
    sidebarPanel: document.getElementById('sidebar-panel'),
    sbContent: document.getElementById('sb-content'),
    sbTitle: document.getElementById('sb-title'),
    btnSbClose: document.getElementById('btn-sb-close'),
    sbZoom: document.getElementById('sb-zoom'),
    sbLoadingUrl: document.getElementById('sb-loading-url'),
    toast: document.getElementById('toast-notif'),
    tabTooltip: document.getElementById('tab-tooltip'),
    tabContextMenu: document.getElementById('tab-context-menu'),
    tsModal: document.getElementById('ts-modal'),
    tsInput: document.getElementById('ts-input'),
    tsResults: document.getElementById('ts-results'),
    urlSuggestions: document.getElementById('url-suggestions'),
    mediaHud: document.getElementById('media-hud'),
    mhPlay: document.getElementById('mh-play'),
    mhMute: document.getElementById('mh-mute'),
    mhTitle: document.getElementById('mh-title')
};

let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let savedBookmarks = [];
let savedHistory = [];
const TAB_SLEEP_MS = 5 * 60 * 1000; // 5 minutes

// --- Tab System ---

function createTab(url = 'black-ui://newtab', isPinned = false) {
    const tabId = 'tab-' + (++tabIdCounter);
    
    const tabEl = document.createElement('div');
    tabEl.className = 'tab' + (isPinned ? ' pinned' : '');
    tabEl.id = tabId;
    
    const favEl = document.createElement('img');
    favEl.className = 'tab-favicon';
    favEl.src = 'icon.png';
    
    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = 'New Tab';
    
    const audioEl = document.createElement('span');
    audioEl.className = 'material-icons-round tab-audio';
    audioEl.textContent = 'volume_up';
    
    const closeEl = document.createElement('span');
    closeEl.className = 'material-icons-round tab-close';
    closeEl.textContent = 'close';
    
    tabEl.appendChild(favEl);
    tabEl.appendChild(titleEl);
    tabEl.appendChild(audioEl);
    if(!isPinned) tabEl.appendChild(closeEl);
    
    DOM.tabStrip.appendChild(tabEl);
    
    const wv = document.createElement('webview');
    wv.id = 'wv-' + tabId;
    wv.className = 'webview-hidden';
    wv.setAttribute('src', url);
    wv.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    wv.setAttribute('preload', 'preload.js');
    wv.setAttribute('allowpopups', '');
    
    DOM.browserContainer.appendChild(wv);
    
    const tabObj = { id: tabId, el: tabEl, wv: wv, url: url, title: 'New Tab', isPinned: isPinned, lastActive: Date.now(), isSleeping: false, sleepTimer: null };
    tabs.push(tabObj);
    
    setupTabEvents(tabObj);
    switchTab(tabId);
    return tabObj;
}

function setupTabEvents(tab) {
    tab.el.addEventListener('mousedown', (e) => {
        if(e.button === 0 && !e.target.classList.contains('tab-close')) switchTab(tab.id);
        if(e.button === 1) closeTab(tab.id);
    });
    
    const closeBtn = tab.el.querySelector('.tab-close');
    if(closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });
    
    const audioBtn = tab.el.querySelector('.tab-audio');
    audioBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudioMute(tab); });
    
    tab.el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showTabContextMenu(e.clientX, e.clientY, tab.id);
    });

    let tooltipTimeout;
    tab.el.addEventListener('mouseenter', (e) => {
        tooltipTimeout = setTimeout(() => {
            DOM.tabTooltip.textContent = `${tab.title}\n${tab.url}${tab.isSleeping ? ' (Sleeping)' : ''}`;
            DOM.tabTooltip.style.display = 'block';
            DOM.tabTooltip.style.left = `${e.clientX}px`;
            DOM.tabTooltip.style.top = `${e.clientY + 20}px`;
        }, 500);
    });
    tab.el.addEventListener('mouseleave', () => {
        clearTimeout(tooltipTimeout);
        DOM.tabTooltip.style.display = 'none';
    });

    // Webview events
    tab.wv.addEventListener('did-start-loading', () => {
        if(activeTabId === tab.id) {
            DOM.loadingBar.style.display = 'block';
            DOM.btnReload.innerHTML = '<span class="material-icons-round">close</span>';
        }
    });
    
    tab.wv.addEventListener('did-stop-loading', () => {
        if(activeTabId === tab.id) {
            DOM.loadingBar.style.display = 'none';
            DOM.btnReload.innerHTML = '<span class="material-icons-round">refresh</span>';
            DOM.urlInput.value = tab.wv.getURL();
            updateNavButtons();
        }
        tab.url = tab.wv.getURL();
        tab.title = tab.wv.getTitle() || tab.url;
        tab.el.querySelector('.tab-title').textContent = tab.title;
        addToHistory(tab.url, tab.title);
    });
    
    tab.wv.addEventListener('page-title-updated', (e) => {
        tab.title = e.title;
        tab.el.querySelector('.tab-title').textContent = e.title;
    });
    
    tab.wv.addEventListener('page-favicon-updated', (e) => {
        if(e.favicons && e.favicons.length > 0) {
            tab.el.querySelector('.tab-favicon').src = e.favicons[0];
        }
    });
    
    tab.wv.addEventListener('update-target-url', (e) => {
        if(activeTabId === tab.id) DOM.sbLoadingUrl.textContent = e.url;
    });
    
    tab.wv.addEventListener('media-started-playing', () => { tab.el.classList.add('audible'); updateMediaHUD(); });
    tab.wv.addEventListener('media-paused', () => { tab.el.classList.remove('audible'); updateMediaHUD(); });

    // HTML5 Drag and Drop for reordering
    tab.el.draggable = true;
    tab.el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', tab.id); });
    tab.el.addEventListener('dragover', (e) => { e.preventDefault(); tab.el.classList.add('tab-drag-indicator'); });
    tab.el.addEventListener('dragleave', () => { tab.el.classList.remove('tab-drag-indicator'); });
    tab.el.addEventListener('drop', (e) => {
        e.preventDefault();
        tab.el.classList.remove('tab-drag-indicator');
        const draggedId = e.dataTransfer.getData('text/plain');
        if(draggedId && draggedId !== tab.id) {
            const draggedTab = tabs.find(t => t.id === draggedId);
            if(draggedTab) {
                DOM.tabStrip.insertBefore(draggedTab.el, tab.el);
                // Reorder array
                tabs = tabs.filter(t => t.id !== draggedId);
                const dropIdx = tabs.findIndex(t => t.id === tab.id);
                tabs.splice(dropIdx, 0, draggedTab);
            }
        }
    });
}

function switchTab(tabId) {
    if(activeTabId) {
        const oldTab = tabs.find(t => t.id === activeTabId);
        if(oldTab) {
            oldTab.el.classList.remove('active');
            oldTab.wv.classList.add('webview-hidden');
            oldTab.lastActive = Date.now();
            resetSleepTimer(oldTab);
        }
    }
    
    activeTabId = tabId;
    const newTab = tabs.find(t => t.id === tabId);
    
    if(newTab.isSleeping) wakeTab(newTab);
    if(newTab.sleepTimer) clearTimeout(newTab.sleepTimer);
    
    newTab.el.classList.add('active');
    newTab.wv.classList.remove('webview-hidden');
    
    DOM.urlInput.value = newTab.wv.getURL() || newTab.url;
    updateNavButtons();
    checkBookmarkStatus();
}

function closeTab(tabId) {
    const tabIdx = tabs.findIndex(t => t.id === tabId);
    if(tabIdx === -1) return;
    
    const tab = tabs[tabIdx];
    if(tab.sleepTimer) clearTimeout(tab.sleepTimer);
    
    tab.el.remove();
    tab.wv.remove();
    tabs.splice(tabIdx, 1);
    
    if(tabs.length === 0) {
        if(window.api) window.api.closeWindow();
        else window.close();
    } else if(activeTabId === tabId) {
        const nextTab = tabs[tabIdx] || tabs[tabIdx - 1];
        switchTab(nextTab.id);
    }
}

function getActiveTab() { return tabs.find(t => t.id === activeTabId); }
function getActiveWebview() { const t = getActiveTab(); return t ? t.wv : null; }

function resetSleepTimer(tab) {
    if(tab.sleepTimer) clearTimeout(tab.sleepTimer);
    if(!tab.el.classList.contains('audible')) {
        tab.sleepTimer = setTimeout(() => markTabSleeping(tab), TAB_SLEEP_MS);
    }
}

function markTabSleeping(tab) {
    if(tab.id === activeTabId) return;
    tab.isSleeping = true;
    tab.el.classList.add('sleeping');
    // Discard webview
    tab.wv.src = 'about:blank';
}

function wakeTab(tab) {
    tab.isSleeping = false;
    tab.el.classList.remove('sleeping');
    tab.wv.src = tab.url;
}

function toggleAudioMute(tab) {
    const isMuted = tab.wv.isAudioMuted();
    tab.wv.setAudioMuted(!isMuted);
    tab.el.querySelector('.tab-audio').textContent = !isMuted ? 'volume_off' : 'volume_up';
}

// --- Navigation ---

DOM.urlInput.addEventListener('focus', () => { DOM.urlInput.select(); });
DOM.urlInput.addEventListener('blur', () => {
    const wv = getActiveWebview();
    if(wv) {
        try {
            const url = new URL(wv.getURL());
            if(url.protocol.startsWith('http')) DOM.urlInput.value = url.hostname;
            else DOM.urlInput.value = wv.getURL();
        } catch(e) { DOM.urlInput.value = wv.getURL(); }
    }
});

DOM.urlInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') {
        let val = DOM.urlInput.value.trim();
        if(!val) return;
        DOM.urlSuggestions.style.display = 'none';
        
        let url = val;
        if(/^(https?:\/\/|[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$)/i.test(val)) {
            if(!url.startsWith('http') && !url.startsWith('black')) url = 'https://' + url;
        } else {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(val);
        }
        const wv = getActiveWebview();
        if(wv) wv.loadURL(url);
    } else {
        showSuggestions(DOM.urlInput.value);
    }
});

DOM.btnBack.addEventListener('click', () => { const wv = getActiveWebview(); if(wv && wv.canGoBack()) wv.goBack(); });
DOM.btnFwd.addEventListener('click', () => { const wv = getActiveWebview(); if(wv && wv.canGoForward()) wv.goForward(); });
DOM.btnReload.addEventListener('click', () => {
    const wv = getActiveWebview();
    if(wv) {
        if(wv.isLoading()) wv.stop();
        else wv.reload();
    }
});

function updateNavButtons() {
    const wv = getActiveWebview();
    if(!wv) return;
    DOM.btnBack.style.opacity = wv.canGoBack() ? '1' : '0.5';
    DOM.btnFwd.style.opacity = wv.canGoForward() ? '1' : '0.5';
}

// --- Suggestions ---
function showSuggestions(query) {
    if(query.length < 2) { DOM.urlSuggestions.style.display = 'none'; return; }
    const matches = [];
    const q = query.toLowerCase();
    savedBookmarks.forEach(b => { if(b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) matches.push({...b, type: 'bookmark'}); });
    savedHistory.forEach(h => { if(h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)) matches.push({...h, type: 'history'}); });
    
    // Deduplicate
    const unique = [];
    const urls = new Set();
    for(let m of matches) {
        if(!urls.has(m.url)) { urls.add(m.url); unique.push(m); }
        if(unique.length >= 5) break;
    }
    
    if(unique.length > 0) {
        DOM.urlSuggestions.innerHTML = '';
        unique.forEach(m => {
            const div = document.createElement('div');
            div.className = 'url-sugg-item';
            div.innerHTML = `<span class="material-icons-round">${m.type==='bookmark'?'star':'history'}</span><div><div style="font-weight:500">${m.title}</div><div style="font-size:11px;opacity:0.7">${m.url}</div></div>`;
            div.addEventListener('click', () => {
                DOM.urlInput.value = m.url;
                DOM.urlSuggestions.style.display = 'none';
                getActiveWebview().loadURL(m.url);
            });
            DOM.urlSuggestions.appendChild(div);
        });
        DOM.urlSuggestions.style.display = 'flex';
    } else {
        DOM.urlSuggestions.style.display = 'none';
    }
}
document.addEventListener('click', (e) => {
    if(!DOM.urlSuggestions.contains(e.target) && e.target !== DOM.urlInput) DOM.urlSuggestions.style.display = 'none';
    DOM.mainMenu.style.display = 'none';
    DOM.tabContextMenu.style.display = 'none';
});

// --- Menus & Sidebars ---
DOM.btnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.mainMenu.style.display = DOM.mainMenu.style.display === 'block' ? 'none' : 'block';
});

document.querySelectorAll('.rail-btn').forEach(btn => {
    if(btn.id) return; // skip special buttons
    btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        openSidebarView(panel);
    });
});
DOM.btnSbClose.addEventListener('click', () => { DOM.sidebarPanel.classList.remove('open'); });

DOM.btnAi.addEventListener('click', () => {
    createTab('https://claude.ai');
});

function openSidebarView(viewName) {
    DOM.sidebarPanel.classList.add('open');
    DOM.sbTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    DOM.sbContent.innerHTML = '';
    
    if(viewName === 'bookmarks') renderBookmarks(DOM.sbContent);
    else if(viewName === 'history') renderHistory(DOM.sbContent);
    else if(viewName === 'notes') {
        const ta = document.createElement('textarea');
        ta.className = 'sb-notes-textarea';
        ta.placeholder = 'Type quick notes here...';
        ta.value = localStorage.getItem('black_quick_notes') || '';
        let to;
        ta.addEventListener('input', () => {
            clearTimeout(to);
            to = setTimeout(() => localStorage.setItem('black_quick_notes', ta.value), 500);
        });
        DOM.sbContent.appendChild(ta);
    }
}

// --- Bookmarks & History ---
function loadBookmarks() {
    try { savedBookmarks = JSON.parse(localStorage.getItem('black_bookmarks') || '[]'); } catch(e){}
}
function saveBookmarks() { localStorage.setItem('black_bookmarks', JSON.stringify(savedBookmarks)); }

function loadHistory() {
    try { savedHistory = JSON.parse(localStorage.getItem('black_history') || '[]'); } catch(e){}
}
function saveHistory() { localStorage.setItem('black_history', JSON.stringify(savedHistory)); }
function addToHistory(url, title) {
    if(url.startsWith('black-ui:')) return;
    savedHistory = savedHistory.filter(h => h.url !== url);
    savedHistory.unshift({url, title, time: Date.now()});
    if(savedHistory.length > 1000) savedHistory.pop();
    saveHistory();
}

DOM.btnBookmark.addEventListener('click', () => {
    const wv = getActiveWebview();
    if(!wv) return;
    const url = wv.getURL();
    const title = wv.getTitle();
    const idx = savedBookmarks.findIndex(b => b.url === url);
    if(idx > -1) {
        savedBookmarks.splice(idx, 1);
        DOM.btnBookmark.textContent = 'star_border';
        DOM.btnBookmark.style.color = '';
        showToast('Bookmark removed');
    } else {
        savedBookmarks.push({url, title});
        DOM.btnBookmark.textContent = 'star';
        DOM.btnBookmark.style.color = 'var(--accent-warm)';
        showToast('Bookmark added');
    }
    saveBookmarks();
    if(DOM.sidebarPanel.classList.contains('open') && DOM.sbTitle.textContent === 'Bookmarks') openSidebarView('bookmarks');
});

function checkBookmarkStatus() {
    const wv = getActiveWebview();
    if(!wv) return;
    const url = wv.getURL();
    const isSaved = savedBookmarks.some(b => b.url === url);
    DOM.btnBookmark.textContent = isSaved ? 'star' : 'star_border';
    DOM.btnBookmark.style.color = isSaved ? 'var(--accent-warm)' : '';
}

function renderBookmarks(container) {
    savedBookmarks.forEach(b => {
        const div = document.createElement('div');
        div.className = 'bm-card';
        div.innerHTML = `<div class="bm-title">${b.title}</div><div class="bm-url">${b.url}</div>`;
        div.addEventListener('click', () => getActiveWebview().loadURL(b.url));
        container.appendChild(div);
    });
}
function renderHistory(container) {
    savedHistory.forEach(h => {
        const div = document.createElement('div');
        div.className = 'bm-card';
        div.innerHTML = `<div class="bm-title">${h.title}</div><div class="bm-url">${h.url}</div>`;
        div.addEventListener('click', () => getActiveWebview().loadURL(h.url));
        container.appendChild(div);
    });
}

// --- Menu Actions ---
document.getElementById('mi-newtab').addEventListener('click', () => createTab());
document.getElementById('mi-history').addEventListener('click', () => openSidebarView('history'));
document.getElementById('mi-downloads').addEventListener('click', () => openSidebarView('downloads'));
document.getElementById('mi-bookmarks').addEventListener('click', () => openSidebarView('bookmarks'));
document.getElementById('mi-print').addEventListener('click', () => { const wv = getActiveWebview(); if(wv) wv.print(); });

// --- Tab Context Menu ---
function showTabContextMenu(x, y, tabId) {
    DOM.tabContextMenu.style.display = 'block';
    DOM.tabContextMenu.style.left = x + 'px';
    DOM.tabContextMenu.style.top = y + 'px';
    DOM.tabContextMenu.dataset.tabId = tabId;
}

document.getElementById('tcm-pin').addEventListener('click', () => {
    const tabId = DOM.tabContextMenu.dataset.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if(tab) {
        tab.isPinned = !tab.isPinned;
        tab.el.classList.toggle('pinned');
    }
});
document.getElementById('tcm-dup').addEventListener('click', () => {
    const tabId = DOM.tabContextMenu.dataset.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if(tab) createTab(tab.url);
});
document.getElementById('tcm-close').addEventListener('click', () => closeTab(DOM.tabContextMenu.dataset.tabId));
document.getElementById('tcm-close-other').addEventListener('click', () => {
    const tabId = DOM.tabContextMenu.dataset.tabId;
    const toClose = tabs.filter(t => t.id !== tabId).map(t => t.id);
    toClose.forEach(id => closeTab(id));
});

// --- Tab Search (Ctrl+Shift+A) ---
function openTabSearch() {
    DOM.tsModal.style.display = 'flex';
    DOM.tsInput.value = '';
    DOM.tsInput.focus();
    renderTabSearch('');
}
function renderTabSearch(query) {
    DOM.tsResults.innerHTML = '';
    const q = query.toLowerCase();
    tabs.forEach(t => {
        if(t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)) {
            const div = document.createElement('div');
            div.className = 'ts-item';
            div.innerHTML = `<div class="ts-title">${t.title}</div><div class="ts-url">${t.url}</div>`;
            div.addEventListener('click', () => {
                switchTab(t.id);
                DOM.tsModal.style.display = 'none';
            });
            DOM.tsResults.appendChild(div);
        }
    });
}
DOM.tsInput.addEventListener('input', (e) => renderTabSearch(e.target.value));
DOM.tsModal.addEventListener('click', (e) => { if(e.target === DOM.tsModal) DOM.tsModal.style.display = 'none'; });

// --- Media & PiP ---
DOM.btnPip.addEventListener('click', () => {
    const wv = getActiveWebview();
    if(wv) {
        wv.executeJavaScript(`
            (async () => {
                const video = document.querySelector('video');
                if(video) {
                    if(document.pictureInPictureElement) await document.exitPictureInPicture();
                    else await video.requestPictureInPicture();
                }
            })();
        `);
    }
});

function updateMediaHUD() {
    const audibleTab = tabs.find(t => t.el.classList.contains('audible'));
    if(audibleTab) {
        DOM.mediaHud.style.display = 'flex';
        DOM.mhTitle.textContent = audibleTab.title;
        DOM.mediaHud.dataset.tabId = audibleTab.id;
    } else {
        DOM.mediaHud.style.display = 'none';
    }
}
DOM.mhMute.addEventListener('click', () => {
    const tabId = DOM.mediaHud.dataset.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if(tab) toggleAudioMute(tab);
});

// --- UI Utilities ---
function showToast(msg) {
    DOM.toast.textContent = msg;
    DOM.toast.style.display = 'block';
    setTimeout(() => { DOM.toast.style.display = 'none'; }, 3000);
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    if(e.ctrlKey && e.key === 't') { e.preventDefault(); createTab(); }
    if(e.ctrlKey && e.key === 'w') { e.preventDefault(); if(activeTabId) closeTab(activeTabId); }
    if(e.ctrlKey && e.key === 'l') { e.preventDefault(); DOM.urlInput.focus(); }
    if(e.ctrlKey && e.shiftKey && e.key === 'A') { e.preventDefault(); openTabSearch(); }
});

// --- Drag and Drop on container ---
DOM.browserContainer.addEventListener('dragover', e => e.preventDefault());
DOM.browserContainer.addEventListener('drop', e => {
    e.preventDefault();
    if(e.dataTransfer.files.length > 0) {
        createTab('file://' + e.dataTransfer.files[0].path);
    } else {
        const text = e.dataTransfer.getData('text');
        if(text) createTab(text);
    }
});

// Init
(function init() {
    loadBookmarks();
    loadHistory();
    createTab('black-ui://newtab');
})();
