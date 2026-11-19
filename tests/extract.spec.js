import fs from 'fs';
import path from 'path';
import vm from 'vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(process.cwd());
const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/extract.js'), 'utf8'), context);
const api = context.FENBAO_EXTRACT;

function read(name) {
  return fs.readFileSync(path.join(root, 'fixtures', name), 'utf8');
}

test('fixture text builds the 双峰北 roster without 佳园', () => {
  const files = fs.readdirSync(path.join(root, 'fixtures')).filter((name) => name.endsWith('.txt'));
  const documents = files.map((name) => {
    const text = read(name);
    return { name, text, className: api.classify(name, text) };
  });
  assert.equal(documents.find((item) => item.name.includes('佳园')).className, 'skip');
  assert.equal(documents.find((item) => item.name.includes('申请报告')).className, 'application');
  assert.equal(documents.find((item) => item.name.includes('名录')).className, 'roster');
  assert.equal(documents.find((item) => item.name.includes('安全资信')).className, 'license');

  const project = api.buildProject(documents);
  assert.equal(project.vendors.length, 8);
  assert.equal(project.projectCore, '双峰北220kV变电站工程土建施工地基基础');
  assert.equal(project.period, '2026年12月至2027年7月');
  assert.match(project.scope, /计划分1个标包，资源投入不少于2个班组/);
  assert.equal(project.reviewYear, '2026');
  assert.equal(project.reviewMonth, '11');
  assert.equal(project.reviewDay, '10');
  assert.equal(JSON.stringify(project.vendors.map((item) => [item.name, item.teamLead, item.pm, item.labor])), JSON.stringify([
    ['湖南湘中输变电建设有限公司', '曹敏', '刘易楠', ''],
    ['湖南鑫军送变电有限责任公司', '罗曙光', '罗雄', ''],
    ['湖南友维电力建设有限公司', '陈钰', '向颖', ''],
    ['湖南鼎淳建设有限公司', '陈红刚', '刘哲', ''],
    ['湖南百事恒兴建设工程有限公司', '杨建军', '游聚云', ''],
    ['湖南长坤建设有限公司', '刘应端', '许书强', ''],
    ['湖南科创电力工程技术有限公司', '张栋', '陈少龙', ''],
    ['湖南省湘乡市电力建设有限公司', '陈青生', '周波', '']
  ]));
  assert.equal(project.vendors[4].teamLeadSource, '安全资信报备证法定代表人');
  assert.equal(project.vendors[2].labor, '');
  assert.equal(project.vendors.some((item) => item.name.includes('佳园')), false);
  assert.equal(project.ignored.some((item) => item.name.includes('佳园')), true);
});

test('identity numbers and phones are stripped before classification text is kept', () => {
  const raw = '队伍负责人：曹敏 430102199001011234 手机13800138000';
  const cleaned = api.redact(raw);
  assert.equal(cleaned.includes('430102199001011234'), false);
  assert.equal(cleaned.includes('13800138000'), false);
  assert.equal(cleaned.includes('曹敏'), true);
});

test('a roster-only station does not invent names', () => {
  const project = api.buildProject([
    {
      name: '申请报告.txt',
      className: 'application',
      text: '单位和工程名称：变电施工一分公司测试站110kV线路工程专业分包\n工作量及标包简介：基础施工。计划分2个标包，资源投入不少于3个班组。\n工期计划安排：2026年3月至2026年8月\n会审日期：2026年2月1日'
    },
    {
      name: '名录.txt',
      className: 'roster',
      text: '选用库\n测试甲有限公司\n测试乙有限公司\n备选库\n测试丙有限公司'
    },
    {
      name: '甲_投入计划.txt',
      className: 'plan',
      text: '测试甲有限公司\n队伍负责人：甲一\n项目负责人：甲二'
    }
  ]);
  assert.equal(project.projectCore, '测试站110kV线路工程');
  assert.equal(project.vendors.length, 2);
  assert.equal(JSON.stringify(project.vendors[0]), JSON.stringify({
    name: '测试甲有限公司',
    teamLead: '甲一',
    teamLeadSource: '投入计划',
    pm: '甲二',
    pmSource: '投入计划',
    labor: '',
    laborSource: '',
    planFound: true
  }));
  assert.equal(project.vendors[1].teamLead, '');
  assert.equal(project.vendors[1].pm, '');
  assert.equal(project.vendors[1].planFound, false);
  assert.equal(project.ignored.some((item) => item.name === '测试丙有限公司'), true);
});
