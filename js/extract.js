(function (root) {
  const COMPANY = /[\u4e00-\u9fa5]{2,40}(?:有限责任公司|股份有限公司|有限公司)/g;

  function norm(value) {
    return String(value || '').replace(/\s+/g, '');
  }

  function redact(text) {
    return String(text || '')
      .replace(/[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, '')
      .replace(/1[3-9]\d{9}/g, '');
  }

  function companiesIn(text) {
    const found = [];
    const seen = new Set();
    for (const match of String(text || '').matchAll(COMPANY)) {
      const name = match[0];
      if (seen.has(name)) continue;
      seen.add(name);
      found.push({ name: name, index: match.index });
    }
    return found;
  }

  function classify(name, text) {
    const blob = norm(name) + '\n' + norm(text);
    if (/身份证|社保证明|社保缴费|缴费明细/.test(norm(name))) return 'privacy';
    if (/情况说明/.test(blob)) return 'skip';
    if (/安全资信报备证/.test(blob)) return 'license';
    if (/申请报告|申请表|匹配申请/.test(blob)) return 'application';
    if (/名录/.test(blob)) return 'roster';
    if (/投入计划/.test(blob)) return 'plan';
    return 'unknown';
  }

  function lineAfter(text, label) {
    const match = String(text || '').match(new RegExp(label + '\\s*[:：]\\s*([^\\n]+)'));
    return match ? match[1].trim() : '';
  }

  function personAfter(text, label) {
    const match = String(text || '').match(new RegExp(label + '\\s*[:：]\\s*([\\u4e00-\\u9fa5]{2,4})'));
    return match ? match[1] : '';
  }

  function laborName(text) {
    const re = /劳务现场负责人\s*[:：]\s*([\u4e00-\u9fa5]{2,4})/g;
    let match;
    while ((match = re.exec(String(text || '')))) {
      const before = text.slice(Math.max(0, match.index - 16), match.index);
      if (/项目负责人|项目经理|专业项目经理|[/／]/.test(before)) continue;
      return match[1];
    }
    return '';
  }

  function parseApplication(text) {
    const unitProject = lineAfter(text, '单位和工程名称');
    const scopeLine = lineAfter(text, '工作量及标包简介');
    const periodLine = lineAfter(text, '工期计划安排') || (String(text).match(/20\d{2}年\d{1,2}月至20\d{2}年\d{1,2}月/) || [])[0] || '';
    const date = String(text).match(/会审日期\s*[:：]\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/);
    let unit = '';
    let projectCore = '';
    const split = unitProject.match(/^(.*?公司)(.+?)专业分包\s*$/);
    if (split) {
      unit = split[1];
      projectCore = split[2];
    }
    let scope = scopeLine.replace(/。\s*$/, '');
    return {
      unit: unit,
      projectCore: projectCore,
      unitProject: unitProject,
      scope: scope,
      period: periodLine.replace(/\s/g, ''),
      reviewYear: date ? date[1] : '',
      reviewMonth: date ? String(Number(date[2])) : '',
      reviewDay: date ? String(Number(date[3])) : ''
    };
  }

  function section(text, startLabel, endLabels) {
    const source = String(text || '');
    const start = source.search(startLabel);
    if (start < 0) return '';
    const from = source.slice(start);
    let end = from.length;
    endLabels.forEach((label) => {
      const at = from.indexOf(label, startLabel.length);
      if (at > 0) end = Math.min(end, at);
    });
    return from.slice(0, end);
  }

  function parseRoster(text) {
    const chosenText = section(text, '选用库', ['备选库', '备选']);
    const altText = section(text, '备选', []);
    const frame = lineAfter(text, '名录编号');
    return {
      frameNo: frame,
      chosen: companiesIn(chosenText || text).map((item) => item.name),
      alternate: companiesIn(altText).map((item) => item.name)
    };
  }

  function chunksByCompany(text) {
    const found = companiesIn(text);
    return found.map((item, index) => ({
      name: item.name,
      text: text.slice(item.index, found[index + 1] ? found[index + 1].index : text.length)
    }));
  }

  function pmName(text) {
    return personAfter(text, '专业项目经理')
      || personAfter(text, '项目负责人')
      || personAfter(text, '项目经理')
      || ((String(text).match(/项目负责人\s*[/／][^:：]{0,12}[:：]\s*([\u4e00-\u9fa5]{2,4})/) || [])[1] || '');
  }

  function parsePlan(text) {
    return chunksByCompany(text).map((chunk) => ({
      name: chunk.name,
      teamLead: personAfter(chunk.text, '队伍负责人'),
      pm: pmName(chunk.text),
      labor: laborName(chunk.text)
    }));
  }

  function parseLicense(text) {
    return chunksByCompany(text).map((chunk) => ({
      name: chunk.name,
      legal: personAfter(chunk.text, '法定代表人')
    }));
  }

  function parseSkip(text) {
    return companiesIn(text).map((item) => item.name);
  }

  function buildProject(documents) {
    const docs = documents || [];
    const warnings = [];
    const application = docs.find((doc) => doc.className === 'application');
    const roster = docs.find((doc) => doc.className === 'roster');
    const header = application ? parseApplication(application.text) : {};
    const rosterData = roster ? parseRoster(roster.text) : { chosen: [], alternate: [], frameNo: '' };
    if (!application) warnings.push('未读到申请报告，表头留空。');
    if (!roster || !rosterData.chosen.length) warnings.push('未读到选用库，没有分包商行。');

    const plans = [];
    const licenses = [];
    docs.filter((doc) => doc.className === 'plan').forEach((doc) => plans.push.apply(plans, parsePlan(doc.text)));
    docs.filter((doc) => doc.className === 'license').forEach((doc) => licenses.push.apply(licenses, parseLicense(doc.text)));

    const ignored = [];
    const skipNames = [];
    docs.filter((doc) => doc.className === 'skip').forEach((doc) => {
      parseSkip(doc.text).forEach((name) => skipNames.push(name));
    });
    rosterData.alternate.forEach((name) => {
      if (!rosterData.chosen.some((chosen) => norm(chosen) === norm(name))) {
        ignored.push({ name: name, reason: '不在选用库，不列入会审表' });
      }
    });
    skipNames.forEach((name) => {
      if (rosterData.chosen.some((chosen) => norm(chosen) === norm(name))) return;
      if (ignored.some((item) => norm(item.name) === norm(name))) {
        const current = ignored.find((item) => norm(item.name) === norm(name));
        current.reason = '情况说明，不列入会审表';
        return;
      }
      ignored.push({ name: name, reason: '情况说明，不列入会审表' });
    });

    const vendors = rosterData.chosen.map((name) => {
      const plan = plans.find((item) => norm(item.name) === norm(name));
      const license = licenses.find((item) => norm(item.name) === norm(name));
      let teamLead = '';
      let teamLeadSource = '';
      if (plan && plan.teamLead) {
        teamLead = plan.teamLead;
        teamLeadSource = '投入计划';
      } else if (license && license.legal) {
        teamLead = license.legal;
        teamLeadSource = '安全资信报备证法定代表人';
      }
      const pm = plan && plan.pm ? plan.pm : '';
      const labor = plan && plan.labor ? plan.labor : '';
      return {
        name: name,
        teamLead: teamLead,
        teamLeadSource: teamLeadSource,
        pm: pm,
        pmSource: pm ? '投入计划' : '',
        labor: labor,
        laborSource: labor ? '投入计划' : '',
        planFound: Boolean(plan)
      };
    });

    docs.filter((doc) => doc.className === 'scan').forEach(() => {
      warnings.push('有扫描件没有读出文字，对应栏留空，请在名单核对里手工改正。');
    });

    return {
      issuer: '湖南省送变电工程有限公司',
      unit: header.unit || '',
      projectCore: header.projectCore || '',
      unitProject: header.unitProject || '',
      scope: header.scope || '',
      period: header.period || '',
      reviewYear: header.reviewYear || '',
      reviewMonth: header.reviewMonth || '',
      reviewDay: header.reviewDay || '',
      frameNo: rosterData.frameNo || '',
      warnings: warnings.filter((item, index) => warnings.indexOf(item) === index),
      vendors: vendors,
      ignored: ignored
    };
  }

  root.FENBAO_EXTRACT = {
    redact: redact,
    classify: classify,
    buildProject: buildProject,
    parseApplication: parseApplication,
    parseRoster: parseRoster,
    parsePlan: parsePlan
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
