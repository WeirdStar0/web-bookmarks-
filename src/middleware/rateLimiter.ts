/**
 * 速率限制中间件
 * 使用 Cloudflare Workers KV 存储来实现分布式速率限制
 */

interface RateLimitConfig {
    max: number;      // 最大请求数
    window: number;   // 时间窗口(秒)
}

interface RateLimitInfo {
    count: number;
    resetTime: number;
}

export class RateLimiter {
    private kv: KVNamespace;
    private config: RateLimitConfig;

    constructor(kv: KVNamespace, config: RateLimitConfig) {
        this.kv = kv;
        this.config = config;
    }

    /**
     * 检查速率限制
     * @param identifier 标识符(通常是 IP 地址或用户 ID)
     * @returns { allowed: boolean, limit: number, remaining: number, reset: number }
     */
    async check(identifier: string): Promise<{
        allowed: boolean;
        limit: number;
        remaining: number;
        reset: number;
    }> {
        const key = `ratelimit:${identifier}`;
        const now = Date.now();
        const windowStart = now - (this.config.window * 1000);

        try {
            // 获取当前限制信息
            const data = await this.kv.get(key, 'json') as RateLimitInfo | null;

            if (!data || data.resetTime < now) {
                // 窗口已过期或不存在,创建新的
                const newInfo: RateLimitInfo = {
                    count: 1,
                    resetTime: now + (this.config.window * 1000)
                };

                await this.kv.put(key, JSON.stringify(newInfo), {
                    expirationTtl: this.config.window
                });

                return {
                    allowed: true,
                    limit: this.config.max,
                    remaining: this.config.max - 1,
                    reset: newInfo.resetTime
                };
            }

            // 检查是否超过限制
            if (data.count >= this.config.max) {
                return {
                    allowed: false,
                    limit: this.config.max,
                    remaining: 0,
                    reset: data.resetTime
                };
            }

            // 增加计数
            data.count += 1;
            await this.kv.put(key, JSON.stringify(data), {
                expirationTtl: this.config.window
            });

            return {
                allowed: true,
                limit: this.config.max,
                remaining: this.config.max - data.count,
                reset: data.resetTime
            };

        } catch (error) {
            // KV 操作失败时,允许请求通过(降级策略)
            console.error('Rate limit check failed:', error);
            return {
                allowed: true,
                limit: this.config.max,
                remaining: this.config.max,
                reset: now + (this.config.window * 1000)
            };
        }
    }

    /**
     * 重置特定标识符的速率限制
     */
    async reset(identifier: string): Promise<void> {
        const key = `ratelimit:${identifier}`;
        await this.kv.delete(key);
    }
}

/**
 * 创建速率限制中间件
 */
export function createRateLimitMiddleware(config?: Partial<RateLimitConfig>) {
    return async (c: any, next: any) => {
        // 如果没有绑定 KV,跳过速率限制
        if (!c.env.RATE_LIMIT_KV) {
            return next();
        }

        // 从环境变量或使用默认配置
        const max = parseInt(c.env.RATE_LIMIT_MAX || '100');
        const window = parseInt(c.env.RATE_LIMIT_WINDOW || '60');

        const limiter = new RateLimiter(c.env.RATE_LIMIT_KV, {
            max: config?.max || max,
            window: config?.window || window
        });

        // 获取客户端标识符(IP 地址)
        const ip = c.req.header('cf-connecting-ip') ||
                   c.req.header('x-forwarded-for')?.split(',')[0] ||
                   'unknown';

        const result = await limiter.check(ip);

        // 设置速率限制响应头
        c.header('X-RateLimit-Limit', result.limit.toString());
        c.header('X-RateLimit-Remaining', result.remaining.toString());
        c.header('X-RateLimit-Reset', new Date(result.reset).toISOString());

        if (!result.allowed) {
            const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
            c.header('Retry-After', retryAfter.toString());
            return c.json({
                error: 'Too Many Requests',
                message: '请求过于频繁,请稍后再试',
                retryAfter
            }, 429);
        }

        return next();
    };
}
