import 'dotenv/config';
import { z } from 'zod';
const EnvSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3001),
    OPENAI_API_KEY: z.string().min(1),
    GOOGLE_SHEETS_CREDENTIALS: z.string().optional(),
    GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
    AXIOM_PUBLIC_URL: z.string().default('http://localhost:3001'),
});
export const env = EnvSchema.parse({
    PORT: process.env.PORT,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_SHEETS_CREDENTIALS: process.env.GOOGLE_SHEETS_CREDENTIALS,
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    AXIOM_PUBLIC_URL: process.env.AXIOM_PUBLIC_URL,
});
