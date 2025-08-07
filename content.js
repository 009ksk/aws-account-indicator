// AWS Account Indicator - Content Script

class AWSAccountIndicator {
  constructor() {
    this.accountNumber = null;
    this.accountName = null;
    this.settings = {};
    this.watermarkElement = null;
    this.isWatermarkDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    
    this.init();
  }

  // 要素に強制的にスタイルを適用する
  forceApplyStyle(element, property, value) {
    try {
      element.style.setProperty(property, value, 'important');
    } catch (e) {
      // 失敗時は無視
    }
  }

  async init() {
    console.log('AWS Account Indicator - 初期化開始');
    
    // 設定を読み込み
    await this.loadSettings();
    console.log('設定読み込み完了:', this.settings);
    
    // ページ読み込み完了を待つ
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }
    
    // 少し待ってからアカウント情報を取得（AWSページの読み込み完了を待つ）
    setTimeout(() => {
      this.detectAndApply();
    }, 1000);
    
    // アカウント情報の監視を開始
    this.startAccountMonitoring();
  }

  async detectAndApply() {
    console.log('アカウント検出開始');
    
    // アカウント情報を取得
    this.detectAccountInfo();
    
    if (this.accountNumber) {
      console.log('アカウント検出成功:', this.accountNumber);
      
      // UI要素を初期化
      this.initializeUI();
      
      // バックグラウンドスクリプトにバッジ更新を要求
      try {
        await chrome.runtime.sendMessage({
          action: 'updateBadge',
          accountNumber: this.accountNumber
        });
      } catch (error) {
        console.log('バッジ更新メッセージ送信に失敗:', error);
      }
    } else {
      console.log('アカウント番号が検出されませんでした');
      // 5秒後に再試行
      setTimeout(() => {
        this.detectAndApply();
      }, 5000);
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['awsAccountSettings']);
      this.settings = result.awsAccountSettings || {};
    } catch (error) {
      console.error('設定の読み込みに失敗しました:', error);
      this.settings = {};
    }
  }

  detectAccountInfo() {
    console.log('アカウント情報検出開始');
    
    // AWSコンソールからアカウント番号を取得する複数の方法を試行
    this.accountNumber = this.getAccountNumberFromDOM() || 
                        this.getAccountNumberFromURL() ||
                        this.getAccountNumberFromStorage();
    
    console.log('検出されたアカウント番号:', this.accountNumber);
    
    if (this.accountNumber) {
      // 設定からアカウント名を取得
      const accountSetting = this.settings[this.accountNumber];
      this.accountName = accountSetting?.name || `Account ${this.accountNumber}`;
      
      console.log('検出されたAWSアカウント:', this.accountNumber, this.accountName);
      console.log('アカウント設定:', accountSetting);
    } else {
      console.log('アカウント番号が検出されませんでした');
      console.log('現在のURL:', window.location.href);
      console.log('ページタイトル:', document.title);
    }
  }

  getAccountNumberFromDOM() {
    console.log('DOM からアカウント番号を検索中...');
    
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
      console.log(`セレクタを試行: ${selector}`);
      const elements = document.querySelectorAll(selector);
      
      for (const element of elements) {
        const text = element.textContent || element.innerText || '';
        console.log(`  要素テキスト: "${text}"`);
        
        // 12桁の数字を検索（ハイフンありなし両方対応）
        const match = text.match(/(\d{4}[-\s]?\d{4}[-\s]?\d{4})/);
        if (match) {
          // ハイフンやスペースを除去して12桁の数字のみを取得
          const accountNumber = match[1].replace(/[-\s]/g, '');
          if (accountNumber.length === 12) {
            console.log(`  アカウント番号発見: ${accountNumber} (元: ${match[1]})`);
            return accountNumber;
          }
        }
        
        // 従来の連続12桁の検索も維持
        const directMatch = text.match(/(\d{12})/);
        if (directMatch) {
          console.log(`  連続12桁アカウント番号発見: ${directMatch[1]}`);
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
            console.log(`  属性からアカウント番号発見: ${accountNumber} (元: ${attrMatch[1]})`);
            return accountNumber;
          }
        }
        
        // 連続12桁の検索
        const directAttrMatch = combinedText.match(/(\d{12})/);
        if (directAttrMatch) {
          console.log(`  属性から連続12桁発見: ${directAttrMatch[1]}`);
          return directAttrMatch[1];
        }
      }
    }

    // より広範囲な検索
    console.log('広範囲検索を実行中...');
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
            console.log(`  広範囲検索でアカウント番号発見: ${accountNumber} (元: ${match[1]}) in "${text}"`);
            return accountNumber;
          }
        }
        
        // 連続12桁の検索
        const directMatch = text.match(/(\d{12})/);
        if (directMatch) {
          console.log(`  広範囲検索で連続12桁発見: ${directMatch[1]} in "${text}"`);
          return directMatch[1];
        }
      }
    }

    console.log('DOM からアカウント番号が見つかりませんでした');
    return null;
  }

  getAccountNumberFromURL() {
    console.log('URL からアカウント番号を検索中...');
    console.log('現在のURL:', window.location.href);
    
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
            console.log(`URL からアカウント番号発見: ${accountNumber} (元: ${match[1]})`);
            return accountNumber;
          }
        }
      }
    }
    
    console.log('URL からアカウント番号が見つかりませんでした');
    return null;
  }

  getAccountNumberFromStorage() {
    // ローカルストレージやセッションストレージから取得を試行
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value) {
          const match = value.match(/(\d{12})/);
          if (match) {
            return match[1];
          }
        }
      }
    } catch (error) {
      // ストレージアクセスエラーを無視
    }
    return null;
  }

  // 診断用メソッドを追加
  diagnosePageStructure() {
    console.log('=== AWS コンソール構造診断 ===');
    
    // ヘッダー関連の要素を調査
    console.log('--- ヘッダー要素の調査 ---');
    const possibleHeaders = [
      'header',
      '[role="banner"]',
      '[class*="header"]',
      '[class*="Header"]',
      '[class*="nav"]',
      '[class*="Nav"]',
      '[class*="top"]',
      '[class*="Top"]',
      '[id*="header"]',
      '[id*="nav"]',
      '[data-testid*="header"]',
      '[data-testid*="nav"]'
    ];
    
    possibleHeaders.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`${selector}: ${elements.length}個の要素`);
        elements.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          const styles = window.getComputedStyle(el);
          console.log(`  [${index}] ${el.tagName}.${el.className} - 位置: ${rect.top}px, 背景色: ${styles.backgroundColor}`);
        });
      }
    });
    
    // フッター関連の要素を調査
    console.log('--- フッター要素の調査 ---');
    const possibleFooters = [
      'footer',
      '[role="contentinfo"]',
      '[class*="footer"]',
      '[class*="Footer"]',
      '[class*="bottom"]',
      '[class*="Bottom"]',
      '[id*="footer"]',
      '[data-testid*="footer"]'
    ];
    
    possibleFooters.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`${selector}: ${elements.length}個の要素`);
        elements.forEach((el, index) => {
          const rect = el.getBoundingClientRect();
          const styles = window.getComputedStyle(el);
          console.log(`  [${index}] ${el.tagName}.${el.className} - 位置: ${rect.top}px, 背景色: ${styles.backgroundColor}`);
        });
      }
    });
    
    // 上部50pxにある要素を調査
    console.log('--- 上部領域の要素調査 ---');
    const topElements = document.elementsFromPoint(window.innerWidth / 2, 25);
    topElements.slice(0, 5).forEach((el, index) => {
      const styles = window.getComputedStyle(el);
      console.log(`  上部要素[${index}]: ${el.tagName}.${el.className} - 背景色: ${styles.backgroundColor}`);
    });
    
    // 下部50pxにある要素を調査
    console.log('--- 下部領域の要素調査 ---');
    const bottomElements = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight - 25);
    bottomElements.slice(0, 5).forEach((el, index) => {
      const styles = window.getComputedStyle(el);
      console.log(`  下部要素[${index}]: ${el.tagName}.${el.className} - 背景色: ${styles.backgroundColor}`);
    });
  }

  // initializeUI メソッドを修正
  initializeUI() {
    console.log('UI初期化開始');
    
    if (!this.accountNumber) {
      console.log('アカウント番号がないため、UI初期化をスキップ');
      return;
    }
    
    const accountSetting = this.settings[this.accountNumber];
    if (!accountSetting) {
      console.log(`アカウント ${this.accountNumber} の設定が見つかりません`);
      return;
    }

    console.log('アカウント設定適用開始:', accountSetting);

    // 診断実行
    this.diagnosePageStructure();

    // ヘッダーとフッターの色を変更
    this.applyColorScheme(accountSetting.color);
    
    // ウォーターマークを作成
    this.createWatermark();
    
    console.log('UI初期化完了');
  }

  applyColorScheme(backgroundColor) {
    console.log('色スキーム適用開始:', backgroundColor);
    
    if (!backgroundColor) {
      console.log('背景色が指定されていません');
      return;
    }

    // テキスト色を背景色に基づいて自動計算
    const textColor = this.getContrastingTextColor(backgroundColor);
    console.log('計算されたテキスト色:', textColor);
    
    // ヘッダーの色変更
    this.applyHeaderColors(backgroundColor, textColor);
    
    // フッターの色変更
    this.applyFooterColors(backgroundColor, textColor);
    
    console.log('色スキーム適用完了');
  }

  getContrastingTextColor(backgroundColor) {
    // 16進数カラーをRGBに変換
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // 明度を計算（0-255）
    const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    
    // 明度に基づいてテキスト色を決定
    return brightness > 128 ? '#000000' : '#ffffff';
  }

  // より精密なヘッダー検出とスタイル適用
  applyHeaderColors(backgroundColor, textColor) {
    console.log('ヘッダー色適用開始');
    
    // 複数のアプローチでヘッダーを検出
    const headerElements = this.detectHeaderElements();
    
    console.log(`検出されたヘッダー要素: ${headerElements.length}個`);
    
    headerElements.forEach((element, index) => {
      console.log(`ヘッダー要素[${index}]:`, element.tagName, element.className);
      this.applyStylesToElement(element, backgroundColor, textColor, 'header');
    });
    
    // 追加のCSS注入
    this.injectAdvancedHeaderCSS(backgroundColor, textColor);
    
    console.log('ヘッダー色適用完了');
  }

  detectHeaderElements() {
    const headerElements = new Set();
    
    // 方法1: 一般的なヘッダーセレクタ
    const commonSelectors = [
      'header',
      '[role="banner"]',
      '#consoleNavPanel',
      '.awsui-app-layout-navigation',
      '.ccl-navigation-panel'
    ];
    
    commonSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => headerElements.add(el));
    });
    
    // 方法2: 位置ベースの検出（上部50px以内）
    const topElementsAtCenter = document.elementsFromPoint(window.innerWidth / 2, 25);
    const topElementsAtLeft = document.elementsFromPoint(100, 25);
    const topElementsAtRight = document.elementsFromPoint(window.innerWidth - 100, 25);
    
    [...topElementsAtCenter, ...topElementsAtLeft, ...topElementsAtRight].forEach(el => {
      if (el && el.getBoundingClientRect().top < 100) {
        // ヘッダーらしい要素かチェック
        if (this.isLikelyHeaderElement(el)) {
          headerElements.add(el);
          // 親要素もチェック
          let parent = el.parentElement;
          while (parent && parent !== document.body) {
            if (this.isLikelyHeaderElement(parent)) {
              headerElements.add(parent);
            }
            parent = parent.parentElement;
          }
        }
      }
    });
    
    // 方法3: クラス名パターンマッチング
    document.querySelectorAll('*').forEach(el => {
      const className = el.className;
      if (typeof className === 'string') {
        if (className.match(/(header|Header|nav|Nav|top|Top|global|Global)/i) && 
            el.getBoundingClientRect().top < 100) {
          headerElements.add(el);
        }
      }
    });
    
    return Array.from(headerElements);
  }

  isLikelyHeaderElement(element) {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    
    // ヘッダーらしい要素の条件
    return (
      rect.top < 100 && // 上部にある
      rect.width > window.innerWidth * 0.3 && // ある程度の幅がある
      rect.height > 20 && // ある程度の高さがある
      rect.height < 200 && // 高すぎない
      styles.position !== 'absolute' || // absoluteでない、または
      parseInt(styles.zIndex) > 1000 // z-indexが高い
    );
  }

  // より精密なフッター検出とスタイル適用
  applyFooterColors(backgroundColor, textColor) {
    console.log('フッター色適用開始');
    
    const footerElements = this.detectFooterElements();
    
    console.log(`検出されたフッター要素: ${footerElements.length}個`);
    
    footerElements.forEach((element, index) => {
      console.log(`フッター要素[${index}]:`, element.tagName, element.className);
      this.applyStylesToElement(element, backgroundColor, textColor, 'footer');
    });
    
    // 追加のCSS注入
    this.injectAdvancedFooterCSS(backgroundColor, textColor);
    
    console.log('フッター色適用完了');
  }

  detectFooterElements() {
    const footerElements = new Set();
    
    // 方法1: 一般的なフッターセレクタ
    const commonSelectors = [
      'footer',
      '[role="contentinfo"]',
      '.awsui-app-layout-content-bottom'
    ];
    
    commonSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => footerElements.add(el));
    });
    
    // 方法2: 位置ベースの検出（下部50px以内）
    const bottomY = window.innerHeight - 25;
    const bottomElementsAtCenter = document.elementsFromPoint(window.innerWidth / 2, bottomY);
    const bottomElementsAtLeft = document.elementsFromPoint(100, bottomY);
    const bottomElementsAtRight = document.elementsFromPoint(window.innerWidth - 100, bottomY);
    
    [...bottomElementsAtCenter, ...bottomElementsAtLeft, ...bottomElementsAtRight].forEach(el => {
      if (el && el.getBoundingClientRect().bottom > window.innerHeight - 100) {
        if (this.isLikelyFooterElement(el)) {
          footerElements.add(el);
          // 親要素もチェック
          let parent = el.parentElement;
          while (parent && parent !== document.body) {
            if (this.isLikelyFooterElement(parent)) {
              footerElements.add(parent);
            }
            parent = parent.parentElement;
          }
        }
      }
    });
    
    return Array.from(footerElements);
  }

  isLikelyFooterElement(element) {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    
    // フッターらしい要素の条件
    return (
      rect.bottom > window.innerHeight - 100 && // 下部にある
      rect.width > window.innerWidth * 0.3 && // ある程度の幅がある
      rect.height > 20 && // ある程度の高さがある
      rect.height < 200 // 高すぎない
    );
  }

  // 要素に対してより確実にスタイルを適用
  applyStylesToElement(element, backgroundColor, textColor, type) {
    // 本体のみ背景色
    this.forceApplyStyle(element, 'background-color', backgroundColor);
    this.forceApplyStyle(element, 'color', textColor);

    // data属性を追加
    element.setAttribute(`data-aws-${type}-colored`, 'true');

    // 子要素のテキスト色・SVG色のみ変更
    const textElements = element.querySelectorAll('a, span, button, p, h1, h2, h3, h4, h5, h6, svg, path');
    textElements.forEach(textEl => {
      this.forceApplyStyle(textEl, 'color', textColor);
      this.forceApplyStyle(textEl, 'fill', textColor); // SVGアイコン用
    });

    // ※ 子要素への背景色適用は削除
  }

  // 高度なCSS注入
  injectAdvancedHeaderCSS(backgroundColor, textColor) {
    const existingStyle = document.getElementById('aws-advanced-header-style');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    const style = document.createElement('style');
    style.id = 'aws-advanced-header-style';
    style.textContent = `
      /* AWS Account Indicator - 高度なヘッダースタイル */
      [data-aws-header-colored="true"],
      [data-aws-header-colored="true"] * {
        background-color: ${backgroundColor} !important;
        color: ${textColor} !important;
        fill: ${textColor} !important;
      }
      
      /* 位置ベースのヘッダー検出 */
      body > div:first-child,
      body > header,
      body > nav,
      body > div[class*="header" i],
      body > div[class*="nav" i],
      body > div[class*="top" i] {
        background-color: ${backgroundColor} !important;
        color: ${textColor} !important;
      }
      
      /* AWS特有のセレクタ */
      [class*="ConsoleNav"],
      [class*="GlobalNav"],
      [class*="TopNav"],
      [id*="consolenav" i],
      [id*="globalnav" i],
      [id*="topnav" i] {
        background-color: ${backgroundColor} !important;
        color: ${textColor} !important;
      }
      
      /* z-indexが高い要素（通常ヘッダー） */
      [style*="z-index: 1000"],
      [style*="z-index: 1001"],
      [style*="z-index: 1002"],
      [style*="z-index: 1003"],
      [style*="z-index: 1004"],
      [style*="z-index: 1005"] {
        background-color: ${backgroundColor} !important;
        color: ${textColor} !important;
      }
    `;
    
    document.head.appendChild(style);
    console.log('高度なヘッダーCSS注入完了');
  }

  injectAdvancedFooterCSS(backgroundColor, textColor) {
    const existingStyle = document.getElementById('aws-advanced-footer-style');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    const style = document.createElement('style');
    style.id = 'aws-advanced-footer-style';
    style.textContent = `
      /* AWS Account Indicator - 高度なフッタースタイル */
      [data-aws-footer-colored="true"],
      [data-aws-footer-colored="true"] * {
        background-color: ${backgroundColor} !important;
        color: ${textColor} !important;
        fill: ${textColor} !important;
      }
      
      /* 位置ベースのフッター検出 */
      body > div:last-child,
      body > footer,
      body > div[class*="footer" i],
      body > div[class*="bottom" i] {
        background-color: ${backgroundColor} !important;
        color: ${textColor} !important;
      }
      
      /* AWS特有のフッターセレクタ */
      [class*="ConsoleFooter"],
      [class*="AppFooter"],
      [class*="BottomNav"],
      [id*="consolefooter" i],
      [id*="appfooter" i],
      [id*="bottomnav" i] {
        background-color: ${backgroundColor} !important;
        color: ${textColor} !important;
      }
    `;
    
    document.head.appendChild(style);
    console.log('高度なフッターCSS注入完了');
  }

  createWatermark() {
    console.log('ウォーターマーク作成開始');
    
    if (this.watermarkElement) {
      console.log('既存のウォーターマークを削除');
      this.watermarkElement.remove();
    }

    this.watermarkElement = document.createElement('div');
    this.watermarkElement.className = 'aws-account-watermark';
    this.watermarkElement.textContent = this.accountName;
    
    console.log('ウォーターマークテキスト:', this.accountName);
    
    // ドラッグ可能にする
    this.watermarkElement.draggable = true;
    this.watermarkElement.addEventListener('mousedown', this.handleWatermarkMouseDown.bind(this));
    this.watermarkElement.addEventListener('dragstart', e => e.preventDefault());
    
    // 保存された位置を取得、デフォルトは右下角
    const savedPosition = this.getSavedWatermarkPosition();
    this.watermarkElement.style.left = savedPosition.x + 'px';
    this.watermarkElement.style.top = savedPosition.y + 'px';
    
    console.log('ウォーターマーク位置:', savedPosition);
    
    document.body.appendChild(this.watermarkElement);
    
    console.log('ウォーターマーク作成完了');
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
    console.log('アカウント監視開始');
    
    // DOM変更を監視してアカウント情報の変更を検出
    const observer = new MutationObserver(() => {
      const newAccountNumber = this.getAccountNumberFromDOM() || 
                              this.getAccountNumberFromURL();
      
      if (newAccountNumber && newAccountNumber !== this.accountNumber) {
        console.log('アカウント変更を検出:', newAccountNumber);
        this.accountNumber = newAccountNumber;
        this.detectAccountInfo();
        this.initializeUI();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id']
    });

    // 定期的に再適用（AWSページは動的にコンテンツが変更されるため）
    setInterval(() => {
      if (this.accountNumber && this.settings[this.accountNumber]) {
        console.log('定期的な再適用実行');
        this.initializeUI();
      }
    }, 10000); // 10秒ごと

    // 設定変更の監視
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.awsAccountSettings) {
        console.log('設定変更を検出');
        this.loadSettings().then(() => {
          this.initializeUI();
        });
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
      case 'ping':
        sendResponse({ status: 'alive' });
        break;
        
      case 'getCurrentAccount':
      case 'getAccountInfo':
        sendResponse({
          accountNumber: this.accountNumber,
          accountName: this.accountName
        });
        break;
        
      case 'refresh':
        this.detectAccountInfo();
        this.initializeUI();
        sendResponse({ success: true });
        break;
        
      case 'settingsChanged':
        this.loadSettings().then(() => {
          this.initializeUI();
          sendResponse({ success: true });
        });
        break;















      default:
        sendResponse({ error: 'Unknown action' });
    }
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
