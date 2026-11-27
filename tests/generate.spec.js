import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'fs';

async function xmlFrom(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file('word/document.xml').async('string');
}

test('generated Word keeps the template wording and unchecked boxes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fenbao-install-dismissed', '1'));
  await page.goto('/index.html#export');
  const bytes = await page.evaluate(async () => {
    const project = JSON.parse(JSON.stringify(window.FENBAO_SAMPLE));
    project.projectCore = '测试站110kV线路工程';
    project.unit = '变电施工一分公司';
    project.unitProject = '变电施工一分公司测试站110kV线路工程专业分包';
    project.scope = '基础施工。计划分2个标包，资源投入不少于3个班组';
    project.period = '2026年3月至2026年8月';
    project.reviewYear = '2026';
    project.reviewMonth = '2';
    project.reviewDay = '1';
    project.vendors = [
      { name: '测试甲有限公司', teamLead: '甲一', pm: '甲二', labor: '' },
      { name: '测试乙有限公司', teamLead: '乙一', pm: '乙二', labor: '乙三' }
    ];
    const blob = await window.FENBAO_DOCX.build(project);
    const buffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buffer));
  });
  const xml = await xmlFrom(Uint8Array.from(bytes));
  expect(xml).toContain('湖南省送变电工程有限公司');
  expect(xml).toContain('测试站110kV线路工程');
  expect(xml).toContain('专业分包');
  expect(xml).toContain('商队伍投入计划会审意见');
  expect(xml).toContain('变电施工一分公司测试站110kV线路工程专业分包');
  expect(xml).toContain('计划分2个标包，资源投入不少于3个班组');
  expect(xml).toContain('2026年3月至2026年8月');
  expect(xml).toContain('测试甲有限公司');
  expect(xml).toContain('甲一');
  expect(xml).toContain('乙三');
  expect(xml).not.toContain('佳园');
  expect(xml).not.toContain('曹敏');
  expect(xml).toContain('否决事项清单');
  expect(xml).toContain('未提交外包商队伍投入计划的作为否决项');
  expect(xml).toContain('否决事项原因');
  expect(xml).toContain('会审小组签名');
  expect(xml).toContain('公司分管负责人');
  expect(xml.match(/w:char="00A8"/g)).toHaveLength(4);
});

test('built-in sample download matches the canonical template bytes', () => {
  const sample = fs.readFileSync('downloads/双峰北220kV_地基基础_会审意见_已填.docx');
  const template = fs.readFileSync('templates/会审意见表_模板.docx');
  expect(Buffer.compare(sample, template)).toBe(0);
});
