import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config, USE_MOCKS } from './config.js';
import { logger } from './logger.js';
import { apiRouter } from './routes/api.js';
import { authRouter } from './auth/routes.js';
import { flowsRouter } from './flows/routes.js';
import { publicRouter } from './routes/public.js';
import { csrfProtection, requireAuth } from './auth/middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Behind a proxy/App Service, trust the first hop so secure cookies + rate
// limiting see the real client IP.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// --- Security & platform middleware ----------------------------------------
app.use(
  helmet({
    // CSP for the SPA the BFF serves in single-origin mode. Fully self-hosted —
    // Onest is bundled (apps/web/public/fonts), so no external origins are
    // needed for styles or fonts.
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", 'https://login.microsoftonline.com'],
      },
    },
    // HSTS only makes sense over HTTPS in production.
    hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);
app.use(
  cors({
    origin: config.webOrigin,
    credentials: true, // required so the httpOnly session cookie flows
  }),
);
// Larger limit so admins can post announcement banners / quick-link logos
// (downscaled data URIs) inline. Uploads are downscaled client-side.
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser(config.sessionSecret));

// Request logging with a correlation id on every request/response.
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req.headers['x-request-id'] as string) || randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
  }),
);

// Rate limit the API surface (not health checks).
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter limit on the auth handshake to blunt brute-force / redirect abuse.
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Health ----------------------------------------------------------------
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', mode: USE_MOCKS ? 'mock' : 'live', uptime: process.uptime() });
});

// --- Auth (login / redirect / logout / status) -----------------------------
app.use('/auth', authLimiter, authRouter);

// --- Power Automate callbacks (secret-authenticated, no user session) -------
app.use('/flows', flowsRouter);

// --- Public intake (no auth — the shareable form) ---------------------------
app.use('/public', publicRouter);

// --- API -------------------------------------------------------------------
// Every /api call is gated by auth (mock-aware) and CSRF-checked on writes.
app.use('/api', apiLimiter, requireAuth, csrfProtection, apiRouter);

// --- API 404 ---------------------------------------------------------------
app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Unknown endpoint' } });
});

// --- Static SPA (single-origin production deployment) ----------------------
// Serving the built web app from the BFF puts /api, /auth and the app on one
// origin, which the strict session cookie requires. Assets are content-hashed
// so they cache aggressively; index.html is always revalidated; unknown paths
// fall back to index.html for client-side routing.
if (config.serveWeb) {
  const webDist = config.webDist || path.resolve(__dirname, '../../web/dist');
  app.use(
    express.static(webDist, {
      index: false,
      // Don't 301 /assets → /assets/: that path is also the asset-tracker SPA
      // route. With redirect off, a non-file request falls through to the SPA.
      redirect: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          // Everything Vite emits under /assets is content-hashed → cache hard.
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
  logger.info({ webDist }, 'serving SPA (single-origin mode)');
}

// --- Typed error handler ---------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = res.getHeader('x-request-id') as string | undefined;
  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'internal_error', message: 'Something went wrong', requestId },
  });
});

app.listen(config.port, () => {
  logger.info(
    { port: config.port, mode: USE_MOCKS ? 'MOCK (tenant not wired)' : 'LIVE', webOrigin: config.webOrigin },
    `FlowTech Hub BFF listening on http://localhost:${config.port}`,
  );
  if (USE_MOCKS) {
    logger.warn(
      'Running with MOCK data. Fill AZURE_CLIENT_ID / AZURE_CLIENT_SECRET in .env and wire auth (Build Order step 2) to go live.',
    );
  }
});
