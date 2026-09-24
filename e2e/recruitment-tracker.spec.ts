import { expect, test, type BrowserContext } from "@playwright/test";
import {
  createRecruitmentFixture,
  type RecruitmentFixture,
} from "./helpers/supabase-admin";

let fixture: RecruitmentFixture | undefined;

test.beforeAll(async ({ browser }) => {
  fixture = await createRecruitmentFixture(browser);
});

test.afterAll(async () => {
  await fixture?.cleanup();
});

test("members remain separate and temporary editing expires or is revoked", async ({ browser }) => {
  if (!fixture) throw new Error("E2E fixture was not created");

  let owner: BrowserContext | undefined;
  let teammate: BrowserContext | undefined;
  try {
    owner = await browser.newContext({ storageState: fixture.ownerStatePath });
    teammate = await browser.newContext({ storageState: fixture.teammateStatePath });
    const ownerPage = await owner.newPage();
    const teammatePage = await teammate.newPage();
    const ownerCompany = `Owner Corp ${fixture.runId}`;
    const teammateCompany = `Teammate Labs ${fixture.runId}`;

    await ownerPage.goto("/");
    await expect(ownerPage.getByText(ownerCompany, { exact: true })).toBeVisible();
    await expect(ownerPage.getByText(teammateCompany, { exact: true })).toHaveCount(0);

    await teammatePage.goto("/");
    await expect(teammatePage.getByText(teammateCompany, { exact: true })).toBeVisible();
    await expect(teammatePage.getByText(ownerCompany, { exact: true })).toHaveCount(0);

    await teammatePage.goto(`/?member=${fixture.ownerId}`);
    await expect(teammatePage.getByText(ownerCompany, { exact: true })).toBeVisible();
    await expect(teammatePage.getByText(teammateCompany, { exact: true })).toHaveCount(0);
    await expect(teammatePage.getByText("只读：你可以查看，但不能修改此成员的记录")).toBeVisible();
    await expect(teammatePage.getByRole("button", { name: /编辑/ })).toHaveCount(0);

    const expiringGrantId = await fixture.seedActiveGrant();
    await teammatePage.reload();
    await expect(teammatePage.getByText("临时可编辑：授权到期前可以新增和修改记录")).toBeVisible();
    await expect(teammatePage.getByRole("button", { name: `编辑 ${ownerCompany} Backend Engineer` })).toBeVisible();
    await expect(teammatePage.getByRole("button", { name: /删除/ })).toHaveCount(0);
    await teammatePage.getByRole("button", { name: `编辑 ${ownerCompany} Backend Engineer` }).click();
    await teammatePage.getByLabel("备注").fill("attempt after grant expiry");
    await fixture.expireGrant(expiringGrantId);
    await teammatePage.getByRole("button", { name: "保存" }).click();
    await expect(teammatePage.getByText("你没有编辑该成员记录的权限", { exact: true })).toBeVisible();
    await expect(teammatePage.getByText("只读：你可以查看，但不能修改此成员的记录")).toBeVisible();
    await expect(teammatePage.getByRole("button", { name: /编辑/ })).toHaveCount(0);

    const revokedGrantId = await fixture.seedActiveGrant();
    await teammatePage.reload();
    await expect(teammatePage.getByText("临时可编辑：授权到期前可以新增和修改记录")).toBeVisible();
    await teammatePage.getByRole("button", { name: `编辑 ${ownerCompany} Backend Engineer` }).click();
    await teammatePage.getByLabel("备注").fill("attempt after grant revocation");
    await fixture.revokeGrant(revokedGrantId);
    await teammatePage.getByRole("button", { name: "保存" }).click();
    await expect(teammatePage.getByText("你没有编辑该成员记录的权限", { exact: true })).toBeVisible();
    await expect(teammatePage.getByText("只读：你可以查看，但不能修改此成员的记录")).toBeVisible();
  } finally {
    await owner?.close();
    await teammate?.close();
  }
});
