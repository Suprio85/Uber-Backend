import { Router, Request, Response } from 'express';

const router = Router();

router.get('/ping', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

export default router;
