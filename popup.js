// AWS Account Indicator - Popup Script

class PopupManager {
  constructor() {
    this.settings = {};
    this.currentAccount = null;
    this.globalSettings = {
      enableWatermark: true,
      enableHeaderColoring: true,
      enableFooterColoring: true
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.getCurrentAccountInfo();
    this.setupEventListeners();
    this.renderAccountsTable();
    this.updateCurrentAccountDisplay();
    this.updateGlobalSettings();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['awsAccountSettings', 'globalSettings']);
      this.settings = result.awsAccountSettings || {};
      this.globalSettings = { ...this.globalSettings, ...(result.globalSettings || {}) };
    } catch (error) {
      console.error('設定の読み込みに失敗しました:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set({
        awsAccountSettings: this.settings,
        globalSettings: this.globalSettings
      });
    } catch (error) {
      console.error('設定の保存に失敗しました:', error);
      this.showNotification('設定の保存に失敗しました', 'error');
    }
  }

  async getCurrentAccountInfo() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      if (currentTab && this.isAWSURL(currentTab.url)) {
        // コンテンツスクリプトに現在のアカウント情報を要求
        try {
          const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'getCurrentAccount' });
          if (response && response.accountNumber) {
            this.currentAccount = response;
          }
        } catch (error) {
          // コンテンツスクリプトが読み込まれていない場合は無視
        }
      }
    } catch (error) {
      console.error('現在のアカウント情報の取得に失敗しました:', error);
    }
  }

  isAWSURL(url) {
    return url && (url.includes('amazonaws.com') || url.includes('aws.amazon.com'));
  }

  setupEventListeners() {
    // アカウント追加ボタン
    document.getElementById('addAccountBtn').addEventListener('click', () => {
      this.addAccountRow();
    });

    // クイック設定ボタン
    document.getElementById('quickConfigBtn').addEventListener('click', () => {
      if (this.currentAccount) {
        this.addAccountRow(this.currentAccount.accountNumber, this.currentAccount.accountName);
      }
    });

    // グローバル設定
    document.getElementById('enableWatermark').addEventListener('change', (e) => {
      this.globalSettings.enableWatermark = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('enableHeaderColoring').addEventListener('change', (e) => {
      this.globalSettings.enableHeaderColoring = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('enableFooterColoring').addEventListener('change', (e) => {
      this.globalSettings.enableFooterColoring = e.target.checked;
      this.saveSettings();
    });

    // エクスポート/インポート
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportSettings();
    });

    // 詳細設定ページを開く
    document.getElementById('openOptionsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      this.importSettings(e.target.files[0]);
    });

    // リセット
    document.getElementById('resetBtn').addEventListener('click', () => {
      this.resetSettings();
    });
  }

  updateCurrentAccountDisplay() {
    const currentAccountDiv = document.getElementById('currentAccount');
    const accountNumberSpan = document.getElementById('currentAccountNumber');
    const accountNameSpan = document.getElementById('currentAccountName');

    if (this.currentAccount) {
      currentAccountDiv.style.display = 'flex';
      accountNumberSpan.textContent = this.currentAccount.accountNumber;
      accountNameSpan.textContent = this.currentAccount.accountName || '未設定';
    } else {
      currentAccountDiv.style.display = 'none';
    }
  }

  updateGlobalSettings() {
    document.getElementById('enableWatermark').checked = this.globalSettings.enableWatermark;
    document.getElementById('enableHeaderColoring').checked = this.globalSettings.enableHeaderColoring;
    document.getElementById('enableFooterColoring').checked = this.globalSettings.enableFooterColoring;
  }

  renderAccountsTable() {
    const tbody = document.getElementById('accountsTableBody');
    tbody.innerHTML = '';

    if (Object.keys(this.settings).length === 0) {
      this.showEmptyState();
      return;
    }

    Object.entries(this.settings).forEach(([accountNumber, config]) => {
      this.addAccountRow(accountNumber, config.name, config.color);
    });
  }

  showEmptyState() {
    const tbody = document.getElementById('accountsTableBody');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="5" class="empty-state">
        <div class="icon">🔧</div>
        <p>まだアカウントが設定されていません</p>
        <p>「アカウント追加」ボタンから設定を開始してください</p>
      </td>
    `;
    tbody.appendChild(row);
  }

  addAccountRow(accountNumber = '', name = '', color = '#ff9500') {
    const tbody = document.getElementById('accountsTableBody');
    
    // 空の状態表示を削除
    if (tbody.querySelector('.empty-state')) {
      tbody.innerHTML = '';
    }

    const row = document.createElement('tr');
    row.className = 'fade-in';
    
    const textColor = this.getContrastingTextColor(color);
    
    row.innerHTML = `
      <td>
        <input type="text" class="table-input" value="${accountNumber}" 
               placeholder="123456789012 または 1234-5678-9012" 
               data-field="accountNumber">
      </td>
      <td>
        <input type="text" class="table-input" value="${name}" 
               placeholder="本番環境" data-field="name">
      </td>
      <td>
        <input type="color" class="color-input" value="${color}" 
               data-field="color">
      </td>
      <td>
        <div class="color-preview">
          <div class="color-swatch" style="background-color: ${color};"></div>
          <span class="text-color-preview" style="background-color: ${color}; color: ${textColor};">
            サンプル
          </span>
        </div>
      </td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-icon save" title="保存">💾</button>
          <button class="btn btn-icon delete" title="削除">🗑️</button>
        </div>
      </td>
    `;

    tbody.appendChild(row);

    // イベントリスナーを追加
    this.setupRowEventListeners(row);
  }

  setupRowEventListeners(row) {
    const inputs = row.querySelectorAll('input');
    const saveBtn = row.querySelector('.save');
    const deleteBtn = row.querySelector('.delete');
    const colorInput = row.querySelector('[data-field="color"]');
    const preview = row.querySelector('.color-preview');

    // 色変更時のプレビュー更新
    colorInput.addEventListener('input', (e) => {
      const color = e.target.value;
      const textColor = this.getContrastingTextColor(color);
      const swatch = preview.querySelector('.color-swatch');
      const textPreview = preview.querySelector('.text-color-preview');
      
      swatch.style.backgroundColor = color;
      textPreview.style.backgroundColor = color;
      textPreview.style.color = textColor;
    });

    // 保存ボタン
    saveBtn.addEventListener('click', () => {
      this.saveAccountRow(row);
    });

    // 削除ボタン
    deleteBtn.addEventListener('click', () => {
      this.deleteAccountRow(row);
    });

    // Enterキーで保存
    inputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.saveAccountRow(row);
        }
      });
    });
  }

  saveAccountRow(row) {
    const accountNumberInput = row.querySelector('[data-field="accountNumber"]');
    const nameInput = row.querySelector('[data-field="name"]');
    const colorInput = row.querySelector('[data-field="color"]');

    const accountNumber = accountNumberInput.value.trim().replace(/[-\s]/g, ''); // ハイフンとスペースを除去
    const name = nameInput.value.trim();
    const color = colorInput.value;

    // バリデーション
    if (!accountNumberInput.value.trim()) {
      this.showNotification('アカウント番号を入力してください', 'error');
      accountNumberInput.focus();
      return;
    }

    if (!/^\d{4}[-\s]?\d{4}[-\s]?\d{4}$/.test(accountNumberInput.value.trim()) && !/^\d{12}$/.test(accountNumber)) {
      this.showNotification('アカウント番号は12桁の数字、または xxxx-xxxx-xxxx の形式で入力してください', 'error');
      accountNumberInput.focus();
      return;
    }

    if (!name) {
      this.showNotification('表示名を入力してください', 'error');
      nameInput.focus();
      return;
    }

    // 設定を保存
    this.settings[accountNumber] = { name, color };
    this.saveSettings();

    this.showNotification('設定を保存しました', 'success');
    
    // 行にsaved状態を示すスタイルを一時的に適用
    row.style.backgroundColor = '#d4edda';
    setTimeout(() => {
      row.style.backgroundColor = '';
    }, 1000);
  }

  deleteAccountRow(row) {
    const accountNumber = row.querySelector('[data-field="accountNumber"]').value.trim();
    
    if (accountNumber && this.settings[accountNumber]) {
      if (confirm(`アカウント ${accountNumber} の設定を削除しますか？`)) {
        delete this.settings[accountNumber];
        this.saveSettings();
        row.remove();
        
        // テーブルが空になった場合は空の状態を表示
        const tbody = document.getElementById('accountsTableBody');
        if (tbody.children.length === 0) {
          this.showEmptyState();
        }
        
        this.showNotification('設定を削除しました', 'success');
      }
    } else {
      row.remove();
    }
  }

  getContrastingTextColor(backgroundColor) {
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  }

  exportSettings() {
    const data = {
      awsAccountSettings: this.settings,
      globalSettings: this.globalSettings,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aws-account-indicator-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.showNotification('設定をエクスポートしました', 'success');
  }

  async importSettings(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.awsAccountSettings) {
        if (confirm('現在の設定を上書きしてインポートしますか？')) {
          this.settings = data.awsAccountSettings;
          this.globalSettings = { ...this.globalSettings, ...(data.globalSettings || {}) };
          
          await this.saveSettings();
          this.renderAccountsTable();
          this.updateGlobalSettings();
          
          this.showNotification('設定をインポートしました', 'success');
        }
      } else {
        this.showNotification('無効な設定ファイルです', 'error');
      }
    } catch (error) {
      console.error('Import error:', error);
      this.showNotification('設定ファイルの読み込みに失敗しました', 'error');
    }
  }

  resetSettings() {
    if (confirm('すべての設定をリセットしますか？この操作は元に戻せません。')) {
      this.settings = {};
      this.globalSettings = {
        enableWatermark: true,
        enableHeaderColoring: true,
        enableFooterColoring: true
      };
      
      this.saveSettings();
      this.renderAccountsTable();
      this.updateGlobalSettings();
      
      this.showNotification('設定をリセットしました', 'success');
    }
  }

  showNotification(message, type = 'info') {
    // 簡単な通知システム
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'};
      color: white;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 14px;
      font-weight: 500;
      transform: translateX(400px);
      transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // アニメーション
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);
    
    // 自動削除
    setTimeout(() => {
      notification.style.transform = 'translateX(400px)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// ポップアップが開かれた時に初期化
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
