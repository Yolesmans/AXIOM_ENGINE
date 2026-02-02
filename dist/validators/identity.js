import { z } from 'zod';
export const IdentitySchema = z.object({
    firstName: z.string().min(1, 'Le prénom est obligatoire'),
    lastName: z.string().min(1, 'Le nom est obligatoire'),
    email: z.string().email('L\'adresse email doit être valide'),
});
