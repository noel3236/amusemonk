import 'server-only';
import { z } from 'zod';

export const env = z.object({ AUTH_SECRET: z.string().min(32) }).parse(process.env);
