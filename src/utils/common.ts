import { Bindings } from '../types';
import { D1Database } from '@cloudflare/workers-types';

export async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function getConfig(env: Bindings) {
    return {
        sessionMaxAge: parseInt(env.SESSION_MAX_AGE || '604800'), // 7 days
        rateLimitMax: parseInt(env.RATE_LIMIT_MAX || '100'),
        rateLimitWindow: parseInt(env.RATE_LIMIT_WINDOW || '60'), // 60 seconds
    };
}

let cachedSettings: Record<string, string> | null = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 30000; // 30s

export async function getSettings(db: D1Database): Promise<Record<string, string>> {
    const now = Date.now();
    if (cachedSettings && (now - lastCacheUpdate < CACHE_TTL)) {
        return cachedSettings;
    }

    const { results } = await db.prepare('SELECT key, value FROM settings').all();
    const settings: Record<string, string> = {};
    results.forEach((row: any) => {
        settings[row.key] = row.value;
    });

    cachedSettings = settings;
    lastCacheUpdate = now;
    return settings;
}

export function invalidateSettingsCache() {
    cachedSettings = null;
}
