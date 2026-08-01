const tabsContainer = document.getElementById('tabs-container');
const browserContainer = document.getElementById('browser-container');
const newTabBtn = document.getElementById('new-tab-btn');
const urlInput = document.getElementById('url-input');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const loadingBar = document.getElementById('loading-bar');
const shieldBtn = document.getElementById('shield-btn');
const shieldBadge = document.getElementById('shield-badge');
const lockIcon = document.getElementById('lock-icon');
const omniboxRune = document.getElementById('omnibox-rune');
const starBtn = document.getElementById('star-btn');
const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');
const readerBtn = document.getElementById('reader-btn');
const readerPanel = document.getElementById('reader-panel');
const enterReaderBtn = document.getElementById('enter-reader-btn');
const scriptToggle = document.getElementById('script-toggle');

const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
const findPrev = document.getElementById('find-prev');
const findNext = document.getElementById('find-next');
const findClose = document.getElementById('find-close');

const urlSuggestions = document.getElementById('url-suggestions');
const privacyPanel = document.getElementById('privacy-panel');
const statBlocked = document.getElementById('stat-blocked');

const downloadsMenu = document.getElementById('downloads-menu');
const downloadsList = document.getElementById('downloads-list');
const downloadsBtn = document.getElementById('downloads-btn') || document.querySelector('[data-action="downloads"]');
const bookmarksMenu = document.getElementById('bookmarks-menu');
const bookmarksList = document.getElementById('bookmarks-list');
const bookmarksBtn = document.getElementById('bookmarks-btn') || document.querySelector('[data-action="bookmarks"]');
const historyMenu = document.getElementById('history-menu');
const historyList = document.getElementById('history-list');
const historyBtn = document.getElementById('history-btn') || document.querySelector('[data-action="history"]');

let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let findRequestId = null;
let blockedCount = 0;
let searchEngine = 'Google';
let lastClosedTab = null;

const NEW_TAB_URL = 'black-ui://newtab';

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// --- SESSION ---
async function saveSession() {
  localStorage.setItem('bb-tab-count', tabs.length);
  const data = tabs.map(t => ({
    url: t._savedURL && t._savedURL !== 'about:blank' ? t._savedURL : (t.webview ? t.webview.getURL() : ''),
    title: t.titleEl ? t.titleEl.innerText : '',
    pinned: !!t.pinned
  }));
  await window.api.saveSession(data);
}

async function loadSession() {
  try { return await window.api.loadSession(); } catch (e) { return null; }
}

// ── TAB DRAG REORDER STATE ──
let dragSrcTabId = null;

function removeDragClasses() {
  document.querySelectorAll('.tab').forEach(el => {
    el.classList.remove('dragging', 'drag-over-left', 'drag-over-right');
  });
}

// ── PIN TAB FUNCTION ──
function togglePinTab(tab) {
  if (!tab) return;
  tab.pinned = !tab.pinned;
  let pinDot = tab.el.querySelector('.tab-pin-dot');

  if (tab.pinned) {
    tab.el.classList.add('pinned');
    if (!pinDot) {
      pinDot = document.createElement('span');
      pinDot.className = 'tab-pin-dot';
      tab.el.appendChild(pinDot);
    }
  } else {
    tab.el.classList.remove('pinned');
    if (pinDot) pinDot.remove();
  }

  // Re-sort tabs array & DOM: Pinned tabs stay left-anchored
  tabs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  tabs.forEach(t => tabsContainer.appendChild(t.el));
  saveSession();
}

// --- TAB MANAGEMENT ---
function createTab(url = NEW_TAB_URL, isPinned = false) {
  const tabId = 'tab-' + tabCounter++;
  const tabEl = document.createElement('div');
  tabEl.className = 'tab' + (isPinned ? ' pinned' : '');
  tabEl.id = 'ui-' + tabId;
  tabEl.setAttribute('draggable', 'true');

  const favIcon = document.createElement('img');
  favIcon.className = 'tab-fav-icon';
  favIcon.style.display = 'none';

  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.innerText = 'New Tab';

  const audioBtn = document.createElement('span');
  audioBtn.className = 'tab-audio material-icons-round';
  audioBtn.textContent = 'volume_up';
  audioBtn.title = 'Mute site';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '<span class="material-icons-round">close</span>';

  tabEl.appendChild(favIcon);
  tabEl.appendChild(titleEl);
  tabEl.appendChild(audioBtn);
  tabEl.appendChild(closeBtn);

  if (isPinned) {
    const pinDot = document.createElement('span');
    pinDot.className = 'tab-pin-dot';
    tabEl.appendChild(pinDot);
  }

  tabsContainer.appendChild(tabEl);

  const webviewEl = document.createElement('webview');
  webviewEl.id = tabId;
  webviewEl.src = url;
  webviewEl.setAttribute('autosize', 'on');
  webviewEl.setAttribute('allowpopups', '');
  webviewEl.className = 'webview-hidden';
  browserContainer.appendChild(webviewEl);

  const tabObj = {
    id: tabId,
    el: tabEl,
    webview: webviewEl,
    titleEl,
    favIcon,
    audioBtn,
    muted: false,
    zoomLevel: 0,
    lastActive: Date.now(),
    pageTitle: '',
    pinned: isPinned,
    _sleeping: false,
    _savedURL: null,
    _placeholder: null
  };
  tabs.push(tabObj);

  audioBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAudioMute(tabObj);
  });

  // If pinned, re-sort DOM to ensure left anchoring
  if (isPinned) {
    tabs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    tabs.forEach(t => tabsContainer.appendChild(t.el));
  }

  // ── HTML5 DRAG AND DROP REORDER LISTENERS ──
  tabEl.addEventListener('dragstart', (e) => {
    dragSrcTabId = tabId;
    tabEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
  });

  tabEl.addEventListener('dragend', () => {
    removeDragClasses();
    dragSrcTabId = null;
  });

  tabEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dragSrcTabId === tabId) return;
    const rect = tabEl.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    removeDragClasses();
    const srcTab = tabs.find(t => t.id === dragSrcTabId);
    if (srcTab) srcTab.el.classList.add('dragging');
    if (e.clientX < midX) {
      tabEl.classList.add('drag-over-left');
    } else {
      tabEl.classList.add('drag-over-right');
    }
  });

  tabEl.addEventListener('dragleave', () => {
    tabEl.classList.remove('drag-over-left', 'drag-over-right');
  });

  tabEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const targetId = tabId;
    if (!dragSrcTabId || dragSrcTabId === targetId) return;
    const srcIdx = tabs.findIndex(t => t.id === dragSrcTabId);
    const targetIdx = tabs.findIndex(t => t.id === targetId);
    if (srcIdx === -1 || targetIdx === -1) return;

    const rect = tabEl.getBoundingClientRect();
    const dropAfter = e.clientX > (rect.left + rect.width / 2);
    let newIdx = dropAfter ? targetIdx + 1 : targetIdx;
    if (srcIdx < newIdx) newIdx--;

    const [movedTab] = tabs.splice(srcIdx, 1);
    tabs.splice(newIdx, 0, movedTab);

    // Keep pinned tabs before unpinned
    tabs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    tabs.forEach(t => tabsContainer.appendChild(t.el));

    removeDragClasses();
    saveSession();
  });

  webviewEl.addEventListener('did-start-loading', () => {
    showLoading(webviewEl.getURL());
    if (activeTabId === tabId) reloadBtn.innerHTML = '<span class="material-icons-round">close</span>';
    titleEl.innerText = 'Loading...';
    if (activeTabId === tabId) updateNavButtons(webviewEl);
    // Spin the omnibox rune during load
    if (activeTabId === tabId && omniboxRune) omniboxRune.classList.add('loading');
  });

  webviewEl.addEventListener('did-stop-loading', () => {
    hideLoading();
    if (activeTabId === tabId) {
      urlInput.value = webviewEl.getURL();
      reloadBtn.innerHTML = '<span class="material-icons-round">refresh</span>';
      updateLockIcon(webviewEl.getURL());
      updatePrivacyScore(tabObj);
      updateNavButtons(webviewEl);
      // Stop rune spin
      if (omniboxRune) omniboxRune.classList.remove('loading');
    }
    if (typeof addToHistory === 'function') addToHistory(webviewEl.getURL(), tabObj.pageTitle || titleEl.innerText);
    saveSession();
  });

  webviewEl.addEventListener('media-started-playing', () => {
    if (!tabObj.muted && tabObj.audioBtn) {
      tabObj.audioBtn.style.display = 'inline-flex';
      tabObj.audioBtn.textContent = 'volume_up';
    }
    updateMediaHUD();
  });

  webviewEl.addEventListener('media-paused', () => {
    if (!tabObj.muted && tabObj.audioBtn) {
      tabObj.audioBtn.style.display = 'none';
    }
    updateMediaHUD();
  });

  webviewEl.addEventListener('page-title-updated', (e) => { titleEl.innerText = e.title; tabObj.pageTitle = e.title; });

  webviewEl.addEventListener('did-navigate', () => {
    if (activeTabId === tabId) {
      urlInput.value = webviewEl.getURL();
      updateLockIcon(webviewEl.getURL());
      updatePrivacyScore(tabObj);
      updateNavButtons(webviewEl);
    }
  });
  webviewEl.addEventListener('did-navigate-in-page', () => {
    if (activeTabId === tabId) {
      urlInput.value = webviewEl.getURL();
    }
  });

  webviewEl.addEventListener('enter-html-full-screen', () => {
    window.api.setFullscreen(true);
  });
  webviewEl.addEventListener('leave-html-full-screen', () => {
    window.api.setFullscreen(false);
  });

  webviewEl.addEventListener('found-in-page', (e) => {
    if (activeTabId === tabId) {
      findCount.textContent = e.result.matches > 0 ? e.result.activeMatchOrdinal + ' of ' + e.result.matches : 'No results';
    }
  });

  webviewEl.addEventListener('new-window', (e) => {
    e.preventDefault();
    createTab(e.url);
  });

  tabEl.addEventListener('click', () => {
    const t = tabs.find(t => t.id === tabId);
    if (t && t._sleeping) { wakeTab(t); return; }
    switchTab(tabId);
  });
  tabEl.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tabId); } });

  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tabId); });

  switchTab(tabId);
  saveSession();
}

function switchTab(tabId) {
  const prevTab = tabs.find(t => t.id === activeTabId);
  if (prevTab && prevTab.id !== tabId) {
    // Save URL before blanking
    if (!prevTab._savedURL || prevTab._savedURL === 'about:blank') {
      try {
        const u = prevTab.webview.getURL();
        if (u && u !== 'about:blank' && !u.startsWith('data:')) prevTab._savedURL = u;
      } catch (e) {}
    }
    if (!prevTab._sleeping) {
      try { prevTab.webview.loadURL('about:blank'); } catch (e) {}
    }
  }
  activeTabId = tabId;
  tabs.forEach(tab => {
    if (tab.id === tabId) {
      tab.el.classList.add('active');
      tab.lastActive = Date.now();
      // Wake sleeping tab on switch
      if (tab._sleeping) {
        wakeTab(tab);
      } else {
        tab.webview.classList.remove('webview-hidden');
        if (tab._placeholder) { tab._placeholder.classList.add('hidden'); }
        if (tab._savedURL && tab._savedURL !== 'about:blank') {
          tab.webview.loadURL(tab._savedURL);
          tab._savedURL = null;
        }
      }
      try { urlInput.value = tab.webview.getURL() || ''; } catch (e) { urlInput.value = tab._savedURL || ''; }
      updateLockIcon(tab.webview ? tab.webview.getURL() : '');
      updatePrivacyScore(tab);
    } else {
      tab.el.classList.remove('active');
      tab.webview.classList.add('webview-hidden');
      if (tab._placeholder) tab._placeholder.classList.add('hidden');
    }
  });
  closeFindBar();
}

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index === -1) return;
  const tab = tabs[index];
  const urlForHistory = tab._savedURL || (tab.webview ? tab.webview.getURL() : '') || NEW_TAB_URL;
  lastClosedTab = { url: urlForHistory, title: tab.titleEl.innerText };
  tab.el.style.transition = 'opacity 0.15s, transform 0.15s';
  tab.el.style.opacity = '0';
  tab.el.style.transform = 'scale(0.9)';
  setTimeout(() => {
    tab.el.remove();
    if (tab._placeholder) tab._placeholder.remove();
    try { tab.webview.remove(); } catch (e) {}
    tabs.splice(index, 1);
    if (tabs.length === 0) createTab();
    else if (activeTabId === tabId) switchTab(tabs[index] ? tabs[index].id : tabs[index - 1].id);
    saveSession();
  }, 150);
}




function getActiveWebview() { const t = tabs.find(t => t.id === activeTabId); return t ? t.webview : null; }
function getActiveTab() { return tabs.find(t => t.id === activeTabId) || null; }

function updateLockIcon(url) {
  const secDot = document.getElementById('sec-dot');
  const urlFavicon = document.getElementById('url-favicon');

  if (!url || url === 'about:blank' || url.startsWith('black-ui:')) {
    if (secDot) { secDot.className = 'sec-dot secure'; secDot.title = 'Black Engine Interface'; }
    if (urlFavicon) urlFavicon.style.display = 'none';
    return;
  }

  if (secDot) {
    if (url.startsWith('https://')) {
      secDot.className = 'sec-dot secure';
      secDot.title = 'Connection is secure (HTTPS)';
    } else if (url.startsWith('http://')) {
      secDot.className = 'sec-dot insecure';
      secDot.title = 'Connection is not secure (HTTP)';
    } else {
      secDot.className = 'sec-dot';
      secDot.title = 'Internal Page';
    }
  }

  if (urlFavicon) {
    if (url.startsWith('http')) {
      try {
        urlFavicon.src = new URL(url).origin + '/favicon.ico';
        urlFavicon.style.display = 'block';
      } catch (_) { urlFavicon.style.display = 'none'; }
    } else {
      urlFavicon.style.display = 'none';
    }
  }
}

function showLoading(url) {
  loadingBar.classList.remove('hidden');
  loadingBar.classList.add('active');
  loadingBar.style.width = '30%';
  const statusLoadingUrl = document.getElementById('status-loading-url');
  if (statusLoadingUrl && url) {
    statusLoadingUrl.textContent = 'Loading: ' + url;
    statusLoadingUrl.classList.remove('hidden');
  }
}
function hideLoading() {
  loadingBar.classList.remove('active');
  loadingBar.style.width = '100%';
  setTimeout(() => { loadingBar.classList.add('hidden'); loadingBar.style.width = '0%'; }, 200);
  const statusLoadingUrl = document.getElementById('status-loading-url');
  if (statusLoadingUrl) statusLoadingUrl.classList.add('hidden');
}

// --- PRIVACY SCORE ---
function updatePrivacyScore(tab) {
  const badge = document.getElementById('privacy-score');
  if (!tab || !tab.webview) { badge.classList.add('hidden'); return; }
  const url = tab.webview.getURL();
  if (!url || url === 'about:blank' || url.startsWith('data:')) { badge.classList.add('hidden'); return; }
  let score = 100;
  if (!url.startsWith('https:')) score -= 30;
  if (blockedCount > 50) score -= 20;
  else if (blockedCount > 20) score -= 10;
  else if (blockedCount > 5) score -= 5;
  if (sessionStorage.getItem('blockScripts') === '1') score += 10;
  let grade, color;
  if (score >= 90) { grade = 'A'; color = '#81c995'; }
  else if (score >= 70) { grade = 'B'; color = '#8ab4f8'; }
  else if (score >= 50) { grade = 'C'; color = '#fdd663'; }
  else if (score >= 30) { grade = 'D'; color = '#f28b82'; }
  else { grade = 'F'; color = '#f28b82'; }
  badge.textContent = grade;
  badge.style.color = color;
  badge.style.borderColor = color;
  badge.classList.remove('hidden');
  badge.title = 'Privacy score: ' + grade + ' (' + score + '/100)\nHTTPS: ' + (url.startsWith('https:') ? 'Yes' : 'No') + '\nAds blocked: ' + blockedCount;
}

window.api.onBlockedCount((count) => {
  blockedCount = count;
  shieldBadge.textContent = count > 99 ? '99+' : count;
  shieldBadge.classList.toggle('hidden', count === 0);
  shieldBtn.classList.toggle('active', count > 0);
  statBlocked.textContent = count;
  const tab = getActiveTab();
  if (tab) updatePrivacyScore(tab);
});

// --- TAB RIGHT-CLICK CONTEXT MENU ---
let tabContextTarget = null;
document.addEventListener('contextmenu', (e) => {
  const tabEl = e.target.closest('.tab');
  if (!tabEl) return;
  e.preventDefault();
  tabContextTarget = tabs.find(t => t.el === tabEl);
  if (!tabContextTarget) return;
  const existing = document.getElementById('tab-context-menu');
  if (existing) existing.remove();
  const menu = document.createElement('div');
  menu.id = 'tab-context-menu';
  menu.className = 'chrome-menu';
  menu.style.cssText = 'position:fixed;left:' + e.clientX + 'px;top:' + e.clientY + 'px;min-width:180px;z-index:9999';
  menu.innerHTML = `
    <div class="menu-item" data-action="tc-pin"><span class="material-icons-round">push_pin</span> ${tabContextTarget.pinned ? 'Unpin tab' : 'Pin tab'}</div>
    <div class="menu-item" data-action="tc-close"><span class="material-icons-round">close</span> Close tab</div>
    <div class="menu-item" data-action="tc-close-others"><span class="material-icons-round">tab</span> Close other tabs</div>
    <div class="menu-item" data-action="tc-close-right"><span class="material-icons-round">tab</span> Close tabs to the right</div>
    <div class="menu-separator"></div>
    <div class="menu-item" data-action="tc-duplicate"><span class="material-icons-round">content_copy</span> Duplicate</div>
    <div class="menu-item" data-action="tc-mute"><span class="material-icons-round">volume_off</span> Mute site</div>
  `;
  document.body.appendChild(menu);
  menu.addEventListener('click', (ev) => {
    const action = ev.target.closest('.menu-item')?.dataset.action;
    if (!action || !tabContextTarget) return;
    const id = tabContextTarget.id;
    if (action === 'tc-pin') togglePinTab(tabContextTarget);
    else if (action === 'tc-close') closeTab(id);
    else if (action === 'tc-close-others') {
      [...tabs].forEach(t => { if (t.id !== id) closeTab(t.id); });
    } else if (action === 'tc-close-right') {
      const idx = tabs.findIndex(t => t.id === id);
      [...tabs].slice(idx + 1).forEach(t => closeTab(t.id));
    } else if (action === 'tc-duplicate') {
      createTab(tabContextTarget.webview.getURL());
    } else if (action === 'tc-mute') {
      toggleAudioMute(tabContextTarget);
    }
    menu.remove();
  });
  document.addEventListener('click', function rm(e) { if (!e.target.closest('#tab-context-menu')) { menu.remove(); document.removeEventListener('click', rm); } });
});

// --- TAB HOVER TOOLTIP ---
document.addEventListener('mouseover', (e) => {
  const tabEl = e.target.closest('.tab');
  if (!tabEl) { const t = document.getElementById('tab-tooltip'); if (t) t.classList.add('hidden'); return; }
  const tab = tabs.find(t => t.el === tabEl);
  if (!tab) return;
  let tip = document.getElementById('tab-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'tab-tooltip';
    tip.className = 'tab-tooltip hidden';
    document.body.appendChild(tip);
  }
  const url = tab._savedURL || tab.webview.getURL() || 'New Tab';
  const title = tab.titleEl.innerText || url;
  const titleShort = title.length > 60 ? title.slice(0, 57) + '...' : title;
  const urlShort = url.length > 80 ? url.slice(0, 77) + '...' : url;
  const memEst = tab._savedURL ? '💤' : 'Active';
  tip.innerHTML = '<div class="tip-title">' + esc(titleShort) + '</div><div class="tip-url">' + esc(urlShort) + '</div><div class="tip-status">' + memEst + '</div>';
  const rect = tabEl.getBoundingClientRect();
  tip.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 320)) + 'px';
  tip.style.top = (rect.top - 4) + 'px';
  tip.classList.remove('hidden');
});
document.addEventListener('mouseout', (e) => {
  if (!e.target.closest('.tab')) { const t = document.getElementById('tab-tooltip'); if (t) t.classList.add('hidden'); }
});

// ═══════════════════════════════════════════════════════════
//  TAB SLEEPING SYSTEM — 5-minute inactivity suspension
// ═══════════════════════════════════════════════════════════

const TAB_SLEEP_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Suspend a tab: blank the webview, show a placeholder overlay.
 * Serialises URL+title for later restoration.
 */
function sleepTab(tab) {
  if (!tab || tab.id === activeTabId || tab._sleeping) return;

  // Don't sleep audible tabs or media sites
  try {
    if (tab.webview.isCurrentlyAudible()) return;
  } catch (_) {}
  const url = tab._savedURL || (tab.webview ? tab.webview.getURL() : '');
  if (!url || url === 'about:blank' || url.startsWith('data:')) return;
  const musicSites = ['music.youtube.com', 'youtube.com', 'spotify.com', 'soundcloud.com', 'twitch.tv'];
  if (musicSites.some(s => url.includes(s))) return;

  // Serialize state
  tab._sleeping = true;
  tab._savedURL = url;
  tab._sleepTitle = tab.titleEl.innerText;

  // Blank the webview to free renderer process memory
  try { tab.webview.loadURL('about:blank'); } catch (_) {}
  tab.webview.classList.add('webview-hidden');

  // ── Visual: tab strip moon indicator ──
  markTabSleeping(tab, true);

  // ── Visual: placeholder overlay in browser container ──
  createSleepPlaceholder(tab);
}

/**
 * Wake a sleeping tab: remove placeholder, reload URL.
 */
function wakeTab(tab) {
  if (!tab || !tab._sleeping) return;
  tab._sleeping = false;
  tab.lastActive = Date.now();

  // Remove placeholder
  if (tab._placeholder) {
    tab._placeholder.style.opacity = '0';
    tab._placeholder.style.transform = 'scale(1.02)';
    setTimeout(() => {
      if (tab._placeholder) { tab._placeholder.remove(); tab._placeholder = null; }
    }, 220);
  }

  // Remove sleep indicators
  markTabSleeping(tab, false);

  // Restore webview
  tab.webview.classList.remove('webview-hidden');
  if (tab._savedURL && tab._savedURL !== 'about:blank') {
    try { tab.webview.loadURL(tab._savedURL); } catch (_) {}
    tab._savedURL = null;
  }

  // Make active
  switchTab(tab.id);
}

/**
 * Add / remove the moon icon and dimmed class on the tab strip element.
 */
function markTabSleeping(tab, sleeping) {
  let moonEl = tab.el.querySelector('.tab-sleep-moon');
  if (sleeping) {
    tab.el.classList.add('sleeping');
    if (!moonEl) {
      moonEl = document.createElement('span');
      moonEl.className = 'tab-sleep-moon material-icons-round';
      moonEl.textContent = 'bedtime';
      moonEl.title = 'Tab sleeping — click to wake';
      // Insert before close button
      const close = tab.el.querySelector('.tab-close');
      tab.el.insertBefore(moonEl, close);
    }
  } else {
    tab.el.classList.remove('sleeping');
    if (moonEl) moonEl.remove();
  }
}

/**
 * Build the "click to wake" placeholder shown in the browser viewport.
 */
function createSleepPlaceholder(tab) {
  if (tab._placeholder) return;
  const pl = document.createElement('div');
  pl.className = 'tab-sleep-placeholder webview-hidden';
  pl.dataset.tabId = tab.id;
  pl.innerHTML = `
    <div class="sleep-inner">
      <div class="sleep-rune">᛫</div>
      <div class="sleep-moon-icon"><span class="material-icons-round">bedtime</span></div>
      <div class="sleep-title">${esc(tab._sleepTitle || 'Sleeping Tab')}</div>
      <div class="sleep-url">${esc((tab._savedURL || '').replace(/^https?:\/\//, ''))}</div>
      <button class="sleep-wake-btn">
        <span class="material-icons-round">play_arrow</span>
        Click to Reload
      </button>
      <div class="sleep-hint">This tab was suspended to save memory.</div>
    </div>
  `;
  // Wake on click anywhere on the overlay, not just the button
  pl.addEventListener('click', () => wakeTab(tab));
  browserContainer.appendChild(pl);
  tab._placeholder = pl;

  // Show it only if this is NOT the active tab
  if (tab.id !== activeTabId) {
    pl.classList.add('webview-hidden');
  } else {
    pl.classList.remove('webview-hidden');
  }
}

// Periodic checker: every 60 s, sleep any tab idle > TAB_SLEEP_MS
setInterval(() => {
  const now = Date.now();
  tabs.forEach(tab => {
    if (tab.id === activeTabId || tab._sleeping) return;
    if ((now - tab.lastActive) >= TAB_SLEEP_MS) sleepTab(tab);
  });
}, 60_000);


// Update privacy score on URL change
document.addEventListener('webview-navigate', (e) => {
  const tab = getActiveTab();
  if (tab) updatePrivacyScore(tab);
});

// --- UI ACTIONS ---
newTabBtn.addEventListener('click', () => createTab());

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    let url = urlInput.value.trim();
    if (url) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) url = 'https://' + url;
        else url = (searchEngine === 'Google' ? 'https://www.google.com/search?q=' : 'https://duckduckgo.com/?q=') + encodeURIComponent(url);
      }
      const wv = getActiveWebview();
      if (wv) { wv.loadURL(url); urlInput.blur(); }
    }
    hideSuggestions();
  }
});

urlInput.addEventListener('focus', function() {
  const tab = getActiveTab();
  if (tab) {
    const url = tab.webview.getURL();
    if (url && url !== 'about:blank' && !url.startsWith('data:')) { this.value = url; }
  }
  const v = this.value.trim();
  if (v.length >= 1) showSuggestions(v);
  this.select();
});
urlInput.addEventListener('blur', function() {
  const tab = getActiveTab();
  if (tab) {
    const url = tab.webview.getURL();
    if (url && url !== 'about:blank' && !url.startsWith('data:')) {
      try { this.value = new URL(url).hostname; } catch (e) { /* keep full url */ }
    }
  }
  setTimeout(hideSuggestions, 200);
});
urlInput.addEventListener('input', () => { const v = urlInput.value.trim(); v.length >= 1 ? showSuggestions(v) : hideSuggestions(); });

function updateNavButtons(wv) {
  if (!wv) return;
  try {
    if (wv.canGoBack()) backBtn.classList.remove('disabled'); else backBtn.classList.add('disabled');
    if (wv.canGoForward()) forwardBtn.classList.remove('disabled'); else forwardBtn.classList.add('disabled');
  } catch (e) {}
}

backBtn.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wv.canGoBack()) { wv.goBack(); updateNavButtons(wv); } });
forwardBtn.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wv.canGoForward()) { wv.goForward(); updateNavButtons(wv); } });

reloadBtn.addEventListener('click', () => {
  const wv = getActiveWebview();
  if (wv) wv.isLoading() ? wv.stop() : wv.reload();
});

// --- MENU ---
function closeAllMenus() {
  document.querySelectorAll('.chrome-menu').forEach(m => m.classList.add('hidden'));
}

function closeAllPanels() {
  closeAllMenus();
  privacyPanel.classList.add('hidden');
  readerPanel.classList.add('hidden');
}

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllPanels();
  menuDropdown.classList.toggle('hidden');
});

menuDropdown.addEventListener('click', (e) => {
  e.stopPropagation();
  const item = e.target.closest('.menu-item');
  if (!item) return;
  const action = item.dataset.action;
  if (action === 'newtab') { closeAllMenus(); createTab(); }
  else if (action === 'history') { closeAllMenus(); toggleHistory(); }
  else if (action === 'downloads') { closeAllMenus(); toggleDownloads(); }
  else if (action === 'bookmarks') { closeAllMenus(); toggleBookmarks(); }
  else if (action === 'zoomin') { closeAllMenus(); const t = getActiveTab(); if (t) { t.zoomLevel = Math.min(5, t.zoomLevel + 0.5); t.webview.setZoomLevel(t.zoomLevel); } }
  else if (action === 'zoomout') { closeAllMenus(); const t = getActiveTab(); if (t) { t.zoomLevel = Math.max(-5, t.zoomLevel - 0.5); t.webview.setZoomLevel(t.zoomLevel); } }
  else if (action === 'zoomreset') { closeAllMenus(); const t = getActiveTab(); if (t) { t.zoomLevel = 0; t.webview.setZoomLevel(0); } }
  else if (action === 'reader') { closeAllMenus(); readerPanel.classList.remove('hidden'); }
  else if (action === 'free') { closeAllMenus(); openFreeResources(); }
  else if (action === 'print') { closeAllMenus(); const wv = getActiveWebview(); if (wv) wv.print(); }
});

function openFreeResources() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) {
    tab._savedURL = NEW_TAB_URL;
    tab.webview.loadURL(NEW_TAB_URL);
    tab.titleEl.innerText = 'Free Resources';
  }
}

enterReaderBtn.addEventListener('click', () => {
  const wv = getActiveWebview();
  if (wv) {
    wv.executeJavaScript(`
      (function() {
        var c = document.createElement('style');
        c.textContent = 'body{max-width:680px!important;margin:40px auto!important;padding:20px!important;font-size:18px!important;line-height:1.8!important;color:#e8eaed!important;background:#202124!important}'+
          'img,video,iframe{max-width:100%!important;height:auto!important}'+
          'a{color:#8ab4f8!important}'+
          'nav,header,footer,aside,script,style{display:none!important}'+
          'h1,h2,h3{font-weight:600!important;margin:24px 0 12px!important}'+
          'p{margin:12px 0!important}'+
          '*{background:transparent!important;border:none!important;box-shadow:none!important}';
        document.head.appendChild(c);
      })();
    `, true).catch(() => {});
  }
  readerPanel.classList.add('hidden');
});

// Script blocking toggle
scriptToggle.addEventListener('change', () => {
  sessionStorage.setItem('blockScripts', scriptToggle.checked ? '1' : '0');
  const wv = getActiveWebview();
  if (wv) wv.reload();
  const tab = getActiveTab();
  if (tab) updatePrivacyScore(tab);
});

// --- SHORTCUTS ---
window.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const wv = getActiveWebview();
  const tab = getActiveTab();

  if (e.key === 'F11') { e.preventDefault(); window.api.toggleFullscreen(); }
  else if (ctrl && e.key === 't') { e.preventDefault(); createTab(); }
  else if (ctrl && e.shiftKey && e.key === 'T') { e.preventDefault(); if (lastClosedTab) createTab(lastClosedTab.url); }
  else if (ctrl && e.key === 'w') { e.preventDefault(); if (tabs.length > 1) closeTab(activeTabId); }
  else if (ctrl && e.key === 'Tab') {
    e.preventDefault();
    const idx = tabs.findIndex(t => t.id === activeTabId);
    if (idx === -1) return;
    if (e.shiftKey) switchTab(tabs[idx <= 0 ? tabs.length - 1 : idx - 1].id);
    else switchTab(tabs[idx >= tabs.length - 1 ? 0 : idx + 1].id);
  }
  else if (ctrl && e.key >= '1' && e.key <= '8') { e.preventDefault(); const n = parseInt(e.key) - 1; if (n < tabs.length) switchTab(tabs[n].id); }
  else if (ctrl && e.key === '9') { e.preventDefault(); if (tabs.length > 0) switchTab(tabs[tabs.length - 1].id); }
  else if ((ctrl && e.key === 'r') || e.key === 'F5') { e.preventDefault(); if (wv) wv.reload(); }
  else if (ctrl && e.shiftKey && e.key === 'r') { e.preventDefault(); if (wv) wv.reloadIgnoringCache(); }
  else if (ctrl && e.key === 'l') { e.preventDefault(); urlInput.focus(); urlInput.select(); }
  else if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); if (tab) { tab.zoomLevel = Math.min(5, tab.zoomLevel + 0.5); tab.webview.setZoomLevel(tab.zoomLevel); } }
  else if (ctrl && e.key === '-') { e.preventDefault(); if (tab) { tab.zoomLevel = Math.max(-5, tab.zoomLevel - 0.5); tab.webview.setZoomLevel(tab.zoomLevel); } }
  else if (ctrl && e.key === '0') { e.preventDefault(); if (tab) { tab.zoomLevel = 0; tab.webview.setZoomLevel(0); } }
  else if (ctrl && e.key === 'f') { e.preventDefault(); openFindBar(); }
  else if (e.key === 'F3') { e.preventDefault(); if (wv && findInput.value) wv.findInPage(findInput.value, { forward: !e.shiftKey, findNext: true }); }
  else if (ctrl && e.key === 'd') { e.preventDefault(); starBtn.click(); }
  else if (ctrl && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); openTabSearch(); }
  else if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); openFreeResources(); }
  else if (ctrl && e.key === 'h') { e.preventDefault(); toggleHistory(); }
  else if (ctrl && e.key === 'j') { e.preventDefault(); toggleDownloads(); }
  else if (e.key === 'F12' || (ctrl && e.shiftKey && e.key === 'I')) { e.preventDefault(); if (wv) wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools(); }
  else if (ctrl && e.key === 'u') { e.preventDefault(); if (wv) { const u = wv.getURL(); if (u && !u.startsWith('view-source:')) wv.loadURL('view-source:' + u); } }
  else if (ctrl && e.key === 'p') { e.preventDefault(); if (wv) wv.print(); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); if (wv && wv.canGoBack()) wv.goBack(); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); if (wv && wv.canGoForward()) wv.goForward(); }
  else if (e.key === ' ') { e.preventDefault(); if (wv) wv.sendInputEvent({ type: 'keyDown', keyCode: 'PageDown' }); }
  else if (e.key === 'Home') { e.preventDefault(); if (wv) wv.sendInputEvent({ type: 'keyDown', keyCode: 'Home' }); }
  else if (e.key === 'End') { e.preventDefault(); if (wv) wv.sendInputEvent({ type: 'keyDown', keyCode: 'End' }); }
  else if (e.key === 'Escape') { closeFindBar(); hideSuggestions(); closeAllPanels(); closeTabSearch(); }
});

// --- FIND ---
function openFindBar() {
  findBar.classList.remove('hidden');
  findInput.value = ''; findCount.textContent = ''; findInput.focus();
}
function closeFindBar() {
  findBar.classList.add('hidden');
  if (findRequestId !== null) { const wv = getActiveWebview(); if (wv) wv.stopFindInPage('clearSelection'); findRequestId = null; }
}

// ═══════════════════════════════════════════════════════════
//  TAB SEARCH OVERLAY (Ctrl+Shift+A)
// ═══════════════════════════════════════════════════════════
const tabSearchOverlay = document.getElementById('tab-search-overlay');
const tabSearchInput   = document.getElementById('tab-search-input');
const tabSearchList    = document.getElementById('tab-search-list');
let tabSearchSelectedIndex = 0;

function openTabSearch() {
  if (!tabSearchOverlay) return;
  tabSearchOverlay.classList.remove('hidden');
  tabSearchInput.value = '';
  tabSearchSelectedIndex = 0;
  renderTabSearchList('');
  setTimeout(() => tabSearchInput.focus(), 50);
}

function closeTabSearch() {
  if (tabSearchOverlay) tabSearchOverlay.classList.add('hidden');
}

function toggleTabSearch() {
  if (!tabSearchOverlay) return;
  if (tabSearchOverlay.classList.contains('hidden')) openTabSearch();
  else closeTabSearch();
}

function renderTabSearchList(query = '') {
  if (!tabSearchList) return;
  tabSearchList.innerHTML = '';
  const q = query.toLowerCase().trim();
  const matches = tabs.filter(t => {
    const title = (t.pageTitle || (t.titleEl ? t.titleEl.innerText : '') || '').toLowerCase();
    const url = (t._savedURL || (t.webview ? t.webview.getURL() : '')).toLowerCase();
    return title.includes(q) || url.includes(q);
  });

  if (matches.length === 0) {
    tabSearchList.innerHTML = '<div class="empty-state">No matching open tabs</div>';
    return;
  }

  if (tabSearchSelectedIndex >= matches.length) tabSearchSelectedIndex = 0;

  matches.forEach((t, idx) => {
    const item = document.createElement('div');
    item.className = 'tab-search-item' + (idx === tabSearchSelectedIndex ? ' selected' : '');
    const url = t._savedURL || (t.webview ? t.webview.getURL() : '');
    const title = t.pageTitle || (t.titleEl ? t.titleEl.innerText : '') || 'New Tab';
    const isCur = t.id === activeTabId;

    let iconHtml = '<span class="material-icons-round">language</span>';
    if (url.startsWith('http')) {
      try {
        const favUrl = new URL(url).origin + '/favicon.ico';
        iconHtml = `<img src="${favUrl}" alt="" onerror="this.outerHTML='<span class=\\'material-icons-round\\'>language</span>'">`;
      } catch (_) {}
    } else if (url.startsWith('black-ui:')) {
      iconHtml = '<span class="material-icons-round" style="color:var(--accent)">auto_awesome</span>';
    }

    item.innerHTML = `
      <div class="ts-icon">${iconHtml}</div>
      <div class="ts-info">
        <div class="ts-title">${esc(title)}</div>
        <div class="ts-url">${esc(url)}</div>
      </div>
      ${isCur ? '<span class="ts-badge">Active</span>' : ''}
      ${t.pinned ? '<span class="ts-badge" style="color:#38bdf8">Pinned</span>' : ''}
    `;

    item.addEventListener('click', () => {
      if (t._sleeping) wakeTab(t);
      else switchTab(t.id);
      closeTabSearch();
    });

    tabSearchList.appendChild(item);
  });
}

if (tabSearchInput) {
  tabSearchInput.addEventListener('input', () => {
    tabSearchSelectedIndex = 0;
    renderTabSearchList(tabSearchInput.value);
  });

  tabSearchInput.addEventListener('keydown', (e) => {
    const items = tabSearchList.querySelectorAll('.tab-search-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      tabSearchSelectedIndex = Math.min(items.length - 1, tabSearchSelectedIndex + 1);
      renderTabSearchList(tabSearchInput.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      tabSearchSelectedIndex = Math.max(0, tabSearchSelectedIndex - 1);
      renderTabSearchList(tabSearchInput.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = tabSearchInput.value.toLowerCase().trim();
      const matches = tabs.filter(t => {
        const title = (t.pageTitle || (t.titleEl ? t.titleEl.innerText : '') || '').toLowerCase();
        const url = (t._savedURL || (t.webview ? t.webview.getURL() : '')).toLowerCase();
        return title.includes(q) || url.includes(q);
      });
      const target = matches[tabSearchSelectedIndex];
      if (target) {
        if (target._sleeping) wakeTab(target);
        else switchTab(target.id);
        closeTabSearch();
      }
    } else if (e.key === 'Escape') {
      closeTabSearch();
    }
  });
}

if (tabSearchOverlay) {
  tabSearchOverlay.addEventListener('click', (e) => {
    if (e.target === tabSearchOverlay) closeTabSearch();
  });
}

// ═══════════════════════════════════════════════════════════
//  MEDIA FEATURES — PiP, Clickable Mute, Media Session HUD
// ═══════════════════════════════════════════════════════════

// ── 1. TOAST NOTIFICATION ──
let toastTimer = null;
function showToast(message, duration = 2000) {
  const toast = document.getElementById('toast-notif');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

// ── 2. PICTURE-IN-PICTURE (PiP) ──
const pipBtn = document.getElementById('pip-btn');
if (pipBtn) {
  pipBtn.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (!wv) { showToast('No active page', 2000); return; }

    wv.executeJavaScript(`
      (async function() {
        const video = document.querySelector('video');
        if (!video) return { success: false, reason: 'No video found' };
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
            return { success: true, active: false };
          } else {
            await video.requestPictureInPicture();
            return { success: true, active: true };
          }
        } catch (e) {
          return { success: false, reason: e.message };
        }
      })();
    `).then(res => {
      if (res && res.success) {
        showToast(res.active ? 'PiP Active' : 'PiP Exited', 2000);
      } else {
        showToast('No video found on page', 2500);
      }
    }).catch(() => {
      showToast('No video found on page', 2500);
    });
  });
}

// ── 3. CLICKABLE TAB AUDIO MUTE ──
function toggleAudioMute(tabObj) {
  if (!tabObj || !tabObj.webview) return;
  tabObj.muted = !tabObj.muted;
  try { tabObj.webview.setAudioMuted(tabObj.muted); } catch (_) {}
  if (tabObj.audioBtn) {
    if (tabObj.muted) {
      tabObj.audioBtn.textContent = 'volume_off';
      tabObj.audioBtn.classList.add('muted');
      tabObj.audioBtn.title = 'Unmute site';
      tabObj.audioBtn.style.display = 'inline-flex';
    } else {
      tabObj.audioBtn.classList.remove('muted');
      tabObj.audioBtn.title = 'Mute site';
      try {
        if (tabObj.webview.isCurrentlyAudible()) {
          tabObj.audioBtn.textContent = 'volume_up';
          tabObj.audioBtn.style.display = 'inline-flex';
        } else {
          tabObj.audioBtn.style.display = 'none';
        }
      } catch (_) { tabObj.audioBtn.style.display = 'none'; }
    }
  }
  updateMediaHUD();
}

// ── 4. MEDIA SESSION HUD (Height 32px Mini-Player) ──
const mediaHud   = document.getElementById('media-hud');
const hudFavicon = document.getElementById('hud-favicon');
const hudTitle   = document.getElementById('hud-title');
const hudPlayBtn = document.getElementById('hud-play-btn');
const hudMuteBtn = document.getElementById('hud-mute-btn');
let activeMediaTab = null;

function updateMediaHUD() {
  if (!mediaHud) return;
  activeMediaTab = tabs.find(t => {
    try { return t.webview && (t.webview.isCurrentlyAudible() || t.muted); } catch (_) { return false; }
  });

  if (activeMediaTab) {
    mediaHud.classList.remove('hidden');
    const url = activeMediaTab._savedURL || (activeMediaTab.webview ? activeMediaTab.webview.getURL() : '');
    if (url && url.startsWith('http')) {
      try {
        hudFavicon.src = new URL(url).origin + '/favicon.ico';
        hudFavicon.style.display = 'block';
      } catch (_) { hudFavicon.style.display = 'none'; }
    } else {
      hudFavicon.style.display = 'none';
    }

    const title = activeMediaTab.pageTitle || (activeMediaTab.titleEl ? activeMediaTab.titleEl.innerText : '') || 'Playing Media';
    if (hudTitle) hudTitle.textContent = title;

    if (hudMuteBtn) {
      hudMuteBtn.innerHTML = `<span class="material-icons-round">${activeMediaTab.muted ? 'volume_off' : 'volume_up'}</span>`;
    }
  } else {
    mediaHud.classList.add('hidden');
  }
}

if (hudPlayBtn) {
  hudPlayBtn.addEventListener('click', () => {
    if (!activeMediaTab || !activeMediaTab.webview) return;
    activeMediaTab.webview.executeJavaScript(`
      (function() {
        const media = document.querySelector('video, audio');
        if (media) {
          if (media.paused) { media.play(); return true; }
          else { media.pause(); return false; }
        }
        return null;
      })();
    `).then(isPlaying => {
      if (hudPlayBtn) {
        hudPlayBtn.innerHTML = `<span class="material-icons-round">${isPlaying ? 'pause' : 'play_arrow'}</span>`;
      }
    }).catch(() => {});
  });
}

if (hudMuteBtn) {
  hudMuteBtn.addEventListener('click', () => {
    if (activeMediaTab) toggleAudioMute(activeMediaTab);
  });
}
findInput.addEventListener('input', () => {
  const wv = getActiveWebview(); if (!wv) return;
  if (findInput.value) wv.findInPage(findInput.value, { forward: true, findNext: false });
  else { wv.stopFindInPage('clearSelection'); findCount.textContent = ''; }
});
findInput.addEventListener('keydown', (e) => {
  const wv = getActiveWebview(); if (!wv) return;
  if (e.key === 'Enter') { e.preventDefault(); if (findInput.value) wv.findInPage(findInput.value, { forward: !e.shiftKey, findNext: true }); }
  else if (e.key === 'Escape') closeFindBar();
});
findPrev.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && findInput.value) wv.findInPage(findInput.value, { forward: false, findNext: true }); });
findNext.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && findInput.value) wv.findInPage(findInput.value, { forward: true, findNext: true }); });
findClose.addEventListener('click', closeFindBar);

// --- URL SUGGESTIONS ---
function showSuggestions(query) {
  const q = query.toLowerCase(); const matches = []; const seen = new Set();
  savedHistory.forEach(h => {
    if (matches.length >= 8 || seen.has(h.url)) return;
    if ((h.title && h.title.toLowerCase().includes(q)) || h.url.toLowerCase().includes(q)) {
      if (h.url && h.url !== 'about:blank') { seen.add(h.url); matches.push({ url: h.url, title: h.title || h.url, type: 'history' }); }
    }
  });
  savedBookmarks.forEach(b => {
    if (matches.length >= 8 || seen.has(b.url)) return;
    if ((b.title && b.title.toLowerCase().includes(q)) || b.url.toLowerCase().includes(q)) { seen.add(b.url); matches.push({ url: b.url, title: b.title || b.url, type: 'bookmark' }); }
  });
  if (q.includes('.') && !q.includes(' ')) {
    const fullUrl = q.startsWith('http') ? q : 'https://' + q;
    if (!seen.has(fullUrl)) matches.unshift({ url: fullUrl, title: 'Visit ' + fullUrl, type: 'direct' });
  }
  renderSuggestions(matches);
}
function hideSuggestions() { urlSuggestions.classList.add('hidden'); }
function renderSuggestions(matches) {
  if (!matches.length) { hideSuggestions(); return; }
  urlSuggestions.innerHTML = '';
  matches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'url-suggestion-item';
    const icon = m.type === 'bookmark' ? 'star' : m.type === 'history' ? 'history' : 'open_in_new';
    item.innerHTML = '<div class="suggestion-icon"><span class="material-icons-round">' + icon + '</span></div><div class="suggestion-text"><div class="suggestion-title">' + esc(m.title) + '</div><div class="suggestion-url">' + esc(m.url) + '</div></div>';
    item.addEventListener('click', () => { const wv = getActiveWebview(); if (wv) { wv.loadURL(m.url); urlInput.value = m.url; hideSuggestions(); urlInput.blur(); } });
    urlSuggestions.appendChild(item);
  });
  urlSuggestions.classList.remove('hidden');
}

// --- BOOKMARKS ---
let savedBookmarks = [];
async function loadBookmarks() { savedBookmarks = await window.api.loadBookmarks(); }
function saveBookmarks() { window.api.saveBookmarks(savedBookmarks); }
function renderBookmarks() {
  bookmarksList.innerHTML = '';
  if (savedBookmarks.length === 0) {
    bookmarksList.innerHTML = '<div class="empty-state"><span class="material-icons-round">bookmark_border</span>No bookmarks saved</div>';
    return;
  }
  savedBookmarks.forEach(b => {
    const card = document.createElement('div');
    card.className = 'bm-card';
    let fav = '';
    if (b.url.startsWith('http')) {
      try { fav = new URL(b.url).origin + '/favicon.ico'; } catch (_) {}
    }
    card.innerHTML = `
      <img class="bm-card-icon" src="${fav}" alt="" onerror="this.style.display='none'">
      <div class="bm-card-title">${esc(b.title || b.url)}</div>
    `;
    card.addEventListener('click', () => {
      const wv = getActiveWebview();
      if (wv) wv.loadURL(b.url);
      closeSidebar();
    });
    bookmarksList.appendChild(card);
  });
}
starBtn.addEventListener('click', () => {
  const wv = getActiveWebview();
  if (wv) {
    const url = wv.getURL();
    const tab = tabs.find(t => t.id === activeTabId);
    const title = tab ? tab.titleEl.innerText : url;
    if (!savedBookmarks.find(b => b.url === url)) {
      savedBookmarks.push({ url, title });
      saveBookmarks(); renderBookmarks();
      starBtn.innerHTML = '<span class="material-icons-round" style="color:#ffd700">star</span>';
      setTimeout(() => { starBtn.innerHTML = '<span class="material-icons-round">star_border</span>'; }, 1000);
    }
  }
});


// --- DOWNLOADS ---
function createOrUpdateDownload(filename, progress = 0, state = 'progressing') {
  let li = document.getElementById('dl-' + filename);
  if (!li) {
    li = document.createElement('li'); li.id = 'dl-' + filename; li.className = 'download-item';
    li.innerHTML = '<div style="font-size:12px">' + esc(filename) + '</div><div class="download-progress-bg"><div class="download-progress-bar" id="dl-bar-' + filename + '"></div></div>';
    downloadsList.insertBefore(li, downloadsList.firstChild);
  }
  const bar = document.getElementById('dl-bar-' + filename);
  if (bar) bar.style.width = progress + '%';
  if (state === 'completed') li.style.opacity = '0.5';
  else if (state === 'cancelled' || state === 'interrupted') li.style.opacity = '0.3';
}

window.api.onDownloadStart((data) => { createOrUpdateDownload(data.filename, 0); });
window.api.onDownloadProgress((data) => { createOrUpdateDownload(data.filename, data.progress); });
window.api.onDownloadDone((data) => { createOrUpdateDownload(data.filename, 100, data.state); });

// --- HISTORY ---
let savedHistory = [];
async function loadHistory() { savedHistory = await window.api.loadHistory(); }
function saveHistory() { window.api.saveHistory(savedHistory); }
function renderHistory() {
  historyList.innerHTML = '';
  if (savedHistory.length === 0) {
    historyList.innerHTML = '<div class="empty-state"><span class="material-icons-round">history</span>No browsing history yet</div>';
    return;
  }
  savedHistory.slice(0, 50).forEach(h => {
    const li = document.createElement('li');
    li.textContent = h.title && h.title !== 'Loading...' ? h.title : h.url; li.title = h.url;
    li.addEventListener('click', () => { const wv = getActiveWebview(); if (wv) wv.loadURL(h.url); historyMenu.classList.add('hidden'); });
    historyList.appendChild(li);
  });
}
function addToHistory(url, title) {
  if (!url || url === 'about:blank') return;
  if (savedHistory.length > 0 && savedHistory[0].url === url) return;
  savedHistory.unshift({ url, title, time: Date.now() });
  if (savedHistory.length > 200) savedHistory.pop();
  saveHistory(); renderHistory();
}
// ═══════════════════════════════════════════════════════════
//  COLLAPSIBLE LEFT SIDEBAR SYSTEM
// ═══════════════════════════════════════════════════════════
const sidebarPanel      = document.getElementById('sidebar-panel');
const sidebarPanelTitle = document.getElementById('sidebar-panel-title');
const sidebarCloseBtn   = document.getElementById('sidebar-close-btn');
const sbNotesInput      = document.getElementById('sb-notes-input');

let activeSidebarView = null;

function openSidebarView(viewName) {
  if (!sidebarPanel) return;

  if (activeSidebarView === viewName && !sidebarPanel.classList.contains('collapsed')) {
    closeSidebar();
    return;
  }

  activeSidebarView = viewName;

  const titles = {
    bookmarks: 'Bookmarks',
    history: 'History',
    downloads: 'Downloads',
    notes: 'Quick Notes'
  };
  if (sidebarPanelTitle) sidebarPanelTitle.textContent = titles[viewName] || 'Sidebar';

  document.querySelectorAll('.sidebar-view').forEach(el => el.classList.add('hidden'));
  const viewEl = document.getElementById('sb-view-' + viewName);
  if (viewEl) viewEl.classList.remove('hidden');

  document.querySelectorAll('.sb-rail-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById('sb-btn-' + viewName);
  if (activeBtn) activeBtn.classList.add('active');

  sidebarPanel.classList.remove('collapsed');
}

function closeSidebar() {
  if (sidebarPanel) sidebarPanel.classList.add('collapsed');
  document.querySelectorAll('.sb-rail-btn').forEach(btn => btn.classList.remove('active'));
  activeSidebarView = null;
}

const sbBtnBm = document.getElementById('sb-btn-bookmarks');
const sbBtnHist = document.getElementById('sb-btn-history');
const sbBtnDl = document.getElementById('sb-btn-downloads');
const sbBtnNotes = document.getElementById('sb-btn-notes');
const sbBtnAi = document.getElementById('sb-btn-ai');

if (sbBtnBm) sbBtnBm.addEventListener('click', () => openSidebarView('bookmarks'));
if (sbBtnHist) sbBtnHist.addEventListener('click', () => openSidebarView('history'));
if (sbBtnDl) sbBtnDl.addEventListener('click', () => openSidebarView('downloads'));
if (sbBtnNotes) sbBtnNotes.addEventListener('click', () => openSidebarView('notes'));

if (sbBtnAi) {
  sbBtnAi.addEventListener('click', () => {
    createTab('https://claude.ai');
  });
}

if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);

// Auto-save Quick Notes with 500ms debounce
if (sbNotesInput) {
  sbNotesInput.value = localStorage.getItem('bb-sidebar-notes') || '';
  let notesTimer = null;
  sbNotesInput.addEventListener('input', () => {
    if (notesTimer) clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      localStorage.setItem('bb-sidebar-notes', sbNotesInput.value);
    }, 500);
  });
}

function toggleHistory() { openSidebarView('history'); }
function toggleBookmarks() { openSidebarView('bookmarks'); }
function toggleDownloads() { openSidebarView('downloads'); }

// --- CHILD MENU TOGGLES ---
document.querySelectorAll('[data-action="history"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); toggleHistory(); }));
document.querySelectorAll('[data-action="downloads"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); toggleDownloads(); }));
document.querySelectorAll('[data-action="bookmarks"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); toggleBookmarks(); }));

shieldBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeAllMenus();
  readerPanel.classList.add('hidden');
  privacyPanel.classList.toggle('hidden');
});

const freeBtn = document.getElementById('free-btn');
if (freeBtn) {
  freeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllPanels();
    openFreeResources();
  });
}

if (readerBtn) {
  readerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllMenus();
    privacyPanel.classList.add('hidden');
    readerPanel.classList.toggle('hidden');
  });
}

const profileBtn = document.getElementById('profile-btn');
if (profileBtn) {
  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllPanels();
    openFreeResources();
  });
}

// Click outside to close all panels & sidebar
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!target.closest('.chrome-menu') &&
      !target.closest('.tb-btn') &&
      !target.closest('#privacy-panel') &&
      !target.closest('#reader-panel') &&
      !target.closest('#sidebar-rail') &&
      !target.closest('#sidebar-panel')) {
    closeAllPanels();
    closeSidebar();
  }
});

// --- OPEN LOCAL FILE ---
async function openLocalFile() {
  const filePath = await window.api.openFileDialog();
  if (filePath) {
    const wv = getActiveWebview();
    if (wv) wv.loadURL('file:///' + filePath.replace(/\\/g, '/'));
  }
}

// --- DRAG AND DROP ---
browserContainer.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; });
browserContainer.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  const urls = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  const wv = getActiveWebview();
  if (!wv) return;
  if (files.length > 0) {
    const fp = files[0].path;
    if (fp) wv.loadURL('file:///' + fp.replace(/\\/g, '/'));
  } else if (urls) {
    wv.loadURL(urls.trim());
  }
});

// --- PASSWORD MANAGER ---
let pmMasterPassword = '';
let pmEntries = [];
let pmUnlocked = false;

const pmOverlay = document.getElementById('pm-overlay');
const pmUnlock = document.getElementById('pm-unlock');
const pmVault = document.getElementById('pm-vault');
const pmMasterInput = document.getElementById('pm-master-input');
const pmMasterError = document.getElementById('pm-master-error');
const pmUnlockBtn = document.getElementById('pm-unlock-btn');
const pmSetupBtn = document.getElementById('pm-setup-btn');
const pmCloseBtn = document.getElementById('pm-close-btn');
const pmSearch = document.getElementById('pm-search');
const pmList = document.getElementById('pm-list');
const pmCount = document.getElementById('pm-count');
const pmNotif = document.getElementById('pm-notification');
const pmNotifDomain = document.getElementById('pm-notif-domain');
const pmNotifDetails = document.getElementById('pm-notif-details');
const pmNotifSave = document.getElementById('pm-notif-save');
const pmNotifNever = document.getElementById('pm-notif-never');

function renderPMList(filter = '') {
  pmList.innerHTML = '';
  const filtered = filter ? pmEntries.filter(e => e.site.toLowerCase().includes(filter) || e.username.toLowerCase().includes(filter)) : pmEntries;
  pmCount.textContent = '(' + filtered.length + '/' + pmEntries.length + ')';
  filtered.forEach((entry, idx) => {
    const div = document.createElement('div');
    div.className = 'pm-entry';
    const domain = entry.site.replace(/^https?:\/\//, '').split('/')[0];
    div.innerHTML = `
      <div class="pm-entry-icon">${domain.charAt(0).toUpperCase()}</div>
      <div class="pm-entry-info">
        <div class="pm-entry-site">${esc(entry.site)}</div>
        <div class="pm-entry-username">${esc(entry.username)}${entry.password ? ' — ••••••••' : ''}</div>
      </div>
      <div class="pm-entry-actions">
        <button class="pm-copy-user" data-idx="${idx}" title="Copy username"><span class="material-icons-round">person</span></button>
        <button class="pm-copy-pass" data-idx="${idx}" title="Copy password"><span class="material-icons-round">key</span></button>
        <button class="pm-delete-entry" data-idx="${idx}" title="Delete"><span class="material-icons-round">delete</span></button>
      </div>`;
    pmList.appendChild(div);
  });
  pmList.querySelectorAll('.pm-copy-user').forEach(b => b.addEventListener('click', (e) => {
    const i = parseInt(e.currentTarget.dataset.idx);
    navigator.clipboard.writeText(pmEntries[i].username || '');
  }));
  pmList.querySelectorAll('.pm-copy-pass').forEach(b => b.addEventListener('click', (e) => {
    const i = parseInt(e.currentTarget.dataset.idx);
    if (pmEntries[i].password) navigator.clipboard.writeText(pmEntries[i].password);
  }));
  pmList.querySelectorAll('.pm-delete-entry').forEach(b => b.addEventListener('click', (e) => {
    const i = parseInt(e.currentTarget.dataset.idx);
    pmEntries.splice(i, 1);
    window.api.pmSave(pmMasterPassword, pmEntries);
    renderPMList(pmSearch.value.toLowerCase());
  }));
}

async function openPM() {
  closeAllPanels();
  pmMasterError.classList.add('hidden');
  pmMasterInput.value = '';
  const has = await window.api.pmHasMaster();
  if (has) {
    pmUnlock.classList.remove('hidden');
    pmVault.classList.add('hidden');
    pmSetupBtn.style.display = 'none';
    pmOverlay.classList.remove('hidden');
    setTimeout(() => pmMasterInput.focus(), 100);
  } else {
    pmUnlock.classList.remove('hidden');
    pmVault.classList.add('hidden');
    pmSetupBtn.style.display = 'block';
    pmSetupBtn.textContent = 'Create Master Password';
    pmOverlay.classList.remove('hidden');
    setTimeout(() => pmMasterInput.focus(), 100);
  }
}

pmUnlockBtn.addEventListener('click', async () => {
  const pw = pmMasterInput.value;
  if (!pw) return;
  const has = await window.api.pmHasMaster();
  if (!has) {
    pmMasterError.textContent = 'Set a master password first';
    pmMasterError.classList.remove('hidden');
    return;
  }
  const ok = await window.api.pmVerifyMaster(pw);
  if (!ok) { pmMasterError.classList.remove('hidden'); return; }
  pmMasterPassword = pw;
  pmEntries = await window.api.pmLoad(pw);
  pmUnlock.classList.add('hidden');
  pmVault.classList.remove('hidden');
  renderPMList();
  pmUnlocked = true;
});

pmSetupBtn.addEventListener('click', async () => {
  const pw = pmMasterInput.value;
  if (!pw || pw.length < 4) {
    pmMasterError.textContent = 'Password must be at least 4 characters';
    pmMasterError.classList.remove('hidden');
    return;
  }
  const has = await window.api.pmHasMaster();
  if (has) {
    pmMasterError.textContent = 'Master password already set. Enter it above.';
    pmMasterError.classList.remove('hidden');
    return;
  }
  const ok = await window.api.pmSetMaster(pw);
  if (!ok) { pmMasterError.textContent = 'Failed to save'; pmMasterError.classList.remove('hidden'); return; }
  pmMasterPassword = pw;
  pmEntries = [];
  pmUnlock.classList.add('hidden');
  pmVault.classList.remove('hidden');
  renderPMList();
  pmUnlocked = true;
});

pmCloseBtn.addEventListener('click', () => { pmOverlay.classList.add('hidden'); });
pmOverlay.addEventListener('click', (e) => { if (e.target === pmOverlay) pmOverlay.classList.add('hidden'); });
pmMasterInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') pmUnlockBtn.click(); });
pmSearch.addEventListener('input', () => renderPMList(pmSearch.value.toLowerCase()));

// Detect login forms and offer to save
let pmPendingSave = null;
let pmNeverDomains = [];

setInterval(() => {
  const tab = getActiveTab();
  if (!tab || !tab.webview || !pmUnlocked) return;
  const url = tab.webview.getURL();
  if (!url || url === 'about:blank' || url.startsWith('data:') || url.startsWith('file:')) return;
  const domain = new URL(url).hostname;
  if (pmNeverDomains.includes(domain)) return;
  if (pmEntries.some(e => e.site === url)) return;
  tab.webview.executeJavaScript(`
    (function() {
      var f = document.querySelector('form[action*="login"],form[action*="signin"],form[action*="auth"],form input[type="password"]');
      if (!f) return null;
      var p = f.querySelector('input[type="password"]');
      if (!p || !p.value) return null;
      var u = f.querySelector('input[type="email"],input[name*="user"],input[name*="email"],input[name*="login"],input[name*="log"]');
      return { username: u ? u.value : '', password: p.value };
    })();
  `, true).then((result) => {
    if (!result || !result.password) return;
    pmPendingSave = { url, username: result.username, password: result.password, domain };
    pmNotifDomain.textContent = domain;
    pmNotifDetails.textContent = result.username ? result.username + ' / ••••••••' : '••••••••';
    pmNotif.classList.remove('hidden');
    setTimeout(() => { if (pmPendingSave) { pmNotif.classList.add('hidden'); pmPendingSave = null; } }, 8000);
  }).catch(() => {});
}, 3000);

pmNotifSave.addEventListener('click', () => {
  if (!pmPendingSave) return;
  pmEntries.push({ site: pmPendingSave.url, username: pmPendingSave.username, password: pmPendingSave.password });
  window.api.pmSave(pmMasterPassword, pmEntries);
  renderPMList();
  pmNotif.classList.add('hidden');
  pmPendingSave = null;
});

pmNotifNever.addEventListener('click', () => {
  if (!pmPendingSave) return;
  pmNeverDomains.push(pmPendingSave.domain);
  pmNotif.classList.add('hidden');
  pmPendingSave = null;
});

// Auto-fill passwords on login pages
setInterval(() => {
  const tab = getActiveTab();
  if (!tab || !tab.webview || !pmUnlocked) return;
  const url = tab.webview.getURL();
  if (!url || url === 'about:blank') return;
  const match = pmEntries.find(e => e.site === url);
  if (!match) return;
  tab.webview.executeJavaScript(`
    (function() {
      var u = document.querySelector('input[type="email"],input[name*="user"],input[name*="email"],input[name*="login"]');
      var p = document.querySelector('input[type="password"]');
      if (u && !u.value && ${JSON.stringify(match.username)}) { u.value = ${JSON.stringify(match.username)}; }
      if (p && !p.value && ${JSON.stringify(match.password)}) { p.value = ${JSON.stringify(match.password)}; }
    })();
  `, true).catch(() => {});
}, 2000);

// --- BROWSING TIME TRACKER ---
let usageData = {};
let sessionStart = Date.now();
let currentDomain = '';
let domainStartTime = 0;

async function loadUsage() {
  try {
    const d = await window.api.loadUsage();
    if (d && typeof d === 'object') usageData = d;
  } catch (e) {}
}
async function saveUsage() {
  await window.api.saveUsage(usageData);
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch (e) { return ''; }
}

function trackTime() {
  const tab = getActiveTab();
  if (!tab || !tab.webview) return;
  const url = tab.webview.getURL();
  if (!url || url === 'about:blank' || url.startsWith('data:') || url.startsWith('file:')) {
    if (currentDomain) { tallyTime(); currentDomain = ''; }
    return;
  }
  const domain = getDomain(url);
  if (!domain) return;
  if (domain !== currentDomain) {
    if (currentDomain) tallyTime();
    currentDomain = domain;
    domainStartTime = Date.now();
  }
}

function tallyTime() {
  if (!currentDomain || !domainStartTime) return;
  const elapsed = Math.floor((Date.now() - domainStartTime) / 1000);
  if (elapsed < 1) return;
  const today = new Date().toISOString().slice(0, 10);
  if (!usageData[currentDomain]) usageData[currentDomain] = { total: 0, days: {} };
  if (!usageData[currentDomain].days[today]) usageData[currentDomain].days[today] = 0;
  usageData[currentDomain].total += elapsed;
  usageData[currentDomain].days[today] += elapsed;
  domainStartTime = Date.now();
}

setInterval(() => { trackTime(); }, 5000);
setInterval(() => { saveUsage(); }, 30000);

window.addEventListener('beforeunload', () => { tallyTime(); saveUsage(); });

// --- USAGE PANEL ---
const usageOverlay = document.getElementById('usage-overlay');
const usageSearch = document.getElementById('usage-search');
const usageList = document.getElementById('usage-list');
const usageToday = document.getElementById('usage-today');
const usageSession = document.getElementById('usage-session');
const usageTop = document.getElementById('usage-top');
const usageCloseBtn = document.getElementById('usage-close-btn');

function formatTime(seconds) {
  if (seconds < 60) return seconds + 's';
  const m = Math.floor(seconds / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

function renderUsage(filter = '') {
  const today = new Date().toISOString().slice(0, 10);
  let todayTotal = 0;
  let sessionTotal = Math.floor((Date.now() - sessionStart) / 1000);
  let topSite = '';
  let topTime = 0;
  const entries = Object.entries(usageData).filter(([domain]) => !filter || domain.includes(filter.toLowerCase()));
  entries.sort((a, b) => (b[1].total || 0) - (a[1].total || 0));

  entries.forEach(([domain, data]) => {
    if (data.days && data.days[today]) todayTotal += data.days[today];
    if (data.total > topTime) { topTime = data.total; topSite = domain; }
  });

  usageToday.textContent = formatTime(todayTotal);
  usageSession.textContent = formatTime(sessionTotal);
  usageTop.textContent = topSite || '-';

  usageList.innerHTML = '';
  entries.slice(0, 30).forEach(([domain, data]) => {
    const div = document.createElement('div');
    div.className = 'pm-entry';
    const todaySecs = (data.days && data.days[today]) || 0;
    div.innerHTML = `
      <div class="pm-entry-icon">${domain.charAt(0).toUpperCase()}</div>
      <div class="pm-entry-info">
        <div class="pm-entry-site">${esc(domain)}</div>
        <div class="pm-entry-username">Total: ${formatTime(data.total)} · Today: ${formatTime(todaySecs)}</div>
      </div>`;
    usageList.appendChild(div);
  });
}

function openUsage() {
  closeAllPanels();
  tallyTime();
  renderUsage();
  usageOverlay.classList.remove('hidden');
}

document.querySelectorAll('[data-action="usage"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); openUsage(); }));
usageCloseBtn.addEventListener('click', () => usageOverlay.classList.add('hidden'));
usageOverlay.addEventListener('click', (e) => { if (e.target === usageOverlay) usageOverlay.classList.add('hidden'); });
usageSearch.addEventListener('input', () => renderUsage(usageSearch.value.toLowerCase()));

// --- SETTINGS ---
let settings = {
  searchEngine: 'Google',
  startup: 'home',
  homepage: 'free',
  homepageUrl: '',
  accentColor: '#8ab4f8',
  blockScripts: false,
  forceDarkMode: true,
  customCSS: '',
  showFree: true,
  showReader: true,
  showShield: true
};

const settingsOverlay = document.getElementById('settings-overlay');
const settingsEngine = document.getElementById('settings-engine');
const settingsHomepage = document.getElementById('settings-homepage');
const settingsStartup = document.getElementById('settings-startup');
const settingsHomepageUrl = document.getElementById('settings-homepage-url');
const settingsBlockScripts = document.getElementById('settings-block-scripts');
const settingsDarkMode = document.getElementById('settings-dark-mode');
const settingsCustomCSS = document.getElementById('settings-custom-css');
const settingsShowFree = document.getElementById('settings-show-free');
const settingsShowReader = document.getElementById('settings-show-reader');
const settingsShowShield = document.getElementById('settings-show-shield');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsCloseBtn = document.getElementById('settings-close-btn');

function applySettings() {
  document.documentElement.style.setProperty('--accent', settings.accentColor);
  const accentEls = document.querySelectorAll('.chrome-btn, .loading-bar');
  accentEls.forEach(el => el.style.setProperty('background', settings.accentColor, 'important'));
  if (freeBtn) freeBtn.style.display = settings.showFree ? '' : 'none';
  readerBtn.style.display = settings.showReader ? '' : 'none';
  shieldBtn.style.display = settings.showShield ? '' : 'none';
  sessionStorage.setItem('blockScripts', settings.blockScripts ? '1' : '0');
  if (scriptToggle) scriptToggle.checked = settings.blockScripts;
  // Re-inject custom CSS into active webview
  const tab = getActiveTab();
  if (tab && tab.webview && settings.customCSS) {
    tab.webview.insertCSS(settings.customCSS).catch(() => {});
  }
}

function openSettings() {
  closeAllPanels();
  settingsEngine.value = settings.searchEngine;
  settingsStartup.value = settings.startup || 'home';
  settingsHomepage.value = settings.homepage;
  settingsHomepageUrl.value = settings.homepageUrl || '';
  settingsHomepageUrl.style.display = settings.homepage === 'custom' ? '' : 'none';
  settingsBlockScripts.checked = settings.blockScripts;
  settingsDarkMode.checked = settings.forceDarkMode;
  settingsCustomCSS.value = settings.customCSS || '';
  settingsShowFree.checked = settings.showFree;
  settingsShowReader.checked = settings.showReader;
  settingsShowShield.checked = settings.showShield;
  document.querySelectorAll('.color-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.color === settings.accentColor);
  });
  settingsOverlay.classList.remove('hidden');
}

settingsHomepage.addEventListener('change', () => {
  settingsHomepageUrl.style.display = settingsHomepage.value === 'custom' ? '' : 'none';
});

document.querySelectorAll('.color-swatch').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  });
});

settingsSaveBtn.addEventListener('click', async () => {
  const swatch = document.querySelector('.color-swatch.active');
  settings.searchEngine = settingsEngine.value;
  settings.startup = settingsStartup.value;
  settings.homepage = settingsHomepage.value;
  settings.homepageUrl = settingsHomepageUrl.value;
  settings.accentColor = swatch ? swatch.dataset.color : '#8ab4f8';
  settings.blockScripts = settingsBlockScripts.checked;
  settings.forceDarkMode = settingsDarkMode.checked;
  settings.customCSS = settingsCustomCSS.value;
  settings.showFree = settingsShowFree.checked;
  settings.showReader = settingsShowReader.checked;
  settings.showShield = settingsShowShield.checked;
  await window.api.saveSettings(settings);
  applySettings();
  settingsOverlay.classList.add('hidden');
});

settingsCloseBtn.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden'); });

// --- MENU ACTIONS ---
document.querySelectorAll('[data-action="passwords"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); openPM(); }));
document.querySelectorAll('[data-action="settings"]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); openSettings(); }));

// --- INIT ---
(async () => {
  await loadBookmarks(); renderBookmarks();
  await loadHistory(); renderHistory();
  await loadUsage();

  // Load settings first
  try {
    const s = await window.api.loadSettings();
    if (s) Object.assign(settings, s);
  } catch (e) {}
  applySettings();

  const startup = settings.startup || 'home';
  if (startup === 'restore') {
    const savedSession = await loadSession();
    if (savedSession && Array.isArray(savedSession) && savedSession.length > 0) {
      // ── LAZY STARTUP: create only the first (last active) tab immediately ──
      // The rest are deferred by 400ms so the main window renders fast
      createTab(savedSession[0].url, !!savedSession[0].pinned);
      switchTab(tabs[0].id);

      if (savedSession.length > 1) {
        let delay = 400;
        for (let i = 1; i < savedSession.length; i++) {
          const saved = savedSession[i];
          setTimeout(() => createTab(saved.url, !!saved.pinned), delay);
          delay += 200; // stagger each additional tab by 200ms
        }
      }
      return;
    }
  }
  createTab();
})();
