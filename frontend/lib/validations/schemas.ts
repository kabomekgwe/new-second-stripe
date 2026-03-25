import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  email: z.string().email('Invalid email address').max(255, 'Email is too long'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password is too long'),
  country: z.string().length(2, 'Please select a country'),
});
export type RegisterFormData = z.infer<typeof registerSchema>;

export const paymentAmountSchema = z.object({
  amount: z.string()
    .min(1, 'Amount is required')
    .regex(/^\d+\.?\d{0,2}$/, 'Invalid amount format')
    .refine((val) => parseFloat(val) > 0, 'Amount must be greater than 0'),
});
export type PaymentAmountFormData = z.infer<typeof paymentAmountSchema>;
