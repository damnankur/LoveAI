import { Router } from 'express';
import { requireAuth } from '../services/auth';
import { pool } from '../db';

const router = Router();

// Authenticated user profile + their latest persona evaluation.
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const userId: string = req.user.id;
    const { rows } = await pool.query(
      `SELECT id, responses, dimensions, profile, completed_at
       FROM persona_evaluations
       WHERE user_id = $1
       ORDER BY completed_at DESC
       LIMIT 1`,
      [userId]
    );

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.displayName,
      },
      evaluation: rows.length
        ? {
            id: rows[0].id,
            responses: rows[0].responses,
            dimensions: rows[0].dimensions,
            profile: rows[0].profile,
            completedAt: rows[0].completed_at,
          }
        : null,
    });
  } catch (err: any) {
    console.error('[profile] error:', err?.message);
    res.status(500).json({ error: err?.message || 'Failed to load profile' });
  }
});

export default router;
