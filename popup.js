// AWS Account Indicator - Popup Script

class PopupManager {
  constructor() {
    this.init();
  }

  async init() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // 詳細設定ページを開く
    document.getElementById('openOptionsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }
}

// ポップアップが開かれた時に初期化
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
