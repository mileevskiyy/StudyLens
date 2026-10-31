import express from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Store } from "./store.ts";
import { Fault } from "./model.ts";
export function appFor(
  store: Store,
  options: { secure?: boolean; origin?: string } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1500kb" }));
  const cookie = (req: express.Request) =>
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("studylens_session="))
      ?.slice("studylens_session=".length) || "";
  const csrf = (token: string) =>
    createHash("sha256")
      .update("studylens-csrf:" + token)
      .digest("hex");
  const secure = options.secure ? "; Secure" : "";
  const limits = new Map<string, { count: number; until: number }>();
  app.use((_req, res, next) => {
    if (_req.path.startsWith("/api/"))
      res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, app: "StudyLens" }),
  );
  app.post("/api/demo", (req, res) => {
    const origin = req.get("origin");
    if (
      origin &&
      !["http://127.0.0.1:3500", "http://127.0.0.1:3501", options.origin]
        .filter(Boolean)
        .includes(origin)
    )
      throw new Fault(403, "This origin is not allowed.");
    const now = Date.now();
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const ip = req.ip || "unknown",
      l = limits.get(ip) || { count: 0, until: now + 900000 };
    if (l.count >= 20 || limits.size >= 1000)
      throw new Fault(429, "Too many demo workspaces. Please try again later.");
    l.count++;
    limits.set(ip, l);
    const old = cookie(req),
      token = store.create();
    if (old) store.remove(old);
    res.setHeader(
      "Set-Cookie",
      `studylens_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure}`,
    );
    res.json({ csrf: csrf(token) });
  });
  app.get("/api/session", (req, res) => {
    const token = cookie(req);
    try {
      store.get(token);
      res.setHeader(
        "Set-Cookie",
        `studylens_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure}`,
      );
      res.json({ authenticated: true, csrf: csrf(token) });
    } catch {
      res.json({ authenticated: false });
    }
  });
  app.use("/api", (req, res, next) => {
    const token = cookie(req);
    store.get(token);
    res.setHeader(
      "Set-Cookie",
      `studylens_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure}`,
    );
    res.locals.token = token;
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      const origin = req.get("origin");
      if (
        origin &&
        !["http://127.0.0.1:3500", "http://127.0.0.1:3501", options.origin]
          .filter(Boolean)
          .includes(origin)
      )
        throw new Fault(403, "This origin is not allowed.");
      if (req.get("x-csrf-token") !== csrf(token))
        throw new Fault(403, "Refresh the page before saving changes.");
    }
    next();
  });
  const token = (res: express.Response) => res.locals.token as string;
  app.get("/api/workspace", (_req, res) =>
    res.json(store.overview(token(res))),
  );
  app.post("/api/decks", (req, res) =>
    res.status(201).json(store.deck(token(res), req.body)),
  );
  app.put("/api/decks/:id", (req, res) =>
    res.json(store.editDeck(token(res), req.params.id, req.body)),
  );
  app.post("/api/decks/:id/cards", (req, res) =>
    res.status(201).json(store.card(token(res), req.params.id, req.body)),
  );
  app.put("/api/cards/:id", (req, res) =>
    res.json(
      store.editCard(
        token(res),
        req.params.id,
        z.number().int().positive().parse(req.body.version),
        req.body,
      ),
    ),
  );
  app.post("/api/decks/:id/notes", (req, res) =>
    res.status(201).json(store.note(token(res), req.params.id, req.body)),
  );
  app.put("/api/decks/:id/notes/:noteId", (req, res) =>
    res.json(
      store.note(token(res), req.params.id, req.body, req.params.noteId),
    ),
  );
  for (const kind of ["card", "note", "deck"] as const)
    app.delete(`/api/${kind}s/:id`, (req, res) =>
      res.json(store.delete(token(res), kind, req.params.id)),
    );
  app.post("/api/review/start", (req, res) =>
    res.json(
      store.start(
        token(res),
        z.string().uuid().nullable().parse(req.body.deckId),
      ),
    ),
  );
  app.post("/api/review/reveal", (req, res) =>
    res.json(
      store.reveal(token(res), z.string().uuid().parse(req.body.sessionId)),
    ),
  );
  app.post("/api/review/rate", (req, res) =>
    res.json(
      store.rate(
        token(res),
        z
          .object({
            sessionId: z.string().uuid(),
            cardId: z.string().uuid(),
            grade: z.enum(["again", "hard", "good", "easy"]),
            key: z.string().uuid(),
          })
          .parse(req.body),
      ),
    ),
  );
  app.post("/api/review/leave", (_req, res) =>
    res.json(store.leave(token(res))),
  );
  app.put("/api/goal", (req, res) =>
    res.json(store.goal(token(res), z.number().int().parse(req.body.goal))),
  );
  app.get("/api/export", (_req, res) => {
    res.attachment("studylens-library.json").json(store.export(token(res)));
  });
  app.post("/api/import", (req, res) =>
    res.json(store.import(token(res), req.body)),
  );
  app.post("/api/logout", (req, res) => {
    store.remove(token(res));
    res.setHeader(
      "Set-Cookie",
      `studylens_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
    );
    res.json({ ok: true });
  });
  app.use("/api", (_req, _res, next) =>
    next(new Fault(404, "API route not found.")),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        err instanceof Fault
          ? err.status
          : err instanceof z.ZodError
            ? 422
            : err.type === "entity.too.large"
              ? 413
              : err instanceof SyntaxError
                ? 400
                : 500;
      res
        .status(status)
        .json({
          error:
            status === 500
              ? "Something went wrong. Please retry."
              : err instanceof z.ZodError
                ? err.issues
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("; ")
                : err.message,
        });
    },
  );
  return app;
}
