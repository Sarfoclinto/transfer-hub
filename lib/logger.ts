// Deliberately not a dedicated observability tool (Sentry, Datadog, etc.)
// -- Phase 5's own scope for this milestone was "structured console logs,
// no need for a dedicated service yet." Vercel's log viewer (and most
// hosts') ingests console output directly and can filter/search on JSON
// fields within it, which is most of the value a heavier tool would add
// at this stage, for a fraction of the setup.
//
// Used for genuine server-side failures worth investigating later (a
// database error, an R2 failure) -- NOT for expected control flow like a
// 400/403/404/429 response, which is normal behavior, not an incident.
// Logging every rejected request as an "error" would drown out the
// signal the moment real traffic shows up.
type LogContext = Record<string, unknown>;

function emit(
  level: "info" | "warn" | "error",
  message: string,
  context?: LogContext,
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, context?: LogContext) =>
    emit("info", message, context),
  warn: (message: string, context?: LogContext) =>
    emit("warn", message, context),
  error: (message: string, context?: LogContext) =>
    emit("error", message, context),
};
