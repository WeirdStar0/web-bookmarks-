export const scripts = `
    <script>
        function app() {
            return {
                loggedIn: false,
                loginForm: { username: '', password: '' },
                loginError: '',
                
                folders: [],
                bookmarks: [],
                currentFolderId: null,
                
                searchQuery: '',
                currentView: 'home', // 'home' | 'trash'
                trashFolders: [],
                trashBookmarks: [],
                expandedFolders: {}, // For sidebar tree
                
                isLoading: false,
                toast: { show: false, message: '', type: 'success' },
                
                editMode: false,
                editingId: null,

                showFolderModal: false,
                newFolderName: '',
                
                showBookmarkModal: false,
                newBookmarkTitle: '',
                newBookmarkUrl: '',
                
                showSettingsModal: false,
                settingsForm: { username: '', password: '' },
                
                showConfirmModal: false,
                confirmMessage: '',
                confirmCallback: null,
                
                darkMode: localStorage.getItem('darkMode') === 'true',

                init() {
                    if (this.darkMode) document.documentElement.classList.add('dark');
                    this.checkAuth();
                },

                async checkAuth() {
                    try {
                        await this.loadData();
                        this.loggedIn = true;
                    } catch (e) {
                        this.loggedIn = false;
                    }
                },

                async login() {
                    try {
                        const res = await fetch('/api/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(this.loginForm)
                        });
                        if (res.ok) {
                            this.loggedIn = true;
                            this.loginError = '';
                            this.loadData();
                        } else {
                            const data = await res.json();
                            this.loginError = data.error || 'Login failed';
                        }
                    } catch (e) {
                        this.loginError = 'Network error';
                    }
                },

                async logout() {
                    await fetch('/api/logout', { method: 'POST' });
                    this.loggedIn = false;
                    this.loginForm = { username: '', password: '' };
                    this.folders = [];
                    this.bookmarks = [];
                },

                async loadData() {
                    const res = await fetch('/api/data');
                    if (res.status === 401) throw new Error('Unauthorized');
                    const data = await res.json();
                    this.folders = data.folders;
                    this.bookmarks = data.bookmarks;
                },

                async loadTrash() {
                    const res = await fetch('/api/trash');
                    if (res.status === 401) throw new Error('Unauthorized');
                    const data = await res.json();
                    this.trashFolders = data.folders;
                    this.trashBookmarks = data.bookmarks;
                },

                get currentFolders() {
                    if (this.currentView === 'trash') {
                         return this.trashFolders.filter(f => f.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
                    }
                    let items = this.folders.filter(f => f.parent_id === this.currentFolderId);
                    if (this.searchQuery) {
                        items = this.folders.filter(f => f.name.toLowerCase().includes(this.searchQuery.toLowerCase()));
                    }
                    return items;
                },

                get currentBookmarks() {
                    if (this.currentView === 'trash') {
                        return this.trashBookmarks.filter(b => b.title.toLowerCase().includes(this.searchQuery.toLowerCase()) || b.url.toLowerCase().includes(this.searchQuery.toLowerCase()));
                    }
                    let items = this.bookmarks.filter(b => b.folder_id === this.currentFolderId);
                    if (this.searchQuery) {
                        items = this.bookmarks.filter(b => b.title.toLowerCase().includes(this.searchQuery.toLowerCase()) || b.url.toLowerCase().includes(this.searchQuery.toLowerCase()));
                    }
                    return items;
                },

                get breadcrumbs() {
                    const crumbs = [];
                    let currentId = this.currentFolderId;
                    while (currentId) {
                        const folder = this.folders.find(f => f.id === currentId);
                        if (folder) {
                            crumbs.unshift(folder);
                            currentId = folder.parent_id;
                        } else {
                            break;
                        }
                    }
                    return crumbs;
                },

                get rootFolders() {
                    return this.folders.filter(f => !f.parent_id);
                },

                getChildFolders(parentId) {
                    return this.folders.filter(f => f.parent_id === parentId);
                },

                openFolderModal(folder = null) {
                    if (folder) {
                        this.editMode = true;
                        this.editingId = folder.id;
                        this.newFolderName = folder.name;
                    } else {
                        this.editMode = false;
                        this.editingId = null;
                        this.newFolderName = '';
                    }
                    this.showFolderModal = true;
                },

                async createFolder() {
                    if (!this.newFolderName) return;
                    
                    if (this.editMode) {
                        await fetch(\`/api/folders/\${this.editingId}\`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: this.newFolderName })
                        });
                    } else {
                        await fetch('/api/folders', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: this.newFolderName, parent_id: this.currentFolderId })
                        });
                    }
                    this.showFolderModal = false;
                    this.loadData();
                },

                deleteFolder(id) {
                    this.confirmAction('确定要删除这个文件夹吗？', async () => {
                        await fetch(\`/api/folders/\${id}\`, { method: 'DELETE' });
                        this.loadData();
                    });
                },

                openBookmarkModal(bookmark = null) {
                    if (bookmark) {
                        this.editMode = true;
                        this.editingId = bookmark.id;
                        this.newBookmarkTitle = bookmark.title;
                        this.newBookmarkUrl = bookmark.url;
                    } else {
                        this.editMode = false;
                        this.editingId = null;
                        this.newBookmarkTitle = '';
                        this.newBookmarkUrl = '';
                    }
                    this.showBookmarkModal = true;
                },

                async createBookmark() {
                    if (!this.newBookmarkUrl) return;
                    
                    if (this.editMode) {
                        await fetch(\`/api/bookmarks/\${this.editingId}\`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                title: this.newBookmarkTitle || this.newBookmarkUrl,
                                url: this.newBookmarkUrl
                            })
                        });
                    } else {
                        await fetch('/api/bookmarks', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                title: this.newBookmarkTitle || this.newBookmarkUrl,
                                url: this.newBookmarkUrl,
                                folder_id: this.currentFolderId
                            })
                        });
                    }
                    this.showBookmarkModal = false;
                    this.loadData();
                },

                deleteBookmark(id) {
                    this.confirmAction('确定要删除这个书签吗？', async () => {
                        await fetch(\`/api/bookmarks/\${id}\`, { method: 'DELETE' });
                        this.loadData();
                    });
                },

                async restoreFolder(id) {
                    await fetch(\`/api/restore/folders/\${id}\`, { method: 'POST' });
                    this.loadTrash();
                    this.loadData();
                },

                async restoreBookmark(id) {
                    await fetch(\`/api/restore/bookmarks/\${id}\`, { method: 'POST' });
                    this.loadTrash();
                    this.loadData();
                },

                permanentDeleteFolder(id) {
                    this.confirmAction('确定要永久删除这个文件夹吗？此操作无法撤销！', async () => {
                        await fetch(\`/api/trash/folders/\${id}\`, { method: 'DELETE' });
                        this.loadTrash();
                    });
                },

                permanentDeleteBookmark(id) {
                    this.confirmAction('确定要永久删除这个书签吗？此操作无法撤销！', async () => {
                        await fetch(\`/api/trash/bookmarks/\${id}\`, { method: 'DELETE' });
                        this.loadTrash();
                    });
                },

                emptyTrash() {
                    this.confirmAction('确定要清空回收站吗？所有项目将被永久删除！', async () => {
                        await fetch('/api/trash/empty', { method: 'DELETE' });
                        this.loadTrash();
                    });
                },

                toggleFolder(id) {
                    this.expandedFolders[id] = !this.expandedFolders[id];
                },

                openSettingsModal() {
                    this.settingsForm = { username: '', password: '' };
                    this.showSettingsModal = true;
                },

                async updateSettings() {
                    const res = await fetch('/api/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(this.settingsForm)
                    });
                    if (res.ok) {
                        this.showSettingsModal = false;
                        this.showToast('设置已更新', 'success');
                    } else {
                        this.showToast('更新失败', 'error');
                    }
                },

                toggleDarkMode() {
                    this.darkMode = !this.darkMode;
                    localStorage.setItem('darkMode', this.darkMode);
                    if (this.darkMode) {
                        document.documentElement.classList.add('dark');
                    } else {
                        document.documentElement.classList.remove('dark');
                    }
                },
                
                showToast(message, type = 'success') {
                    this.toast = { show: true, message, type };
                    setTimeout(() => {
                        this.toast.show = false;
                    }, 3000);
                },
                
                confirmAction(message, callback) {
                    this.confirmMessage = message;
                    this.confirmCallback = callback;
                    this.showConfirmModal = true;
                },
                
                executeConfirm() {
                    if (this.confirmCallback) {
                        this.confirmCallback();
                    }
                    this.showConfirmModal = false;
                },
                
                async importBookmarks(event) {
                    const file = event.target.files[0];
                    if (!file) return;
                    
                    this.confirmAction('确定要导入书签吗？这可能需要一些时间。', async () => {
                        this.isLoading = true;
                        const preventUnload = (e) => {
                            e.preventDefault();
                            e.returnValue = '';
                        };
                        window.addEventListener('beforeunload', preventUnload);
                        
                        try {
                            const text = await file.text();
                            const res = await fetch('/api/import', {
                                method: 'POST',
                                body: text
                            });
                            
                            if (res.ok) {
                                this.showToast('导入成功', 'success');
                                this.loadData();
                                this.showSettingsModal = false;
                            } else {
                                this.showToast('导入失败', 'error');
                            }
                        } catch (e) {
                            this.showToast('导入出错: ' + e.message, 'error');
                        } finally {
                            this.isLoading = false;
                            window.removeEventListener('beforeunload', preventUnload);
                            event.target.value = '';
                        }
                    });
                }
            }
        }
    </script>
`;
