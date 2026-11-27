import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const ARTIFACTS = '/opt/cursor/artifacts';

const VENDORS = [
  '湖南湘中输变电建设有限公司',
  '湖南鑫军送变电有限责任公司',
  '湖南友维电力建设有限公司',
  '湖南鼎淳建设有限公司',
  '湖南百事恒兴建设工程有限公司',
  '湖南长坤建设有限公司',
  '湖南科创电力工程技术有限公司',
  '湖南省湘乡市电力建设有限公司'
];

const DOWNLOADS = [
  {
    href: './downloads/双峰北220kV_地基基础_会审意见_已填.docx',
    name: '下载会审意见 Word'
  },
  {
    href: './downloads/核对.md',
    name: '下载核对备忘'
  }
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function shot(page, name) {
  if (!fs.existsSync(ARTIFACTS)) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ARTIFACTS, name), animations: 'disabled' });
}

test.describe('dismissed install banner', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('fenbao-install-dismissed', '1'));
  });

test('published files, manifest, and service worker stay accurate', async ({ request }) => {
  const data = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
  for (const name of VENDORS) expect(data).toContain(name);
  expect(data).toContain('湖南佳园建设工程有限公司');
  expect(data).toContain('曹敏');
  expect(data).toContain('游聚云');
  expect(data).toContain('杨建军');

  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('分包比选工作台');
  expect(manifest.start_url).toBe('./index.html');
  expect(manifest.scope).toBe('./');
  expect(manifest.description).not.toMatch(/仅本机|内网/);
  expect(manifest.description).toMatch(/源 PDF 未上传/);

  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  expect(sw).toContain("const CACHE = 'fenbao-bixuan-v6'");
  expect(sw).toContain('./downloads/核对.md');
  expect(sw).toContain('./templates/会审意见表_模板.docx');
  expect(sw).toContain('chi_sim.traineddata.gz');
  expect(sw).toContain('heic2any.min.js');
  expect(sw).not.toContain('fenbao-bixuan-v5');

  for (const item of DOWNLOADS) {
    const rel = item.href.replace(/^\.\//, '');
    const response = await request.get('/' + rel);
    expect(response.ok()).toBeTruthy();
    const body = Buffer.from(await response.body());
    const disk = sha256(path.join(ROOT, rel));
    const remote = crypto.createHash('sha256').update(body).digest('hex');
    expect(remote).toBe(disk);
  }
});

test('desktop sidebar navigates four views and keeps download links', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html');
  await page.keyboard.press('Tab');
  await expect(page.locator('#skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('项目首页');
  await expect(page.locator('.brand-name')).toHaveText('分包比选工作台');
  await expect(page.locator('#project-chip')).toContainText('双峰北220kV变电站工程土建施工地基基础');
  await expect(page.locator('#project-chip')).toContainText('2026年11月10日');
  await expect(page.getByText('源 PDF 未上传').first()).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.tabbar')).toBeHidden();
  await expect(page.locator('.stat').nth(0).locator('strong')).toHaveText('8');
  await expect(page.getByText('湖南百事恒兴建设工程有限公司').first()).toBeVisible();
  await expect(page.getByText('湖南佳园建设工程有限公司').first()).toBeVisible();

  const sidebar = page.locator('.sidebar');
  await sidebar.getByRole('link', { name: '名单核对' }).click();
  await expect(page).toHaveURL(/#review$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('名单核对');
  await expect(page.locator('#view-home')).toBeHidden();
  await expect(page.locator('#view-review')).toBeVisible();
  await expect(page.locator('.table-wrap')).toBeVisible();
  await expect(page.locator('.vendor-cards')).toBeHidden();
  await expect(page.getByRole('table', { name: '选用库会审名单' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /湖南湘中输变电建设有限公司/ })).toBeVisible();
  const xiangzhong = page.locator('tr[data-name="湖南湘中输变电建设有限公司"]');
  await expect(xiangzhong.locator('[data-field="teamLead"]')).toHaveValue('曹敏');
  await expect(xiangzhong.locator('[data-field="pm"]')).toHaveValue('刘易楠');
  const baishi = page.locator('tr[data-name="湖南百事恒兴建设工程有限公司"]');
  await expect(baishi.locator('[data-field="teamLead"]')).toHaveValue('杨建军');
  await expect(baishi.locator('[data-field="pm"]')).toHaveValue('游聚云');
  await expect(baishi).toContainText('安全资信报备证法定代表人');
  await expect(page.locator('#vendor-body')).not.toContainText('佳园');
  await expect(page.locator('#ignored-box')).toContainText('湖南佳园建设工程有限公司');
  const sideLink = sidebar.getByRole('link', { name: '项目首页' });
  expect((await sideLink.boundingBox()).height).toBeGreaterThanOrEqual(44);

  await sidebar.getByRole('link', { name: '表格导出' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('表格导出');
  for (const item of DOWNLOADS) {
    const link = page.getByRole('link', { name: item.name });
    await expect(link).toHaveAttribute('href', item.href);
    await expect(link).toHaveAttribute('download', '');
  }
  await expect(page.getByRole('button', { name: '生成会审意见 Word' })).toBeVisible();
  await expect(page.getByText('源申请报告和投入计划 PDF 未上传到本站')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#review$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('名单核对');
});

test('tablet shows the review table and bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto('/index.html#review');
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(page.locator('.table-wrap')).toBeVisible();
  await expect(page.locator('.vendor-cards')).toBeHidden();
  const tab = page.locator('.tabbar').getByRole('link', { name: '名单核对' });
  const box = await tab.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(tab).toHaveAttribute('aria-current', 'page');
});

test('phone uses vendor cards, bottom nav, and does not cover content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html#review');
  await expect(page.locator('.vendor-cards')).toBeVisible();
  await expect(page.locator('.table-wrap')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.getByRole('heading', { level: 3, name: '湖南友维电力建设有限公司' })).toBeVisible();
  for (const name of VENDORS) {
    await expect(page.locator('.vcard', { hasText: name })).toHaveCount(1);
  }

  const tabbar = page.locator('.tabbar');
  const box = await tabbar.getByRole('link', { name: '表格导出' }).boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);

  await tabbar.getByRole('link', { name: '表格导出' }).click();
  const download = page.getByRole('link', { name: '下载核对备忘' });
  await download.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const navBox = await tabbar.boundingBox();
  const linkBox = await download.boundingBox();
  expect(linkBox.y + linkBox.height).toBeLessThanOrEqual(navBox.y + 1);
});

test('file list records names only and can remove them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html#import');
  await expect(page.getByText('还没有资料')).toBeVisible();
  await expect(page.getByText('不会上传').first()).toBeVisible();

  await page.locator('#file-input').setInputFiles([
    { name: '申请报告.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') },
    { name: '湘中队伍投入计划.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK sample') }
  ]);

  await expect(page.getByText('申请报告.pdf')).toBeVisible();
  await expect(page.getByText('湘中队伍投入计划.docx')).toBeVisible();
  await expect(page.locator('.file-list')).toContainText(/未能读取正文|没有可用文字层/);
  await expect(page.getByText(/已识别|解析成功|上传成功|已登录/)).toHaveCount(0);

  const remove = page.getByRole('button', { name: '移除 申请报告.pdf' });
  const removeBox = await remove.boundingBox();
  expect(removeBox.height).toBeGreaterThanOrEqual(44);
  await remove.click();
  await expect(page.getByText('申请报告.pdf')).toHaveCount(0);
  await expect(page.getByText('湘中队伍投入计划.docx')).toBeVisible();

  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['plan'], '拖入计划.pdf', { type: 'application/pdf' }));
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer
    }));
  });
  await expect(page.getByText('拖入计划.pdf')).toBeVisible();

  await page.getByRole('button', { name: '载入文字示例' }).click();
  await expect(page.getByText('双峰北_申请报告.txt')).toBeVisible();
  await expect(page.locator('#file-list')).toContainText('情况说明，不列入');
  await page.getByRole('button', { name: '用这些资料填写名单' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('名单核对');
  const card = page.locator('.vcard', { hasText: '湖南百事恒兴建设工程有限公司' });
  await expect(card.locator('[data-field="teamLead"]')).toHaveValue('');
  await expect(card).toContainText('候选 杨建军');
  await expect(card.locator('[data-field="pm"]')).toHaveValue('游聚云');
  await expect(card.locator('[data-field="labor"]')).toHaveValue('');
  await expect(page.locator('.vcard', { hasText: '佳园' })).toHaveCount(0);
});

test('screenshots of phone, tablet, and desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/index.html');
  await shot(page, 'desktop_home_1280.png');

  await page.setViewportSize({ width: 1280, height: 1040 });
  await page.locator('.sidebar').getByRole('link', { name: '名单核对' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('名单核对');
  await shot(page, 'desktop_review_1280.png');
  await page.setViewportSize({ width: 1280, height: 860 });

  await page.locator('.sidebar').getByRole('link', { name: '表格导出' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('表格导出');
  await shot(page, 'desktop_export_1280.png');

  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto('/index.html#review');
  await shot(page, 'tablet_review_834.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html#review');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('名单核对');
  await shot(page, 'mobile_review_390.png');

  await page.locator('.tabbar').getByRole('link', { name: '资料导入' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('资料导入');
  await page.locator('#file-input').setInputFiles({
    name: '湘中队伍投入计划.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 name-only')
  });
  await shot(page, 'mobile_import_390.png');
  });
});

test('install banner is dismissible and stays in document flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');

  const banner = page.locator('#install-banner');
  await expect(banner).toBeVisible();
  await expect(banner.getByText('用 Chrome 打开本页')).toBeVisible();
  await expect(banner.locator('.install-ios')).toBeHidden();
  const position = await banner.evaluate((el) => getComputedStyle(el).position);
  expect(['static', 'relative']).toContain(position);

  const bannerBox = await banner.boundingBox();
  const ledeBox = await page.locator('#view-home .lede').boundingBox();
  const navBox = await page.locator('.tabbar').boundingBox();
  expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(ledeBox.y + 1);
  expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(navBox.y);
  await shot(page, 'mobile_home_390.png');

  const close = page.getByRole('button', { name: '关闭安装提示' });
  expect((await close.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(banner).toBeHidden();
});
