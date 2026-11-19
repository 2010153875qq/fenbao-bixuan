(function () {
  const p = window.FENBAO_PROJECT;
  const vendors = window.FENBAO_VENDORS;
  const alt = window.FENBAO_ALT;

  document.getElementById('project-title').textContent = p.title;
  document.getElementById('project-meta').innerHTML = [
    `<div>单位：${p.unit}</div>`,
    `<div>名录编号：${p.frameNo}</div>`,
    `<div>会审日期：${p.reviewDate} · 工期：${p.period}</div>`,
    `<div>标包：${p.packages}</div>`
  ].join('');

  const tbody = document.getElementById('vendor-body');
  tbody.innerHTML = vendors.map((v) => {
    const matchClass = v.match === '一致' ? 'ok' : 'warn';
    const planTag = v.plan
      ? '<span class="tag ok">已收计划</span>'
      : '<span class="tag miss">未收到投入计划</span>';
    return `<tr>
      <td>${v.no}</td>
      <td><strong>${v.name}</strong><div class="note">${v.source}</div></td>
      <td>${v.teamLead || '<span class="tag warn">未列明</span>'}</td>
      <td>${v.pm || '—'}</td>
      <td>${v.labor || '—'}</td>
      <td>${planTag}<div style="margin-top:6px"><span class="tag ${matchClass}">${v.match}</span></div>${v.note ? `<div class="note">${v.note}</div>` : ''}</td>
    </tr>`;
  }).join('');

  document.getElementById('alt-box').innerHTML = alt.map((a) =>
    `<div><strong>${a.name}</strong> · <span class="tag warn">${a.status}</span><div class="note">${a.note}</div></div>`
  ).join('');

  // Upload drop zone: client-side list only
  const drop = document.getElementById('drop');
  const input = document.getElementById('file-input');
  const list = document.getElementById('file-list');
  const files = [];

  function renderFiles() {
    if (!files.length) {
      list.innerHTML = '<li class="muted">还没有本地文件。扫描件请发小政自动识别。</li>';
      return;
    }
    list.innerHTML = files.map((f, i) =>
      `<li><span>${f.name} <span class="muted">(${Math.round(f.size/1024)} KB)</span></span><button class="btn secondary" data-i="${i}" style="padding:6px 10px">移除</button></li>`
    ).join('');
    list.querySelectorAll('button[data-i]').forEach((btn) => {
      btn.onclick = () => { files.splice(+btn.dataset.i, 1); renderFiles(); };
    });
  }
  renderFiles();

  function addFiles(fileList) {
    Array.from(fileList || []).forEach((f) => files.push(f));
    renderFiles();
  }
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); addFiles(e.dataTransfer.files); });
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => addFiles(input.files));

  document.getElementById('parse-hint').onclick = () => {
    alert('文本型 PDF 可在下一版做浏览器内解析。扫描件请把文件直接发给小政，会按本会审表自动填队伍负责人与专业项目经理。本页仅保存你本机选择的文件名清单，不会上传。');
  };

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const tip = document.getElementById('install-tip');
  if (!standalone) {
    tip.hidden = false;
    tip.querySelector('.ios').hidden = !isIOS;
    tip.querySelector('.android').hidden = isIOS;
  }
})();
