// AWS Account Indicator - Options Page Script

class OptionsManager {
  constructor() {
    this.settings = {};
    this.roleSettings = {};  // スイッチロール設定
    this.currentAccount = null;
    this.currentRole = null; // 現在のスイッチロール情報
    this.globalSettings = {
      enableWatermark: true,
      watermarkOpacity: 0.3,
      watermarkSize: 48
    };
    this.selectedRows = new Set();

    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.getCurrentAccountInfo();
    this.setupEventListeners();
    this.renderAccountsTable();
    this.renderRolesTable();
    this.updateCurrentAccountDisplay();
    this.updateCurrentRoleDisplay();
    this.updateGlobalSettings();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['awsAccountSettings', 'globalSettings', 'roleSettings']);
      this.settings = result.awsAccountSettings || {};
      this.roleSettings = result.roleSettings || {};
      this.globalSettings = { ...this.globalSettings, ...(result.globalSettings || {}) };
    } catch (error) {
      console.error('設定の読み込みに失敗しました:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set({
        awsAccountSettings: this.settings,
        roleSettings: this.roleSettings,
        globalSettings: this.globalSettings
      });
      this.showNotification('設定を保存しました', 'success');
    } catch (error) {
      console.error('設定の保存に失敗しました:', error);
      this.showNotification('設定の保存に失敗しました', 'error');
    }
  }

  async getCurrentAccountInfo() {
    try {
      const tabs = await chrome.tabs.query({
        url: ["https://*.amazonaws.com/*", "https://*.aws.amazon.com/*"]
      });

      if (tabs.length > 0) {
        for (const tab of tabs) {
          try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentAccount' });
            if (response && response.accountNumber) {
              this.currentAccount = response;
              // スイッチロール情報も取得
              if (response.isSwitchRole) {
                this.currentRole = {
                  // スイッチ元アカウントを使用（オプション2）
                  sourceAccountNumber: response.switchRoleSourceAccount || response.accountNumber,
                  roleName: response.roleName,
                  roleDisplayName: response.roleDisplayName,
                  roleKey: response.roleKey
                };
              }
              break;
            }
          } catch (error) {
            // タブが応答しない場合は無視
          }
        }
      }
    } catch (error) {
      console.error('現在のアカウント情報の取得に失敗しました:', error);
    }
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

    // 検索機能
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.filterTable(e.target.value);
    });

    document.getElementById('clearSearchBtn').addEventListener('click', () => {
      document.getElementById('searchInput').value = '';
      this.filterTable('');
    });

    // 一括選択
    document.getElementById('selectAllBtn').addEventListener('click', () => {
      this.selectAllRows();
    });

    document.getElementById('deselectAllBtn').addEventListener('click', () => {
      this.deselectAllRows();
    });

    document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
      this.bulkDeleteRows();
    });

    // グローバル設定
    this.setupGlobalSettingsListeners();

    // エクスポート/インポート
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportSettings();
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      this.importSettings(e.target.files[0]);
    });

    // 危険な操作
    document.getElementById('resetBtn').addEventListener('click', () => {
      this.resetSettings();
    });

    document.getElementById('clearStorageBtn').addEventListener('click', () => {
      this.clearStorage();
    });

    // スイッチロール設定
    document.getElementById('addRoleBtn').addEventListener('click', () => {
      this.addRoleRow();
    });

    document.getElementById('quickRoleConfigBtn').addEventListener('click', () => {
      if (this.currentRole) {
        // スイッチ元アカウント番号を使用
        this.addRoleRow(
          this.currentRole.sourceAccountNumber,
          this.currentRole.roleName,
          this.currentRole.roleDisplayName
        );
      }
    });
  }

  setupGlobalSettingsListeners() {
    const settingIds = [
      'enableWatermark'
    ];

    settingIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', (e) => {
          this.globalSettings[id] = e.target.checked;
          this.saveSettings();
        });
      }
    });

    // 範囲入力
    document.getElementById('watermarkOpacity').addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.globalSettings.watermarkOpacity = value;
      document.getElementById('opacityValue').textContent = Math.round(value * 100) + '%';
      this.saveSettings();
    });

    document.getElementById('watermarkSize').addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      this.globalSettings.watermarkSize = value;
      document.getElementById('sizeValue').textContent = value + 'px';
      this.saveSettings();
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

  updateCurrentRoleDisplay() {
    const currentRoleDiv = document.getElementById('currentRole');
    const roleNameSpan = document.getElementById('currentRoleName');
    const roleAccountSpan = document.getElementById('currentRoleAccount');
    const quickRoleBtn = document.getElementById('quickRoleConfigBtn');

    if (this.currentRole && this.currentRole.roleName) {
      currentRoleDiv.style.display = 'flex';
      quickRoleBtn.style.display = 'inline-flex';
      roleNameSpan.textContent = this.currentRole.roleDisplayName || this.currentRole.roleName;
      // スイッチ元アカウント番号を表示
      roleAccountSpan.textContent = this.currentRole.sourceAccountNumber + ' (スイッチ元)';
    } else {
      currentRoleDiv.style.display = 'none';
      quickRoleBtn.style.display = 'none';
    }
  }

  updateGlobalSettings() {
    // チェックボックス
    Object.keys(this.globalSettings).forEach(key => {
      const element = document.getElementById(key);
      if (element && element.type === 'checkbox') {
        element.checked = this.globalSettings[key];
      }
    });

    // 範囲入力
    const opacitySlider = document.getElementById('watermarkOpacity');
    const sizeSlider = document.getElementById('watermarkSize');
    
    if (opacitySlider) {
      opacitySlider.value = this.globalSettings.watermarkOpacity;
      document.getElementById('opacityValue').textContent = 
        Math.round(this.globalSettings.watermarkOpacity * 100) + '%';
    }
    
    if (sizeSlider) {
      sizeSlider.value = this.globalSettings.watermarkSize;
      document.getElementById('sizeValue').textContent = 
        this.globalSettings.watermarkSize + 'px';
    }
  }

  renderAccountsTable() {
    const tbody = document.getElementById('accountsTableBody');
    tbody.innerHTML = '';

    if (Object.keys(this.settings).length === 0) {
      this.showEmptyState();
      return;
    }

    Object.entries(this.settings).forEach(([accountNumber, config]) => {
      this.addAccountRow(accountNumber, config.name, config.color, config.lastUpdated);
    });
  }

  renderRolesTable() {
    const tbody = document.getElementById('rolesTableBody');
    tbody.innerHTML = '';

    if (Object.keys(this.roleSettings).length === 0) {
      this.showRoleEmptyState();
      return;
    }

    Object.entries(this.roleSettings).forEach(([roleKey, config]) => {
      const [accountNumber, roleName] = roleKey.split(':');
      this.addRoleRow(accountNumber, roleName, config.name, config.color);
    });
  }

  showRoleEmptyState() {
    const tbody = document.getElementById('rolesTableBody');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="6" class="empty-state">
        <div class="icon">🔄</div>
        <h3>スイッチロール設定がありません</h3>
        <p>「ロール追加」ボタンから設定を開始するか、スイッチロール中に「現在のロールを設定」をクリックしてください</p>
      </td>
    `;
    tbody.appendChild(row);
  }

  showEmptyState() {
    const tbody = document.getElementById('accountsTableBody');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="6" class="empty-state">
        <div class="icon">🔧</div>
        <h3>まだアカウントが設定されていません</h3>
        <p>「アカウント追加」ボタンから設定を開始してください</p>
      </td>
    `;
    tbody.appendChild(row);
  }

  addAccountRow(accountNumber = '', name = '', color = '#ff9500', lastUpdated = null) {
    const tbody = document.getElementById('accountsTableBody');
    
    // 空の状態表示を削除
    if (tbody.querySelector('.empty-state')) {
      tbody.innerHTML = '';
    }

    const row = document.createElement('tr');
    row.className = 'fade-in';
    
    const textColor = this.getContrastingTextColor(color);
    const updateTime = lastUpdated ? new Date(lastUpdated).toLocaleString('ja-JP') : '新規';
    
    row.innerHTML = `
      <td>
        <input type="checkbox" class="row-checkbox" data-account="${accountNumber}">
        <span class="checkmark"></span>
        <input type="text" class="table-input" value="${accountNumber}" 
               placeholder="123456789012 または 1234-5678-9012" 
               data-field="accountNumber">
      </td>
      <td>
        <input type="text" class="table-input" value="${name}" 
               placeholder="本番環境" data-field="name" maxlength="25">
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
          <button class="btn btn-icon save" title="保存" style="background: #28a745; color: white;">💾</button>
          <button class="btn btn-icon delete" title="削除" style="background: #dc3545; color: white;">🗑️</button>
        </div>
      </td>
      <td>
        <small style="color: #666;">${updateTime}</small>
      </td>
    `;

    tbody.appendChild(row);
    this.setupRowEventListeners(row);
  }

  setupRowEventListeners(row) {
    const inputs = row.querySelectorAll('input:not(.row-checkbox)');
    const saveBtn = row.querySelector('.save');
    const deleteBtn = row.querySelector('.delete');
    const colorInput = row.querySelector('[data-field="color"]');
    const preview = row.querySelector('.color-preview');
    const checkbox = row.querySelector('.row-checkbox');
    const checkmark = row.querySelector('.checkmark');

    // チェックボックスとcheckmarkのクリックイベント
    checkbox.addEventListener('change', () => {
      this.updateBulkActions();
    });

    // checkmark要素のクリックイベント
    checkmark.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });

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

    if (name.length > 25) {
      this.showNotification('表示名は25文字以内で入力してください', 'error');
      nameInput.focus();
      return;
    }

    // 設定を保存
    this.settings[accountNumber] = { 
      name, 
      color, 
      lastUpdated: new Date().toISOString()
    };
    this.saveSettings();

    // 最終更新時刻を更新
    const lastUpdatedCell = row.cells[5];
    lastUpdatedCell.innerHTML = `<small style="color: #666;">${new Date().toLocaleString('ja-JP')}</small>`;
    
    // 行にsaved状態を示すスタイルを一時的に適用
    row.style.backgroundColor = '#d4edda';
    setTimeout(() => {
      row.style.backgroundColor = '';
    }, 1000);
  }

  deleteAccountRow(row) {
    const accountNumber = row.querySelector('[data-field="accountNumber"]').value.trim();

    if (accountNumber && this.settings[accountNumber]) {
      if (confirm(`アカウント ${accountNumber} (${this.settings[accountNumber].name}) の設定を削除しますか？`)) {
        delete this.settings[accountNumber];
        this.saveSettings();
        row.remove();

        // テーブルが空になった場合は空の状態を表示
        const tbody = document.getElementById('accountsTableBody');
        if (tbody.children.length === 0) {
          this.showEmptyState();
        }

        this.updateBulkActions();
      }
    } else {
      row.remove();
    }
  }

  // スイッチロール設定用のメソッド
  addRoleRow(accountNumber = '', roleName = '', displayName = '', color = '#e74c3c') {
    const tbody = document.getElementById('rolesTableBody');

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
               placeholder="スイッチ元のアカウントID" data-field="roleAccountNumber">
      </td>
      <td>
        <input type="text" class="table-input" value="${roleName}"
               placeholder="ロール表示名 (例: DevVodStream)" data-field="roleName">
      </td>
      <td>
        <input type="text" class="table-input" value="${displayName}"
               placeholder="本番管理者" data-field="roleDisplayName" maxlength="25">
      </td>
      <td>
        <input type="color" class="color-input" value="${color}"
               data-field="roleColor">
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
          <button class="btn btn-icon save" title="保存" style="background: #28a745; color: white;">💾</button>
          <button class="btn btn-icon delete" title="削除" style="background: #dc3545; color: white;">🗑️</button>
        </div>
      </td>
    `;

    tbody.appendChild(row);
    this.setupRoleRowEventListeners(row);
  }

  setupRoleRowEventListeners(row) {
    const inputs = row.querySelectorAll('input');
    const saveBtn = row.querySelector('.save');
    const deleteBtn = row.querySelector('.delete');
    const colorInput = row.querySelector('[data-field="roleColor"]');
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
      this.saveRoleRow(row);
    });

    // 削除ボタン
    deleteBtn.addEventListener('click', () => {
      this.deleteRoleRow(row);
    });

    // Enterキーで保存
    inputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.saveRoleRow(row);
        }
      });
    });
  }

  saveRoleRow(row) {
    const accountNumberInput = row.querySelector('[data-field="roleAccountNumber"]');
    const roleNameInput = row.querySelector('[data-field="roleName"]');
    const displayNameInput = row.querySelector('[data-field="roleDisplayName"]');
    const colorInput = row.querySelector('[data-field="roleColor"]');

    const accountNumber = accountNumberInput.value.trim().replace(/[-\s]/g, '');
    const roleName = roleNameInput.value.trim();
    const displayName = displayNameInput.value.trim();
    const color = colorInput.value;

    // バリデーション
    if (!accountNumber || !/^\d{12}$/.test(accountNumber)) {
      this.showNotification('アカウント番号は12桁の数字で入力してください', 'error');
      accountNumberInput.focus();
      return;
    }

    if (!roleName) {
      this.showNotification('ロール名を入力してください', 'error');
      roleNameInput.focus();
      return;
    }

    // ロールキーを生成
    const roleKey = `${accountNumber}:${roleName}`;

    // 設定を保存
    this.roleSettings[roleKey] = {
      name: displayName || roleName,
      color,
      lastUpdated: new Date().toISOString()
    };
    this.saveSettings();

    // 行にsaved状態を示すスタイルを一時的に適用
    row.style.backgroundColor = '#d4edda';
    setTimeout(() => {
      row.style.backgroundColor = '';
    }, 1000);
  }

  deleteRoleRow(row) {
    const accountNumber = row.querySelector('[data-field="roleAccountNumber"]').value.trim().replace(/[-\s]/g, '');
    const roleName = row.querySelector('[data-field="roleName"]').value.trim();
    const roleKey = `${accountNumber}:${roleName}`;

    if (roleKey && this.roleSettings[roleKey]) {
      if (confirm(`ロール設定 ${roleName} (${accountNumber}) を削除しますか？`)) {
        delete this.roleSettings[roleKey];
        this.saveSettings();
        row.remove();

        // テーブルが空になった場合は空の状態を表示
        const tbody = document.getElementById('rolesTableBody');
        if (tbody.children.length === 0) {
          this.showRoleEmptyState();
        }
      }
    } else {
      row.remove();
    }
  }

  filterTable(searchTerm) {
    const tbody = document.getElementById('accountsTableBody');
    const rows = tbody.querySelectorAll('tr:not(.empty-state)');
    
    rows.forEach(row => {
      const accountNumber = row.querySelector('[data-field="accountNumber"]').value;
      const name = row.querySelector('[data-field="name"]').value;
      
      const isMatch = accountNumber.includes(searchTerm) || 
                     name.toLowerCase().includes(searchTerm.toLowerCase());
      
      row.style.display = isMatch ? '' : 'none';
    });
  }

  selectAllRows() {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    this.updateBulkActions();
  }

  deselectAllRows() {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    this.updateBulkActions();
  }

  updateBulkActions() {
    const checked = document.querySelectorAll('.row-checkbox:checked');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    
    bulkDeleteBtn.disabled = checked.length === 0;
    bulkDeleteBtn.textContent = checked.length > 0 ? 
      `選択済み(${checked.length})を削除` : '選択済みを削除';
  }

  bulkDeleteRows() {
    const checked = document.querySelectorAll('.row-checkbox:checked');
    
    if (checked.length === 0) return;
    
    if (confirm(`選択された${checked.length}個のアカウント設定を削除しますか？`)) {
      checked.forEach(checkbox => {
        const accountNumber = checkbox.dataset.account;
        if (this.settings[accountNumber]) {
          delete this.settings[accountNumber];
        }
        checkbox.closest('tr').remove();
      });
      
      this.saveSettings();
      this.updateBulkActions();
      
      const tbody = document.getElementById('accountsTableBody');
      if (tbody.children.length === 0) {
        this.showEmptyState();
      }
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
      roleSettings: this.roleSettings,
      globalSettings: this.globalSettings,
      exportDate: new Date().toISOString(),
      version: '1.1.0'
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
          this.roleSettings = data.roleSettings || {};
          this.globalSettings = { ...this.globalSettings, ...(data.globalSettings || {}) };

          await this.saveSettings();
          this.renderAccountsTable();
          this.renderRolesTable();
          this.updateGlobalSettings();

          const accountCount = Object.keys(data.awsAccountSettings).length;
          const roleCount = Object.keys(data.roleSettings || {}).length;
          this.showNotification(`${accountCount}個のアカウント、${roleCount}個のロール設定をインポートしました`, 'success');
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
      this.roleSettings = {};
      this.globalSettings = {
        enableWatermark: true,
        watermarkOpacity: 0.3,
        watermarkSize: 48
      };

      this.saveSettings();
      this.renderAccountsTable();
      this.renderRolesTable();
      this.updateGlobalSettings();
    }
  }

  clearStorage() {
    if (confirm('すべてのローカルデータを削除しますか？この操作は元に戻せません。')) {
      chrome.storage.sync.clear(() => {
        this.showNotification('ストレージをクリアしました', 'success');
        window.location.reload();
      });
    }
  }

  showNotification(message, type = 'info') {
    // 通知要素を作成
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        max-width: 300px;
        transform: translateX(400px);
        transition: transform 0.3s ease;
      ">
        ${message}
      </div>
    `;
    
    document.body.appendChild(notification);
    const notificationEl = notification.firstElementChild;
    
    // アニメーション
    setTimeout(() => {
      notificationEl.style.transform = 'translateX(0)';
    }, 100);
    
    // 自動削除
    setTimeout(() => {
      notificationEl.style.transform = 'translateX(400px)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});
