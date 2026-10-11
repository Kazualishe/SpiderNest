window.ysdk = null;
window.ysdkReady = null;
let _gameReadySent = false;

async function notifyGameReadyOnce() {
  if (_gameReadySent) return;
  // Ждём инициализации SDK (если она ещё идёт)
  if (window.ysdkReady) {
    try { await window.ysdkReady; } catch (e) {}
  }
  if (window.ysdk && window.ysdk.features && window.ysdk.features.LoadingAPI) {
    try {
      window.ysdk.features.LoadingAPI.ready();
      _gameReadySent = true;
      console.log('GameReady sent');
    } catch (e) {
      console.warn('GameReady error:', e);
    }
  } else {
    console.warn('The SDK is not ready, GameReady is missing');
  }
}

async function initSDK() {
  try {
    window.ysdk = await YaGames.init({ signed: false });
    console.log('Yandex SDK initialized:', window.ysdk);

    document.addEventListener('contextmenu', e => e.preventDefault());

    const lang = window.ysdk.environment.i18n.lang; // например, 'ru' или 'en'
    console.log('Detected language:', lang);
    applyLanguage(lang);
    
  } catch (error) {
    console.error('Yandex SDK initialization error', error);
  }
}

function applyLanguage(lang) {
  if (['ru', 'en', 'tr'].includes(lang)) {
    document.documentElement.lang = lang;
    // Далее логика переключения текста
  }
}

function showFullscreenAd() {
  Sounds._pausedByGame = true;
  Sounds.pauseAll();
  ysdk.adv.showFullscreenAdv({
    callbacks: {
      onClose: () => {
        Sounds._pausedByGame = false;
        Sounds.resumeAll();
      },
      onError: () => {
        Sounds._pausedByGame = false;
        Sounds.resumeAll();
      }
    }
  });
}

function notifyGameReady() {
  if (window.ysdk && window.ysdk.features && window.ysdk.features.LoadingAPI) {
    try {
      window.ysdk.features.LoadingAPI.ready();
      console.log('GameReady sent');
    } catch (e) {
      console.warn('GameReady error:', e);
    }
  } else {
    console.warn('The SDK is not ready, GameReady is missing');
  }
}

window.ysdkReady = initSDK();
