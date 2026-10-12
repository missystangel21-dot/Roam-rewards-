import type { User } from "@/lib/_core/auth";

export function canAccessAdminReviewer(user: Pick<User, "role"> | null): boolean {
  return user?.role === "admin";
}

export function getPendingAdminAlertCount<T extends { id: string }>(failures: readonly T[] | undefined): number {
  return failures?.length ?? 0;
}

export function getUnreadAdminAlertCount<T extends { id: string }>(failures: readonly T[] | undefined, readAlertIds: ReadonlySet<string>): number {
  return failures?.filter((failure) => !readAlertIds.has(failure.id)).length ?? 0;
}
