import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { html } from './html';
import { Bindings, Variables } from './types';
import { initMiddleware } from './middleware/init';
import { rateLimitMiddleware } from './middleware/ratelimit';
import { authMiddleware } from './middleware/auth';
import apiRoutes from './routes/api';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', logger());
app.use('/api/*', cors({
    origin: (origin) => origin,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', secureHeaders({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// Global Error Handler
app.onError((err, c) => {
    console.error(`[Global Error]: ${err.stack || err.message}`);
    const status = (err as any).status || 500;
    return c.json({
        error: 'Internal Server Error',
        message: '服务器繁忙，请稍后再试'
    }, status);
});

app.notFound((c) => {
    return c.json({ error: 'Not Found', message: '资源不存在' }, 404);
});

// Middlewares
app.use('/api/*', rateLimitMiddleware);
app.use('*', initMiddleware);
app.use('*', authMiddleware);

// Routes
app.route('/api', apiRoutes);

// Frontend
app.get('/', (c) => c.html(html));

export default app;
