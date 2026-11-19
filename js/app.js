(function () {
  const VIEWS = [
    { id: 'home', label: '项目首页' },
    { id: 'import', label: '资料导入' },
    { id: 'review', label: '名单核对' },
    { id: 'export', label: '表格导出' }
  ];
  const FIXTURES = [
    '双峰北_申请报告.txt',
    '双峰北_外包商名录.txt',
    '双峰北_湘中_队伍投入计划.txt',
    '双峰北_鑫军_队伍投入计划.txt',
    '双峰北_友维_队伍投入计划.txt',
    '双峰北_鼎淳_队伍投入计划.txt',
    '双峰北_百事恒兴_资源投入计划.txt',
    '双峰北_百事恒兴_安全资信报备证.txt',
    '双峰北_长坤_队伍投入计划.txt',
    '双峰北_科创_队伍投入计划.txt',
    '双峰北_湘乡_队伍投入计划.txt',
    '双峰北_佳园_情况说明.txt'
  ];

  const extract = window.FENBAO_EXTRACT;
  let project = clone(window.FENBAO_SAMPLE);
  let imported = [];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function needsReview(vendor) {
    return !vendor.planFound || !vendor.teamLead || !vendor.pm || vendor.teamLeadSource === '安全资信报备证法定代表人';
  }

  function reviewDateText() {
    if (!project.reviewYear) return '';
    return project.reviewYear + '年' + project.reviewMonth + '月' + project.reviewDay + '日';
  }

  function titleText() {
    return (project.issuer || '') + (project.projectCore || '') + '专业分包商队伍投入计划会审意见';
  }

  function viewFromHash() {
    const id = (location.hash || '').replace(/^#/, '');
    return VIEWS.some((view) => view.id === id) ? id : 'home';
  }

  function applyView(fromUser) {
    const id = viewFromHash();
    const raw = (location.hash || '').replace(/^#/, '');
    if (raw && raw !== id) history.replaceState(null, '', '#home');
    VIEWS.forEach((view) => {
      const panel = document.getElementById('view-' + view.id);
      if (panel) panel.hidden = view.id !== id;
    });
    document.querySelectorAll('a[data-nav]').forEach((link) => {
      if (link.dataset.nav === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const current = VIEWS.find((view) => view.id === id);
    const heading = document.getElementById('view-heading');
    heading.textContent = current.label;
    document.title = current.label + ' · 分包比选工作台';
    if (fromUser) heading.focus();
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    if (!VIEWS.some((view) => view.id === id)) return;
    event.preventDefault();
    if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
    applyView(true);
  });
  window.addEventListener('hashchange', () => applyView(false));
  window.addEventListener('popstate', () => applyView(false));
  applyView(false);
  document.getElementById('skip-link').addEventListener('click', () => {
    document.getElementById('main').focus();
  });

  function sourceLine(source) {
    return source ? '<p class="source">来源 ' + esc(source) + '</p>' : '';
  }

  function render() {
    const chip = document.getElementById('project-chip');
    chip.textContent = [project.projectCore || '未填写工程', reviewDateText()].filter(Boolean).join(' · ');

    const pending = project.vendors.filter(needsReview).length;
    const planned = project.vendors.filter((vendor) => vendor.planFound).length;
    document.getElementById('stats').innerHTML = [
      ['选用库', project.vendors.length, false],
      ['已对上投入计划', planned, false],
      ['待核对', pending, pending > 0],
      ['不列入', project.ignored.length, false]
    ].map(([label, value, warn]) =>
      '<div class="stat' + (warn ? ' warn' : '') + '"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>'
    ).join('');

    const facts = [
      ['会审标题', titleText()],
      ['单位和工程', project.unitProject || '未读到申请报告'],
      ['工作量及标包', project.scope || '未读到'],
      ['工期', project.period || '未读到'],
      ['会审日期', reviewDateText() || '未读到'],
      ['名录编号', project.frameNo || '未读到']
    ];
    document.getElementById('project-facts').innerHTML = facts.map(([label, value]) =>
      '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>'
    ).join('');

    const watch = [];
    project.warnings.forEach((warning) => watch.push('<p>' + esc(warning) + '</p>'));
    project.vendors.filter(needsReview).forEach((vendor) => {
      const reason = !vendor.planFound ? '未读到投入计划' : (vendor.teamLeadSource === '安全资信报备证法定代表人' ? '队伍负责人取自法定代表人，请核对' : '姓名未读全');
      watch.push('<article class="watch-item"><strong>' + esc(vendor.name) + '</strong><p>' + esc(reason) + '</p></article>');
    });
    project.ignored.forEach((item) => {
      watch.push('<article class="watch-item"><strong>' + esc(item.name) + '</strong><p>' + esc(item.reason) + '</p></article>');
    });
    if (!watch.length) watch.push('<p>当前名单可以直接导出。是否同意仍留空。</p>');
    document.getElementById('watch-box').innerHTML = watch.join('');

    document.getElementById('vendor-count').textContent = project.vendors.length ? project.vendors.length + ' 家' : '';
    const cards = document.getElementById('vendor-cards');
    const tbody = document.getElementById('vendor-body');
    if (!project.vendors.length) {
      const empty = '<p class="empty">选用库还没有分包商。请先在资料导入中读取申请报告、名录和投入计划。</p>';
      cards.innerHTML = empty;
      tbody.innerHTML = '<tr><td colspan="6">' + empty + '</td></tr>';
    } else {
      cards.innerHTML = project.vendors.map((vendor, index) => rowCard(vendor, index)).join('');
      tbody.innerHTML = project.vendors.map((vendor, index) => rowTable(vendor, index)).join('');
      bindInputs(cards);
      bindInputs(tbody);
    }

    const ignored = document.getElementById('ignored-box');
    if (!project.ignored.length) {
      ignored.innerHTML = '<p class="empty">没有因情况说明被排除的单位。</p>';
    } else {
      ignored.innerHTML = project.ignored.map((item) =>
        '<article class="alt-item"><h3>' + esc(item.name) + '</h3><p><span class="tag warn">' + esc(item.reason) + '</span></p></article>'
      ).join('');
    }
    renderFiles();
  }

  function fieldInput(vendor, index, field, label) {
    return '<label class="field"><span class="sr-only">' + esc(vendor.name + ' ' + label) + '</span>' +
      '<input data-index="' + index + '" data-field="' + field + '" value="' + esc(vendor[field] || '') + '" aria-label="' + esc(vendor.name + '的' + label) + '" /></label>';
  }

  function rowCard(vendor, index) {
    return '<article class="vcard" data-name="' + esc(vendor.name) + '">' +
      '<header><span class="vno">' + (index + 1) + '</span><h3>' + esc(vendor.name) + '</h3></header>' +
      '<div class="field-block"><p>队伍负责人</p>' + fieldInput(vendor, index, 'teamLead', '队伍负责人') + sourceLine(vendor.teamLeadSource) + '</div>' +
      '<div class="field-block"><p>专业项目经理</p>' + fieldInput(vendor, index, 'pm', '专业项目经理') + sourceLine(vendor.pmSource) + '</div>' +
      '<div class="field-block"><p>劳务现场负责人</p>' + fieldInput(vendor, index, 'labor', '劳务现场负责人') + sourceLine(vendor.laborSource) + '</div>' +
      '<div class="tags">' + statusTags(vendor) + '<span class="tag">是否同意未勾选</span></div></article>';
  }

  function rowTable(vendor, index) {
    return '<tr data-name="' + esc(vendor.name) + '"><td>' + (index + 1) + '</td>' +
      '<th scope="row">' + esc(vendor.name) + '</th>' +
      '<td>' + fieldInput(vendor, index, 'teamLead', '队伍负责人') + sourceLine(vendor.teamLeadSource) + '</td>' +
      '<td>' + fieldInput(vendor, index, 'pm', '专业项目经理') + sourceLine(vendor.pmSource) + '</td>' +
      '<td>' + fieldInput(vendor, index, 'labor', '劳务现场负责人') + sourceLine(vendor.laborSource) + '</td>' +
      '<td><div class="tags">' + statusTags(vendor) + '</div><p class="source">是否同意未勾选</p></td></tr>';
  }

  function statusTags(vendor) {
    if (!vendor.planFound) return '<span class="tag miss">未读到投入计划</span>';
    if (needsReview(vendor)) return '<span class="tag warn">待核对</span>';
    return '<span class="tag ok">已读取</span>';
  }

  function bindInputs(rootNode) {
    rootNode.querySelectorAll('input[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const vendor = project.vendors[Number(input.dataset.index)];
        vendor[input.dataset.field] = input.value.trim();
        const sourceKey = input.dataset.field + 'Source';
        if (sourceKey in vendor) vendor[sourceKey] = input.value.trim() ? '手工修改' : '';
        if (input.dataset.field === 'teamLead' || input.dataset.field === 'pm') vendor.planFound = vendor.planFound || Boolean(input.value.trim());
      });
    });
  }

  function classLabel(className) {
    return {
      application: '申请报告',
      roster: '名录',
      plan: '投入计划',
      license: '安全资信报备证',
      skip: '情况说明，不列入',
      privacy: '证件或社保，已跳过',
      scan: '扫描件，未读出文字',
      unknown: '未识别类型'
    }[className] || className;
  }

  function renderFiles() {
    const list = document.getElementById('file-list');
    const empty = document.getElementById('file-empty');
    if (!imported.length) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = imported.map((file, index) =>
      '<li><span class="file-name"><strong>' + esc(file.name) + '</strong> <span class="muted">(' + esc(file.sizeLabel) + ')</span>' +
      '<span class="source">分类 ' + esc(classLabel(file.className)) + (file.note ? ' · ' + esc(file.note) : '') + '</span></span>' +
      '<button type="button" class="btn secondary" data-i="' + index + '" aria-label="移除 ' + esc(file.name) + '">移除</button></li>'
    ).join('');
    list.querySelectorAll('button[data-i]').forEach((button) => {
      button.addEventListener('click', () => {
        imported.splice(Number(button.dataset.i), 1);
        renderFiles();
      });
    });
  }

  function formatSize(size) {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('无法加载 ' + src));
      document.head.appendChild(script);
    });
  }

  async function readPdf(buffer) {
    await loadScript('./vendor/pdfjs/pdf.js');
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.js';
    const task = pdfjs.getDocument({
      data: buffer,
      cMapUrl: './vendor/pdfjs/cmaps/',
      cMapPacked: true
    });
    const pdf = await task.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(''));
    }
    return pages.join('\n');
  }

  async function readDocx(buffer) {
    await loadScript('./vendor/jszip.min.js');
    const zip = await window.JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml').async('string');
    return Array.from(xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)).map((match) => match[1]).join('');
  }

  async function readImportedFile(file) {
    const name = file.name;
    const lower = name.toLowerCase();
    let text = '';
    let note = '';
    try {
      if (lower.endsWith('.txt') || lower.endsWith('.md')) text = await file.text();
      else if (lower.endsWith('.docx')) text = await readDocx(await file.arrayBuffer());
      else if (lower.endsWith('.pdf')) text = await readPdf(await file.arrayBuffer());
      else note = '只读取 PDF、Word 和 txt';
    } catch (error) {
      note = '未能读取正文';
      text = '';
    }
    text = extract.redact(text);
    let className = extract.classify(name, text);
    if (lower.endsWith('.pdf') && text.trim().length < 40 && className !== 'privacy') {
      className = 'scan';
      note = '没有可用文字层';
    } else if (!note && text.trim()) note = '已读取正文';
    else if (!note) note = '没有读到正文';
    return {
      name: name,
      sizeLabel: formatSize(file.size || text.length),
      className: className,
      note: note,
      text: className === 'privacy' ? '' : text
    };
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) imported.push(await readImportedFile(file));
    renderFiles();
  }

  const drop = document.getElementById('drop');
  const input = document.getElementById('file-input');
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('drag');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('drag');
    addFiles(event.dataTransfer && event.dataTransfer.files);
  });
  drop.addEventListener('click', (event) => {
    if (event.target.closest('label')) return;
    input.click();
  });
  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = '';
  });

  document.getElementById('load-fixture').addEventListener('click', async () => {
    imported = [];
    for (const name of FIXTURES) {
      const response = await fetch('./fixtures/' + encodeURIComponent(name));
      const text = extract.redact(await response.text());
      imported.push({
        name: name,
        sizeLabel: formatSize(text.length),
        className: extract.classify(name, text),
        note: '文字示例，已读取正文',
        text: text
      });
    }
    renderFiles();
  });

  document.getElementById('apply-import').addEventListener('click', () => {
    const usable = imported.filter((file) => file.text && file.className !== 'privacy' && file.className !== 'scan');
    if (!usable.length) {
      project.warnings = ['没有可读取的正文，名单未改。扫描件请手工补姓名。'];
      render();
      return;
    }
    project = extract.buildProject(usable.map((file) => ({ name: file.name, text: file.text, className: file.className })));
    render();
    if (location.hash !== '#review') location.hash = 'review';
    else applyView(true);
  });

  document.getElementById('reset-sample').addEventListener('click', () => {
    project = clone(window.FENBAO_SAMPLE);
    render();
  });

  document.getElementById('generate-docx').addEventListener('click', async () => {
    const button = document.getElementById('generate-docx');
    button.disabled = true;
    try {
      await loadScript('./vendor/jszip.min.js');
      const blob = await window.FENBAO_DOCX.build(project);
      const link = document.createElement('a');
      const core = project.projectCore || '会审意见';
      link.href = URL.createObjectURL(blob);
      link.download = core + '_会审意见.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) {
      project.warnings = ['生成 Word 失败：' + (error.message || '未知原因')];
      render();
    } finally {
      button.disabled = false;
    }
  });

  const banner = document.getElementById('install-banner');
  const dismissKey = 'fenbao-install-dismissed';
  function dismissed() {
    try { return localStorage.getItem(dismissKey) === '1'; }
    catch (error) { return false; }
  }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone && !dismissed()) {
    banner.hidden = false;
    banner.querySelector('.install-ios').hidden = !ios;
    banner.querySelector('.install-other').hidden = ios;
  }
  document.getElementById('install-dismiss').addEventListener('click', () => {
    try { localStorage.setItem(dismissKey, '1'); }
    catch (error) { /* 本次先关掉提示。 */ }
    banner.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
})();
