// AWS Account Indicator - Content Script

class AWSAccountIndicator {
  constructor() {
    this.accountNumber = null;
    this.accountName = null;
    this.roleName = null;              // スイッチロールのロール名
    this.roleDisplayName = null;       // スイッチロールの表示名
    this.isSwitchRole = false;         // スイッチロール中かどうか
    this.switchRoleSourceAccount = null; // スイッチ元のアカウント番号
    this.watermarkElement = null;
    this.isWatermarkDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.globalSettings = {
      enableWatermark: true,
      watermarkOpacity: 0.3,
      watermarkSize: 48
    };
    this.roleSettings = {};      // ロール別の設定
    this.lastDetectedState = ''; // 状態変更検出用

    this.init();
  }

  async init() {
    console.log('[AWS Account Indicator] 初期化開始');
    
    // グローバル設定を読み込み
    await this.loadGlobalSettings();
    
    // ページ読み込み完了を待つ
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }
    
    // ページ読み込み完了後、少し待ってからアカウント情報を取得
    // AWSページの完全な読み込みを待つ
    setTimeout(async () => {
      await this.detectAndApply();
    }, 2000);
    
    // アカウント情報の監視を開始（設定変更のみ）
    this.startAccountMonitoring();
    
    // ウィンドウリサイズの監視を開始
    this.setupWindowResizeListener();
  }

  async loadGlobalSettings() {
    try {
      const result = await chrome.storage.sync.get(['globalSettings']);
      if (result.globalSettings) {
        this.globalSettings = { ...this.globalSettings, ...result.globalSettings };
      }
    } catch (error) {
      console.error('[AWS Account Indicator] グローバル設定の読み込みに失敗:', error);
    }
  }

  async detectAndApply() {
    // アカウント情報を取得
    await this.detectAccountInfo();
    
    if (this.accountNumber) {
      // ウォーターマークが有効な場合のみ作成
      if (this.globalSettings.enableWatermark) {
        // 設定された表示名と色を最初から適用してウォーターマークを作成
        this.createWatermark();
      }
    } else {
      // 再試行は1回のみ（DOM監視がないため）
      setTimeout(async () => {
        await this.detectAndApply();
      }, 3000);
    }
  }

  async detectAccountInfo() {
    // スイッチロール情報を先に検出
    this.switchRoleSourceAccount = null; // リセット
    this.detectSwitchRoleInfo();

    // AWSコンソールからアカウント番号を取得する複数の方法を試行
    // スイッチロールの場合はスイッチ先のアカウント番号を優先
    if (this.isSwitchRole) {
      this.accountNumber = this.getSwitchRoleTargetAccount() ||
                          this.getAccountNumberFromDOM() ||
                          this.getAccountNumberFromURL();
    } else {
      this.accountNumber = this.getAccountNumberFromDOM() ||
                          this.getAccountNumberFromURL();
    }

    if (this.accountNumber) {
      // 設定されたアカウント名を取得
      await this.loadAccountSettings();

      this.accountName = this.getAccountDisplayName();
      console.log('[AWS Account Indicator] 検出されたAWSアカウント:', this.accountNumber, this.accountName);
      if (this.isSwitchRole) {
        console.log('[AWS Account Indicator] スイッチロール検出:', this.roleName, this.roleDisplayName);
        console.log('[AWS Account Indicator] スイッチ元アカウント:', this.switchRoleSourceAccount);
      }
    }

    // 状態変更検出用のハッシュを更新
    this.lastDetectedState = this.getCurrentStateHash();
  }

  // スイッチロール時のターゲットアカウント番号を取得
  getSwitchRoleTargetAccount() {
    // スイッチ元のアカウント以外のアカウント番号を探す
    const allAccountNumbers = this.findAllAccountNumbersInDOM();

    // スイッチ元以外のアカウント番号を返す
    for (const accNum of allAccountNumbers) {
      if (accNum !== this.switchRoleSourceAccount) {
        console.log('[AWS Account Indicator] スイッチ先アカウント検出:', accNum);
        return accNum;
      }
    }

    return null;
  }

  // DOM内のすべてのアカウント番号を探す
  findAllAccountNumbersInDOM() {
    const accountNumbers = [];
    const seen = new Set();

    // ページ全体から12桁の数字を探す
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      if (element.offsetParent === null) continue; // 非表示要素はスキップ

      const text = element.textContent || element.innerText || '';
      if (text.length > 5 && text.length < 200) {
        // ハイフン区切りの検索
        const matches = text.matchAll(/(\d{4}[-\s]?\d{4}[-\s]?\d{4})/g);
        for (const match of matches) {
          const accountNumber = match[1].replace(/[-\s]/g, '');
          if (accountNumber.length === 12 && !seen.has(accountNumber)) {
            seen.add(accountNumber);
            accountNumbers.push(accountNumber);
          }
        }

        // 連続12桁の検索
        const directMatches = text.matchAll(/(\d{12})/g);
        for (const match of directMatches) {
          const accountNumber = match[1];
          if (!seen.has(accountNumber)) {
            seen.add(accountNumber);
            accountNumbers.push(accountNumber);
          }
        }
      }
    }

    return accountNumbers;
  }

  // スイッチロール情報を検出
  detectSwitchRoleInfo() {
    this.isSwitchRole = false;
    this.roleName = null;
    this.roleDisplayName = null;

    // 方法1: AWSコンソールの2行表示パターンを検出
    // スイッチロール時は上段にアカウント情報、下段にロール表示名が表示される
    this.detectSwitchRoleFromAccountMenu();

    // 方法2: URLからスイッチロールを検出（フォールバック）
    if (!this.isSwitchRole) {
      this.detectSwitchRoleFromUrl();
    }

    console.log('[AWS Account Indicator] スイッチロール検出結果:', {
      isSwitchRole: this.isSwitchRole,
      roleName: this.roleName,
      roleDisplayName: this.roleDisplayName
    });
  }

  // アカウントメニューからスイッチロール情報を検出
  detectSwitchRoleFromAccountMenu() {
    // AWSコンソールのアカウントメニューボタンを探す
    const menuButton = document.querySelector('[data-testid="awsc-nav-account-menu-button"]');
    if (!menuButton) return;

    // アカウント情報タイル内を探す
    const accountInfoTile = menuButton.querySelector('[data-testid="awsc-account-info-tile"]');
    if (!accountInfoTile) return;

    // account-label: "AWSorg VideoTrim development (0396-1286-8717)" のような形式
    const accountLabel = accountInfoTile.querySelector('[data-testid="account-label"]');

    // スイッチロールの表示名を探す
    // data-testid が動的な値（例: "DevVodStream"）になっている要素を探す
    // account-label 以外の data-testid を持つ要素がロール表示名
    const allTestIds = accountInfoTile.querySelectorAll('[data-testid]');
    let roleDisplayElement = null;

    for (const el of allTestIds) {
      const testId = el.getAttribute('data-testid');
      // account-label, default, awsc-account-info-tile 以外ならロール表示名の可能性
      if (testId &&
          testId !== 'account-label' &&
          testId !== 'default' &&
          testId !== 'awsc-account-info-tile' &&
          !testId.startsWith('awsc-')) {
        roleDisplayElement = el;
        break;
      }
    }

    // 別のパターン: globalNav-1256 クラスを持つ2番目の行を探す
    if (!roleDisplayElement) {
      const rows = accountInfoTile.querySelectorAll('[class*="globalNav"]');
      // 2行目の要素（ロール表示名）を探す
      for (const row of rows) {
        const text = (row.textContent || '').trim();
        // account-label のテキストではなく、アカウントIDを含まない短いテキスト
        if (text && !text.includes('(') && !text.match(/\d{4}[-\s]?\d{4}[-\s]?\d{4}/) && text.length < 50) {
          // このテキストがアカウント名と異なる場合、ロール表示名の可能性
          if (accountLabel) {
            const accountText = (accountLabel.textContent || '').trim();
            if (!accountText.includes(text)) {
              roleDisplayElement = row;
              break;
            }
          }
        }
      }
    }

    if (roleDisplayElement) {
      const roleText = (roleDisplayElement.textContent || roleDisplayElement.innerText || '').trim();
      if (roleText && roleText.length > 0 && roleText.length < 50) {
        this.isSwitchRole = true;
        this.roleDisplayName = roleText;
        this.roleName = roleText;

        // スイッチ元のアカウント番号を記録（後で除外するため）
        if (accountLabel) {
          const labelText = accountLabel.textContent || '';
          const sourceAccountMatch = labelText.match(/\((\d{4}[-\s]?\d{4}[-\s]?\d{4})\)/);
          if (sourceAccountMatch) {
            this.switchRoleSourceAccount = sourceAccountMatch[1].replace(/[-\s]/g, '');
          }
        }

        console.log('[AWS Account Indicator] スイッチロール検出:', roleText);
      }
    }
  }

  // URLからスイッチロールを検出
  detectSwitchRoleFromUrl() {
    const url = window.location.href;

    // スイッチロール時のURL特徴
    if (url.includes('switchrole') || url.includes('switch_role')) {
      this.isSwitchRole = true;
    }

    // セッション情報からロール名を取得できる場合
    const roleArnMatch = url.match(/arn[=:]aws:iam::(\d{12}):role\/([^&\s]+)/);
    if (roleArnMatch && !this.roleName) {
      this.roleName = roleArnMatch[2];
      this.roleDisplayName = this.roleName;
      this.isSwitchRole = true;
    }
  }

  // 現在の状態のハッシュを生成（変更検出用）
  getCurrentStateHash() {
    return `${this.accountNumber}-${this.roleName || 'none'}-${this.isSwitchRole}`;
  }

  async loadAccountSettings() {
    try {
      const result = await chrome.storage.sync.get(['awsAccountSettings', 'roleSettings']);
      this.accountSettings = result.awsAccountSettings || {};
      this.roleSettings = result.roleSettings || {};
    } catch (error) {
      console.error('[AWS Account Indicator] アカウント設定の読み込みに失敗:', error);
      this.accountSettings = {};
      this.roleSettings = {};
    }
  }

  getAccountDisplayName() {
    // スイッチロールの場合、ロール設定を優先
    if (this.isSwitchRole && this.roleName) {
      const roleKey = this.getRoleKey();
      if (this.roleSettings[roleKey]) {
        const config = this.roleSettings[roleKey];
        const displayName = config.name || this.roleDisplayName || this.roleName;
        return this.truncateName(displayName);
      }
      // ロール設定がない場合はロール名をそのまま表示
      const displayName = this.roleDisplayName || this.roleName;
      return this.truncateName(displayName);
    }

    // 通常のアカウント設定
    if (this.accountNumber && this.accountSettings[this.accountNumber]) {
      const config = this.accountSettings[this.accountNumber];
      const displayName = config.name || `AccountID: ${this.accountNumber}`;
      return this.truncateName(displayName);
    }
    const defaultName = `AccountID: ${this.accountNumber}`;
    return this.truncateName(defaultName);
  }

  // ロール設定のキーを生成（スイッチ元アカウント番号+ロール名）
  getRoleKey() {
    // スイッチ元のアカウント番号を使用してキーを生成
    const sourceAccount = this.switchRoleSourceAccount || this.accountNumber;
    return `${sourceAccount}:${this.roleName}`;
  }

  // 名前を25文字以内に制限
  truncateName(name) {
    return name.length > 25 ? name.substring(0, 25) + '...' : name;
  }

  // 現在アクティブな設定を取得（スイッチロールの場合はロール設定を優先）
  getActiveConfig() {
    if (this.isSwitchRole && this.roleName) {
      const roleKey = this.getRoleKey();
      if (this.roleSettings[roleKey]) {
        return this.roleSettings[roleKey];
      }
    }
    if (this.accountNumber && this.accountSettings && this.accountSettings[this.accountNumber]) {
      return this.accountSettings[this.accountNumber];
    }
    return null;
  }

  getAccountNumberFromDOM() {
    // ヘッダー内のアカウント情報を検索
    const selectors = [
      // 新しいAWSコンソール
      '[data-testid="account-detail-menu"] span',
      '[data-testid="account-detail-menu"]',
      '[data-testid="account-detail-menu"] div',
      
      // 従来のコンソール
      '.ccl-account-panel .ccl-account-number',
      '.ccl-account-panel',
      '[data-testid="account-id"]',
      '.awsui-util-action-stripe .awsui-util-action-stripe-content',
      
      // ヘッダー部分
      '#nav-usernameMenu',
      '.nav-menu-item',
      '.awsui-button-dropdown-content',
      
      // SSO環境
      '.awsui-context-header',
      '[class*="account"]',
      '[data-testid*="account"]',
      
      // その他のパターン
      '.console-account-info',
      '#console-nav-account',
      '.account-menu',
      '.user-menu'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      
      for (const element of elements) {
        const text = element.textContent || element.innerText || '';
        
        // 12桁の数字を検索（ハイフンありなし両方対応）
        const match = text.match(/(\d{4}[-\s]?\d{4}[-\s]?\d{4})/);
        if (match) {
          // ハイフンやスペースを除去して12桁の数字のみを取得
          const accountNumber = match[1].replace(/[-\s]/g, '');
          if (accountNumber.length === 12) {
            return accountNumber;
          }
        }
        
        // 従来の連続12桁の検索も維持
        const directMatch = text.match(/(\d{12})/);
        if (directMatch) {
          return directMatch[1];
        }
        
        // title属性やaria-label属性もチェック
        const title = element.getAttribute('title') || '';
        const ariaLabel = element.getAttribute('aria-label') || '';
        const combinedText = `${text} ${title} ${ariaLabel}`;
        
        // ハイフン区切りの検索
        const attrMatch = combinedText.match(/(\d{4}[-\s]?\d{4}[-\s]?\d{4})/);
        if (attrMatch) {
          const accountNumber = attrMatch[1].replace(/[-\s]/g, '');
          if (accountNumber.length === 12) {
            return accountNumber;
          }
        }
        
        // 連続12桁の検索
        const directAttrMatch = combinedText.match(/(\d{12})/);
        if (directAttrMatch) {
          return directAttrMatch[1];
        }
      }
    }

    // より広範囲な検索
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      // 表示されていない要素はスキップ
      if (element.offsetParent === null) continue;
      
      const text = element.textContent || element.innerText || '';
      if (text.length > 5 && text.length < 100) { // 適切な長さのテキストのみ
        // ハイフン区切りの検索
        const match = text.match(/(\d{4}[-\s]?\d{4}[-\s]?\d{4})/);
        if (match) {
          const accountNumber = match[1].replace(/[-\s]/g, '');
          if (accountNumber.length === 12) {
            return accountNumber;
          }
        }
        
        // 連続12桁の検索
        const directMatch = text.match(/(\d{12})/);
        if (directMatch) {
          return directMatch[1];
        }
      }
    }

    return null;
  }

  getAccountNumberFromURL() {
    // URLからアカウント番号を抽出する複数のパターン
    const urlPatterns = [
      /account[=\/](\d{4}[-\s]?\d{4}[-\s]?\d{4})/i,
      /account[=\/](\d{12})/i,
      /accountId[=\/](\d{4}[-\s]?\d{4}[-\s]?\d{4})/i,
      /accountId[=\/](\d{12})/i,
      /account_id[=\/](\d{4}[-\s]?\d{4}[-\s]?\d{4})/i,
      /account_id[=\/](\d{12})/i,
      /(\d{4}[-\s]?\d{4}[-\s]?\d{4})\.amazonaws\.com/,
      /(\d{12})\.amazonaws\.com/,
      /console\.aws\.amazon\.com\/[^\/]*\/[^\/]*\/.*[\?&]account[=\/](\d{4}[-\s]?\d{4}[-\s]?\d{4})/i,
      /console\.aws\.amazon\.com\/[^\/]*\/[^\/]*\/.*[\?&]account[=\/](\d{12})/i,
      /\/(\d{4}[-\s]?\d{4}[-\s]?\d{4})\//,
      /\/(\d{12})\//,
      /[\?&](\d{4}[-\s]?\d{4}[-\s]?\d{4})[\?&]/,
      /[\?&](\d{12})[\?&]/,
    ];
    
    for (const pattern of urlPatterns) {
      const match = window.location.href.match(pattern);
      if (match) {
        // マッチした部分からアカウント番号を抽出
        let accountNumber = match[1];
        if (accountNumber) {
          accountNumber = accountNumber.replace(/[-\s]/g, '');
          if (accountNumber.length === 12) {
            return accountNumber;
          }
        }
      }
    }
    
    return null;
  }



  createWatermark() {
    // 既存のウォーターマークがある場合は更新、なければ新規作成
    if (this.watermarkElement && this.watermarkElement.isConnected) {
      this.updateWatermark();
      return;
    }
    
    // 新規作成の場合
    if (this.watermarkElement) {
      this.watermarkElement.remove();
    }

    this.watermarkElement = document.createElement('div');
    this.watermarkElement.className = 'aws-account-watermark';
    
    // 設定された表示名を最初から使用
    const displayName = this.getAccountDisplayName();
    this.watermarkElement.textContent = displayName;

    // アカウント設定から色を取得（スイッチロールの場合はロール設定を優先）
    let backgroundColor = `rgba(0, 0, 0, ${this.globalSettings.watermarkOpacity})`;
    let textColor = 'white';

    const config = this.getActiveConfig();
    if (config && config.color) {
      backgroundColor = this.applyOpacityToColor(config.color, this.globalSettings.watermarkOpacity);
      textColor = this.getContrastingTextColor(config.color);
    }

    // 保存された位置を取得、デフォルトは右下角
    const savedPosition = this.getSavedWatermarkPosition();
    
    // グローバル設定からスタイルを適用
    this.watermarkElement.style.cssText = `
      position: fixed;
      background: ${backgroundColor};
      color: ${textColor};
      padding: 12px 16px;
      border-radius: 6px;
      font-size: ${this.globalSettings.watermarkSize}px;
      font-weight: bold;
      z-index: 999999;
      pointer-events: auto;
      user-select: none;
      font-family: Arial, sans-serif;
      left: ${savedPosition.x}px;
      top: ${savedPosition.y}px;
      cursor: move;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    // ドラッグ可能にする
    this.watermarkElement.draggable = true;
    this.watermarkElement.addEventListener('mousedown', this.handleWatermarkMouseDown.bind(this));
    this.watermarkElement.addEventListener('dragstart', e => e.preventDefault());
    
    document.body.appendChild(this.watermarkElement);
    
    // 位置が画面内に収まっているか確認・調整
    setTimeout(() => {
      this.adjustWatermarkPosition();
    }, 100);
  }

  updateWatermark() {
    if (!this.watermarkElement || !this.watermarkElement.isConnected) {
      this.createWatermark();
      return;
    }
    
    // 設定された表示名を更新
    const displayName = this.getAccountDisplayName();
    this.watermarkElement.textContent = displayName;

    // アカウント設定から色を取得（スイッチロールの場合はロール設定を優先）
    let backgroundColor = `rgba(0, 0, 0, ${this.globalSettings.watermarkOpacity})`;
    let textColor = 'white';

    const config = this.getActiveConfig();
    if (config && config.color) {
      backgroundColor = this.applyOpacityToColor(config.color, this.globalSettings.watermarkOpacity);
      textColor = this.getContrastingTextColor(config.color);
    }

    // スタイルを更新（位置は保持）
    this.watermarkElement.style.background = backgroundColor;
    this.watermarkElement.style.color = textColor;
    this.watermarkElement.style.fontSize = `${this.globalSettings.watermarkSize}px`;
  }

  handleWatermarkMouseDown(e) {
    this.isWatermarkDragging = true;
    this.dragOffset.x = e.clientX - this.watermarkElement.offsetLeft;
    this.dragOffset.y = e.clientY - this.watermarkElement.offsetTop;
    
    document.addEventListener('mousemove', this.handleWatermarkMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleWatermarkMouseUp.bind(this));
    
    e.preventDefault();
  }

  handleWatermarkMouseMove(e) {
    if (!this.isWatermarkDragging) return;
    
    const newX = e.clientX - this.dragOffset.x;
    const newY = e.clientY - this.dragOffset.y;
    
    // 画面内に収まるように制限
    const maxX = window.innerWidth - this.watermarkElement.offsetWidth;
    const maxY = window.innerHeight - this.watermarkElement.offsetHeight;
    
    const constrainedX = Math.max(0, Math.min(newX, maxX));
    const constrainedY = Math.max(0, Math.min(newY, maxY));
    
    this.watermarkElement.style.left = constrainedX + 'px';
    this.watermarkElement.style.top = constrainedY + 'px';
  }

  handleWatermarkMouseUp() {
    if (this.isWatermarkDragging) {
      this.isWatermarkDragging = false;
      
      // 位置を保存
      this.saveWatermarkPosition({
        x: parseInt(this.watermarkElement.style.left),
        y: parseInt(this.watermarkElement.style.top)
      });
    }
    
    document.removeEventListener('mousemove', this.handleWatermarkMouseMove.bind(this));
    document.removeEventListener('mouseup', this.handleWatermarkMouseUp.bind(this));
  }

  getSavedWatermarkPosition() {
    try {
      const saved = localStorage.getItem('aws-watermark-position');
      if (saved) {
        const position = JSON.parse(saved);
        
        // 保存された位置が現在の画面サイズで有効かチェック
        const maxX = window.innerWidth - 200; // ウォーターマークの推定幅
        const maxY = window.innerHeight - 100; // ウォーターマークの推定高さ
        
        // 画面内に収まるよう調整
        position.x = Math.max(10, Math.min(position.x, maxX - 10));
        position.y = Math.max(10, Math.min(position.y, maxY - 10));
        
        return position;
      }
    } catch (error) {
      console.error('ウォーターマーク位置の読み込みに失敗:', error);
    }
    
    // デフォルト位置（右下角、安全なマージン付き）
    return {
      x: Math.max(10, window.innerWidth - 210),
      y: Math.max(10, window.innerHeight - 110)
    };
  }

  saveWatermarkPosition(position) {
    try {
      localStorage.setItem('aws-watermark-position', JSON.stringify(position));
    } catch (error) {
      console.error('ウォーターマーク位置の保存に失敗:', error);
    }
  }

  // ウィンドウリサイズ時のウォーターマーク位置調整
  setupWindowResizeListener() {
    let resizeTimeout;
    
    const handleResize = () => {
      // デバウンス処理：リサイズイベントの連続発火を防ぐ
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.adjustWatermarkPosition();
      }, 100);
    };
    
    window.addEventListener('resize', handleResize);
    
    // ページ終了時にイベントリスナーを削除
    window.addEventListener('beforeunload', () => {
      window.removeEventListener('resize', handleResize);
    });
  }

  // ウォーターマークの位置を画面内に調整
  adjustWatermarkPosition() {
    if (!this.watermarkElement || !this.watermarkElement.isConnected) {
      return;
    }
    
    const currentX = parseInt(this.watermarkElement.style.left) || 0;
    const currentY = parseInt(this.watermarkElement.style.top) || 0;
    
    // ウォーターマークのサイズを取得
    const rect = this.watermarkElement.getBoundingClientRect();
    const elementWidth = rect.width;
    const elementHeight = rect.height;
    
    // 新しい画面サイズに基づいて位置を調整
    const maxX = window.innerWidth - elementWidth - 10; // 10pxのマージンを確保
    const maxY = window.innerHeight - elementHeight - 10;
    
    const adjustedX = Math.max(10, Math.min(currentX, maxX));
    const adjustedY = Math.max(10, Math.min(currentY, maxY));
    
    // 位置が変更された場合のみ更新
    if (adjustedX !== currentX || adjustedY !== currentY) {
      this.watermarkElement.style.left = adjustedX + 'px';
      this.watermarkElement.style.top = adjustedY + 'px';
      
      // 調整された位置を保存
      this.saveWatermarkPosition({
        x: adjustedX,
        y: adjustedY
      });
      
      console.log(`ウォーターマーク位置を調整: (${currentX}, ${currentY}) → (${adjustedX}, ${adjustedY})`);
    }
  }

  startAccountMonitoring() {
    // 設定変更の監視
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
      if (namespace === 'sync') {
        if (changes.globalSettings) {
          console.log('[AWS Account Indicator] グローバル設定変更を検出');
          await this.loadGlobalSettings();
          if (this.globalSettings.enableWatermark) {
            this.createWatermark();
          } else if (this.watermarkElement) {
            this.watermarkElement.remove();
            this.watermarkElement = null;
          }
        }

        if (changes.awsAccountSettings || changes.roleSettings) {
          console.log('[AWS Account Indicator] アカウント/ロール設定変更を検出');
          await this.loadAccountSettings();
          if (this.accountNumber) {
            this.accountName = this.getAccountDisplayName();
            if (this.globalSettings.enableWatermark) {
              this.createWatermark();
            }
          }
        }
      }
    });

    // メッセージリスナーの追加
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });

    // URL変更の監視（SPA対応）
    this.setupUrlChangeMonitoring();

    // DOM変更の監視（スイッチロール検出用）
    this.setupDomChangeMonitoring();
  }

  // URL変更の監視
  setupUrlChangeMonitoring() {
    let lastUrl = window.location.href;

    // popstateイベント（ブラウザの戻る/進む）
    window.addEventListener('popstate', () => {
      this.checkForChanges();
    });

    // pushState/replaceStateのフック
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.checkForChanges();
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.checkForChanges();
    };

    // 定期的なURL監視（フォールバック）
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        this.checkForChanges();
      }
    }, 2000);
  }

  // DOM変更の監視（スイッチロール検出用）
  setupDomChangeMonitoring() {
    // ヘッダー部分のみを監視
    const targetSelectors = [
      '#awsc-navigation',
      'nav[data-testid]',
      'header',
      '[data-testid="awsc-nav-account-menu-button"]',
    ];

    const observer = new MutationObserver((mutations) => {
      // 変更があったら遅延して再チェック
      clearTimeout(this.domChangeTimeout);
      this.domChangeTimeout = setTimeout(() => {
        this.checkForChanges();
      }, 500);
    });

    // 監視開始を遅延して実行
    setTimeout(() => {
      for (const selector of targetSelectors) {
        const target = document.querySelector(selector);
        if (target) {
          observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          console.log('[AWS Account Indicator] DOM監視開始:', selector);
          break;
        }
      }

      // フォールバック: bodyを監視（限定的）
      if (!document.querySelector(targetSelectors.join(','))) {
        observer.observe(document.body, {
          childList: true,
          subtree: false,
        });
      }
    }, 3000);
  }

  // 変更をチェックして必要なら再検出
  async checkForChanges() {
    const previousState = this.lastDetectedState;

    // 再検出
    await this.detectAccountInfo();

    // 状態が変わった場合はウォーターマークを更新
    if (this.lastDetectedState !== previousState) {
      console.log('[AWS Account Indicator] 状態変更を検出:', previousState, '->', this.lastDetectedState);
      if (this.globalSettings.enableWatermark) {
        this.updateWatermark();
      }
    }
  }

  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'getCurrentAccount':
      case 'getAccountInfo':
        sendResponse({
          accountNumber: this.accountNumber,
          accountName: this.accountName,
          isSwitchRole: this.isSwitchRole,
          roleName: this.roleName,
          roleDisplayName: this.roleDisplayName,
          switchRoleSourceAccount: this.switchRoleSourceAccount,
          roleKey: this.isSwitchRole ? this.getRoleKey() : null
        });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  }

  getContrastingTextColor(backgroundColor) {
    // 16進数カラーコードの場合
    if (backgroundColor.startsWith('#')) {
      const hex = backgroundColor.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
      return brightness > 128 ? '#000000' : '#ffffff';
    }
    
    // rgba形式の場合
    if (backgroundColor.startsWith('rgba')) {
      const match = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
      }
    }
    
    // rgb形式の場合
    if (backgroundColor.startsWith('rgb')) {
      const match = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
      }
    }
    
    // その他の色名や形式の場合はデフォルトで白
    return '#ffffff';
  }

  applyOpacityToColor(color, opacity) {
    // 16進数カラーコードの場合
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    
    // rgba形式の場合
    if (color.startsWith('rgba')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
    }
    
    // rgb形式の場合
    if (color.startsWith('rgb')) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
    }
    
    // その他の色名や形式の場合はデフォルトで黒に透明度を適用
    return `rgba(0, 0, 0, ${opacity})`;
  }
}

// ページ読み込み完了後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new AWSAccountIndicator();
  });
} else {
  new AWSAccountIndicator();
}
