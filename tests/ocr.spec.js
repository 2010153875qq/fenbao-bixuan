import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('local Chinese OCR reads a rendered name', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/index.html');
  await page.addScriptTag({ url: './js/ocr.js' });
  const text = await page.evaluate(async () => {
    const normalize = window.FENBAO_EXTRACT.normalize;
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '72px "WenQuanYi Zen Hei", "WenQuanYi Micro Hei", sans-serif';
    ctx.fillText('曹敏  刘易楠', 24, 110);
    return normalize(await window.FENBAO_OCR.recognizeCanvas(canvas));
  });
  expect(text).toContain('曹敏');
  expect(text).toContain('刘易楠');
});

const privateDir = process.env.FENBAO_PRIVATE_DIR || '';

test('private sample PDFs fill the review table without leaving the browser', async ({ page }) => {
  test.skip(!privateDir || !fs.existsSync(privateDir), 'private PDFs are only on the test machine');
  test.setTimeout(240000);
  const pdfs = fs.readdirSync(privateDir).filter((name) => name.endsWith('.pdf')).map((name) => path.join(privateDir, name));
  await page.addInitScript(() => localStorage.setItem('fenbao-install-dismissed', '1'));
  await page.goto('/index.html#import');
  await page.locator('#file-input').setInputFiles(pdfs);
  await expect(page.locator('#file-list li')).toHaveCount(pdfs.length, { timeout: 180000 });
  await expect(page.locator('#ocr-status')).toContainText(/扫描文字已抽出|识别失败|已取消/, { timeout: 180000 });
  await page.getByRole('button', { name: '用这些资料填写名单' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('名单核对');
  const body = page.locator('#vendor-body');
  await expect(body).toContainText('湖南湘中输变电建设有限公司');
  await expect(body).toContainText('湖南鑫军送变电有限责任公司');
  await expect(body.locator('tr[data-name="湖南湘中输变电建设有限公司"] [data-field="teamLead"]')).toHaveValue('曹敏');
  await expect(body.locator('tr[data-name="湖南湘中输变电建设有限公司"] [data-field="pm"]')).toHaveValue('刘易楠');
  await expect(body.locator('tr[data-name="湖南鑫军送变电有限责任公司"] [data-field="teamLead"]')).toHaveValue('罗曙光');
  await expect(body.locator('tr[data-name="湖南鑫军送变电有限责任公司"] [data-field="pm"]')).toHaveValue('罗雄');
  await expect(body).not.toContainText('佳园');
  const leaked = await page.locator('body').innerText();
  expect(leaked).not.toMatch(/[1-9]\d{16}[\dXx]/);
  expect(leaked).not.toMatch(/1[3-9]\d{9}/);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.sidebar, .tabbar').getByRole('link', { name: '表格导出' }).first().click();
  await page.getByRole('button', { name: '生成会审意见 Word' }).click();
  const download = await downloadPromise;
  const saved = path.join('/opt/cursor/artifacts', 'review_table_from_local_pdfs.docx');
  await download.saveAs(saved);
  const xml = await (await import('jszip')).default.loadAsync(fs.readFileSync(saved)).then((zip) => zip.file('word/document.xml').async('string'));
  expect(xml).toContain('曹敏');
  expect(xml).toContain('刘易楠');
  expect(xml).toContain('罗曙光');
  expect(xml).toContain('罗雄');
  expect(xml).toContain('否决事项清单');
  expect(xml).not.toMatch(/[1-9]\d{16}[\dXx]/);
  expect(xml).not.toContain('佳园');
});
