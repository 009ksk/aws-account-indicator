// AWS Account Indicator - Background Script

class BackgroundManager {
  constructor() {
    this.init();
  }

  init() {
    // 拡張機能のインストール時の初期化
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });

    // メッセージングハンドラー
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });
  }

  async handleInstallation(details) {
    console.log('AWS Account Indicator installed/updated:', details.reason);
    
    if (details.reason === 'install') {
      // 初回インストール時の処理
      await this.setDefaultSettings();
    }
  }

  async setDefaultSettings() {
    const defaultSettings = {
      awsAccountSettings: {},
      globalSettings: {
        enableWatermark: true,
        watermarkOpacity: 0.3,
        watermarkSize: 48
      }
    };

    try {
      await chrome.storage.sync.set(defaultSettings);
      console.log('Default settings initialized');
    } catch (error) {
      console.error('Failed to set default settings:', error);
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getCurrentAccount':
          await this.handleGetCurrentAccount(sender.tab.id, sendResponse);
          break;
          
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handling error:', error);
      sendResponse({ error: error.message });
    }
  }

  async handleGetCurrentAccount(tabId, sendResponse) {
    try {
      // コンテンツスクリプトに現在のアカウント情報を要求
      const response = await chrome.tabs.sendMessage(tabId, { action: 'getAccountInfo' });
      sendResponse(response);
    } catch (error) {
      sendResponse({ error: 'Could not get account information' });
    }
  }
}

// バックグラウンドスクリプトを初期化
new BackgroundManager();
