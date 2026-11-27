(function (root) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  function textOf(node) {
    return Array.from(node.getElementsByTagNameNS(W, 't')).map((item) => item.textContent || '').join('');
  }

  function setRunText(node, value) {
    node.textContent = value || '';
    if (value && /[\s\u00a0]/.test(value)) {
      node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    }
  }

  function setCellText(cell, value) {
    if (cell.getElementsByTagNameNS(W, 'sym').length) return;
    let nodes = Array.from(cell.getElementsByTagNameNS(W, 't'));
    if (!nodes.length && value) {
      const donor = Array.from(cell.parentNode.getElementsByTagNameNS(W, 'r')).find((run) => run.getElementsByTagNameNS(W, 't').length);
      const paragraph = cell.getElementsByTagNameNS(W, 'p')[0];
      if (!donor || !paragraph) return;
      const run = donor.cloneNode(true);
      const texts = Array.from(run.getElementsByTagNameNS(W, 't'));
      setRunText(texts[0], value);
      texts.slice(1).forEach((item) => { item.textContent = ''; });
      paragraph.appendChild(run);
      return;
    }
    if (!nodes.length) return;
    setRunText(nodes[0], value || '');
    nodes.slice(1).forEach((item) => { item.textContent = ''; });
  }

  function fillHeader(doc, project) {
    const paragraphs = Array.from(doc.getElementsByTagNameNS(W, 'p'));
    const title = paragraphs[0];
    const titleRuns = Array.from(title.getElementsByTagNameNS(W, 't'));
    if (titleRuns.length >= 4) {
      setRunText(titleRuns[0], project.issuer || '湖南省送变电工程有限公司');
      setRunText(titleRuns[1], project.projectCore || '');
      setRunText(titleRuns[2], '专业分包');
      setRunText(titleRuns[3], '商队伍投入计划会审意见');
    }
    const dateRuns = Array.from(paragraphs[1].getElementsByTagNameNS(W, 't'));
    const numbers = dateRuns.filter((item) => /^\d+$/.test(item.textContent || ''));
    if (numbers.length >= 3) {
      setRunText(numbers[0], project.reviewYear || '');
      setRunText(numbers[1], project.reviewMonth || '');
      setRunText(numbers[2], project.reviewDay || '');
    }
    paragraphs.forEach((paragraph) => {
      const value = textOf(paragraph);
      const runs = Array.from(paragraph.getElementsByTagNameNS(W, 't'));
      if (value.indexOf('单位和工程名称') === 0 && runs.length) {
        setRunText(runs[0], '单位和工程名称：' + (project.unitProject || ''));
      }
      if (value.indexOf('工作量及标包简介') === 0 && runs.length >= 2) {
        setRunText(runs[1], project.scope || '');
      }
      if (value.indexOf('工期计划安排') === 0 && runs.length) {
        setRunText(runs[0], '工期计划安排：' + (project.period || ''));
      }
    });
  }

  function fillVendors(doc, vendors) {
    const table = doc.getElementsByTagNameNS(W, 'tbl')[0];
    const rows = Array.from(table.getElementsByTagNameNS(W, 'tr'));
    const vetoAt = rows.findIndex((row) => textOf(row).indexOf('否决事项清单') === 0);
    const dataRows = rows.slice(1, vetoAt);
    const templateRow = dataRows[0];
    const vetoRow = rows[vetoAt];
    while (dataRows.length < vendors.length) {
      const clone = templateRow.cloneNode(true);
      Array.from(clone.getElementsByTagName('*')).forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
          if (/paraId/i.test(attribute.name)) element.removeAttribute(attribute.name);
        });
      });
      vetoRow.parentNode.insertBefore(clone, vetoRow);
      dataRows.push(clone);
    }
    while (dataRows.length > vendors.length) {
      const extra = dataRows.pop();
      extra.parentNode.removeChild(extra);
    }
    vendors.forEach((vendor, index) => {
      const cells = Array.from(dataRows[index].children).filter((element) => element.localName === 'tc');
      setCellText(cells[0], String(index + 1));
      setCellText(cells[1], vendor.name || '');
      setCellText(cells[2], vendor.teamLead || '');
      setCellText(cells[3], vendor.pm || '');
      setCellText(cells[4], vendor.labor || '');
    });
  }

  function serialize(doc) {
    const xml = new XMLSerializer().serializeToString(doc);
    if (xml.indexOf('<?xml') === 0) return xml;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
  }

  async function build(project) {
    const response = await fetch('./templates/会审意见表_模板.docx');
    if (!response.ok) throw new Error('读不到会审意见表模板');
    const source = await response.arrayBuffer();
    const zip = await window.JSZip.loadAsync(source);
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('模板无法解析');
    fillHeader(doc, project);
    fillVendors(doc, project.vendors || []);
    zip.file('word/document.xml', serialize(doc));
    return zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
  }

  root.FENBAO_DOCX = { build: build };
})(typeof globalThis !== 'undefined' ? globalThis : this);
