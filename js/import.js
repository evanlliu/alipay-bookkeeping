/* global window, XLSX, CashbookI18N */
(function () {
  const REQUIRED_HEADERS = ['记录时间', '分类', '收支类型', '金额', '备注', '账户', '来源', '标签'];

  function normalizeHeader(value) {
    return String(value ?? '').replace(/^\uFEFF/, '').trim();
  }

  function toMoney(value) {
    const text = String(value ?? '')
      .trim()
      .replace(/[￥¥\s]/g, '')
      .replace(/，/g, '')
      .replace(/,/g, '');
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function normalizeTime(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const yyyy = value.getFullYear();
      const mm = pad2(value.getMonth() + 1);
      const dd = pad2(value.getDate());
      const hh = pad2(value.getHours());
      const mi = pad2(value.getMinutes());
      const ss = pad2(value.getSeconds());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    }

    let text = String(value ?? '').trim();
    if (!text) return '';

    // Excel serial date number
    if (/^\d+(\.\d+)?$/.test(text) && Number(text) > 25000) {
      const serial = Number(text);
      const utcDays = Math.floor(serial - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      const fractionalDay = serial - Math.floor(serial) + 0.0000001;
      let totalSeconds = Math.floor(86400 * fractionalDay);
      const seconds = totalSeconds % 60;
      totalSeconds -= seconds;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor(totalSeconds / 60) % 60;
      dateInfo.setHours(hours, minutes, seconds);
      const yyyy = dateInfo.getFullYear();
      const mm = pad2(dateInfo.getMonth() + 1);
      const dd = pad2(dateInfo.getDate());
      const hh = pad2(dateInfo.getHours());
      const mi = pad2(dateInfo.getMinutes());
      const ss = pad2(dateInfo.getSeconds());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    }

    text = text.replace(/\//g, '-');
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) text += ' 00:00:00';

    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!match) return text;

    const [, y, m, d, h = '0', min = '0', s = '0'] = match;
    return `${y}-${pad2(m)}-${pad2(d)} ${pad2(h)}:${pad2(min)}:${pad2(s)}`;
  }

  function simpleHash(input) {
    const text = String(input);
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(36);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (insideQuotes && next === '"') {
          field += '"';
          i += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
        continue;
      }

      if (char === ',' && !insideQuotes) {
        row.push(field);
        field = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !insideQuotes) {
        if (char === '\r' && next === '\n') i += 1;
        row.push(field);
        if (row.some((v) => String(v).trim() !== '')) rows.push(row);
        row = [];
        field = '';
        continue;
      }

      field += char;
    }

    row.push(field);
    if (row.some((v) => String(v).trim() !== '')) rows.push(row);
    return rows;
  }

  function decodeText(buffer) {
    const candidates = ['gb18030', 'gbk', 'utf-8'];
    for (const label of candidates) {
      try {
        const decoded = new TextDecoder(label).decode(buffer);
        if (decoded.includes('记录时间') || decoded.includes('特别提示')) {
          return decoded;
        }
      } catch (e) {
        // Some browsers may not support all legacy encodings.
      }
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }

  function findHeaderIndex(rows) {
    return rows.findIndex((row) => {
      const normalized = row.map(normalizeHeader);
      return REQUIRED_HEADERS.every((h) => normalized.includes(h));
    });
  }

  function rowsToRecords(rows) {
    const headerIndex = findHeaderIndex(rows);
    if (headerIndex < 0) {
      const err = new Error('NO_TEMPLATE_HEADER');
      err.code = 'NO_TEMPLATE_HEADER';
      throw err;
    }

    const headers = rows[headerIndex].map(normalizeHeader);
    const records = [];

    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i];
      const obj = {};
      headers.forEach((h, index) => {
        if (!h) return;
        obj[h] = String(row[index] ?? '').trim();
      });

      const time = normalizeTime(obj['记录时间']);
      const amount = toMoney(obj['金额']);
      if (!time || !obj['收支类型'] || !obj['分类']) continue;
      if (!Number.isFinite(amount)) continue;

      const date = time.slice(0, 10);
      const month = time.slice(0, 7);
      const year = time.slice(0, 4);
      const rawCategory = obj['分类'] || '';
      const rawType = obj['收支类型'] || '';
      const rawNote = obj['备注'] || '';
      const rawAccount = obj['账户'] || '';
      const rawSource = obj['来源'] || '';
      const rawTag = obj['标签'] || '';

      const signature = [
        time,
        rawCategory,
        rawType,
        amount.toFixed(2),
        rawNote,
        rawAccount,
        rawSource,
        rawTag
      ].join('|');

      records.push({
        id: simpleHash(signature),
        time,
        date,
        month,
        year,
        category: CashbookI18N.makeLangValue('category', rawCategory),
        type: CashbookI18N.makeLangValue('type', rawType),
        amount,
        note: CashbookI18N.makeLangValue('note', rawNote),
        account: CashbookI18N.makeLangValue('account', rawAccount),
        source: CashbookI18N.makeLangValue('source', rawSource),
        tag: rawTag,
        raw: {
          time,
          category: rawCategory,
          type: rawType,
          amount: obj['金额'],
          note: rawNote,
          account: rawAccount,
          source: rawSource,
          tag: rawTag
        }
      });
    }

    return records.sort((a, b) => b.time.localeCompare(a.time));
  }

  async function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  async function importCashbookFile(file) {
    const name = file.name.toLowerCase();
    const buffer = await readFileAsArrayBuffer(file);
    let rows;

    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      if (typeof XLSX === 'undefined') {
        throw new Error('XLSX_LIBRARY_NOT_LOADED');
      }
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    } else {
      const text = decodeText(buffer);
      rows = parseCsv(text);
    }

    return rowsToRecords(rows);
  }

  window.CashbookImport = {
    importCashbookFile,
    rowsToRecords,
    parseCsv,
    REQUIRED_HEADERS
  };
})();
