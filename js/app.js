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
    search: '',
    sortKey: 'time',
    sortDir: 'desc',
    workerUrl: '',
    accessPassword: ''
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

  function languageShortLabel(lang) {
    if (lang === 'en') return 'EN';
    if (lang === 'tr') return 'TR';
    return '中';
  }

  function languageFullLabel(lang) {
    if (lang === 'en') return 'English';
    if (lang === 'tr') return 'Türkçe';
    return '中文';
  }

  function setLanguagePanel(open) {
    $('#langPanel').prop('hidden', !open);
    $('#langToggle').attr('aria-expanded', open ? 'true' : 'false');
  }

  function updateLanguageSwitcher() {
    $('#langCurrent').text(languageShortLabel(state.lang));
    $('#langToggle').attr('title', languageFullLabel(state.lang));
    $('.lang-option').each(function () {
      const active = $(this).data('lang') === state.lang;
      $(this).toggleClass('active', active).attr('aria-current', active ? 'true' : 'false');
    });
  }

  function normalizeWorkerUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function normalizeAccessPassword(value) {
    return String(value || '').trim();
  }

  function getSyncConfigFromPayload(payload) {
    const sync = payload && payload.sync && typeof payload.sync === 'object' ? payload.sync : {};
    return {
      workerUrl: normalizeWorkerUrl(sync.workerUrl || sync.workerURL || sync.url || ''),
      accessPassword: normalizeAccessPassword(sync.accessPassword || sync.password || sync.apiPassword || '')
    };
  }

  function applySyncConfig(config, options = {}) {
    if (!config) return;
    const nextWorkerUrl = normalizeWorkerUrl(config.workerUrl);
    const nextPassword = normalizeAccessPassword(config.accessPassword);

    if (nextWorkerUrl) state.workerUrl = nextWorkerUrl;
    if (nextPassword || options.allowEmptyPassword) state.accessPassword = nextPassword;

    if (state.workerUrl) localStorage.setItem('alipay_cashbook_worker_url', state.workerUrl);
    if (state.accessPassword) localStorage.setItem('alipay_cashbook_access_password', state.accessPassword);
    if (options.allowEmptyPassword && !state.accessPassword) localStorage.removeItem('alipay_cashbook_access_password');

    syncSettingsForm();
  }

  function loadWorkerSettings() {
    const settings = CashbookStorage.loadSettings();
    const config = window.CASHBOOK_SYNC_CONFIG || {};
    state.workerUrl = normalizeWorkerUrl(
      config.workerUrl ||
      settings.workerUrl ||
      localStorage.getItem('alipay_cashbook_worker_url') ||
      ''
    );
    state.accessPassword = normalizeAccessPassword(
      config.accessPassword ||
      settings.accessPassword ||
      localStorage.getItem('alipay_cashbook_access_password') ||
      ''
    );
  }

  function syncSettingsForm() {
    $('#syncWorkerUrl').val(state.workerUrl || '');
    $('#syncAccessPassword').val(state.accessPassword || '');
  }

  function readSyncSettingsForm() {
    const workerUrl = normalizeWorkerUrl($('#syncWorkerUrl').val());
    const accessPassword = normalizeAccessPassword($('#syncAccessPassword').val());
    applySyncConfig({ workerUrl, accessPassword }, { allowEmptyPassword: true });
    saveSettings();
  }

  function openSyncSettingsModal() {
    syncSettingsForm();
    $('#syncSettingsModal').prop('hidden', false);
    setTimeout(() => $('#syncWorkerUrl').trigger('focus'), 0);
  }

  function closeSyncSettingsModal() {
    $('#syncSettingsModal').prop('hidden', true);
  }

  function validateWorkerConfig() {
    if (!state.workerUrl) {
      openSyncSettingsModal();
      setImportMessage(t('workerConfigRequired'), 'error');
      return false;
    }
    saveSettings();
    return true;
  }

  async function workerApi(method = 'GET', payload) {
    const url = normalizeWorkerUrl(state.workerUrl);
    if (!url) throw new Error(t('workerConfigRequired'));

    const options = {
      method,
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-store'
    };

    if (state.accessPassword) {
      options.headers['X-Access-Password'] = state.accessPassword;
    }

    if (payload !== undefined) {
      options.headers['Content-Type'] = 'application/json;charset=utf-8';
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(url, options);
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch (e) { body = { message: text }; }
    }

    if (!response.ok) {
      const err = new Error((body && (body.message || body.error)) || `Worker HTTP ${response.status}`);
      err.status = response.status;
      err.body = body;
      throw err;
    }

    return body || {};
  }

  async function commitDataJsonViaWorker(records) {
    if (!validateWorkerConfig()) return false;

    setImportMessage(t('workerUpdating'), 'success');
    const payload = buildDataJsonPayload(records);
    await workerApi('PUT', payload);
    return true;
  }

  async function fetchLocalDataJsonPayload() {
    const response = await fetch(`./data.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function fetchDataJsonPayload() {
    if (state.workerUrl) {
      return workerApi('GET');
    }
    return fetchLocalDataJsonPayload();
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

  function sortValue(record, key) {
    switch (key) {
      case 'time':
        return record.time || '';
      case 'category':
        return localValue(record, 'category');
      case 'type':
        return localValue(record, 'type');
      case 'amount':
        return Number(record.amount) || 0;
      case 'note':
        return localValue(record, 'note');
      case 'account':
        return localValue(record, 'account');
      case 'source':
        return localValue(record, 'source');
      case 'tag':
        return record.tag || '';
      default:
        return record.time || '';
    }
  }

  function sortRecords(records) {
    const dir = state.sortDir === 'asc' ? 1 : -1;
    const key = state.sortKey || 'time';
    const collator = new Intl.Collator(state.lang === 'zh' ? 'zh-Hans-CN' : state.lang === 'tr' ? 'tr-TR' : 'en-US', {
      numeric: true,
      sensitivity: 'base'
    });

    return records.slice().sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);

      if (key === 'amount') {
        const diff = av - bv;
        if (diff !== 0) return diff * dir;
        return String(b.time || '').localeCompare(String(a.time || ''));
      }

      const result = collator.compare(String(av ?? ''), String(bv ?? ''));
      if (result !== 0) return result * dir;
      return String(b.time || '').localeCompare(String(a.time || ''));
    });
  }

  function sortKeyLabel(key) {
    switch (key) {
      case 'time':
        return t('date');
      case 'category':
        return t('category');
      case 'type':
        return t('type');
      case 'amount':
        return t('amount');
      case 'note':
        return t('note');
      case 'account':
        return t('account');
      case 'source':
        return t('source');
      case 'tag':
        return t('tag');
      default:
        return t('date');
    }
  }

  function renderSortIndicators() {
    $('.sort-btn, .mobile-sort-btn').each(function () {
      const key = $(this).data('sort-key');
      const active = key === state.sortKey;
      $(this)
        .toggleClass('active', active)
        .attr('aria-sort', active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
      $(this).find('.sort-arrow').text(active ? (state.sortDir === 'asc' ? '↑' : '↓') : '↕');
    });

    const dirLabel = state.sortDir === 'asc' ? t('sortAsc') : t('sortDesc');
    $('#mobileSortStatus').text(`${sortKeyLabel(state.sortKey)} · ${dirLabel}`);
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

    return sortRecords(records);
  }

  function expenseRecords(records) {
    return records.filter((r) => rawValue(r, 'type') === typeZh.expense);
  }

  function isRefundOffset(record) {
    // 支付宝记账本里真正用于冲减支出的退款，通常是：分类=退款 + 收支类型=不计收支。
    // 不用备注关键词判断，避免把“淘宝退货-寄件费”等真实成本错误冲减。
    return rawValue(record, 'category') === '退款' && rawValue(record, 'type') === typeZh.neutral;
  }

  function refundOffsetRecords(records) {
    return records.filter(isRefundOffset);
  }

  function netExpenseAmount(records) {
    const grossExpense = sum(records, (r) => rawValue(r, 'type') === typeZh.expense);
    const refundOffset = sum(records, isRefundOffset);
    return Math.max(0, grossExpense - refundOffset);
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

  function normalizeMatchText(value) {
    return String(value || '')
      .replace(/^退款[-：:\s]*/g, '')
      .replace(/商户单号[A-Za-z0-9]+/g, '')
      .replace(/复制该单号.*$/g, '')
      .replace(/[\s，,。._\-—【】\[\]（）()：:]/g, '')
      .toLowerCase();
  }

  function timeValue(record) {
    const n = Date.parse(String(record.time || '').replace(/-/g, '/'));
    return Number.isFinite(n) ? n : 0;
  }

  function amountEqual(a, b) {
    return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
  }

  function buildRefundMatchMap(records) {
    // 将支付宝“退款 / 不计收支”尽量匹配回原消费。
    // 这样标签支出、分类支出能体现真实净花费：原支出 300，退款 300 => 该标签/分类为 0。
    const expenses = records
      .filter((r) => rawValue(r, 'type') === typeZh.expense)
      .map((r) => ({ record: r, used: false, time: timeValue(r), noteText: normalizeMatchText(rawValue(r, 'note') || localValue(r, 'note')) }))
      .sort((a, b) => b.time - a.time);

    const matches = new Map();

    refundOffsetRecords(records)
      .slice()
      .sort((a, b) => timeValue(a) - timeValue(b))
      .forEach((refund) => {
        const refundTime = timeValue(refund);
        const refundText = normalizeMatchText(rawValue(refund, 'note') || localValue(refund, 'note'));
        const refundTag = String(refund.tag || '').trim();

        let best = null;
        let bestScore = -Infinity;

        expenses.forEach((candidate) => {
          if (candidate.used) return;
          const expense = candidate.record;
          if (!amountEqual(expense.amount, refund.amount)) return;

          const expenseTime = candidate.time;
          const dayGap = Math.abs(refundTime - expenseTime) / 86400000;
          const isBeforeRefund = !refundTime || !expenseTime || expenseTime <= refundTime;
          const sameAccount = rawValue(expense, 'account') && rawValue(expense, 'account') === rawValue(refund, 'account');
          const sameSource = rawValue(expense, 'source') && rawValue(expense, 'source') === rawValue(refund, 'source');
          const sameTag = refundTag && refundTag === String(expense.tag || '').trim();
          const noteHit = refundText && candidate.noteText && (refundText.includes(candidate.noteText) || candidate.noteText.includes(refundText));

          let score = 1000;
          if (isBeforeRefund) score += 120;
          if (sameAccount) score += 80;
          if (sameSource) score += 20;
          if (sameTag) score += 100;
          if (noteHit) score += 180;
          score -= Math.min(dayGap, 365);

          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        });

        if (best) {
          best.used = true;
          matches.set(refund.id, {
            expenseId: best.record.id,
            category: rawValue(best.record, 'category') || '-',
            tag: best.record.tag || '-',
            note: rawValue(best.record, 'note') || localValue(best.record, 'note')
          });
        }
      });

    return matches;
  }

  function groupNetExpense(records, keyFn) {
    // 净支出口径：支出为正数，退款匹配回原消费标签/分类后做负数抵扣。
    const refundMatches = buildRefundMatchMap(records);
    const map = new Map();

    records.forEach((record) => {
      const rawType = rawValue(record, 'type');
      if (rawType !== typeZh.expense && !isRefundOffset(record)) return;

      let key = keyFn(record) || '-';
      let amount = record.amount;

      if (isRefundOffset(record)) {
        amount = -record.amount;
        const match = refundMatches.get(record.id);
        if (keyFn === categoryKey) {
          key = match ? match.category : t('refundOffsetCategory');
        } else if (keyFn === tagKey) {
          key = match ? match.tag : (record.tag || '-');
        }
      }

      map.set(key, (map.get(key) || 0) + amount);
    });

    return Array.from(map.entries())
      .map(([key, amount]) => ({ key, amount }))
      .filter((item) => Math.abs(item.amount) > 0.000001)
      .sort((a, b) => b.amount - a.amount);
  }

  function categoryKey(record) {
    return rawValue(record, 'category') || '-';
  }

  function tagKey(record) {
    return record.tag || '-';
  }

  function formatBreakdownMoney(value) {
    const n = Number(value) || 0;
    if (n < 0) return `-${formatMoney(Math.abs(n))}`;
    return formatMoney(n);
  }

  function normalizeTagFilterValue(value) {
    return value === '-' ? '' : String(value ?? '');
  }

  function filterLabel(kind, value) {
    if (kind === 'category') return CashbookI18N.translateValue('category', value, state.lang);
    if (kind === 'tag') return value || '-';
    return value || '-';
  }

  function activeBreakdownFilters() {
    const parts = [];
    if (state.category !== 'ALL') {
      parts.push(`${t('category')}：${filterLabel('category', state.category)}`);
    }
    if (state.tag !== 'ALL') {
      parts.push(`${t('tag')}：${filterLabel('tag', state.tag)}`);
    }
    return parts;
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
    updateLanguageSwitcher();
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
    const refunds = refundOffsetRecords(records);

    const grossExpenseAmount = sum(records, (r) => rawValue(r, 'type') === typeZh.expense);
    const refundOffsetAmount = sum(records, isRefundOffset);
    const expenseAmount = Math.max(0, grossExpenseAmount - refundOffsetAmount);
    const incomeAmount = sum(records, (r) => rawValue(r, 'type') === typeZh.income);
    const excludedAmount = sum(records, (r) => rawValue(r, 'type') === typeZh.neutral);
    const net = incomeAmount - expenseAmount;

    $('#totalExpense').text(formatMoney(expenseAmount));
    $('#totalIncome').text(formatMoney(incomeAmount));
    $('#totalExcluded').text(formatMoney(excludedAmount));
    $('#netCashflow').text(formatMoney(net));

    const refundText = refundOffsetAmount > 0
      ? `${countText(expenses.length)} · ${t('refundDeducted')} ${formatMoney(refundOffsetAmount)}`
      : countText(expenses.length);

    $('#expenseCount').text(refundText);
    $('#incomeCount').text(countText(incomes.length));
    $('#excludedCount').text(`${countText(neutrals.length)} · ${t('refundRows')} ${refunds.length}`);
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

  function renderRankList(selector, items, total, valueLabelFn, options) {
    const opts = options || {};
    const $el = $(selector).empty();
    if (!items.length || total <= 0) {
      $el.append(`<div class="empty-mini">${escapeHtml(t('noRows'))}</div>`);
      return;
    }
    const maxAbs = Math.max(...items.map((x) => Math.abs(x.amount)), total, 1);
    items.slice(0, 10).forEach((item) => {
      const percent = total ? (item.amount / total) * 100 : 0;
      const width = Math.max(2, Math.min(100, (Math.abs(item.amount) / maxAbs) * 100));
      const label = valueLabelFn ? valueLabelFn(item.key) : item.key;
      const filterType = opts.filterType || '';
      const isRefundOffsetRow = item.key === t('refundOffsetCategory');
      const filterValue = filterType === 'tag' ? normalizeTagFilterValue(item.key) : String(item.key ?? '');
      const active = !isRefundOffsetRow && ((filterType === 'category' && state.category === filterValue) ||
        (filterType === 'tag' && state.tag === filterValue));
      const clickableAttrs = filterType && !isRefundOffsetRow
        ? ` role="button" tabindex="0" data-filter-type="${escapeAttr(filterType)}" data-filter-value="${escapeAttr(filterValue)}" title="${escapeAttr(t('clickViewDetails'))}"`
        : '';
      const activeBadge = active ? `<small class="active-filter-badge">${escapeHtml(t('activeFilter'))}</small>` : '';
      const deductionBadge = item.amount < 0 ? `<small class="deduction-badge">${escapeHtml(t('refundDeducted'))}</small>` : '';
      $el.append(`
        <div class="rank-row ${filterType && !isRefundOffsetRow ? 'rank-row-clickable' : ''} ${active ? 'active' : ''} ${item.amount < 0 ? 'deduction-row' : ''}"${clickableAttrs}>
          <div class="rank-name">
            <b title="${escapeAttr(label)}">${escapeHtml(label)}</b>
            <small>${percent.toFixed(1)}%</small>
            ${activeBadge}
            ${deductionBadge}
          </div>
          <div class="rank-amount">${escapeHtml(formatBreakdownMoney(item.amount))}</div>
          <div class="progress"><span style="width:${width}%"></span></div>
        </div>
      `);
    });
  }

  function renderBreakdowns(records) {
    const total = netExpenseAmount(records);
    const byCategory = groupNetExpense(records, categoryKey);
    const byTag = groupNetExpense(records, tagKey);
    $('#categoryTotal').text(formatMoney(total));
    $('#tagTotal').text(formatMoney(total));
    renderRankList('#categoryChart', byCategory, total, (key) => key === t('refundOffsetCategory') ? key : CashbookI18N.translateValue('category', key, state.lang), { filterType: 'category' });
    renderRankList('#tagChart', byTag, total, (key) => key || '-', { filterType: 'tag' });
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
    renderSortIndicators();

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

    // Important: do not call .show(), .hide(), or .toggle() for these two
    // containers. Those methods create inline display styles and break the
    // desktop/mobile CSS media queries. CSS decides which view is visible;
    // JS only marks the empty state.
    $('.desktop-table-wrap').toggleClass('hidden-when-empty', showEmpty);
    $('#mobileRecords').toggleClass('hidden-when-empty', showEmpty);
    $('#mobileSortPanel').toggleClass('hidden-when-empty', showEmpty);
  }

  function renderActiveFilterBar() {
    const parts = activeBreakdownFilters();
    const $bar = $('#activeFilterBar');
    if (!parts.length) {
      $bar.empty().attr('hidden', 'hidden');
      return;
    }

    $bar.removeAttr('hidden').html(`
      <span class="active-filter-text">${escapeHtml(t('detailsFilteredBy'))}</span>
      <strong>${escapeHtml(parts.join(' / '))}</strong>
      <button type="button" id="clearBreakdownFilter" class="clear-filter-btn">${escapeHtml(t('clearFilter'))}</button>
    `);
  }

  function jumpToRecords() {
    const target = document.querySelector('.records-panel');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderAll() {
    updateTexts();
    rebuildFilterOptions();
    const records = currentScopeRecords();
    renderSummary(records);
    renderBreakdowns(records);
    renderTopExpenses(records);
    renderActiveFilterBar();
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
      const nextRecords = $('#replaceExisting').is(':checked')
        ? imported
        : mergeRecords(state.records, imported);

      const committed = await commitDataJsonViaWorker(nextRecords);
      if (!committed) return;

      state.records = nextRecords.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
      state.selectedMonth = '';
      state.selectedYear = '';
      state.category = 'ALL';
      state.type = 'ALL';
      state.tag = 'ALL';
      state.search = '';
      state.sortKey = 'time';
      state.sortDir = 'desc';
      $('#searchInput').val('');
      renderAll();
      setImportMessage(`${t('workerUpdateDone')} ${state.records.length} ${t('importedRows')}`, 'success');
    } catch (err) {
      console.error(err);
      const message = err.code === 'NO_TEMPLATE_HEADER' ? t('noTemplate') : (err.message || t('parseError'));
      setImportMessage(`${t('importFailed')}：${message}`, 'error');
    }
  }

  function setImportMessage(text, type) {
    $('#importMessage').removeClass('success error').addClass(type || '').text(text || '');
  }

  function buildDataJsonPayload(records = state.records) {
    const rows = Array.isArray(records) ? records : [];
    return {
      app: 'alipay-cashbook-dashboard',
      version: 16,
      updatedAt: new Date().toISOString(),
      sync: {
        provider: 'cloudflare-worker',
        workerUrl: state.workerUrl || '',
        accessPassword: state.accessPassword || ''
      },
      total: rows.length,
      records: rows
    };
  }

  function autoDownloadDataJson() {
    if (!state.records.length) {
      setImportMessage(t('noDataToBackup'), 'error');
      return;
    }

    const payload = buildDataJsonPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
    setImportMessage(t('dataJsonAutoDownloaded'), 'success');
  }

  function applyDataJsonPayload(payload) {
    applySyncConfig(getSyncConfigFromPayload(payload));
    const records = Array.isArray(payload.records) ? payload.records : [];
    state.records = records.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
    state.selectedMonth = '';
    state.selectedYear = '';
    state.category = 'ALL';
    state.type = 'ALL';
    state.tag = 'ALL';
    state.search = '';
    state.sortKey = 'time';
    state.sortDir = 'desc';
    $('#searchInput').val('');
    renderAll();
  }

  async function loadDataJson(options = {}) {
    const force = !!options.force;
    const silent = !!options.silent;

    try {
      let payload = null;

      try {
        const localPayload = await fetchLocalDataJsonPayload();
        applySyncConfig(getSyncConfigFromPayload(localPayload));
        payload = localPayload;
      } catch (localErr) {
        console.warn('Failed to load local data.json', localErr);
      }

      if (state.workerUrl) {
        try {
          payload = await workerApi('GET');
          applySyncConfig(getSyncConfigFromPayload(payload));
        } catch (workerErr) {
          console.warn('Failed to load data.json from Worker', workerErr);
          if (!payload) throw workerErr;
        }
      }

      if (!payload) throw new Error('NO_DATA_JSON');

      const records = Array.isArray(payload.records) ? payload.records : [];

      if (force || !state.records.length) {
        applyDataJsonPayload(payload);
        if (!silent) {
          const msgKey = records.length ? 'dataJsonLoaded' : 'dataJsonEmpty';
          setImportMessage(records.length ? `${t(msgKey)} ${records.length} ${t('importedRows')}` : t(msgKey), records.length ? 'success' : 'error');
        }
        return true;
      }

      if (!silent) {
        setImportMessage(`${t('dataJsonFound')}：${records.length} ${t('importedRows')}`, 'success');
      }
      return false;
    } catch (err) {
      console.warn('Failed to load data.json', err);
      if (!silent) setImportMessage(t('dataJsonLoadFailed'), 'error');
      return false;
    }
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
    state.sortKey = settings.sortKey || 'time';
    state.sortDir = settings.sortDir || 'desc';
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
      search: state.search,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      workerUrl: state.workerUrl,
      accessPassword: state.accessPassword
    });
  }

  function bindEvents() {
    $('#importBtn').on('click', () => $('#fileInput').trigger('click'));
    $('#fileInput').on('change', (e) => handleImport(e.target.files[0]));

    $('#openSyncSettings').on('click', function () {
      openSyncSettingsModal();
    });

    $('#closeSyncSettings, #cancelSyncSettings').on('click', function () {
      closeSyncSettingsModal();
    });

    $('#syncSettingsModal').on('click', function (e) {
      if (e.target === this) closeSyncSettingsModal();
    });

    $('#saveSyncSettings').on('click', async function () {
      try {
        readSyncSettingsForm();
        if (!validateWorkerConfig()) return;
        await commitDataJsonViaWorker(state.records);
        closeSyncSettingsModal();
        setImportMessage(t('syncSettingsSavedCloud'), 'success');
        await loadDataJson({ silent: true, force: true });
      } catch (err) {
        console.error(err);
        setImportMessage(`${t('syncSettingsSaveFailed')}：${err.message || err}`, 'error');
      }
    });

    $('#langSelect').on('change', function () {
      state.lang = this.value;
      renderAll();
      setLanguagePanel(false);
    });

    $('#langToggle').on('click', function (e) {
      e.stopPropagation();
      const isOpen = !$('#langPanel').prop('hidden');
      setLanguagePanel(!isOpen);
    });

    $('#langPanel').on('click', function (e) {
      e.stopPropagation();
    });

    $('.lang-option').on('click', function () {
      const nextLang = $(this).data('lang');
      if (!nextLang) return;
      state.lang = nextLang;
      $('#langSelect').val(nextLang);
      renderAll();
      setLanguagePanel(false);
    });

    $(document).on('click', function () {
      setLanguagePanel(false);
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

    $(document).on('click keydown', '.rank-row-clickable', function (event) {
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const filterType = $(this).data('filter-type');
      const filterValue = String($(this).data('filter-value') ?? '');

      if (filterType === 'category') {
        state.category = state.category === filterValue ? 'ALL' : filterValue;
      }

      if (filterType === 'tag') {
        state.tag = state.tag === filterValue ? 'ALL' : filterValue;
      }

      renderAll();
      jumpToRecords();
    });

    $(document).on('click', '#clearBreakdownFilter', function () {
      state.category = 'ALL';
      state.tag = 'ALL';
      renderAll();
    });

    $(document).on('click', '.sort-btn, .mobile-sort-btn', function () {
      const key = $(this).data('sort-key');
      if (!key) return;

      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = key === 'time' ? 'desc' : 'asc';
      }

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

  async function init() {
    loadSettings();
    loadWorkerSettings();
    CashbookStorage.clearRecords();
    state.records = [];
    $('#langSelect').val(state.lang);
    $('#viewMode').val(state.viewMode);
    $('#searchInput').val(state.search);
    syncSettingsForm();
    bindEvents();
    renderAll();
    await loadDataJson({ silent: false, force: true });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  }

  $(init);
})();
