import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().max(255).email(),
    password: z.string().min(8).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'A senha não pode exceder 72 bytes.'),
  }),
});
export const refreshSchema = z.object({ body: z.object({ refreshToken: z.string().min(20).max(4096) }) });
