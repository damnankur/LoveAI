import { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { pool } from '../db';
import { config } from '../config';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

interface GoogleProfile {
  email: string;
  name: string | null;
  picture: string | null;
}

// Verify a Google ID token against Google's tokeninfo endpoint.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  // Dev-only bypass: with AUTH_ALLOW_DEV_TOKEN=true, accept "dev:<email>" offline.
  if (config.allowDevToken && idToken.startsWith('dev:')) {
    const email = idToken.slice(4).trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new Error('Invalid dev token format — use dev:<email>');
    }
    return { email, name: email.split('@')[0], picture: null };
  }

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google token verification failed (HTTP ${res.status})`);
  }
  const info = (await res.json()) as {
    error?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    picture?: string;
  };
  if (info.error) throw new Error(`Google token error: ${info.error}`);
  if (!info.email) throw new Error('Google token does not contain an email');
  if (String(info.email_verified) === 'false') {
    throw new Error('Google email is not verified');
  }
  return {
    email: String(info.email),
    name: info.name ? String(info.name) : null,
    picture: info.picture ? String(info.picture) : null,
  };
}

export async function upsertGoogleUser(profile: GoogleProfile): Promise<AuthUser> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, display_name) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name)
     RETURNING id, email, display_name`,
    [profile.email, profile.name]
  );
  return {
    id: rows[0].id as string,
    email: rows[0].email as string,
    displayName: (rows[0].display_name as string | null) ?? null,
  };
}

export async function createAuthSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.authSessionTtlDays * 86_400_000);
  await pool.query(
    `INSERT INTO auth_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return token;
}

export async function deleteAuthSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM auth_sessions WHERE token = $1`, [token]);
}

export async function resolveUserByToken(token: string | null | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.display_name
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  if (!rows.length) return null;
  return {
    id: rows[0].id as string,
    email: rows[0].email as string,
    displayName: (rows[0].display_name as string | null) ?? null,
  };
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

// Hard gate: rejects the request with 401 when there is no valid session.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await resolveUserByToken(bearerToken(req));
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  (req as Request & { user: AuthUser }).user = user;
  next();
}

// Soft gate: attaches req.user when a valid session exists, never blocks.
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const user = await resolveUserByToken(bearerToken(req));
  if (user) {
    (req as Request & { user: AuthUser }).user = user;
  }
  next();
}
