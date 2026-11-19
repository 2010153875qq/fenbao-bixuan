(function (root) {
  const COMPANY = /[\u4e00-\u9fa5]{2,40}(?:有限责任公司|股份有限公司|有限公司)/g;

  function norm(value) {
    return String(value || '').replace(/\s+/g, '');
  }

  function singleHan(value) {
    return /^[\u4e00-\u9fa5]$/.test(value);
  }

  function squeezeLine(line) {
    let parts = line.split(/ +/).filter(Boolean);
    let changed = true;
    while (changed) {
      changed = false;
      const next = [];
      for (let i = 0; i < parts.length; i += 1) {
        const current = parts[i];
        const following = parts[i + 1];
        const companyTail = /有限责任公司|股份有限公司|有限公司|限公司/.test(following) && !/公司/.test(current);
        if (following && /[\u4e00-\u9fa5]/.test(current) && /[\u4e00-\u9fa5]/.test(following) && (singleHan(current) || singleHan(following) || companyTail)) {
          next.push(current + following);
          i += 1;
          changed = true;
        } else next.push(current);
      }
      parts = next;
    }
    return parts.join(' ');
  }

  function joinCompanySplits(text) {
    let cur = text;
    let prev;
    const split = /([^\s司])\s+(?=[\u4e00-\u9fa5]{0,8}(?:有限责任公司|股份有限公司|有限公司|限公司))/g;
    do {
      prev = cur;
      cur = cur.replace(split, '$1');
    } while (cur !== prev);
    return cur;
  }

  function normalize(text) {
    const flat = String(text || '').replace(/[\u00a0\t]+/g, ' ').replace(/\n+/g, ' ');
    const squeezed = joinCompanySplits(squeezeLine(flat));
    return squeezed
      .replace(/单位\s*[、和]\s*工程名称\s*(?:及\s*外包专业\s*)?[:：]/g, '单位和工程名称：')
      .replace(/工期计划安排\s*[:：]/g, '工期计划安排：')
      .replace(/ +/g, ' ')
      .trim();
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
      let name = match[0].replace(/^.*(?:选用库|备选库|填写|履历|展历)/, '');
      const cut = Math.max(name.lastIndexOf('家'), name.lastIndexOf('、'), name.lastIndexOf('：'), name.lastIndexOf(':'));
      if (cut >= 0) name = name.slice(cut + 1);
      const preferred = name.match(/(湖南[\u4e00-\u9fa5]{2,20}(?:有限责任公司|股份有限公司|有限公司))$/);
      if (preferred) name = preferred[1];
      if (name.length < 6 || seen.has(name)) continue;
      seen.add(name);
      found.push({ name: name, index: match.index });
    }
    return found;
  }

  function classify(name, text) {
    const file = norm(name);
    const body = normalize(text);
    const blob = file + body;
    if (/身份证|社保证明|社保缴费|缴费明细/.test(file)) return 'privacy';
    if (/选用库|外包商名录/.test(body)) return 'roster';
    if (/投入计划/.test(blob) || /队伍负责人/.test(body)) return 'plan';
    if (/安全资信报备证/.test(blob)) return 'license';
    if (/情况说明/.test(blob)) return 'skip';
    if (/申请报告|申请表|匹配申请/.test(blob)) return 'application';
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

  function parsePeriod(text) {
    const match = String(text).match(/20\d{2}\s*年\s*\d{1,2}\s*月\s*[-–—至到]+\s*20\d{2}\s*年\s*\d{1,2}\s*月/);
    if (!match) return '';
    const parts = match[0].replace(/\s/g, '').match(/(20\d{2})年(\d{1,2})月[-–—至到]+(20\d{2})年(\d{1,2})月/);
    if (!parts) return '';
    return parts[1] + '年' + Number(parts[2]) + '月至' + parts[3] + '年' + Number(parts[4]) + '月';
  }

  function parseScope(text) {
    const work = String(text).match(/土方开挖[\s\S]{0,500}?个班组/);
    if (work) return work[0].replace(/\s+/g, '').replace(/。$/, '');
    const pack = String(text).match(/计划分\s*(\d+)\s*个标包[，,]\s*资源投入不少于\s*(\d+)\s*个班组/);
    if (pack) return '计划分' + pack[1] + '个标包，资源投入不少于' + pack[2] + '个班组';
    return '';
  }

  function parseApplication(text) {
    const source = normalize(text);
    const unitMatch = source.match(/单位和工程名称：\s*(.+?)(?=\s*工作量|\s*工期计划|$)/);
    const unitProject = unitMatch ? unitMatch[1].replace(/\s+/g, '').replace(/[；;].*$/, '') : '';
    const periodLine = parsePeriod(source);
    const date = source.match(/会审日期\s*[:：]\s*(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/);
    let unit = '';
    let projectCore = '';
    const split = unitProject.match(/^(.*?公司)(.+?)专业(?:分包|外包)\s*$/);
    if (split) {
      unit = split[1];
      projectCore = split[2];
    }
    return {
      unit: unit,
      projectCore: projectCore,
      unitProject: unitProject,
      scope: parseScope(source),
      period: periodLine,
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
    const source = normalize(text);
    const chosenText = section(source, '选用库', ['备选库', '备选']);
    const altText = section(source, '备选', []);
    const frameMatch = source.match(/(?:名录编号|编号)\s*[:：]\s*([^\s：:]{2,24}框架\s*\d+)/);
    return {
      frameNo: frameMatch ? frameMatch[1].replace(/\s+/g, '') : '',
      chosen: companiesIn(chosenText || source).map((item) => item.name),
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

  const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛范彭郎鲁韦昌马苗凤花方俞任袁柳唐罗薛伍余元卜顾孟平黄和穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季贾路娄危江童颜郭梅盛林钟徐邱骆高夏蔡田胡凌霍万柯卢莫经房裘缪干解应宗丁宣邓单杭洪包诸左石崔吉龚程裴陆荣翁荀羊惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧山谷车侯宓蓬郗班仰秋仲伊宫宁仇栾暴甘厉戎祖武符刘詹束龙叶幸司韶郜黎薄印宿白怀蒲从鄂索咸籍赖卓蔺屠蒙池乔阴能苍双闻莘党翟谭贡劳姬申扶堵冉宰郦雍桑桂濮牛寿通边扈燕冀浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩聂晁勾敖融冷訾辛阚那简饶空曾沙养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公';

  function splitPersonNames(blob) {
    const names = [];
    let index = 0;
    while (index < blob.length && names.length < 2) {
      if (!SURNAMES.includes(blob[index])) {
        index += 1;
        continue;
      }
      let length = 2;
      const next = blob[index + 2];
      const after = blob[index + 3];
      if (next && !SURNAMES.includes(next) && after && SURNAMES.includes(after)) length = 3;
      if (index + length > blob.length) break;
      const name = blob.slice(index, index + length);
      if (!/公司|工程|计划|负责|班组|项目|安全|质检|技术|外包|单位|名称|专业|经理|双峰|变电|基础|土建|协管|管员/.test(name)) names.push(name);
      index += length;
    }
    return names;
  }

  function cleanPerson(value) {
    const bad = /公司|工程|计划|负责|班组|项目|安全|质检|技术|外包|单位|名称|专业|经理|双峰|变电|基础|土建|填写/;
    const name = String(value || '').replace(/[^\u4e00-\u9fa5]/g, '');
    if (name.length < 2 || name.length > 3 || bad.test(name)) return '';
    return name;
  }

  function positionalPeople(chunkText, company) {
    const at = chunkText.indexOf(company);
    if (at < 0) return [];
    const afterRaw = chunkText.slice(at + company.length, at + company.length + 18);
    const after = (/\s/.test(afterRaw) ? afterRaw.trim().split(/\s+/) : splitPersonNames(afterRaw))
      .map(cleanPerson).filter(Boolean);
    const beforeRaw = chunkText.slice(Math.max(0, at - 80), at);
    const labelAt = beforeRaw.search(/负.{0,2}人|项目负责人|项目经理/);
    let pm = '';
    if (labelAt >= 0) {
      pm = splitPersonNames(beforeRaw.slice(labelAt).replace(/\s+/g, '')).map(cleanPerson).filter((name) => name && name !== after[0])[0] || '';
    }
    if (!pm) pm = after[1] || '';
    return [after[0] || '', pm];
  }

  function parsePlan(text) {
    const source = normalize(text);
    const table = /队伍负责人|投入计划|外包商|负.{0,2}人/.test(source);
    return chunksByCompany(source).filter((chunk) => norm(chunk.name) !== '湖南省送变电工程有限公司').map((chunk) => {
      const explicitTeam = personAfter(chunk.text, '队伍负责人');
      const explicitPm = pmName(chunk.text);
      const positional = table ? positionalPeople(chunk.text, chunk.name) : [];
      return {
        name: chunk.name,
        teamLead: explicitTeam || positional[0] || '',
        pm: explicitPm || positional[1] || '',
        labor: laborName(chunk.text)
      };
    });
  }

  function parseLicense(text) {
    return chunksByCompany(normalize(text)).map((chunk) => ({
      name: chunk.name,
      legal: personAfter(chunk.text, '法定代表人')
    }));
  }

  function parseSkip(text) {
    return companiesIn(normalize(text)).map((item) => item.name);
  }

  function sameCompany(left, right) {
    const strip = (value) => norm(value).replace(/有限责任公司|股份有限公司|有限公司/g, '');
    const a = strip(left);
    const b = strip(right);
    if (!a || !b) return false;
    if (a === b || a.includes(b) || b.includes(a)) return true;
    const length = Math.min(a.length, b.length);
    let same = 0;
    for (let i = 0; i < length; i += 1) if (a[i] === b[i]) same += 1;
    return length >= 6 && same >= length - 1;
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
      const plan = plans.find((item) => sameCompany(item.name, name));
      const license = licenses.find((item) => sameCompany(item.name, name));
      let teamLead = '';
      let teamLeadSource = '';
      let teamLeadCandidate = '';
      let teamLeadCandidateSource = '';
      if (plan && plan.teamLead) {
        teamLead = plan.teamLead;
        teamLeadSource = '投入计划';
      } else if (license && license.legal) {
        teamLeadCandidate = license.legal;
        teamLeadCandidateSource = '安全资信报备证法定代表人，未自动填入';
      }
      const pm = plan && plan.pm ? plan.pm : '';
      const labor = plan && plan.labor ? plan.labor : '';
      return {
        name: name,
        teamLead: teamLead,
        teamLeadSource: teamLeadSource,
        teamLeadCandidate: teamLeadCandidate,
        teamLeadCandidateSource: teamLeadCandidateSource,
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
    normalize: normalize,
    classify: classify,
    buildProject: buildProject,
    parseApplication: parseApplication,
    parseRoster: parseRoster,
    parsePlan: parsePlan
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
