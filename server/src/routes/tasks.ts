import {
  createTaskSchema,
  filterQuerySchema,
  parseTaskId,
  updateTaskSchema,
} from '@tracker/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/client.ts';
import { AppError } from '../lib/app-error.ts';
import * as taskService from '../services/task-service.ts';

const listQuerySchema = z.object({
  filter: z.string().max(10_000).optional(),
  cursor: z.string().max(1_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function parseFilterParam(raw: string | undefined) {
  if (!raw) return filterQuerySchema.parse({});
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'The filter parameter must be URL-encoded JSON');
  }
  return filterQuerySchema.parse(json);
}

function taskNumber(id: string): number {
  const number = parseTaskId(id);
  if (number === null) throw new AppError('NOT_FOUND', `Task ${id} not found`);
  return number;
}

export function tasksRouter(db: Db) {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const filter = parseFilterParam(query.filter);
    res.json(await taskService.listTaskPage(db, req.user, filter, query.cursor, query.limit));
  });

  router.get('/:id', async (req, res) => {
    res.json(await taskService.getTaskDetail(db, taskNumber(req.params.id)));
  });

  router.post('/', async (req, res) => {
    const input = createTaskSchema.parse(req.body);
    const task = await taskService.createTask(db, req.user, input);
    res.status(201).location(`/api/tasks/${task.id}`).json(task);
  });

  router.patch('/:id', async (req, res) => {
    const number = taskNumber(req.params.id);
    const input = updateTaskSchema.parse(req.body);
    res.json(await taskService.updateTaskFields(db, req.user, number, input));
  });

  router.delete('/:id', async (req, res) => {
    await taskService.deleteTask(db, taskNumber(req.params.id));
    res.status(204).end();
  });

  return router;
}
