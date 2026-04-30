/* global $, window, document, CashbookI18N, CashbookStorage, CashbookImport */
(function () {
  const state = {
    lang: 'zh',
    records: [],
    viewMode: 'month',
    selectedMonth: '',
    selectedYear: '',
    category: 'ALL',
    type: 'ALL',
    tag: 'ALL',
    search: ''
  };

  const typeZh = {
    expense: '支出',
    income: '收入',
    neutral: '不计收支'
  };

  function t(key) {
    return CashbookI18N.t(key, state.lang);
  }

  function localValue(record, field) {
    const value = record[field];
    if (value && typeof value === 'object') {
      return value[state.lang] || value.zh || '-';
    }
    return value || '-';
  }

  function rawValue(record, field) {
    return (record.raw && record.raw[field]) || '';
  }

  function formatMoney(value, signedType) {
    const locale = state.lang === 'tr' ? 'tr-TR' : state.lang === 'en' ? 'en-US' : 'zh-CN';
    const abs = Math.abs(Number(value) || 0);
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(abs);
    let prefix = '¥';
    if (signedType === '支出') prefix = '-¥';
    if (signedType === '收入') prefix = '+¥';
    return `${prefix}${formatted}`;
  }

  function countText(n) {
    return `${n} ${t('countSuffix')}`;
  }

  function sum(records, predicate) {
    return records.reduce((total, record) => predicate(record) ? total + record.amount : total, 0);
  }

  function uniqueSorted(records, getter) {
    return Array.from(new Set(records.map(getter).filter((v) => v !== undefined && v !== null)))
      .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hans-CN'));
  }

  function getAvailableMonths() {
    return uniqueSorted(state.records, (r) => r.month).sort().reverse();
  }

  function getAvailableYears() {
    return uniqueSorted(state.records, (r) => r.year).sort().reverse();
  }

  function currentScopeRecords() {
    let records = state.records.slice();

    if (state.viewMode === 'month' && state.selectedMonth) {
      records = records.filter((r) => r.month === state.selectedMonth);
    }

    if (state.viewMode === 'year' && state.selectedYear) {
      records = records.filter((r) => r.year === state.selectedYear);
    }

    if (state.category !== 'ALL') {
      records = records.filter((r) => rawValue(r, 'category') === state.category);
    }

    if (state.type !== 'ALL') {
      records = records.filter((r) => rawValue(r, 'type') === state.type);
    }

    if (state.tag !== 'ALL') {
      records = records.filter((r) => (r.tag || '') === state.tag);
    }

    const q = state.search.trim().toLowerCase();
    if (q) {
      records = records.filter((r) => {
        const haystack = [
          r.time,
          localValue(r, 'category'),
          localValue(r, 'type'),
          localValue(r, 'note'),
          localValue(r, 'account'),
          localValue(r, 'source'),
          r.tag,
          JSON.stringify(r.raw || {})
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    return records;
  }

  function expenseRecords(records) {
    return records.filter((r) => rawValue(r, 'type') === typeZh.expense);
  }

  function groupSum(records, keyFn) {
    const map = new Map();
    records.forEach((record) => {
      const key = keyFn(record) || '-';
      map.set(key, (map.get(key) || 0) + record.amount);
    });
    return Array.from(map.entries())
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  function updateTexts() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : state.lang === 'tr' ? 'tr-TR' : 'en';
    $('[data-i18n]').each(function () {
      const key = $(this).data('i18n');
      $(this).text(t(key));
    });
    $('#searchInput').attr('placeholder', t('searchPlaceholder'));
    $('#viewMode option[value="month"]').text(t('byMonth'));
    $('#viewMode option[value="year"]').text(t('byYear'));
    $('#viewMode option[value="all"]').text(t('allData'));
  }

  function rebuildFilterOptions() {
    const months = getAvailableMonths();
    const years = getAvailableYears();

    if (!state.selectedMonth && months.length) state.selectedMonth = months[0];
    if (!state.selectedYear && years.length) state.selectedYear = years[0];

    $('#monthSelect').empty();
    months.forEach((month) => $('#monthSelect').append(`<option value="${escapeAttr(month)}">${escapeHtml(month)}</option>`));
    $('#monthSelect').val(state.selectedMonth);

    $('#yearSelect').empty();
    years.forEach((year) => $('#yearSelect').append(`<option value="${escapeAttr(year)}">${escapeHtml(year)}</option>`));
    $('#yearSelect').val(state.selectedYear);

    const categories = uniqueSorted(state.records, (r) => rawValue(r, 'category'));
    $('#categoryFilter').empty().append(`<option value="ALL">${escapeHtml(t('allCategories'))}</option>`);
    categories.forEach((category) => {
      const label = CashbookI18N.translateValue('category', category, state.lang);
      $('#categoryFilter').append(`<option value="${escapeAttr(category)}">${escapeHtml(label)}</option>`);
    });
    $('#categoryFilter').val(state.category);

    const types = uniqueSorted(state.records, (r) => rawValue(r, 'type'));
    $('#typeFilter').empty().append(`<option value="ALL">${escapeHtml(t('allTypes'))}</option>`);
    types.forEach((type) => {
      const label = CashbookI18N.translateValue('type', type, state.lang);
      $('#typeFilter').append(`<option value="${escapeAttr(type)}">${escapeHtml(label)}</option>`);
    });
    $('#typeFilter').val(state.type);

    const tags = uniqueSorted(state.records, (r) => r.tag || '');
    $('#tagFilter').empty().append(`<option value="ALL">${escapeHtml(t('allTags'))}</option>`);
    tags.forEach((tag) => {
      const label = tag || '-';
      $('#tagFilter').append(`<option value="${escapeAttr(tag)}">${escapeHtml(label)}</option>`);
    });
    $('#tagFilter').val(state.tag);

    $('#monthWrap').toggle(state.viewMode === 'month');
    $('#yearWrap').toggle(state.viewMode === 'year');
  }

  function renderSummary(records) {
    const expenses = records.filter((r) => rawValue(r, 'type') === typeZh.expense);
    const incomes = records.filter((r) => rawValue(r, 'type') === typeZh.income);
    const neutrals = records.filter((r) => rawValue(r, 'type') === typeZh.neutral);

    const expenseAmount = sum(records, (r) => rawValue(r, 'type') === typeZh.expense);
    const incomeAmount = sum(records, (r) => rawValue(r, 'type') === typeZh.income);
    const excludedAmount = sum(records, (r) => rawValue(r, 'type') === typeZh.neutral);
    const net = incomeAmount - expenseAmount;

    $('#totalExpense').text(formatMoney(expenseAmount));
    $('#totalIncome').text(formatMoney(incomeAmount));
    $('#totalExcluded').text(formatMoney(excludedAmount));
    $('#netCashflow').text(formatMoney(net));
    $('#expenseCount').text(countText(expenses.length));
    $('#incomeCount').text(countText(incomes.length));
    $('#excludedCount').text(countText(neutrals.length));
    $('#recordCount').text(countText(records.length));
  }

  function renderTrend(records) {
    const expenses = expenseRecords(records);
    let items = [];

    if (state.viewMode === 'month' && state.selectedMonth) {
      const [year, month] = state.selectedMonth.split('-').map(Number);
      const days = new Date(year, month, 0).getDate();
      const map = new Map();
      expenses.forEach((r) => map.set(r.date, (map.get(r.date) || 0) + r.amount));
      for (let day = 1; day <= days; day += 1) {
        const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        items.push({ label: String(day), amount: map.get(key) || 0 });
      }
      $('#scopeText').text(state.selectedMonth || '');
    } else if (state.viewMode === 'year' && state.selectedYear) {
      const map = new Map();
      expenses.forEach((r) => map.set(r.month, (map.get(r.month) || 0) + r.amount));
      for (let month = 1; month <= 12; month += 1) {
        const key = `${state.selectedYear}-${String(month).padStart(2, '0')}`;
        items.push({ label: String(month), amount: map.get(key) || 0 });
      }
      $('#scopeText').text(state.selectedYear || '');
    } else {
      const grouped = groupSum(expenses, (r) => r.month).sort((a, b) => a.key.localeCompare(b.key));
      items = grouped.map((x) => ({ label: x.key.slice(2), amount: x.amount }));
      $('#scopeText').text(t('scopeAll'));
    }

    renderBarChart('#trendChart', items);
  }

  function renderBarChart(selector, items) {
    const $el = $(selector).empty();
    if (!items.length) {
      $el.append(`<div class="empty-mini">${escapeHtml(t('noRows'))}</div>`);
      return;
    }
    const max = Math.max(...items.map((x) => x.amount), 1);
    items.forEach((item) => {
      const percent = Math.max(2, (item.amount / max) * 100);
      $el.append(`
        <div class="bar-item" title="${escapeAttr(item.label + ' ' + formatMoney(item.amount))}">
          <div class="bar-value">${item.amount ? escapeHtml(shortMoney(item.amount)) : ''}</div>
          <div class="bar-track"><div class="bar-fill" style="height:${percent}%"></div></div>
          <div class="bar-label">${escapeHtml(item.label)}</div>
        </div>
      `);
    });
  }

  function renderRankList(selector, items, total, valueLabelFn) {
    const $el = $(selector).empty();
    if (!items.length || total <= 0) {
      $el.append(`<div class="empty-mini">${escapeHtml(t('noRows'))}</div>`);
      return;
    }
    items.slice(0, 10).forEach((item) => {
      const percent = total ? (item.amount / total) * 100 : 0;
      const label = valueLabelFn ? valueLabelFn(item.key) : item.key;
      $el.append(`
        <div class="rank-row">
          <div class="rank-name">
            <b title="${escapeAttr(label)}">${escapeHtml(label)}</b>
            <small>${percent.toFixed(1)}%</small>
          </div>
          <div class="rank-amount">${escapeHtml(formatMoney(item.amount))}</div>
          <div class="progress"><span style="width:${Math.max(2, percent)}%"></span></div>
        </div>
      `);
    });
  }

  function renderBreakdowns(records) {
    const expenses = expenseRecords(records);
    const total = sum(expenses, () => true);
    const byCategory = groupSum(expenses, (r) => rawValue(r, 'category'));
    const byTag = groupSum(expenses, (r) => r.tag || '-');
    $('#categoryTotal').text(formatMoney(total));
    renderRankList('#categoryChart', byCategory, total, (key) => CashbookI18N.translateValue('category', key, state.lang));
    renderRankList('#tagChart', byTag, total, (key) => key || '-');
  }

  function renderTopExpenses(records) {
    const expenses = expenseRecords(records).sort((a, b) => b.amount - a.amount).slice(0, 10);
    const $el = $('#topExpensesList').empty();
    if (!expenses.length) {
      $el.append(`<div class="empty-mini">${escapeHtml(t('noRows'))}</div>`);
      return;
    }

    expenses.forEach((record, index) => {
      $el.append(`
        <div class="top-item">
          <div class="top-no">${index + 1}</div>
          <div class="top-note">
            <b title="${escapeAttr(localValue(record, 'note'))}">${escapeHtml(localValue(record, 'note'))}</b>
            <small>${escapeHtml(record.date)} · ${escapeHtml(localValue(record, 'category'))} · ${escapeHtml(record.tag || '-')}</small>
          </div>
          <div class="top-amount">${escapeHtml(formatMoney(record.amount, typeZh.expense))}</div>
        </div>
      `);
    });
  }

  function renderRecords(records) {
    const $tbody = $('#recordsTableBody').empty();
    const $mobile = $('#mobileRecords').empty();
    $('#recordSummary').text(countText(records.length));

    records.forEach((record) => {
      const rawType = rawValue(record, 'type');
      const amountClass = rawType === typeZh.expense ? 'amount-expense' : rawType === typeZh.income ? 'amount-income' : 'amount-neutral';

      $tbody.append(`
        <tr>
          <td>${escapeHtml(record.time)}</td>
          <td><span class="pill">${escapeHtml(localValue(record, 'category'))}</span></td>
          <td>${escapeHtml(localValue(record, 'type'))}</td>
          <td class="${amountClass}">${escapeHtml(formatMoney(record.amount, rawType))}</td>
          <td>${escapeHtml(localValue(record, 'note'))}</td>
          <td>${escapeHtml(localValue(record, 'account'))}</td>
          <td>${escapeHtml(localValue(record, 'source'))}</td>
          <td>${escapeHtml(record.tag || '-')}</td>
        </tr>
      `);

      $mobile.append(`
        <article class="mobile-card">
          <div class="mobile-card-head">
            <div>
              <h4>${escapeHtml(localValue(record, 'note'))}</h4>
              <div class="mobile-meta">
                <span class="pill">${escapeHtml(record.time)}</span>
                <span class="pill">${escapeHtml(localValue(record, 'category'))}</span>
                <span class="pill">${escapeHtml(localValue(record, 'type'))}</span>
              </div>
            </div>
            <strong class="${amountClass}">${escapeHtml(formatMoney(record.amount, rawType))}</strong>
          </div>
          <div class="mobile-meta">
            <span>${escapeHtml(localValue(record, 'account'))}</span>
            <span>·</span>
            <span>${escapeHtml(localValue(record, 'source'))}</span>
            <span>·</span>
            <span>${escapeHtml(record.tag || '-')}</span>
          </div>
        </article>
      `);
    });

    const showEmpty = !state.records.length || !records.length;
    $('#emptyState').toggle(showEmpty);

    // Do not use jQuery .toggle() on both desktop and mobile containers here.
    // .toggle() writes inline display:block/display:none, which overrides the
    // CSS media queries and makes the mobile cards appear on PC.
    // Instead, JS only marks the empty state; CSS decides desktop vs mobile UI.
    $('.desktop-table-wrap, #mobileRecords').toggleClass('hidden-when-empty', showEmpty);
  }

  function renderAll() {
    updateTexts();
    rebuildFilterOptions();
    const records = currentScopeRecords();
    renderSummary(records);
    renderBreakdowns(records);
    renderTopExpenses(records);
    renderRecords(records);
    saveSettings();
  }

  function shortMoney(value) {
    const n = Number(value) || 0;
    if (n >= 10000) return `¥${(n / 10000).toFixed(1)}w`;
    if (n >= 1000) return `¥${(n / 1000).toFixed(1)}k`;
    return `¥${Math.round(n)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function mergeRecords(existing, incoming) {
    const map = new Map();
    existing.concat(incoming).forEach((record) => map.set(record.id, record));
    return Array.from(map.values()).sort((a, b) => b.time.localeCompare(a.time));
  }

  async function handleImport(file) {
    if (!file) return;
    setImportMessage('', '');
    try {
      const imported = await CashbookImport.importCashbookFile(file);
      state.records = $('#replaceExisting').is(':checked')
        ? imported
        : mergeRecords(state.records, imported);

      CashbookStorage.saveRecords(state.records);
      state.selectedMonth = '';
      state.selectedYear = '';
      state.category = 'ALL';
      state.type = 'ALL';
      state.tag = 'ALL';
      state.search = '';
      $('#searchInput').val('');
      renderAll();
      setImportMessage(`${t('imported')} ${imported.length} ${t('importedRows')}`, 'success');
    } catch (err) {
      console.error(err);
      const message = err.code === 'NO_TEMPLATE_HEADER' ? t('noTemplate') : t('parseError');
      setImportMessage(`${t('importFailed')}：${message}`, 'error');
    }
  }

  function setImportMessage(text, type) {
    $('#importMessage').removeClass('success error').addClass(type || '').text(text || '');
  }

  function exportBackup() {
    if (!state.records.length) {
      setImportMessage(t('noDataToBackup'), 'error');
      return;
    }
    const payload = {
      app: 'alipay-cashbook-dashboard',
      version: 1,
      exportedAt: new Date().toISOString(),
      records: state.records
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `cashbook-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setImportMessage(t('backupDone'), 'success');
  }

  async function restoreBackup(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload.records || !Array.isArray(payload.records)) throw new Error('Invalid backup');
      state.records = payload.records;
      CashbookStorage.saveRecords(state.records);
      state.selectedMonth = '';
      state.selectedYear = '';
      renderAll();
      setImportMessage(t('restoreDone'), 'success');
    } catch (e) {
      setImportMessage(t('parseError'), 'error');
    }
  }

  function loadSettings() {
    const settings = CashbookStorage.loadSettings();
    state.lang = settings.lang || 'zh';
    state.viewMode = settings.viewMode || 'month';
    state.selectedMonth = settings.selectedMonth || '';
    state.selectedYear = settings.selectedYear || '';
    state.category = settings.category || 'ALL';
    state.type = settings.type || 'ALL';
    state.tag = settings.tag || 'ALL';
    state.search = settings.search || '';
  }

  function saveSettings() {
    CashbookStorage.saveSettings({
      lang: state.lang,
      viewMode: state.viewMode,
      selectedMonth: state.selectedMonth,
      selectedYear: state.selectedYear,
      category: state.category,
      type: state.type,
      tag: state.tag,
      search: state.search
    });
  }

  function bindEvents() {
    $('#importBtn').on('click', () => $('#fileInput').trigger('click'));
    $('#fileInput').on('change', (e) => handleImport(e.target.files[0]));

    $('#langSelect').on('change', function () {
      state.lang = this.value;
      renderAll();
    });

    $('#viewMode').on('change', function () {
      state.viewMode = this.value;
      renderAll();
    });

    $('#monthSelect').on('change', function () {
      state.selectedMonth = this.value;
      renderAll();
    });

    $('#yearSelect').on('change', function () {
      state.selectedYear = this.value;
      renderAll();
    });

    $('#categoryFilter').on('change', function () {
      state.category = this.value;
      renderAll();
    });

    $('#typeFilter').on('change', function () {
      state.type = this.value;
      renderAll();
    });

    $('#tagFilter').on('change', function () {
      state.tag = this.value;
      renderAll();
    });

    $('#searchInput').on('input', function () {
      state.search = this.value;
      renderAll();
    });

    const dropZone = $('#dropZone');
    dropZone.on('dragover', (e) => {
      e.preventDefault();
      dropZone.addClass('dragover');
    });
    dropZone.on('dragleave drop', (e) => {
      e.preventDefault();
      dropZone.removeClass('dragover');
    });
    dropZone.on('drop', (e) => {
      const files = e.originalEvent.dataTransfer.files;
      if (files && files.length) handleImport(files[0]);
    });
  }

  function init() {
    loadSettings();
    state.records = CashbookStorage.loadRecords();
    $('#langSelect').val(state.lang);
    $('#viewMode').val(state.viewMode);
    $('#searchInput').val(state.search);
    bindEvents();
    renderAll();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  }

  $(init);
})();
