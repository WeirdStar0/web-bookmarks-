
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { html } from './html';

type Bindings = {
    DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware: Auth & Init
app.use('*', async (c, next) => {
    // Init default settings if not exists
    try {
        const { results } = await c.env.DB.prepare('SELECT * FROM settings WHERE key = ?').bind('username').all();
        if (results.length === 0) {
            await c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?), (?, ?)').bind('username', 'admin', 'password', '12345').run();
        }
    } catch (e) {
        // Ignore error if table doesn't exist yet (will be created by d1 execute)
    }

    // Migration: Ensure sort_order column exists in folders
    try {
        await c.env.DB.prepare('ALTER TABLE folders ADD COLUMN sort_order INTEGER DEFAULT 0').run();
    } catch (e) {
        // Ignore error if column already exists
    }

    // Public routes
    if (c.req.path === '/api/login' || (c.req.path === '/' && !getCookie(c, 'auth'))) {
        return next();
    }

    // Check Auth
    const cookie = getCookie(c, 'auth');
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
    const { username, password } = await c.req.json();
    const { results } = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('username').all();
    const dbUser = results[0]?.value;
    const { results: passResults } = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('password').all();
    const dbPass = passResults[0]?.value;

    if (username === dbUser && password === dbPass) {
        setCookie(c, 'auth', 'true', { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 86400 * 7 });
        return c.json({ success: true });
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
    if (username) await c.env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(username, 'username').run();
    if (password) await c.env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(password, 'password').run();
    return c.json({ success: true });
});

// API: Get all data (Protected)
app.get('/api/data', async (c) => {
    if (!getCookie(c, 'auth')) return c.json({ error: 'Unauthorized' }, 401);
    const { results: folders } = await c.env.DB.prepare('SELECT * FROM folders WHERE is_deleted = 0 ORDER BY sort_order ASC, name ASC').all();
    const { results: bookmarks } = await c.env.DB.prepare('SELECT * FROM bookmarks WHERE is_deleted = 0 ORDER BY created_at DESC').all();
    return c.json({ folders, bookmarks });
});

// API: Create Folder
app.post('/api/folders', async (c) => {
    const { name, parent_id } = await c.req.json();
    await c.env.DB.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)')
        .bind(name, parent_id || null)
        .run();
    return c.json({ success: true });
});

// API: Update Folder
app.put('/api/folders/:id', async (c) => {
    const id = c.req.param('id');
    const { name } = await c.req.json();
    await c.env.DB.prepare('UPDATE folders SET name = ? WHERE id = ?').bind(name, id).run();
    return c.json({ success: true });
});

// API: Reorder Folders
app.put('/api/folders/reorder', async (c) => {
    const { orderedIds } = await c.req.json();
    const batch = orderedIds.map((id: number, index: number) => {
        return c.env.DB.prepare('UPDATE folders SET sort_order = ? WHERE id = ?').bind(index, id);
    });
    await c.env.DB.batch(batch);
    return c.json({ success: true });
});

// Helper: Recursive Soft Delete
async function softDeleteFolder(db: D1Database, folderId: number | string) {
    // 1. Delete bookmarks in this folder
    await db.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE folder_id = ?').bind(folderId).run();

    // 2. Find subfolders
    const { results: subfolders } = await db.prepare('SELECT id FROM folders WHERE parent_id = ?').bind(folderId).all();

    // 3. Recursively delete subfolders
    for (const sub of subfolders) {
        await softDeleteFolder(db, sub.id as number);
    }

    // 4. Delete the folder itself
    await db.prepare('UPDATE folders SET is_deleted = 1 WHERE id = ?').bind(folderId).run();
}

// API: Delete Folder
app.delete('/api/folders/:id', async (c) => {
    const id = c.req.param('id');
    await softDeleteFolder(c.env.DB, id);
    return c.json({ success: true });
});

// API: Create Bookmark
app.post('/api/bookmarks', async (c) => {
    const { title, url, folder_id } = await c.req.json();
    await c.env.DB.prepare('INSERT INTO bookmarks (title, url, folder_id) VALUES (?, ?, ?)')
        .bind(title, url, folder_id || null)
        .run();
    return c.json({ success: true });
});

// API: Update Bookmark
app.put('/api/bookmarks/:id', async (c) => {
    const id = c.req.param('id');
    const { title, url, folder_id } = await c.req.json();

    if (folder_id !== undefined) {
        await c.env.DB.prepare('UPDATE bookmarks SET title = ?, url = ?, folder_id = ? WHERE id = ?').bind(title, url, folder_id, id).run();
    } else {
        await c.env.DB.prepare('UPDATE bookmarks SET title = ?, url = ? WHERE id = ?').bind(title, url, id).run();
    }
    return c.json({ success: true });
});

// API: Delete Bookmark
app.delete('/api/bookmarks/:id', async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE id = ?').bind(id).run();
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
    if (!getCookie(c, 'auth')) return c.json({ error: 'Unauthorized' }, 401);
    const { results: folders } = await c.env.DB.prepare('SELECT * FROM folders WHERE is_deleted = 1 ORDER BY name').all();
    const { results: bookmarks } = await c.env.DB.prepare('SELECT * FROM bookmarks WHERE is_deleted = 1 ORDER BY created_at DESC').all();
    return c.json({ folders, bookmarks });
});

// API: Restore Folder
app.post('/api/restore/folders/:id', async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('UPDATE folders SET is_deleted = 0 WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// API: Restore Bookmark
app.post('/api/restore/bookmarks/:id', async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('UPDATE bookmarks SET is_deleted = 0 WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// API: Permanent Delete Folder
app.delete('/api/trash/folders/:id', async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// API: Permanent Delete Bookmark
app.delete('/api/trash/bookmarks/:id', async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run();
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
    if (!getCookie(c, 'auth')) return c.json({ error: 'Unauthorized' }, 401);

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
    if (!getCookie(c, 'auth')) return c.json({ error: 'Unauthorized' }, 401);

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
