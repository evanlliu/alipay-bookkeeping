/* global window */
(function () {
  const DATA_KEY = 'alipay_cashbook_dashboard_records_v1';
  const SETTINGS_KEY = 'alipay_cashbook_dashboard_settings_v1';

  function loadRecords() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Failed to load records', e);
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(DATA_KEY, JSON.stringify(records || []));
  }

  function clearRecords() {
    localStorage.removeItem(DATA_KEY);
  }

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {}));
  }

  window.CashbookStorage = {
    loadRecords,
    saveRecords,
    clearRecords,
    loadSettings,
    saveSettings
  };
})();
