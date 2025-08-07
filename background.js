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

    // タブの更新を監視
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });

    // メッセージングハンドラー
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // 非同期応答を示す
    });

    // 設定変更の監視
    chrome.storage.onChanged.addListener((changes, namespace) => {
      this.handleStorageChange(changes, namespace);
    });
  }

  async handleInstallation(details) {
    console.log('AWS Account Indicator installed/updated:', details.reason);
    
    if (details.reason === 'install') {
      // 初回インストール時の処理
      await this.setDefaultSettings();
      this.showWelcomeNotification();
    } else if (details.reason === 'update') {
      // アップデート時の処理
      await this.migrateSettings();
    }
  }

  async setDefaultSettings() {
    const defaultSettings = {
      awsAccountSettings: {},
      globalSettings: {
        enableWatermark: true,
        enableHeaderColoring: true,
        enableFooterColoring: true
      }
    };

    try {
      await chrome.storage.sync.set(defaultSettings);
      console.log('Default settings initialized');
    } catch (error) {
      console.error('Failed to set default settings:', error);
    }
  }

  async migrateSettings() {
    try {
      const result = await chrome.storage.sync.get();
      let needsUpdate = false;

      // 設定のマイグレーション処理（必要に応じて）
      if (!result.globalSettings) {
        result.globalSettings = {
          enableWatermark: true,
          enableHeaderColoring: true,
          enableFooterColoring: true
        };
        needsUpdate = true;
      }

      if (needsUpdate) {
        await chrome.storage.sync.set(result);
        console.log('Settings migrated successfully');
      }
    } catch (error) {
      console.error('Failed to migrate settings:', error);
    }
  }

  showWelcomeNotification() {
    // ウェルカム通知を表示
    try {
      if (chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'AWS Account Indicator',
          message: 'インストールが完了しました！右上のアイコンから設定を行ってください。'
        });
      } else {
        console.log('Notifications API not available');
      }
    } catch (error) {
      console.error('Failed to show welcome notification:', error);
    }
  }

  handleTabUpdate(tabId, changeInfo, tab) {
    // AWSページの読み込み完了時の処理
    if (changeInfo.status === 'complete' && tab.url) {
      if (this.isAWSURL(tab.url)) {
        this.injectIndicatorIfNeeded(tabId);
      }
    }
  }

  isAWSURL(url) {
    return url && (
      url.includes('amazonaws.com') || 
      url.includes('aws.amazon.com') ||
      url.includes('console.aws.amazon.com') ||
      url.includes('signin.aws.amazon.com')
    );
  }

  async injectIndicatorIfNeeded(tabId) {
    try {
      // コンテンツスクリプトが既に実行されているかチェック
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      // コンテンツスクリプトが読み込まれていない場合は注入
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        
        await chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ['content.css']
        });
      } catch (injectionError) {
        console.error('Failed to inject content script:', injectionError);
      }
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getCurrentAccount':
          await this.handleGetCurrentAccount(sender.tab.id, sendResponse);
          break;
          
        case 'updateBadge':
          await this.updateBadge(request.accountNumber, sender.tab.id);
          sendResponse({ success: true });
          break;
          sendResponse({ success: true });
          break;
          
        case 'getSettings':
          const settings = await this.getSettings();
          sendResponse(settings);
          break;
          
        case 'saveSettings':
          await this.saveSettings(request.settings);
          sendResponse({ success: true });
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

  async updateBadge(accountNumber, tabId) {
    if (accountNumber) {
      // バッジにアカウント番号の下4桁を表示
      const badgeText = accountNumber.slice(-4);
      
      await chrome.action.setBadgeText({
        text: badgeText,
        tabId: tabId
      });
      
      await chrome.action.setBadgeBackgroundColor({
        color: '#ff9500',
        tabId: tabId
      });

      // ツールチップを更新
      await chrome.action.setTitle({
        title: `AWS Account: ${accountNumber}`,
        tabId: tabId
      });
    } else {
      // バッジをクリア
      await chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
      
      await chrome.action.setTitle({
        title: 'AWS Account Indicator',
        tabId: tabId
      });
    }
  }

  async getSettings() {
    try {
      const result = await chrome.storage.sync.get(['awsAccountSettings', 'globalSettings']);
      return {
        awsAccountSettings: result.awsAccountSettings || {},
        globalSettings: result.globalSettings || {
          enableWatermark: true,
          enableHeaderColoring: true,
          enableFooterColoring: true
        }
      };
    } catch (error) {
      console.error('Failed to get settings:', error);
      return {
        awsAccountSettings: {},
        globalSettings: {
          enableWatermark: true,
          enableHeaderColoring: true,
          enableFooterColoring: true
        }
      };
    }
  }

  async saveSettings(settings) {
    try {
      await chrome.storage.sync.set(settings);
      console.log('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  handleStorageChange(changes, namespace) {
    if (namespace === 'sync') {
      // 設定変更をすべてのAWSタブに通知
      this.notifyTabsOfSettingsChange(changes);
    }
  }

  async notifyTabsOfSettingsChange(changes) {
    try {
      const tabs = await chrome.tabs.query({});
      
      for (const tab of tabs) {
        if (this.isAWSURL(tab.url)) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              action: 'settingsChanged',
              changes: changes
            });
          } catch (error) {
            // タブが応答しない場合は無視
          }
        }
      }
    } catch (error) {
      console.error('Failed to notify tabs of settings change:', error);
    }
  }

  // ユーティリティメソッド
  async getAllAWSTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      return tabs.filter(tab => this.isAWSURL(tab.url));
    } catch (error) {
      console.error('Failed to get AWS tabs:', error);
      return [];
    }
  }

  async refreshAllAWSTabs() {
    try {
      const awsTabs = await this.getAllAWSTabs();
      
      for (const tab of awsTabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'refresh' });
        } catch (error) {
          // タブが応答しない場合は無視
        }
      }
    } catch (error) {
      console.error('Failed to refresh AWS tabs:', error);
    }
  }
}

// バックグラウンドスクリプトを初期化
new BackgroundManager();
