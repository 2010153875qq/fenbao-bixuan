import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function drawPlan(page, lines) {
  const bytes = await page.evaluate(async (lines) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '64px "WenQuanYi Zen Hei", "Noto Sans CJK SC", sans-serif';
    lines.forEach((line, index) => ctx.fillText(line, 60, 140 + index * 120));
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, lines);
  return Buffer.from(bytes);
}

test('photo of a plan fills team lead and project manager', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => localStorage.setItem('fenbao-install-dismissed', '1'));
  await page.goto('/index.html#import');
  await expect(page.locator('label[for="camera-input"]')).toBeVisible();
  await expect(page.locator('label[for="photo-input"]')).toBeVisible();
  await expect(page.locator('#camera-input')).toHaveAttribute('capture', 'environment');
  await expect(page.locator('#photo-input')).toHaveAttribute('multiple', '');
  const accept = await page.locator('#photo-input').getAttribute('accept');
  expect(accept).toContain('heic');
  expect(accept).toContain('webp');

  const roster = path.join('/tmp', 'synthetic-roster.txt');
  fs.writeFileSync(roster, '选用库\n星火甲有限公司\n星火乙有限公司\n备选库\n星火丙有限公司\n');
  const first = path.join('/tmp', 'synthetic-plan-a.png');
  const second = path.join('/tmp', 'synthetic-plan-b.png');
  fs.writeFileSync(first, await drawPlan(page, [
    '星火甲有限公司队伍投入计划',
    '外包商单位名称  队伍负责人  项目负责人',
    '星火甲有限公司  罗曙光  罗雄'
  ]));
  fs.writeFileSync(second, await drawPlan(page, [
    '星火乙有限公司资源投入计划',
    '外包商单位名称  队伍负责人  项目负责人',
    '星火乙有限公司  曹敏  陈钰'
  ]));

  await page.locator('#file-input').setInputFiles(roster);
  await page.locator('#photo-input').setInputFiles([first, second]);
  await expect(page.locator('#ocr-status')).toContainText('照片文字已抽出', { timeout: 150000 });
  await expect(page.locator('.file-list')).toContainText('照片文字已抽出');
  await page.getByRole('button', { name: '用这些资料填写名单' }).click();
  await expect(page.locator('#view-review')).toBeVisible();
  await expect(page.locator('tr[data-name="星火甲有限公司"] [data-field="teamLead"]')).toHaveValue('罗曙光');
  await expect(page.locator('tr[data-name="星火甲有限公司"] [data-field="pm"]')).toHaveValue('罗雄');
  await expect(page.locator('tr[data-name="星火甲有限公司"] [data-field="labor"]')).toHaveValue('');
  await expect(page.locator('tr[data-name="星火乙有限公司"] [data-field="teamLead"]')).toHaveValue('曹敏');
  await expect(page.locator('tr[data-name="星火乙有限公司"] [data-field="pm"]')).toHaveValue('陈钰');
  await expect(page.locator('#vendor-body')).not.toContainText('星火丙');
  await page.screenshot({ path: '/opt/cursor/artifacts/photo-review-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/opt/cursor/artifacts/photo-review-phone.png' });
});

test('a social-security photo is skipped and does not fill names', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem('fenbao-install-dismissed', '1'));
  await page.goto('/index.html#import');
  const image = path.join('/tmp', 'synthetic-social.png');
  fs.writeFileSync(image, await drawPlan(page, [
    '社保证明',
    '缴费基数',
    '参保信息'
  ]));
  await page.locator('#photo-input').setInputFiles({ name: '社保证明.png', mimeType: 'image/png', buffer: fs.readFileSync(image) });
  await expect(page.locator('.file-list')).toContainText('已跳过');
  await expect(page.locator('#ocr-status')).toHaveText('');
  await page.getByRole('button', { name: '用这些资料填写名单' }).click();
  await expect(page).toHaveURL(/#import/);
  await expect(page.locator('#vendor-body')).not.toContainText('社保证明');
});
