(function () {
  const VIEWS = [
    { id: 'home', label: '项目首页' },
    { id: 'import', label: '资料导入' },
    { id: 'review', label: '名单核对' },
    { id: 'export', label: '表格导出' }
  ];

  const project = window.FENBAO_PROJECT;
  const vendors = window.FENBAO_VENDORS || [];
  const alt = window.FENBAO_ALT || [];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
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

  if (project) {
    const chip = document.getElementById('project-chip');
    chip.textContent = project.frameNo + ' · ' + project.reviewDate;

    const facts = [
      ['工程', project.title],
      ['单位', project.unit],
      ['名录编号', project.frameNo],
      ['会审日期', project.reviewDate],
      ['工期', project.period],
      ['标包', project.packages],
      ['联系人', project.contact],
      ['工作范围', project.scope]
    ];
    document.getElementById('project-facts').innerHTML = facts.map(([label, value]) =>
      `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`
    ).join('');

    const planCount = vendors.filter((item) => item.plan).length;
    const matchCount = vendors.filter((item) => item.match === '一致').length;
    const pendingCount = vendors.length - matchCount;
    const stats = [
      ['参选分包商', vendors.length, false],
      ['已收投入计划', planCount, false],
      ['名单一致', matchCount, false],
      ['需留意', pendingCount, pendingCount > 0]
    ];
    document.getElementById('stats').innerHTML = stats.map(([label, value, warn]) =>
      `<div class="stat${warn ? ' warn' : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`
    ).join('');

    const exceptions = vendors.filter((item) => item.match !== '一致');
    const watch = [];
    if (!exceptions.length) {
      watch.push(`<p>选用库 ${vendors.length} 家的队伍负责人、专业项目经理与投入计划一致。</p>`);
    } else {
      exceptions.forEach((item) => {
        watch.push(
          `<article class="watch-item"><strong>${esc(item.name)}</strong>` +
          `<p>${esc(item.match)}。专业项目经理：${esc(item.pm || '—')}。</p></article>`
        );
      });
    }
    if (alt.length) {
      alt.forEach((item) => {
        watch.push(
          `<article class="watch-item"><strong>${esc(item.name)}</strong>` +
          `<p>备选库 · ${esc(item.status)}</p></article>`
        );
      });
    } else {
      watch.push('<p class="empty">备选库没有记录。</p>');
    }
    document.getElementById('watch-box').innerHTML = watch.join('');
  }

  const cards = document.getElementById('vendor-cards');
  const tbody = document.getElementById('vendor-body');
  const count = document.getElementById('vendor-count');
  if (count) count.textContent = vendors.length ? vendors.length + ' 家' : '';

  function person(name) {
    return name ? esc(name) : '<span class="dash">—</span>';
  }

  function teamLead(item) {
    return item.teamLead ? esc(item.teamLead) : '<span class="tag warn">未列明</span>';
  }

  function planTag(item) {
    return item.plan
      ? '<span class="tag ok">已收计划</span>'
      : '<span class="tag miss">未收到投入计划</span>';
  }

  function matchTag(item) {
    const kind = item.match === '一致' ? 'ok' : 'warn';
    return `<span class="tag ${kind}">${esc(item.match)}</span>`;
  }

  function noteHtml(item) {
    return item.note ? `<p class="note">${esc(item.note)}</p>` : '';
  }

  if (!vendors.length) {
    const empty = '<p class="empty">选用库还没有分包商。</p>';
    cards.innerHTML = empty;
    tbody.innerHTML = `<tr><td colspan="6">${empty}</td></tr>`;
  } else {
    cards.innerHTML = vendors.map((item) => `
      <article class="vcard">
        <header>
          <span class="vno">${esc(item.no)}</span>
          <h3>${esc(item.name)}</h3>
        </header>
        <p class="source">来源 ${esc(item.source)}</p>
        <dl>
          <div><dt>队伍负责人</dt><dd>${teamLead(item)}</dd></div>
          <div><dt>专业项目经理</dt><dd>${person(item.pm)}</dd></div>
          <div><dt>劳务现场负责人</dt><dd>${person(item.labor)}</dd></div>
        </dl>
        <div class="tags">${planTag(item)}${matchTag(item)}</div>
        ${noteHtml(item)}
      </article>
    `).join('');

    tbody.innerHTML = vendors.map((item) => `
      <tr>
        <td>${esc(item.no)}</td>
        <th scope="row">${esc(item.name)}<div class="source">${esc(item.source)}</div></th>
        <td>${teamLead(item)}</td>
        <td>${person(item.pm)}</td>
        <td>${person(item.labor)}</td>
        <td><div class="tags">${planTag(item)}${matchTag(item)}</div>${noteHtml(item)}</td>
      </tr>
    `).join('');
  }

  const altBox = document.getElementById('alt-box');
  if (!alt.length) {
    altBox.innerHTML = '<p class="empty">备选库没有记录。</p>';
  } else {
    altBox.innerHTML = alt.map((item) => `
      <article class="alt-item">
        <h3>${esc(item.name)}</h3>
        <p><span class="tag warn">${esc(item.status)}</span></p>
        <p>${esc(item.note)}</p>
      </article>
    `).join('');
  }

  const drop = document.getElementById('drop');
  const input = document.getElementById('file-input');
  const list = document.getElementById('file-list');
  const empty = document.getElementById('file-empty');
  const files = [];

  function formatSize(size) {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderFiles() {
    if (!files.length) {
      list.innerHTML = '';
      empty.hidden = false;
      list.setAttribute('aria-label', '文件名清单');
      return;
    }
    empty.hidden = true;
    list.setAttribute('aria-label', '已列 ' + files.length + ' 个文件名');
    list.innerHTML = files.map((file, index) => `
      <li>
        <span class="file-name">${esc(file.name)} <span class="muted">(${esc(formatSize(file.size))})</span></span>
        <button type="button" class="btn secondary" data-i="${index}" aria-label="移除 ${esc(file.name)}">移除</button>
      </li>
    `).join('');
    list.querySelectorAll('button[data-i]').forEach((button) => {
      button.addEventListener('click', () => {
        files.splice(Number(button.dataset.i), 1);
        renderFiles();
      });
    });
  }

  function addFiles(fileList) {
    Array.from(fileList || []).forEach((file) => {
      files.push({ name: file.name, size: file.size });
    });
    renderFiles();
  }

  renderFiles();
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

  const hint = document.getElementById('parse-hint');
  const note = document.getElementById('parse-note');
  hint.addEventListener('click', () => {
    const open = note.hidden;
    note.hidden = !open;
    hint.setAttribute('aria-expanded', open ? 'true' : 'false');
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
    catch (error) { /* 隐私模式无法保存时，本次仍先关掉提示。 */ }
    banner.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
