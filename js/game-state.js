    // ============================================================
// AUDIO CONTEXT (Web Audio API — не вызывает системный плеер)
// ============================================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Разблокировка AudioContext по первому взаимодействию пользователя
function unlockAudio() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  document.removeEventListener('pointerdown', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
  document.removeEventListener('touchstart', unlockAudio);
}
document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('keydown', unlockAudio);
document.addEventListener('touchstart', unlockAudio);

// Кэш декодированных буферов: name -> AudioBuffer
const audioBuffers = {};
// Кэш "в процессе загрузки": name -> Promise<AudioBuffer>
const audioLoading = {};

// Асинхронная загрузка и декодирование
async function loadAudioBuffer(name) {
  if (audioBuffers[name]) return audioBuffers[name];
  if (audioLoading[name]) return audioLoading[name];

  audioLoading[name] = (async () => {
    const res = await fetch('sounds/' + name);
    const arrayBuf = await res.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(arrayBuf);
    audioBuffers[name] = decoded;
    delete audioLoading[name];
    return decoded;
  })();

  return audioLoading[name];
}

// Универсальная функция воспроизведения
// Возвращает объект { source, gain } — чтобы можно было управлять громкостью/остановкой
function playBuffer(name, volume = 1, loop = false) {
  const buf = audioBuffers[name];
  if (!buf) {
    // Ещё не загружен — запустим загрузку и проиграем при готовности
    loadAudioBuffer(name).then(() => {
      // при желании можно проиграть здесь, но обычно не критично
    }).catch(() => {});
    return null;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buf;
  source.loop = loop;
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(0);
  return { source, gain };
}
    
    // ============================================================
    // SOUNDS
    // ============================================================
    const Sounds = {
      _volume: 1,
      _suspended: false,
      _pausedByGame: false,
      _activeShort: new Set(),
      _fadeFrozen: false,

      // ---- короткие звуки ----
      _playShort(name, volume) {
        const result = playBuffer(name, (volume !== undefined ? volume : 1) * Sounds._volume);
        if (result) {
          Sounds._activeShort.add(result);
          result.source.onended = () => Sounds._activeShort.delete(result);
        }
      },

      keycollect()     { this._playShort('keycollect.mp3'); },
      heartcollect()   { this._playShort('heartcollect.mp3'); },
      hearttravel()    { this._playShort('hearttravel.mp3'); },
      hit()            { this._playShort('hit' + (Math.floor(Math.random() * 5) + 1) + '.mp3'); },
      upgradecollect() { this._playShort('upgradecollect.mp3'); },
      weaponcollect()  { this._playShort('weaponcollect.mp3'); },
      shot(weaponId) {
        const map = {
          pistol: 'shotpistol.mp3', shotgun: 'shotshotgun.mp3',
          smg: 'shotsmg.mp3', carbine: 'shotcarbine.mp3',
          rifle: 'shotrifle.mp3', revolver: 'shotrevolver.mp3'
        };
        this._playShort(map[weaponId] || 'shot1.mp3', CONFIG.SHOT_VOLUME_MULT);
      },
      death()         { this._playShort('death.mp3'); },
      hitonplayer()   { this._playShort('hitonplayer.mp3'); },
      shield()        { this._playShort('shield.mp3'); },
      levelcomplete() { this._playShort('levelcomplete.mp3'); },
      wallhit()       { this._playShort('wallhit' + (Math.floor(Math.random() * 3) + 1) + '.mp3'); },
      zoom()          { this._playShort('zoom.mp3'); },

      _footstepTimer: 0,
      footstep(dt) {
        Sounds._footstepTimer -= dt;
        if (Sounds._footstepTimer <= 0) {
          Sounds._playShort('footstep_concrete_00' + Math.floor(Math.random() * 5) + '.ogg');
          Sounds._footstepTimer = CONFIG.FOOTSTEP_INTERVAL;
        }
      },

      // ... все методы ...
      // ---- амбиент ----
      _ambience: null,   // { source, gain }
      ambienceStart() {
        if (this._ambience) {
          if (this._ambience.gain) {
            this._ambience.gain.gain.value = Sounds._volume * CONFIG.AMBIENCE_VOLUME_MULT;
          }
          return;
        }
        const r = playBuffer('Ambience.mp3', Sounds._volume * CONFIG.AMBIENCE_VOLUME_MULT, true);
        this._ambience = r;
      },
      ambienceStop() {
        if (this._ambience) {
          try { this._ambience.source.stop(); } catch (e) {}
          this._ambience = null;
        }
      },
      ambienceSyncVolume() {
        if (this._ambience && this._ambience.gain) {
          this._ambience.gain.gain.value = Sounds._volume * CONFIG.AMBIENCE_VOLUME_MULT;
        }
      },

      _levelMusic: null,        // { source, gain }
      _bossMusic: null,
      _currentMusicLevel: null,
      _musicFade: null,

      playLevelMusic(level) {
        const cfg = CONFIG.MUSIC[level];
        if (!cfg) return;
        this._musicFade = null;
        this._stopMusicObj('_bossMusic');
        this._stopMusicObj('_levelMusic');
        this._currentMusicLevel = level;
        this._levelMusic = playBuffer(cfg.file, cfg.volume * Sounds._volume, true);
      },

      // ...
      stopLevelMusic(fadeDuration = 0) {
        if (!this._levelMusic) return;
        if (fadeDuration > 0) {
          this._musicFade = {
            fromGain: this._levelMusic.gain.gain,
            toGain: null,
            fromVol: this._levelMusic.gain.gain.value,
            toVol: 0,
            duration: fadeDuration,
            elapsed: 0,
            stopFrom: true,
            musicKey: '_levelMusic',
          };
        } else {
          this._stopMusicObj('_levelMusic');
        }
      },

      stopGameMusic() {
        this._stopMusicObj('_levelMusic');
        this._stopMusicObj('_bossMusic');
        this._currentMusicLevel = null;
        this._musicFade = null;
      },

      playBossMusic() {
        const cfg = CONFIG.MUSIC.BOSS;
        if (!cfg) return;
        this._stopMusicObj('_bossMusic');
        const targetVol = cfg.volume * Sounds._volume;
        this._bossMusic = playBuffer(cfg.file, 0, true);
        if (!this._bossMusic) return;
        this._musicFade = {
          fromGain: this._levelMusic ? this._levelMusic.gain.gain : null,
          toGain: this._bossMusic.gain.gain,
          fromVol: this._levelMusic ? this._levelMusic.gain.gain.value : 0,
          toVol: targetVol,
          duration: CONFIG.FADE_DURATION_LEVEL_TO_BOSS,
          elapsed: 0,
          stopFrom: false,
          pauseFrom: true,
          musicKeyFrom: '_levelMusic',
        };
      },

      stopBossMusic() {
        if (!this._bossMusic) return;
        const level = this._currentMusicLevel || currentLevel;
        const cfg = CONFIG.MUSIC[level] || CONFIG.MUSIC[1];
        this._currentMusicLevel = level;

        // Восстанавливаем level music, если её нет
        if (!this._levelMusic && cfg) {
          this._levelMusic = playBuffer(cfg.file, 0, true);
        }
        const toVol = cfg ? cfg.volume * Sounds._volume : 0.3;
        this._musicFade = {
          fromGain: this._bossMusic.gain.gain,
          toGain: this._levelMusic ? this._levelMusic.gain.gain : null,
          fromVol: this._bossMusic.gain.gain.value,
          toVol: toVol,
          duration: CONFIG.FADE_DURATION_BOSS_TO_LEVEL,
          elapsed: 0,
          stopFrom: true,
          musicKeyFrom: '_bossMusic',
        };
      },

      updateMusicFade(dt) {
        if (!this._musicFade) return;
        if (this._fadeFrozen) return;
        const fade = this._musicFade;
        fade.elapsed += dt;
        const progress = Math.min(fade.elapsed / fade.duration, 1);
        if (fade.fromGain) fade.fromGain.value = fade.fromVol * (1 - progress);
        if (fade.toGain)   fade.toGain.value   = fade.toVol * progress;

        if (progress >= 1) {
          // Останавливаем "from", если нужно
          if (fade.stopFrom && fade.musicKeyFrom) {
            const obj = this[fade.musicKeyFrom];
            if (obj) {
              try { obj.source.stop(); } catch (e) {}
              this[fade.musicKeyFrom] = null;
            }
          }
          if (fade.pauseFrom && fade.fromGain) {
            // в Web Audio "пауза" = снижение gain до 0, но мы уже остановили
          }
          this._musicFade = null;
        }
      },

      _stopMusicObj(key) {
        const obj = this[key];
        if (obj) {
          try { obj.source.stop(); } catch (e) {}
          this[key] = null;
        }
      },

      // ---- пауза / возобновление ----
      pauseAll() {
        this._suspended = true;
        if (audioCtx.state === 'running') {
          audioCtx.suspend().catch(() => {});
        }
        if (this._musicFade) this._fadeFrozen = true;
      },

      resumeAll() {
        if (!this._suspended) return;
        this._suspended = false;
        if (this._pausedByGame) return;
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        this._fadeFrozen = false;
      },
    }

    async function preloadAllSounds(onProgress) {
      // 1. Статические звуки
      const files = [
        'keycollect.mp3', 'heartcollect.mp3', 'hearttravel.mp3',
        'upgradecollect.mp3', 'weaponcollect.mp3',
        'hit1.mp3', 'hit2.mp3', 'hit3.mp3', 'hit4.mp3', 'hit5.mp3',
        'hitonplayer.mp3', 'death.mp3', 'shield.mp3',
        'shotpistol.mp3', 'shotshotgun.mp3', 'shotsmg.mp3',
        'shotcarbine.mp3', 'shotrifle.mp3', 'shotrevolver.mp3',
        'wallhit1.mp3', 'wallhit2.mp3', 'wallhit3.mp3',
        'levelcomplete.mp3', 'zoom.mp3',
        'footstep_concrete_000.ogg',
        'footstep_concrete_001.ogg',
        'footstep_concrete_002.ogg',
        'footstep_concrete_003.ogg',
        'footstep_concrete_004.ogg',
        'Ambience.mp3',
      ];

      // 2. Музыка из конфига
      for (const key of Object.keys(CONFIG.MUSIC || {})) {
        const cfg = CONFIG.MUSIC[key];
        if (cfg && cfg.file) files.push(cfg.file);
      }

      // 3. Параллельная загрузка с прогрессом
      let loaded = 0;
      const total = files.length;
      await Promise.all(files.map(f =>
        loadAudioBuffer(f)
          .catch(() => {})
          .finally(() => {
            loaded++;
            if (onProgress) onProgress(loaded / total);
          })
      ));
    }

    function getLevelConfig(level) {
      return LEVEL_CONFIG[level] || LEVEL_CONFIG[3];
    }

    // ============================================================
    // STATE
    // ============================================================
    const C = document.getElementById('canvas');
    const ctx = C.getContext('2d');
    const G = CONFIG.GRID_SIZE;
    const CP = CONFIG.CELL_PX;
    const SHOOTER_SHOOT_RANGE = CONFIG.SHOOTER_SHOOT_RANGE_CELLS * CP;
    const SHOOTER_STOP_DIST   = CONFIG.SHOOTER_STOP_DIST_CELLS   * CP;
    const BULL_DASH_DISTANCE  = CONFIG.BULL_DASH_DISTANCE_CELLS  * CP;
    const BULL_CHARGE_DIST    = CONFIG.BULL_CHARGE_DIST_CELLS    * CP;
    const BULL_ATTACK_DIST    = CONFIG.BULL_ATTACK_DIST_CELLS    * CP;
    const VIEW_W = CONFIG.VIEW_W;
    const VIEW_H = CONFIG.VIEW_H;
    let canvasScale = 1; // CSS px -> canvas px multiplier (changes in fullscreen)
    C.width = VIEW_W;
    C.height = VIEW_H;

    function resizeCanvas(cssW, cssH) {
      const dpr = window.devicePixelRatio || 1;
      const scaleX = cssW / VIEW_W;
      const scaleY = cssH / VIEW_H;
      canvasScale = Math.min(scaleX, scaleY) * dpr;
      C.width = Math.round(VIEW_W * canvasScale);
      C.height = Math.round(VIEW_H * canvasScale);
      C.style.width = Math.round(VIEW_W * Math.min(scaleX, scaleY)) + 'px';
      C.style.height = Math.round(VIEW_H * Math.min(scaleX, scaleY)) + 'px';
    }

    function beginFrame() {
      ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    }
    const W = G * CP;           // полный размер мира
    const H = G * CP;

    const floorImg = new Image();
    floorImg.src = 'img/floor-blue.png';

    const wallImg = new Image();
    wallImg.src = 'img/wall.png';

    const cornerImg = new Image();
    cornerImg.src = 'img/corner.png';

    // Green textures for level 2
    const floorGreenImg = new Image();
    floorGreenImg.src = 'img/floor-green.png';

    const wallGreenImg = new Image();
    wallGreenImg.src = 'img/wall-green.png';

    const cornerGreenImg = new Image();
    cornerGreenImg.src = 'img/corner-green.png';

    // Green floor variants with different exit configurations
    const floorRightExitGreenImg = new Image();
    floorRightExitGreenImg.src = 'img/floor-rightexit-green.png';

    const floorRightBottomExitGreenImg = new Image();
    floorRightBottomExitGreenImg.src = 'img/floor-rightbottomexit-green.png';

    const floorLeftRightBottomExitGreenImg = new Image();
    floorLeftRightBottomExitGreenImg.src = 'img/floor-leftrightbottomexit-green.png';

    const floorTopDownExitGreenImg = new Image();
    floorTopDownExitGreenImg.src = 'img/floor-topdownexit-green.png';

    const floor4ExitGreenImg = new Image();
    floor4ExitGreenImg.src = 'img/floor-4exit-green.png';

    // Y textures for level 3
    const floorYImg = new Image();
    floorYImg.src = 'img/floor-y.png';

    const wallYImg = new Image();
    wallYImg.src = 'img/wall-y.png';

    const cornerYImg = new Image();
    cornerYImg.src = 'img/corner-y.png';

    // Y floor variants with different exit configurations
    const floorRightExitYImg = new Image();
    floorRightExitYImg.src = 'img/floor-rightexit-y.png';

    const floorRightBottomExitYImg = new Image();
    floorRightBottomExitYImg.src = 'img/floor-rightbottomexit-y.png';

    const floorLeftRightBottomExitYImg = new Image();
    floorLeftRightBottomExitYImg.src = 'img/floor-leftrightbottomexit-y.png';

    const floorTopDownExitYImg = new Image();
    floorTopDownExitYImg.src = 'img/floor-topdownexit-y.png';

    const floor4ExitYImg = new Image();
    floor4ExitYImg.src = 'img/floor-4exit-y.png';

    const closedCellImg = new Image();
    closedCellImg.src = 'img/closedcell.png';

    const rockImg = new Image();
    rockImg.src = 'img/rock.png';

    const backgroundImg = new Image();
    backgroundImg.src = 'img/background.png';

    // Blue floor variants with different exit configurations
    const floorRightExitImg = new Image();
    floorRightExitImg.src = 'img/floor-rightexit-blue.png';

    const floorRightBottomExitImg = new Image();
    floorRightBottomExitImg.src = 'img/floor-rightbottomexit-blue.png';

    const floorLeftRightBottomExitImg = new Image();
    floorLeftRightBottomExitImg.src = 'img/floor-leftrightbottomexit-blue.png';

    const floorTopDownExitImg = new Image();
    floorTopDownExitImg.src = 'img/floor-topdownexit-blue.png';

    const floor4ExitImg = new Image();
    floor4ExitImg.src = 'img/floor-4exit-blue.png';

    // Exit cell backgrounds
    const closedExit1Img = new Image();
    closedExit1Img.src = 'img/closedexit1.png';

    const closedExit2Img = new Image();
    closedExit2Img.src = 'img/closedexit2.png';

    const closedExit3Img = new Image();
    closedExit3Img.src = 'img/closedexit3.png';

    const openExitImg = new Image();
    openExitImg.src = 'img/openexit.png';

    const heroImg = new Image();
    heroImg.src = 'img/hero.png';

    const cocoonImg = new Image();
    cocoonImg.src = 'img/cocoon.png';

    const hudHeartImg = new Image();
    hudHeartImg.src = 'img/heart.png';

    const hudHeartContainerImg = new Image();
    hudHeartContainerImg.src = 'img/heart-container.png';

    const hudKeyImg = new Image();
    hudKeyImg.src = 'img/key.png';

    const hudShieldImg = new Image();
    hudShieldImg.src = 'img/shield.png';

    const cursedChestImg = new Image();
    cursedChestImg.src = 'img/open-treasure-chest.png';

    const hudCtrlF     = new Image(); hudCtrlF.src     = 'img/keyboard_f.png';
    const hudCtrlShift = new Image(); hudCtrlShift.src = 'img/keyboard_shift.png';
    const hudCtrlTab   = new Image(); hudCtrlTab.src   = 'img/keyboard_tab.png';
    const hudCtrlML    = new Image(); hudCtrlML.src    = 'img/mouse_left.png';
    const hudCtrlMR    = new Image(); hudCtrlMR.src    = 'img/mouse_right.png';

    // Enemy sprites (500x500px each)
    const enemyImages = {
      bloated:  new Image(),
      buldyga:  new Image(),
      bull:     new Image(),
      plevaka:  new Image(),
      plevaka_anim: new Image(),
      soldier:  new Image(),
    };
    enemyImages.bloated.src  = 'img/bloated.png';
    enemyImages.buldyga.src  = 'img/buldyga.png';
    enemyImages.bull.src     = 'img/bull.png';
    enemyImages.plevaka.src  = 'img/plevaka.png';
    enemyImages.plevaka_anim.src = 'img/plevaka_anim.png';
    enemyImages.soldier.src  = 'img/soldier.png';
    enemyImages.bloated_dead = new Image();
    enemyImages.buldyga_dead = new Image();
    enemyImages.bull_dead    = new Image();
    enemyImages.plevaka_dead = new Image();
    enemyImages.soldier_dead = new Image();
    enemyImages.bloated_dead.src = 'img/bloated_dead.png';
    enemyImages.buldyga_dead.src = 'img/buldyga_dead.png';
    enemyImages.bull_dead.src    = 'img/bull_dead.png';
    enemyImages.plevaka_dead.src = 'img/plevaka_dead.png';
    enemyImages.soldier_dead.src = 'img/soldier_dead.png';

    // Weapon sprites
    const weaponImages = {
      pistol:   new Image(),
      shotgun:  new Image(),
      smg:      new Image(),
      rifle:    new Image(),
      revolver: new Image(),
      carbine:  new Image(),
    };
    weaponImages.pistol.src   = 'img/pistol.png';
    weaponImages.shotgun.src  = 'img/shotgun.png';
    weaponImages.smg.src      = 'img/smg.png';
    weaponImages.rifle.src    = 'img/rifle.png';
    weaponImages.revolver.src = 'img/revolver.png';
    weaponImages.carbine.src  = 'img/carbine.png';

    // ============================================================
    // PLAYER ANIMATION
    // ============================================================
    // HERO_SW, HERO_SH, HERO_ANIMS defined in config.js

    const playerAnim = {
      key: 'idle_forward',
      frame: 0,
      timer: 0,
      flip: false, // mirror horizontally for right-facing
    };

    function getPlayerAnimKey(mvx, mvy, mouseDx, mouseDy) {
      const moving = (mvx !== 0 || mvy !== 0);
      const angle = Math.atan2(mouseDy, mouseDx); // angle from player to mouse
      // Determine direction quadrant:
      // down  (facing camera): angle in [-45°, 135°) roughly => sin > 0 or |angle| < PI/4
      // We split into 4 sectors using angle:
      //   right: -PI/4 .. PI/4
      //   down:   PI/4 .. 3PI/4
      //   left:  3PI/4 .. PI  or -PI .. -3PI/4
      //   up:   -3PI/4 .. -PI/4
      let dir;
      const a = angle;
      if (a > -Math.PI / 4 && a <= Math.PI / 4) {
        dir = 'right';
      } else if (a > Math.PI / 4 && a <= 3 * Math.PI / 4) {
        dir = 'down';
      } else if (a > -3 * Math.PI / 4 && a <= -Math.PI / 4) {
        dir = 'up';
      } else {
        dir = 'left';
      }

      let key, flip = false;
      if (moving) {
        if (dir === 'right') { key = 'run_left';    flip = true; }
        else if (dir === 'left')  { key = 'run_left';    flip = false; }
        else if (dir === 'up')    { key = 'run_back';    flip = false; }
        else                      { key = 'run_forward'; flip = false; }
      } else {
        if (dir === 'right') { key = 'idle_left';    flip = true; }
        else if (dir === 'left')  { key = 'idle_left';    flip = false; }
        else if (dir === 'up')    { key = 'idle_back';    flip = false; }
        else                      { key = 'idle_forward'; flip = false; }
      }
      return { key, flip };
    }

    function updatePlayerAnim(mvx, mvy, mouseDx, mouseDy, dt) {
      const { key, flip } = getPlayerAnimKey(mvx, mvy, mouseDx, mouseDy);
      if (key !== playerAnim.key) {
        playerAnim.key = key;
        playerAnim.frame = 0;
        playerAnim.timer = 0;
      }
      playerAnim.flip = flip;
      const anim = HERO_ANIMS[key];
      playerAnim.timer += dt;
      const frameDur = 1 / anim.fps;
      while (playerAnim.timer >= frameDur) {
        playerAnim.timer -= frameDur;
        playerAnim.frame = (playerAnim.frame + 1) % anim.frames;
      }
    }

    function drawPlayerSprite(cx2, cy2, scale, alpha, snapshot) {
      if (!heroImg.complete || heroImg.naturalWidth === 0) return;
      const frame = snapshot ? snapshot.frame : playerAnim.frame;
      const key = snapshot ? snapshot.key : playerAnim.key;
      const flip = snapshot ? snapshot.flip : playerAnim.flip;
      const anim = HERO_ANIMS[key];
      const sx = frame * HERO_SW;
      const sy = anim.row * HERO_SH;
      const drawSize = HERO_SW * scale;
      ctx.save();
      ctx.globalAlpha = alpha !== undefined ? alpha : 1;
      ctx.translate(cx2, cy2);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(
        heroImg,
        sx, sy, HERO_SW, HERO_SH,
        -drawSize / 2, -drawSize / 2, drawSize, drawSize
      );
      ctx.restore();
    }

    function drawPlayerWeapon(cx2, cy2, aimAngle, scale, alpha) {
      if (!state) return;
      const weaponId = state.weaponSlots[state.activeSlot];
      if (!weaponId) return;
      const img = weaponImages[weaponId];
      if (!img || !img.complete || img.naturalWidth === 0) return;
      const wDef = WEAPON_DEFS[weaponId];
      const spriteAngle = wDef ? (wDef.spriteAngle || 0) : 0;
      const drawSize = HERO_SW * scale * 0.5;
      const recoilOffset = weaponRecoil * drawSize * 0.4;
      const offsetDist = drawSize * 0.5 - recoilOffset;
      ctx.save();
      ctx.globalAlpha = alpha !== undefined ? alpha : 1;
      ctx.translate(cx2, cy2);
      ctx.rotate(aimAngle);
      if (aimAngle > Math.PI / 2 || aimAngle < -Math.PI / 2) ctx.scale(1, -1);
      ctx.translate(offsetDist, 0);
      ctx.rotate(spriteAngle);
      ctx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      ctx.restore();
    }

    let state = null;
    let currentLevel = 1;
    let screenShake = { amount: 0, angle: 0 };
    let weaponRecoil = 0;
    let playerProgress = {
      totalLives: 3,
      totalHeartsCollected: 0,
      upgrades: {
        pellets: 0,
        damage: 0,
        penetrate: 0,
        cooldownMult: 1.0,
        speedMult: 1.0,
        spreadMult: 1.0,
        bulletSpeedMult: 1.0,
        critChance: 0,
        killAccel: false,
        killAccelPercent: 0,
        enhancedPierce: false,
        shield: 0,
        retreat: 0,
        reflection: false,
        infinitePenetrate: false,
        infiniteRange: false,
        ricochet: false,
        lastLife: false,
        battleSpeed: false,
        freeze: false,
        randomBonus: false,
        farSight: false,
        longRange: false,
        sniper: false,
      },
      spawnedUpgrades: {}, // сколько раз каждый апгрейд заспавнился за всю игру
      spawnedWeapons: [], // какие оружия уже заспавнились за всю игру
      weaponSlots: ['pistol', null],
      activeSlot: 0,
      maxSlots: 1,
    };
    let animId = null;
    let lastTime = 0;
    let camera = { x: 0, y: 0 };  // позиция камеры в мире
    let mouseScreen = { x: 0, y: 0 }; // экранные координаты курсора (пикселей канваса)
    let paused = false;
    let pauseSliderDragging = false;
    let cursedChoiceState = null; // { offers: [{id,label,description,color}], chest }
    Sounds._volume = CONFIG.DEFAULT_VOLUME;

    // Состояние зум-перехода перед battle
    let zoomTransition = null; // { fromCamX, fromCamY, fromScale, toCamX, toCamY, toScale, t, pendingCellKey }
    let zoomOutTransition = null; // { fromScale, toScale, t }

    // Летящее сердечко при открытии/закрытии клетки
    // { x, y, startX, startY, targetX, targetY, t, duration, onArrive }
    let flyingHeart = null;
    let pendingOpenHeart = false; // false | 'hud' (heart from HUD to cell) | 'cell' (heart cell-to-cell)

    // Проверка связности: все не-выключенные клетки достижимы из старта
    function checkConnectivity(startX, startY, disabledSet, gridSize) {
      const visited = new Set();
      const queue = [`${startX},${startY}`];
      visited.add(`${startX},${startY}`);

      while (queue.length) {
        const k = queue.shift();
        const { x, y } = cellFromKey(k);
        for (const [dx, dy] of CARDINAL_DIRECTIONS) {
          const nx = x + dx, ny = y + dy;
          const nk = cellKey(nx, ny);
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize && !disabledSet.has(nk) && !visited.has(nk)) {
            visited.add(nk);
            queue.push(nk);
          }
        }
      }

      // Все не-выключенные клетки должны быть посещены
      const totalCells = gridSize * gridSize;
      return visited.size === totalCells - disabledSet.size;
    }

    function generateDisabledCells(startX, startY, exitX, exitY, gridSize, disabledCount) {
      const maxAttempts = CONFIG.MAX_GENERATION_ATTEMPTS;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const disabled = new Set();
        const candidates = [];

        // Собираем все клетки кроме старта и выхода
        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            if ((x !== startX || y !== startY) && (x !== exitX || y !== exitY)) {
              candidates.push({ x, y });
            }
          }
        }

        // Перемешиваем и берём нужное количество
        shuffleInPlace(candidates);

        for (let i = 0; i < Math.min(disabledCount, candidates.length); i++) {
          disabled.add(cellKey(candidates[i].x, candidates[i].y));
        }

        // Проверяем связность
        if (checkConnectivity(startX, startY, disabled, gridSize)) {
          return disabled;
        }
      }

      // Если не удалось, возвращаем пустой сет (не должно произойти при разумных значениях)
      return new Set();
    }

    const ENEMY_POOL_TYPE_MAP = {
      soldier: 'soldier',
      shooter: 'plevaka',
      bull: 'bull',
      buldyga: 'buldyga',
      cocoon: 'cocoon',
      bloated: 'bloated',
    };

    function cellDistanceFromStart(x, y, startX, startY) {
      return Math.max(Math.abs(x - startX), Math.abs(y - startY));
    }

    function getDifficultyTier(dist, maxDist) {
      if (maxDist <= 0) return 'easy';
      const third = maxDist / 3;
      if (dist <= third) return 'easy';
      if (dist <= third * 2) return 'medium';
      return 'hard';
    }

    function pickRoomPreset(level, poolName) {
      const pools = ROOM_POOLS[level] || ROOM_POOLS[1];
      const pool = pools[poolName] || pools.easy;
      return { ...pool[Math.floor(Math.random() * pool.length)] };
    }

    function countEnemiesInPreset(preset) {
      let total = 0;
      for (const count of Object.values(preset)) {
        total += count || 0;
      }
      return total;
    }

    function getEnemyStats(enemyType) {
      // HP multipliers for regular enemies by level (bosses unaffected)
      let hpMult = 1;
      if (currentLevel === 2) hpMult = 2;
      else if (currentLevel >= 3) hpMult = 4;

      switch (enemyType) {
        case 'cocoon':
          return { hp: CONFIG.COCOON_HP * hpMult, radius: CONFIG.COCOON_RADIUS, visualScale: CONFIG.COCOON_VISUAL_SCALE };
        case 'bloated':
          return { hp: CONFIG.BLOATED_HP * hpMult, radius: CONFIG.BLOATED_RADIUS, visualScale: CONFIG.BLOATED_VISUAL_SCALE };
        case 'bull':
          return { hp: CONFIG.BULL_HP * hpMult, radius: CONFIG.BULL_RADIUS, visualScale: CONFIG.BULL_VISUAL_SCALE };
        case 'buldyga':
          return { hp: CONFIG.BULDYGA_HP * hpMult, radius: CONFIG.BULDYGA_RADIUS, visualScale: CONFIG.BULDYGA_VISUAL_SCALE };
        case 'plevaka':
          return { hp: CONFIG.SHOOTER_HP * hpMult, radius: CONFIG.SPIDER_RADIUS, visualScale: CONFIG.SHOOTER_VISUAL_SCALE };
        default:
          return { hp: CONFIG.SPIDER_HP * hpMult, radius: CONFIG.SPIDER_RADIUS, visualScale: CONFIG.SPIDER_VISUAL_SCALE };
      }
    }

    function createTrappedEnemy(enemyType, gx, gy, homeX, homeY) {
      const { hp, radius, visualScale } = getEnemyStats(enemyType);
      const isPlevaka = enemyType === 'plevaka' || enemyType === 'shooter';
      return {
        x: gx, y: gy,
        homeX, homeY,
        trapped: true,
        phase: Math.random() * Math.PI * 2,
        wobble: CONFIG.SPIDER_WOBBLE_MIN + Math.random() * (CONFIG.SPIDER_WOBBLE_MAX - CONFIG.SPIDER_WOBBLE_MIN),
        vx: 0, vy: 0,
        radius,
        hp,
        maxHp: hp,
        visualScale,
        type: enemyType,
        shootCd: 0,
        state: 'chase',
        stateTimer: 0,
        dashTargetX: 0,
        dashTargetY: 0,
        dashDirX: 0,
        // Animation state for plevaka
        animState: isPlevaka ? 'idle' : null,
        animFrame: isPlevaka ? 0 : null,
        animTimer: isPlevaka ? 0 : null,
        dashDirY: 0,
        dashDistance: 0,
        currentSpeed: enemyType === 'buldyga' ? CONFIG.BULDYGA_SPEED : undefined,
        speedAccumulator: 0,
        spawnTimer: enemyType === 'cocoon' ? CONFIG.COCOON_SPAWN_INTERVAL : undefined,
      };
    }

    function spawnEnemiesFromPreset(preset, cellX, cellY, trappedSpiders) {
      const margin = CONFIG.SPIDER_RADIUS + CONFIG.SPIDER_SPAWN_MARGIN;
      for (const [configKey, count] of Object.entries(preset)) {
        if (!count) continue;
        const enemyType = ENEMY_POOL_TYPE_MAP[configKey];
        if (!enemyType) continue;
        for (let i = 0; i < count; i++) {
          const gx = cellX * CP + margin + Math.random() * (CP - margin * 2);
          const gy = cellY * CP + margin + Math.random() * (CP - margin * 2);
          trappedSpiders.push(createTrappedEnemy(enemyType, gx, gy, cellX, cellY));
        }
      }
    }

    function setCellEnemies(cellContents, key, contentFields, preset) {
      cellContents.set(key, {
        ...contentFields,
        enemyPreset: preset,
        enemyCount: countEnemiesInPreset(preset),
        enemiesReleased: false,
        enemies: [],
      });
    }

    function initState(level = 1) {
      // Start level music
      Sounds.playLevelMusic(level);

      const levelConfig = getLevelConfig(level);
      const gridSize = levelConfig.gridSize;
      const keysRequired = levelConfig.keysRequired;
      const disabledCount = levelConfig.disabledCells;
      const heartsConfig = levelConfig.heartsCount;
      
      const cx = Math.floor(gridSize / 2);
      const cy = Math.floor(gridSize / 2);
      
      let ex, ey, ed;
      do {
        ex = Math.floor(Math.random() * gridSize);
        ey = Math.floor(Math.random() * gridSize);
        ed = Math.max(Math.abs(ex - cx), Math.abs(ey - cy));
      } while (!(ed >= 2 && ed <= 4));

      const disabledCells = generateDisabledCells(cx, cy, ex, ey, gridSize, disabledCount);

      // Генерируем содержимое клеток
      const cellContents = new Map(); // key -> {type: 'empty'|'heart'|'enemies', enemyCount?: number}
      const availableCells = [];

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const k = cellKey(x, y);
          if (!disabledCells.has(k) && !(x === cx && y === cy) && !(x === ex && y === ey)) {
            availableCells.push({ x, y, k });
          }
        }
      }

      // Перемешиваем
      shuffleInPlace(availableCells);

      let maxCellDist = 0;
      for (const cell of availableCells) {
        const d = cellDistanceFromStart(cell.x, cell.y, cx, cy);
        if (d > maxCellDist) maxCellDist = d;
      }

      function tierForCell(cell) {
        const dist = cellDistanceFromStart(cell.x, cell.y, cx, cy);
        return getDifficultyTier(dist, maxCellDist);
      }

      // Расставляем ключи — только в клетках с дистанцией 2-4 от центра
      const keyObjs = [];
      const keyCandidates = availableCells.filter(c => {
        const d = Math.max(Math.abs(c.x - cx), Math.abs(c.y - cy));
        return d >= 2 && d <= 4;
      });
      const keysCount = Math.min(keysRequired, keyCandidates.length);
      for (let i = 0; i < keysCount; i++) {
        const cell = keyCandidates[i];
        availableCells.splice(availableCells.indexOf(cell), 1);
        setCellEnemies(cellContents, cell.k, { type: 'key' }, pickRoomPreset(level, 'key'));
        keyObjs.push({ x: (cell.x + 0.5) * CP, y: (cell.y + 0.5) * CP, cellKey: cell.k, collected: false });
      }

      // Расставляем сердечки
      const heartsCount = Math.min(heartsConfig, availableCells.length);
      for (let i = 0; i < heartsCount; i++) {
        const cell = availableCells.shift();
        setCellEnemies(cellContents, cell.k, { type: 'heart' }, pickRoomPreset(level, tierForCell(cell)));
      }

      // Генерируем оружие на полу: 1 на ур.1, 2 на ур.2, 2 на ур.3
      // Оружие не повторяется между уровнями!
      const droppedWeapons = [];
      const allWeapons = ['shotgun', 'smg', 'rifle', 'revolver', 'carbine'];
      // Фильтруем уже заспавненные оружия
      const weaponPool = allWeapons.filter(w => !playerProgress.spawnedWeapons.includes(w));
      shuffleInPlace(weaponPool);
      const targetWeaponCount = LEVEL_WEAPON_COUNTS[level] || 1;
      const weaponCount = Math.min(targetWeaponCount, availableCells.length, weaponPool.length);

      // На 1 уровне оружие спавнится на диагональных клетках от старта
      let weaponCells = [];
      if (level === 1) {
        const diagonalOffsets = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const [dx, dy] of diagonalOffsets) {
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
            const k = cellKey(nx, ny);
            if (!disabledCells.has(k) && !cellContents.has(k)) {
              weaponCells.push({ x: nx, y: ny, k });
            }
          }
        }
        // Перемешиваем и берём нужное количество
        shuffleInPlace(weaponCells);
        weaponCells = weaponCells.slice(0, weaponCount);
      }

      for (let i = 0; i < weaponCount; i++) {
        let cell;
        if (level === 1 && i < weaponCells.length) {
          cell = weaponCells[i];
          // Удаляем эту клетку из availableCells чтобы не было конфликтов
          const idx = availableCells.findIndex(c => c.k === cell.k);
          if (idx >= 0) availableCells.splice(idx, 1);
        } else {
          cell = availableCells.shift();
        }
        if (!cell) continue;
        const weaponId = weaponPool[i];
        droppedWeapons.push({
          x: (cell.x + 0.5) * CP,
          y: (cell.y + 0.5) * CP,
          weaponId: weaponId,
          cellKey: cell.k,
        });
        // Запоминаем что это оружие заспавнилось
        playerProgress.spawnedWeapons.push(weaponId);
      }

      // Расставляем апгрейды (после оружия, т.к. оружие в приоритете)
      const upgradeObjs = [];
      const targetCount = LEVEL_UPGRADE_COUNTS[level] || 4;

      // Собираем доступные апгрейды (не превысили глобальный max)
      const availableUpgrades = [];
      for (const upg of UPGRADE_TYPES) {
        const spawnedCount = playerProgress.spawnedUpgrades[upg.id] || 0;
        const remaining = upg.max - spawnedCount;
        for (let i = 0; i < remaining; i++) {
          availableUpgrades.push(upg.id);
        }
      }

      // Перемешиваем и берем уникальные для этого уровня
      shuffleInPlace(availableUpgrades);
      const uniqueUpgrades = [];
      const usedInThisLevel = new Set();
      for (const upgId of availableUpgrades) {
        if (usedInThisLevel.has(upgId)) continue;
        usedInThisLevel.add(upgId);
        uniqueUpgrades.push(upgId);
        if (uniqueUpgrades.length >= targetCount) break;
      }

      // Обновляем глобальный счетчик заспавненных
      for (const upgId of uniqueUpgrades) {
        playerProgress.spawnedUpgrades[upgId] = (playerProgress.spawnedUpgrades[upgId] || 0) + 1;
      }

      // Размещаем апгрейды
      const upgsCount = Math.min(uniqueUpgrades.length, availableCells.length);
      for (let i = 0; i < upgsCount; i++) {
        const cell = availableCells.shift();
        const upgId = uniqueUpgrades[i];
        setCellEnemies(cellContents, cell.k, { type: 'upgrade', upgradeType: upgId }, pickRoomPreset(level, 'simpleupgrade'));
        upgradeObjs.push({ x: (cell.x + 0.5) * CP, y: (cell.y + 0.5) * CP, cellKey: cell.k, upgradeType: upgId, collected: false });
      }

      // Расставляем проклятые сундуки
      const chestObjs = [];
      const chestCount = Math.min(LEVEL_CHEST_COUNTS[level] || 1, availableCells.length);
      for (let i = 0; i < chestCount; i++) {
        const cell = availableCells.shift();
        if (!cell) break;
        setCellEnemies(cellContents, cell.k, { type: 'chest' }, pickRoomPreset(level, 'cursedupgrade'));
        chestObjs.push({ x: (cell.x + 0.5) * CP, y: (cell.y + 0.5) * CP, cellKey: cell.k, collected: false });
      }

      // Расставляем врагов в оставшиеся клетки (не на всех — по шансу ENEMY_SPAWN_CHANCE)
      while (availableCells.length > 0) {
        const cell = availableCells.shift();
        if (Math.random() < CONFIG.ENEMY_SPAWN_CHANCE) {
          setCellEnemies(cellContents, cell.k, { type: 'enemies' }, pickRoomPreset(level, tierForCell(cell)));
        } else {
          cellContents.set(cell.k, { type: 'empty' });
        }
      }

      // Создаём врагов в закрытых комнатах по пресетам
      const trappedSpiders = [];
      for (const [k, content] of cellContents) {
        if (content.enemyPreset && content.enemyCount > 0) {
          const { x, y } = cellFromKey(k);
          spawnEnemiesFromPreset(content.enemyPreset, x, y, trappedSpiders);
        }
      }

      // Собираем сердечки для отслеживания
      const hearts = [];
      for (const [k, content] of cellContents) {
        if (content.type === 'heart') {
          const { x, y } = cellFromKey(k);
          hearts.push({ x: (x + 0.5) * CP, y: (y + 0.5) * CP, cellKey: k, collected: false });
        }
      }

      // Вычисляем начальные смежные клетки (со стартовой позиции)
      const initOpen = new Set([`${cx},${cy}`]);
      const initEverOpened = new Set([`${cx},${cy}`]);
      const initEverRevealed = new Set([`${cx},${cy}`]);
      revealAdjacentCells(initEverRevealed, cx, cy, disabledCells);

      return {
        gridSize: gridSize,
        keysRequired: keysRequired,
        openCells: initOpen,
        everRevealedCells: initEverRevealed, // клетки, которые когда-либо были видны (смежные или открытые)
        everOpenedCells: initEverOpened, // клетки, которые когда-либо были реально открыты
        permanentlyClosed: new Set(), // чёрные клетки
        startCell: { x: cx, y: cy },
        exitCell: { x: ex, y: ey },
        disabledCells: disabledCells,
        cellContents: cellContents,
        hearts: hearts,
        heartsCollected: 0,
        keyObjs: keyObjs,
        keysCollected: 0,
        upgradeObjs: upgradeObjs,
        chestObjs: chestObjs,
        revealedExit: false,

        upgrades: { ...playerProgress.upgrades },

        player: {
          x: (cx + 0.5) * CP,
          y: (cy + 0.5) * CP,
          lives: playerProgress.totalLives,
          invulnerable: 0,
          dashCooldown: 0,
          isDashing: false,
          dashDirX: 0,
          dashDirY: 0,
          dashProgress: 0,
          dashTrails: [],
          dashTrailTimer: 0,
        },

        spiders: trappedSpiders,
        activeSpiders: [], // враги которые были выпущены
        deathCorpses: [],
        bullets: [],
        enemyBullets: [],
        shootCooldown: 0,
        maxShootCooldown: 0,
        burstCooldown: 0,
        burstRemaining: 0,
        burstWeaponId: null,
        particles: [],

        time: 0,

        keys: {},
        mouse: { x: (cx + 0.5) * CP, y: (cy + 0.5) * CP },
        phase: 'play', // 'play', 'battle', 'win', 'dead', 'stopped', 'level_complete'

        // Battle mode state
        battle: null, // { openCells, cellContents, hearts, keyObjs, upgradeObjs, spiders, activeSpiders, ... }

        // Boss battle flags
        bossSummonReady: false,
        bossDefeated: false,

        droppedWeapons: droppedWeapons,
        weaponSlots: [...playerProgress.weaponSlots],
        activeSlot: playerProgress.activeSlot,
        maxSlots: playerProgress.maxSlots,
      };
    }

// ============================================================
// SOUND PAUSE ON TAB VISIBILITY CHANGE
// ============================================================
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    Sounds.pauseAll();
  } else {
    Sounds.resumeAll();
  }
});
