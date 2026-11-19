import { createTagSchema } from '@tracker/shared';
import { Router } from 'express';
import type { Db } from '../db/client.ts';
import * as reference from '../services/reference-service.ts';

export function referenceRouter(db: Db) {
  const router = Router();

  // §7.4: the acting user, chosen at startup.
  router.get('/me', (req, res) => {
    const { id: _id, ...me } = req.user;
    res.json(me);
  });

  router.get('/users', async (_req, res) => {
    res.json(await reference.listUsers(db));
  });
  router.get('/teams', async (_req, res) => {
    res.json(await reference.listTeams(db));
  });
  router.get('/products', async (_req, res) => {
    res.json(await reference.listProducts(db));
  });
  router.get('/tags', async (_req, res) => {
    res.json(await reference.listTags(db));
  });
  router.post('/tags', async (req, res) => {
    const input = createTagSchema.parse(req.body);
    res.status(201).json(await reference.createTag(db, input));
  });

  return router;
}
