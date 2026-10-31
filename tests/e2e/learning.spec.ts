import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
test("collect a note, create and review a card, persist progress, export and import", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Make room/ })).toBeVisible();
  if (!process.env.DEMO_URL)
    await page.screenshot({
      path: fileURLToPath(new URL("../../docs/entry.png", import.meta.url)),
      fullPage: true,
    });
  await page.getByRole("button", { name: "Try the demo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /A little progress/ }),
  ).toBeVisible();
  if (!process.env.DEMO_URL)
    await page.screenshot({
      path: fileURLToPath(new URL("../../docs/workspace.png", import.meta.url)),
      fullPage: true,
    });
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  await page
    .getByRole("button", { name: "New collection", exact: true })
    .click();
  const title = `Browser learning ${Date.now()}`;
  await page.getByLabel("Collection title").fill(title);
  await page.getByLabel("Subject", { exact: true }).fill("Practice");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Notes/ }).click();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByLabel("Note title").fill("A useful connection");
  await page
    .getByLabel("Your thoughts")
    .fill(
      "Atomic changes preserve invariants.\nA failed write must leave no partial state.",
    );
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A useful connection" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Turn an idea into a card", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("What does atomicity guarantee?");
  await page
    .getByRole("textbox", { name: "Answer", exact: true })
    .fill("All changes succeed together or none are applied.");
  await page.getByRole("button", { name: "Create card", exact: true }).click();
  await page.getByRole("button", { name: /^Flashcards/ }).click();
  await expect(
    page.getByRole("heading", { name: "What does atomicity guarantee?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review collection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What does atomicity guarantee?" }),
  ).toBeVisible();
  await expect(
    page.getByText("All changes succeed together or none are applied.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .click();
  await expect(
    page.getByText("All changes succeed together or none are applied.", {
      exact: true,
    }),
  ).toBeVisible();
  if (!process.env.DEMO_URL)
    await page.screenshot({
      path: fileURLToPath(new URL("../../docs/review.png", import.meta.url)),
      fullPage: true,
    });
  await page.getByRole("button", { name: /2\s*Hard/ }).click();
  await expect(
    page.getByRole("heading", { name: /That’s a good/ }),
  ).toBeVisible();
  await expect(
    page.getByText("You reviewed 1 card in this session.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to today", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Your progress", exact: true })
    .click();
  await expect(
    page.getByText("This chart starts with your own practice.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".insight-numbers>div").first().locator("strong"),
  ).toHaveText("1");
  await page.getByRole("button", { name: "Workspace options" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Export library/ }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("studylens-library.json");
  const path = await saved.path();
  await page.getByLabel("Import library file").setInputFiles(path!);
  await expect(page.getByRole("status")).toContainText(
    "Imported 5 collection(s)",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByLabel("Search library").fill(title);
  await expect(page.locator(".collection-grid>.collection")).toHaveCount(2);
  if (!process.env.DEMO_URL) {
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: fileURLToPath(new URL("../../docs/mobile.png", import.meta.url)),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
