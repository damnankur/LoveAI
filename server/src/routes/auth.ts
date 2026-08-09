import { Router } from 'express';
import {
  bearerToken,
  createAuthSession,
  deleteAuthSession,
  requireAuth,
  upsertGoogleUser,
  verifyGoogleIdToken,
} from '../services/auth';

const router = Router();

// Exchange a Google ID token for a loveAI session token.
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'idToken is required' });
    }
    const profile = await verifyGoogleIdToken(idToken.trim());
    const user = await upsertGoogleUser(profile);
    const token = await createAuthSession(user.id);
    res.json({ token, user });
  } catch (err: any) {
    console.error('[auth] google login error:', err?.message);
    res.status(401).json({ error: err?.message || 'Google authentication failed' });
  }
});

// Current session user.
router.get('/me', requireAuth, (req: any, res) => {
  res.json({ user: req.user });
});

// Invalidate the current session.
router.post('/logout', requireAuth, async (req, res) => {
  const token = bearerToken(req);
  if (token) await deleteAuthSession(token);
  res.json({ ok: true });
});

export default router;
