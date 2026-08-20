import { prisma } from "@/lib/db";

/**
 * V1 is single-user, but every table already keys off `userId` — this is
 * the one place that assumption lives. Swapping in real auth later means
 * replacing this function's body, not touching any of its callers.
 *
 * `upsert`, not find-then-create: this runs on every page render, and
 * Next.js renders pages concurrently (parallel build workers during static
 * generation, parallel requests at runtime) — a find-then-create would race
 * and throw a unique constraint violation the first time two calls overlap.
 */
export async function getCurrentUser() {
  const email = process.env.OWNER_EMAIL ?? "owner@example.com";
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, timezone: process.env.OWNER_TIMEZONE ?? "America/Los_Angeles" },
  });
}
