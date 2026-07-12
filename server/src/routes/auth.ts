import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Ctx } from '../app.js';
import { StorageError } from '../storage.js';

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/**
 * Cookie model (PS5-style shared devices):
 * - mc_device_<userId>  long-lived per-user trust; survives "switch user", so each
 *   profile on a shared PC keeps its own PIN unlock.
 * - mc_last_user        which profile the short-lived session belongs to (for refresh).
 * - mc_token            15-min access token.
 * "Switch user" ends the session but keeps trust; "forget device" revokes trust.
 */
const TOKEN_COOKIE = 'mc_token';
const LAST_USER_COOKIE = 'mc_last_user';
const deviceCookie = (userId: string) => `mc_device_${userId}`;

const cookieOpts = { path: '/', httpOnly: true, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 365 };

export function authRoutes(app: FastifyInstance, ctx: Ctx, requireAuth: Guard): void {
  const { auth } = ctx;

  const cookies = (req: FastifyRequest) => (req.cookies ?? {}) as Record<string, string | undefined>;

  /** First run: create the owner profile. Only works while no users exist. */
  app.post('/auth/setup', async (req, reply) => {
    if (auth.userCount() > 0) throw new StorageError(409, 'already set up');
    const body = req.body as { username: string; displayName?: string; password: string; pin?: string };
    const user = auth.createUser({ ...body, isOwner: true });
    const session = auth.loginPassword(body.username, body.password, deviceName(req));
    setSessionCookies(reply, user.id, session.deviceToken, session.accessToken);
    return { user, accessToken: session.accessToken, deviceToken: session.deviceToken };
  });

  /** Public profile list for the welcome screen picker. */
  app.get('/auth/profiles', async () => ({
    setupNeeded: auth.userCount() === 0,
    maxUsers: ctx.config.maxUsers,
    profiles: auth.profiles(),
  }));

  app.post('/auth/login', async (req, reply) => {
    const body = req.body as { username: string; password: string; deviceName?: string };
    const session = auth.loginPassword(body.username, body.password, body.deviceName ?? deviceName(req));
    setSessionCookies(reply, session.user.id, session.deviceToken, session.accessToken);
    return session;
  });

  app.post('/auth/pin', async (req, reply) => {
    const body = req.body as { username: string; pin: string; deviceToken?: string };
    const user = auth.byUsername(body.username);
    const deviceToken = body.deviceToken ?? (user ? cookies(req)[deviceCookie(user.id)] : undefined);
    if (!deviceToken) throw new StorageError(401, 'device not trusted — sign in with password');
    const session = auth.loginPin(body.username, body.pin, deviceToken);
    reply.setCookie(TOKEN_COOKIE, session.accessToken, { ...cookieOpts, maxAge: 60 * 15 });
    reply.setCookie(LAST_USER_COOKIE, session.user.id, cookieOpts);
    return session;
  });

  /** Renew the access token for the current profile using its device trust. */
  app.post('/auth/refresh', async (req, reply) => {
    const body = (req.body ?? {}) as { deviceToken?: string };
    const lastUser = cookies(req)[LAST_USER_COOKIE];
    const deviceToken = body.deviceToken ?? (lastUser ? cookies(req)[deviceCookie(lastUser)] : undefined);
    const device = deviceToken ? auth.verifyDeviceToken(deviceToken) : null;
    if (!device) throw new StorageError(401, 'sign in again');
    const user = auth.byId(device.user_id);
    if (!user) throw new StorageError(401, 'sign in again');
    const accessToken = auth.accessToken(user);
    reply.setCookie(TOKEN_COOKIE, accessToken, { ...cookieOpts, maxAge: 60 * 15 });
    reply.setCookie(LAST_USER_COOKIE, user.id, cookieOpts);
    return { user: auth.toPublic(user), accessToken };
  });

  /** "Switch user": end the session but KEEP device trust so PIN unlock still works. */
  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(TOKEN_COOKIE, { path: '/' });
    reply.clearCookie(LAST_USER_COOKIE, { path: '/' });
    return { ok: true };
  });

  /** Revoke this device's trust for the signed-in profile (password required next time). */
  app.post('/auth/forget-device', { preHandler: requireAuth }, async (req, reply) => {
    const deviceToken = cookies(req)[deviceCookie(req.userId)];
    if (deviceToken) auth.logoutDevice(deviceToken);
    reply.clearCookie(deviceCookie(req.userId), { path: '/' });
    reply.clearCookie(TOKEN_COOKIE, { path: '/' });
    reply.clearCookie(LAST_USER_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    const user = auth.byId(req.userId);
    if (!user) throw new StorageError(401, 'gone');
    return { user: auth.toPublic(user), lastSync: auth.lastSync(req.userId) };
  });

  /** Add another profile (any signed-in user can, PS5-style, capped at maxUsers). */
  app.post('/auth/users', { preHandler: requireAuth }, async (req) => {
    const body = req.body as { username: string; displayName?: string; password: string; pin?: string; color?: string };
    return { user: auth.createUser(body) };
  });

  app.post('/auth/pin/set', { preHandler: requireAuth }, async (req) => {
    const body = req.body as { currentPassword: string; pin: string | null };
    auth.setPin(req.userId, body.currentPassword, body.pin);
    return { ok: true };
  });

  app.post('/auth/password/set', { preHandler: requireAuth }, async (req) => {
    const body = req.body as { currentPassword: string; newPassword: string };
    auth.setPassword(req.userId, body.currentPassword, body.newPassword);
    return { ok: true };
  });

  app.post('/auth/quota', { preHandler: requireAuth }, async (req) => {
    const body = req.body as { userId: string; quotaBytes: number | null };
    auth.setQuota(req.userId, body.userId, body.quotaBytes);
    return { ok: true };
  });

  function deviceName(req: FastifyRequest): string {
    const ua = req.headers['user-agent'] ?? '';
    if (/iphone|ipad/i.test(ua)) return 'iPhone/iPad';
    if (/android/i.test(ua)) return 'Android';
    if (/mac os/i.test(ua)) return 'Mac';
    if (/windows/i.test(ua)) return 'Windows PC';
    if (/linux/i.test(ua)) return 'Linux';
    return 'device';
  }

  function setSessionCookies(reply: FastifyReply, userId: string, deviceToken: string, accessToken: string): void {
    reply.setCookie(deviceCookie(userId), deviceToken, cookieOpts);
    reply.setCookie(LAST_USER_COOKIE, userId, cookieOpts);
    reply.setCookie(TOKEN_COOKIE, accessToken, { ...cookieOpts, maxAge: 60 * 15 });
  }
}
