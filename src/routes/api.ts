import { Hono } from 'hono';
import { setSignedCookie, deleteCookie, getSignedCookie } from 'hono/cookie';
import { Bindings, Variables } from '../types';
import { getConfig, getSettings, hashPassword, hashPasswordV2, invalidateSettingsCache } from '../utils/common';
import * as v from '../utils/validators';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// API: Login
app.post('/login', async (c) => {
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
        // 1. Check V2 (PBKDF2) - Format: v2:salt:hash
        if (dbPass.startsWith('v2:')) {
            const parts = dbPass.split(':');
            if (parts.length === 3) {
                const salt = parts[1];
                const storedHash = parts[2];
                const result = await hashPasswordV2(password, salt);
                if (result.hash === storedHash) {
                    await setSignedCookie(c, 'auth', 'true', secret, {
                        httpOnly: true,
                        secure: true,
                        sameSite: 'None',
                        maxAge: config.sessionMaxAge
                    });
                    return c.json({ success: true });
                }
            }
        } else {
            // 2. Check V1 (SHA-256) & Migrate
            const inputHash = await hashPassword(password);
            if (inputHash === dbPass) {
                // Migrate to V2
                const v2 = await hashPasswordV2(password);
                const newDbValue = `v2:${v2.salt}:${v2.hash}`;
                await c.env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(newDbValue, 'password').run();
                invalidateSettingsCache();

                await setSignedCookie(c, 'auth', 'true', secret, {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'None',
                    maxAge: config.sessionMaxAge
                });
                return c.json({ success: true, migrated: true });
            }
        }
    }
    return c.json({ error: 'Invalid credentials' }, 401);
});

// API: Logout
app.post('/logout', async (c) => {
    deleteCookie(c, 'auth');
    return c.json({ success: true });
});

// API: Update Settings
app.put('/settings', async (c) => {
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
        const v2 = await hashPasswordV2(password);
        const newDbValue = `v2:${v2.salt}:${v2.hash}`;
        await c.env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(newDbValue, 'password').run();
    }

    invalidateSettingsCache();
    return c.json({ success: true });
});

// API: Get all data (Protected)
app.get('/data', async (c) => {
    const secret = c.get('sessionSecret');
    if (!await getSignedCookie(c, secret, 'auth')) return c.json({ error: 'Unauthorized' }, 401);
    const { results: folders } = await c.env.DB.prepare('SELECT * FROM folders WHERE is_deleted = 0 ORDER BY sort_order ASC, name ASC').all();
    const { results: bookmarks } = await c.env.DB.prepare('SELECT * FROM bookmarks WHERE is_deleted = 0 ORDER BY created_at ASC').all();
    return c.json({ folders, bookmarks });
});

// API: Search Bookmarks (Server-Side)
app.get('/search', async (c) => {
    const secret = c.get('sessionSecret');
    if (!await getSignedCookie(c, secret, 'auth')) return c.json({ error: 'Unauthorized' }, 401);

    const query = c.req.query('q');
    if (!query || query.trim().length === 0) {
        return c.json({ bookmarks: [] });
    }

    const { results: bookmarks } = await c.env.DB.prepare(
        'SELECT * FROM bookmarks WHERE is_deleted = 0 AND (title LIKE ? OR url LIKE ?) ORDER BY created_at DESC LIMIT 50'
    ).bind(`%${query}%`, `%${query}%`).all();

    return c.json({ bookmarks });
});

// API: Create Folder
app.post('/folders', async (c) => {
    const { name, parent_id } = await c.req.json();
    const nameValidation = v.validateFolderName(name);
    if (!nameValidation.valid) {
        return c.json({ error: nameValidation.error }, 400);
    }
    let parentId = null;
    if (parent_id !== null && parent_id !== undefined) {
        const idValidation = v.validateId(parent_id);
        if (!idValidation.valid) return c.json({ error: idValidation.error }, 400);
        parentId = idValidation.parsed;
    }
    await c.env.DB.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)').bind(nameValidation.valid ? v.sanitizeString(name, 255) : name, parentId).run();
    return c.json({ success: true });
});

// API: Reorder Folders
app.put('/folders/reorder', async (c) => {
    const { orderedIds } = await c.req.json();
    const batch = orderedIds.map((id: number, index: number) => {
        return c.env.DB.prepare('UPDATE folders SET sort_order = ? WHERE id = ?').bind(index, id);
    });
    await c.env.DB.batch(batch);
    return c.json({ success: true });
});

// API: Update Folder
app.put('/folders/:id', async (c) => {
    const id = c.req.param('id');
    const { name, parent_id } = await c.req.json();
    const idValidation = v.validateId(id);
    if (!idValidation.valid) return c.json({ error: idValidation.error }, 400);

    if (name) {
        const nameValidation = v.validateFolderName(name);
        if (!nameValidation.valid) return c.json({ error: nameValidation.error }, 400);
    }
    if (parent_id && idValidation.parsed === parseInt(parent_id.toString())) {
        return c.json({ error: 'Cannot move folder into itself' }, 400);
    }
    if (parent_id !== undefined) {
        await c.env.DB.prepare('UPDATE folders SET name = ?, parent_id = ? WHERE id = ?').bind(v.sanitizeString(name, 255), parent_id, idValidation.parsed).run();
    } else {
        await c.env.DB.prepare('UPDATE folders SET name = ? WHERE id = ?').bind(v.sanitizeString(name, 255), idValidation.parsed).run();
    }
    return c.json({ success: true });
});

async function softDeleteFolder(db: any, folderId: any) {
    const idsToProcess = [folderId];
    const allFolderIds = [folderId];
    while (idsToProcess.length > 0) {
        const currentId = idsToProcess.shift();
        const { results } = await db.prepare('SELECT id FROM folders WHERE parent_id = ? AND is_deleted = 0').bind(currentId).all();
        for (const row of results) {
            allFolderIds.push(row.id as number);
            idsToProcess.push(row.id as number);
        }
    }
    const batch = [];
    for (const id of allFolderIds) {
        batch.push(db.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE folder_id = ?').bind(id));
        batch.push(db.prepare('UPDATE folders SET is_deleted = 1 WHERE id = ?').bind(id));
    }
    if (batch.length > 0) await db.batch(batch);
}

// API: Delete Folder
app.delete('/folders/:id', async (c) => {
    const id = c.req.param('id');
    const idValidation = v.validateId(id);
    if (!idValidation.valid) return c.json({ error: idValidation.error }, 400);
    await softDeleteFolder(c.env.DB, idValidation.parsed!);
    return c.json({ success: true });
});

// API: Create Bookmark
app.post('/bookmarks', async (c) => {
    const { title, url, folder_id } = await c.req.json();
    const titleValidation = v.validateBookmarkTitle(title);
    if (!titleValidation.valid) return c.json({ error: titleValidation.error }, 400);
    const urlValidation = v.validateUrl(url);
    if (!urlValidation.valid) return c.json({ error: urlValidation.error }, 400);

    let folderId = null;
    if (folder_id !== null && folder_id !== undefined) {
        const idValidation = v.validateId(folder_id);
        if (!idValidation.valid) return c.json({ error: idValidation.error }, 400);
        folderId = idValidation.parsed;
    }
    await c.env.DB.prepare('INSERT INTO bookmarks (title, url, folder_id) VALUES (?, ?, ?)').bind(v.sanitizeString(title, 500), urlValidation.sanitized, folderId).run();
    return c.json({ success: true });
});

// API: Reorder Bookmarks
app.put('/bookmarks/reorder', async (c) => {
    try {
        const { orderedIds } = await c.req.json();
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) return c.json({ error: 'Invalid input' }, 400);
        for (let i = 0; i < orderedIds.length; i++) {
            if (!v.validateId(orderedIds[i]).valid) return c.json({ error: 'Invalid ID' }, 400);
        }
        const now = Date.now();
        const batch = orderedIds.map((id: number, index: number) => {
            const timestamp = new Date(now - (orderedIds.length - index) * 1000).toISOString();
            return c.env.DB.prepare('UPDATE bookmarks SET created_at = ? WHERE id = ?').bind(timestamp, id);
        });
        await c.env.DB.batch(batch);
        return c.json({ success: true });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

// API: Update Bookmark
app.put('/bookmarks/:id', async (c) => {
    const id = c.req.param('id');
    const { title, url, folder_id } = await c.req.json();
    const idValidation = v.validateId(id);
    if (!idValidation.valid) return c.json({ error: idValidation.error }, 400);

    if (title) {
        if (!v.validateBookmarkTitle(title).valid) return c.json({ error: 'Invalid title' }, 400);
    }
    let sanitizedUrl = undefined;
    if (url) {
        const uv = v.validateUrl(url);
        if (!uv.valid) return c.json({ error: uv.error }, 400);
        sanitizedUrl = uv.sanitized;
    }
    if (folder_id !== undefined) {
        await c.env.DB.prepare('UPDATE bookmarks SET title = ?, url = ?, folder_id = ? WHERE id = ?').bind(v.sanitizeString(title, 500), sanitizedUrl, folder_id, idValidation.parsed).run();
    } else {
        await c.env.DB.prepare('UPDATE bookmarks SET title = ?, url = ? WHERE id = ?').bind(v.sanitizeString(title, 500), sanitizedUrl, idValidation.parsed).run();
    }
    return c.json({ success: true });
});

// API: Delete Bookmark
app.delete('/bookmarks/:id', async (c) => {
    const id = c.req.param('id');
    const idValidation = v.validateId(id);
    if (!idValidation.valid) return c.json({ error: idValidation.error }, 400);
    await c.env.DB.prepare('UPDATE bookmarks SET is_deleted = 1 WHERE id = ?').bind(idValidation.parsed).run();
    return c.json({ success: true });
});

function generateNetscapeHTML(folders: any[], bookmarks: any[], parentId: number | null = null, indent: string = ''): string {
    let html = '';
    const f = folders.filter(f => f.parent_id === parentId);
    const b = bookmarks.filter(b => b.folder_id === parentId);
    if (f.length > 0 || b.length > 0) {
        html += `\n${indent}<DL><p>\n`;
        for (const folder of f) {
            html += `${indent}    <DT><H3>${folder.name}</H3>\n`;
            html += generateNetscapeHTML(folders, bookmarks, folder.id, indent + '    ');
            html += `${indent}    </DT>\n`;
        }
        for (const bookmark of b) {
            html += `${indent}    <DT><A HREF="${bookmark.url}">${bookmark.title}</A>\n`;
        }
        html += `${indent}</DL><p>\n`;
    }
    return html;
}

// API: Get Trash
app.get('/trash', async (c) => {
    const secret = c.get('sessionSecret');
    if (!await getSignedCookie(c, secret, 'auth')) return c.json({ error: 'Unauthorized' }, 401);
    const { results: folders } = await c.env.DB.prepare('SELECT * FROM folders WHERE is_deleted = 1 ORDER BY name').all();
    const { results: bookmarks } = await c.env.DB.prepare('SELECT * FROM bookmarks WHERE is_deleted = 1 ORDER BY created_at DESC').all();
    return c.json({ folders, bookmarks });
});

// API: Restore/PermanentDelete (Simplified for brevity as exact same logic)
app.post('/restore/folders/:id', async (c) => {
    const id = c.req.param('id');
    if (!v.validateId(id).valid) return c.json({ error: 'Invalid ID' }, 400);
    await c.env.DB.prepare('UPDATE folders SET is_deleted = 0 WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});
app.post('/restore/bookmarks/:id', async (c) => {
    const id = c.req.param('id');
    if (!v.validateId(id).valid) return c.json({ error: 'Invalid ID' }, 400);
    await c.env.DB.prepare('UPDATE bookmarks SET is_deleted = 0 WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});
app.delete('/trash/folders/:id', async (c) => {
    const id = c.req.param('id');
    if (!v.validateId(id).valid) return c.json({ error: 'Invalid ID' }, 400);
    await c.env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});
app.delete('/trash/bookmarks/:id', async (c) => {
    const id = c.req.param('id');
    if (!v.validateId(id).valid) return c.json({ error: 'Invalid ID' }, 400);
    await c.env.DB.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});
app.delete('/trash/empty', async (c) => {
    await c.env.DB.batch([c.env.DB.prepare('DELETE FROM folders WHERE is_deleted = 1'), c.env.DB.prepare('DELETE FROM bookmarks WHERE is_deleted = 1')]);
    return c.json({ success: true });
});

app.get('/export', async (c) => {
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

app.post('/import', async (c) => {
    const secret = c.get('sessionSecret');
    if (!await getSignedCookie(c, secret, 'auth')) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.text();
    const lines = body.split('\n');
    const stack: (number | null)[] = [null];
    let lastFolderId: number | null = null;
    const bookmarkBatch: any[] = [];
    const BATCH_SIZE = 50;
    const flushBookmarks = async () => {
        if (bookmarkBatch.length === 0) return;
        const stmts = bookmarkBatch.map(b => {
            return c.env.DB.prepare('INSERT INTO bookmarks (title, url, folder_id) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bookmarks WHERE url = ? AND folder_id IS ?)').bind(b.title, b.url, b.folderId, b.url, b.folderId);
        });
        await c.env.DB.batch(stmts);
        bookmarkBatch.length = 0;
    };
    for (let line of lines) {
        line = line.trim();
        if (/<DL>/i.test(line)) stack.push(lastFolderId);
        else if (/<\/DL>/i.test(line)) stack.pop();
        else if (/<H3.*?>(.*?)<\/H3>/i.test(line)) {
            await flushBookmarks();
            const match = line.match(/<H3.*?>(.*?)<\/H3>/i);
            if (match) {
                const name = match[1];
                const parentId = stack[stack.length - 1];
                const existing: any = await c.env.DB.prepare('SELECT id FROM folders WHERE name = ? AND parent_id IS ?').bind(name, parentId).first();
                if (existing) lastFolderId = existing.id;
                else {
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
                if (bookmarkBatch.length >= BATCH_SIZE) await flushBookmarks();
            }
        }
    }
    await flushBookmarks();
    return c.json({ success: true });
});

export default app;
