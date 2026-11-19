import { Router } from 'express';
import type { Db } from '../db/client.ts';
import * as views from '../services/view-service.ts';

// §7.1: GET/POST /api/views, GET/PATCH/DELETE /api/views/:id. Views belong to the current user.
export function viewsRouter(db: Db) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await views.listViews(db, req.user));
  });
  router.post('/', async (req, res) => {
    res.status(201).json(await views.createView(db, req.user, req.body));
  });
  router.get('/:id', async (req, res) => {
    res.json(await views.getView(db, req.user, req.params.id));
  });
  router.patch('/:id', async (req, res) => {
    res.json(await views.updateView(db, req.user, req.params.id, req.body));
  });
  router.delete('/:id', async (req, res) => {
    await views.deleteView(db, req.user, req.params.id);
    res.status(204).end();
  });

  return router;
}
