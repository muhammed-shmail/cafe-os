import { cookies } from 'next/headers';
import { PLATFORM_COOKIE, verifyPlatformSession, type PlatformSession } from './platform-auth';

/**
 * Read the current PlatformAdmin session in a server component / route handler.
 * (Middleware reads the cookie off the request directly — see `middleware.ts`.)
 */
export async function getPlatformSession(): Promise<PlatformSession | null> {
  const token = cookies().get(PLATFORM_COOKIE)?.value;
  return token ? verifyPlatformSession(token) : null;
}
