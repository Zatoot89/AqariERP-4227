import { assertRuntimeConfig } from "./api/lib/runtime-config";

assertRuntimeConfig();

const [
  { runApplicationMigrations },
  { runDataFoundationMigrations },
  { runCoreDomainMigrations },
  { runTransactionMigrations },
  { runFinanceMigrations },
] = await Promise.all([
  import("./api/database/migrations"),
  import("./api/database/data-foundation-migrations"),
  import("./api/database/core-domain-migrations"),
  import("./api/database/transaction-migrations"),
  import("./api/database/finance-migrations"),
]);

await runApplicationMigrations();
await runDataFoundationMigrations();
await runCoreDomainMigrations();
await runTransactionMigrations();
await runFinanceMigrations();

const [
  { default: app },
  { startTaskReminderLoop },
  { startAttachmentCleanupLoop },
] = await Promise.all([
  import("./api"),
  import("./services/task-reminders"),
  import("./services/attachment-cleanup"),
]);

startTaskReminderLoop();
startAttachmentCleanupLoop();

const port = Number(process.env.PORT ?? 3000);
const distDir = `${import.meta.dir}/../dist`;
const indexPath = `${distDir}/index.html`;

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self' https:",
    "object-src 'none'",
  ].join("; "),
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api")) {
      return app.fetch(request);
    }

    const filePath = getStaticFilePath(url.pathname);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file, { headers: securityHeaders });
    }

    const index = Bun.file(indexPath);
    if (await index.exists()) {
      return new Response(index, {
        headers: {
          ...securityHeaders,
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    return new Response("Build output not found. Run `bun run build` first.", {
      status: 500,
      headers: {
        ...securityHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  },
});

console.log(`Web server listening on http://localhost:${server.port}`);

function getStaticFilePath(pathname: string) {
  const cleanPath = decodeURIComponent(pathname)
    .replace(/^\/+/, "")
    .replaceAll("..", "");

  return cleanPath ? `${distDir}/${cleanPath}` : indexPath;
}
