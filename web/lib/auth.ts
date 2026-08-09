import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { pool } from './db';
import { config } from './config';

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

export async function verifyGoogleIdToken(
  idToken: string,
  expectedClientId?: string
): Promise<GoogleProfile> {
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
    aud?: string;
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
  if (expectedClientId && info.aud !== expectedClientId) {
    throw new Error('Google token audience does not match this client');
  }
  return {
    email: String(info.email),
    name: info.name ? String(info.name) : null,
    picture: info.picture ? String(info.picture) : null,
  };
}

export async function upsertGoogleUser(
  profile: GoogleProfile
): Promise<{ user: AuthUser; created: boolean }> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, display_name) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name)
     RETURNING id, email, display_name, (xmax = 0) AS inserted`,
    [profile.email, profile.name]
  );
  return {
    user: {
      id: rows[0].id as string,
      email: rows[0].email as string,
      displayName: (rows[0].display_name as string | null) ?? null,
    },
    created: rows[0].inserted as boolean,
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

export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  return resolveUserByToken(bearerToken(req));
}
