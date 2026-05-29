import { z } from "zod";

/**
 * Discord snowflake validation.
 * Must be a string of 17-20 digits.
 */
export const guildIdParam = z.string().regex(/^\d{17,20}$/, {
  message: "Invalid Discord guild ID",
});

/**
 * Pagination query parameters.
 */
export const paginationQuery = z.object({
  page: z
    .string()
    .optional()
    .default("1")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().min(1)),
  pageSize: z
    .string()
    .optional()
    .default("20")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().min(1).max(100)),
});
