export const modals = `
    <!-- Modals -->
    <!-- Add Folder Modal -->
    <div x-show="showFolderModal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50" x-transition.opacity x-cloak>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl transform transition-all" @click.away="showFolderModal = false">
            <h2 class="text-xl font-bold mb-6 text-gray-800 dark:text-white" x-text="editMode ? '编辑文件夹' : '新建文件夹'"></h2>
            <input type="text" x-model="newFolderName" @keyup.enter="createFolder()" placeholder="文件夹名称" class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg p-3 mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow">
            <div class="flex justify-end space-x-3">
                <button @click="showFolderModal = false" class="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors">取消</button>
                <button @click="createFolder()" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md transition-colors" x-text="editMode ? '保存' : '创建'"></button>
            </div>
        </div>
    </div>

    <!-- Add Bookmark Modal -->
    <div x-show="showBookmarkModal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50" x-transition.opacity x-cloak>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl transform transition-all" @click.away="showBookmarkModal = false">
            <h2 class="text-xl font-bold mb-6 text-gray-800 dark:text-white" x-text="editMode ? '编辑书签' : '新建书签'"></h2>
            <div class="space-y-4 mb-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">标题</label>
                    <input type="text" x-model="newBookmarkTitle" placeholder="书签标题 (可选)" class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">网址</label>
                    <input type="url" x-model="newBookmarkUrl" @keyup.enter="createBookmark()" placeholder="https://example.com" class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow">
                </div>
            </div>
            <div class="flex justify-end space-x-3">
                <button @click="showBookmarkModal = false" class="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors">取消</button>
                <button @click="createBookmark()" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md transition-colors">保存</button>
            </div>
        </div>
    </div>

    <!-- Settings Modal -->
    <div x-show="showSettingsModal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50" x-transition.opacity x-cloak>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl transform transition-all" @click.away="showSettingsModal = false">
            <h2 class="text-xl font-bold mb-6 text-gray-800 dark:text-white">设置</h2>
            <div class="space-y-4 mb-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">新账号</label>
                    <input type="text" x-model="settingsForm.username" placeholder="不修改请留空" class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">新密码</label>
                    <input type="password" x-model="settingsForm.password" placeholder="不修改请留空" class="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow">
                </div>
                
                <hr class="border-gray-200 dark:border-gray-700">
                
                <div class="flex justify-between items-center">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">数据管理</span>
                    <div class="space-x-2">
                        <button @click="$refs.importInput.click()" class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors">
                            导入
                        </button>
                        <input type="file" x-ref="importInput" class="hidden" accept=".html" @change="importBookmarks($event)">
                        
                        <a href="/api/export" target="_blank" class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors inline-block">
                            导出
                        </a>
                    </div>
                </div>
            </div>
            <div class="flex justify-end space-x-3">
                <button @click="showSettingsModal = false" class="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors">取消</button>
                <button @click="updateSettings()" class="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md transition-colors">保存修改</button>
            </div>
        </div>
    </div>
    <!-- Confirm Modal -->
    <div x-show="showConfirmModal" class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-[80]" x-transition.opacity x-cloak>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl transform transition-all" @click.away="showConfirmModal = false">
            <div class="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 dark:bg-red-900 rounded-full mb-4">
                <svg class="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <h3 class="text-lg font-bold text-center text-gray-900 dark:text-white mb-2">确认操作</h3>
            <p class="text-gray-500 dark:text-gray-400 text-center mb-6" x-text="confirmMessage"></p>
            <div class="flex justify-end space-x-3">
                <button @click="showConfirmModal = false" class="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors">取消</button>
                <button @click="executeConfirm()" class="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-md transition-colors">确定</button>
            </div>
        </div>
    </div>
`;
