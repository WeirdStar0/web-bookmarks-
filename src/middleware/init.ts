import { Context, Next } from 'hono';
import { Bindings, Variables } from '../types';
import { INIT_SQL } from '../db/schema';
import { getSettings, hashPassword } from '../utils/common';

export async function initMiddleware(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
    const envSecret = c.env.SECRET_KEY;

    // 1. Auto-init DB
    try {
        await c.env.DB.prepare('SELECT 1 FROM settings LIMIT 1').first();
    } catch (e) {
        console.log('Database not initialized. Starting auto-initialization...');
        try {
            for (const sql of INIT_SQL) {
                await c.env.DB.prepare(sql).run();
            }
            console.log('Database initialized successfully.');
        } catch (initErr) {
            console.error('Database auto-initialization failed:', initErr);
        }
    }

    // 2. Dynamic Secret Logic
    let dynamicSecret = envSecret;
    try {
        const dbSecretResult = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('secret_key').first();
        if (dbSecretResult) {
            dynamicSecret = dbSecretResult.value as string;
        } else {
            // Generate and save new secret if not exists
            const newSecret = crypto.randomUUID();
            try {
                // Try insert
                await c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('secret_key', newSecret).run();
                dynamicSecret = newSecret;
            } catch (insertErr) {
                // Concurrency fallback
                const finalResult = await c.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('secret_key').first();
                dynamicSecret = (finalResult?.value as string) || newSecret;
            }
        }
    } catch (e) {
        // Ignore
    }

    // Ensure dynamicSecret is a string (fallback if undefined)
    c.set('sessionSecret', dynamicSecret || 'default-secret');

    // 3. Init Default Admin
    try {
        const settings = await getSettings(c.env.DB);
        if (!settings.username) {
            const defaultPassHash = await hashPassword('12345');
            try {
                await c.env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind('username', 'admin').run();
                await c.env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind('password', defaultPassHash).run();
                // Invalidate cache
                // cachedSettings is handled in common.ts, but we might need to force reload or wait for TTL
            } catch (e) {
                console.error("Failed to init default admin", e);
            }
        }
    } catch (e) {
        console.error('Error in Init Middleware settings check', e);
    }

    await next();
}
