(function () {
  const project = window.FENBAO_PROJECT;
  const vendors = window.FENBAO_VENDORS || [];
  const alternates = window.FENBAO_ALT || [];
  const views = ['home', 'import', 'review', 'export'];
  const titles = {
    home: '项目首页',
    import: '资料导入',
    review: '名单核对',
    export: '表格导出'
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function planTag(plan) {
    return plan
      ? '<span class="tag ok">已收计划</span>'
      : '<span class="tag miss">未收到投入计划</span>';
  }

  function matchTag(match) {
    return '<span class="tag ' + (match === '一致' ? 'ok' : 'warn') + '">' + esc(match) + '</span>';
  }

  function teamCell(vendor) {
    return vendor.teamLead ? esc(vendor.teamLead) : '<span class="tag warn">未列明</span>';
  }

  function pmCell(vendor) {
    return vendor.pm ? esc(vendor.pm) : '<span class="muted">—</span>';
  }

  function laborCell(vendor) {
    return vendor.labor ? esc(vendor.labor) : '<span class="muted">留空</span>';
  }

  document.getElementById('project-sub').textContent = project.title;

  document.getElementById('overview-grid').innerHTML = [
    ['单位', project.unit],
    ['名录编号', project.frameNo],
    ['会审日期', project.reviewDate],
    ['工期', project.period],
    ['标包', project.packages],
    ['联系人', project.contact]
  ].map(function (field) {
    return '<div><dt>' + esc(field[0]) + '</dt><dd>' + esc(field[1]) + '</dd></div>';
  }).join('');

  document.getElementById('scope-text').textContent = project.scope;

  const attention = vendors.filter(function (vendor) { return vendor.match !== '一致'; });
  document.getElementById('stat-list').innerHTML = [
    ['选用库', vendors.length],
    ['核对一致', vendors.length - attention.length],
    ['需留意', attention.length],
    ['备选库', alternates.length]
  ].map(function (field) {
    return '<div><dt>' + esc(field[0]) + '</dt><dd>' + esc(field[1]) + '</dd></div>';
  }).join('');

  document.getElementById('attention-line').textContent = attention.length
    ? attention.map(function (vendor) { return vendor.name + '：' + vendor.match; }).join('；')
    : '选用库当前没有需要单独留意的核对差异。';

  document.getElementById('privacy-text').textContent =
    project.privacyNote + '在「资料导入」里选择的 PDF 或 Word 只记录文件名，不会上传。';

  const tbody = document.getElementById('vendor-body');
  const cards = document.getElementById('vendor-cards');
  if (!vendors.length) {
    tbody.innerHTML = '<tr><td colspan="6">当前没有可展示的会审名单。</td></tr>';
    cards.innerHTML = '<p class="empty">当前没有可展示的会审名单。</p>';
  } else {
    tbody.innerHTML = vendors.map(function (vendor) {
      return '<tr>' +
        '<td>' + esc(vendor.no) + '</td>' +
        '<td><strong>' + esc(vendor.name) + '</strong><div class="note">' + esc(vendor.source) + '</div></td>' +
        '<td>' + teamCell(vendor) + '</td>' +
        '<td>' + pmCell(vendor) + '</td>' +
        '<td>' + laborCell(vendor) + '</td>' +
        '<td>' + planTag(vendor.plan) + '<div class="tag-gap">' + matchTag(vendor.match) + '</div>' +
          (vendor.note ? '<div class="note">' + esc(vendor.note) + '</div>' : '') +
        '</td></tr>';
    }).join('');

    cards.innerHTML = vendors.map(function (vendor) {
      return '<article class="vendor-card">' +
        '<header class="vendor-card-head"><span class="num">' + esc(vendor.no) + '</span><h3>' + esc(vendor.name) + '</h3></header>' +
        '<dl>' +
          '<div><dt>队伍负责人</dt><dd>' + teamCell(vendor) + '</dd></div>' +
          '<div><dt>专业项目经理</dt><dd>' + pmCell(vendor) + '</dd></div>' +
          '<div><dt>劳务现场负责人</dt><dd>' + laborCell(vendor) + '</dd></div>' +
        '</dl>' +
        '<div class="tag-row">' + planTag(vendor.plan) + matchTag(vendor.match) + '</div>' +
        '<p class="note">来源：' + esc(vendor.source) + '</p>' +
        (vendor.note ? '<p class="note">' + esc(vendor.note) + '</p>' : '') +
      '</article>';
    }).join('');
  }

  const altBox = document.getElementById('alt-box');
  altBox.innerHTML = alternates.length
    ? alternates.map(function (item) {
        return '<article class="alt-card"><h3>' + esc(item.name) + '</h3><p><span class="tag warn">' + esc(item.status) + '</span></p><p class="note">' + esc(item.note) + '</p></article>';
      }).join('')
    : '<p class="empty">当前没有备选库记录。</p>';

  function currentView() {
    const name = (location.hash || '#home').replace(/^#/, '');
    return views.indexOf(name) === -1 ? 'home' : name;
  }

  let routedOnce = false;
  function renderRoute() {
    const name = currentView();
    document.querySelectorAll('[data-view]').forEach(function (section) {
      section.hidden = section.dataset.view !== name;
    });
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      const active = link.dataset.nav === name;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = titles[name] + ' · 分包比选工作台';
    if (routedOnce) {
      const main = document.getElementById('main');
      if (main) main.scrollTo(0, 0);
      window.scrollTo(0, 0);
      const heading = document.getElementById(name + '-title');
      if (heading) heading.focus({ preventScroll: true });
    }
    routedOnce = true;
  }

  window.addEventListener('hashchange', renderRoute);
  renderRoute();

  const drop = document.getElementById('drop');
  const input = document.getElementById('file-input');
  const list = document.getElementById('file-list');
  const empty = document.getElementById('file-empty');
  const status = document.getElementById('file-status');
  const selected = [];

  function formatSize(size) {
    if (size < 1024) return size + ' B';
    return Math.round(size / 1024) + ' KB';
  }

  function renderFiles() {
    if (!selected.length) {
      list.hidden = true;
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = selected.map(function (file, index) {
      return '<li><span class="file-name">' + esc(file.name) +
        ' <span class="muted">(' + formatSize(file.size) + ') · 仅文件名，未读取内容</span></span>' +
        '<button type="button" class="btn secondary" data-remove="' + index + '" aria-label="移除 ' + esc(file.name) + '">移除</button></li>';
    }).join('');
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    incoming.forEach(function (file) { selected.push(file); });
    renderFiles();
    status.textContent = '已列入文件名：' + incoming.map(function (file) { return file.name; }).join('、') + '。没有读取内容，也没有上传。';
  }

  drop.addEventListener('click', function () { input.click(); });
  document.getElementById('pick-files').addEventListener('click', function () { input.click(); });
  drop.addEventListener('dragover', function (event) {
    event.preventDefault();
    drop.classList.add('is-drag');
  });
  drop.addEventListener('dragleave', function () { drop.classList.remove('is-drag'); });
  drop.addEventListener('drop', function (event) {
    event.preventDefault();
    drop.classList.remove('is-drag');
    addFiles(event.dataTransfer.files);
  });
  input.addEventListener('change', function () {
    addFiles(input.files);
    input.value = '';
  });
  list.addEventListener('click', function (event) {
    const button = event.target.closest('button[data-remove]');
    if (!button) return;
    const removed = selected.splice(Number(button.dataset.remove), 1)[0];
    renderFiles();
    if (removed) status.textContent = '已从清单移除 ' + removed.name + '。设备上的原文件没有删除。';
  });
  renderFiles();

  window.addEventListener('dragover', function (event) { event.preventDefault(); });
  window.addEventListener('drop', function (event) {
    if (!drop.contains(event.target)) event.preventDefault();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }

  const banner = document.getElementById('install-banner');
  const action = document.getElementById('install-action');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  let dismissed = false;
  try { dismissed = localStorage.getItem('fenbao-install-dismissed') === '1'; } catch (error) { dismissed = false; }

  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  document.getElementById('install-copy').textContent = iOS
    ? '可用 Safari 的「分享」→「添加到主屏幕」。不添加也不影响使用。'
    : '可在浏览器菜单中选择「安装应用」或「添加到主屏幕」。不添加也不影响使用。';

  function hideBanner() {
    banner.hidden = true;
    try { localStorage.setItem('fenbao-install-dismissed', '1'); } catch (error) {}
  }

  if (!standalone && !dismissed) banner.hidden = false;
  document.getElementById('install-dismiss').addEventListener('click', hideBanner);

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    if (!banner.hidden) action.hidden = false;
  });
  action.addEventListener('click', async function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (error) {}
    deferredPrompt = null;
    action.hidden = true;
  });
})();
