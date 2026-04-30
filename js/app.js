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
    githubOwner: '',
    githubRepo: '',
    githubBranch: 'main',
    githubToken: ''
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

  function detectGitHubPagesConfig() {
    const host = window.location.hostname || '';
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const config = { owner: '', repo: '', branch: 'main' };

    if (host.endsWith('.github.io')) {
      config.owner = host.replace('.github.io', '');
      config.repo = pathParts[0] || '';
    }

    return config;
  }

  function loadGithubSettings() {
    const settings = CashbookStorage.loadSettings();
    const detected = detectGitHubPagesConfig();
    state.githubOwner = settings.githubOwner || detected.owner || 'evanlliu';
    state.githubRepo = settings.githubRepo || detected.repo || 'alipay-bookkeeping';
    state.githubBranch = settings.githubBranch || detected.branch || 'main';
    state.githubToken = localStorage.getItem('alipay_cashbook_github_token') || sessionStorage.getItem('alipay_cashbook_github_token') || '';
  }

  function syncGithubForm() {
    $('#githubOwner').val(state.githubOwner || '');
    $('#githubRepo').val(state.githubRepo || '');
    $('#githubBranch').val(state.githubBranch || 'main');
    $('#githubToken').val(state.githubToken || '');
  }

  function readGithubForm() {
    state.githubOwner = String($('#githubOwner').val() || '').trim();
    state.githubRepo = String($('#githubRepo').val() || '').trim();
    state.githubBranch = String($('#githubBranch').val() || 'main').trim() || 'main';
    state.githubToken = String($('#githubToken').val() || '').trim();
    if (state.githubToken) {
      localStorage.setItem('alipay_cashbook_github_token', state.githubToken);
      sessionStorage.setItem('alipay_cashbook_github_token', state.githubToken);
    }
  }

  function validateGithubConfig() {
    readGithubForm();
    if (!state.githubOwner || !state.githubRepo || !state.githubBranch) {
      $('#githubSyncCard').prop('open', true);
      setImportMessage(t('githubConfigRequired'), 'error');
      return false;
    }
    if (!state.githubToken) {
      $('#githubSyncCard').prop('open', true);
      setImportMessage(t('githubTokenRequired'), 'error');
      return false;
    }
    saveSettings();
    return true;
  }

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  async function githubApi(path, options = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${state.githubToken}`,
        ...(options.headers || {})
      }
    });

    let body = null;
    const text = await response.text();
    if (text) {
      try { body = JSON.parse(text); } catch (e) { body = { message: text }; }
    }

    if (!response.ok) {
      const err = new Error((body && body.message) || `GitHub API ${response.status}`);
      err.status = response.status;
      err.body = body;
      throw err;
    }

    return body;
  }

  async function getDataJsonSha() {
    try {
      const encodedPath = encodeURIComponent('data.json');
      const res = await githubApi(`/repos/${encodeURIComponent(state.githubOwner)}/${encodeURIComponent(state.githubRepo)}/contents/${encodedPath}?ref=${encodeURIComponent(state.githubBranch)}`);
      return res && res.sha ? res.sha : '';
    } catch (err) {
      if (err.status === 404) return '';
      throw err;
    }
  }

  async function commitDataJsonToGithub(records) {
    if (!validateGithubConfig()) return false;

    setImportMessage(t('githubUpdating'), 'success');
    const payload = buildDataJsonPayload(records);
    const content = utf8ToBase64(JSON.stringify(payload, null, 2));
    const sha = await getDataJsonSha();
    const body = {
      message: `Update data.json from cashbook dashboard ${new Date().toISOString()}`,
      content,
      branch: state.githubBranch
    };
    if (sha) body.sha = sha;

    await githubApi(`/repos/${encodeURIComponent(state.githubOwner)}/${encodeURIComponent(state.githubRepo)}/contents/data.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    return true;
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

  function renderRankList(selector, items, total, valueLabelFn, options) {
    const opts = options || {};
    const $el = $(selector).empty();
    if (!items.length || total <= 0) {
      $el.append(`<div class="empty-mini">${escapeHtml(t('noRows'))}</div>`);
      return;
    }
    items.slice(0, 10).forEach((item) => {
      const percent = total ? (item.amount / total) * 100 : 0;
      const label = valueLabelFn ? valueLabelFn(item.key) : item.key;
      const filterType = opts.filterType || '';
      const filterValue = filterType === 'tag' ? normalizeTagFilterValue(item.key) : String(item.key ?? '');
      const active = (filterType === 'category' && state.category === filterValue) ||
        (filterType === 'tag' && state.tag === filterValue);
      const clickableAttrs = filterType
        ? ` role="button" tabindex="0" data-filter-type="${escapeAttr(filterType)}" data-filter-value="${escapeAttr(filterValue)}" title="${escapeAttr(t('clickViewDetails'))}"`
        : '';
      const activeBadge = active ? `<small class="active-filter-badge">${escapeHtml(t('activeFilter'))}</small>` : '';
      $el.append(`
        <div class="rank-row ${filterType ? 'rank-row-clickable' : ''} ${active ? 'active' : ''}"${clickableAttrs}>
          <div class="rank-name">
            <b title="${escapeAttr(label)}">${escapeHtml(label)}</b>
            <small>${percent.toFixed(1)}%</small>
            ${activeBadge}
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
    renderRankList('#categoryChart', byCategory, total, (key) => CashbookI18N.translateValue('category', key, state.lang), { filterType: 'category' });
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

      const committed = await commitDataJsonToGithub(nextRecords);
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
      setImportMessage(`${t('githubUpdateDone')} ${state.records.length} ${t('importedRows')}`, 'success');
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
      version: 13,
      updatedAt: new Date().toISOString(),
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
      const response = await fetch(`./data.json?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const records = Array.isArray(payload.records) ? payload.records : [];

      if (!records.length) {
        if (!silent) setImportMessage(t('dataJsonEmpty'), 'error');
        return false;
      }

      if (force || !state.records.length) {
        applyDataJsonPayload(payload);
        if (!silent) setImportMessage(`${t('dataJsonLoaded')} ${records.length} ${t('importedRows')}`, 'success');
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
      githubOwner: state.githubOwner,
      githubRepo: state.githubRepo,
      githubBranch: state.githubBranch
    });
  }

  function bindEvents() {
    $('#importBtn').on('click', () => $('#fileInput').trigger('click'));
    $('#fileInput').on('change', (e) => handleImport(e.target.files[0]));

    $('#saveGithubSettings').on('click', function () {
      readGithubForm();
      saveSettings();
      setImportMessage(t('githubSettingsSaved'), 'success');
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
    loadGithubSettings();
    CashbookStorage.clearRecords();
    state.records = [];
    $('#langSelect').val(state.lang);
    $('#viewMode').val(state.viewMode);
    $('#searchInput').val(state.search);
    syncGithubForm();
    bindEvents();
    renderAll();
    await loadDataJson({ silent: false, force: true });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  }

  $(init);
})();
