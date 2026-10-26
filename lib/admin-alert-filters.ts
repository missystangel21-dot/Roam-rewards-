export type ProviderFailureAlert = {
  id: string;
  requestedPoints: number;
  correlationId: string;
  createdAt: string | Date;
};

export type AlertSeverity = "ALL" | "CRITICAL" | "STANDARD";
export type AlertDateWindow = "ALL" | "FIVE_MINUTES" | "FIFTEEN_MINUTES";
export type AlertSort = "NEWEST" | "OLDEST" | "SEVERITY";

export function getAlertSeverity(alert: ProviderFailureAlert): Exclude<AlertSeverity, "ALL"> {
  return alert.requestedPoints >= 5_000 ? "CRITICAL" : "STANDARD";
}

export function filterAndSortProviderFailures(
  alerts: readonly ProviderFailureAlert[] | undefined,
  options: { severity: AlertSeverity; dateWindow: AlertDateWindow; sort: AlertSort; now?: Date },
): ProviderFailureAlert[] {
  const nowMs = (options.now ?? new Date()).getTime();
  const windowMs =
    options.dateWindow === "FIVE_MINUTES"
      ? 5 * 60 * 1_000
      : options.dateWindow === "FIFTEEN_MINUTES"
        ? 15 * 60 * 1_000
        : null;

  const scored = (alerts ?? []).map((alert) => {
    const createdAtMs = new Date(alert.createdAt).getTime();
    return { alert, createdAtMs, severity: getAlertSeverity(alert) };
  });

  const filtered = scored.filter(({ severity, createdAtMs }) => {
    const severityMatches = options.severity === "ALL" || severity === options.severity;
    const dateMatches = windowMs === null || nowMs - createdAtMs <= windowMs;
    return severityMatches && dateMatches;
  });

  filtered.sort((left, right) => {
    if (options.sort === "SEVERITY") {
      const severityDelta = Number(right.severity === "CRITICAL") - Number(left.severity === "CRITICAL");
      if (severityDelta !== 0) return severityDelta;
    }

    return options.sort === "OLDEST"
      ? left.createdAtMs - right.createdAtMs
      : right.createdAtMs - left.createdAtMs;
  });

  return filtered.map(({ alert }) => alert);
}

export function getAlertFilterLabel(options: {
  severity: AlertSeverity;
  dateWindow: AlertDateWindow;
  sort: AlertSort;
}): string {
  const severityLabel =
    options.severity === "ALL"
      ? "All severities"
      : options.severity === "CRITICAL"
        ? "Critical"
        : "Standard";

  const dateLabel =
    options.dateWindow === "ALL"
      ? "All dates"
      : options.dateWindow === "FIVE_MINUTES"
        ? "Last 5 minutes"
        : "Last 15 minutes";

  const sortLabel =
    options.sort === "NEWEST"
      ? "Newest first"
      : options.sort === "OLDEST"
        ? "Oldest first"
        : "Most severe first";

  return `${severityLabel} · ${dateLabel} · ${sortLabel}`;
}
