import 'server-only';
import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (typeof window !== 'undefined') return null;
  if (!process.env.REDIS_URL) return null;

  if (!redisClient) {
    try {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        lazyConnect: true,
        retryStrategy: (times) => Math.min(times * 50, 2000),
      });

      redisClient.on('error', (err) => {
        console.warn('[Redis] Connection error:', err.message);
      });

      redisClient.on('connect', () => {
        console.log('[Redis] Connected successfully');
      });
    } catch (error) {
      console.warn('[Redis] Failed to create client:', error);
      return null;
    }
  }

  return redisClient;
}

export async function isRedisAvailable(): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
