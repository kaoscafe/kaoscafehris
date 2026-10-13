import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  address: z.string().trim().min(3, "Address is required").max(255),
  city: z.string().trim().min(2, "City is required").max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  branchManager: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Employee profile of the Branch Manager account assigned to this branch; null clears it.
  managerId: z.string().uuid("Invalid branch manager").nullable().optional(),
  operatingHours: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  isActive: z.boolean().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();

export const listBranchQuerySchema = z.object({
  search: z.string().trim().optional(),
  isActive: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type ListBranchQuery = z.infer<typeof listBranchQuerySchema>;
