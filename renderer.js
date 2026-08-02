// renderer.js

const DOM = {
    tabStrip: document.getElementById('tab-strip'),
    tabStripContainer: document.getElementById('tab-strip-container'),
    newTabBtn: document.getElementById('new-tab-btn'),
    browserContainer: document.getElementById('browser-container'),
    urlInput: document.getElementById('url-input'),
    btnBack: document.getElementById('btn-back'),
    btnFwd: document.getElementById('btn-fwd'),
    btnReload: document.getElementById('btn-reload'),
    btnHome: document.getElementById('btn-home'),
    btnMenu: document.getElementById('btn-menu'),
    btnPip: document.getElementById('btn-pip'),
    btnShield: document.getElementById('btn-shield'),
    btnLayout: document.getElementById('btn-layout'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    btnBookmark: document.getElementById('btn-bookmark-star'),
    btnAi: document.getElementById('btn-ai'),
    mainMenu: document.getElementById('main-menu'),
    menuZoom: document.getElementById('menu-zoom'),
    mzLabel: document.getElementById('mz-label'),
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
    mhTitle: document.getElementById('mh-title'),
    findBar: document.getElementById('find-bar'),
    findInput: document.getElementById('find-input'),
    findCount: document.getElementById('find-count'),
    pmModal: document.getElementById('pm-modal'),
    pmContent: document.getElementById('pm-content'),
    settingsModal: document.getElementById('settings-modal'),
    setEngine: document.getElementById('set-engine'),
    setDark: document.getElementById('set-dark'),
    setSleep: document.getElementById('set-sleep'),
    setShields: document.getElementById('set-shields'),
    setStartup: document.getElementById('set-startup'),
    setStartupPages: document.getElementById('set-startup-pages'),
    setStartupPagesWrap: document.getElementById('set-startup-pages-wrap'),
    setZoomLabel: document.getElementById('set-zoom-label'),
    usageModal: document.getElementById('usage-modal'),
    usageContent: document.getElementById('usage-content'),
    extModal: document.getElementById('ext-modal'),
    extContent: document.getElementById('ext-content'),
    qrModal: document.getElementById('qr-modal'),
    qrCanvas: document.getElementById('qr-canvas'),
    qrUrl: document.getElementById('qr-url'),
    urlIcon: document.getElementById('url-icon'),
    incognitoBadge: document.getElementById('incognito-badge'),
    aiPanel: document.getElementById('ai-panel'),
    aiModelLabel: document.getElementById('ai-model-label'),
    aiMessages: document.getElementById('ai-messages'),
    aiInput: document.getElementById('ai-input'),
    aiSend: document.getElementById('ai-send'),
    aiBtnSettings: document.getElementById('ai-btn-settings'),
    aiBtnClear: document.getElementById('ai-btn-clear'),
    aiBtnClose: document.getElementById('ai-btn-close'),
    aiSettingsModal: document.getElementById('ai-settings-modal'),
    aiProvider: document.getElementById('ai-provider'),
    aiBaseUrl: document.getElementById('ai-base-url'),
    aiApiKey: document.getElementById('ai-api-key'),
    aiModel: document.getElementById('ai-model'),
    aiTemp: document.getElementById('ai-temp'),
    aiTempLabel: document.getElementById('ai-temp-label'),
    aiMaxTokens: document.getElementById('ai-max-tokens'),
    aiSystem: document.getElementById('ai-system'),
    aiTest: document.getElementById('ai-test'),
    aiSaveSettings: document.getElementById('ai-save-settings')
};

let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let savedBookmarks = [];
let savedHistory = [];
let downloads = [];
let blockedCount = 0;
let readerModeActive = false;
let closedTabs = [];
let pmMaster = null;
let pmEntries = [];
let settings = { forceDarkMode: true, searchEngine: 'google', autoSleep: true, verticalTabs: false, shields: true, startupMode: 'continue', startupPages: [] };
let usage = { totalTimeSec: 0, pagesLoaded: 0, adsBlocked: 0, startedAt: Date.now() };
let isIncognito = false;
let tabGroups = [];
let readingList = [];
let _lastGroupId = null;
let _sessionSaveTimer = null;
const TAB_SLEEP_MS = 5 * 60 * 1000;
const NEWTAB_URL = 'black-ui://newtab';

// --- Utilities ---

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function formatTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
}

function showToast(msg) {
    DOM.toast.textContent = msg;
    DOM.toast.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { DOM.toast.style.display = 'none'; }, 3000);
}

function buildSearchUrl(q) {
    const eng = {
        google: 'https://www.google.com/search?q=',
        bing: 'https://www.bing.com/search?q=',
        duckduckgo: 'https://duckduckgo.com/?q='
    };
    return (eng[settings.searchEngine] || eng.google) + encodeURIComponent(q);
}

// --- Tab System ---

function createTab(url = NEWTAB_URL, isPinned = false, activate = true) {
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
    if (!isPinned) tabEl.appendChild(closeEl);

    DOM.tabStrip.appendChild(tabEl);

    const wv = document.createElement('webview');
    wv.id = 'wv-' + tabId;
    wv.className = 'webview-hidden';
    wv.setAttribute('src', url);
    wv.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
    wv.setAttribute('preload', 'preload.js');
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('allowfullscreen', '');

    DOM.browserContainer.appendChild(wv);

    const tabObj = { id: tabId, el: tabEl, wv: wv, url: url, title: 'New Tab', isPinned: isPinned, lastActive: Date.now(), isSleeping: false, sleepTimer: null, crashEl: null, isCrashing: false, zoom: 1, groupId: null };
    tabs.push(tabObj);

    wv.addEventListener('crashed', () => showTabCrash(tabObj));
    wv.addEventListener('dom-ready', () => {
        hideTabCrash(tabObj);
        try { tabObj.wv.setZoomFactor(tabObj.zoom); } catch (e) {}
    });

    setupTabEvents(tabObj);
    if (activate) switchTab(tabId);
    renderGroupChips();
    saveSessionSoon();
    return tabObj;
}

function setupTabEvents(tab) {
    tab.el.addEventListener('mousedown', (e) => {
        if (e.button === 0 && !e.target.classList.contains('tab-close')) switchTab(tab.id);
        if (e.button === 1) closeTab(tab.id);
    });

    const closeBtn = tab.el.querySelector('.tab-close');
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.id); });

    const audioBtn = tab.el.querySelector('.tab-audio');
    audioBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudioMute(tab); });

    tab.el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showTabContextMenu(e.clientX, e.clientY, tab.id);
    });

    let tooltipTimeout;
    tab.el.addEventListener('mouseenter', (e) => {
        tooltipTimeout = setTimeout(() => {
            DOM.tabTooltip.textContent = `${tab.title} — ${tab.url}${tab.isSleeping ? ' (Sleeping)' : ''}`;
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
        if (activeTabId === tab.id) {
            DOM.loadingBar.style.display = 'block';
            DOM.btnReload.innerHTML = '<span class="material-icons-round">close</span>';
        }
    });

    tab.wv.addEventListener('did-stop-loading', () => {
        if (tab.isSleeping) return;
        if (activeTabId === tab.id) {
            DOM.loadingBar.style.display = 'none';
            DOM.btnReload.innerHTML = '<span class="material-icons-round">refresh</span>';
            DOM.urlInput.value = cleanUrlBar(tab.wv.getURL());
            updateNavButtons();
            checkBookmarkStatus();
        }
        tab.url = tab.wv.getURL();
        tab.title = tab.wv.getTitle() || tab.url;
        tab.el.querySelector('.tab-title').textContent = tab.title;
        addToHistory(tab.url, tab.title);
        saveSessionSoon();
    });

    tab.wv.addEventListener('did-navigate', (e) => {
        if (tab.isSleeping) return;
        tab.url = e.url || tab.wv.getURL();
        if (activeTabId === tab.id) {
            DOM.urlInput.value = cleanUrlBar(tab.url);
            updateNavButtons();
            checkBookmarkStatus();
        }
        if (tab.url.startsWith('http')) usage.pagesLoaded++;
        readerModeActive = false;
        saveSessionSoon();
    });

    tab.wv.addEventListener('page-title-updated', (e) => {
        tab.title = e.title;
        tab.el.querySelector('.tab-title').textContent = e.title;
    });

    tab.wv.addEventListener('page-favicon-updated', (e) => {
        if (e.favicons && e.favicons.length > 0) {
            tab.el.querySelector('.tab-favicon').src = e.favicons[0];
        }
    });

    tab.wv.addEventListener('update-target-url', (e) => {
        if (activeTabId === tab.id) DOM.sbLoadingUrl.textContent = e.url;
    });

    tab.wv.addEventListener('did-fail-load', (e) => {
        if (e.errorCode !== -3) { // ignore ERR_ABORTED
            showToast('Failed to load: ' + e.errorDescription);
        }
    });

    tab.wv.addEventListener('found-in-page', (e) => {
        if (e.result) {
            DOM.findCount.textContent = e.result.matches > 0
                ? (e.result.activeMatchOrdinal + 1) + '/' + e.result.matches
                : '0/0';
        }
    });

    tab.wv.addEventListener('media-started-playing', () => { tab.el.classList.add('audible'); updateMediaHUD(); });
    tab.wv.addEventListener('media-paused', () => { tab.el.classList.remove('audible'); updateMediaHUD(); });

    // HTML5 Drag and Drop for reordering
    tab.el.draggable = true;
    tab.el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', tab.id); });
    tab.el.addEventListener('dragover', (e) => {
        e.preventDefault();
        tab.el.classList.add('tab-drag-indicator');
        // Vertical parity: auto-scroll the strip while dragging near its edges
        if (document.body.classList.contains('vertical-tabs')) {
            const r = DOM.tabStrip.getBoundingClientRect();
            if (e.clientY < r.top + 60) DOM.tabStrip.scrollTop -= 14;
            else if (e.clientY > r.bottom - 60) DOM.tabStrip.scrollTop += 14;
        }
    });
    tab.el.addEventListener('dragleave', () => { tab.el.classList.remove('tab-drag-indicator'); });
    tab.el.addEventListener('drop', (e) => {
        e.preventDefault();
        tab.el.classList.remove('tab-drag-indicator');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== tab.id) {
            const draggedTab = tabs.find(t => t.id === draggedId);
            if (draggedTab) {
                DOM.tabStrip.insertBefore(draggedTab.el, tab.el);
                tabs = tabs.filter(t => t.id !== draggedId);
                const dropIdx = tabs.findIndex(t => t.id === tab.id);
                tabs.splice(dropIdx, 0, draggedTab);
                renderGroupChips();
                saveSessionSoon();
            }
        }
    });
}

function switchTab(tabId) {
    if (activeTabId) {
        const oldTab = tabs.find(t => t.id === activeTabId);
        if (oldTab) {
            oldTab.el.classList.remove('active');
            oldTab.wv.classList.add('webview-hidden');
            oldTab.lastActive = Date.now();
            resetSleepTimer(oldTab);
        }
    }

    activeTabId = tabId;
    const newTab = tabs.find(t => t.id === tabId);

    if (newTab.isSleeping) wakeTab(newTab);
    if (newTab.sleepTimer) clearTimeout(newTab.sleepTimer);
    if (newTab.crashEl) newTab.crashEl.style.display = newTab.isCrashing ? 'flex' : 'none';

    newTab.el.classList.add('active');
    newTab.wv.classList.remove('webview-hidden');
    safeSetZoom(newTab.wv, newTab.zoom);
    if (document.body.classList.contains('vertical-tabs')) newTab.el.scrollIntoView({ block: 'nearest' });

    DOM.urlInput.value = cleanUrlBar(wvGet(newTab.wv, 'getURL') || newTab.url);
    updateNavButtons();
    checkBookmarkStatus();
    updateZoomLabel();
    saveSessionSoon();
}

function closeTab(tabId) {
    const tabIdx = tabs.findIndex(t => t.id === tabId);
    if (tabIdx === -1) return;

    const tab = tabs[tabIdx];
    if (tab.sleepTimer) clearTimeout(tab.sleepTimer);
    closedTabs.push({ url: tab.url, title: tab.title, pinned: tab.isPinned });
    if (closedTabs.length > 20) closedTabs.shift();

    tab.el.remove();
    tab.wv.remove();
    if (tab.crashEl) tab.crashEl.remove();
    tabs.splice(tabIdx, 1);

    if (tabs.length === 0) {
        if (window.api && window.api.closeWindow) window.api.closeWindow();
        else window.close();
    } else if (activeTabId === tabId) {
        const nextTab = tabs[tabIdx] || tabs[tabIdx - 1];
        switchTab(nextTab.id);
    }
    renderGroupChips();
    saveSessionSoon();
}

function reopenClosedTab() {
    const t = closedTabs.pop();
    if (!t) return showToast('No closed tabs to reopen');
    createTab(t.url, t.pinned);
}

function safeSetZoom(wv, factor) {
    try { wv.setZoomFactor(factor); } catch (e) {}
}

function wvGet(wv, method, fallback) {
    try { const v = wv[method](); return v === undefined ? fallback : v; } catch (e) { return fallback; }
}

function getActiveTab() { return tabs.find(t => t.id === activeTabId); }
function getActiveWebview() { const t = getActiveTab(); return t ? t.wv : null; }

// Internal pages (black-ui://newtab, warning, about:blank) are shown as an empty
// address bar, like chrome://newtab in Chrome/Edge.
function cleanUrlBar(url) {
    if (!url) return '';
    if (url.startsWith('black-ui:') || url === 'about:blank' || url === 'about:blank/') return '';
    return url;
}

function resetSleepTimer(tab) {
    if (tab.sleepTimer) clearTimeout(tab.sleepTimer);
    if (settings.autoSleep !== false && !tab.el.classList.contains('audible')) {
        tab.sleepTimer = setTimeout(() => markTabSleeping(tab), TAB_SLEEP_MS);
    }
}

function markTabSleeping(tab) {
    if (tab.id === activeTabId) return;
    tab.isSleeping = true;
    tab.el.classList.add('sleeping');
    tab.wv.src = 'about:blank';
    saveSessionSoon();
}

function wakeTab(tab) {
    tab.isSleeping = false;
    tab.el.classList.remove('sleeping');
    tab.wv.src = tab.url;
    saveSessionSoon();
}

// ── Tab crash recovery (gov portals & heavy sites) ─────────────
function showTabCrash(tab) {
    if (tab.isCrashing) return;
    tab.isCrashing = true;
    tab.el.classList.add('crashed');
    try { tab.wv.classList.add('webview-hidden'); } catch (e) {}
    if (!tab.crashEl) {
        tab.crashEl = document.createElement('div');
        tab.crashEl.className = 'tab-crash-placeholder';
        tab.crashEl.innerHTML =
            '<span class="material-icons-round crash-icon">error_outline</span>' +
            '<div class="crash-title">This tab crashed</div>' +
            '<div class="crash-sub">The page ran out of memory. Reload it — your other tabs are safe.</div>' +
            '<div class="crash-actions">' +
            '<button class="crash-btn primary" id="crash-reload">Reload</button>' +
            '<button class="crash-btn" id="crash-close">Close tab</button>' +
            '</div>';
        tab.crashEl.querySelector('#crash-reload').addEventListener('click', () => reloadCrashedTab(tab));
        tab.crashEl.querySelector('#crash-close').addEventListener('click', () => closeTab(tab.id));
        DOM.browserContainer.appendChild(tab.crashEl);
    }
    tab.crashEl.style.display = 'flex';
    saveSessionSoon();
}

function hideTabCrash(tab) {
    if (!tab.isCrashing) return;
    tab.isCrashing = false;
    tab.el.classList.remove('crashed');
    if (tab.crashEl) tab.crashEl.style.display = 'none';
}

function reloadCrashedTab(tab) {
    hideTabCrash(tab);
    try { tab.wv.classList.remove('webview-hidden'); } catch (e) {}
    try { tab.wv.src = tab.url || 'black-ui://newtab'; } catch (e) {}
}

// Memory pressure: main asks us to sleep the least-recently-used background tab
if (window.api && window.api.onMemoryPressure) {
    window.api.onMemoryPressure((mb) => {
        const cands = tabs.filter(t => t.id !== activeTabId && !t.isSleeping && !t.isPinned && !t.isCrashing && !t.el.classList.contains('audible'));
        if (!cands.length) return;
        cands.sort((a, b) => (a.lastActive || 0) - (b.lastActive || 0));
        const victim = cands[0];
        markTabSleeping(victim);
        showToast('Memory ' + mb + ' MB — slept background tab: ' + (victim.title || victim.url || 'tab'));
    });
}

// ── Security Center (OSINT hub) & Great Sage security tools ────────────────
async function osintRun(type, param) {
    try { return await window.api.osintCheck(type, param); }
    catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
async function secRun(btn, resultEl, fn, done) {
    btn.disabled = true;
    btn.textContent = 'Checking…';
    resultEl.classList.remove('show', 'bad');
    const r = await fn();
    btn.disabled = false;
    btn.textContent = btn.dataset.label || 'Check';
    resultEl.classList.add('show');
    if (!r.ok) {
        resultEl.classList.add('bad');
        resultEl.textContent = 'Check failed (' + (r.error || 'unknown') + ') — the service may be offline.';
    } else {
        resultEl.textContent = done(r);
    }
    return r;
}
function secCard(icon, title, desc) {
    const card = document.createElement('div');
    card.className = 'sec-card';
    card.innerHTML =
        '<div class="sec-title"><span class="material-icons-round">' + icon + '</span>' + title + '</div>' +
        '<div class="sec-desc">' + desc + '</div>';
    return card;
}
async function renderSecurityHub(content) {
    content.innerHTML = '';
    const wrap = document.createElement('div');

    // 1. Local protection posture
    const posture = secCard('shield', 'Your protection right now', 'Black is defending you with these built-in layers.');
    let shields = null, advisor = null;
    if (window.api) {
        try { shields = await window.api.shieldsStatus(); } catch (e) {}
        try { advisor = await window.api.advisorStatus(); } catch (e) {}
    }
    const lines = [
        ['Shields (ad/tracker blocking)', shields && shields.enabled ? 'ON — ' + (shields.engine === 'native' ? 'C++ engine' : 'active') : 'OFF'],
        ['Site Advisor (dangerous sites)', 'ON — ' + (advisor ? advisor.rules : 0) + ' rules'],
        ['Dangerous sites blocked today', advisor ? advisor.blocks : 0],
        ['HTTPS upgrade everywhere', 'ON'],
        ['Tab sleep (RAM protection)', settings.autoSleep !== false ? 'ON' : 'OFF']
    ];
    lines.forEach(l => {
        const row = document.createElement('div');
        row.className = 'sec-row';
        row.style.fontSize = '12px';
        row.style.justifyContent = 'space-between';
        row.innerHTML = '<span>' + esc(l[0]) + '</span><span style="color:var(--text-secondary)">' + esc(l[1]) + '</span>';
        posture.appendChild(row);
    });
    wrap.appendChild(posture);

    // 2. OSINT tools
    const tools = secCard('radar', 'OSINT self-check tools', 'Free, keyless, privacy-first — Great Sage can explain every result. "Check password" never sends your password: only the first 5 chars of its hash (k-anonymity).');

    const pwRow = document.createElement('div');
    pwRow.className = 'sec-row';
    const pwInput = document.createElement('input');
    pwInput.type = 'password';
    pwInput.className = 'sec-input';
    pwInput.placeholder = 'Password to test against known breaches';
    const pwBtn = document.createElement('button');
    pwBtn.className = 'sec-btn';
    pwBtn.dataset.label = 'Check password';
    pwBtn.textContent = 'Check password';
    const pwRes = document.createElement('div');
    pwRes.className = 'sec-result';
    pwRow.appendChild(pwInput);
    pwRow.appendChild(pwBtn);
    tools.appendChild(pwRow);
    tools.appendChild(pwRes);
    pwBtn.addEventListener('click', () => secRun(pwBtn, pwRes, () => osintRun('pwned', pwInput.value), (r) => {
        if (r.pwned) { pwRes.classList.add('bad'); return 'LEAKED — this password appears in ' + r.count + ' known data breaches. Change it now everywhere it is used.'; }
        return 'GOOD — not found in the Pwned Passwords breach database.';
    }));

    const ipBtn = document.createElement('button');
    ipBtn.className = 'sec-btn';
    ipBtn.dataset.label = 'My IP & VPN';
    ipBtn.textContent = 'My IP & VPN';
    const ipRes = document.createElement('div');
    ipRes.className = 'sec-result';
    tools.appendChild(ipBtn);
    tools.appendChild(ipRes);
    ipBtn.addEventListener('click', () => secRun(ipBtn, ipRes, () => osintRun('ip'), (r) =>
        'Your public IP: ' + r.ip + '\nLocation: ' + r.city + ', ' + r.region + ', ' + r.country +
        '\nNetwork: ' + r.org + (r.hostname ? '\nHostname: ' + r.hostname : '') +
        '\n\nTip: if your VPN is on, the location above should NOT match your real city.'
    ));

    const dnsRow = document.createElement('div');
    dnsRow.className = 'sec-row';
    const dnsInput = document.createElement('input');
    dnsInput.className = 'sec-input';
    dnsInput.placeholder = 'Domain health check — e.g. gst.gov.in';
    const dnsBtn = document.createElement('button');
    dnsBtn.className = 'sec-btn';
    dnsBtn.dataset.label = 'Check domain';
    dnsBtn.textContent = 'Check domain';
    const dnsRes = document.createElement('div');
    dnsRes.className = 'sec-result';
    dnsRow.appendChild(dnsInput);
    dnsRow.appendChild(dnsBtn);
    tools.appendChild(dnsRow);
    tools.appendChild(dnsRes);
    dnsBtn.addEventListener('click', () => secRun(dnsBtn, dnsRes, () => osintRun('dns', dnsInput.value.trim()), (r) => {
        if (r.nxdomain) { dnsRes.classList.add('bad'); return '"' + r.host + '" does not resolve (NXDOMAIN) — the site is offline or the name is bogus. Beware lookalike domains.';
        }
        return '"' + r.host + '" resolves to ' + (r.answers || []).map(a => a.data).join(', ') + '.';
    }));

    const askRow = document.createElement('div');
    askRow.className = 'sec-row';
    askRow.style.justifyContent = 'flex-end';
    const askBtn = document.createElement('button');
    askBtn.className = 'sec-btn';
    askBtn.style.borderColor = 'rgba(139,92,246,0.4)';
    askBtn.style.color = '#b9a6ff';
    askBtn.textContent = 'Ask Great Sage to explain';
    const askRes = document.createElement('div');
    askRes.className = 'sec-result';
    askRow.appendChild(askBtn);
    tools.appendChild(askRow);
    tools.appendChild(askRes);
    askBtn.addEventListener('click', async () => {
        const parts = [];
        if (pwRes.textContent && pwRes.classList.contains('show')) parts.push('Password check: ' + pwRes.textContent);
        if (ipRes.textContent && ipRes.classList.contains('show')) parts.push('IP check: ' + ipRes.textContent);
        if (dnsRes.textContent && dnsRes.classList.contains('show')) parts.push('DNS check: ' + dnsRes.textContent);
        if (!parts.length) { askRes.classList.add('show', 'bad'); askRes.textContent = 'Run at least one check first.'; return; }
        askRes.classList.remove('show', 'bad');
        toggleAiPanel();
        await new Promise(r => setTimeout(r, 340));
        aiSend('These are my OSINT security check results:\n' + parts.join('\n') + '\n\nExplain in simple friendly language what each means, whether I am at risk, and give me 3 concrete actions to stay safe.');
    });
    wrap.appendChild(tools);

    content.appendChild(wrap);
}

// Great Sage security suggestion chips (Windows Copilot style)
document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
        const kind = chip.dataset.chip;
        if (kind === 'site') {
            const t = getActiveTab();
            const url = (t && t.url && !t.url.startsWith('black-ui:') && t.url !== 'about:blank') ? t.url : '';
            if (!url) { showToast('Open a webpage first'); return; }
            let host = '';
            try { host = new URL(url).hostname; } catch (e) {}
            let dns = '';
            const d = await osintRun('dns', host);
            if (d.ok && !d.nxdomain) dns = ' (resolves to ' + (d.answers || []).map(a => a.data).join(', ') + ')';
            aiSend('Security review this URL: ' + url + '\nOSINT note: "' + host + '" ' + (dns || 'does not resolve') + '.\nIs this site safe? Check the domain name for typos/impersonation, HTTPS, and typical scam patterns, then give a clear verdict and safe-browsing tips.');
        } else if (kind === 'exposure') {
            const ip = await osintRun('ip');
            aiSend(ip.ok
                ? 'My public IP info from a live OSINT check: IP ' + ip.ip + ', ' + ip.city + ', ' + ip.region + ', ' + ip.country + ', network ' + ip.org + '.\nExplain what this reveals about me, whether it looks like my VPN is hiding me, and how I can reduce my digital footprint.'
                : 'My IP OSINT check failed (' + (ip.error || 'offline') + '). Explain how someone could use my IP against me and how to protect myself anyway.');
        } else if (kind === 'threats') {
            aiSend('Give me a concise, friendly briefing on the most common active cyber threats for everyday users right now: phishing/OTP scams, fake government portals (GST, income tax, DigiLocker), malware and identity theft. For each: how to spot it, and one practical defense. Keep it practical.');
        } else if (kind === 'advisor') {
            let advisor = null;
            try { advisor = await window.api.advisorStatus(); } catch (e) {}
            aiSend(advisor
                ? 'My browser has a built-in Site Advisor (McAfee-style) that checked ' + advisor.checks + ' navigations and blocked ' + advisor.blocks + ' dangerous sites using ' + advisor.rules + ' blocklist rules. Explain how this protects me and what extra habits make me safer online.'
                : 'Explain how browser site-advisor protection works (like McAfee WebAdvisor) and why I should use it.');
        }
    });
});

// Windows-style notifications from Great Sage
function securityNotify(title, body) {
    if (window.api && window.api.securityNotify) window.api.securityNotify(title, body).catch(() => {});
}
if (window.api && window.api.onAdvisorBlocked) {
    window.api.onAdvisorBlocked((d) => {
        let host = '';
        try { host = new URL(d.url).hostname; } catch (e) {}
        DOM.urlIcon.style.color = '#ff6b81';
        DOM.urlIcon.title = 'Site Advisor blocked ' + d.category + ': ' + host;
        showToast('Site Advisor blocked a dangerous site (' + d.category + '): ' + host);
        securityNotify('Great Sage Security Alert', 'Site Advisor blocked a ' + d.category + ' site: ' + host + '. This was likely a scam or phishing attempt.');
        setTimeout(() => { DOM.urlIcon.style.color = ''; }, 8000);
    });
}
document.getElementById('mi-block-site').addEventListener('click', async () => {
    const t = getActiveTab();
    if (!t || !t.url || t.url.startsWith('black-ui:') || t.url === 'about:blank') return showToast('Open a webpage first');
    let ok = false;
    try { ok = await window.api.advisorBlock(t.url); } catch (e) {}
    showToast(ok ? 'Domain blocked — Site Advisor will warn from now on' : 'This site is already blocked or cannot be blocked');
});
document.getElementById('mi-security').addEventListener('click', () => openSidebarView('security'));

function toggleAudioMute(tab) {
    const isMuted = wvGet(tab.wv, 'isAudioMuted', false);
    try { tab.wv.setAudioMuted(!isMuted); } catch (e) {}
    tab.el.querySelector('.tab-audio').textContent = !isMuted ? 'volume_off' : 'volume_up';
}

// --- Layout: Vertical / Horizontal Tabs ---

// Vertical parity polish: hover-expand the collapsed strip (Edge style)
DOM.tabStripContainer.addEventListener('mouseenter', () => {
    if (document.body.classList.contains('collapsed')) document.body.classList.add('tab-hover');
});
DOM.tabStripContainer.addEventListener('mouseleave', () => {
    document.body.classList.remove('tab-hover');
});

function applyLayout(vertical, collapsed) {
    document.body.classList.toggle('vertical-tabs', vertical);
    document.body.classList.toggle('collapsed', vertical && collapsed);
    settings.verticalTabs = vertical;
    if (window.api) window.api.saveSettings(Object.assign({}, settings, { verticalTabs: vertical }));
    updateLayoutMenuItem();
}

function toggleLayout() {
    const vertical = document.body.classList.contains('vertical-tabs');
    if (!vertical) applyLayout(true, false);
    else if (!document.body.classList.contains('collapsed')) applyLayout(true, true);
    else applyLayout(false, false);
    showToast(document.body.classList.contains('vertical-tabs')
        ? (document.body.classList.contains('collapsed') ? 'Vertical tabs collapsed' : 'Vertical tabs enabled')
        : 'Horizontal tabs enabled');
}

function updateLayoutMenuItem() {
    const item = document.getElementById('mi-layout');
    if (!item) return;
    const textNode = item.childNodes[1];
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = document.body.classList.contains('vertical-tabs') ? 'Horizontal Tabs' : 'Vertical Tabs';
    }
}

// --- Navigation ---

DOM.urlInput.addEventListener('focus', () => { DOM.urlInput.select(); });
DOM.urlInput.addEventListener('blur', () => {
    const wv = getActiveWebview();
    if (wv) {
        const u = wvGet(wv, 'getURL', '');
        try {
            const url = new URL(u);
            if (url.protocol.startsWith('http')) DOM.urlInput.value = url.hostname;
            else DOM.urlInput.value = u;
        } catch (e) { DOM.urlInput.value = u; }
    }
});

DOM.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        let val = DOM.urlInput.value.trim();
        if (!val) return;
        DOM.urlSuggestions.style.display = 'none';

        let url = val;
        if (val.startsWith('black-ui://') || val.startsWith('about:')) url = val;
        else if (/^(https?:\/\/|[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$)/i.test(val)) {
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        } else if (!val.includes('.')) url = buildSearchUrl(val);
        else url = 'https://' + val;

        const wv = getActiveWebview();
        if (wv) wv.loadURL(url);
    } else {
        showSuggestions(DOM.urlInput.value);
    }
});

DOM.btnBack.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wvGet(wv, 'canGoBack', false)) wv.goBack(); });
DOM.btnFwd.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wvGet(wv, 'canGoForward', false)) wv.goForward(); });
DOM.btnReload.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (wv) {
        if (wv.isLoading()) wv.stop();
        else wv.reload();
    }
});
DOM.btnHome.addEventListener('click', () => {
    const t = getActiveTab();
    if (t) t.wv.src = NEWTAB_URL;
    DOM.urlInput.blur();
});

function updateNavButtons() {
    const wv = getActiveWebview();
    if (!wv) return;
    DOM.btnBack.style.opacity = wvGet(wv, 'canGoBack', false) ? '1' : '0.5';
    DOM.btnFwd.style.opacity = wvGet(wv, 'canGoForward', false) ? '1' : '0.5';
}

// --- Suggestions ---

function showSuggestions(query) {
    if (query.length < 2) { DOM.urlSuggestions.style.display = 'none'; return; }
    const matches = [];
    const q = query.toLowerCase();
    savedBookmarks.forEach(b => { if (b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) matches.push({ ...b, type: 'bookmark' }); });
    savedHistory.forEach(h => { if (h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)) matches.push({ ...h, type: 'history' }); });

    const unique = [];
    const urls = new Set();
    for (let m of matches) {
        if (!urls.has(m.url)) { urls.add(m.url); unique.push(m); }
        if (unique.length >= 5) break;
    }

    if (unique.length > 0) {
        DOM.urlSuggestions.innerHTML = '';
        unique.forEach(m => {
            const div = document.createElement('div');
            div.className = 'url-sugg-item';
            div.innerHTML = `<span class="material-icons-round">${m.type === 'bookmark' ? 'star' : 'history'}</span><div><div style="font-weight:500">${esc(m.title)}</div><div style="font-size:11px;opacity:0.7">${esc(m.url)}</div></div>`;
            div.addEventListener('click', () => {
                DOM.urlInput.value = m.url;
                DOM.urlSuggestions.style.display = 'none';
                const wv = getActiveWebview();
                if (wv) wv.loadURL(m.url);
            });
            DOM.urlSuggestions.appendChild(div);
        });
        DOM.urlSuggestions.style.display = 'flex';
    } else {
        DOM.urlSuggestions.style.display = 'none';
    }
}

document.addEventListener('click', (e) => {
    if (!DOM.urlSuggestions.contains(e.target) && e.target !== DOM.urlInput) DOM.urlSuggestions.style.display = 'none';
    DOM.mainMenu.style.display = 'none';
    DOM.tabContextMenu.style.display = 'none';
    const zoomRow = document.getElementById('menu-zoom');
    if (zoomRow && !zoomRow.contains(e.target)) zoomRow.style.display = 'none';
});

// --- Menus & Sidebars ---

DOM.btnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.mainMenu.style.display = DOM.mainMenu.style.display === 'block' ? 'none' : 'block';
});

document.querySelectorAll('.rail-btn').forEach(btn => {
    if (btn.id) return; // skip special buttons
    btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        openSidebarView(panel);
    });
});
DOM.btnSbClose.addEventListener('click', () => { DOM.sidebarPanel.classList.remove('open'); });

// ── AI Assistant (Great Sage) ─────────────────────────────────
const AI_PRESETS = {
    opencode:   { baseUrl: 'https://opencode.ai/zen/v1',  model: 'deepseek-v4-flash-free' },
    openai:     { baseUrl: 'https://api.openai.com/v1',  model: 'gpt-4o-mini' },
    deepseek:   { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat' },
    ollama:     { baseUrl: 'http://localhost:11434/v1',  model: 'llama3.1' },
    custom:     { baseUrl: '', model: '' }
};
const DEFAULT_SAGE_PROMPT = 'You are the Great Sage — a calm, precise, analytical intelligence. Answer concisely and accurately, reason step by step for complex questions, and stay helpful, neutral and reliable.';
let aiConfig = { provider: 'opencode', baseUrl: AI_PRESETS.opencode.baseUrl, apiKey: '', model: AI_PRESETS.opencode.model, temperature: 0.7, maxTokens: 1024, systemPrompt: DEFAULT_SAGE_PROMPT };
let aiHistory = [];
let aiStreaming = false;
let aiLastBubble = null;

function aiSetModelLabel() {
    const names = { opencode: 'OpenCode Zen', openai: 'OpenAI', deepseek: 'DeepSeek', openrouter: 'OpenRouter', ollama: 'Ollama (local)', custom: 'Custom' };
    DOM.aiModelLabel.textContent = aiConfig.model ? (names[aiConfig.provider] || 'AI') + ' · ' + aiConfig.model : 'Not configured';
}
function aiAppendMsg(role, text, typing) {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg ' + role + (typing ? ' typing' : '');
    bubble.textContent = text || '';
    DOM.aiMessages.appendChild(bubble);
    DOM.aiMessages.scrollTop = DOM.aiMessages.scrollHeight;
    return bubble;
}
function aiShowWelcome() {
    DOM.aiMessages.innerHTML = '<div class="ai-welcome"><span class="material-icons-round ai-welcome-icon">auto_awesome</span><div>I am the Great Sage.</div><div class="ai-welcome-sub">Ask me anything. Configure your AI provider via the settings button above.</div></div>';
}
function toggleAiPanel() {
    DOM.aiPanel.classList.toggle('open');
    if (DOM.aiPanel.classList.contains('open')) setTimeout(() => DOM.aiInput.focus(), 320);
}
async function aiSend(text) {
    if (!text.trim()) return;
    if (!aiConfig.baseUrl) { showToast('Configure your AI provider first'); openAiSettings(); return; }
    aiAppendMsg('user', text);
    aiHistory.push({ role: 'user', content: text });
    aiLastBubble = aiAppendMsg('sage', '', true);
    aiStreaming = true;
    DOM.aiSend.classList.add('stop');
    DOM.aiSend.innerHTML = '<span class="material-icons-round">stop</span>';
    const messages = [{ role: 'system', content: aiConfig.systemPrompt || DEFAULT_SAGE_PROMPT }].concat(aiHistory.slice(-24));
    try {
        const res = await window.api.aiChatStart({ baseUrl: aiConfig.baseUrl, apiKey: aiConfig.apiKey, model: aiConfig.model, messages, temperature: aiConfig.temperature, maxTokens: aiConfig.maxTokens, stream: true });
        aiLastBubble.classList.remove('typing');
        if (!res.ok) {
            aiLastBubble.classList.add('error');
            aiLastBubble.textContent = res.stopped ? 'Stopped.' : 'AI request failed' + (res.status ? ' (HTTP ' + res.status + ')' : '') + (res.detail ? ': ' + res.detail : '');
        } else {
            aiLastBubble.textContent = res.full || '(empty response)';
            if (res.full) aiHistory.push({ role: 'assistant', content: res.full });
        }
    } catch (err) {
        aiLastBubble.classList.remove('typing');
        aiLastBubble.classList.add('error');
        aiLastBubble.textContent = 'AI request failed: ' + ((err && err.message) || err);
    } finally {
        aiStreaming = false;
        DOM.aiSend.classList.remove('stop');
        DOM.aiSend.innerHTML = '<span class="material-icons-round">send</span>';
        DOM.aiMessages.scrollTop = DOM.aiMessages.scrollHeight;
    }
}
function aiStop() {
    if (window.api.aiChatStop) window.api.aiChatStop();
    if (aiLastBubble) { aiLastBubble.classList.remove('typing'); aiLastBubble.textContent = (aiLastBubble.textContent || '').replace(/\\s+$/, '') + ' — stopped'; }
    aiStreaming = false;
    DOM.aiSend.classList.remove('stop');
    DOM.aiSend.innerHTML = '<span class="material-icons-round">send</span>';
}
function openAiSettings() {
    DOM.aiProvider.value = aiConfig.provider;
    DOM.aiBaseUrl.value = aiConfig.baseUrl;
    DOM.aiApiKey.value = aiConfig.apiKey;
    DOM.aiModel.value = aiConfig.model;
    DOM.aiTemp.value = aiConfig.temperature;
    DOM.aiTempLabel.textContent = aiConfig.temperature;
    DOM.aiMaxTokens.value = aiConfig.maxTokens;
    DOM.aiSystem.value = aiConfig.systemPrompt;
    DOM.aiSettingsModal.style.display = 'flex';
}
function closeAiSettings() { DOM.aiSettingsModal.style.display = 'none'; }
function saveAiConfig() {
    aiConfig = Object.assign(aiConfig, {
        provider: DOM.aiProvider.value,
        baseUrl: DOM.aiBaseUrl.value.trim().replace(/\/+$/, ''),
        apiKey: DOM.aiApiKey.value.trim(),
        model: DOM.aiModel.value.trim(),
        temperature: parseFloat(DOM.aiTemp.value),
        maxTokens: parseInt(DOM.aiMaxTokens.value, 10) || 1024,
        systemPrompt: DOM.aiSystem.value.trim()
    });
    settings.ai = aiConfig;
    window.api.saveSettings(settings);
    aiSetModelLabel();
    showToast('AI provider saved');
}

DOM.btnAi.addEventListener('click', toggleAiPanel);
DOM.aiBtnClose.addEventListener('click', () => DOM.aiPanel.classList.remove('open'));
DOM.aiBtnSettings.addEventListener('click', openAiSettings);
DOM.aiBtnClear.addEventListener('click', () => {
    aiHistory = [];
    aiShowWelcome();
});
DOM.aiProvider.addEventListener('change', () => {
    const p = AI_PRESETS[DOM.aiProvider.value];
    if (p) { DOM.aiBaseUrl.value = p.baseUrl; if (p.model) DOM.aiModel.value = p.model; }
});
DOM.aiTemp.addEventListener('input', () => { DOM.aiTempLabel.textContent = DOM.aiTemp.value; });
DOM.aiSaveSettings.addEventListener('click', saveAiConfig);
DOM.aiSend.addEventListener('click', () => { if (aiStreaming) aiStop(); else aiSend(DOM.aiInput.value); });
DOM.aiInput.addEventListener('input', () => {
    DOM.aiInput.style.height = 'auto';
    DOM.aiInput.style.height = Math.min(DOM.aiInput.scrollHeight, 120) + 'px';
});
DOM.aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(DOM.aiInput.value); DOM.aiInput.value = ''; DOM.aiInput.style.height = 'auto'; }
});
document.querySelectorAll('[data-close="ai-settings-modal"]').forEach(el => el.addEventListener('click', closeAiSettings));
DOM.aiTest.addEventListener('click', async () => {
    const base = DOM.aiBaseUrl.value.trim().replace(/\/+$/, '');
    if (!base) { showToast('Enter a base URL first'); return; }
    showToast('Testing connection…');
    const res = await window.api.aiChatStart({ baseUrl: base, apiKey: DOM.aiApiKey.value.trim(), model: DOM.aiModel.value.trim(), messages: [{ role: 'user', content: 'ping' }], maxTokens: 4, temperature: 0, stream: false });
    if (res.ok && res.full) showToast('Connected ✓ — model replied');
    else showToast('Connection failed' + (res.status ? ' (HTTP ' + res.status + ')' : '') + (res.detail ? ': ' + res.detail : ''));
});
if (window.api && window.api.onAiChunk) {
    window.api.onAiChunk((d) => {
        if (aiStreaming && aiLastBubble && d && d.text) {
            aiLastBubble.textContent += d.text;
            DOM.aiMessages.scrollTop = DOM.aiMessages.scrollHeight;
        }
    });
}

function openSidebarView(viewName) {
    DOM.sidebarPanel.classList.add('open');
    DOM.sbTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    DOM.sbContent.innerHTML = '';

    if (viewName === 'bookmarks') renderBookmarks(DOM.sbContent);
    else if (viewName === 'history') renderHistory(DOM.sbContent);
    else if (viewName === 'downloads') renderDownloads(DOM.sbContent);
    else if (viewName === 'reading') renderReading(DOM.sbContent);
    else if (viewName === 'security') renderSecurityHub(DOM.sbContent);
    else if (viewName === 'notes') {
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

// --- Bookmarks & History (file-based IPC with localStorage fallback) ---

async function loadBookmarks() {
    try {
        if (window.api && window.api.loadBookmarks) {
            const d = await window.api.loadBookmarks();
            if (Array.isArray(d)) { savedBookmarks = d; return; }
        }
    } catch (e) {}
    try { savedBookmarks = JSON.parse(localStorage.getItem('black_bookmarks') || '[]'); } catch (e) { savedBookmarks = []; }
}

function saveBookmarks() {
    localStorage.setItem('black_bookmarks', JSON.stringify(savedBookmarks));
    if (window.api && window.api.saveBookmarks) window.api.saveBookmarks(savedBookmarks);
}

async function loadHistory() {
    try {
        if (window.api && window.api.loadHistory) {
            const d = await window.api.loadHistory();
            if (Array.isArray(d)) { savedHistory = d; return; }
        }
    } catch (e) {}
    try { savedHistory = JSON.parse(localStorage.getItem('black_history') || '[]'); } catch (e) { savedHistory = []; }
}

function saveHistory() {
    if (isIncognito) return;
    localStorage.setItem('black_history', JSON.stringify(savedHistory));
    if (window.api && window.api.saveHistory) window.api.saveHistory(savedHistory);
}

function addToHistory(url, title) {
    if (!url || url.startsWith('black-ui:') || url === 'about:blank') return;
    savedHistory = savedHistory.filter(h => h.url !== url);
    savedHistory.unshift({ url, title, time: Date.now() });
    if (savedHistory.length > 1000) savedHistory.pop();
    saveHistory();
}

DOM.btnBookmark.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (!wv) return;
    const url = wvGet(wv, 'getURL', '');
    if (!url || url.startsWith('black-ui:') || url === 'about:blank') return showToast('Cannot bookmark this page');
    const title = wvGet(wv, 'getTitle') || url;
    const idx = savedBookmarks.findIndex(b => b.url === url);
    if (idx > -1) {
        savedBookmarks.splice(idx, 1);
        DOM.btnBookmark.textContent = 'star_border';
        DOM.btnBookmark.style.color = '';
        showToast('Bookmark removed');
    } else {
        savedBookmarks.push({ url, title });
        DOM.btnBookmark.textContent = 'star';
        DOM.btnBookmark.style.color = 'var(--accent-warm)';
        showToast('Bookmark added');
    }
    saveBookmarks();
    if (DOM.sidebarPanel.classList.contains('open') && DOM.sbTitle.textContent === 'Bookmarks') openSidebarView('bookmarks');
});

function checkBookmarkStatus() {
    const wv = getActiveWebview();
    if (!wv) return;
    const url = wvGet(wv, 'getURL', '');
    const isSaved = savedBookmarks.some(b => b.url === url);
    DOM.btnBookmark.textContent = isSaved ? 'star' : 'star_border';
    DOM.btnBookmark.style.color = isSaved ? 'var(--accent-warm)' : '';
}

function renderBookmarks(container) {
    container.innerHTML = '';
    if (!savedBookmarks.length) {
        const e = document.createElement('div');
        e.className = 'sb-empty';
        e.textContent = 'No bookmarks yet. Press Ctrl+D on any page to save one.';
        container.appendChild(e);
        return;
    }
    savedBookmarks.forEach(b => {
        const div = document.createElement('div');
        div.className = 'bm-card';
        div.innerHTML = `<div><div class="bm-title">${esc(b.title)}</div><div class="bm-url">${esc(b.url)}</div></div>`;
        const del = document.createElement('span');
        del.className = 'material-icons-round bm-del';
        del.textContent = 'close';
        del.title = 'Remove bookmark';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            savedBookmarks = savedBookmarks.filter(x => x.url !== b.url);
            saveBookmarks();
            renderBookmarks(container);
            checkBookmarkStatus();
        });
        div.appendChild(del);
        div.addEventListener('click', () => {
            const wv = getActiveWebview();
            if (wv) wv.loadURL(b.url);
        });
        container.appendChild(div);
    });
}

function renderHistory(container) {
    container.innerHTML = '';
    if (!savedHistory.length) {
        const e = document.createElement('div');
        e.className = 'sb-empty';
        e.textContent = 'No browsing history yet.';
        container.appendChild(e);
        return;
    }
    savedHistory.forEach(h => {
        const div = document.createElement('div');
        div.className = 'bm-card';
        div.innerHTML = `<div><div class="bm-title">${esc(h.title)}</div><div class="bm-url">${esc(h.url)}</div></div>`;
        const del = document.createElement('span');
        del.className = 'material-icons-round bm-del';
        del.textContent = 'close';
        del.title = 'Remove from history';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            savedHistory = savedHistory.filter(x => x.url !== h.url);
            saveHistory();
            renderHistory(container);
        });
        div.appendChild(del);
        div.addEventListener('click', () => {
            const wv = getActiveWebview();
            if (wv) wv.loadURL(h.url);
        });
        container.appendChild(div);
    });
}

// --- Reading List (Edge-style) ---

async function loadReadingList() {
    try {
        if (window.api && window.api.loadReading) {
            const d = await window.api.loadReading();
            if (Array.isArray(d)) { readingList = d; return; }
        }
    } catch (e) {}
    try { readingList = JSON.parse(localStorage.getItem('black_reading') || '[]'); } catch (e) { readingList = []; }
}

function saveReadingList() {
    localStorage.setItem('black_reading', JSON.stringify(readingList));
    if (window.api && window.api.saveReading) window.api.saveReading(readingList);
}

function renderReading(container) {
    container.innerHTML = '';
    const act = document.createElement('div');
    act.className = 'sb-action';
    const addBtn = document.createElement('button');
    addBtn.className = 'mbtn small';
    addBtn.textContent = '+ Save current page';
    addBtn.addEventListener('click', () => {
        const wv = getActiveWebview();
        const url = wv ? wvGet(wv, 'getURL', '') : '';
        if (!url || url.startsWith('black-ui:') || url === 'about:blank') {
            showToast('Nothing to save — open a webpage first');
            return;
        }
        if (readingList.some(r => r.url === url)) { showToast('Already in reading list'); return; }
        readingList.unshift({ url, title: (getActiveTab() || {}).title || url, time: Date.now() });
        saveReadingList();
        renderReading(container);
        showToast('Saved to reading list');
    });
    act.appendChild(addBtn);
    container.appendChild(act);

    if (!readingList.length) {
        const e = document.createElement('div');
        e.className = 'sb-empty';
        e.textContent = 'Reading list is empty. Save pages to read later.';
        container.appendChild(e);
        return;
    }
    readingList.forEach(r => {
        const div = document.createElement('div');
        div.className = 'rl-item';
        div.innerHTML = `<div><div class="rl-title">${esc(r.title)}</div><div class="rl-url">${esc(r.url)}</div></div>`;
        const del = document.createElement('span');
        del.className = 'material-icons-round rl-rm';
        del.textContent = 'close';
        del.title = 'Remove';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            readingList = readingList.filter(x => x.url !== r.url);
            saveReadingList();
            renderReading(container);
        });
        div.appendChild(del);
        div.addEventListener('click', () => {
            const wv = getActiveWebview();
            if (wv) wv.loadURL(r.url);
        });
        container.appendChild(div);
    });
}

// --- Downloads ---

function refreshDownloadsPanel() {
    if (DOM.sidebarPanel.classList.contains('open') && DOM.sbTitle.textContent === 'Downloads') {
        renderDownloads(DOM.sbContent);
    }
}

function renderDownloads(container) {
    container.innerHTML = '';
    if (!downloads.length) {
        const e = document.createElement('div');
        e.className = 'sb-empty';
        e.textContent = 'No downloads yet. Files save to the location you choose.';
        container.appendChild(e);
        return;
    }
    if (downloads.some(d => d.state === 'Complete' || d.state === 'Cancelled')) {
        const act = document.createElement('div');
        act.className = 'sb-action';
        const clear = document.createElement('button');
        clear.className = 'mbtn small';
        clear.textContent = 'Clear Finished';
        clear.addEventListener('click', () => {
            downloads = downloads.filter(d => d.state === 'downloading');
            renderDownloads(container);
        });
        act.appendChild(clear);
        container.appendChild(act);
    }
    downloads.forEach(d => {
        const card = document.createElement('div');
        card.className = 'dl-card';
        const pct = Math.min(100, Math.max(0, d.progress || 0));
        card.innerHTML = `
            <div class="dl-name">${esc(d.filename)}</div>
            <div class="dl-bar"><div style="width:${pct}%"></div></div>
            <div class="dl-state">${esc(d.state)}${d.totalBytes ? ' — ' + formatBytes(d.totalBytes) : ''}</div>
        `;
        container.appendChild(card);
    });
}

function formatBytes(bytes) {
    if (!bytes) return '?';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(1) + ' ' + units[i];
}

// --- Extensions, Capture, QR, Groups & More (Chrome/Edge parity) ---

const GROUP_COLORS = ['#38d9ff', '#8b5cf6', '#34d399', '#ffd54a', '#ff6b81', '#f97316'];

async function openExtensions() {
    DOM.extModal.style.display = 'flex';
    const content = DOM.extContent;
    content.innerHTML = '<div class="sb-empty">Loading extensions…</div>';
    let list = [];
    if (window.api && window.api.extList) {
        try { list = await window.api.extList(); } catch (e) {}
    }
    content.innerHTML = '';

    const act = document.createElement('div');
    act.className = 'sb-action';
    const loadBtn = document.createElement('button');
    loadBtn.className = 'mbtn primary small';
    loadBtn.textContent = 'Load Unpacked Extension…';
    loadBtn.addEventListener('click', async () => {
        if (!window.api || !window.api.extLoadDialog) return;
        const dir = await window.api.extLoadDialog();
        if (!dir) return;
        const res = await window.api.extLoad(dir);
        if (res && res.ok) {
            showToast('Extension loaded: ' + (res.name || '') + ' — reload pages to apply');
            openExtensions();
        } else {
            showToast('Failed to load extension: ' + ((res && res.error) || 'unknown error'));
        }
    });
    act.appendChild(loadBtn);
    content.appendChild(act);

    if (!list.length) {
        const e = document.createElement('div');
        e.className = 'sb-empty';
        e.textContent = 'No extensions loaded. Pick a folder containing a Chrome extension (manifest.json).';
        content.appendChild(e);
        return;
    }
    list.forEach(ext => {
        const div = document.createElement('div');
        div.className = 'ext-item';
        div.innerHTML = `
            <div class="ext-ico">${esc((ext.name || '?').charAt(0).toUpperCase())}</div>
            <div class="ext-info">
                <div class="ext-name">${esc(ext.name || 'Extension')}</div>
                <div class="ext-path">${esc(ext.path)}</div>
            </div>
            <span class="material-icons-round ext-rm" title="Remove extension">delete</span>`;
        div.querySelector('.ext-rm').addEventListener('click', async () => {
            if (window.api && window.api.extRemove) await window.api.extRemove(ext.id);
            showToast('Extension removed');
            openExtensions();
        });
        content.appendChild(div);
    });
}

async function webCapture() {
    const wv = getActiveWebview();
    if (!wv) return;
    showToast('Capturing page…');
    const res = await window.api.webScreenshot(wv.getWebContentsId());
    if (res && res.ok) showToast('Saved: ' + res.filePath);
    else if (res && res.canceled) showToast('Capture cancelled');
    else showToast('Capture failed: ' + ((res && res.error) || 'unknown'));
}

async function printToPdf() {
    const wv = getActiveWebview();
    if (!wv) return;
    showToast('Generating PDF…');
    const res = await window.api.printPdf(wv.getWebContentsId());
    if (res && res.ok) showToast('PDF saved: ' + res.filePath);
    else if (res && res.canceled) showToast('Export cancelled');
    else showToast('PDF failed: ' + ((res && res.error) || 'unknown'));
}

function openQR() {
    const t = getActiveTab();
    const url = t && t.url && !t.url.startsWith('black-ui:') && t.url !== 'about:blank' ? t.url : '';
    if (!url) { showToast('Open a webpage first'); return; }
    DOM.qrUrl.textContent = url;
    DOM.qrModal.style.display = 'flex';
    if (window.QRCode) {
        DOM.qrCanvas.width = 240;
        DOM.qrCanvas.height = 240;
        QRCode.toCanvas(DOM.qrCanvas, url, { width: 240, margin: 1,
            color: { dark: '#0b1220', light: '#eaf6ff' } }, (err) => {
            if (err) showToast('QR failed: ' + err.message);
        });
    } else {
        showToast('QR library unavailable');
    }
}

function bookmarkAllTabs() {
    const pages = tabs.filter(t => t.url && t.url.startsWith('http'));
    if (!pages.length) { showToast('No webpages open to bookmark'); return; }
    const folder = prompt('Bookmark folder name:', 'Bookmarks');
    if (folder === null) return;
    pages.forEach(t => {
        if (!savedBookmarks.some(b => b.url === t.url)) {
            savedBookmarks.push({ url: t.url, title: t.title || t.url, folder: folder.trim() || 'Bookmarks' });
        }
    });
    saveBookmarks();
    showToast('Bookmarked ' + pages.length + ' tab' + (pages.length > 1 ? 's' : ''));
}

// --- Tab groups ---

function removeTabFromGroup(tab) {
    if (!tab.groupId) return;
    tab.groupId = null;
    applyTabGroupStyles(tab);
    if (!tabs.some(t => t.groupId === tab.groupId)) {
        tabGroups = tabGroups.filter(g => g.id !== tab.groupId);
        if (_lastGroupId === tab.groupId) _lastGroupId = null;
    }
    renderGroupChips();
    saveSessionSoon();
}

function applyTabGroupStyles(tab) {
    if (tab.groupId) {
        const g = tabGroups.find(x => x.id === tab.groupId);
        tab.el.classList.add('in-group');
        if (g) tab.el.style.setProperty('--gcolor', g.color);
    } else {
        tab.el.classList.remove('in-group');
        tab.el.style.removeProperty('--gcolor');
    }
}

function renderGroupChips() {
    document.querySelectorAll('.tab-group-chip').forEach(c => c.remove());
    tabGroups.forEach(g => {
        const first = tabs.find(t => t.groupId === g.id);
        if (!first || !first.el.parentNode) return;
        const chip = document.createElement('div');
        chip.className = 'tab-group-chip';
        chip.title = 'Group: ' + g.name;
        chip.innerHTML = `<span class="gdot" style="background:${g.color}"></span>${esc(g.name)}<span class="gx" title="Remove group">×</span>`;
        chip.addEventListener('click', (e) => {
            if (e.target.classList.contains('gx')) {
                const members = tabs.filter(t => t.groupId === g.id);
                members.forEach(t => { t.groupId = null; applyTabGroupStyles(t); });
                tabGroups = tabGroups.filter(x => x.id !== g.id);
                if (_lastGroupId === g.id) _lastGroupId = null;
                renderGroupChips();
                saveSessionSoon();
                showToast('Group removed');
                return;
            }
            const m = tabs.find(t => t.groupId === g.id);
            if (m) switchTab(m.id);
        });
        first.el.parentNode.insertBefore(chip, first.el);
    });
}

function assignTabToLastGroup(tab) {
    const g = _lastGroupId ? tabGroups.find(x => x.id === _lastGroupId) : null;
    if (g) {
        tab.groupId = g.id;
        applyTabGroupStyles(tab);
        renderGroupChips();
        saveSessionSoon();
        return true;
    }
    return false;
}

// --- Menu Actions ---

document.getElementById('mi-newtab').addEventListener('click', () => createTab());
document.getElementById('mi-newwin').addEventListener('click', () => { if (window.api) window.api.newWindow(false); });
document.getElementById('mi-incognito').addEventListener('click', () => { if (window.api) window.api.newWindow(true); });
document.getElementById('mi-reopen').addEventListener('click', reopenClosedTab);
document.getElementById('mi-layout').addEventListener('click', toggleLayout);
document.getElementById('mi-history').addEventListener('click', () => openSidebarView('history'));
document.getElementById('mi-reading').addEventListener('click', () => openSidebarView('reading'));
document.getElementById('mi-downloads').addEventListener('click', () => openSidebarView('downloads'));
document.getElementById('mi-bookmarks').addEventListener('click', () => openSidebarView('bookmarks'));
document.getElementById('mi-bm-all').addEventListener('click', bookmarkAllTabs);
document.getElementById('mi-ext').addEventListener('click', openExtensions);
document.getElementById('mi-passwords').addEventListener('click', openPasswordManager);
document.getElementById('mi-reader').addEventListener('click', toggleReaderMode);
document.getElementById('mi-find').addEventListener('click', openFind);
document.getElementById('mi-capture').addEventListener('click', webCapture);
document.getElementById('mi-printpdf').addEventListener('click', printToPdf);
document.getElementById('mi-qr').addEventListener('click', openQR);
document.getElementById('mi-zoom').addEventListener('click', () => {
    DOM.menuZoom.style.display = DOM.menuZoom.style.display === 'flex' ? 'none' : 'flex';
});
document.getElementById('mi-print').addEventListener('click', () => { const wv = getActiveWebview(); if (wv) wv.print(); });
document.getElementById('mi-usage').addEventListener('click', openUsage);
document.getElementById('mi-free').addEventListener('click', freeMemory);
document.getElementById('mi-settings').addEventListener('click', openSettings);

DOM.btnShield.addEventListener('click', openUsage);
DOM.urlIcon.addEventListener('click', openUsage);
DOM.btnLayout.addEventListener('click', toggleLayout);
DOM.btnFullscreen.addEventListener('click', () => { if (window.api) window.api.toggleFullscreen(); });

let appFullscreen = false;
function syncFullscreenUi() {
    document.body.classList.toggle('fullscreen', appFullscreen);
    const icon = DOM.btnFullscreen.querySelector('span');
    if (icon) icon.textContent = appFullscreen ? 'fullscreen_exit' : 'fullscreen';
    DOM.btnFullscreen.title = appFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)';
}
window.addEventListener('enter-full-screen', () => { appFullscreen = true; syncFullscreenUi(); });
window.addEventListener('leave-full-screen', () => { appFullscreen = false; syncFullscreenUi(); });

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
    if (tab) {
        tab.isPinned = !tab.isPinned;
        tab.el.classList.toggle('pinned');
        const closeBtn = tab.el.querySelector('.tab-close');
        if (closeBtn) closeBtn.style.display = tab.isPinned ? 'none' : '';
        saveSessionSoon();
    }
});
document.getElementById('tcm-dup').addEventListener('click', () => {
    const tabId = DOM.tabContextMenu.dataset.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (tab) createTab(tab.url);
});
document.getElementById('tcm-close').addEventListener('click', () => closeTab(DOM.tabContextMenu.dataset.tabId));
document.getElementById('tcm-close-other').addEventListener('click', () => {
    const tabId = DOM.tabContextMenu.dataset.tabId;
    const toClose = tabs.filter(t => t.id !== tabId).map(t => t.id);
    toClose.forEach(id => closeTab(id));
});
document.getElementById('tcm-group').addEventListener('click', () => {
    const tab = tabs.find(t => t.id === DOM.tabContextMenu.dataset.tabId);
    if (!tab) return;
    const existing = tabGroups.find(g => g.id === tab.groupId);
    if (existing) { switchTab(tab.id); return; }
    if (assignTabToLastGroup(tab)) {
        showToast('Added to group "' + tabGroups.find(g => g.id === tab.groupId).name + '"');
        return;
    }
    const name = prompt('Group name:', 'Group ' + (tabGroups.length + 1));
    if (name === null) return;
    const group = { id: 'grp-' + Date.now(), name: name.trim() || 'Group', color: GROUP_COLORS[tabGroups.length % GROUP_COLORS.length] };
    tabGroups.push(group);
    tab.groupId = group.id;
    _lastGroupId = group.id;
    applyTabGroupStyles(tab);
    renderGroupChips();
    saveSessionSoon();
    showToast('Tab added to group "' + group.name + '"');
});
document.getElementById('tcm-ungroup').addEventListener('click', () => {
    const tab = tabs.find(t => t.id === DOM.tabContextMenu.dataset.tabId);
    if (!tab) return;
    removeTabFromGroup(tab);
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
        if (t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)) {
            const div = document.createElement('div');
            div.className = 'ts-item';
            div.innerHTML = `<div class="ts-title">${esc(t.title)}</div><div class="ts-url">${esc(t.url)}</div>`;
            div.addEventListener('click', () => {
                switchTab(t.id);
                DOM.tsModal.style.display = 'none';
            });
            DOM.tsResults.appendChild(div);
        }
    });
}

DOM.tsInput.addEventListener('input', (e) => renderTabSearch(e.target.value));
DOM.tsModal.addEventListener('click', (e) => { if (e.target === DOM.tsModal) DOM.tsModal.style.display = 'none'; });

// --- Media, PiP & Find ---

DOM.btnPip.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (wv) {
        wv.executeJavaScript(`
            (async () => {
                const video = document.querySelector('video');
                if (video) {
                    if (document.pictureInPictureElement) await document.exitPictureInPicture();
                    else await video.requestPictureInPicture();
                }
            })();
        `);
    }
});

function updateMediaHUD() {
    const audibleTab = tabs.find(t => t.el.classList.contains('audible'));
    if (audibleTab) {
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
    if (tab) toggleAudioMute(tab);
});

DOM.mhPlay.addEventListener('click', () => {
    const tabId = DOM.mediaHud.dataset.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.wv.executeJavaScript(`(function(){
            const v = document.querySelector('video,audio');
            if (v) { if (v.paused) v.play(); else v.pause(); }
        })();`);
    }
});

// --- Find in Page ---

function openFind() {
    DOM.findBar.style.display = 'flex';
    DOM.findInput.value = '';
    DOM.findInput.focus();
}

function closeFind() {
    DOM.findBar.style.display = 'none';
    DOM.findCount.textContent = '';
    const wv = getActiveWebview();
    if (wv) wv.stopFindInPage('clearSelection');
}

DOM.findInput.addEventListener('input', () => {
    const wv = getActiveWebview();
    const q = DOM.findInput.value;
    if (!wv) return;
    if (q) wv.findInPage(q);
    else { wv.stopFindInPage('clearSelection'); DOM.findCount.textContent = ''; }
});

DOM.findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const wv = getActiveWebview();
        if (wv && DOM.findInput.value) wv.findInPage(DOM.findInput.value, { findNext: true });
    }
    if (e.key === 'Escape') closeFind();
});

document.getElementById('find-prev').addEventListener('click', () => {
    const wv = getActiveWebview();
    if (wv && DOM.findInput.value) wv.findInPage(DOM.findInput.value, { findNext: true, forward: false });
});
document.getElementById('find-next').addEventListener('click', () => {
    const wv = getActiveWebview();
    if (wv && DOM.findInput.value) wv.findInPage(DOM.findInput.value, { findNext: true });
});
document.getElementById('find-close').addEventListener('click', closeFind);

// --- Zoom ---

function zoomActive(delta) {
    const tab = getActiveTab();
    if (!tab) return;
    tab.zoom = Math.min(3, Math.max(0.5, Math.round((tab.zoom + delta) * 10) / 10));
    safeSetZoom(tab.wv, tab.zoom);
    updateZoomLabel();
}

function resetZoom() {
    const tab = getActiveTab();
    if (tab) { tab.zoom = 1; safeSetZoom(tab.wv, 1); }
    updateZoomLabel();
}

function updateZoomLabel() {
    const tab = getActiveTab();
    const z = tab ? Math.round(tab.zoom * 100) : 100;
    DOM.sbZoom.textContent = z + '%';
    DOM.setZoomLabel.textContent = z + '%';
    DOM.mzLabel.textContent = z + '%';
}

document.getElementById('mz-minus').addEventListener('click', () => zoomActive(-0.1));
document.getElementById('mz-plus').addEventListener('click', () => zoomActive(0.1));
document.getElementById('mz-reset').addEventListener('click', resetZoom);
document.getElementById('set-zoom-minus').addEventListener('click', () => zoomActive(-0.1));
document.getElementById('set-zoom-plus').addEventListener('click', () => zoomActive(0.1));

// --- Immersive Reader ---

const READER_JS = `(function(){
  try {
    const pick = document.querySelector('article') || document.querySelector('main') || document.querySelector('[role="main"]') || document.querySelector('#content') || document.querySelector('.post') || document.querySelector('.entry-content') || document.body;
    const doc = pick.cloneNode(true);
    doc.querySelectorAll('script,style,nav,header,footer,aside,iframe,form,button,svg,canvas,video,audio,noscript,ins,.ad,.ads,.advert,.advertisement,.banner').forEach(function(n){ n.remove(); });
    const title = document.title || 'Untitled';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Georgia,"Times New Roman",serif;background:#0b1220;color:#dbe7f4;max-width:720px;margin:0 auto;padding:56px 28px;line-height:1.8;font-size:19px}h1{font-size:30px;margin:0 0 8px;color:#fff}p{margin:0 0 1.2em}img{max-width:100%;border-radius:10px;margin:12px 0}a{color:#38d9ff}pre,code{background:rgba(255,255,255,.08);border-radius:6px;padding:2px 7px;font-family:Consolas,monospace;font-size:15px}blockquote{border-left:3px solid #38d9ff;margin:0;padding-left:18px;opacity:.85}.reader-bar{position:fixed;top:0;left:0;right:0;background:rgba(10,16,30,.92);backdrop-filter:blur(14px);border-bottom:1px solid rgba(56,216,255,.2);display:flex;align-items:center;justify-content:space-between;padding:10px 20px;font-family:Inter,-apple-system,sans-serif;font-size:13px;color:#8aa6c4;z-index:999}button{background:rgba(56,216,255,.12);border:1px solid #38d9ff;color:#38d9ff;border-radius:20px;padding:7px 16px;cursor:pointer;font-size:12px;font-family:Inter,sans-serif}button:hover{background:rgba(56,216,255,.25)}</style></head><body><div class="reader-bar"><span>Immersive Reader</span><button onclick="location.reload()">Exit Reader</button></div><article><h1>' + title + '</h1>' + doc.innerHTML + '</article></body></html>';
    document.open(); document.write(html); document.close();
  } catch(e) {}
})();`;

function toggleReaderMode() {
    const wv = getActiveWebview();
    if (!wv) return;
    if (readerModeActive) {
        readerModeActive = false;
        wv.reload();
        showToast('Exited Reader Mode');
        return;
    }
    const url = wvGet(wv, 'getURL', '');
    if (!url.startsWith('http')) return showToast('Reader Mode is unavailable on this page');
    readerModeActive = true;
    wv.executeJavaScript(READER_JS, true)
        .then(() => showToast('Immersive Reader active (Ctrl+Shift+R to exit)'))
        .catch(() => { readerModeActive = false; showToast('Reader Mode failed on this page'); });
}

// --- Password Manager (Edge Wallet) ---

function pmField(label, id, type, ph) {
    const w = document.createElement('div');
    w.className = 'mfield';
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.type = type || 'text';
    i.id = id;
    i.placeholder = ph || '';
    w.appendChild(l);
    w.appendChild(i);
    return w;
}

async function openPasswordManager() {
    DOM.pmModal.style.display = 'flex';
    DOM.pmContent.innerHTML = '';
    const hasMaster = await window.api.pmHasMaster();
    if (!hasMaster) renderPmSetup();
    else renderPmUnlock();
}

function renderPmSetup() {
    const body = DOM.pmContent;
    body.innerHTML = '';
    const hint = document.createElement('div');
    hint.className = 'pm-hint';
    hint.textContent = 'Your passwords are encrypted with AES-256-GCM using this master password. It cannot be recovered if forgotten.';
    body.appendChild(hint);
    body.appendChild(pmField('New Master Password', 'pm-set-pw', 'password', 'Choose a master password'));
    body.appendChild(pmField('Confirm Master Password', 'pm-set-pw2', 'password', 'Repeat it'));
    const btn = document.createElement('button');
    btn.className = 'mbtn primary';
    btn.textContent = 'Create Vault';
    btn.addEventListener('click', async () => {
        const a = document.getElementById('pm-set-pw').value;
        const b = document.getElementById('pm-set-pw2').value;
        if (a.length < 4) return showToast('Master password must be at least 4 characters');
        if (a !== b) return showToast('Passwords do not match');
        if (await window.api.pmSetMaster(a)) {
            pmMaster = a;
            pmEntries = [];
            showToast('Vault created');
            renderPmList();
        } else showToast('Failed to create vault');
    });
    body.appendChild(btn);
}

async function renderPmUnlock() {
    const body = DOM.pmContent;
    body.innerHTML = '';
    body.appendChild(pmField('Master Password', 'pm-unlock-pw', 'password', 'Enter master password'));
    const btn = document.createElement('button');
    btn.className = 'mbtn primary';
    btn.textContent = 'Unlock Vault';
    btn.addEventListener('click', async () => {
        const pw = document.getElementById('pm-unlock-pw').value;
        if (!pw) return;
        const ok = await window.api.pmVerifyMaster(pw);
        if (!ok) return showToast('Incorrect master password');
        pmMaster = pw;
        pmEntries = (await window.api.pmLoad(pw)) || [];
        renderPmList();
    });
    body.appendChild(btn);
}

function renderPmList() {
    const body = DOM.pmContent;
    body.innerHTML = '';
    const addBtn = document.createElement('button');
    addBtn.className = 'mbtn';
    addBtn.textContent = '+ Add Password';
    addBtn.addEventListener('click', renderPmAdd);
    body.appendChild(addBtn);

    if (!pmEntries.length) {
        const e = document.createElement('div');
        e.className = 'sb-empty';
        e.textContent = 'No saved passwords yet.';
        body.appendChild(e);
        return;
    }
    pmEntries.forEach((ent, i) => {
        const card = document.createElement('div');
        card.className = 'pm-card';
        card.innerHTML = `<div class="pm-site">${esc(ent.site || 'Site')}</div><div class="pm-user">${esc(ent.username || '')}</div>`;
        const acts = document.createElement('div');
        acts.className = 'pm-actions';
        const fill = document.createElement('button');
        fill.className = 'mbtn small primary';
        fill.textContent = 'Fill';
        fill.addEventListener('click', () => fillLogin(ent));
        const copyU = document.createElement('button');
        copyU.className = 'mbtn small';
        copyU.textContent = 'Copy User';
        copyU.addEventListener('click', () => copyText(ent.username));
        const copyP = document.createElement('button');
        copyP.className = 'mbtn small';
        copyP.textContent = 'Copy Pass';
        copyP.addEventListener('click', () => copyText(ent.password));
        const del = document.createElement('button');
        del.className = 'mbtn small danger';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            pmEntries.splice(i, 1);
            await window.api.pmSave(pmMaster, pmEntries);
            showToast('Password deleted');
            renderPmList();
        });
        acts.appendChild(fill);
        acts.appendChild(copyU);
        acts.appendChild(copyP);
        acts.appendChild(del);
        card.appendChild(acts);
        body.appendChild(card);
    });
}

function renderPmAdd() {
    const body = DOM.pmContent;
    body.innerHTML = '';
    body.appendChild(pmField('Site / App', 'pm-add-site', 'text', 'e.g. example.com'));
    body.appendChild(pmField('Username', 'pm-add-user', 'text', 'your email or username'));
    body.appendChild(pmField('Password', 'pm-add-pw', 'password', 'the password'));
    const row = document.createElement('div');
    row.className = 'set-actions';
    const save = document.createElement('button');
    save.className = 'mbtn primary';
    save.textContent = 'Save';
    save.addEventListener('click', async () => {
        const site = document.getElementById('pm-add-site').value.trim();
        const username = document.getElementById('pm-add-user').value.trim();
        const password = document.getElementById('pm-add-pw').value;
        if (!site || !username || !password) return showToast('Fill all fields');
        pmEntries.push({ site, username, password, id: Date.now() });
        await window.api.pmSave(pmMaster, pmEntries);
        showToast('Password saved');
        renderPmList();
    });
    const back = document.createElement('button');
    back.className = 'mbtn';
    back.textContent = 'Back';
    back.addEventListener('click', renderPmList);
    row.appendChild(save);
    row.appendChild(back);
    body.appendChild(row);
}

function fillLogin(entry) {
    const wv = getActiveWebview();
    if (!wv) return;
    const js = `(function(){
        const p = document.querySelector('input[type=password]');
        if (!p) return;
        const set = (el, val) => {
            const proto = Object.getPrototypeOf(el);
            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
            if (desc && desc.set) desc.set.call(el, val); else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const form = p.closest('form');
        let u = form ? form.querySelector('input[type=text], input[type=email], input:not([type])') : null;
        if (!u) u = document.querySelector('input[type=text], input[type=email]');
        if (u) set(u, ${JSON.stringify(entry.username || '')});
        set(p, ${JSON.stringify(entry.password || '')});
    })();`;
    wv.executeJavaScript(js, true).then(() => showToast('Credentials filled')).catch(() => showToast('No login form found on this page'));
}

function copyText(t) {
    const ta = document.createElement('textarea');
    ta.value = t || '';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('Copied to clipboard'); }
    catch (e) { showToast('Copy failed'); }
    ta.remove();
}

// --- Settings ---

function openSettings() {
    DOM.setEngine.value = settings.searchEngine || 'google';
    DOM.setDark.checked = settings.forceDarkMode !== false;
    DOM.setSleep.checked = settings.autoSleep !== false;
    DOM.setShields.checked = settings.shields !== false;
    DOM.setStartup.value = settings.startupMode || 'continue';
    DOM.setStartupPages.value = Array.isArray(settings.startupPages) ? settings.startupPages.join(', ') : '';
    DOM.setStartupPagesWrap.style.display = DOM.setStartup.value === 'pages' ? 'block' : 'none';
    updateZoomLabel();
    DOM.settingsModal.style.display = 'flex';
}

DOM.setStartup.addEventListener('change', () => {
    DOM.setStartupPagesWrap.style.display = DOM.setStartup.value === 'pages' ? 'block' : 'none';
});

document.getElementById('settings-save').addEventListener('click', async () => {
    settings.searchEngine = DOM.setEngine.value;
    settings.forceDarkMode = DOM.setDark.checked;
    settings.autoSleep = DOM.setSleep.checked;
    settings.shields = DOM.setShields.checked;
    settings.startupMode = DOM.setStartup.value;
    settings.startupPages = DOM.setStartupPages.value.split(',').map(s => s.trim()).filter(s => s.startsWith('http'));
    if (window.api) {
        await window.api.saveSettings(settings);
        await window.api.setShields(settings.shields);
    }
    if (!settings.autoSleep) tabs.forEach(t => { if (t.sleepTimer) clearTimeout(t.sleepTimer); });
    else tabs.forEach(t => { if (t.id !== activeTabId) resetSleepTimer(t); });
    showToast(settings.shields ? 'Settings saved — Shields ON' : 'Settings saved — Shields OFF');
    DOM.settingsModal.style.display = 'none';
});

document.getElementById('settings-clear').addEventListener('click', async () => {
    if (!confirm('Clear history, bookmarks, and session restore data? (Saved passwords are kept.)')) return;
    savedHistory = [];
    savedBookmarks = [];
    saveHistory();
    saveBookmarks();
    closedTabs = [];
    if (window.api) await window.api.saveSession({ tabs: [], activeIndex: -1 });
    showToast('Browsing data cleared');
    if (DOM.sidebarPanel.classList.contains('open')) openSidebarView('history');
});

// --- Privacy & Performance Center ---

async function renderSsdCard(card, h, p, fill, note, force) {
    let r = null;
    if (window.api && window.api.ssdHealth) {
        try { r = await window.api.ssdHealth(force); } catch (e) {}
    }
    if (!r || !r.ok || !r.disks || !r.disks.length) {
        if (note) {
            note.textContent = 'SMART data unavailable' + (r && r.error ? ' (' + r.error + ')' : '') + ' — may require admin rights or a drive that exposes SMART.';
            note.style.color = 'var(--accent-red)';
        }
        return;
    }
    const d = r.disks[0];
    if (h) h.textContent = d.name + ' — ' + (d.sizeGB ? d.sizeGB + ' GB ' : '') + (d.media === 'SSD' ? 'SSD' : d.media || '');
    if (p) p.textContent = 'SMART status: ' + (d.health || 'Unknown') +
        (d.temp >= 0 ? '  ·  ' + d.temp + ' °C' : '') +
        (d.powerOnHours >= 0 ? '  ·  ' + d.powerOnHours + ' h powered on' : '');
    if (!r.telemetry || d.wear < 0) {
        if (fill) { fill.style.width = '0%'; fill.style.background = 'rgba(255,255,255,.25)'; }
        if (note) {
            note.style.color = 'var(--accent-gold)';
            note.textContent = 'Wear telemetry is unavailable — SMART wear counters need administrator rights. Reopen Black as administrator to see estimated lifespan, temperature and error counters.';
        }
        if (card) card.dataset.health = 'n/a';
        return;
    }
    const wear = d.wear >= 0 ? d.wear : 0;
    const healthPct = Math.max(0, 100 - wear);
    const color = healthPct > 60 ? 'linear-gradient(90deg, #34d399, #38d9ff)' : healthPct > 30 ? 'linear-gradient(90deg, #ffd54a, #ff9f43)' : 'linear-gradient(90deg, #ff6b81, #ff4757)';
    if (fill) {
        fill.style.width = healthPct + '%';
        fill.style.background = color;
    }
    if (note) {
        note.style.color = '';
        let txt = 'Estimated drive health ' + healthPct + '% (wear level ' + wear + '% of rated lifespan)' +
            (d.readErrors >= 0 ? '  ·  ' + d.readErrors + ' read errors' : '') +
            (d.writeErrors >= 0 ? '  ·  ' + d.writeErrors + ' write errors' : '') +
            '. Black\'s write protection (batched flushes, tab sleeping, forced GC) keeps wear low.';
        if (wear > 70) txt += ' ⚠ This drive is nearing end-of-life — back up important data now.';
        note.textContent = txt;
    }
    if (card) card.dataset.health = healthPct;
}

async function openUsage() {
    DOM.usageModal.style.display = 'flex';
    const content = DOM.usageContent;
    content.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'usage-grid';
    const cells = [
        ['Ads & trackers blocked', usage.adsBlocked],
        ['Pages loaded', usage.pagesLoaded],
        ['Active time', formatTime(usage.totalTimeSec)],
        ['Sleeping tabs', tabs.filter(t => t.isSleeping).length],
        ['Open tabs', tabs.length],
        ['Zoom', (getActiveTab() ? Math.round(getActiveTab().zoom * 100) : 100) + '%']
    ];
    cells.forEach(c => {
        const cell = document.createElement('div');
        cell.className = 'usage-cell';
        cell.innerHTML = `<div class="u-val">${esc(c[1])}</div><div class="u-label">${esc(c[0])}</div>`;
        grid.appendChild(cell);
    });
    content.appendChild(grid);

    let shields = null;
    if (window.api && window.api.shieldsStatus) {
        try { shields = await window.api.shieldsStatus(); } catch (e) {}
    }
    if (shields) {
        const sh = document.createElement('div');
        sh.className = 'pm-card';
        const shH = document.createElement('div');
        shH.className = 'pm-site';
        shH.textContent = 'Shields — native ad/tracker blocking';
        const shS = document.createElement('div');
        shS.className = 'pm-user';
        shS.textContent = (shields.enabled ? 'Status: ' : 'Status: disabled (toggle in Settings)') +
            (shields.enabled ? (shields.engine === 'native' ? 'ACTIVE — C++ engine' : 'ACTIVE — JS fallback') : '');
        const shG = document.createElement('div');
        shG.className = 'usage-grid';
        const shCells = [
            ['Rules loaded', shields.rules],
            ['Requests checked', shields.checks],
            ['Blocked by engine', shields.blocks]
        ];
        shCells.forEach(c => {
            const cell = document.createElement('div');
            cell.className = 'usage-cell';
            cell.innerHTML = `<div class="u-val">${esc(c[1])}</div><div class="u-label">${esc(c[0])}</div>`;
            shG.appendChild(cell);
        });
        sh.appendChild(shH);
        sh.appendChild(shS);
        sh.appendChild(shG);
        content.appendChild(sh);
    }

    let advisor = null;
    if (window.api && window.api.advisorStatus) {
        try { advisor = await window.api.advisorStatus(); } catch (e) {}
    }
    if (advisor) {
        const ad = document.createElement('div');
        ad.className = 'pm-card';
        const adH = document.createElement('div');
        adH.className = 'pm-site';
        adH.textContent = 'Site Advisor — McAfee WebAdvisor style protection';
        const adS = document.createElement('div');
        adS.className = 'pm-user';
        adS.textContent = 'Status: ACTIVE — dangerous sites (phishing, scam, malware) are blocked with a warning page. Add your own via Menu → Block this site.';
        const adG = document.createElement('div');
        adG.className = 'usage-grid';
        const adCells = [
            ['Blocklist rules', advisor.rules],
            ['Navigations checked', advisor.checks],
            ['Dangerous sites blocked', advisor.blocks]
        ];
        adCells.forEach(c => {
            const cell = document.createElement('div');
            cell.className = 'usage-cell';
            cell.innerHTML = `<div class="u-val">${esc(c[1])}</div><div class="u-label">${esc(c[0])}</div>`;
            adG.appendChild(cell);
        });
        ad.appendChild(adH);
        ad.appendChild(adS);
        ad.appendChild(adG);
        content.appendChild(ad);
    }

    const ssd = document.createElement('div');
    ssd.className = 'pm-card';
    ssd.id = 'ssd-live-card';
    const h = document.createElement('div');
    h.className = 'pm-site';
    h.textContent = 'SSD Health (live SMART)';
    const p = document.createElement('div');
    p.className = 'pm-user';
    p.textContent = 'Disk writes are buffered in RAM and flushed at idle (2.5s debounce). Reading real SMART data from Windows…';
    const bar = document.createElement('div');
    bar.className = 'ssd-bar';
    const fill = document.createElement('div');
    fill.style.width = '0%';
    bar.appendChild(fill);
    const note = document.createElement('div');
    note.className = 'pm-hint';
    note.id = 'ssd-note';
    note.textContent = 'Reading drive health…';
    const refresh = document.createElement('button');
    refresh.className = 'mbtn small';
    refresh.id = 'ssd-refresh';
    refresh.textContent = 'Refresh';
    refresh.style.cssText = 'margin-top:8px';
    refresh.addEventListener('click', async () => {
        await renderSsdCard(ssd, h, p, fill, note, true);
    });
    ssd.appendChild(h);
    ssd.appendChild(p);
    ssd.appendChild(bar);
    ssd.appendChild(note);
    ssd.appendChild(refresh);
    content.appendChild(ssd);
    renderSsdCard(ssd, h, p, fill, note);

    const reset = document.createElement('button');
    reset.className = 'mbtn danger';
    reset.textContent = 'Reset Stats';
    reset.addEventListener('click', async () => {
        usage = { totalTimeSec: 0, pagesLoaded: 0, adsBlocked: blockedCount, startedAt: Date.now() };
        if (window.api) await window.api.saveUsage(usage);
        openUsage();
    });
    content.appendChild(reset);
}

async function freeMemory() {
    showToast('Triggering V8 garbage collection...');
    const ok = await window.api.gcCollect();
    showToast(ok ? 'Memory freed successfully' : 'Garbage collection unavailable');
}

// --- Session Save / Restore ---

function saveSessionSoon() {
    clearTimeout(_sessionSaveTimer);
    _sessionSaveTimer = setTimeout(saveSessionNow, 800);
}

function saveSessionNow() {
    if (!window.api || isIncognito) return;
    const activeIdx = tabs.findIndex(t => t.id === activeTabId);
    const data = {
        tabs: tabs.map(t => ({ url: t.url, title: t.title, pinned: t.isPinned, sleeping: t.isSleeping, groupId: t.groupId })),
        activeIndex: activeIdx,
        groups: tabGroups
    };
    window.api.saveSession(data);
}

// --- Keyboard Shortcuts ---

document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey;

    if (ctrl && k === 't') { e.preventDefault(); createTab(); }
    if (ctrl && e.shiftKey && k === 't') { e.preventDefault(); reopenClosedTab(); }
    if (ctrl && k === 'n') { e.preventDefault(); if (window.api) window.api.newWindow(e.shiftKey); }
    if (ctrl && k === 'w') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
    if (ctrl && k === 'l') { e.preventDefault(); DOM.urlInput.focus(); }
    if (ctrl && e.shiftKey && k === 'a') { e.preventDefault(); openTabSearch(); }
    if (ctrl && k === 'd') { e.preventDefault(); DOM.btnBookmark.click(); }
    if ((ctrl && k === 'r') || e.key === 'F5') { e.preventDefault(); const wv = getActiveWebview(); if (wv) wv.reload(); }
    if (ctrl && e.shiftKey && k === 'r') { e.preventDefault(); toggleReaderMode(); }
    if (e.key === 'F11') { e.preventDefault(); if (window.api) window.api.toggleFullscreen(); }
    if (ctrl && (k === '+' || (k === '=' && e.shiftKey))) { e.preventDefault(); zoomActive(0.1); }
    if (ctrl && k === '-') { e.preventDefault(); zoomActive(-0.1); }
    if (ctrl && k === '0') { e.preventDefault(); resetZoom(); }
    if (ctrl && k === 'f') { e.preventDefault(); openFind(); }
    if (ctrl && k === 'j') { e.preventDefault(); openSidebarView('downloads'); }
    if (ctrl && k === 'h') { e.preventDefault(); openSidebarView('history'); }
    if (ctrl && e.shiftKey && k === 'o') { e.preventDefault(); openSidebarView('bookmarks'); }
    if (ctrl && e.shiftKey && k === 's') { e.preventDefault(); openSidebarView('security'); }
    if (e.altKey && k === 'home') { e.preventDefault(); const t = getActiveTab(); if (t) t.wv.src = NEWTAB_URL; }
    if (ctrl && k === 'p') { e.preventDefault(); const wv = getActiveWebview(); if (wv) wv.print(); }
    if (ctrl && /^[1-9]$/.test(k)) { e.preventDefault(); const t = tabs[parseInt(k, 10) - 1]; if (t) switchTab(t.id); }
    if (ctrl && k === '9') { e.preventDefault(); const t = tabs[tabs.length - 1]; if (t) switchTab(t.id); }
    if (e.key === 'Escape') { closeFind(); DOM.mainMenu.style.display = 'none'; DOM.tabContextMenu.style.display = 'none'; }
});

// --- Drag & Drop on container ---

DOM.browserContainer.addEventListener('dragover', e => e.preventDefault());
DOM.browserContainer.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
        createTab('file://' + e.dataTransfer.files[0].path);
    } else {
        const text = e.dataTransfer.getData('text');
        if (text) createTab(text);
    }
});

DOM.tabStripContainer.addEventListener('dblclick', (e) => {
    if (e.target === DOM.tabStripContainer || e.target === DOM.tabStrip) createTab();
});

DOM.newTabBtn.addEventListener('click', () => createTab());

// --- Modal close helpers ---

document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => {
        document.getElementById(el.dataset.close).style.display = 'none';
    });
});
[DOM.pmModal, DOM.settingsModal, DOM.usageModal, DOM.extModal, DOM.qrModal].forEach(overlay => {
    if (overlay) overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
    });
});

// --- Init ---

(async function init() {
    await Promise.all([loadBookmarks(), loadHistory()]);
    await loadReadingList();

    if (window.api && window.api.isIncognito) {
        isIncognito = !!window.api.isIncognito();
    }
    if (isIncognito) {
        DOM.incognitoBadge.style.display = 'inline-block';
        document.title = 'InPrivate — Black Browser';
    }

    if (window.api) {
        const s = await window.api.loadSettings();
        if (s) {
            settings = Object.assign(settings, s);
            if (s.ai) aiConfig = Object.assign(aiConfig, s.ai);
            aiSetModelLabel();
            if (s.verticalTabs) applyLayout(true, false);
        }
        updateLayoutMenuItem();

        const u = await window.api.loadUsage();
        if (u && typeof u === 'object' && !isIncognito) usage = Object.assign(usage, u);

        window.api.onBlockedCount((c) => {
            blockedCount = c;
            usage.adsBlocked = c;
        });
        window.api.onOpenPanel((p) => {
            if (p === 'settings') openSettings();
            else if (p === 'ai') toggleAiPanel();
            else openSidebarView(p);
        });
        window.api.onOpenInTab((url) => {
            if (typeof url === 'string' && url.startsWith('http')) createTab(url);
        });
        window.api.onDownloadStart((d) => {
            downloads.unshift(Object.assign({}, d, { progress: 0, state: 'downloading' }));
            refreshDownloadsPanel();
        });
        window.api.onDownloadProgress((d) => {
            const dl = downloads.find(x => x.filename === d.filename);
            if (dl) { dl.progress = parseFloat(d.progress); refreshDownloadsPanel(); }
        });
        window.api.onDownloadDone((d) => {
            const dl = downloads.find(x => x.filename === d.filename);
            if (dl) {
                dl.state = d.state === 'completed' ? 'Complete' : (d.state === 'cancelled' ? 'Cancelled' : d.state);
                dl.progress = dl.state === 'Complete' ? 100 : dl.progress;
                refreshDownloadsPanel();
            }
        });

        // Startup mode: newtab | continue | pages (Chrome/Edge setting)
        const startupMode = settings.startupMode || 'continue';
        const wantSession = !isIncognito && startupMode !== 'newtab';
        const sess = wantSession ? await window.api.loadSession() : null;

        if (startupMode === 'pages' && Array.isArray(settings.startupPages) && settings.startupPages.length) {
            settings.startupPages.forEach(url => { if (typeof url === 'string' && url.trim()) createTab(url.trim(), false, false); });
            if (!tabs.length) createTab();
            const idx = (sess && sess.activeIndex != null && sess.activeIndex < tabs.length) ? sess.activeIndex : 0;
            switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
        } else if (sess && Array.isArray(sess.tabs) && sess.tabs.length) {
            if (Array.isArray(sess.groups)) tabGroups = sess.groups;
            if (tabGroups.length) _lastGroupId = tabGroups[tabGroups.length - 1].id;
            sess.tabs.forEach(t => {
                if (t.sleeping) {
                    const tb = createTab('about:blank', !!t.pinned, false);
                    tb.url = t.url || NEWTAB_URL;
                    tb.title = t.title || 'New Tab';
                    tb.isSleeping = true;
                    tb.el.classList.add('sleeping');
                    tb.el.querySelector('.tab-title').textContent = tb.title;
                    tb.groupId = t.groupId || null;
                    if (tb.groupId) applyTabGroupStyles(tb);
                } else {
                    const tb = createTab(t.url || NEWTAB_URL, !!t.pinned, false);
                    tb.groupId = t.groupId || null;
                    if (tb.groupId) applyTabGroupStyles(tb);
                }
            });
            const idx = (sess.activeIndex != null && sess.activeIndex < tabs.length) ? sess.activeIndex : 0;
            switchTab(tabs[idx].id);
            renderGroupChips();
        } else {
            createTab();
        }
    } else {
        createTab();
    }

    setInterval(() => {
        usage.totalTimeSec += 30;
        if (window.api && !isIncognito) window.api.saveUsage(usage);
    }, 30000);

    window.addEventListener('beforeunload', () => {
        saveSessionNow();
        if (window.api && !isIncognito) window.api.saveUsage(usage);
    });
})();
