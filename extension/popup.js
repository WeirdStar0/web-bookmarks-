// State
let API_BASE = '';
let token = null;
let folders = [];

// DOM Elements
const app = document.getElementById('app');
const settingsBtn = document.getElementById('settingsBtn');
const logoutBtn = document.getElementById('logoutBtn');
const settingsView = document.getElementById('settingsView');
const settingsForm = document.getElementById('settingsForm');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const serverUrlInput = document.getElementById('serverUrl');

const loginView = document.getElementById('loginView');
const mainView = document.getElementById('mainView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

const tabSave = document.getElementById('tabSave');
const tabSearch = document.getElementById('tabSearch');
const panelSave = document.getElementById('panelSave');
const panelSearch = document.getElementById('panelSearch');

const saveForm = document.getElementById('saveForm');
const folderSelect = document.getElementById('folderSelect');
const saveMessage = document.getElementById('saveMessage');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Load config
    const config = await chrome.storage.local.get(['apiBase', 'token']);

    if (config.apiBase) {
        API_BASE = config.apiBase;
        serverUrlInput.value = API_BASE;

        if (config.token) {
            token = config.token;
            showMainView();
        } else {
            showLoginView();
        }
    } else {
        showSettingsView();
    }

    // Initialize current page info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            document.getElementById('bookmarkTitle').value = tabs[0].title;
            document.getElementById('bookmarkUrl').value = tabs[0].url;
        }
    });
});

// Settings Events
settingsBtn.addEventListener('click', () => {
    showSettingsView();
});

cancelSettingsBtn.addEventListener('click', () => {
    if (API_BASE) {
        if (token) showMainView();
        else showLoginView();
    } else {
        // If no API base set, cannot cancel
        serverUrlInput.focus();
    }
});

settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let url = serverUrlInput.value.trim();
    // Remove trailing slash
    if (url.endsWith('/')) url = url.slice(0, -1);

    if (!url) return;

    API_BASE = url;
    await chrome.storage.local.set({ apiBase: url });

    // Reset auth on server change to be safe
    token = null;
    await chrome.storage.local.remove(['token']);

    showLoginView();
});

// Auth Events
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                await chrome.storage.local.set({ token: 'logged_in' });
                token = 'logged_in';
                showMainView();
            } else {
                showLoginError('登录失败');
            }
        } else {
            showLoginError('登录失败');
        }
    } catch (err) {
        showLoginError('连接失败，请检查服务器地址');
    }
});

logoutBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['token']);
    token = null;
    showLoginView();
});

// Tab Events
tabSave.addEventListener('click', () => switchTab('save'));
tabSearch.addEventListener('click', () => switchTab('search'));

// Save Bookmark
saveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('bookmarkTitle').value;
    const url = document.getElementById('bookmarkUrl').value;
    const folderId = document.getElementById('folderSelect').value;

    if (!folderId) {
        showSaveMessage('请选择文件夹', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/bookmarks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, url, folder_id: parseInt(folderId) })
        });

        if (res.ok) {
            showSaveMessage('保存成功', 'success');
            setTimeout(() => window.close(), 1000);
        } else {
            showSaveMessage('保存失败', 'error');
        }
    } catch (err) {
        showSaveMessage('网络错误', 'error');
    }
});

// Search
searchInput.addEventListener('input', debounce(async (e) => {
    const query = e.target.value.trim();
    if (!query) {
        searchResults.innerHTML = '<div class="text-center text-gray-500 text-xs py-8">输入关键词搜索</div>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/data`);
        if (res.ok) {
            const data = await res.json();
            const bookmarks = data.bookmarks.filter(b =>
                b.title.toLowerCase().includes(query.toLowerCase()) ||
                b.url.toLowerCase().includes(query.toLowerCase())
            );
            renderSearchResults(bookmarks);
        }
    } catch (err) {
        console.error(err);
    }
}, 300));

// View Management
function showSettingsView() {
    settingsView.classList.remove('hidden');
    loginView.classList.add('hidden');
    mainView.classList.add('hidden');
    settingsBtn.classList.add('hidden');
    logoutBtn.classList.add('hidden');
}

function showLoginView() {
    settingsView.classList.add('hidden');
    loginView.classList.remove('hidden');
    mainView.classList.add('hidden');
    settingsBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    loginError.classList.add('hidden');
}

async function showMainView() {
    settingsView.classList.add('hidden');
    loginView.classList.add('hidden');
    mainView.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    await loadFolders();
}

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
}

function switchTab(tab) {
    if (tab === 'save') {
        tabSave.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
        tabSave.classList.remove('text-gray-500');
        tabSearch.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
        tabSearch.classList.add('text-gray-500');
        panelSave.classList.remove('hidden');
        panelSearch.classList.add('hidden');
    } else {
        tabSearch.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
        tabSearch.classList.remove('text-gray-500');
        tabSave.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
        tabSave.classList.add('text-gray-500');
        panelSearch.classList.remove('hidden');
        panelSave.classList.add('hidden');
        searchInput.focus();
    }
}

async function loadFolders() {
    try {
        const res = await fetch(`${API_BASE}/api/data`);
        if (res.ok) {
            const data = await res.json();
            folders = data.folders;
            renderFolderSelect();
        } else if (res.status === 401) {
            await chrome.storage.local.remove(['token']);
            showLoginView();
        }
    } catch (err) {
        console.error(err);
    }
}

function renderFolderSelect() {
    folderSelect.innerHTML = '<option value="">选择文件夹...</option>';
    const buildOptions = (parentId, level = 0) => {
        const children = folders.filter(f => f.parent_id === parentId)
            .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
        children.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = '　'.repeat(level) + folder.name;
            folderSelect.appendChild(option);
            buildOptions(folder.id, level + 1);
        });
    };
    buildOptions(null);
}

function renderSearchResults(bookmarks) {
    searchResults.innerHTML = '';
    if (bookmarks.length === 0) {
        searchResults.innerHTML = '<div class="text-center text-gray-500 text-xs py-8">未找到相关书签</div>';
        return;
    }
    bookmarks.forEach(bookmark => {
        const div = document.createElement('div');
        div.className = 'p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer flex items-center space-x-2.5 transition-colors';
        div.innerHTML = `
            <div class="flex-shrink-0 w-6 h-6 bg-gray-200 dark:bg-gray-600 rounded flex items-center justify-center text-[10px] font-bold text-gray-500 dark:text-gray-300 uppercase">
                ${bookmark.title.charAt(0)}
            </div>
            <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-900 dark:text-gray-200 truncate">${bookmark.title}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400 truncate">${bookmark.url}</div>
            </div>
        `;
        div.addEventListener('click', () => {
            chrome.tabs.create({ url: bookmark.url });
        });
        searchResults.appendChild(div);
    });
}

function showSaveMessage(msg, type) {
    saveMessage.textContent = msg;
    saveMessage.className = `text-xs text-center ${type === 'success' ? 'text-green-500' : 'text-red-500'}`;
    saveMessage.classList.remove('hidden');
    setTimeout(() => saveMessage.classList.add('hidden'), 3000);
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
