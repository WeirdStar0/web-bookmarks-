import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { getSignedCookie, setSignedCookie, deleteCookie, getCookie } from 'hono/cookie';
import { html } from './html';
import * as v from './utils/validators';

type Bindings = {
    DB: D1Database;
    RATE_LIMIT_KV?: KVNamespace;
    SECRET_KEY?: string;
    SESSION_MAX_AGE?: string;
    RATE_LIMIT_MAX?: string;
    RATE_LIMIT_WINDOW?: string;
};

type Variables = {
    sessionSecret: string;
};

// 熱點數據緩存
let cachedSettings: Record<string, string> | null = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 30000; // 30秒

async function getSettings(db: D1Database): Promise<Record<string, string>> {
    const now = Date.now();
    if (cachedSettings && (now - lastCacheUpdate < CACHE_TTL)) {
        return cachedSettings;
    }
    const { results } = await db.prepare('SELECT key, value FROM settings').all();
    const settings: Record<string, string> = {};
    results.forEach(r => {
        settings[r.key as string] = r.value as string;
    });
    cachedSettings = settings;
    lastCacheUpdate = now;
    return settings;
}

// 获取配置值,提供合理的默认值
function getConfig(env: Bindings) {
    return {
        sessionMaxAge: parseInt(env.SESSION_MAX_AGE || '604800'), // 7天
        rateLimitMax: parseInt(env.RATE_LIMIT_MAX || '100'),
        rateLimitWindow: parseInt(env.RATE_LIMIT_WINDOW || '60')
    };
}

// Helper: SHA-256 Hash
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', logger());
app.use('*', secureHeaders());

// 全局错误处理
app.onError((err, c) => {
    console.error(`[Global Error]: ${err.stack || err.message}`);

    // 隐藏 D1/KV 等底层细节,返回友好提示
    const status = (err as any).status || 500;
    return c.json({
        error: 'Internal Server Error',
        message: '服务器繁忙，请稍后再试'
    }, status);
});

app.notFound((c) => {
    return c.json({ error: 'Not Found', message: '资源不存在' }, 404);
});

// 速率限制中间件(仅对 API 路由生效)
app.use('/api/*', async (c, next) => {
    // 基本的 CSRF 防护: 校验自定义 Header
    // 所有的 API 请求都应该带有 X-Requested-With 或由 Fetch 发出
    if (['POST', 'PUT', 'DELETE'].includes(c.req.method)) {
        const requestedWith = c.req.header('X-Requested-With');
        if (!requestedWith && !c.req.header('Origin')) {
            return c.json({ error: 'Security validation failed' }, 403);
        }
    }

    const config = getConfig(c.env);

    // 如果没有 KV 绑定,跳过速率限制
    if (!c.env.RATE_LIMIT_KV) {
        return next();
    }

    const ip = c.req.header('cf-connecting-ip') ||
        c.req.header('x-forwarded-for')?.split(',')[0] ||
        'unknown';

    const key = `ratelimit:${ip}`;
    const now = Date.now();
    const windowMs = config.rateLimitWindow * 1000;

    try {
        const data = await c.env.RATE_LIMIT_KV.get(key, 'json') as { count: number; resetTime: number } | null;

        if (!data || data.resetTime < now) {
            // 创建新的限制窗口
            await c.env.RATE_LIMIT_KV.put(key, JSON.stringify({
                count: 1,
                resetTime: now + windowMs
            }), { expirationTtl: config.rateLimitWindow });

            c.header('X-RateLimit-Limit', config.rateLimitMax.toString());
            c.header('X-RateLimit-Remaining', (config.rateLimitMax - 1).toString());

            return next();
        }

        if (data.count >= config.rateLimitMax) {
            const retryAfter = Math.ceil((data.resetTime - now) / 1000);
            c.header('Retry-After', retryAfter.toString());
            return c.json({
                error: 'Too Many Requests',
                message: '请求过于频繁,请稍后再试',
                retryAfter
            }, 429);
        }

        data.count += 1;
        await c.env.RATE_LIMIT_KV.put(key, JSON.stringify(data), {
            expirationTtl: config.rateLimitWindow
        });

        c.header('X-RateLimit-Limit', config.rateLimitMax.toString());
        c.header('X-RateLimit-Remaining', (config.rateLimitMax - data.count).toString());

        return next();
    } catch (error) {
        // KV 操作失败时降级,允许请求通过
        console.error('Rate limit check failed:', error);
        return next();
    }
});

// Middleware: Auth & Init
app.use('*', async (c, next) => {
    let envSecret = c.env.SECRET_KEY;

    // 1. 自动检测并初始化数据库表结构 (真正的“一键部署”自愈逻辑)
    try {
        // 尝试查询 settings 表,如果失败则说明数据库未初始化
        await c.env.DB.prepare('SELECT 1 FROM settings LIMIT 1').first();
    } catch (e) {
        console.log('Database not initialized. Starting auto-initialization...');
        try {
            // 执行完整初始化 SQL
            const initSql = [
                `CREATE TABLE IF NOT EXISTS folders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    parent_id INTEGER,
                    sort_order INTEGER DEFAULT 0,
                    is_deleted INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS bookmarks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    url TEXT NOT NULL,
                    description TEXT,
                    folder_id INTEGER,
                    is_deleted INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
                )`,
                `CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )`,
                // 索引优化
                `CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id) WHERE is_deleted = 0`,
                `CREATE INDEX IF NOT EXISTS idx_folders_is_deleted ON folders(is_deleted)`,
                `CREATE INDEX IF NOT EXISTS idx_folders_sort_order ON folders(sort_order ASC, name ASC) WHERE is_deleted = 0`,
                `CREATE INDEX IF NOT EXISTS idx_bookmarks_folder_id ON bookmarks(folder_id) WHERE is_deleted = 0`,
                `CREATE INDEX IF NOT EXISTS idx_bookmarks_is_deleted ON bookmarks(is_deleted)`,
                `CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(created_at DESC) WHERE is_deleted = 0`,
                `CREATE INDEX IF NOT EXISTS idx_bookmarks_url_folder ON bookmarks(url, folder_id)`
            ];

            for (const sql of initSql) {
                await c.env.DB.prepare(sql).run();
            }
            console.log('Database initialized successfully.');
        } catch (initErr) {
            console.error('Database auto-initialization failed:', initErr);
        }
    }

    // 2. 密钥自愈逻辑 (零配置核心)
    let dynamicSecret = envSecret;
    try {
        const dbSecretResult = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('secret_key').first();
        if (dbSecretResult) {
            // 如果环境变量缺失,优先使用数据库中的密钥
            if (!dynamicSecret) dynamicSecret = dbSecretResult.value as string;
        } else if (!dynamicSecret) {
            // 如果环境变量和数据库都缺失,则生成新密钥
            console.log('SECRET_KEY not found. Generating a new one...');
            const newSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                .map(b => b.toString(16).padStart(2, '0')).join('');
            // 使用 INSERT OR IGNORE 防止並發初始化衝突
            await c.env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind('secret_key', newSecret).run();

            // 再次讀取以確保拿到了正確的（可能是其他請求生成的）密鑰
            const finalResult = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('secret_key').first();
            dynamicSecret = (finalResult?.value as string) || newSecret;
        }
    } catch (e) {
        // 忽略,由后续逻辑处理
    }

    // 3. 初始化默认管理员配置 (使用 getSettings 同步或初始化)
    try {
        const settings = await getSettings(c.env.DB);
        if (!settings.username) {
            const defaultPassHash = await hashPassword('12345');
            // 使用 INSERT OR IGNORE 防止並發衝突
            await c.env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?), (?, ?)').bind('username', 'admin', 'password', defaultPassHash).run();
            cachedSettings = null; // 清除緩存以觸發下次刷新
        }
    } catch (e) {
        // 忽略,由步骤1处理
    }

    // 4. 字段迁移 (确保旧版本兼容)
    try {
        await c.env.DB.prepare('ALTER TABLE folders ADD COLUMN sort_order INTEGER DEFAULT 0').run();
    } catch (e) {
        // 忽略,说明列已存在
    }

    // 注入動態密鑰到 Context
    const finalSecret = dynamicSecret || 'dev-secret-key-fallback';
    c.set('sessionSecret', finalSecret);

    // Public routes
    if (c.req.path === '/api/login' || (c.req.path === '/' && !getCookie(c, 'auth'))) {
        return next();
    }

    // Check Auth - Signed Cookie
    const cookie = await getSignedCookie(c, finalSecret, 'auth');
    if (!cookie) {
        if (c.req.path.startsWith('/api/')) {
            return c.json({ error: 'Unauthorized' }, 401);
        }
        // Allow main page to load, frontend handles login form
        return next();
    }

    if (cookie !== 'true') {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    await next();
});

// Serve the frontend
app.get('/', (c) => c.html(html));

// API: Login
app.post('/api/login', async (c) => {
    const config = getConfig(c.env);
    const { username, password } = await c.req.json();

    // 输入验证
    const usernameValidation = v.validateUsername(username);
    if (!usernameValidation.valid) {
        return c.json({ error: usernameValidation.error }, 400);
    }

    const passwordValidation = v.validatePassword(password);
    if (!passwordValidation.valid) {
        return c.json({ error: passwordValidation.error }, 400);
    }

    const settings = await getSettings(c.env.DB);
    const dbUser = settings.username;
    const dbPass = settings.password;

    const inputHash = await hashPassword(password);

    const secret = c.get('sessionSecret');

    if (username === dbUser) {
        // 1. Check Hash
        if (inputHash === dbPass) {
            await setSignedCookie(c, 'auth', 'true', secret, {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                maxAge: config.sessionMaxAge
            });
            return c.json({ success: true });
        }

        // 2. Migration: Check Plaintext (Legacy)
        if (password === dbPass) {
            // Match found with plaintext! Update DB to hash immediately.
            await c.env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(inputHash, 'password').run();
            cachedSettings = null; // 刷新缓存
            await setSignedCookie(c, 'auth', 'true', secret, {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                maxAge: config.sessionMaxAge
            });
            return c.json({ success: true });
        }
    }
    return c.json({ error: 'Invalid credentials' }, 401);
});

// API: Logout
app.post('/api/logout', async (c) => {
    deleteCookie(c, 'auth');
    return c.json({ success: true });
});

// API: Update Settings
app.put('/api/settings', async (c) => {
    const { username, password } = await c.req.json();

    if (username) {
        const validation = v.validateUsername(username);
        if (!validation.valid) {
            return c.json({ error: validation.error }, 400);
        }
        await c.env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(username, 'username').run();
    }

    if (password) {
        const validation = v.validatePassword(password);
        if (!validation.valid) {
            return c.json({ error: validation.error }, 400);
        }
        const passHash = await hashPassword(password);
        await c.env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(passHash, 'password').run();
    }

    cachedSettings = null; // 統一在此處清除緩存
    return c.json({ success: true });
});

// API: Get all data (Protected)
app.get('/api/data', async (c) => {
    const config = getConfig(c.env);
    const secret = c.get('sessionSecret');
    if (!await getSignedCookie(c, secret, 'auth')) return c.json({ error: 'Unauthorized' }, 401);
    const { results: folders } = await c.env.DB.prepare('SELECT * FROM folders WHERE is_deleted = 0 ORDER BY sort_order ASC, name ASC').all();
    const { results: bookmarks } = await c.env.DB.prepare('SELECT * FROM bookmarks WHERE is_deleted = 0 ORDER BY created_at ASC').all();
    return c.json({ folders, bookmarks });
});

// API: Create Folder
app.post('/api/folders', async (c) => {
    const { name, parent_id } = await c.req.json();

    // 输入验证
    const nameValidation = v.validateFolderName(name);
    if (!nameValidation.valid) {
        return c.json({ error: nameValidation.error }, 400);
    }

    // 验证 parent_id (如果提供)
    let parentId = null;
    if (parent_id !== null && parent_id !== undefined) {
        const idValidation = v.validateId(parent_id);
        if (!idValidation.valid) {
            return c.json({ error: idValidation.error }, 400);
        }
        parentId = idValidation.parsed;
    }

    await c.env.DB.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)')
        .bind(nameValidation.valid ? v.sanitizeString(name, 255) : name, parentId)
        .run();

    return c.json({ success: true });
});

// API: Reorder Folders (must come before :id route)
app.put('/api/folders/reorder', async (c) => {
    const { orderedIds } = await c.req.json();
    const batch = orderedIds.map((id: number, index: number) => {
        return c.env.DB.prepare('UPDATE folders SET sort_order = ? WHERE id = ?').bind(index, id);
    });
    await c.env.DB.batch(batch);
    return c.json({ success: true });
});

// API: Update Folder
app.put('/api/folders/:id', async (c) => {
    const id = c.req.param('id');
    const { name, parent_id } = await c.req.json();

    // 验证 ID
    const idValidation = v.validateId(id);
    if (!idValidation.valid) {
        return c.json({ error: idValidation.error }, 400);
    }

    // 验证名称
    if (name) {
        const nameValidation = v.validateFolderName(name);
        if (!nameValidation.valid) {
            return c.json({ error: nameValidation.error }, 400);
        }
    }

    // Validate: Cannot set parent to itself (basic check, full cycle check is harder in SQL but UI should prevent it)
    if (parent_id && idValidation.parsed === parseInt(parent_id.toString())) {
        return c.json({ error: 'Cannot move folder into itself' }, 400);
    }

    if (parent_id !== undefined) {
        await c.env.DB.prepare('UPDATE folders SET name = ?, parent_id = ? WHERE id = ?')
            .bind(v.sanitizeString(name, 255), parent_id, idValidation.parsed).run();
    } else {
        await c.env.DB.prepare('UPDATE folders SET name = ? WHERE id = ?')
            .bind(v.sanitizeString(name, 255), idValidation.parsed).run();
    }

    return c.json({ success: true });
});

// Helper:高效循環軟刪除 (避免深度遞歸導致的 D1 限制)
async function softDeleteFolder(db: D1Database, folderId: number | string) {
    const idsToProcess = [folderId];
    const allFolderIds = [folderId];

    // 1. 廣度優先搜索所有子文件夾 ID
    while (idsToProcess.length > 0) {
        const currentId = idsToProcess.shift();
        const { results } = await db.prepare('SELECT id FROM folders WHERE parent_id = ? AND is_deleted = 0').bind(currentId).all();
        for (const row of results) {
            allFolderIds.push(row.id as number);
            idsToProcess.push(row.id as number);
        }
    }

    // 2. 批量更新書籤與文件夾狀態
    const batch = [];
    for (const id of allFolderIds) {
        batch.push(db.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE folder_id = ?').bind(id));
        batch.push(db.prepare('UPDATE folders SET is_deleted = 1 WHERE id = ?').bind(id));
    }

    if (batch.length > 0) {
        await db.batch(batch);
    }
}

// API: Delete Folder
app.delete('/api/folders/:id', async (c) => {
    const id = c.req.param('id');

    // 验证 ID
    const idValidation = v.validateId(id);
    if (!idValidation.valid) {
        return c.json({ error: idValidation.error }, 400);
    }

    await softDeleteFolder(c.env.DB, idValidation.parsed!);
    return c.json({ success: true });
});

// API: Create Bookmark
app.post('/api/bookmarks', async (c) => {
    const { title, url, folder_id } = await c.req.json();

    // 输入验证
    const titleValidation = v.validateBookmarkTitle(title);
    if (!titleValidation.valid) {
        return c.json({ error: titleValidation.error }, 400);
    }

    const urlValidation = v.validateUrl(url);
    if (!urlValidation.valid) {
        return c.json({ error: urlValidation.error }, 400);
    }

    // 验证 folder_id (如果提供)
    let folderId = null;
    if (folder_id !== null && folder_id !== undefined) {
        const idValidation = v.validateId(folder_id);
        if (!idValidation.valid) {
            return c.json({ error: idValidation.error }, 400);
        }
        folderId = idValidation.parsed;
    }

    await c.env.DB.prepare('INSERT INTO bookmarks (title, url, folder_id) VALUES (?, ?, ?)')
        .bind(v.sanitizeString(title, 500), urlValidation.sanitized, folderId)
        .run();

    return c.json({ success: true });
});

// API: Reorder Bookmarks (must come before :id route)
app.put('/api/bookmarks/reorder', async (c) => {
    try {
        const { orderedIds } = await c.req.json();

        if (!Array.isArray(orderedIds)) {
            return c.json({ error: 'Invalid input: orderedIds must be an array' }, 400);
        }

        if (orderedIds.length === 0) {
            return c.json({ error: 'Invalid input: orderedIds is empty' }, 400);
        }

        // 验证所有 ID
        for (let i = 0; i < orderedIds.length; i++) {
            const id = orderedIds[i];
            const idValidation = v.validateId(id);
            if (!idValidation.valid) {
                return c.json({ error: idValidation.error }, 400);
            }
        }

        // 获取当前时间作为基准
        const now = Date.now();

        // 批量更新时间戳以实现排序
        const batch = orderedIds.map((id: number, index: number) => {
            // 每个书签的时间戳间隔 1 秒,保持顺序
            const timestamp = new Date(now - (orderedIds.length - index) * 1000).toISOString();
            return c.env.DB.prepare('UPDATE bookmarks SET created_at = ? WHERE id = ?')
                .bind(timestamp, id);
        });

        try {
            await c.env.DB.batch(batch);
            return c.json({ success: true });
        } catch (error: any) {
            return c.json({ error: 'Database error: ' + error.message }, 500);
        }
    } catch (error: any) {
        return c.json({ error: 'Request processing error: ' + error.message }, 400);
    }
});

// API: Update Bookmark
app.put('/api/bookmarks/:id', async (c) => {
    const id = c.req.param('id');
    const { title, url, folder_id } = await c.req.json();

    // 验证 ID
    const idValidation = v.validateId(id);
    if (!idValidation.valid) {
        return c.json({ error: idValidation.error }, 400);
    }

    // 验证标题
    if (title) {
        const titleValidation = v.validateBookmarkTitle(title);
        if (!titleValidation.valid) {
            return c.json({ error: titleValidation.error }, 400);
        }
    }

    // 验证 URL
    let sanitizedUrl = undefined;
    if (url) {
        const urlValidation = v.validateUrl(url);
        if (!urlValidation.valid) {
            return c.json({ error: urlValidation.error }, 400);
        }
        sanitizedUrl = urlValidation.sanitized;
    }

    if (folder_id !== undefined) {
        await c.env.DB.prepare('UPDATE bookmarks SET title = ?, url = ?, folder_id = ? WHERE id = ?')
            .bind(v.sanitizeString(title, 500), sanitizedUrl, folder_id, idValidation.parsed).run();
    } else {
        await c.env.DB.prepare('UPDATE bookmarks SET title = ?, url = ? WHERE id = ?')
            .bind(v.sanitizeString(title, 500), sanitizedUrl, idValidation.parsed).run();
    }

    return c.json({ success: true });
});

// API: Delete Bookmark
app.delete('/api/bookmarks/:id', async (c) => {
    const id = c.req.param('id');

    // 验证 ID
    const idValidation = v.validateId(id);
    if (!idValidation.valid) {
        return c.json({ error: idValidation.error }, 400);
    }

    await c.env.DB.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE id = ?').bind(idValidation.parsed).run();
    return c.json({ success: true });
});

// Helper: Generate Netscape HTML
function generateNetscapeHTML(folders: any[], bookmarks: any[], parentId: number | null = null, indent: string = ''): string {
    let html = '';
    const currentFolders = folders.filter(f => f.parent_id === parentId);
    const currentBookmarks = bookmarks.filter(b => b.folder_id === parentId);

    if (currentFolders.length > 0 || currentBookmarks.length > 0) {
        html += `\n${indent}<DL><p>\n`;

        for (const folder of currentFolders) {
            html += `${indent}    <DT><H3>${folder.name}</H3>\n`;
            html += generateNetscapeHTML(folders, bookmarks, folder.id, indent + '    ');
            html += `${indent}    </DT>\n`;
        }

        for (const bookmark of currentBookmarks) {
            html += `${indent}    <DT><A HREF="${bookmark.url}">${bookmark.title}</A>\n`;
        }

        html += `${indent}</DL><p>\n`;
    }
    return html;
}

// API: Get Trash
app.get('/api/trash', async (c) => {
    const config = getConfig(c.env);
    const secret = c.get('sessionSecret');
    if (!await getSignedCookie(c, secret, 'auth')) return c.json({ error: 'Unauthorized' }, 401);
    const { results: folders } = await c.env.DB.prepare('SELECT * FROM folders WHERE is_deleted = 1 ORDER BY name').all();
    const { results: bookmarks } = await c.env.DB.prepare('SELECT * FROM bookmarks WHERE is_deleted = 1 ORDER BY created_at DESC').all();
    return c.json({ folders, bookmarks });
});

// API: Restore Folder
app.post('/api/restore/folders/:id', async (c) => {
    const id = c.req.param('id');

    // 验证 ID
    const idValidation = v.validateId(id);
    if (!idValidation.valid) {
        return c.json({ error: idValidation.error }, 400);
    }

    await c.env.DB.prepare('UPDATE folders SET is_deleted = 0 WHERE id = ?').bind(idValidation.parsed).run();
    return c.json({ success: true });
});

// API: Restore Bookmark
app.post('/api/restore/bookmarks/:id', async (c) => {
    const id = c.req.param('id');

    // 验证 ID
    const idValidation = v.validateId(id);
    if (!idValidation.valid) {
        return c.json({ error: idValidation.error }, 400);
    }

    await c.env.DB.prepare('UPDATE bookmarks SET is_deleted = 0 WHERE id = ?').bind(idValidation.parsed).run();
    return c.json({ success: true });
});

// API: Permanent Delete Folder
app.delete('/api/trash/folders/:id', async (c) => {
    const id = c.req.param('id');

    // 验证 ID
    const idValidation = v.validateId(id);
    if (!idValidation.valid) {
        return c.json({ error: idValidation.error }, 400);
    }

    await c.env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(idValidation.parsed).run();
    return c.json({ success: true });
});

// API: Permanent Delete Bookmark
app.delete('/api/trash/bookmarks/:id', async (c) => {
    const id = c.req.param('id');

    // 验证 ID
    const idValidation = v.validateId(id);
    if (!idValidation.valid) {
        return c.json({ error: idValidation.error }, 400);
    }

    await c.env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(idValidation.parsed).run();
    return c.json({ success: true });
});

// API: Empty Trash
app.delete('/api/trash/empty', async (c) => {
    await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM folders WHERE is_deleted = 1'),
        c.env.DB.prepare('DELETE FROM bookmarks WHERE is_deleted = 1')
    ]);
    return c.json({ success: true });
});

// API: Export
app.get('/api/export', async (c) => {
    const secret = c.get('sessionSecret');
    if (!await getSignedCookie(c, secret, 'auth')) return c.json({ error: 'Unauthorized' }, 401);

    const { results: folders } = await c.env.DB.prepare('SELECT * FROM folders').all();
    const { results: bookmarks } = await c.env.DB.prepare('SELECT * FROM bookmarks').all();

    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
`;

    html += generateNetscapeHTML(folders, bookmarks);

    c.header('Content-Type', 'application/x-netscape-bookmark');
    c.header('Content-Disposition', 'attachment; filename="bookmarks.html"');
    return c.body(html);
});

// API: Import
app.post('/api/import', async (c) => {
    const secret = c.get('sessionSecret');
    if (!await getSignedCookie(c, secret, 'auth')) return c.json({ error: 'Unauthorized' }, 401);


    const body = await c.req.text();

    // Simple Line-based parser
    const lines = body.split('\n');
    const stack: (number | null)[] = [null]; // Root is null
    let lastFolderId: number | null = null;

    // Batching for bookmarks
    const bookmarkBatch: { title: string, url: string, folderId: number | null }[] = [];
    const BATCH_SIZE = 50;

    const flushBookmarks = async () => {
        if (bookmarkBatch.length === 0) return;

        const stmts = bookmarkBatch.map(b => {
            return c.env.DB.prepare(
                'INSERT INTO bookmarks (title, url, folder_id) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bookmarks WHERE url = ? AND folder_id IS ?)'
            ).bind(b.title, b.url, b.folderId, b.url, b.folderId);
        });

        await c.env.DB.batch(stmts);
        bookmarkBatch.length = 0;
    };

    for (let line of lines) {
        line = line.trim();

        if (/<DL>/i.test(line)) {
            stack.push(lastFolderId);
        } else if (/<\/DL>/i.test(line)) {
            stack.pop();
        } else if (/<H3.*?>(.*?)<\/H3>/i.test(line)) {
            // Flush bookmarks before processing a new folder to ensure order (though not strictly necessary for ID integrity, good for consistency)
            await flushBookmarks();

            const match = line.match(/<H3.*?>(.*?)<\/H3>/i);
            if (match) {
                const name = match[1];
                const parentId = stack[stack.length - 1];

                // Deduplication: Check if folder exists
                // Folders are less frequent, so checking one by one is acceptable for now, 
                // but could be optimized if needed.
                const existing = await c.env.DB.prepare('SELECT id FROM folders WHERE name = ? AND parent_id IS ?')
                    .bind(name, parentId)
                    .first();

                if (existing) {
                    lastFolderId = existing.id as number;
                } else {
                    const { meta } = await c.env.DB.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)').bind(name, parentId).run();
                    lastFolderId = meta.last_row_id as number;
                }
            }
        } else if (/<A.*?HREF="(.*?)".*?>(.*?)<\/A>/i.test(line)) {
            const match = line.match(/<A.*?HREF="(.*?)".*?>(.*?)<\/A>/i);
            if (match) {
                const url = match[1];
                const title = match[2];
                const parentId = stack[stack.length - 1];

                bookmarkBatch.push({ title, url, folderId: parentId });

                if (bookmarkBatch.length >= BATCH_SIZE) {
                    await flushBookmarks();
                }
            }
        }
    }

    // Flush remaining bookmarks
    await flushBookmarks();

    return c.json({ success: true });
});

export default app;
