import { Context, Next } from 'hono';
import { getSignedCookie } from 'hono/cookie';
import { Bindings, Variables } from '../types';

export async function authMiddleware(c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) {
    const url = new URL(c.req.url);

    // Public paths
    if (url.pathname === '/' || url.pathname === '/api/login' || (!url.pathname.startsWith('/api') && !url.pathname.startsWith('/admin'))) {
        return next();
    }

    const secret = c.get('sessionSecret');
    const cookie = await getSignedCookie(c, secret, 'auth');

    if (cookie !== 'true') {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    await next();
}
