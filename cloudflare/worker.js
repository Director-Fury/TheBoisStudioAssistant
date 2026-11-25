import { DurableObject } from "cloudflare:workers";

const BOT_INSTANCE = "jarvis-primary";
const PORT = 3000;
const INACTIVITY_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "CLIENT_ID",
  "GUILD_IDS",
  "POSTGRES_HOST",
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
];
const CONTAINER_ENV_KEYS = [
  ...REQUIRED_ENV,
  "OWNER_IDS",
  "SUPPORT_DM_LOG_CHANNEL_ID",
  "BOT_PRESENCE_STATUS",
  "BOT_ACTIVITY_NAME",
  "BOT_ACTIVITY_TYPE",
  "LOG_LEVEL",
  "LOG_TO_FILE",
  "SENTRY_DSN",
  "PORT_RETRY_ATTEMPTS",
  "CORS_ORIGIN",
  "POSTGRES_URL",
  "POSTGRES_PORT",
  "POSTGRES_MAX_CONNECTIONS",
  "POSTGRES_MIN_CONNECTIONS",
  "POSTGRES_CONNECTION_TIMEOUT",
  "POSTGRES_IDLE_TIMEOUT",
  "POSTGRES_RETRIES",
  "POSTGRES_BACKOFF_BASE",
  "POSTGRES_BACKOFF_MULTIPLIER",
  "POSTGRES_SSL",
  "AUTO_MIGRATE",
  "POSTGRES_MIGRATION_TABLE",
  "SCHEMA_VERSION",
  "SCHEMA_VERSION_LABEL",
  "TMDB_API_KEY",
  "LOVABLE_SUGGESTION_URL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
];

function getContainerEnvironment(env) {
  const containerEnv = {};
  for (const key of CONTAINER_ENV_KEYS) {
    if (typeof env[key] === "string" && env[key].length > 0) {
      containerEnv[key] = env[key];
    }
  }

  containerEnv.NODE_ENV = "production";
  containerEnv.PORT = String(PORT);
  containerEnv.WEB_HOST = "0.0.0.0";
  containerEnv.LOG_TO_FILE ??= "false";
  containerEnv.POSTGRES_SSL ??= "true";
  return containerEnv;
}

export class JarvisContainer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.starting = undefined;
    this.monitoring = undefined;

    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() =>
        ctx.container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS),
      );
      this.observeExit();
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/internal/keepalive" && request.method === "POST") {
      await this.ensureStarted();
      return Response.json({ status: "running" }, { status: 202 });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      await this.startAndWaitForHealth();
      return this.ctx.container
        .getTcpPort(PORT)
        .fetch("http://container/health");
    }

    return new Response("Not found", { status: 404 });
  }

  async ensureStarted() {
    const container = this.ctx.container;
    if (!container) {
      throw new Error("Jarvis container binding is unavailable");
    }

    const missing = REQUIRED_ENV.filter(
      (key) => typeof this.env[key] !== "string" || !this.env[key].trim(),
    );
    if (missing.length > 0) {
      throw new Error(`Missing required Worker variables/secrets: ${missing.join(", ")}`);
    }

    if (!container.running) {
      container.start({
        env: getContainerEnvironment(this.env),
        enableInternet: true,
      });
    }

    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    this.observeExit();
  }

  async startAndWaitForHealth() {
    this.starting ??= this.waitForHealth().finally(() => {
      this.starting = undefined;
    });
    await this.starting;
  }

  async waitForHealth() {
    await this.ensureStarted();
    const port = this.ctx.container.getTcpPort(PORT);
    let lastError;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const response = await port.fetch("http://container/health", {
          signal: AbortSignal.timeout(1000),
        });
        await response.body?.cancel();
        if (response.ok) {
          return;
        }
        lastError = new Error(`Bot health check returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }

      await scheduler.wait(200);
    }

    throw new Error("Jarvis did not become healthy on port 3000", {
      cause: lastError,
    });
  }

  observeExit() {
    if (this.monitoring) {
      return;
    }

    this.monitoring = this.ctx.container
      .monitor()
      .then(() => console.warn("Jarvis container exited"))
      .catch((error) => console.error("Jarvis container failed", error))
      .finally(() => {
        this.monitoring = undefined;
      });
    this.ctx.waitUntil(this.monitoring);
  }
}

function getBotStub(env) {
  const id = env.JARVIS_CONTAINER.idFromName(BOT_INSTANCE);
  return env.JARVIS_CONTAINER.get(id);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return Response.json({
        service: "Jarvis - TBS",
        runtime: "Cloudflare Container",
        health: "/health",
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return getBotStub(env).fetch(
        new Request("https://jarvis.internal/health"),
      );
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller, env) {
    const response = await getBotStub(env).fetch(
      new Request("https://jarvis.internal/internal/keepalive", {
        method: "POST",
      }),
    );
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Jarvis keepalive failed (${response.status}): ${details}`);
    }
  },
};
