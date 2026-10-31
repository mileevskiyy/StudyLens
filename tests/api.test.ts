import { test } from "node:test";
import { strict as a } from "node:assert";
import { Store } from "../server/store.ts";
import { appFor } from "../server/app.ts";
test("HTTP session isolation, CSRF, validation, rotation, import/export and logout", async () => {
  const s = new Store(),
    server = appFor(s, { origin: "https://study.example" }).listen(
      0,
      "127.0.0.1",
    );
  await new Promise<void>((r) => server.once("listening", () => r()));
  const address = server.address() as any,
    base = `http://127.0.0.1:${address.port}`;
  let cookie = "",
    csrf = "";
  async function req(
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        cookie,
        "x-csrf-token": csrf,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  try {
    a.equal((await req("/workspace")).status, 401);
    a.equal(
      (await req("/demo", "POST", {}, { origin: "https://evil.example" }))
        .status,
      403,
    );
    const login = await req(
      "/demo",
      "POST",
      {},
      { origin: "https://study.example" },
    );
    a.equal(login.status, 200);
    a.match(login.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    csrf = (await login.json()).csrf;
    const oldCookie = cookie;
    let workspace = await (await req("/workspace")).json();
    a.equal(workspace.cards.length, 20);
    a.equal(
      (await req("/goal", "PUT", { goal: 20 }, { "x-csrf-token": "bad" }))
        .status,
      403,
    );
    a.equal(
      (
        await req(
          "/goal",
          "PUT",
          { goal: 20 },
          { origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    a.equal((await req("/goal", "PUT", { goal: 0 })).status, 422);
    a.equal((await req("/goal", "PUT", { goal: 20 })).status, 200);
    const exp = await req("/export");
    a.match(exp.headers.get("content-disposition")!, /studylens-library.json/);
    const raw = await exp.json();
    a.equal((await req("/import", "POST", raw)).status, 200);
    a.equal((await (await req("/workspace")).json()).cards.length, 40);
    const login2 = await req("/demo", "POST", {});
    cookie = login2.headers.get("set-cookie")!.split(";")[0];
    csrf = (await login2.json()).csrf;
    a.equal(
      (await req("/workspace", "GET", undefined, { cookie: oldCookie })).status,
      401,
    );
    a.equal((await (await req("/workspace")).json()).cards.length, 20);
    a.equal((await req("/logout", "POST", {})).status, 200);
    a.equal((await req("/workspace")).status, 401);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    s.close();
  }
});
