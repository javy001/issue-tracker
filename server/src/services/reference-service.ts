import type { CreateTagInput, TagDto } from '@tracker/shared';
import type { Db } from '../db/client.ts';
import { AppError } from '../lib/app-error.ts';
import { isUniqueViolation } from '../lib/db-errors.ts';
import { insertTag } from '../repositories/reference-repo.ts';

export { listProducts, listTags, listTeams, listUsers } from '../repositories/reference-repo.ts';

export async function createTag(db: Db, input: CreateTagInput): Promise<TagDto> {
  try {
    return await insertTag(db, input);
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError('CONFLICT', `Tag "${input.name}" already exists`);
    throw err;
  }
}
