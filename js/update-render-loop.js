    // ============================================================
    // OFFSCREEN CANVAS FOR HIT FLASH
    // ============================================================
    const _hitFlashCanvas = document.createElement('canvas');
    const _hitFlashCtx = _hitFlashCanvas.getContext('2d');

    // ============================================================
    // WEAPON SPRITE DRAWING
    // ============================================================
    function drawWeaponSprite(ctx, weaponId, x, y, size, alpha, pulse) {
      const img = weaponImages[weaponId];
      if (!img || !img.complete || img.naturalWidth === 0) return;
      const a = alpha !== undefined ? alpha : 1;
      const p = pulse !== undefined ? pulse : 1;
      ctx.save();
      ctx.globalAlpha = a * p;
      const drawSize = size || 32;
      ctx.drawImage(img, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
      ctx.restore();
    }

    // ============================================================
    // COOLDOWN BAR UNDER CURSOR
    // ============================================================
    function drawCursorCooldownBar(s, mouseX, mouseY) {
      if (s.shootCooldown <= 0 || s.maxShootCooldown <= 0) return;
      const progress = 1 - (s.shootCooldown / s.maxShootCooldown);
      const barW = 15;
      const barH = 2;
      const offsetY = 10;
      const x = mouseX - barW / 2;
      const y = mouseY + offsetY;
      ctx.save();
      // Background
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, barW, barH);
      // Fill (left to right)
      const weapon = getActiveWeapon(s);
      const fillColor = weapon ? weapon.color : '#00d4ff';
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, barW * progress, barH);
      ctx.restore();
    }

    function drawPlayerDashTrails(player, heroScale) {
      if (!player.dashTrails) return;
      for (const t of player.dashTrails) {
        const alpha = (t.life / t.maxLife) * 0.4;
        drawPlayerSprite(t.x, t.y, heroScale, alpha, t);
      }
    }

    function drawPlayerDashActiveEffect(x, y, dirX, dirY, scale) {
      ctx.save();
      ctx.translate(x, y);
      const angle = Math.atan2(dirY, dirX);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.4;
      const stretch = CONFIG.PLAYER_SPRITE_RADIUS * scale;
      const grad = ctx.createRadialGradient(-stretch * 0.4, 0, 0, -stretch * 0.4, 0, stretch * 2);
      grad.addColorStop(0, 'rgba(140, 235, 255, 0.85)');
      grad.addColorStop(1, 'rgba(140, 235, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(-stretch * 0.5, 0, stretch * 1.8, stretch * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawPlayerDashCooldownIndicator(x, y, cooldown, scale) {
      if (cooldown <= 0) return;
      const progress = 1 - (cooldown / CONFIG.PLAYER_DASH_COOLDOWN);
      const r = (10 / 3) * scale;
      const cx = x + CONFIG.PLAYER_SPRITE_RADIUS * scale * 0.95;
      const cy = y - CONFIG.PLAYER_SPRITE_RADIUS * scale * 0.1;

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = (2 / 3) * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 0.4 * scale, 0, Math.PI * 2);
      ctx.stroke();

      if (progress > 0.01) {
        ctx.strokeStyle = progress > 0.85 ? '#66ffee' : '#44bbdd';
        ctx.lineCap = 'round';
        ctx.lineWidth = (2 / 3) * scale;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 0.4 * scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ============================================================
    // UPDATE
    // ============================================================
    function update(s, dt) {
      if (s.phase !== 'play') return;
      s.time += dt;

      // Инвулнерабельность
      if (s.player.invulnerable > 0) s.player.invulnerable -= dt;

      // Кулдаун деша
      if (s.player.dashCooldown > 0) s.player.dashCooldown -= dt;
      updatePlayerDashEffects(s.player, s.player.x, s.player.y, dt, 1, s.particles);

      // Обработка деша
      if (s.player.isDashing) {
        const dashSpeed = CONFIG.PLAYER_DASH_SPEED;
        const dashDist = CONFIG.PLAYER_DASH_DISTANCE;
        const dashMove = dashSpeed * dt;
        s.player.dashProgress += dashMove;

        let newX = s.player.x + s.player.dashDirX * dashMove;
        let newY = s.player.y + s.player.dashDirY * dashMove;

        // Проверяем столкновение со стенами
        const newCellX = cellOf(newX, newY);
        if (!s.openCells.has(cellKey(newCellX.x, newCellX.y))) {
          // Ударились о стену - прекращаем деш
          s.player.isDashing = false;
        } else {
          s.player.x = newX;
          s.player.y = newY;
        }

        // Проверяем завершение деша по дистанции
        if (s.player.dashProgress >= dashDist) {
          s.player.isDashing = false;
        }

        // Анимация деша - бег в направлении деша
        updatePlayerAnim(s.player.dashDirX, s.player.dashDirY, s.mouse.x - s.player.x, s.mouse.y - s.player.y, dt);
      } else {
        // Обычное движение игрока
        const spd = CONFIG.PLAYER_SPEED * s.upgrades.speedMult;
        let mvx = 0, mvy = 0;
        const k = s.keys;
        if (k['w'] || k['W'] || k['ц'] || k['Ц'] || k['ArrowUp'] || k['arrowup']) mvy -= 1;
        if (k['s'] || k['S'] || k['ы'] || k['Ы'] || k['ArrowDown'] || k['arrowdown']) mvy += 1;
        if (k['a'] || k['A'] || k['ф'] || k['Ф'] || k['ArrowLeft'] || k['arrowleft']) mvx -= 1;
        if (k['d'] || k['D'] || k['в'] || k['В'] || k['ArrowRight'] || k['arrowright']) mvx += 1;
        if (mvx && mvy) { mvx *= Math.SQRT1_2; mvy *= Math.SQRT1_2; }
        if (mvx !== 0 || mvy !== 0) Sounds.footstep(dt); else Sounds._footstepTimer = 0;

        // Обновление анимации персонажа
        updatePlayerAnim(mvx, mvy, s.mouse.x - s.player.x, s.mouse.y - s.player.y, dt);

        const pr = CONFIG.PLAYER_RADIUS;
        let npx = s.player.x + mvx * spd * dt;
        let npy = s.player.y + mvy * spd * dt;

        // Движение только в открытых клетках
        const tcX = cellOf(npx, s.player.y);
        if (s.openCells.has(cellKey(tcX.x, tcX.y))) {
          s.player.x = npx;
        }
        const tcY = cellOf(s.player.x, npy);
        if (s.openCells.has(cellKey(tcY.x, tcY.y))) {
          s.player.y = npy;
        }
      }

      // Сбор сердечек
      for (const heart of s.hearts) {
        if (!heart.collected) {
          const dist = Math.hypot(s.player.x - heart.x, s.player.y - heart.y);
          if (dist < CONFIG.PLAYER_RADIUS + CONFIG.PICKUP_DISTANCE) {
            heart.collected = true;
            s.cellContents.delete(heart.cellKey);
            s.player.lives += CONFIG.LIVES_PER_HEART;
            s.heartsCollected++;
            Sounds.heartcollect();
            // Частицы
            addParticles(heart.x, heart.y, CONFIG.PICKUP_PARTICLES_COUNT, CONFIG.PICKUP_PARTICLES_SPEED, CONFIG.PICKUP_PARTICLES_LIFE, '#ff6b9d');
          }
        }
      }

      // Сбор ключей
      for (const keyObj of s.keyObjs) {
        if (!keyObj.collected) {
          const dist = Math.hypot(s.player.x - keyObj.x, s.player.y - keyObj.y);
          if (dist < CONFIG.PLAYER_RADIUS + CONFIG.PICKUP_DISTANCE) {
            keyObj.collected = true;
            s.cellContents.delete(keyObj.cellKey);
            s.keysCollected++;
            Sounds.keycollect();
            // Частицы
            addParticles(keyObj.x, keyObj.y, CONFIG.PICKUP_PARTICLES_COUNT, CONFIG.PICKUP_PARTICLES_SPEED, CONFIG.PICKUP_PARTICLES_LIFE, '#ffd700');
          }
        }
      }

      // Проверка: все ключи собраны, клетка выхода была открыта/увидена и босс еще не побежден -> готовность к призыву босса
      if (s.keysCollected >= s.keysRequired && s.phase === 'play' && !s.bossDefeated) {
        const ec = s.exitCell;
        const exitRevealed = s.everRevealedCells.has(cellKey(ec.x, ec.y));
        s.bossSummonReady = exitRevealed;
      } else {
        s.bossSummonReady = false;
      }

      // Сбор апгрейдов
      for (const upg of s.upgradeObjs) {
        if (!upg.collected) {
          const dist = Math.hypot(s.player.x - upg.x, s.player.y - upg.y);
          if (dist < CONFIG.PLAYER_RADIUS + CONFIG.PICKUP_DISTANCE) {
            upg.collected = true;
            s.cellContents.delete(upg.cellKey);
            applyUpgrade(s, upg.upgradeType);
            Sounds.upgradecollect();
            // Частицы
            const upgDef = UPGRADE_TYPES.find(u => u.id === upg.upgradeType);
            const color = upgDef ? upgDef.color : '#ffcc00';
            addParticles(upg.x, upg.y, CONFIG.PICKUP_PARTICLES_COUNT, CONFIG.PICKUP_PARTICLES_SPEED, CONFIG.PICKUP_PARTICLES_LIFE, color);
          }
        }
      }

      // Сбор проклятых сундуков
      for (const chest of (s.chestObjs || [])) {
        if (!chest.collected) {
          const dist = Math.hypot(s.player.x - chest.x, s.player.y - chest.y);
          if (dist < CONFIG.PLAYER_RADIUS + CONFIG.PICKUP_DISTANCE) {
            openCursedChoice(s, chest);
            break;
          }
        }
      }

      // Таймер попапа апгрейда
      if (upgradePopupTimer > 0) {
        upgradePopupTimer -= dt;
        if (upgradePopupTimer <= 0) {
          document.getElementById('upgrade-popup').classList.remove('visible');
        }
      }

      // Обновление кулдауна стрельбы и пуль
      s.shootCooldown = Math.max(0, s.shootCooldown - dt);
      s.burstCooldown = Math.max(0, s.burstCooldown - dt);
      // Стреляем если: (1) зажата кнопка и нет кд, или (2) активна очередь карабина
      const weapon = getActiveWeapon(s);
      const isBurstActive = weapon && weapon.burstSize && weapon.burstSize > 1 && s.burstRemaining > 0 && s.burstWeaponId === weapon.id;
      if ((mouseHeld || isBurstActive) && s.shootCooldown <= 0) shoot(s);
      for (let i = s.bullets.length - 1; i >= 0; i--) {
        const b = s.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;

        if (b.life <= 0) {
          Sounds.wallhit();
          addParticles(b.x, b.y, CONFIG.WALL_HIT_PARTICLES_COUNT, CONFIG.WALL_HIT_PARTICLES_SPEED, CONFIG.WALL_HIT_PARTICLES_LIFE, '#88aaff');
          s.bullets.splice(i, 1);
          continue;
        }
        if (!inRoom(b.x, b.y, s.openCells)) {
          if (b.ricochet && !b._ricocheted) {
            b._ricocheted = true;
            const prevX = b.x - b.vx * dt;
            const prevY = b.y - b.vy * dt;
            const xOk = inRoom(b.x, prevY, s.openCells);
            const yOk = inRoom(prevX, b.y, s.openCells);
            if (xOk) { b.vy = -b.vy; b.y = prevY; }
            else if (yOk) { b.vx = -b.vx; b.x = prevX; }
            else { b.vx = -b.vx; b.vy = -b.vy; b.x = prevX; b.y = prevY; }
            b.hitSpiders = undefined;
            Sounds.wallhit();
            addParticles(b.x, b.y, CONFIG.WALL_HIT_PARTICLES_COUNT, CONFIG.WALL_HIT_PARTICLES_SPEED, CONFIG.WALL_HIT_PARTICLES_LIFE, '#22ffdd');
          } else {
            Sounds.wallhit();
            addParticles(b.x, b.y, CONFIG.WALL_HIT_PARTICLES_COUNT, CONFIG.WALL_HIT_PARTICLES_SPEED, CONFIG.WALL_HIT_PARTICLES_LIFE, '#88aaff');
            s.bullets.splice(i, 1);
            continue;
          }
        } else {
          b._ricocheted = false;
        }

        // Попадание в выпущенных (активных) призраков
        let hit = false;
        for (let j = s.activeSpiders.length - 1; j >= 0; j--) {
          const g = s.activeSpiders[j];
          if (b.hitSpiders && b.hitSpiders.has(j)) continue; // уже попадали в этого
          const dist = Math.hypot(b.x - g.x, b.y - g.y);
          if (dist < CONFIG.SPIDER_RADIUS + CONFIG.BULLET_RADIUS) {
            // Усиленное пробитие: пуля пробила врага -> 50% шанс двойного урона следующему
            if (b.hitCount > 0 && s.upgrades.enhancedPierce && b.enhancedPierceActive) {
              b.damage *= 2;
            }
            g.hp -= (b.damage || CONFIG.BULLET_DAMAGE);
            g.hitFlash = CONFIG.ENEMY_HIT_FLASH_DURATION;
            hit = true;
            Sounds.hit();
            addParticles(g.x, g.y, CONFIG.HIT_PARTICLES_COUNT, CONFIG.HIT_PARTICLES_SPEED, CONFIG.HIT_PARTICLES_LIFE, '#44cc22');
            if (g.hp <= 0) {
              spawnCorpse(s.deathCorpses, g, g.radius || CONFIG.SPIDER_RADIUS);
              s.activeSpiders.splice(j, 1);
              for (let k = 0; k < CONFIG.DEATH_PARTICLES_COUNT; k++) {
                const speed = CONFIG.DEATH_PARTICLES_SPEED_MIN + Math.random() * (CONFIG.DEATH_PARTICLES_SPEED_MAX - CONFIG.DEATH_PARTICLES_SPEED_MIN);
                const color = k % 2 === 0 ? '#44cc22' : '#88ff44';
                addParticles(g.x, g.y, 1, speed, CONFIG.DEATH_PARTICLES_LIFE, color);
              }
              // Оружейный разгон: +0.2% за убийство, макс 90%
              if (s.upgrades.killAccel) {
                s.upgrades.killAccelPercent = Math.min(90, s.upgrades.killAccelPercent + 0.1);
                playerProgress.upgrades.killAccelPercent = s.upgrades.killAccelPercent;
              }
              // Распухший: выстрел при смерти в игрока
              if (g.type === 'bloated') {
                const pdx = s.player.x - g.x;
                const pdy = s.player.y - g.y;
                const pdist = Math.hypot(pdx, pdy);
                if (pdist > 0) {
                  s.enemyBullets.push({
                    x: g.x, y: g.y,
                    vx: (pdx / pdist) * CONFIG.BLOATED_DEATH_SHOT_SPEED,
                    vy: (pdy / pdist) * CONFIG.BLOATED_DEATH_SHOT_SPEED,
                    life: 6,
                  });
                }
              }
            }
            // Логика пробития: отслеживаем сколько врагов прошла пуля
            b.hitCount++;
            if (!b.hitSpiders) b.hitSpiders = new Set();
            b.hitSpiders.add(j);
            // Усиленное пробитие: 50% шанс активировать после первого пробития
            if (b.hitCount === 1 && s.upgrades.enhancedPierce && !b.enhancedPierceActive) {
              b.enhancedPierceActive = Math.random() < 0.5;
            }
            // Пуля уничтожается если hitCount > penetrate (0=1 враг, 2=3 врага)
            if (b.hitCount > b.penetrate) {
              s.bullets.splice(i, 1);
              break;
            }
          }
        }
      }

      // Пауки в закрытых комнатах статичны (без анимации движения)
      // Нет обновления позиции для trapped spiders - они стоят на месте

      // Обновление активных пауков
      for (let i = s.activeSpiders.length - 1; i >= 0; i--) {
        const g = s.activeSpiders[i];

        // Hit flash таймер
        if (g.hitFlash > 0) g.hitFlash -= dt;

        // Проверка на застревание (кокон, плевака, бык — могут долго стоять на месте по задумке)
        if (g.type !== 'cocoon' && g.type !== 'plevaka' && g.type !== 'shooter' && g.type !== 'bull') {
          if (g.lastX === undefined) { g.lastX = g.x; g.lastY = g.y; g.stuckTimer = 0; }
          const moved = Math.hypot(g.x - g.lastX, g.y - g.lastY);
          if (moved < 1) {
            g.stuckTimer += dt;
            if (g.stuckTimer >= 5) {
              // Враг застрял на 5 секунд - умирает
              spawnCorpse(s.deathCorpses, g, g.radius || CONFIG.SPIDER_RADIUS);
              s.activeSpiders.splice(i, 1);
              for (let k = 0; k < CONFIG.DEATH_PARTICLES_COUNT; k++) {
                const speed = CONFIG.DEATH_PARTICLES_SPEED_MIN + Math.random() * (CONFIG.DEATH_PARTICLES_SPEED_MAX - CONFIG.DEATH_PARTICLES_SPEED_MIN);
                const color = k % 2 === 0 ? '#44cc22' : '#88ff44';
                addParticles(g.x, g.y, 1, speed, CONFIG.DEATH_PARTICLES_LIFE, color);
              }
              continue;
            }
          } else {
            g.stuckTimer = 0;
            g.lastX = g.x;
            g.lastY = g.y;
          }
        }

        const dx = s.player.x - g.x;
        const dy = s.player.y - g.y;
        const dist = Math.hypot(dx, dy);

        if (g.type === 'plevaka' || g.type === 'shooter') {
          // Плевака: движется к игроку, пока не достигнет дистанцию SHOOTER_STOP_DIST
          
          // Animation update
          if (g.animState !== null) {
            g.animTimer += dt;
            const animConfig = PLEVAKA_ANIMS[g.animState];
            if (animConfig && g.animTimer >= 1 / animConfig.fps) {
              g.animTimer = 0;
              g.animFrame = (g.animFrame + 1) % animConfig.frames;
              // If shoot animation completes, return to idle
              if (g.animState === 'shoot' && g.animFrame === 0) {
                g.animState = 'idle';
                g.animFrame = 0;
              }
            }
          }
          
          if (dist > SHOOTER_STOP_DIST && dist > 0) {
            const spd = CONFIG.SHOOTER_SPEED;
            g.x += (dx / dist) * spd * dt;
            g.y += (dy / dist) * spd * dt;
            // Running animation
            if (g.animState !== null && g.animState !== 'shoot') {
              g.animState = 'run';
            }
          } else {
            // Stopped - idle animation
            if (g.animState !== null && g.animState !== 'shoot') {
              g.animState = 'idle';
            }
          }
          // Стрельба
          if (g.shootCd > 0) g.shootCd -= dt;
          if (dist <= SHOOTER_SHOOT_RANGE && g.shootCd <= 0) {
            g.shootCd = CONFIG.SHOOTER_SHOOT_CD;
            // Start shoot animation
            if (g.animState !== null) {
              g.animState = 'shoot';
              g.animFrame = 0;
              g.animTimer = 0;
            }
            if (dist > 0) {
              s.enemyBullets.push({
                x: g.x, y: g.y,
                vx: (dx / dist) * CONFIG.SHOOTER_BULLET_SPEED,
                vy: (dy / dist) * CONFIG.SHOOTER_BULLET_SPEED,
                life: 6,
              });
            }
          }
        } else if (g.type === 'bull') {
          // Бык: FSM — chase → prepare → dash → rest → chase
          const effectiveRadius = g.radius || CONFIG.BULL_RADIUS;
          const hitDist = effectiveRadius + CONFIG.PLAYER_RADIUS;
          
          if (!g.state) g.state = 'chase';
          if (g.stateTimer === undefined) g.stateTimer = 0;
          
          switch (g.state) {
            case 'chase':
              // Идёт к игроку пока не достигнет дистанции CHARGE_DIST
              if (dist > BULL_CHARGE_DIST && dist > 0) {
                const spd = CONFIG.BULL_SPEED;
                g.x += (dx / dist) * spd * dt;
                g.y += (dy / dist) * spd * dt;
              } else if (dist <= BULL_CHARGE_DIST) {
                // Переход в подготовку
                g.state = 'prepare';
                g.stateTimer = CONFIG.BULL_PREPARE_TIME;
              }
              break;
              
            case 'prepare':
              // Стоит на месте, готовится к рывку
              g.stateTimer -= dt;
              if (g.stateTimer <= 0) {
                // Запоминаем позицию игрока в момент окончания подготовки
                g.state = 'dash';
                const ddx = s.player.x - g.x;
                const ddy = s.player.y - g.y;
                const ddist = Math.hypot(ddx, ddy);
                if (ddist > 0) {
                  g.dashDirX = ddx / ddist;
                  g.dashDirY = ddy / ddist;
                } else {
                  g.dashDirX = dx / dist;
                  g.dashDirY = dy / dist;
                }
                g.dashDistance = BULL_DASH_DISTANCE;
                g.stateTimer = 0; // счётчик пройденной дистанции
              }
              break;
              
            case 'dash':
              // Быстрый рывок
              {
                const dashSpeed = CONFIG.BULL_SPEED * 4; // в 4 раза быстрее обычного
                const moveDist = dashSpeed * dt;
                let newX = g.x + g.dashDirX * moveDist;
                let newY = g.y + g.dashDirY * moveDist;
                
                // Проверяем столкновение со стенами
                const cellX = Math.floor(g.x / CP);
                const cellY = Math.floor(g.y / CP);
                const newCellX = Math.floor(newX / CP);
                const newCellY = Math.floor(newY / CP);
                
                let hitWall = false;
                // Проверяем выход за границы текущей или открытых клеток
                if (!s.openCells.has(cellKey(newCellX, newCellY))) {
                  hitWall = true;
                }
                
                // Проверяем достижение максимальной дистанции рывка
                const moved = Math.hypot(newX - g.x, newY - g.y);
                g.stateTimer += moved;
                
                if (hitWall || g.stateTimer >= g.dashDistance) {
                  // Попали в стену или прошли полную дистанцию — переходим в отдых
                  g.state = 'rest';
                  g.stateTimer = CONFIG.BULL_REST_TIME;
                } else {
                  g.x = newX;
                  g.y = newY;
                }
                
                // Проверяем попадание в игрока во время рывка
                const newDist = Math.hypot(s.player.x - g.x, s.player.y - g.y);
                if (newDist < hitDist) {
                  dealPlayerDamage(s, false);
                  // Бык не исчезает, просто переходит в отдых
                  g.state = 'rest';
                  g.stateTimer = CONFIG.BULL_REST_TIME;
                }
              }
              break;
              
            case 'rest':
              // Отдых — стоит на месте
              g.stateTimer -= dt;
              if (g.stateTimer <= 0) {
                g.state = 'chase';
              }
              break;
          }
          
          // Проверка касания игрока (для состояний chase/rest)
          if (g.state !== 'dash' && dist < hitDist) {
            spawnCorpse(s.deathCorpses, g, g.radius || CONFIG.BULL_RADIUS);
            dealPlayerDamage(s, false);
            s.activeSpiders.splice(i, 1);
            for (let k = 0; k < CONFIG.PLAYER_HIT_PARTICLES_COUNT; k++) {
              const a = Math.random() * Math.PI * 2;
              s.particles.push({
                x: s.player.x, y: s.player.y,
                vx: Math.cos(a) * CONFIG.PLAYER_HIT_PARTICLES_SPEED, vy: Math.sin(a) * CONFIG.PLAYER_HIT_PARTICLES_SPEED,
                life: CONFIG.PLAYER_HIT_PARTICLES_LIFE, maxLife: CONFIG.PLAYER_HIT_PARTICLES_LIFE, color: '#ff4444',
              });
            }
            continue;
          }
        } else if (g.type === 'buldyga') {
          // Булдыга: инерционное движение с нарастающей скоростью
          if (g.currentSpeed === undefined) g.currentSpeed = CONFIG.BULDYGA_SPEED;
          if (g.speedAccumulator === undefined) g.speedAccumulator = 0;
          if (g.vx === undefined) g.vx = 0;
          if (g.vy === undefined) g.vy = 0;

          // Ускорение максимальной скорости каждую секунду
          g.speedAccumulator += dt;
          if (g.speedAccumulator >= 1.0) {
            const secondsPassed = Math.floor(g.speedAccumulator);
            g.currentSpeed += CONFIG.BULDYGA_SPEED_INCREMENT * secondsPassed;
            g.speedAccumulator -= secondsPassed;
          }

          // Инерция: разгоняем vx/vy к целевому направлению, ограничиваем currentSpeed
          if (dist > 0) {
            const targetVx = (dx / dist) * g.currentSpeed;
            const targetVy = (dy / dist) * g.currentSpeed;
            const accel = CONFIG.BULDYGA_ACCEL * dt;
            g.vx += (targetVx - g.vx) * Math.min(1, accel / g.currentSpeed);
            g.vy += (targetVy - g.vy) * Math.min(1, accel / g.currentSpeed);
          } else {
            g.vx *= Math.max(0, 1 - CONFIG.BULDYGA_FRICTION * dt);
            g.vy *= Math.max(0, 1 - CONFIG.BULDYGA_FRICTION * dt);
          }

          let newX = g.x + g.vx * dt;
          let newY = g.y + g.vy * dt;
          // Проверка стен - не выходим за открытые клетки
          const newCellX = Math.floor(newX / CP);
          const newCellY = Math.floor(newY / CP);
          if (s.openCells.has(cellKey(newCellX, newCellY))) {
            g.x = newX;
            g.y = newY;
          } else {
            g.vx *= -0.3;
            g.vy *= -0.3;
          }
          // Касание игрока
          if (dist < (g.radius || CONFIG.BULDYGA_RADIUS) + CONFIG.PLAYER_RADIUS) {
            spawnCorpse(s.deathCorpses, g, g.radius || CONFIG.BULDYGA_RADIUS);
            dealPlayerDamage(s, false);
            s.activeSpiders.splice(i, 1);
            for (let k = 0; k < CONFIG.PLAYER_HIT_PARTICLES_COUNT; k++) {
              const a = Math.random() * Math.PI * 2;
              s.particles.push({
                x: s.player.x, y: s.player.y,
                vx: Math.cos(a) * CONFIG.PLAYER_HIT_PARTICLES_SPEED, vy: Math.sin(a) * CONFIG.PLAYER_HIT_PARTICLES_SPEED,
                life: CONFIG.PLAYER_HIT_PARTICLES_LIFE, maxLife: CONFIG.PLAYER_HIT_PARTICLES_LIFE, color: '#ff4444',
              });
            }
            continue;
          }
        } else if (g.type === 'bloated') {
          // Распухший: как солдат, но взрывается при смерти
          let newX = g.x;
          let newY = g.y;
          if (dist > 0) {
            newX += (dx / dist) * CONFIG.BLOATED_SPEED * dt;
            newY += (dy / dist) * CONFIG.BLOATED_SPEED * dt;
          }
          // Проверка стен
          const newCellX = Math.floor(newX / CP);
          const newCellY = Math.floor(newY / CP);
          if (s.openCells.has(cellKey(newCellX, newCellY))) {
            g.x = newX;
            g.y = newY;
          }
          // Касание игрока
          if (dist < (g.radius || CONFIG.BLOATED_RADIUS) + CONFIG.PLAYER_RADIUS) {
            dealPlayerDamage(s, false);
            s.activeSpiders.splice(i, 1);
            for (let k = 0; k < CONFIG.PLAYER_HIT_PARTICLES_COUNT; k++) {
              const a = Math.random() * Math.PI * 2;
              s.particles.push({
                x: s.player.x, y: s.player.y,
                vx: Math.cos(a) * CONFIG.PLAYER_HIT_PARTICLES_SPEED, vy: Math.sin(a) * CONFIG.PLAYER_HIT_PARTICLES_SPEED,
                life: CONFIG.PLAYER_HIT_PARTICLES_LIFE, maxLife: CONFIG.PLAYER_HIT_PARTICLES_LIFE, color: '#ff4444',
              });
            }
            continue;
          }
        } else if (g.type === 'cocoon') {
          // Кокон: стоит на месте, спавнит солдат
          // Проверка стены - может быть вытолкнут другими врагами
          const cellX = Math.floor(g.x / CP);
          const cellY = Math.floor(g.y / CP);
          if (!s.openCells.has(cellKey(cellX, cellY))) {
            // Вытолкнули в стену - умирает
            s.activeSpiders.splice(i, 1);
            for (let k = 0; k < CONFIG.DEATH_PARTICLES_COUNT; k++) {
              const speed = CONFIG.DEATH_PARTICLES_SPEED_MIN + Math.random() * (CONFIG.DEATH_PARTICLES_SPEED_MAX - CONFIG.DEATH_PARTICLES_SPEED_MIN);
              const color = k % 2 === 0 ? '#44cc22' : '#88ff44';
              addParticles(g.x, g.y, 1, speed, CONFIG.DEATH_PARTICLES_LIFE, color);
            }
            continue;
          }
          if (g.spawnTimer === undefined) g.spawnTimer = CONFIG.COCOON_SPAWN_INTERVAL;
          g.spawnTimer -= dt;
          if (g.spawnTimer <= 0) {
            g.spawnTimer = CONFIG.COCOON_SPAWN_INTERVAL;
            // Спавним солдата рядом с коконом
            const spawnAngle = Math.random() * Math.PI * 2;
            const spawnDist = (g.radius || CONFIG.COCOON_RADIUS) + CONFIG.SPIDER_RADIUS + 5;
            s.activeSpiders.push({
              x: g.x + Math.cos(spawnAngle) * spawnDist,
              y: g.y + Math.sin(spawnAngle) * spawnDist,
              vx: 0, vy: 0,
              radius: CONFIG.SPIDER_RADIUS,
              hp: CONFIG.SPIDER_HP,
              visualScale: CONFIG.SPIDER_VISUAL_SCALE,
              type: 'soldier',
              shootCd: 0,
              state: 'chase',
              stateTimer: 0,
              dashTargetX: 0, dashTargetY: 0,
              dashDirX: 0, dashDirY: 0,
              dashDistance: 0,
              currentSpeed: undefined,
              speedAccumulator: 0,
              spawnTimer: undefined,
            });
          }
        } else {
          // Солдат: летит к игроку
          let newX = g.x;
          let newY = g.y;
          if (dist > 0) {
            newX += (dx / dist) * CONFIG.SPIDER_SPEED * dt;
            newY += (dy / dist) * CONFIG.SPIDER_SPEED * dt;
          }
          // Проверка стен
          const newCellX = Math.floor(newX / CP);
          const newCellY = Math.floor(newY / CP);
          if (s.openCells.has(cellKey(newCellX, newCellY))) {
            g.x = newX;
            g.y = newY;
          }
          // Касание игрока
          if (dist < (g.radius || CONFIG.SPIDER_RADIUS) + CONFIG.PLAYER_RADIUS) {
            spawnCorpse(s.deathCorpses, g, g.radius || CONFIG.SPIDER_RADIUS);
            dealPlayerDamage(s, false);
            s.activeSpiders.splice(i, 1);
            for (let k = 0; k < CONFIG.PLAYER_HIT_PARTICLES_COUNT; k++) {
              const a = Math.random() * Math.PI * 2;
              s.particles.push({
                x: s.player.x, y: s.player.y,
                vx: Math.cos(a) * CONFIG.PLAYER_HIT_PARTICLES_SPEED, vy: Math.sin(a) * CONFIG.PLAYER_HIT_PARTICLES_SPEED,
                life: CONFIG.PLAYER_HIT_PARTICLES_LIFE, maxLife: CONFIG.PLAYER_HIT_PARTICLES_LIFE, color: '#ff4444',
              });
            }
            continue;
          }
        }
      }

      // Обновление вражеских пуль
      for (let i = s.enemyBullets.length - 1; i >= 0; i--) {
        const eb = s.enemyBullets[i];
        eb.x += eb.vx * dt;
        eb.y += eb.vy * dt;
        eb.life -= dt;

        if (!inRoom(eb.x, eb.y, s.openCells) || eb.life <= 0) {
          for (let j = 0; j < 4; j++) {
            const a = Math.random() * Math.PI * 2;
            s.particles.push({
              x: eb.x, y: eb.y,
              vx: Math.cos(a) * 30, vy: Math.sin(a) * 30,
              life: 0.25, maxLife: 0.25, color: '#ff6600',
            });
          }
          s.enemyBullets.splice(i, 1);
          continue;
        }

        // Попадание в игрока
        const pd = Math.hypot(eb.x - s.player.x, eb.y - s.player.y);
        if (pd < CONFIG.PLAYER_RADIUS + CONFIG.BULLET_RADIUS) {
          dealPlayerDamage(s, false);
          s.enemyBullets.splice(i, 1);
          for (let k = 0; k < 8; k++) {
            const a = Math.random() * Math.PI * 2;
            s.particles.push({
              x: s.player.x, y: s.player.y,
              vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
              life: 0.4, maxLife: 0.4, color: '#ff4444',
            });
          }
        }
      }

      // Коллизии между врагами - с учетом реальных радиусов и проверкой стен
      for (let i = 0; i < s.activeSpiders.length; i++) {
        const g1 = s.activeSpiders[i];
        for (let j = i + 1; j < s.activeSpiders.length; j++) {
          const g2 = s.activeSpiders[j];

          const dx = g2.x - g1.x;
          const dy = g2.y - g1.y;
          const distSq = dx * dx + dy * dy;
          // Используем реальные радиусы врагов
          const r1 = g1.radius || CONFIG.SPIDER_RADIUS;
          const r2 = g2.radius || CONFIG.SPIDER_RADIUS;
          const minDist = r1 + r2;

          if (distSq < minDist * minDist && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;

            // Быки и булдыги тяжелее - отталкивают других сильнее
            const isHeavy1 = g1.type === 'bull' || g1.type === 'buldyga';
            const isHeavy2 = g2.type === 'bull' || g2.type === 'buldyga';
            let push1, push2;
            if (isHeavy1 && !isHeavy2) { push1 = 0.3; push2 = 0.7; }
            else if (!isHeavy1 && isHeavy2) { push1 = 0.7; push2 = 0.3; }
            else { push1 = 0.5; push2 = 0.5; }

            const newX1 = g1.x - nx * overlap * push1;
            const newY1 = g1.y - ny * overlap * push1;
            const newX2 = g2.x + nx * overlap * push2;
            const newY2 = g2.y + ny * overlap * push2;

            // Проверяем что новые позиции внутри открытых клеток
            const cell1 = cellOf(newX1, newY1);
            const cell2 = cellOf(newX2, newY2);
            if (s.openCells.has(cellKey(cell1.x, cell1.y))) {
              g1.x = newX1;
              g1.y = newY1;
            }
            if (s.openCells.has(cellKey(cell2.x, cell2.y))) {
              g2.x = newX2;
              g2.y = newY2;
            }
          }
        }
      }

      // Частицы
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
        p.life -= dt;
        if (p.life <= 0) {
          returnParticle(p);
          s.particles.splice(i, 1);
        }
      }

      // Обновление трупов в play режиме
      for (let i = s.deathCorpses.length - 1; i >= 0; i--) {
        s.deathCorpses[i].life -= dt;
        if (s.deathCorpses[i].life <= 0) s.deathCorpses.splice(i, 1);
      }

      // Летящее сердечко
      if (flyingHeart) {
        const fh = flyingHeart;
        // Обновляем цель если есть homing
        if (fh.getTarget) {
          const t = fh.getTarget();
          fh.targetX = t.x;
          fh.targetY = t.y;
        }
        // Движение к текущей цели с постоянной скоростью
        const dx = fh.targetX - fh.x;
        const dy = fh.targetY - fh.y;
        const dist = Math.hypot(dx, dy);
        const speed = dist / Math.max(fh.duration - fh.t, 0.001);
        if (dist < speed * dt || dist < 2) {
          fh.x = fh.targetX;
          fh.y = fh.targetY;
          fh.t = fh.duration;
        } else {
          fh.x += (dx / dist) * speed * dt;
          fh.y += (dy / dist) * speed * dt;
        }
        fh.t += dt;
        if (fh.t >= fh.duration) {
          const cb = fh.onArrive;
          flyingHeart = null;
          if (cb) cb();
        }
      }

      
      // Смерть
      if (s.player.lives <= 0) {
        s.player.lives = 0;
        s.phase = 'dead';
      }
    }

    // ============================================================
    // BOSS HP BAR (screen space, top center)
    // ============================================================
    function drawBossHPBar(s) {
      const b = s.battle;
      if (!b || !b.isBossBattle) return;

      // Find boss
      const boss = b.activeSpiders.find(e => e.isBoss);
      if (!boss) return;

      const barW = 400;
      const barH = 16;
      const x = (VIEW_W - barW) / 2;
      const y = 20;
      const hpPercent = Math.max(0, boss.hp / boss.maxHp);

      ctx.save();

      // Glow effect
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 15;

      // Background
      ctx.fillStyle = 'rgba(30, 10, 10, 0.9)';
      ctx.fillRect(x, y, barW, barH);

      // HP fill - gradient from red to dark red
      const grad = ctx.createLinearGradient(x, y, x + barW * hpPercent, y);
      grad.addColorStop(0, '#ff4444');
      grad.addColorStop(1, '#cc2222');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barW * hpPercent, barH);

      // Border
      ctx.strokeStyle = '#ff6666';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, barW, barH);

      ctx.shadowBlur = 0;

      // HP text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hpText = `${Math.ceil(boss.hp)}/${boss.maxHp}`;
      ctx.fillText(hpText, x + barW / 2, y + barH / 2 + 1);

      // "BOSS" label above bar
      ctx.fillStyle = '#ff6666';
      ctx.font = 'bold 12px "Orbitron", sans-serif';
      ctx.fillText('★ БОСС ★', VIEW_W / 2, y - 10);

      ctx.restore();
    }

    // ============================================================
    // BATTLE DRAW
    // ============================================================
    function drawBattle(s) {
      const b = s.battle;
      if (!b) return;

      beginFrame();

      // Статичная камера battle: всё поле умещается на экране
      const sc = b.staticScale || 1;
      camera.x = b.staticCamX || 0;
      camera.y = b.staticCamY || 0;

      // Apply screen shake in bullet direction
      const shakeX = Math.cos(screenShake.angle) * screenShake.amount;
      const shakeY = Math.sin(screenShake.angle) * screenShake.amount;
      screenShake.amount *= CONFIG.SHAKE_DECAY;
      weaponRecoil *= 0.72;

      // Пересчитываем мировые координаты мыши каждый кадр (battle)
      s.mouse.x = (mouseScreen.x - VIEW_W / 2) / sc + b.width / 2;
      s.mouse.y = (mouseScreen.y - VIEW_H / 2) / sc + b.height / 2;

      ctx.save();
      ctx.translate(VIEW_W / 2 + shakeX, VIEW_H / 2 + shakeY);
      ctx.scale(sc, sc);
      ctx.translate(-b.width / 2, -b.height / 2);

      // Фон battle
      ctx.fillStyle = '#030810';
      ctx.fillRect(0, 0, b.width, b.height);

      // Отрисовка клеток battle
      for (const k of b.openCells) {
        const { x, y } = cellFromKey(k);
        // Позиция в battle-координатах
        const bx = (x - b.cellOffsetX) * BATTLE_CELL_PX;
        const by = (y - b.cellOffsetY) * BATTLE_CELL_PX;

        // Фон клетки
        drawFloorCell(ctx, x, y, BATTLE_CELL_PX, b.openCells, b.cellOffsetX, b.cellOffsetY, currentLevel);

      }

      // Стены по краям открытых клеток (battle)
      drawOpenCellWalls(b.openCells, BATTLE_CELL_PX, BATTLE_CELL_PX * 0.125, b.cellOffsetX, b.cellOffsetY, currentLevel);
      drawOpenCellCorners(b.openCells, BATTLE_CELL_PX, BATTLE_CELL_PX * 0.125, b.cellOffsetX, b.cellOffsetY, currentLevel);

      // Сердечки
      for (const heart of b.hearts) {
        if (heart.collected) continue;
        const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.008);
        ctx.fillStyle = `rgba(255, 107, 157, ${pulse})`;
        ctx.shadowColor = '#ff6b9d';
        ctx.shadowBlur = 15 * BATTLE_SCALE;
        ctx.font = `bold ${24 * BATTLE_SCALE}px "Huninn"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♥', heart.x, heart.y);
        ctx.shadowBlur = 0;
      }

      // Ключи
      for (const keyObj of b.keys) {
        if (keyObj.collected) continue;
        const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.008);
        ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 15 * BATTLE_SCALE;
        ctx.font = `bold ${24 * BATTLE_SCALE}px "Huninn"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔑', keyObj.x, keyObj.y);
        ctx.shadowBlur = 0;
      }

      // Апгрейды
      const allEnemiesDead = b.activeSpiders.length === 0;
      for (const upg of b.upgrades) {
        if (upg.collected) continue;
        const upgDef = UPGRADE_TYPES.find(u => u.id === upg.upgradeType);
        if (upgDef) {
          const pulse = allEnemiesDead ? 0.7 + 0.3 * Math.sin(Date.now() * 0.007) : 1;
          ctx.globalAlpha = pulse;
          ctx.fillStyle = upgDef.color;
          ctx.shadowColor = upgDef.color;
          ctx.shadowBlur = (allEnemiesDead ? 10 + 10 * pulse : 15) * BATTLE_SCALE;
          ctx.font = `bold ${24 * BATTLE_SCALE}px "Huninn"`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(upgDef.icon, upg.x, upg.y);
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      }

      // Проклятые сундуки в battle
      for (const bc of (b.chests || [])) {
        if (bc.collected) continue;
        ctx.globalAlpha = 1;
        ctx.shadowColor = '#cc44ff';
        ctx.shadowBlur = 18 * BATTLE_SCALE;
        if (cursedChestImg.complete && cursedChestImg.naturalWidth > 0) {
          const size = BATTLE_CELL_PX * 0.3;
          ctx.drawImage(cursedChestImg, bc.x - size/2, bc.y - size/2, size, size);
        } else {
          ctx.font = `bold ${26 * BATTLE_SCALE}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📦', bc.x, bc.y);
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // Оружие на полу в battle
      if (b.weapons) {
        for (const bw of b.weapons) {
          if (bw.picked) continue;
          const wDef = WEAPON_DEFS[bw.weaponId];
          if (!wDef) continue;
          const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.007);
          ctx.shadowColor = wDef.color;
          ctx.shadowBlur = 12 * BATTLE_SCALE;
          drawWeaponSprite(ctx, bw.weaponId, bw.x, bw.y - 8 * BATTLE_SCALE, 28 * BATTLE_SCALE, 1, pulse);
          ctx.shadowBlur = 0;
          ctx.font = `bold ${9 * BATTLE_SCALE}px "Huninn"`;
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.9;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(wDef.label, bw.x, bw.y + 12 * BATTLE_SCALE);
          ctx.globalAlpha = 1;
        }
      }

      // Пули игрока
      for (const b of s.battle.bullets) {
        ctx.fillStyle = '#ffffaa';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 8 * BATTLE_SCALE;
        ctx.beginPath();
        ctx.arc(b.x, b.y, CONFIG.BULLET_RADIUS * BATTLE_SCALE, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Вражеские пули
      for (const eb of s.battle.enemyBullets) {
        ctx.fillStyle = '#ff4400';
        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur = 10 * BATTLE_SCALE;
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, 3 * BATTLE_SCALE, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Трупы врагов в battle (фейдаут)
      for (const c of b.deathCorpses) {
        const alpha = Math.max(0, c.life / c.maxLife);
        const isSoldier = c.type === 'soldier' || c.type === 'chaser';
        const isPlevaka = c.type === 'plevaka' || c.type === 'shooter';
        const isBull = c.type === 'bull';
        const isBuldyga = c.type === 'buldyga';
        const isBloated = c.type === 'bloated';
        let img = null;
        if (isSoldier) img = enemyImages.soldier_dead;
        else if (isPlevaka) img = enemyImages.plevaka_dead;
        else if (isBull) img = enemyImages.bull_dead;
        else if (isBuldyga) img = enemyImages.buldyga_dead;
        else if (isBloated) img = enemyImages.bloated_dead;
        if (img) drawEnemySprite(img, c.x, c.y, c.radius / BATTLE_SCALE, alpha, BATTLE_SCALE, 0, false, c.visualScale);
      }

      // Враги в battle (масштабированы)
      for (const g of b.activeSpiders) {
        drawSpider(g, 1, BATTLE_SCALE, true);
      }

      // Частицы
      for (const p of b.particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 * BATTLE_SCALE, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Вылетающие цифры ХП
      for (let i = b.damageNumbers.length - 1; i >= 0; i--) {
        const dn = b.damageNumbers[i];
        const alpha = dn.life / dn.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = dn.color;
        ctx.font = `bold ${8 * BATTLE_SCALE * dn.scale}px "Huninn"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = dn.color;
        ctx.shadowBlur = 4 * BATTLE_SCALE;
        ctx.fillText(dn.text, dn.x, dn.y);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // Игрок в battle
      const p = b.player;
      const HERO_DRAW_SCALE = (CONFIG.PLAYER_SPRITE_RADIUS * 2 * BATTLE_SCALE) / HERO_SW;
      drawPlayerDashTrails(s.player, HERO_DRAW_SCALE);
      if (s.player.isDashing) {
        drawPlayerDashActiveEffect(p.x, p.y, s.player.dashDirX, s.player.dashDirY, BATTLE_SCALE);
      }
      const blinkOk = s.player.invulnerable <= 0 || Math.floor(s.player.invulnerable * 10) % 2 === 0;
      if (blinkOk) {
        drawPlayerSprite(p.x, p.y, HERO_DRAW_SCALE, s.player.isDashing ? 0.9 : undefined);
        const aimAngleBattle = Math.atan2(s.mouse.y - p.y, s.mouse.x - p.x);
        drawPlayerWeapon(p.x, p.y, aimAngleBattle, HERO_DRAW_SCALE);
      }
      drawPlayerDashCooldownIndicator(p.x, p.y, s.player.dashCooldown, BATTLE_SCALE);

      // Индикатор разброса в battle
      if (CONFIG.DEBUG_SPREAD_INDICATOR) {
        const weapon = getActiveWeapon(s);
        if (weapon) {
          let totalSpread = weapon.spread * s.upgrades.spreadMult;
          if (s.upgrades.sniper && s.battle && s.battle.openCells) {
            const roomCount = s.battle.openCells.size;
            if (roomCount <= 2) totalSpread = 0;
            else totalSpread *= (1 + 0.10 * (roomCount - 2));
          }
          const aimA = Math.atan2(s.mouse.y - b.player.y, s.mouse.x - b.player.x);
          const lineLen = (weapon.range != null ? weapon.range * RANGE_SCALE : 150) * BATTLE_SCALE;
          const startOffset = CONFIG.PLAYER_SPRITE_RADIUS * BATTLE_SCALE + 2;
          const halfSpread = totalSpread / 2;
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#aaaaaa';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6 * BATTLE_SCALE, 5 * BATTLE_SCALE]);
          for (const side of [-1, 1]) {
            const a = aimA + side * halfSpread;
            ctx.beginPath();
            ctx.moveTo(b.player.x + Math.cos(a) * startOffset, b.player.y + Math.sin(a) * startOffset);
            ctx.lineTo(b.player.x + Math.cos(a) * (startOffset + lineLen), b.player.y + Math.sin(a) * (startOffset + lineLen));
            ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      ctx.restore();

      // Boss HP bar (screen space, top center)
      if (b.isBossBattle) {
        drawBossHPBar(s);
      }

      // Cooldown bar under cursor (screen space)
      drawCursorCooldownBar(s, mouseScreen.x, mouseScreen.y);

      // Виньетка при малом количестве жизней
      if (s.player.lives === 2) {
        const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H / 3, VIEW_W / 2, VIEW_H / 2, Math.sqrt((VIEW_W) ** 2 + (VIEW_H) ** 2));
        grad.addColorStop(0, 'rgba(255, 120, 0, 0)');
        grad.addColorStop(1, 'rgba(255, 120, 0, 0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      } else if (s.player.lives === 1) {
        const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H / 3, VIEW_W / 2, VIEW_H / 2, Math.sqrt((VIEW_W) ** 2 + (VIEW_H) ** 2));
        grad.addColorStop(0, 'rgba(255, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(255, 0, 0, 0.55)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }

      // Tooltip оружия при наведении (battle mode) — только когда все враги убиты
      if (b.weapons && b.activeSpiders.length === 0) {
        const hoverR = BATTLE_CELL_PX * 0.2;
        for (const bw of b.weapons) {
          if (bw.picked) continue;
          const dist = Math.hypot(s.mouse.x - bw.x, s.mouse.y - bw.y);
          if (dist < hoverR) {
            const wDef = WEAPON_DEFS[bw.weaponId];
            if (wDef) {
              const sx = VIEW_W / 2 + (bw.x - b.width / 2) * sc;
              const sy = VIEW_H / 2 + (bw.y - b.height / 2) * sc;
              drawUpgradeTooltip(sx, sy, wDef);
            }
            break;
          }
        }
      }

      // Tooltip апгрейда при наведении (battle mode) — только когда все враги убиты
      if (b.activeSpiders.length === 0) {
        const hoverR = BATTLE_CELL_PX * 0.2;
        for (const upg of b.upgrades) {
          if (upg.collected) continue;
          const dist = Math.hypot(s.mouse.x - upg.x, s.mouse.y - upg.y);
          if (dist < hoverR) {
            const upgDef = UPGRADE_TYPES.find(u => u.id === upg.upgradeType);
            if (upgDef) {
              const sx = VIEW_W / 2 + (upg.x - b.width / 2) * sc;
              const sy = VIEW_H / 2 + (upg.y - b.height / 2) * sc;
              drawUpgradeTooltip(sx, sy, upgDef);
            }
            break;
          }
        }
      }

      drawHUD(s);

      if (showStatsPanel) {
        drawStatsPanel(s);
      }
    }

    // ============================================================
    // DRAW
    // ============================================================
    function draw(s) {
      beginFrame();

      // Камера всегда центрирована на игроке
      camera.x = s.player.x - VIEW_W / 2;
      camera.y = s.player.y - VIEW_H / 2;
      const worldW = s.gridSize * CP;
      const worldH = s.gridSize * CP;
      // camera.x = Math.max(0, Math.min(camera.x, worldW - VIEW_W));
      // camera.y = Math.max(0, Math.min(camera.y, worldH - VIEW_H));

      // Пересчитываем мировые координаты мыши каждый кадр
      s.mouse.x = mouseScreen.x + camera.x;
      s.mouse.y = mouseScreen.y + camera.y;

      // Кешируем видимые клетки для оптимизации
      const visibleCells = new Set();
      for (let y = 0; y < s.gridSize; y++) {
        for (let x = 0; x < s.gridSize; x++) {
          if (isCellVisible(x, y)) {
            visibleCells.add(cellKey(x, y));
          }
        }
      }

      // Apply screen shake in bullet direction
      const shakeX = Math.cos(screenShake.angle) * screenShake.amount;
      const shakeY = Math.sin(screenShake.angle) * screenShake.amount;
      screenShake.amount *= CONFIG.SHAKE_DECAY;
      weaponRecoil *= 0.72;

      // Фон с параллаксом (рисуем в экранных координатах до world-трансформа)
      if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
        const bgW = backgroundImg.naturalWidth;
        const bgH = backgroundImg.naturalHeight;
        const PARALLAX = 0.20;
        const shiftX = bgW * 0.7;
        const shiftY = bgH * 0.5;
        const offX = ((-camera.x + shakeX) * PARALLAX + shiftX) % bgW;
        const offY = ((-camera.y + shakeY) * PARALLAX + shiftY) % bgH;
        const startX = ((offX % bgW) + bgW) % bgW - bgW * 3;
        const startY = ((offY % bgH) + bgH) % bgH - bgH * 3;
        for (let ty = startY; ty < VIEW_H; ty += bgH) {
          for (let tx = startX; tx < VIEW_W; tx += bgW) {
            ctx.drawImage(backgroundImg, tx, ty, bgW, bgH);
          }
        }
      } else {
        ctx.fillStyle = '#030810';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }

      ctx.save();
      ctx.translate(-camera.x + shakeX, -camera.y + shakeY);

      // Фон игрового поля (поверх фона, под клетками)
      ctx.fillStyle = '#030810';
      ctx.fillRect(0, 0, worldW, worldH);


      // Навсегда закрытые (чёрные) клетки — только те, что смежны с хотя бы одной открытой или everRevealed
      const blackCells = new Set([...s.permanentlyClosed, ...s.disabledCells]);
      for (const k of blackCells) {
        const { x, y } = cellFromKey(k);
        if (!visibleCells.has(k)) continue;
        const revealed = someAdjacentCell(x, y, (nx, ny, nk) => s.everOpenedCells.has(nk));
        if (revealed) {
          if (rockImg.complete && rockImg.naturalWidth > 0) {
            ctx.drawImage(rockImg, x * CP, y * CP, CP, CP);
          } else {
            ctx.fillStyle = '#000000';
            ctx.fillRect(x * CP, y * CP, CP, CP);
          }
        } else {
          if (closedCellImg.complete && closedCellImg.naturalWidth > 0) {
            ctx.drawImage(closedCellImg, x * CP, y * CP, CP, CP);
          } else {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(x * CP, y * CP, CP, CP);
          }
        }
      }

      // Неоткрытые клетки (не исследованные) — рисуем closedcell.png
      for (let y = 0; y < s.gridSize; y++) {
        for (let x = 0; x < s.gridSize; x++) {
          const k = cellKey(x, y);
          // Пропускаем если клетка уже открыта, открывалась ранее, или недоступна
          if (s.openCells.has(k) || s.everRevealedCells.has(k) ||
              s.disabledCells.has(k) || s.permanentlyClosed.has(k)) continue;
          if (!visibleCells.has(k)) continue;
          if (closedCellImg.complete && closedCellImg.naturalWidth > 0) {
            ctx.drawImage(closedCellImg, x * CP, y * CP, CP, CP);
          } else {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(x * CP, y * CP, CP, CP);
          }
        }
      }

      // Открытые клетки
      for (const k of s.openCells) {
        if (!visibleCells.has(k)) continue;
        const { x, y } = cellFromKey(k);
        const isExit = x === s.exitCell.x && y === s.exitCell.y;

        if (isExit) {
          let exitImg;
          if (s.keysCollected >= s.keysRequired && s.bossDefeated) {
            exitImg = openExitImg;
          } else {
            if (currentLevel === 2) exitImg = closedExit2Img;
            else if (currentLevel === 3) exitImg = closedExit3Img;
            else exitImg = closedExit1Img;
          }
          if (exitImg && exitImg.complete && exitImg.naturalWidth > 0) {
            ctx.drawImage(exitImg, x * CP, y * CP, CP, CP);
          } else {
            ctx.fillStyle = `rgba(0,60,20,0.9)`;
            ctx.fillRect(x * CP, y * CP, CP, CP);
          }
        } else {
          drawFloorCell(ctx, x, y, CP, s.openCells, 0, 0, currentLevel);
        }

        if (isExit) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
          ctx.font = 'bold 10px "Huninn"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (s.keysCollected >= s.keysRequired) {
            if (s.bossDefeated) {
              ctx.strokeStyle = `rgba(0,255,100,${0.5 + pulse * 0.5})`;
              ctx.lineWidth = 2;
              ctx.strokeRect(x * CP + 1, y * CP + 1, CP - 2, CP - 2);
              ctx.fillStyle = `rgba(0,255,100,${0.6 + pulse * 0.4})`;
              ctx.fillText('ВЫХОД', (x + 0.5) * CP, (y + 0.5) * CP);
            } else {
              ctx.strokeStyle = `rgba(255,68,0,${0.5 + pulse * 0.5})`;
              ctx.lineWidth = 2;
              ctx.strokeRect(x * CP + 1, y * CP + 1, CP - 2, CP - 2);
              ctx.fillStyle = `rgba(255,68,0,${0.6 + pulse * 0.4})`;
              ctx.fillText('ВЫХОД (БОСС)', (x + 0.5) * CP, (y + 0.5) * CP);
            }
          } else {
            ctx.strokeStyle = `rgba(255,170,0,${0.5 + pulse * 0.5})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(x * CP + 1, y * CP + 1, CP - 2, CP - 2);
            ctx.fillStyle = `rgba(255,170,0,${0.6 + pulse * 0.4})`;
            ctx.fillText(`ВЫХОД (КЛЮЧИ ${s.keysCollected}/${s.keysRequired})`, (x + 0.5) * CP, (y + 0.5) * CP);
          }
        }
      }

      // Смежные закрытые клетки (видно содержимое) — все когда-либо виденные, не открытые и не чёрные
      const adj = new Set();
      for (const k of s.everRevealedCells) {
        if (!s.openCells.has(k) && !s.disabledCells.has(k) && !s.permanentlyClosed.has(k)) adj.add(k);
      }

      // Клетки, смежные с игроком — доступны для открытия (ПКМ), подсвечиваем зелёным
      const playerCellForDraw = cellOf(s.player.x, s.player.y);
      const playerAdjOpen = new Set();
      for (const [ddx, ddy] of CARDINAL_DIRECTIONS) {
        const nx = playerCellForDraw.x + ddx, ny = playerCellForDraw.y + ddy;
        const nk = cellKey(nx, ny);
        if (nx >= 0 && nx < s.gridSize && ny >= 0 && ny < s.gridSize &&
            !s.openCells.has(nk) && !s.disabledCells.has(nk) && !s.permanentlyClosed.has(nk)) {
          playerAdjOpen.add(nk);
        }
      }

      const hoveredCell = cellOf(s.mouse.x, s.mouse.y);
      const hoveredKey = cellKey(hoveredCell.x, hoveredCell.y);

      // Подсветка смежных клеток — рисуем ДО стен, чтобы текстуры стен перекрывали тинт
      for (const k of adj) {
        if (!visibleCells.has(k)) continue;
        const { x, y } = cellFromKey(k);
        if (x < 0 || x >= s.gridSize || y < 0 || y >= s.gridSize) continue;
        if (playerAdjOpen.has(k)) {
          if (k === hoveredKey) {
            ctx.fillStyle = 'rgba(80,220,120,0.25)';
          } else {
            ctx.fillStyle = 'rgba(45,138,69,0.15)';
          }
          ctx.fillRect(x * CP + 1, y * CP + 1, CP - 2, CP - 2);
        } else {
          ctx.fillStyle = 'rgba(40,30,50,0.3)';
          ctx.fillRect(x * CP + 1, y * CP + 1, CP - 2, CP - 2);
        }
      }

      // Зелёная подсветка клеток у игрока, не попавших в adj (ещё не в everRevealedCells)
      for (const k of playerAdjOpen) {
        if (adj.has(k)) continue;
        if (!visibleCells.has(k)) continue;
        const { x, y } = cellFromKey(k);
        if (x < 0 || x >= s.gridSize || y < 0 || y >= s.gridSize) continue;
        ctx.fillStyle = 'rgba(20,60,30,0.15)';
        ctx.fillRect(x * CP + 1, y * CP + 1, CP - 2, CP - 2);
      }

      // Стены по краям открытых клеток
      drawOpenCellWalls(s.openCells, CP, CP * 0.125, 0, 0, currentLevel);
      drawOpenCellCorners(s.openCells, CP, CP * 0.125, 0, 0, currentLevel);

      // Пауки в закрытых комнатах (видны)
      for (const g of s.spiders) {
        if (!g.trapped) continue;
        const gc = cellOf(g.x, g.y);
        const cellKey_gc = cellKey(gc.x, gc.y);
        // Видны если клетка когда-либо была смежной с открытой И сейчас видна
        if (!s.everRevealedCells.has(cellKey_gc) || !visibleCells.has(cellKey_gc)) continue;

        drawSpider(g, 1); // Непрозрачные, статичны
      }

      for (const k of adj) {
        if (!visibleCells.has(k)) continue;
        const { x, y } = cellFromKey(k);
        if (x < 0 || x >= s.gridSize || y < 0 || y >= s.gridSize) continue;

        // Показываем содержимое
        const isExitCell = x === s.exitCell.x && y === s.exitCell.y;
        if (isExitCell) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
          ctx.font = 'bold 11px "Huninn"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (s.keysCollected >= s.keysRequired) {
            if (s.bossDefeated) {
              ctx.fillStyle = `rgba(0,255,100,${0.6 + pulse * 0.4})`;
              ctx.fillText('ВЫХОД', (x + 0.5) * CP, (y + 0.5) * CP);
            } else {
              ctx.fillStyle = `rgba(255,68,0,${0.6 + pulse * 0.4})`;
              ctx.fillText('ВЫХОД (БОСС)', (x + 0.5) * CP, (y + 0.5) * CP);
            }
          } else {
            ctx.fillStyle = `rgba(255,170,0,${0.6 + pulse * 0.4})`;
            ctx.fillText('ВЫХОД (ЗАКРЫТ)', (x + 0.5) * CP, (y + 0.5) * CP);
          }
        }

        const content = s.cellContents.get(k);
        if (content) {
          if (content.type === 'heart') {
            // Рисуем сердечко
            const hx = (x + 0.5) * CP;
            const hy = (y + 0.5) * CP;
            const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.008);
            ctx.fillStyle = `rgba(255, 107, 157, ${pulse})`;
            ctx.shadowColor = '#ff6b9d';
            ctx.shadowBlur = 15;
            ctx.font = 'bold 20px "Huninn"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('♥', hx, hy);
            ctx.shadowBlur = 0;
            // } else if (content.type === 'enemies') {
            //   // Рисуем индикатор врагов
            //   ctx.fillStyle = 'rgba(176, 96, 255, 0.6)';
            //   ctx.font = 'bold 14px "Huninn"';
            //   ctx.textAlign = 'center';
            //   ctx.textBaseline = 'middle';
            //   ctx.fillText(`${content.enemyCount}👻`, (x+0.5)*CP, (y+0.5)*CP);
          } else if (content.type === 'key') {
            // Рисуем ключик
            const hx = (x + 0.5) * CP;
            const hy = (y + 0.5) * CP;
            const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.008);
            ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 15;
            ctx.font = 'bold 20px "Huninn"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔑', hx, hy);
            ctx.shadowBlur = 0;
          } else if (content.type === 'upgrade') {
            const hx = (x + 0.5) * CP;
            const hy = (y + 0.5) * CP;
            const upgDef = UPGRADE_TYPES.find(u => u.id === content.upgradeType);
            if (upgDef) {
              ctx.fillStyle = upgDef.color;
              ctx.shadowColor = upgDef.color;
              ctx.shadowBlur = 10;
              ctx.font = 'bold 32px "Huninn"';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(upgDef.icon, hx, hy);
              ctx.shadowBlur = 0;
            }
          }
        }

        // Оружие в закрытых смежных клетках (видно через стены)
        for (const dw of s.droppedWeapons) {
          const wc = cellOf(dw.x, dw.y);
          if (cellKey(wc.x, wc.y) !== k) continue;
          const wDef = WEAPON_DEFS[dw.weaponId];
          if (!wDef) continue;
          const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.007);
          ctx.shadowColor = wDef.color;
          ctx.shadowBlur = 12;
          drawWeaponSprite(ctx, dw.weaponId, dw.x, dw.y - 8, 28, 0.7, pulse);
          ctx.shadowBlur = 0;
          ctx.font = 'bold 9px "Huninn"';
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.6;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(wDef.label, dw.x, dw.y + 8);
          ctx.globalAlpha = 1;
        }
      }

      // Сердечки в открытых клетках
      for (const heart of s.hearts) {
        if (heart.collected) continue;
        const hc = cellOf(heart.x, heart.y);
        const heartCellKey = cellKey(hc.x, hc.y);
        if (!s.openCells.has(heartCellKey) || !visibleCells.has(heartCellKey)) continue;

        const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.008);
        ctx.fillStyle = `rgba(255, 107, 157, ${pulse})`;
        ctx.shadowColor = '#ff6b9d';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 24px "Huninn"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♥', heart.x, heart.y);
        ctx.shadowBlur = 0;
      }

      // Ключи в открытых клетках
      for (const keyObj of s.keyObjs) {
        if (keyObj.collected) continue;
        const kc = cellOf(keyObj.x, keyObj.y);
        const keyCellKey = cellKey(kc.x, kc.y);
        if (!s.openCells.has(keyCellKey) || !visibleCells.has(keyCellKey)) continue;

        const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.008);
        ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 24px "Huninn"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔑', keyObj.x, keyObj.y);
        ctx.shadowBlur = 0;
      }

      // Апгрейды в открытых клетках
      for (const upg of s.upgradeObjs) {
        if (upg.collected) continue;
        const uc = cellOf(upg.x, upg.y);
        const upgCellKey = cellKey(uc.x, uc.y);
        if (!s.openCells.has(upgCellKey) || !visibleCells.has(upgCellKey)) continue;

        const upgDef = UPGRADE_TYPES.find(u => u.id === upg.upgradeType);
        if (upgDef) {
          ctx.fillStyle = upgDef.color;
          ctx.shadowColor = upgDef.color;
          ctx.shadowBlur = 15;
          ctx.font = 'bold 36px "Huninn"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(upgDef.icon, upg.x, upg.y);
          ctx.shadowBlur = 0;
        }
      }

      // Проклятые сундуки (видны в открытых И в revealed-клетках)
      for (const chest of (s.chestObjs || [])) {
        if (chest.collected) continue;
        const cc = cellOf(chest.x, chest.y);
        const ck = cellKey(cc.x, cc.y);
        if (!visibleCells.has(ck)) continue;
        const isOpen = s.openCells.has(ck);
        const isRevealed = s.everRevealedCells.has(ck);
        if (!isOpen && !isRevealed) continue;
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#cc44ff';
        ctx.shadowBlur = isOpen ? 18 : 8;
        if (cursedChestImg.complete && cursedChestImg.naturalWidth > 0) {
          ctx.drawImage(cursedChestImg, chest.x - CP*0.15, chest.y - CP*0.15, CP*0.3, CP*0.3);
        } else {
          ctx.font = 'bold 26px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📦', chest.x, chest.y);
        }
        ctx.shadowBlur = 0;
      }

      // Оружие на полу
      for (const dw of s.droppedWeapons) {
        const wc = cellOf(dw.x, dw.y);
        const weaponCellKey = cellKey(wc.x, wc.y);
        if (!s.openCells.has(weaponCellKey) || !visibleCells.has(weaponCellKey)) continue;
        const wDef = WEAPON_DEFS[dw.weaponId];
        if (!wDef) continue;
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.007);
        ctx.shadowColor = wDef.color;
        ctx.shadowBlur = 12;
        drawWeaponSprite(ctx, dw.weaponId, dw.x, dw.y - 8, 28, 1, pulse);
        ctx.shadowBlur = 0;
        ctx.font = 'bold 9px "Huninn"';
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(wDef.label, dw.x, dw.y + 8);
        ctx.globalAlpha = 1;
      }

      // Пули игрока
      for (const b of s.bullets) {
        ctx.fillStyle = '#ffffaa';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(b.x, b.y, CONFIG.BULLET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Вражеские пули
      for (const eb of s.enemyBullets) {
        ctx.fillStyle = '#ff4400';
        ctx.shadowColor = '#ff2200';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Трупы врагов в play режиме (фейдаут)
      for (const c of s.deathCorpses) {
        const alpha = Math.max(0, c.life / c.maxLife);
        const isSoldier = c.type === 'soldier' || c.type === 'chaser';
        const isPlevaka = c.type === 'plevaka' || c.type === 'shooter';
        const isBull = c.type === 'bull';
        const isBuldyga = c.type === 'buldyga';
        const isBloated = c.type === 'bloated';
        let img = null;
        if (isSoldier) img = enemyImages.soldier_dead;
        else if (isPlevaka) img = enemyImages.plevaka_dead;
        else if (isBull) img = enemyImages.bull_dead;
        else if (isBuldyga) img = enemyImages.buldyga_dead;
        else if (isBloated) img = enemyImages.bloated_dead;
        if (img) drawEnemySprite(img, c.x, c.y, c.radius, alpha, 1, 0, false, c.visualScale);
      }

      // Активные пауки (выпущенные)
      for (const g of s.activeSpiders) {
        drawSpider(g, 1);
      }

      // Частицы
      for (const p of s.particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Летящее сердечко (поверх всего в мировых координатах)
      drawFlyingHeartInWorld();

      // Игрок
      const p = s.player;
      const HERO_DRAW_SCALE = (CONFIG.PLAYER_SPRITE_RADIUS * 2) / HERO_SW;
      drawPlayerDashTrails(p, HERO_DRAW_SCALE);
      if (p.isDashing) {
        drawPlayerDashActiveEffect(p.x, p.y, p.dashDirX, p.dashDirY, 1);
      }
      const blinkOk = s.player.invulnerable <= 0 || Math.floor(s.player.invulnerable * 10) % 2 === 0;
      if (blinkOk) {
        drawPlayerSprite(p.x, p.y, HERO_DRAW_SCALE, p.isDashing ? 0.9 : undefined);
        const aimAngleWorld = Math.atan2(s.mouse.y - p.y, s.mouse.x - p.x);
        drawPlayerWeapon(p.x, p.y, aimAngleWorld, HERO_DRAW_SCALE);
      }
      drawPlayerDashCooldownIndicator(p.x, p.y, p.dashCooldown, 1);

      // Индикатор разброса: две полупрозрачных линии от игрока
      if (CONFIG.DEBUG_SPREAD_INDICATOR) {
        const weapon = getActiveWeapon(s);
        if (weapon) {
          let totalSpread = weapon.spread * s.upgrades.spreadMult;
          if (s.upgrades.sniper && s.battle && s.battle.openCells) {
            const roomCount = s.battle.openCells.size;
            if (roomCount <= 2) totalSpread = 0;
            else totalSpread *= (1 + 0.10 * (roomCount - 2));
          }
          const aimA = Math.atan2(s.mouse.y - s.player.y, s.mouse.x - s.player.x);
          const lineLen = (weapon.range != null ? weapon.range * RANGE_SCALE : 150);
          const startOffset = CONFIG.PLAYER_SPRITE_RADIUS + 2;
          const halfSpread = totalSpread / 2;
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#aaaaaa';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 5]);
          for (const side of [-1, 1]) {
            const a = aimA + side * halfSpread;
            ctx.beginPath();
            ctx.moveTo(s.player.x + Math.cos(a) * startOffset, s.player.y + Math.sin(a) * startOffset);
            ctx.lineTo(s.player.x + Math.cos(a) * (startOffset + lineLen), s.player.y + Math.sin(a) * (startOffset + lineLen));
            ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      ctx.restore();

      // Cooldown bar under cursor (screen space)
      drawCursorCooldownBar(s, mouseScreen.x, mouseScreen.y);

      // Виньетка при малом количестве жизней
      if (s.player.lives === 2) {
        const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H / 3, VIEW_W / 2, VIEW_H / 2, Math.sqrt((VIEW_W) ** 2 + (VIEW_H) ** 2));
        grad.addColorStop(0, 'rgba(255, 120, 0, 0)');
        grad.addColorStop(1, 'rgba(255, 120, 0, 0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      } else if (s.player.lives === 1) {
        const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H / 3, VIEW_W / 2, VIEW_H / 2, Math.sqrt((VIEW_W) ** 2 + (VIEW_H) ** 2));
        grad.addColorStop(0, 'rgba(255, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(255, 0, 0, 0.55)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }

      // Interact hint (F key prompt)
      {
        const px = s.player.x, py = s.player.y;
        const ec = s.exitCell;
        const onExit = s.openCells.has(cellKey(ec.x, ec.y)) &&
          px > ec.x * CP && px < (ec.x + 1) * CP &&
          py > ec.y * CP && py < (ec.y + 1) * CP &&
          s.keysCollected >= s.keysRequired;
        let nearWeapon = false;
        for (const dw of s.droppedWeapons) {
          const wc = cellOf(dw.x, dw.y);
          if (!s.openCells.has(cellKey(wc.x, wc.y))) continue;
          if (Math.hypot(px - dw.x, py - dw.y) < CONFIG.PLAYER_RADIUS + CONFIG.WEAPON_PICKUP_DISTANCE) { nearWeapon = true; break; }
        }
        if (onExit || nearWeapon) {
          const text = 'F';
          const bx = VIEW_W / 2;
          const by = VIEW_H - 36;
          ctx.save();
          ctx.font = 'bold 13px "Huninn"';
          const tw = 50;
          const pad = 10;
          const bw = tw + pad * 2 + 28;
          const bh = 28;
          ctx.fillStyle = 'rgba(5, 12, 22, 0.88)';
          ctx.strokeStyle = '#00d4ff';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = '#00d4ff';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 4);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(0, 212, 255, 0.45)';
          const keySize = 18;
          const kx = bx - bw / 2 + pad;
          const ky = by - keySize / 2;
          ctx.beginPath();
          ctx.roundRect(kx, ky, keySize, keySize, 3);
          ctx.fill();
          ctx.strokeStyle = '#00d4ff';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#00d4ff';
          ctx.font = 'bold 12px "Huninn"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('F', kx + keySize / 2, by);
          ctx.fillStyle = 'rgba(160, 200, 224, 0.9)';
          ctx.font = '11px "Huninn"';
          ctx.textAlign = 'left';
          ctx.fillText(onExit ? 'Выход' : 'Подобрать', kx + keySize + 6, by);
          ctx.restore();
        }
      }

      // Boss summon hint (space key prompt) - shows when all keys collected and on exit
      if (s.bossSummonReady) {
        const bx = VIEW_W / 2;
        const by = VIEW_H - 70;
        ctx.save();
        ctx.font = 'bold 13px "Huninn"';
        const tw = 130;
        const pad = 10;
        const bw = tw + pad * 2 + 28;
        const bh = 28;
        ctx.fillStyle = 'rgba(5, 12, 22, 0.88)';
        ctx.strokeStyle = '#ff4400';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 4);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 68, 0, 0.45)';
        const keySize = 18;
        const kx = bx - bw / 2 + pad;
        const ky = by - keySize / 2;
        ctx.beginPath();
        ctx.roundRect(kx, ky, keySize * 3, keySize, 3);
        ctx.fill();
        ctx.strokeStyle = '#ff4400';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "Huninn"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ПРОБЕЛ', kx + keySize * 1.5, by);
        ctx.fillStyle = 'rgba(255, 160, 160, 0.9)';
        ctx.font = '11px "Huninn"';
        ctx.textAlign = 'left';
        ctx.fillText('Призвать босса', kx + keySize + 50, by);
        ctx.restore();
      }

      // Tooltip оружия при наведении (play mode)
      for (const dw of s.droppedWeapons) {
        const wc = cellOf(dw.x, dw.y);
        const wck = cellKey(wc.x, wc.y);
        if (!s.everRevealedCells.has(wck) || !visibleCells.has(wck)) continue;
        const dist = Math.hypot(s.mouse.x - dw.x, s.mouse.y - dw.y);
        if (dist < CP * 0.2) {
          const wDef = WEAPON_DEFS[dw.weaponId];
          if (wDef) {
            const sx = dw.x - camera.x;
            const sy = dw.y - camera.y;
            drawUpgradeTooltip(sx, sy, wDef);
          }
          break;
        }
      }

      // Tooltip апгрейда при наведении (play mode, экранные координаты)
      for (const upg of s.upgradeObjs) {
        if (upg.collected) continue;
        const uc = cellOf(upg.x, upg.y);
        const upgCk = cellKey(uc.x, uc.y);
        if (!s.everRevealedCells.has(upgCk)) continue;
        const dist = Math.hypot(s.mouse.x - upg.x, s.mouse.y - upg.y);
        if (dist < CP * 0.2) {
          const upgDef = UPGRADE_TYPES.find(u => u.id === upg.upgradeType);
          if (upgDef) {
            const sx = upg.x - camera.x;
            const sy = upg.y - camera.y;
            drawUpgradeTooltip(sx, sy, upgDef);
          }
          break;
        }
      }

      drawHUD(s);

      if (showStatsPanel) {
        drawStatsPanel(s);
      }
    }

    function drawStatsPanel(s) {
      const panelW = 280;
      const lineH = 22;
      const pad = 16;
      const weapon = getActiveWeapon(s);
      
      // Расчет точности с учетом снайпера
      let totalSpread = (weapon?.spread || 0) * (s.upgrades.spreadMult || 1);
      if (s.upgrades.sniper && s.battle && s.battle.openCells) {
        const roomCount = s.battle.openCells.size;
        if (roomCount <= 2) {
          totalSpread = 0; // Максимальная точность при 2 комнатах или меньше
        } else {
          const extraRooms = roomCount - 2;
          totalSpread *= (1 + 0.10 * extraRooms); // +10% разброса за каждую дополнительную комнату
        }
      }
      const spreadDeg = Math.round(totalSpread * (180 / Math.PI));
      
      // Расчет дальности с учетом дальнобойщика
      let baseRange = weapon?.range || CONFIG.BULLET_LIFE;
      if (s.upgrades.longRange && s.battle && s.battle.openCells) {
        const roomCount = s.battle.openCells.size;
        baseRange = Math.round(baseRange * (1 + 0.20 * roomCount));
      }
      
      const rows = [
        { label: 'ЖИЗНИ', value: `${s.player.lives}`, color: '#ff4444' },
        { label: 'СКОРОСТЬ БЕГА', value: `${Math.round(CONFIG.PLAYER_SPEED * s.upgrades.speedMult)}`, color: '#44ff88' },
        { label: 'УРОН ПУЛИ', value: `${(weapon?.damage || CONFIG.BULLET_DAMAGE) + s.upgrades.damage}`, color: '#ff8800' },
        { label: 'ПУЛЬ ЗА ВЫСТРЕЛ', value: `${(weapon?.pellets || 1) + s.upgrades.pellets}`, color: '#00d4ff' },
        { label: 'ТОЧНОСТЬ', value: spreadDeg === 0 ? 'Идеальная' : `±${spreadDeg}°`, color: '#ff66aa' },
        { label: 'ДАЛЬНОСТЬ ПУЛИ', value: `${baseRange}`, color: '#88ff44' },
        { label: 'ПРОБИТИЕ ВРАГОВ', value: `${(weapon?.penetrate || 0) + s.upgrades.penetrate}`, color: '#aa44ff' },
        { label: 'СКОРОСТЬ ПУЛИ', value: `${Math.round((weapon?.bulletSpeed || CONFIG.BULLET_SPEED) * s.upgrades.bulletSpeedMult)}`, color: '#ffff44' },
        { label: 'ПЕРЕЗАРЯДКА', value: `${((weapon?.cooldown || 0.35) * s.upgrades.cooldownMult).toFixed(2)}с`, color: '#00ccff' },
        { label: 'ШАНС КРИТА', value: `${Math.round(s.upgrades.critChance * 100)}%`, color: '#ff0000' },
      ];

      if (s.upgrades.shield > 0) rows.push({ label: 'ЩИТЫ', value: `${s.upgrades.shield}`, color: '#00aaff' });
      if (s.upgrades.killAccel) rows.push({ label: 'РАЗГОН ПЕРЕЗАРЯДКИ', value: `${s.upgrades.killAccelPercent.toFixed(1)}%`, color: '#ff8800' });

      const panelH = pad * 2 + rows.length * lineH + 24;
      const panelX = (VIEW_W - panelW) / 2;
      const panelY = (VIEW_H - panelH) / 2;

      ctx.save();
      ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);

      // Background
      ctx.shadowBlur = 30;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.fillStyle = 'rgba(8,12,20,0.95)';
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 12);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = 'rgba(0,212,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 12);
      ctx.stroke();

      // Title
      ctx.font = 'bold 16px "Orbitron", sans-serif';
      ctx.fillStyle = '#00d4ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('ХАРАКТЕРИСТИКИ', panelX + panelW / 2, panelY + pad);

      // Rows
      let y = panelY + pad + 28;
      for (const row of rows) {
        ctx.font = '12px "Huninn"';
        ctx.fillStyle = 'rgba(140,160,180,0.8)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(row.label, panelX + pad, y);

        ctx.font = 'bold 14px "Orbitron", sans-serif';
        ctx.fillStyle = row.color;
        ctx.textAlign = 'right';
        ctx.fillText(row.value, panelX + panelW - pad, y);

        y += lineH;
      }

      ctx.restore();
    }

    function drawUpgradeTooltip(screenX, screenY, upgDef) {
      const label = upgDef.label;
      const desc = upgDef.description || '';
      const color = upgDef.color;
      const pad = 10;
      const lineGap = 6;
      ctx.font = 'bold 13px "Huninn"';
      const labelW = ctx.measureText(label).width;
      ctx.font = '11px "Huninn"';
      const descW = ctx.measureText(desc).width;
      const boxW = Math.max(labelW, descW) + pad * 2;
      const boxH = 13 + lineGap + 11 + pad * 2;
      let tx = screenX + 18;
      let ty = screenY - boxH / 2;
      if (tx + boxW > VIEW_W - 4) tx = screenX - boxW - 10;
      if (ty < 4) ty = 4;
      if (ty + boxH > VIEW_H - 4) ty = VIEW_H - 4 - boxH;
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(5, 12, 22, 0.93)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(tx, ty, boxW, boxH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      ctx.font = 'bold 13px "Huninn"';
      ctx.fillText(label, tx + pad, ty + pad);
      ctx.fillStyle = 'rgba(200,220,240,0.85)';
      ctx.font = '11px "Huninn"';
      ctx.fillText(desc, tx + pad, ty + pad + 13 + lineGap);
      ctx.restore();
    }

    function getPlayerWorldPos() {
      if (state.phase === 'battle' && state.battle) {
        return { x: state.battle.player.x, y: state.battle.player.y };
      }
      if (state.player) return { x: state.player.x, y: state.player.y };
      return null;
    }

    function bullArrowPath(len, w, headLen) {
      const shaftEnd = len - headLen;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(shaftEnd, -w * 0.35);
      ctx.lineTo(shaftEnd, -w * 0.65);
      ctx.lineTo(len, 0);
      ctx.lineTo(shaftEnd, w * 0.65);
      ctx.lineTo(shaftEnd, w * 0.35);
      ctx.closePath();
    }

    function drawBullChargeTelegraph(g, r, scale, alpha) {
      const player = getPlayerWorldPos();
      if (!player) return;

      const dx = player.x - g.x;
      const dy = player.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) return;

      const dirX = dx / dist;
      const dirY = dy / dist;
      const angle = Math.atan2(dirY, dirX);
      const fill = Math.max(0, Math.min(1, 1 - (g.stateTimer || 0) / CONFIG.BULL_PREPARE_TIME));

      const arrowScale = 1 / 5;
      const arrowLen = r * 2.4 * scale * arrowScale;
      const arrowW = r * 0.75 * scale * arrowScale;
      const headLen = arrowLen * 0.38;
      const origin = r * 0.55 * arrowScale;

      ctx.save();
      ctx.translate(g.x + dirX * origin, g.y + dirY * origin);
      ctx.rotate(angle);
      ctx.globalAlpha = alpha;

      bullArrowPath(arrowLen, arrowW, headLen);
      ctx.strokeStyle = 'rgba(255, 210, 60, 0.45)';
      ctx.lineWidth = Math.max(0.5, 1.5 * scale * arrowScale);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, -arrowW, arrowLen * fill, arrowW * 2);
      ctx.clip();
      ctx.fillStyle = fill >= 0.95 ? '#ff5533' : '#ffdd44';
      ctx.shadowColor = fill >= 0.95 ? '#ff2200' : '#ffaa00';
      ctx.shadowBlur = 10 * scale * arrowScale;
      bullArrowPath(arrowLen, arrowW, headLen);
      ctx.fill();
      ctx.restore();

      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Helper: draw enemy sprite (500x500px images)
    function drawEnemySprite(img, x, y, radius, alpha, scale, hitFlash, flip = false, visualScale = 3.2, spriteSheet = null, animConfig = null, animState = null, animFrame = 0) {
      if (!img || !img.complete || img.naturalWidth === 0) return false;
      const drawSize = radius * visualScale * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (flip) {
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.translate(-drawSize / 2, -drawSize / 2);
      } else {
        ctx.translate(x - drawSize / 2, y - drawSize / 2);
      }
      
      // Calculate source coordinates for sprite sheet animation
      let sourceX = 0, sourceY = 0, sourceW = img.naturalWidth, sourceH = img.naturalHeight;
      if (spriteSheet && animConfig && animState && animConfig[animState]) {
        const config = animConfig[animState];
        sourceX = animFrame * PLEVAKA_SW;
        sourceY = config.row * PLEVAKA_SH;
        sourceW = PLEVAKA_SW;
        sourceH = PLEVAKA_SH;
      }
      
      if (hitFlash > 0) {
        const sz = Math.ceil(drawSize);
        if (_hitFlashCanvas.width < sz) _hitFlashCanvas.width = sz;
        if (_hitFlashCanvas.height < sz) _hitFlashCanvas.height = sz;
        _hitFlashCtx.clearRect(0, 0, sz, sz);
        _hitFlashCtx.drawImage(spriteSheet || img, sourceX, sourceY, sourceW, sourceH, 0, 0, sz, sz);
        _hitFlashCtx.globalCompositeOperation = 'source-atop';
        _hitFlashCtx.globalAlpha = Math.min(1, hitFlash / CONFIG.ENEMY_HIT_FLASH_DURATION);
        _hitFlashCtx.fillStyle = '#ffffff';
        _hitFlashCtx.fillRect(0, 0, sz, sz);
        _hitFlashCtx.globalCompositeOperation = 'source-over';
        _hitFlashCtx.globalAlpha = 1;
        ctx.drawImage(_hitFlashCanvas, 0, 0, sz, sz, 0, 0, drawSize, drawSize);
      } else {
        ctx.drawImage(spriteSheet || img, sourceX, sourceY, sourceW, sourceH, 0, 0, drawSize, drawSize);
      }
      ctx.restore();
      return true;
    }

    function drawSpider(g, baseAlpha, scale = 1, skipVisibilityCheck = false) {
      const spiderRadius = (g.radius || CONFIG.SPIDER_RADIUS) * scale;
      if (!skipVisibilityCheck && (g.x + spiderRadius < camera.x || g.x - spiderRadius > camera.x + VIEW_W ||
        g.y + spiderRadius < camera.y || g.y - spiderRadius > camera.y + VIEW_H)) return;

      const r = spiderRadius;
      const alpha = baseAlpha;

      const isPlevaka = g.type === 'plevaka' || g.type === 'shooter';
      const isBull = g.type === 'bull';
      const isBuldyga = g.type === 'buldyga';
      const isBossPhase = g.type === 'boss_phase';
      const isSoldier = g.type === 'soldier' || g.type === 'chaser';
      const isCocoon = g.type === 'cocoon';
      const isBloated = g.type === 'bloated';
      const hasSprite = isBull || isBuldyga || isPlevaka || isSoldier || isBloated || isBossPhase;
      ctx.globalAlpha = alpha;

      // Calculate flip: player left of enemy -> flip sprite (not for cocoon, only in battle)
      const flipSprite = !isCocoon && state.phase === 'battle' && state.battle && state.battle.player.x < g.x;

      // Draw sprite for enemies with images (bull, buldyga, plevaka, soldier, bloated)
      if (hasSprite) {
        let img = null;
        if (isBossPhase) {
          const bd = BOSS_DEFS[currentLevel] || BOSS_DEFS[1];
          const firstPhase = bd.phases[0];
          if (firstPhase.id === 'bull_limited') img = enemyImages.bull;
          else if (firstPhase.id === 'buldyga') img = enemyImages.buldyga;
          else if (firstPhase.id === 'shooter') img = enemyImages.plevaka;
          else img = enemyImages.soldier;
        } else if (isBull) img = enemyImages.bull;
        else if (isBuldyga) img = enemyImages.buldyga;
        else if (isPlevaka) img = enemyImages.plevaka;
        else if (isSoldier) img = enemyImages.soldier;
        else if (isBloated) img = enemyImages.bloated;

        // Light glow under sprite
        const glowRadius = r * 1.5;
        const glowGradient = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, glowRadius);
        glowGradient.addColorStop(0, 'rgba(255, 255, 200, 0.25)');
        glowGradient.addColorStop(0.5, 'rgba(255, 255, 150, 0.1)');
        glowGradient.addColorStop(1, 'rgba(255, 255, 100, 0)');
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(g.x, g.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (drawEnemySprite(img, g.x, g.y, r / scale, alpha, scale, g.hitFlash || 0, flipSprite, g.visualScale, 
            isPlevaka ? enemyImages.plevaka_anim : null, 
            isPlevaka ? PLEVAKA_ANIMS : null, 
            isPlevaka ? g.animState : null, 
            isPlevaka ? g.animFrame : 0)) {
          // Sprite drawn successfully - skip body rendering, draw only HP bar and indicators
          // HP бар
          const maxHp = g.maxHp || CONFIG.SPIDER_HP;

          if (g.hp !== undefined && g.hp < maxHp) {
            const hpFrac = Math.max(0, g.hp / maxHp);
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#1a0030';
            ctx.fillRect(g.x - r, g.y - r - 8 * scale, r * 2, 3 * scale);
            if (isBull) {
              ctx.fillStyle = hpFrac > 0.5 ? '#cc4444' : '#ff0000';
            } else if (isBuldyga) {
              ctx.fillStyle = hpFrac > 0.5 ? '#9932cc' : '#dda0dd';
            } else if (isPlevaka) {
              ctx.fillStyle = hpFrac > 0.5 ? '#ff8800' : '#ff4400';
            } else {
              ctx.fillStyle = hpFrac > 0.5 ? '#44cc22' : '#88ff44';
            }
            ctx.fillRect(g.x - r, g.y - r - 8 * scale, r * 2 * hpFrac, 3 * scale);
          }

          // Телеграф рывка быка
          if (((isBull || isBossPhase) && g.state === 'prepare')) {
            drawBullChargeTelegraph(g, r, scale, alpha);
          }

          ctx.globalAlpha = 1;
          return;
        }
        // If sprite failed to draw, fall through to canvas rendering
      }

      if (isCocoon) {
        // Кокон — будет отрисован ниже как спрайт без тени
      } else if (isBloated) {
        // Распухший — жёлто-зелёный, вздутый
        ctx.fillStyle = '#88aa22';
        ctx.shadowColor = '#556611';
      } else if (isBull) {
        // Бык — крупный, тёмно-красный, массивный
        ctx.fillStyle = '#8b0000';
        ctx.shadowColor = '#4a0000';
      } else if (isBuldyga) {
        // Булдыга — фиолетовый, тяжёлый
        ctx.fillStyle = '#4b0082';
        ctx.shadowColor = '#2d0050';
      } else if (isPlevaka) {
        ctx.fillStyle = '#ff6020';
        ctx.shadowColor = '#ff2200';
      } else if (isSoldier) {
        ctx.fillStyle = '#4444aa';
        ctx.shadowColor = '#222266';
      } else {
        ctx.fillStyle = '#228822';
        ctx.shadowColor = '#114411';
      }
      ctx.shadowBlur = 18 * scale;

      if (isCocoon) {
        // Кокон: sprite sheet animation (no shadow glow)
        ctx.shadowBlur = 0; // disable glow for cocoon
        if (cocoonImg.complete && cocoonImg.naturalWidth > 0) {
          // Calculate animation frame based on global time
          const animDuration = COCOON_ANIM.frames / COCOON_ANIM.fps;
          const animTime = (state.time % animDuration) / animDuration;
          const frame = Math.floor(animTime * COCOON_ANIM.frames);
          const sx = frame * COCOON_SW;
          const drawSize = r * 2.2; // simple size based on radius (r already includes scale)
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.drawImage(
            cocoonImg,
            sx, 0, COCOON_SW, COCOON_SH,
            g.x - drawSize / 2, g.y - drawSize / 2, drawSize, drawSize
          );
          ctx.restore();
        } else {
          // Fallback: овальная форма если картинка не загрузилась
          ctx.save();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#cccccc';
          ctx.beginPath(); ctx.ellipse(g.x, g.y, r * 0.8, r * 1.0, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#aaaaaa';
          ctx.beginPath(); ctx.ellipse(g.x - r * 0.2, g.y - r * 0.2, r * 0.4, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        // Skip rest of drawing (no legs for cocoon)
        ctx.globalAlpha = alpha;

        // HP бар для кокона
        const maxHp = g.maxHp || CONFIG.COCOON_HP;
        if (g.hp !== undefined && g.hp < maxHp) {
          const hpFrac = Math.max(0, g.hp / maxHp);
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = '#1a0030';
          ctx.fillRect(g.x - r, g.y - r - 8 * scale, r * 2, 3 * scale);
          ctx.fillStyle = hpFrac > 0.5 ? '#aaaaaa' : '#666666';
          ctx.fillRect(g.x - r, g.y - r - 8 * scale, r * 2 * hpFrac, 3 * scale);
        }
        ctx.globalAlpha = alpha;
        return;
      } else if (isBloated) {
        // Распухший: вздутое тело, почти круглое
        ctx.beginPath(); ctx.ellipse(g.x, g.y + r * 0.1, r * 0.9, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
        // Верхняя часть
        ctx.beginPath(); ctx.ellipse(g.x, g.y - r * 0.5, r * 0.6, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        // Пузырьки/вздутость
        ctx.fillStyle = '#aacc33';
        ctx.shadowColor = '#88aa22';
        ctx.shadowBlur = 4 * scale;
        ctx.beginPath(); ctx.arc(g.x + r * 0.3, g.y, r * 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(g.x - r * 0.3, g.y + r * 0.2, r * 0.2, 0, Math.PI * 2); ctx.fill();
      } else if (isBull) {
        // Бык: массивное тело (более крупное и круглое)
        ctx.beginPath(); ctx.ellipse(g.x, g.y, r * 0.9, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
        // Дополнительное плечевое бронирование
        ctx.beginPath(); ctx.ellipse(g.x, g.y - r * 0.3, r * 0.65, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        // Рога
        ctx.fillStyle = '#cccccc';
        ctx.shadowColor = '#888888';
        ctx.shadowBlur = 8 * scale;
        ctx.beginPath();
        ctx.moveTo(g.x - r * 0.5, g.y - r * 0.6);
        ctx.quadraticCurveTo(g.x - r * 0.8, g.y - r * 1.2, g.x - r * 0.6, g.y - r * 1.3);
        ctx.quadraticCurveTo(g.x - r * 0.4, g.y - r * 0.9, g.x - r * 0.3, g.y - r * 0.7);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(g.x + r * 0.5, g.y - r * 0.6);
        ctx.quadraticCurveTo(g.x + r * 0.8, g.y - r * 1.2, g.x + r * 0.6, g.y - r * 1.3);
        ctx.quadraticCurveTo(g.x + r * 0.4, g.y - r * 0.9, g.x + r * 0.3, g.y - r * 0.7);
        ctx.fill();
      } else if (isBuldyga) {
        // Булдыга: массивное широкое тело
        ctx.beginPath(); ctx.ellipse(g.x, g.y, r * 1.0, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        // Верхняя часть — более крупная
        ctx.beginPath(); ctx.ellipse(g.x, g.y - r * 0.35, r * 0.7, r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
        // Шипы на спине
        ctx.fillStyle = '#6a0dad';
        ctx.shadowColor = '#4b0082';
        ctx.shadowBlur = 6 * scale;
        for (let i = -2; i <= 2; i++) {
          const spikeX = g.x + i * r * 0.35;
          const spikeY = g.y - r * 0.6;
          ctx.beginPath();
          ctx.moveTo(spikeX - r * 0.1, spikeY);
          ctx.lineTo(spikeX, spikeY - r * 0.4);
          ctx.lineTo(spikeX + r * 0.1, spikeY);
          ctx.fill();
        }
      } else if (isSoldier) {
        // Солдат: компактное тело
        ctx.beginPath(); ctx.ellipse(g.x, g.y + r * 0.2, r * 0.65, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(g.x, g.y - r * 0.45, r * 0.45, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        // Обычное тело (паук) — abdomen + cephalothorax
        ctx.beginPath(); ctx.ellipse(g.x, g.y + r * 0.25, r * 0.7, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(g.x, g.y - r * 0.55, r * 0.5, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      }

      // Legs (8 legs, 4 per side) — angles relative to horizontal, spread outward
      ctx.shadowBlur = 0;
      if (isBloated) {
        ctx.strokeStyle = '#88aa22';
        ctx.lineWidth = Math.max(1, r * 0.15);
      } else if (isBull) {
        ctx.strokeStyle = '#8b0000';
        ctx.lineWidth = Math.max(2, r * 0.25);
      } else if (isBuldyga) {
        ctx.strokeStyle = '#4b0082';
        ctx.lineWidth = Math.max(2, r * 0.22);
      } else if (isPlevaka) {
        ctx.strokeStyle = '#ff6020';
        ctx.lineWidth = Math.max(1, r * 0.18);
      } else if (isSoldier) {
        ctx.strokeStyle = '#4444aa';
        ctx.lineWidth = Math.max(1, r * 0.16);
      } else {
        ctx.strokeStyle = '#228822';
        ctx.lineWidth = Math.max(1, r * 0.18);
      }
      ctx.globalAlpha = alpha;
      // angOffsets: angle from horizontal (0=right/left), negative=up, positive=down
      const angOffsets = [-0.55, -0.18, 0.18, 0.55];
      for (let side = -1; side <= 1; side += 2) {
        for (let li = 0; li < angOffsets.length; li++) {
          // base angle: side=-1 means left (π), side=1 means right (0)
          const baseAng = (side === -1 ? Math.PI : 0) + angOffsets[li] * side;
          const midAng = baseAng + 0.3 * side;
          const legMult = (isBull || isBuldyga) ? 1.15 : 1.0;
          const midX = g.x + Math.cos(baseAng) * r * 1.4 * legMult;
          const midY = g.y - r * 0.1 + Math.sin(baseAng) * r * 1.1 * legMult;
          const tipX = g.x + Math.cos(midAng) * r * 2.4 * legMult;
          const tipY = g.y + r * 0.5 + Math.sin(midAng) * r * 1.6 * legMult;
          ctx.beginPath();
          ctx.moveTo(g.x + side * r * 0.45, g.y - r * 0.1);
          ctx.quadraticCurveTo(midX, midY, tipX, tipY);
          ctx.stroke();
        }
      }

      // Eyes
      ctx.globalAlpha = alpha;
      if (isBull) {
        ctx.fillStyle = '#ff0000'; // Красные глаза у быка
      } else if (isBuldyga) {
        ctx.fillStyle = '#dda0dd'; // Светло-фиолетовые глаза у булдыги
      } else if (isPlevaka) {
        ctx.fillStyle = '#ffaa00';
      } else if (isSoldier) {
        ctx.fillStyle = '#aaaaff';
      } else {
        ctx.fillStyle = '#88ff44';
      }
      if (isBull) {
        // Бык: более крупные глаза, агрессивные
        ctx.beginPath(); ctx.arc(g.x - r * 0.25, g.y - r * 0.35, r * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(g.x + r * 0.25, g.y - r * 0.35, r * 0.15, 0, Math.PI * 2); ctx.fill();
        // Злой взгляд — дополнительные "брови"
        ctx.fillStyle = '#4a0000';
        ctx.beginPath(); ctx.arc(g.x - r * 0.25, g.y - r * 0.45, r * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(g.x + r * 0.25, g.y - r * 0.45, r * 0.08, 0, Math.PI * 2); ctx.fill();
      } else if (isBuldyga) {
        // Булдыга: крупные фиолетовые глаза
        ctx.beginPath(); ctx.arc(g.x - r * 0.28, g.y - r * 0.4, r * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(g.x + r * 0.28, g.y - r * 0.4, r * 0.16, 0, Math.PI * 2); ctx.fill();
        // Тяжёлый взгляд — дополнительные пятна
        ctx.fillStyle = '#9932cc';
        ctx.beginPath(); ctx.arc(g.x - r * 0.3, g.y - r * 0.5, r * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(g.x + r * 0.3, g.y - r * 0.5, r * 0.1, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(g.x - r * 0.22, g.y - r * 0.6, r * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(g.x + r * 0.22, g.y - r * 0.6, r * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(g.x - r * 0.08, g.y - r * 0.72, r * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(g.x + r * 0.08, g.y - r * 0.72, r * 0.08, 0, Math.PI * 2); ctx.fill();
      }

      // HP бар
      const maxHp = g.maxHp || (isBull ? CONFIG.BULL_HP : isBuldyga ? CONFIG.BULDYGA_HP : isPlevaka ? CONFIG.SHOOTER_HP : isCocoon ? CONFIG.COCOON_HP : isBloated ? CONFIG.BLOATED_HP : CONFIG.SPIDER_HP);
      if (g.hp !== undefined && g.hp < maxHp) {
        const hpFrac = Math.max(0, g.hp / maxHp);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#1a0030';
        ctx.fillRect(g.x - r, g.y - r - 8 * scale, r * 2, 3 * scale);
        if (isBull) {
          ctx.fillStyle = hpFrac > 0.5 ? '#cc4444' : '#ff0000';
        } else if (isBuldyga) {
          ctx.fillStyle = hpFrac > 0.5 ? '#9932cc' : '#dda0dd';
        } else if (isPlevaka) {
          ctx.fillStyle = hpFrac > 0.5 ? '#ff8800' : '#ff4400';
        } else if (isCocoon) {
          ctx.fillStyle = hpFrac > 0.5 ? '#aaaaaa' : '#666666';
        } else if (isBloated) {
          ctx.fillStyle = hpFrac > 0.5 ? '#aacc33' : '#88aa22';
        } else {
          ctx.fillStyle = hpFrac > 0.5 ? '#44cc22' : '#88ff44';
        }
        ctx.fillRect(g.x - r, g.y - r - 8 * scale, r * 2 * hpFrac, 3 * scale);
      }

      if (isBull && g.state === 'prepare') {
        drawBullChargeTelegraph(g, r, scale, alpha);
      }

      ctx.globalAlpha = 1;
    }

    // Проверка видимости клетки на экране
    function isCellVisible(cx, cy) {
      const x = cx * CP;
      const y = cy * CP;
      return x + CP > camera.x && x < camera.x + VIEW_W &&
        y + CP > camera.y && y < camera.y + VIEW_H;
    }

    function drawHUD(s) {
      if (!s) return;
      const barH = 0;

      ctx.save();
      ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);

      // Уровень — текст слева сверху
      const margin = 8;
      ctx.font = 'bold 13px "Huninn"';
      ctx.fillStyle = 'rgba(0,212,255,0.9)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Уровень ${currentLevel}`, margin, margin);

      // ── Upgrade icons panel (top-right, below the bar) ───────────
      {
        const iconSize  = 20;
        const iconGap   = 4;
        const rowH      = iconSize + 4;
        const perRow    = 10;
        const panelPadX = 8;
        const panelPadY = 6;

        // Собираем активные улучшения
        const activeUpgrades = [];
        for (const upg of UPGRADE_TYPES) {
          let level = 0;
          if (upg.id === 'pellets') level = s.upgrades.pellets || 0;
          else if (upg.id === 'damage') level = s.upgrades.damage || 0;
          else if (upg.id === 'penetrate') level = s.upgrades.penetrate || 0;
          else if (upg.id === 'bulletSpeed') level = s.upgrades.bulletSpeedMult > 1 ? 1 : 0;
          else if (upg.id === 'critChance') level = s.upgrades.critChance > 0 ? Math.ceil(s.upgrades.critChance * 20) : 0;
          else if (upg.id === 'killAccel') level = s.upgrades.killAccel ? 1 : 0;
          else if (upg.id === 'enhancedPierce') level = s.upgrades.enhancedPierce ? 1 : 0;
          else if (upg.id === 'shield') level = s.upgrades.shield || 0;
          else if (upg.id === 'retreat') level = s.upgrades.retreat > 0 ? 1 : 0;
          else if (upg.id === 'reflection') level = s.upgrades.reflection ? 1 : 0;
          else if (upg.id === 'cooldown') level = s.upgrades.cooldownMult < 1 ? Math.ceil((1 - s.upgrades.cooldownMult) * 6.67) : 0;
          else if (upg.id === 'speed') level = s.upgrades.speedMult > 1 ? Math.ceil((s.upgrades.speedMult - 1) * 10) : 0;
          if (level > 0) activeUpgrades.push({ ...upg, level: Math.min(level, upg.max) });
        }

        if (activeUpgrades.length > 0) {
          const rows      = Math.ceil(activeUpgrades.length / perRow);
          const cols      = Math.min(activeUpgrades.length, perRow);
          const panelW    = cols * iconSize + (cols - 1) * iconGap + panelPadX * 2;
          const panelH    = rows * rowH + panelPadY * 2;
          const panelX    = VIEW_W - panelW;
          const panelY    = barH;

          ctx.fillStyle = 'rgba(5,10,15,0.72)';
          ctx.fillRect(panelX, panelY, panelW, panelH);
          ctx.strokeStyle = 'rgba(26,58,92,0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(panelX, panelY, panelW, panelH);

          // Иконки справа налево: последняя иконка — правый нижний угол
          let hoveredUpg = null, hoveredIx = 0, hoveredIy = 0;
          for (let i = 0; i < activeUpgrades.length; i++) {
            const upg = activeUpgrades[activeUpgrades.length - 1 - i];
            const col = i % perRow;
            const row = Math.floor(i / perRow);
            // col=0 → правый край, col increases → leftward
            const ix = panelX + panelW - panelPadX - col * (iconSize + iconGap) - iconSize;
            const iy = panelY + panelH - panelPadY - row * rowH - iconSize;

            const mx = mouseScreen.x, my = mouseScreen.y;
            const hovered = mx >= ix && mx <= ix + iconSize && my >= iy && my <= iy + iconSize;
            if (hovered) { hoveredUpg = upg; hoveredIx = ix; hoveredIy = iy; }

            ctx.font = `${iconSize}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = upg.color;
            ctx.fillText(upg.icon, ix, iy);

            if (upg.level > 1) {
              ctx.font = 'bold 8px "Huninn"';
              ctx.fillStyle = '#ffffff';
              ctx.textAlign = 'right';
              ctx.textBaseline = 'bottom';
              ctx.fillText(String(upg.level), ix + iconSize, iy + iconSize);
            }
          }

          if (hoveredUpg) {
            drawUpgradeTooltip(hoveredIx, hoveredIy, hoveredUpg);
          }
        }
      }

      // ── Cursed upgrade icons panel (top-right, below regular upgrades) ──
      {
        const iconSize  = 20;
        const iconGap   = 4;
        const rowH      = iconSize + 4;
        const perRow    = 10;
        const panelPadX = 8;
        const panelPadY = 6;

        const activeCursed = [];
        for (const upg of CURSED_UPGRADE_TYPES) {
          const val = s.upgrades[upg.id];
          let level = 0;
          if (upg.id === 'weaponSlot') level = s.maxSlots > 1 ? s.maxSlots - 1 : 0;
          else if (val === true) level = 1;
          else if (typeof val === 'number' && val > 0) level = val;
          if (level > 0) activeCursed.push({ ...upg, level: Math.min(level, upg.max) });
        }

        if (activeCursed.length > 0) {
          const rows   = Math.ceil(activeCursed.length / perRow);
          const cols   = Math.min(activeCursed.length, perRow);
          const panelW = cols * iconSize + (cols - 1) * iconGap + panelPadX * 2;
          const panelH = rows * rowH + panelPadY * 2;
          const panelX = VIEW_W - panelW;

          // Position below regular upgrade panel (calculate its height)
          const regCount = (() => {
            let c = 0;
            for (const upg of UPGRADE_TYPES) {
              let lv = 0;
              if (upg.id === 'pellets') lv = s.upgrades.pellets || 0;
              else if (upg.id === 'damage') lv = s.upgrades.damage || 0;
              else if (upg.id === 'penetrate') lv = s.upgrades.penetrate || 0;
              else if (upg.id === 'bulletSpeed') lv = s.upgrades.bulletSpeedMult > 1 ? 1 : 0;
              else if (upg.id === 'critChance') lv = s.upgrades.critChance > 0 ? 1 : 0;
              else if (upg.id === 'killAccel') lv = s.upgrades.killAccel ? 1 : 0;
              else if (upg.id === 'enhancedPierce') lv = s.upgrades.enhancedPierce ? 1 : 0;
              else if (upg.id === 'shield') lv = s.upgrades.shield || 0;
              else if (upg.id === 'retreat') lv = s.upgrades.retreat > 0 ? 1 : 0;
              else if (upg.id === 'reflection') lv = s.upgrades.reflection ? 1 : 0;
              else if (upg.id === 'cooldown') lv = s.upgrades.cooldownMult < 1 ? 1 : 0;
              else if (upg.id === 'speed') lv = s.upgrades.speedMult > 1 ? 1 : 0;
              if (lv > 0) c++;
            }
            return c;
          })();
          const regRows = regCount > 0 ? Math.ceil(regCount / perRow) : 0;
          const regPanelH = regCount > 0 ? regRows * rowH + panelPadY * 2 : 0;
          const panelY = barH + regPanelH + (regCount > 0 ? 2 : 0);

          ctx.fillStyle = 'rgba(10,5,20,0.78)';
          ctx.fillRect(panelX, panelY, panelW, panelH);
          ctx.strokeStyle = 'rgba(120,40,180,0.55)';
          ctx.lineWidth = 1;
          ctx.strokeRect(panelX, panelY, panelW, panelH);

          let hoveredUpg = null, hoveredIx = 0, hoveredIy = 0;
          for (let i = 0; i < activeCursed.length; i++) {
            const upg = activeCursed[activeCursed.length - 1 - i];
            const col = i % perRow;
            const row = Math.floor(i / perRow);
            const ix = panelX + panelW - panelPadX - col * (iconSize + iconGap) - iconSize;
            const iy = panelY + panelH - panelPadY - row * rowH - iconSize;

            const mx = mouseScreen.x, my = mouseScreen.y;
            if (mx >= ix && mx <= ix + iconSize && my >= iy && my <= iy + iconSize) {
              hoveredUpg = upg; hoveredIx = ix; hoveredIy = iy;
            }

            ctx.font = `${iconSize}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = upg.color;
            ctx.fillText(upg.icon, ix, iy);

            if (upg.level > 1) {
              ctx.font = 'bold 8px "Huninn"';
              ctx.fillStyle = '#ffffff';
              ctx.textAlign = 'right';
              ctx.textBaseline = 'bottom';
              ctx.fillText(String(upg.level), ix + iconSize, iy + iconSize);
            }
          }

          if (hoveredUpg) drawUpgradeTooltip(hoveredIx, hoveredIy, hoveredUpg);
        }
      }

      // ── Secondary icon HUD (top-left, below the bar) ──────────────
      {
        const iconSize = 20;
        const iconGap  = 4;
        const rowGap   = 4;
        const panelPad = 8;
        const startX   = panelPad;
        let   rowY     = 30 + panelPad;

        function drawHudRow(img, total, filled) {
          for (let i = 0; i < total; i++) {
            ctx.save();
            ctx.globalAlpha = i < filled ? 1 : 0.25;
            if (img.complete && img.naturalWidth > 0) {
              ctx.drawImage(img, startX + i * (iconSize + iconGap), rowY, iconSize, iconSize);
            }
            ctx.restore();
          }
          rowY += iconSize + rowGap;
        }

        function drawHeartHudRow(total, filled) {
          for (let i = 0; i < total; i++) {
            const x = startX + i * (iconSize + iconGap);
            if (hudHeartContainerImg.complete && hudHeartContainerImg.naturalWidth > 0) {
              ctx.drawImage(hudHeartContainerImg, x, rowY, iconSize, iconSize);
            }
            if (i < filled && hudHeartImg.complete && hudHeartImg.naturalWidth > 0) {
              ctx.drawImage(hudHeartImg, x, rowY, iconSize, iconSize);
            }
          }
          rowY += iconSize + rowGap;
        }

        // Hearts — контейнеры показывают макс. здоровье при закрытии всех комнат
        const { filled: heartFilled, total: heartTotal } = getHeartHudStats(s);
        if (heartTotal > 0) {
          drawHeartHudRow(heartTotal, heartFilled);
        }

        // Shields — only show collected (no dim slots)
        const shieldCount = s.upgrades.shield || 0;
        if (shieldCount > 0) {
          drawHudRow(hudShieldImg, shieldCount, shieldCount);
        }

        // Keys — show all slots, dim uncollected
        drawHudRow(hudKeyImg, s.keysRequired, s.keysCollected);
      }

      // ── Weapon slots (bottom-left) ─────────────────────────────────
      {
        const slotSize  = 44;
        const slotGap   = 6;
        const slotPad   = 8;
        const labelH    = 14;
        const totalH    = slotSize + labelH + slotPad * 2;
        const totalW    = s.maxSlots * slotSize + (s.maxSlots - 1) * slotGap + slotPad * 2;
        const screenMargin = 8;
        const panelX    = screenMargin;
        const panelY    = VIEW_H - totalH - screenMargin;

        ctx.fillStyle = 'rgba(5,10,15,0.75)';
        ctx.fillRect(panelX, panelY, totalW, totalH);
        ctx.strokeStyle = 'rgba(26,58,92,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX, panelY, totalW, totalH);

        for (let i = 0; i < s.maxSlots; i++) {
          const sx = panelX + slotPad + i * (slotSize + slotGap);
          const sy = panelY + slotPad;
          const wId    = s.weaponSlots[i];
          const active = i === s.activeSlot;

          // Slot background
          ctx.fillStyle = active ? 'rgba(0,180,255,0.12)' : 'rgba(0,0,0,0.3)';
          ctx.fillRect(sx, sy, slotSize, slotSize);

          // Slot border
          ctx.strokeStyle = active ? '#00d4ff' : 'rgba(26,58,92,0.9)';
          ctx.lineWidth   = active ? 1.5 : 1;
          ctx.strokeRect(sx, sy, slotSize, slotSize);

          // Weapon image
          if (wId) {
            const img = weaponImages[wId];
            if (img && img.complete && img.naturalWidth > 0) {
              ctx.save();
              ctx.globalAlpha = active ? 1 : 0.6;
              const margin = 6;
              ctx.drawImage(img, sx + margin, sy + margin, slotSize - margin * 2, slotSize - margin * 2);
              ctx.restore();
            }
          }

          // Slot number label
          ctx.font = 'bold 9px "Huninn"';
          ctx.fillStyle = active ? '#00d4ff' : 'rgba(42,74,106,1)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(String(i + 1), sx + slotSize / 2, sy + slotSize + 2);
        }
      }

      // ── Controls hint panel (bottom-right) ────────────────────────
      {
        const entries = [
          { img: hudCtrlF,     label: 'подобрать' },
          { img: hudCtrlShift, label: 'рывок' },
          { img: hudCtrlTab,   label: 'характ.' },
          { img: hudCtrlML,    label: 'выстрел' },
          { img: hudCtrlMR,    label: 'откр/закр' },
        ];
        const iconSize  = 24;
        const iconGap   = 8;
        const labelH    = 12;
        const padX      = 20;
        const padY      = 6;
        const marginR   = 40;
        const marginB   = 8;
        const weaponSlotH = marginB; // slotSize + labelH + slotPad*2 + screenMargin
        const totalW    = entries.length * 1.5 * iconSize + (entries.length - 1) * iconGap + padX * 2;
        const totalH    = padY + iconSize + 3 + labelH + padY;
        const panelX    = VIEW_W - totalW - marginR;
        const panelY    = VIEW_H - totalH - weaponSlotH - 4;

        ctx.fillStyle = 'rgba(5,10,15,0.65)';
        ctx.fillRect(panelX, panelY, totalW, totalH);
        ctx.strokeStyle = 'rgba(26,58,92,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX, panelY, totalW, totalH);

        for (let i = 0; i < entries.length; i++) {
          const { img, label } = entries[i];
          const ix = panelX + padX + i * 1.5 * (iconSize + iconGap);
          const iy = panelY + padY;
          if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, ix, iy, iconSize, iconSize);
          }
          ctx.font = '9px "Huninn"';
          ctx.fillStyle = 'rgba(180,160,130,0.8)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(label, ix + iconSize / 2, iy + iconSize + 3);
        }
      }

      ctx.restore();
    }

    // ============================================================
    // OVERLAY
    // ============================================================
    function showOverlay(title, color, lines, btnText, action = 'startGame') {
      const ov = document.getElementById('overlay');
      ov.style.display = 'flex';
      ov.className = title === 'GAME OVER' ? 'gameover' : '';
      const imagesHtml = title === 'GAME OVER' ? `
    <div class="gameover-images">
      <img src="img/death.png" alt="">
      <img src="img/deathtext.png" class="death-text" alt="">
    </div>
  ` : '';
      ov.innerHTML = `
    <h2 style="color:${color}">${title === 'GAME OVER' ? '' : title}</h2>
    ${imagesHtml}
    ${lines.map(l => `<p>${l}</p>`).join('')}
    <button class="btn" id="start-btn" style="border-color:${color};color:${color}">
      ${btnText}
    </button>
  `;
      
      const btn = document.getElementById('start-btn');
      if (action === 'nextLevel') {
        btn.onclick = () => {
          hideOverlay();
          nextLevel();
        };
      } else if (action === 'startGame') {
        btn.onclick = startGame;
      } else if (action === 'continueGame') {
        btn.onclick = continueGame;
      }
    }

    function showStartOverlay() {
      const ov = document.getElementById('overlay');
      ov.style.display = 'flex';
      const saveExists = hasSave();
      ov.innerHTML = `
    <h2 style="color:var(--accent)">ПАУЧЬЕ ГНЕЗДО</h2>
    <p>Найди выход. Не дай паукам добраться до тебя.</p>
    ${saveExists ? `<button class="btn" id="continue-btn" style="border-color:#00ff88;color:#00ff88">ПРОДОЛЖИТЬ</button>` : ''}
    <button class="btn" id="start-btn">${saveExists ? 'НОВАЯ ИГРА' : 'НАЧАТЬ ИГРУ'}</button>
  `;
      document.getElementById('start-btn').onclick = startGame;
      if (saveExists) {
        document.getElementById('continue-btn').onclick = continueGame;
      }
    }

    function hideOverlay() {
      document.getElementById('overlay').style.display = 'none';
    }

    // ============================================================
    // ZOOM DRAW (play map with zoom transform)
    // ============================================================
    function drawZoom(s, scale, camX, camY, progress, pendingCellKey, frozenAngle) {
      beginFrame();
      ctx.save();
      // Трансформация: зум от центра экрана
      ctx.translate(VIEW_W / 2, VIEW_H / 2);
      ctx.scale(scale, scale);
      ctx.translate(-camX - VIEW_W / (2 * scale), -camY - VIEW_H / (2 * scale));

      // Фон
      ctx.fillStyle = '#030810';
      const zoomWorldW = s.gridSize * CP;
      const zoomWorldH = s.gridSize * CP;
      ctx.fillRect(0, 0, zoomWorldW, zoomWorldH);

      // Содержимое клеток с fade-out (кроме pendingCellKey)
      const fadeAlpha = 1 - progress; // 1 -> 0

      // Чёрные (disabled + permanently closed) клетки
      const blackCellsZ = new Set([...s.permanentlyClosed, ...s.disabledCells]);
      ctx.globalAlpha = fadeAlpha;
      for (const k of blackCellsZ) {
        const { x, y } = cellFromKey(k);
        const revealedZ = someAdjacentCell(x, y, (nx, ny, nk) => s.everOpenedCells.has(nk));
        if (revealedZ) {
          if (rockImg.complete && rockImg.naturalWidth > 0) {
            ctx.drawImage(rockImg, x * CP, y * CP, CP, CP);
          } else {
            ctx.fillStyle = '#000000';
            ctx.fillRect(x * CP, y * CP, CP, CP);
          }
        } else {
          if (closedCellImg.complete && closedCellImg.naturalWidth > 0) {
            ctx.drawImage(closedCellImg, x * CP, y * CP, CP, CP);
          } else {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(x * CP, y * CP, CP, CP);
          }
        }
      }
      ctx.globalAlpha = 1;

      // Неоткрытые клетки (не исследованные) — рисуем closedcell.png
      ctx.globalAlpha = fadeAlpha;
      for (let cy2 = 0; cy2 < s.gridSize; cy2++) {
        for (let cx2 = 0; cx2 < s.gridSize; cx2++) {
          const k = cellKey(cx2, cy2);
          if (s.openCells.has(k) || s.everRevealedCells.has(k) ||
              s.disabledCells.has(k) || s.permanentlyClosed.has(k)) continue;
          if (closedCellImg.complete && closedCellImg.naturalWidth > 0) {
            ctx.drawImage(closedCellImg, cx2 * CP, cy2 * CP, CP, CP);
          } else {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(cx2 * CP, cy2 * CP, CP, CP);
          }
        }
      }
      ctx.globalAlpha = 1;

      // Открытые клетки
      for (const k of s.openCells) {
        const { x, y } = cellFromKey(k);
        drawFloorCell(ctx, x, y, CP, s.openCells, 0, 0, currentLevel);
      }

      // Стены по краям открытых клеток (zoom)
      drawOpenCellWalls(s.openCells, CP, CP * 0.125, 0, 0, currentLevel);
      drawOpenCellCorners(s.openCells, CP, CP * 0.125, 0, 0, currentLevel);

      // Смежные закрытые клетки (ever revealed) с плавным fade
      ctx.globalAlpha = fadeAlpha * 0.6;
      for (const k of s.everRevealedCells) {
        if (s.openCells.has(k) || s.disabledCells.has(k) || s.permanentlyClosed.has(k)) continue;
        const { x, y } = cellFromKey(k);
        if (x < 0 || x >= s.gridSize || y < 0 || y >= s.gridSize) continue;
        ctx.fillStyle = 'rgba(40,30,50,0.3)';
        ctx.fillRect(x * CP + 1, y * CP + 1, CP - 2, CP - 2);
      }

      // Зелёная подсветка клеток смежных с игроком (доступных для открытия)
      const playerCellZ = cellOf(s.player.x, s.player.y);
      for (const [ddx, ddy] of CARDINAL_DIRECTIONS) {
        const nx = playerCellZ.x + ddx, ny = playerCellZ.y + ddy;
        const nk = cellKey(nx, ny);
        if (nx >= 0 && nx < s.gridSize && ny >= 0 && ny < s.gridSize &&
            !s.openCells.has(nk) && !s.disabledCells.has(nk) && !s.permanentlyClosed.has(nk)) {
          const hovered = nk === cellKey(Math.floor(s.mouse.x / CP), Math.floor(s.mouse.y / CP));
          ctx.globalAlpha = fadeAlpha * (hovered ? 0.6 : 0.4);
          ctx.fillStyle = hovered ? 'rgba(80,220,120,0.25)' : 'rgba(45,138,69,0.15)';
          ctx.fillRect(nx * CP + 1, ny * CP + 1, CP - 2, CP - 2);
        }
      }
      ctx.globalAlpha = 1;

      // Сердечки в открытых клетках
      for (const heart of s.hearts) {
        if (heart.collected) continue;
        const hc = cellOf(heart.x, heart.y);
        if (!s.openCells.has(cellKey(hc.x, hc.y))) continue;
        const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.008);
        ctx.globalAlpha = fadeAlpha;
        ctx.fillStyle = `rgba(255, 107, 157, ${pulse})`;
        ctx.shadowColor = '#ff6b9d';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 24px "Huninn"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♥', heart.x, heart.y);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // Ключи в открытых клетках
      for (const keyObj of s.keyObjs) {
        if (keyObj.collected) continue;
        const kc = cellOf(keyObj.x, keyObj.y);
        if (!s.openCells.has(cellKey(kc.x, kc.y))) continue;
        const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.008);
        ctx.globalAlpha = fadeAlpha;
        ctx.fillStyle = `rgba(255, 215, 0, ${pulse})`;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 24px "Huninn"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔑', keyObj.x, keyObj.y);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // Апгрейды в открытых клетках
      for (const upg of s.upgradeObjs) {
        if (upg.collected) continue;
        const uc = cellOf(upg.x, upg.y);
        if (!s.openCells.has(cellKey(uc.x, uc.y))) continue;
        const upgDef = UPGRADE_TYPES.find(u => u.id === upg.upgradeType);
        if (upgDef) {
          ctx.globalAlpha = fadeAlpha;
          ctx.fillStyle = upgDef.color;
          ctx.shadowColor = upgDef.color;
          ctx.shadowBlur = 15;
          ctx.font = 'bold 36px "Huninn"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(upgDef.icon, upg.x, upg.y);
          ctx.shadowBlur = 0;
        }
      }
      ctx.globalAlpha = 1;

      // Проклятые сундуки (открытые + revealed)
      for (const chest of (s.chestObjs || [])) {
        if (chest.collected) continue;
        const cc = cellOf(chest.x, chest.y);
        const ck = cellKey(cc.x, cc.y);
        const isOpen = s.openCells.has(ck);
        const isRevealed = s.everRevealedCells.has(ck);
        if (!isOpen && !isRevealed) continue;
        ctx.globalAlpha = 1;
        ctx.shadowColor = '#cc44ff';
        ctx.shadowBlur = isOpen ? 18 : 8;
        if (cursedChestImg.complete && cursedChestImg.naturalWidth > 0) {
          ctx.drawImage(cursedChestImg, chest.x - CP*0.15, chest.y - CP*0.15, CP*0.3, CP*0.3);
        } else {
          ctx.font = 'bold 26px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📦', chest.x, chest.y);
        }
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // Оружие в открытых клетках
      for (const dw of s.droppedWeapons) {
        const wc = cellOf(dw.x, dw.y);
        if (!s.openCells.has(cellKey(wc.x, wc.y))) continue;
        const wDef = WEAPON_DEFS[dw.weaponId];
        if (!wDef) continue;
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.007);
        ctx.shadowColor = wDef.color;
        ctx.shadowBlur = 12;
        drawWeaponSprite(ctx, dw.weaponId, dw.x, dw.y - 8, 28, fadeAlpha, pulse);
        ctx.shadowBlur = 0;
        ctx.font = 'bold 9px "Huninn"';
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = fadeAlpha * 0.9;
        ctx.fillText(wDef.label, dw.x, dw.y + 8);
      }
      ctx.globalAlpha = 1;

      // Пауки в закрытых клетках (fade-out, кроме pendingCellKey)
      for (const g of s.spiders) {
        if (!g.trapped) continue;
        const gc = cellOf(g.x, g.y);
        const cellK = cellKey(gc.x, gc.y);
        const visible = s.everRevealedCells.has(cellK);
        if (!visible) continue;
        const isPending = cellK === pendingCellKey;
        // Клетка боя - полная непрозрачность, другие клетки - плавное исчезание
        const gAlpha = isPending ? 1 : fadeAlpha * 0.7;
        drawSpider(g, gAlpha, 1, true);
      }

      // Игрок
      const p = s.player;
      const HERO_DRAW_SCALE = (CONFIG.PLAYER_SPRITE_RADIUS * 2) / HERO_SW;
      drawPlayerSprite(p.x, p.y, HERO_DRAW_SCALE);

      // Летящее сердечко (в мировых координатах зума)
      drawFlyingHeartInWorld();

      ctx.restore();

      // Виньетка при малом количестве жизней
      if (s.player.lives === 2) {
        const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H / 3, VIEW_W / 2, VIEW_H / 2, Math.sqrt((VIEW_W) ** 2 + (VIEW_H) ** 2));
        grad.addColorStop(0, 'rgba(255, 120, 0, 0)');
        grad.addColorStop(1, 'rgba(255, 120, 0, 0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      } else if (s.player.lives === 1) {
        const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H / 3, VIEW_W / 2, VIEW_H / 2, Math.sqrt((VIEW_W) ** 2 + (VIEW_H) ** 2));
        grad.addColorStop(0, 'rgba(255, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(255, 0, 0, 0.55)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }

      // Оверлей с текстом
      // ctx.fillStyle = 'rgba(255,68,68,0.85)';
      // ctx.font = 'bold 14px "Huninn"';
      // ctx.textAlign = 'center';
      // ctx.textBaseline = 'top';
      // ctx.fillText('⚔ ENTERING BATTLE...', VIEW_W / 2, 10);

      drawHUD(s);
    }

    // drawZoomOut: используем drawZoom с play-координатами
    function drawZoomOut(s, scale, camX, camY, progress, playerX, playerY, frozenAngle) {
      // Временно подменяем позицию игрока на battle-позицию в play-коорд
      const origX = s.player.x, origY = s.player.y;
      s.player.x = playerX; s.player.y = playerY;
      drawZoom(s, scale, camX, camY, 1 - progress, null, frozenAngle);
      s.player.x = origX; s.player.y = origY;
      // Поверх - текст ≄ поверх виньетки
      ctx.fillStyle = 'rgba(0,255,136,0.85)';
      ctx.font = 'bold 14px "Huninn"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('✓ ПОБЕДА', VIEW_W / 2, 10);
    }

    // ============================================================
    // PAUSE MENU
    // ============================================================
    const PAUSE = {
      w: 320, h: 180,
      get x() { return (VIEW_W - this.w) / 2; },
      get y() { return (VIEW_H - this.h) / 2; },
      sliderX() { return this.x + 24; },
      sliderY() { return this.y + 110; },
      sliderW() { return this.w - 48; },
      sliderH: 6,
      btnX() { return this.x + (this.w - 160) / 2; },
      btnY() { return this.y + 134; },
      btnW: 160, btnH: 30,
    };

    function drawPauseMenu() {
      const p = PAUSE;
      ctx.save();

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.shadowBlur = 24;
      ctx.shadowColor = 'rgba(0,180,255,0.18)';
      ctx.fillStyle = 'rgba(5,14,28,0.97)';
      const r = 12;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, r);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(0,180,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, r);
      ctx.stroke();

      ctx.font = 'bold 20px "Huninn"';
      ctx.fillStyle = '#e0f0ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('ПАУЗА', VIEW_W / 2, p.y + 20);

      ctx.font = '12px "Huninn"';
      ctx.fillStyle = 'rgba(160,200,240,0.8)';
      ctx.textAlign = 'left';
      ctx.fillText('ГРОМКОСТЬ', p.sliderX(), p.sliderY() - 18);

      const sx = p.sliderX(), sy = p.sliderY(), sw = p.sliderW(), sh = p.sliderH;
      ctx.fillStyle = 'rgba(0,100,180,0.35)';
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, 3);
      ctx.fill();

      const filled = sw * Sounds._volume;
      ctx.fillStyle = '#1ab4ff';
      ctx.beginPath();
      ctx.roundRect(sx, sy, filled, sh, 3);
      ctx.fill();

      const kx = sx + filled;
      const ky = sy + sh / 2;
      ctx.beginPath();
      ctx.arc(kx, ky, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#1ab4ff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = '11px "Huninn"';
      ctx.fillStyle = 'rgba(160,200,240,0.7)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(Sounds._volume * 100) + '%', p.x + p.w - 24, p.sliderY() + sh / 2);

      const bx = p.btnX(), by = p.btnY(), bw = p.btnW, bh = p.btnH;
      const mx = mouseScreen.x, my = mouseScreen.y;
      const hovered = mx >= bx && mx <= bx + bw && my >= by && my <= by + bh;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 6);
      ctx.fillStyle = hovered ? 'rgba(0,200,120,0.3)' : 'rgba(0,140,80,0.2)';
      ctx.fill();
      ctx.strokeStyle = hovered ? '#00e87a' : '#00aa55';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = 'bold 13px "Huninn"';
      ctx.fillStyle = hovered ? '#00ff99' : '#00cc66';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ПРОДОЛЖИТЬ', bx + bw / 2, by + bh / 2);

      ctx.restore();

      if (showStatsPanel && state) {
        drawStatsPanel(state);
      }
    }

    function resumeGame() {
      paused = false;
      Sounds._pausedByGame = false;
      pauseSliderDragging = false;
      lastTime = performance.now();
    }

    // ============================================================
    // CURSED CHOICE PANEL
    // ============================================================
    function openCursedChoice(s, chest = null) {
      const available = CURSED_UPGRADE_TYPES.filter(u => !s.upgrades[u.id]);
      shuffleInPlace(available);
      const offers = available.slice(0, Math.min(3, available.length));
      if (offers.length === 0) {
        if (chest) {
          chest.collected = true;
          s.cellContents.delete(chest.cellKey);
        }
        return;
      }
      cursedChoiceState = { offers, chest, isBoss: !chest, selectionDelay: 1.5, slideT: 0, isClosing: false, selectedUpgrade: null };
      paused = true;
      Sounds._pausedByGame = true;
    }

    function drawCursedChoice() {
      if (!cursedChoiceState) return;
      const { offers, selectionDelay, slideT, isClosing } = cursedChoiceState;
      const mx = mouseScreen.x, my = mouseScreen.y;
      const canSelect = selectionDelay <= 0 && !isClosing;

      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      const panelW = Math.min(VIEW_W - 40, 680);
      const cardW = Math.floor((panelW - 48) / 3);
      const cardH = 190;
      const panelH = cardH + 90;
      const panelX = (VIEW_W - panelW) / 2;
      const panelY = (VIEW_H - panelH) / 2;

      // Slide animation: opening (ease out) or closing (reverse of opening)
      let slideProgress;
      if (isClosing) {
        slideProgress = 1 - Math.pow(slideT, 3); // Reverse of easeOutCubic
      } else {
        slideProgress = 1 - Math.pow(1 - slideT, 3); // easeOutCubic for opening
      }
      const slideOffset = (1 - slideProgress) * panelH;
      const currentPanelY = panelY + slideOffset;

      ctx.shadowBlur = 40;
      ctx.shadowColor = 'rgba(180,0,255,0.25)';
      ctx.fillStyle = 'rgba(8,4,20,0.97)';
      ctx.beginPath();
      ctx.roundRect(panelX, currentPanelY, panelW, panelH, 14);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(180,60,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(panelX, currentPanelY, panelW, panelH, 14);
      ctx.stroke();

      ctx.font = 'bold 15px "Huninn"';
      ctx.fillStyle = '#cc88ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('ПРОКЛЯТЫЕ УЛУЧШЕНИЯ — ВЫБЕРИ ОДНО', VIEW_W / 2, currentPanelY + 16);

      ctx.font = '10px "Huninn"';
      ctx.fillStyle = 'rgba(180,100,255,0.55)';
      ctx.fillText('Эффект активен постоянно. Отмена невозможна.', VIEW_W / 2, currentPanelY + 36);

      for (let i = 0; i < offers.length; i++) {
        const upg = offers[i];
        const cx = panelX + 16 + i * (cardW + 8);
        const cy = currentPanelY + 58;
        const hovered = canSelect && mx >= cx && mx <= cx + cardW && my >= cy && my <= cy + cardH;

        ctx.shadowBlur = hovered ? 24 : 8;
        ctx.shadowColor = upg.color + (hovered ? 'cc' : '44');
        ctx.fillStyle = hovered ? `${upg.color}22` : 'rgba(20,8,40,0.9)';
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 10);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = hovered ? upg.color : upg.color + '66';
        ctx.lineWidth = hovered ? 2 : 1.2;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, 10);
        ctx.stroke();

        ctx.font = '28px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(upg.icon || '📦', cx + cardW / 2, cy + 36);

        ctx.font = `bold 11px "Huninn"`;
        ctx.fillStyle = hovered ? '#ffffff' : upg.color;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';

        const labelLines = wrapText(upg.label, cardW - 16);
        let ty = cy + 66;
        for (const line of labelLines) {
          ctx.fillText(line, cx + cardW / 2, ty);
          ty += 14;
        }

        ctx.font = '9px "Huninn"';
        ctx.fillStyle = hovered ? 'rgba(255,255,255,0.85)' : 'rgba(200,160,255,0.7)';
        const descLines = wrapText(upg.description, cardW - 16);
        ty += 4;
        for (const line of descLines) {
          ctx.fillText(line, cx + cardW / 2, ty);
          ty += 12;
        }
      }

      ctx.restore();
    }

    function wrapText(text, maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let line = '';
      ctx.font = '9px "Huninn"';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    // Открывает клетку после того как сердечко долетело (запускает zoom или сохраняет)
    function doOpenCellAfterHeart(openKey, openCX, openCY) {
      const content = state.cellContents.get(openKey);
      const hasContent = content && (content.type === 'heart' || content.type === 'key' || content.type === 'upgrade' || content.type === 'chest' ||
                         (content.enemyCount && content.enemyCount > 0 && !content.enemiesReleased));
      if (hasContent) {
        const allOpenCells = new Set([...state.openCells]);
        allOpenCells.add(openKey);
        const playerCell2 = cellOf(state.player.x, state.player.y);
        const playerKey2 = cellKey(playerCell2.x, playerCell2.y);
        const futureCells = getConnectedCells(allOpenCells, playerKey2);
        const { minX: fMinX, minY: fMinY, maxX: fMaxX, maxY: fMaxY } = getCellBounds(futureCells);
        const fCols = fMaxX - fMinX + 1;
        const fRows = fMaxY - fMinY + 1;
        const battleWallPad = BATTLE_CELL_PX * 0.125;
        const battleW = fCols * BATTLE_CELL_PX + battleWallPad * 2;
        const battleH = fRows * BATTLE_CELL_PX + battleWallPad * 2;
        const staticScale = Math.min(VIEW_W / battleW, VIEW_H / battleH, 1);
        const toScale = staticScale * BATTLE_SCALE;
        const fCenterX = (fMinX + fCols / 2) * CP;
        const fCenterY = (fMinY + fRows / 2) * CP;
        const fromCenterX = camera.x + VIEW_W / 2;
        const fromCenterY = camera.y + VIEW_H / 2;

        zoomTransition = {
          fromCenterX, fromCenterY,
          toCenterX: fCenterX, toCenterY: fCenterY,
          fromScale: 1,
          toCamX: fCenterX - VIEW_W / (2 * toScale),
          toCamY: fCenterY - VIEW_H / (2 * toScale),
          toScale,
          t: 0,
          pendingCellKey: openKey,
          frozenAngle: Math.atan2(state.mouse.y - state.player.y, state.mouse.x - state.player.x),
        };
        Sounds.zoom();
        state.phase = 'zoom_transition';
      } else {
        saveGame();
      }
    }

    // ============================================================
    // GAME LOOP
    // ============================================================
    function loop(ts) {
      const dt = Math.min((ts - lastTime) / 1000, 0.05);
      lastTime = ts;

      // Music crossfades must run during pause (e.g. cursed choice after boss)
      Sounds.updateMusicFade(dt);

      if (paused) {
        if (state) {
          if (state.phase === 'play') draw(state);
          else if (state.phase === 'battle') drawBattle(state);
        }
        if (cursedChoiceState) {
          const ccs = cursedChoiceState;
          
          if (ccs.isClosing) {
            // Closing animation - ease-in slide down
            ccs.slideT = Math.min(1, ccs.slideT + dt / 0.5);
            if (ccs.slideT >= 1) {
              // Animation complete - apply upgrade and resume
              const selected = ccs.selectedUpgrade;
              const { chest, isBoss } = ccs;
              
              applyUpgrade(state, selected.id);
              if (chest) {
                chest.collected = true;
                state.cellContents.delete(chest.cellKey);
                addParticles(chest.x, chest.y, CONFIG.PICKUP_PARTICLES_COUNT, CONFIG.PICKUP_PARTICLES_SPEED, CONFIG.PICKUP_PARTICLES_LIFE, selected.color);
              }
              cursedChoiceState = null;
              
              if (isBoss) {
                // Boss victory - start zoom-out transition
                const b = state.battle;
                const battleCellX = Math.floor(b.player.x / BATTLE_CELL_PX);
                const battleCellY = Math.floor(b.player.y / BATTLE_CELL_PX);
                const mapCellX = battleCellX + b.cellOffsetX;
                const mapCellY = battleCellY + b.cellOffsetY;
                const localX = b.player.x - battleCellX * BATTLE_CELL_PX;
                const localY = b.player.y - battleCellY * BATTLE_CELL_PX;
                const playPX = mapCellX * CP + localX / BATTLE_SCALE;
                const playPY = mapCellY * CP + localY / BATTLE_SCALE;

                const fromScale = b.playZoomScale || (b.staticScale || 1) * BATTLE_SCALE;
                const zoneCX = b.playCenterX || playPX;
                const zoneCY = b.playCenterY || playPY;

                zoomOutTransition = {
                  fromScale, toScale: 1,
                  fromCenterX: zoneCX, fromCenterY: zoneCY,
                  toCenterX: playPX, toCenterY: playPY,
                  playerX: playPX, playerY: playPY,
                  t: 0,
                  frozenAngle: Math.atan2(state.mouse.y - playPY, state.mouse.x - playPX),
                };
                Sounds.zoom();
                state.phase = 'zoom_out_transition';
                resumeGame();
              } else {
                resumeGame();
              }
            } else {
              drawCursedChoice();
            }
          } else {
            // Opening animation or waiting
            if (ccs.selectionDelay > 0) {
              ccs.selectionDelay -= dt;
              // Animate slide from 0 to 1 over the delay period
              ccs.slideT = Math.min(1, ccs.slideT + dt / 1.5);
            } else {
              ccs.slideT = 1;
            }
            drawCursedChoice();
          }
        } else {
          drawPauseMenu();
        }
        animId = requestAnimationFrame(loop);
        return;
      }

      if (state && state.phase === 'play') {
        update(state, dt);
        draw(state);
      } else if (state && state.phase === 'zoom_transition') {
        // Анимация зума перед battle (1 сек)
        const ZOOM_DUR = 0.5;
        zoomTransition.t = Math.min(zoomTransition.t + dt, ZOOM_DUR);
        const zt = zoomTransition;
        const p = easeInOutQuad(zt.t / ZOOM_DUR);
        const curScale = zt.fromScale + (zt.toScale - zt.fromScale) * p;
        const curCenterX = zt.fromCenterX + (zt.toCenterX - zt.fromCenterX) * p;
        const curCenterY = zt.fromCenterY + (zt.toCenterY - zt.fromCenterY) * p;
        const curCamX = curCenterX - VIEW_W / (2 * curScale);
        const curCamY = curCenterY - VIEW_H / (2 * curScale);
        camera.x = curCamX;
        camera.y = curCamY;
        drawZoom(state, curScale, curCamX, curCamY, zt.t / ZOOM_DUR, zt.pendingCellKey, zt.frozenAngle);

        if (zt.t >= ZOOM_DUR) {
          if (zt.isBossBattle) {
            enterBossBattleMode(state);
          } else {
            enterBattleMode(state, zt.pendingCellKey);
          }
          zoomTransition = null;
        }
      } else if (state && state.phase === 'zoom_out_transition' && zoomOutTransition) {
        // Анимация zoom-out из battle на карту (1 сек)
        const ZOOM_OUT_DUR = 0.5;
        zoomOutTransition.t = Math.min(zoomOutTransition.t + dt, ZOOM_OUT_DUR);
        const zot = zoomOutTransition;
        const p = easeInOutQuad(zot.t / ZOOM_OUT_DUR);
        const curScale = zot.fromScale + (zot.toScale - zot.fromScale) * p;
        const curCenterX = zot.fromCenterX + (zot.toCenterX - zot.fromCenterX) * p;
        const curCenterY = zot.fromCenterY + (zot.toCenterY - zot.fromCenterY) * p;
        const curCamX = curCenterX - VIEW_W / (2 * curScale);
        const curCamY = curCenterY - VIEW_H / (2 * curScale);
        camera.x = curCamX;
        camera.y = curCamY;
        drawZoomOut(state, curScale, curCamX, curCamY, zot.t / ZOOM_OUT_DUR, zot.playerX, zot.playerY, zot.frozenAngle);

        if (zot.t >= ZOOM_OUT_DUR) {
          exitBattleMode(state);
          zoomOutTransition = null;
          saveGame();
        }
      } else if (state && state.phase === 'battle') {
        updateBattle(state, dt);
        drawBattle(state);
      } else if (state && state.phase === 'level_complete') {
        draw(state);
        const levelCfg = getLevelConfig(currentLevel);
        showOverlay('УРОВЕНЬ ПРОЙДЕН!', '#00ff88',
          [`Собрано сердечек: ${state.heartsCollected}/${levelCfg.heartsCount}`, `Время: ${Math.round(state.time)}с`],
          'СЛЕДУЮЩИЙ УРОВЕНЬ', 'nextLevel');
        state.phase = 'stopped';
      } else if (state && state.phase === 'win') {
        draw(state);
        Sounds.ambienceStop();
        showOverlay('ПОБЕДА!', '#ffd700',
          [`Все уровни пройдены!`, `Общее время: ${Math.round(state.time)}с`],
          'ИГРАТЬ СНОВА', 'startGame');
        state.phase = 'stopped';
      } else if (state && state.phase === 'dead') {
        // Если умерли в battle mode, рисуем battle экран
        if (state.battle) {
          drawBattle(state);
        } else {
          draw(state);
        }
        const levelCfg = getLevelConfig(currentLevel);
        Sounds.stopGameMusic();
        Sounds.ambienceStop();
        const saveExists = hasSave();
        showOverlay('GAME OVER', '#ff3a3a',
          ['Жизни закончились!', `Собрано сердечек: ${state.heartsCollected}/${levelCfg.heartsCount}`, `Время: ${Math.round(state.time)}с`],
          saveExists ? 'ПОПРОБОВАТЬ СНОВА' : 'НАЧАТЬ ИГРУ', saveExists ? 'continueGame' : 'startGame');
        state.phase = 'stopped';
      }

      animId = requestAnimationFrame(loop);
    }

