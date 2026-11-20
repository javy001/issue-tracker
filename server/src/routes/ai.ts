import {
  estimateRequestSchema,
  parseFilterRequestSchema,
  suggestAssigneeRequestSchema,
} from '@tracker/shared';
import { Router } from 'express';
import { estimateTask } from '../ai/estimate.ts';
import { parseFilter } from '../ai/parse-filter.ts';
import { suggestAssignee } from '../ai/suggest-assignee.ts';
import type { StructuredLLM } from '../ai/llm.ts';
import type { Db } from '../db/client.ts';

// §7.1 / §8: AI endpoints. Results are suggestions; nothing is applied server-side.
export function aiRouter(db: Db, llm: StructuredLLM) {
  const router = Router();

  router.post('/parse-filter', async (req, res) => {
    const { text } = parseFilterRequestSchema.parse(req.body);
    res.json(await parseFilter(db, llm, req.user, text));
  });

  router.post('/estimate', async (req, res) => {
    res.json(await estimateTask(db, llm, estimateRequestSchema.parse(req.body)));
  });

  router.post('/suggest-assignee', async (req, res) => {
    const { taskId } = suggestAssigneeRequestSchema.parse(req.body);
    res.json(await suggestAssignee(db, llm, taskId));
  });

  return router;
}
