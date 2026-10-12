export type ProviderFailureIdentity = { id: string };

export function getUnseenProviderFailure<T extends ProviderFailureIdentity>(failures: T[], seenIds: ReadonlySet<string>): T | undefined {
  return failures.find((failure) => !seenIds.has(failure.id));
}

export function rememberProviderFailureIds<T extends ProviderFailureIdentity>(failures: T[]): Set<string> {
  return new Set(failures.map((failure) => failure.id));
}
