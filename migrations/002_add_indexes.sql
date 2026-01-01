-- 添加索引以优化查询性能
-- 执行方式: wrangler d1 execute bookmarks-db --local --file=./migrations/002_add_indexes.sql

-- folders 表索引
-- 优化父文件夹查询
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id) WHERE is_deleted = 0;

-- 优化删除状态查询
CREATE INDEX IF NOT EXISTS idx_folders_is_deleted ON folders(is_deleted);

-- 优化排序查询
CREATE INDEX IF NOT EXISTS idx_folders_sort_order ON folders(sort_order ASC, name ASC) WHERE is_deleted = 0;

-- bookmarks 表索引
-- 优化文件夹关联查询
CREATE INDEX IF NOT EXISTS idx_bookmarks_folder_id ON bookmarks(folder_id) WHERE is_deleted = 0;

-- 优化删除状态查询
CREATE INDEX IF NOT EXISTS idx_bookmarks_is_deleted ON bookmarks(is_deleted);

-- 优化创建时间排序查询
CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(created_at DESC) WHERE is_deleted = 0;

-- 优化 URL 查询(用于导入时的去重)
CREATE INDEX IF NOT EXISTS idx_bookmarks_url_folder ON bookmarks(url, folder_id);

-- settings 表不需要额外索引(主键已经是索引)
