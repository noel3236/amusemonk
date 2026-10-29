import type { UploadWarning } from '@/db/schema';

export const SIMILAR_FILES = 'SIMILAR_FILES';

export const NOT_A_REPEAT_REQUIRED = 'This file looks like others of yours. Tick the box to confirm it isn’t a repeat.';

export const lookAlikeIn = (warnings: UploadWarning[]) => warnings.find((w) => w.code === SIMILAR_FILES);
