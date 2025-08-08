// AWS Account Indicator - Content Script

class AWSAccountIndicator {
  constructor() {
    this.accountNumber = null;
    this.accountName = null;
    this.watermarkElement = null;
    this.isWatermarkDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.globalSettings = {
      enableWatermark: true,
      watermarkOpacity: 0.3,
      watermarkSize: 48
    };
    
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
    // AWSコンソールからアカウント番号を取得する複数の方法を試行
    this.accountNumber = this.getAccountNumberFromDOM() || 
                        this.getAccountNumberFromURL();
    
    if (this.accountNumber) {
      // 設定されたアカウント名を取得
      await this.loadAccountSettings();
      
      this.accountName = this.getAccountDisplayName();
      console.log('[AWS Account Indicator] 検出されたAWSアカウント:', this.accountNumber, this.accountName);
    }
  }

  async loadAccountSettings() {
    try {
      const result = await chrome.storage.sync.get(['awsAccountSettings']);
      this.accountSettings = result.awsAccountSettings || {};
    } catch (error) {
      console.error('[AWS Account Indicator] アカウント設定の読み込みに失敗:', error);
      this.accountSettings = {};
    }
  }

  getAccountDisplayName() {
    if (this.accountNumber && this.accountSettings[this.accountNumber]) {
      const config = this.accountSettings[this.accountNumber];
      const displayName = config.name || `AccountID: ${this.accountNumber}`;
      // 25文字以内に制限
      return displayName.length > 25 ? displayName.substring(0, 25) + '...' : displayName;
    }
    const defaultName = `AccountID: ${this.accountNumber}`;
    // 25文字以内に制限
    return defaultName.length > 25 ? defaultName.substring(0, 25) + '...' : defaultName;
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
    
    // アカウント設定から色を取得
    let backgroundColor = `rgba(0, 0, 0, ${this.globalSettings.watermarkOpacity})`;
    let textColor = 'white';
    
    if (this.accountNumber && this.accountSettings && this.accountSettings[this.accountNumber]) {
      const config = this.accountSettings[this.accountNumber];
      if (config.color) {
        // カスタム色が指定されている場合、透明度を適用
        backgroundColor = this.applyOpacityToColor(config.color, this.globalSettings.watermarkOpacity);
        textColor = this.getContrastingTextColor(config.color);
      }
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
  }

  updateWatermark() {
    if (!this.watermarkElement || !this.watermarkElement.isConnected) {
      this.createWatermark();
      return;
    }
    
    // 設定された表示名を更新
    const displayName = this.getAccountDisplayName();
    this.watermarkElement.textContent = displayName;
    
    // アカウント設定から色を取得
    let backgroundColor = `rgba(0, 0, 0, ${this.globalSettings.watermarkOpacity})`;
    let textColor = 'white';
    
    if (this.accountNumber && this.accountSettings && this.accountSettings[this.accountNumber]) {
      const config = this.accountSettings[this.accountNumber];
      if (config.color) {
        // カスタム色が指定されている場合、透明度を適用
        backgroundColor = this.applyOpacityToColor(config.color, this.globalSettings.watermarkOpacity);
        textColor = this.getContrastingTextColor(config.color);
      }
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
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('ウォーターマーク位置の読み込みに失敗:', error);
    }
    
    // デフォルト位置（右下角）
    return {
      x: window.innerWidth - 200,
      y: window.innerHeight - 100
    };
  }

  saveWatermarkPosition(position) {
    try {
      localStorage.setItem('aws-watermark-position', JSON.stringify(position));
    } catch (error) {
      console.error('ウォーターマーク位置の保存に失敗:', error);
    }
  }

  startAccountMonitoring() {
    // 設定変更の監視のみ残す
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
        
        if (changes.awsAccountSettings) {
          console.log('[AWS Account Indicator] アカウント設定変更を検出');
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
  }

  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'getCurrentAccount':
      case 'getAccountInfo':
        sendResponse({
          accountNumber: this.accountNumber,
          accountName: this.accountName
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
