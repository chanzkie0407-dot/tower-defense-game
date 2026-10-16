(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);

  const W = canvas.width, H = canvas.height;
  const PATH_WIDTH = 58;
  const WAYPOINTS = [
    { x: -20, y: 115 }, { x: 155, y: 115 }, { x: 155, y: 275 },
    { x: 340, y: 275 }, { x: 340, y: 105 }, { x: 530, y: 105 },
    { x: 530, y: 400 }, { x: 715, y: 400 }, { x: 715, y: 230 },
    { x: 835, y: 230 }, { x: 920, y: 230 }
  ];
  const TOWER_TYPES = {
    archer: { name: "Archer", icon: "🏹", cost: 60, range: 145, damage: 14, cooldown: .62, projectile: "#ffe29a", speed: 390 },
    mage:   { name: "Mage", icon: "🔮", cost: 90, range: 125, damage: 28, cooldown: 1.05, projectile: "#9fe8ff", speed: 300 },
    cannon: { name: "Druid", icon: "💣", cost: 120, range: 112, damage: 22, cooldown: 1.3, projectile: "#c4f08c", speed: 250, splash: 42 }
  };
  const COLORS = { grass1: "#547c42", grass2: "#5b8547", grass3: "#4d753d", road: "#b99b68", roadEdge: "#806a4a" };

  let gold = 180, lives = 20, wave = 0, kills = 0;
  let towers = [], enemies = [], projectiles = [], particles = [];
  let selectedTowerType = "archer", selectedTower = null;
  let waveActive = false, paused = false, gameOver = false;
  let spawnRemaining = 0, spawnTimer = 0, lastTime = 0, elapsed = 0;
  let soundOn = false, audioContext = null, nextId = 1;
  let bestWave = 0;
  try { bestWave = Number(localStorage.getItem("fantasyTDBestWave") || 0); } catch (_) {}

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function pointOnPath(progress) {
    let remaining = progress;
    for (let i = 0; i < WAYPOINTS.length - 1; i++) {
      const a = WAYPOINTS[i], b = WAYPOINTS[i + 1];
      const len = distance(a, b);
      if (remaining <= len) {
        const t = len === 0 ? 0 : remaining / len;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      remaining -= len;
    }
    return { ...WAYPOINTS[WAYPOINTS.length - 1] };
  }
  const pathLength = WAYPOINTS.slice(0, -1).reduce((sum, p, i) => sum + distance(p, WAYPOINTS[i + 1]), 0);

  function beep(frequency = 500, duration = .07, type = "sine") {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      osc.type = type; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.045, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      osc.connect(gain); gain.connect(audioContext.destination);
      osc.start(); osc.stop(audioContext.currentTime + duration);
    } catch (_) {}
  }

  function setStatus(text) { $("statusText").textContent = text; }
  function updateHud() {
    $("gold").textContent = gold;
    $("lives").textContent = lives;
    $("wave").textContent = wave;
    $("enemyCount").textContent = enemies.length + spawnRemaining;
    $("startWaveBtn").textContent = waveActive ? "Wave in Progress…" : `▶ Start Wave ${wave + 1}`;
    $("startWaveBtn").disabled = waveActive || gameOver;
    $("pauseBtn").disabled = !waveActive || gameOver;
    $("pauseBtn").textContent = paused ? "▶ Resume" : "Ⅱ Pause";
    updateTowerInfo();
  }
  function showOverlay(title, text, buttonText, show = true) {
    $("overlayTitle").textContent = title;
    $("overlayText").textContent = text;
    $("overlayStart").textContent = buttonText;
    $("overlay").classList.toggle("hidden", !show);
  }
  function updateTowerInfo() {
    const info = $("towerInfo"), up = $("upgradeBtn"), sell = $("sellBtn");
    if (!selectedTower || !towers.includes(selectedTower)) {
      selectedTower = null;
      info.textContent = "Tap one of your towers to inspect it.";
      up.disabled = true; sell.disabled = true;
      up.textContent = "⬆ Upgrade";
      return;
    }
    const t = selectedTower, spec = TOWER_TYPES[t.type];
    const cost = upgradeCost(t);
    info.innerHTML = `<strong>${spec.icon} ${spec.name} · Level ${t.level}</strong><br>Damage: ${Math.round(t.damage)} · Range: ${Math.round(t.range)} · Next upgrade: 🪙 ${cost}`;
    up.disabled = gold < cost || t.level >= 4 || gameOver;
    up.textContent = t.level >= 4 ? "MAX LEVEL" : `⬆ Upgrade · ${cost}g`;
    sell.disabled = gameOver;
  }
  function upgradeCost(t) { return Math.round(TOWER_TYPES[t.type].cost * (.62 + t.level * .52)); }

  function startWave() {
    if (waveActive || gameOver) return;
    wave++;
    waveActive = true;
    paused = false;
    spawnRemaining = 7 + wave * 3;
    spawnTimer = .15;
    setStatus(`Wave ${wave}: enemies approaching!`);
    showOverlay("", "", "", false);
    beep(620, .12, "triangle");
    updateHud();
  }

  function makeEnemy() {
    const boss = wave % 5 === 0 && spawnRemaining === 1;
    const tough = wave >= 3 && Math.random() < Math.min(.38, .12 + wave * .015);
    const hp = (boss ? 260 : tough ? 75 : 34) * (1 + (wave - 1) * .19);
    const speed = (boss ? 30 : tough ? 43 : 48) * (1 + Math.min(.55, (wave - 1) * .018));
    const p = pointOnPath(0);
    enemies.push({
      id: nextId++, x: p.x, y: p.y, progress: 0, hp, maxHp: hp,
      speed, radius: boss ? 20 : tough ? 15 : 12, reward: boss ? 45 : tough ? 15 : 8,
      color: boss ? "#9e55c7" : tough ? "#b84f45" : "#5a9e55",
      boss, tough, dead: false
    });
  }

  function placeTower(x, y) {
    const spec = TOWER_TYPES[selectedTowerType];
    if (gold < spec.cost) { setStatus(`Not enough gold. ${spec.name} costs ${spec.cost}.`); beep(160,.08); return; }
    if (isOnPath(x, y)) { setStatus("You cannot build on the road!"); beep(160,.08); return; }
    if (towers.some(t => distance(t, {x,y}) < 38)) { setStatus("That spot is too close to another tower."); return; }
    if (x < 25 || x > W - 25 || y < 25 || y > H - 25) return;
    gold -= spec.cost;
    const t = { id: nextId++, x, y, type: selectedTowerType, level: 1,
      range: spec.range, damage: spec.damage, cooldown: 0, totalSpent: spec.cost };
    towers.push(t);
    selectedTower = t;
    setStatus(`${spec.name} tower built! Select it to upgrade.`);
    beep(680,.07,"triangle");
    updateHud();
  }

  function isOnPath(x, y) {
    for (let i = 0; i < WAYPOINTS.length - 1; i++) {
      const a = WAYPOINTS[i], b = WAYPOINTS[i+1];
      const vx = b.x - a.x, vy = b.y - a.y;
      const len2 = vx*vx + vy*vy;
      const t = clamp(((x-a.x)*vx + (y-a.y)*vy) / len2, 0, 1);
      if (distance({x,y}, {x:a.x+t*vx, y:a.y+t*vy}) < PATH_WIDTH/2 + 10) return true;
    }
    return false;
  }

  function upgradeSelected() {
    const t = selectedTower;
    if (!t || !towers.includes(t) || t.level >= 4) return;
    const cost = upgradeCost(t);
    if (gold < cost) { setStatus("Not enough gold for that upgrade."); return; }
    gold -= cost; t.totalSpent += cost; t.level++;
    t.damage *= 1.55; t.range += 13; t.cooldown = Math.max(0, t.cooldown);
    setStatus(`${TOWER_TYPES[t.type].name} upgraded to level ${t.level}!`);
    beep(760,.1,"triangle"); updateHud();
  }
  function sellSelected() {
    if (!selectedTower) return;
    gold += Math.floor(selectedTower.totalSpent * .65);
    towers = towers.filter(t => t !== selectedTower);
    selectedTower = null;
    setStatus("Tower sold for 65% of its cost.");
    beep(340,.08); updateHud();
  }

  function fireTower(t, enemy) {
    const spec = TOWER_TYPES[t.type];
    projectiles.push({ x:t.x, y:t.y, target:enemy, speed:spec.speed, damage:t.damage,
      color:spec.projectile, splash:spec.splash || 0, type:t.type, dead:false });
    t.cooldown = spec.cooldown * Math.max(.48, 1 - (t.level - 1) * .1);
    if (t.type === "mage") beep(780,.035,"sine");
    else if (t.type === "cannon") beep(210,.05,"triangle");
    else beep(430,.025,"square");
  }

  function damageEnemy(enemy, damage, splash = 0) {
    if (!enemy || enemy.dead) return;
    const victims = splash ? enemies.filter(e => !e.dead && distance(e, enemy) <= splash) : [enemy];
    for (const victim of victims) {
      victim.hp -= damage;
      for (let i = 0; i < 3; i++) particles.push({x:victim.x,y:victim.y,vx:(Math.random()-.5)*65,vy:(Math.random()-.5)*65,life:.22,color:"#ffe7a1"});
      if (victim.hp <= 0 && !victim.dead) {
        victim.dead = true; gold += victim.reward; kills++;
        setStatus(`Enemy defeated! +${victim.reward} gold`);
        beep(560,.04,"triangle");
      }
    }
  }

  function update(dt) {
    elapsed += dt;
    if (waveActive) {
      spawnTimer -= dt;
      if (spawnRemaining > 0 && spawnTimer <= 0) {
        makeEnemy(); spawnRemaining--;
        spawnTimer = Math.max(.34, .92 - wave * .025);
      }
    }
    for (const e of enemies) {
      if (e.dead) continue;
      e.progress += e.speed * dt;
      const p = pointOnPath(e.progress);
      e.x = p.x; e.y = p.y;
      if (e.progress >= pathLength) {
        e.dead = true; lives -= e.boss ? 4 : 1;
        setStatus(e.boss ? "A boss reached the castle! -4 lives" : "An enemy reached the castle! -1 life");
        beep(120,.16,"sawtooth");
      }
    }
    enemies = enemies.filter(e => !e.dead);

    for (const t of towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const candidates = enemies.filter(e => distance(t,e) <= t.range).sort((a,b) => b.progress-a.progress);
      if (candidates.length) fireTower(t, candidates[0]);
    }

    for (const p of projectiles) {
      if (p.dead) continue;
      if (!p.target || p.target.dead) { p.dead = true; continue; }
      const dx = p.target.x-p.x, dy=p.target.y-p.y, d=Math.hypot(dx,dy);
      if (d < p.speed*dt + p.target.radius) {
        damageEnemy(p.target,p.damage,p.splash);
        p.dead = true;
      } else {
        p.x += dx/d*p.speed*dt; p.y += dy/d*p.speed*dt;
      }
    }
    projectiles = projectiles.filter(p => !p.dead);
    for (const p of particles) { p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);

    if (lives <= 0) {
      lives = 0; gameOver = true; waveActive = false; paused = false;
      setStatus(`The realm has fallen. You reached wave ${wave}.`);
      showOverlay("The Realm Has Fallen", `You survived until wave ${wave} and defeated ${kills} enemies. Build a new defense and try again!`, "Play Again");
    } else if (waveActive && spawnRemaining === 0 && enemies.length === 0) {
      waveActive = false;
      const bonus = 20 + wave * 4;
      gold += bonus;
      bestWave = Math.max(bestWave, wave);
      try { localStorage.setItem("fantasyTDBestWave", String(bestWave)); } catch (_) {}
      setStatus(`Wave ${wave} cleared! Bonus: ${bonus} gold. Prepare for the next wave.`);
      showOverlay(`Wave ${wave} Cleared!`, `Well defended, commander! You earned ${bonus} bonus gold. Upgrade your towers before the next wave.`, `Start Wave ${wave+1}`);
      beep(880,.18,"triangle");
    }
    updateHud();
  }

  function drawPath() {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(WAYPOINTS[0].x,WAYPOINTS[0].y);
    WAYPOINTS.slice(1).forEach(p => ctx.lineTo(p.x,p.y));
    ctx.strokeStyle = COLORS.roadEdge; ctx.lineWidth = PATH_WIDTH+12; ctx.stroke();
    ctx.strokeStyle = COLORS.road; ctx.lineWidth = PATH_WIDTH; ctx.stroke();
    ctx.setLineDash([13,17]); ctx.strokeStyle = "#e0c99a"; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
  }

  function drawCastle() {
    const x=820, y=177;
    ctx.fillStyle="#d9d0a7"; ctx.fillRect(x,y,66,108);
    ctx.fillStyle="#7c6650"; ctx.fillRect(x+24,y+59,19,49);
    ctx.fillStyle="#b9ad7b"; ctx.fillRect(x-7,y-10,22,36); ctx.fillRect(x+51,y-10,22,36);
    ctx.fillStyle="#6f8652";
    for (let i=0;i<3;i++) { ctx.beginPath(); ctx.moveTo(x-9+i*28,y-10); ctx.lineTo(x+2+i*28,y-29); ctx.lineTo(x+13+i*28,y-10); ctx.fill(); }
    ctx.fillStyle="#d9b64d"; ctx.font="bold 13px Inter"; ctx.textAlign="center"; ctx.fillText("CASTLE",x+33,y+125);
  }

  function drawBackground() {
    ctx.fillStyle = COLORS.grass1; ctx.fillRect(0,0,W,H);
    for (let y=0;y<H;y+=42) for (let x=0;x<W;x+=42) {
      const n=(Math.sin(x*12.9898+y*78.233)*43758.5453)%1;
      ctx.fillStyle = n>.35 ? COLORS.grass2 : COLORS.grass3;
      ctx.globalAlpha=.23; ctx.fillRect(x+((y/42)%2)*13,y,20,16); ctx.globalAlpha=1;
    }
    // Decorative shrubs away from the road.
    for (const [x,y] of [[52,45],[250,55],[430,205],[600,50],[80,350],[270,470],[450,490],[610,500],[780,500],[860,65]]) {
      if (isOnPath(x,y)) continue;
      ctx.fillStyle="#335d36"; ctx.beginPath(); ctx.arc(x,y,13,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#67994d"; ctx.beginPath(); ctx.arc(x-4,y-4,8,0,Math.PI*2); ctx.fill();
    }
    drawPath(); drawCastle();
  }

  function drawTower(t) {
    const spec=TOWER_TYPES[t.type];
    if (selectedTower===t) {
      ctx.beginPath(); ctx.arc(t.x,t.y,t.range,0,Math.PI*2);
      ctx.fillStyle="#d7f0a0"; ctx.globalAlpha=.10; ctx.fill(); ctx.globalAlpha=1;
      ctx.strokeStyle="#f6d875"; ctx.lineWidth=1.5; ctx.setLineDash([6,5]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle="#443b2a"; ctx.beginPath(); ctx.ellipse(t.x,t.y+9,19,12,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=t.type==="archer"?"#9b7047":t.type==="mage"?"#5863a3":"#68894c";
    ctx.beginPath(); ctx.arc(t.x,t.y,17,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#e6d6a3"; ctx.lineWidth=2; ctx.stroke();
    ctx.font="22px serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(spec.icon,t.x,t.y-1);
    if (t.level>1) {
      ctx.fillStyle="#f7d46e"; ctx.beginPath(); ctx.arc(t.x+14,t.y-14,8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#38290b"; ctx.font="bold 10px Inter"; ctx.fillText(t.level,t.x+14,t.y-13);
    }
  }

  function drawEnemy(e) {
    // Shadow and stylized fantasy monster.
    ctx.fillStyle="#27301e88"; ctx.beginPath(); ctx.ellipse(e.x,e.y+7,e.radius*1.05,e.radius*.62,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=e.color; ctx.beginPath(); ctx.arc(e.x,e.y,e.radius,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=e.boss?"#f3d3ff":"#f4f1d9";
    ctx.beginPath(); ctx.arc(e.x-e.radius*.33,e.y-2,2.5,0,Math.PI*2); ctx.arc(e.x+e.radius*.33,e.y-2,2.5,0,Math.PI*2); ctx.fill();
    if (e.tough || e.boss) {
      ctx.strokeStyle="#d7c5a2"; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(e.x-e.radius*.65,e.y-e.radius*.45); ctx.lineTo(e.x-e.radius,e.y-e.radius-5); ctx.moveTo(e.x+e.radius*.65,e.y-e.radius*.45); ctx.lineTo(e.x+e.radius,e.y-e.radius-5); ctx.stroke();
    }
    const bw=e.radius*2.5, bh=4, ratio=clamp(e.hp/e.maxHp,0,1);
    ctx.fillStyle="#432d28"; ctx.fillRect(e.x-bw/2,e.y-e.radius-10,bw,bh);
    ctx.fillStyle=ratio>.5?"#8ee077":ratio>.25?"#f2c55e":"#ee6b5c";
    ctx.fillRect(e.x-bw/2,e.y-e.radius-10,bw*ratio,bh);
    if (e.boss) { ctx.fillStyle="#fff0b2"; ctx.font="bold 11px Inter"; ctx.textAlign="center"; ctx.fillText("BOSS",e.x,e.y-e.radius-16); }
  }

  function draw() {
    drawBackground();
    for (const t of towers) drawTower(t);
    for (const e of enemies) drawEnemy(e);
    for (const p of projectiles) {
      ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.type==="cannon"?6:4,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    }
    for (const p of particles) {
      ctx.globalAlpha=clamp(p.life/.22,0,1); ctx.fillStyle=p.color;
      ctx.fillRect(p.x,p.y,3,3); ctx.globalAlpha=1;
    }
    if (paused) {
      ctx.fillStyle="#08120cb8"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#fff2c9"; ctx.textAlign="center"; ctx.font="bold 36px Cinzel, Georgia, serif";
      ctx.fillText("PAUSED",W/2,H/2);
    }
  }

  function frame(timestamp) {
    const dt=Math.min(.035, (timestamp-lastTime)/1000 || 0);
    lastTime=timestamp;
    if (!paused && !gameOver) update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function canvasPoint(event) {
    const rect=canvas.getBoundingClientRect();
    return { x:(event.clientX-rect.left)*W/rect.width, y:(event.clientY-rect.top)*H/rect.height };
  }
  canvas.addEventListener("pointerdown", event => {
    const p=canvasPoint(event);
    // Select a tower if tapped near it.
    const hit=[...towers].reverse().find(t=>distance(t,p)<24);
    if (hit) {
      selectedTower=hit;
      setStatus(`${TOWER_TYPES[hit.type].name} selected. Upgrade it or sell it.`);
      updateHud(); return;
    }
    selectedTower=null;
    placeTower(p.x,p.y);
  });

  document.querySelectorAll(".tower-option").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedTowerType=btn.dataset.tower;
      document.querySelectorAll(".tower-option").forEach(b=>b.classList.toggle("selected",b===btn));
      const s=TOWER_TYPES[selectedTowerType];
      $("buildHint").textContent=`${s.name} selected · ${s.cost} gold. Tap empty grass to build.`;
      selectedTower=null; updateHud();
    });
  });
  $("upgradeBtn").addEventListener("click",upgradeSelected);
  $("sellBtn").addEventListener("click",sellSelected);
  $("startWaveBtn").addEventListener("click",startWave);
  $("overlayStart").addEventListener("click", () => {
    if (gameOver) restartGame();
    else startWave();
  });
  $("pauseBtn").addEventListener("click", () => {
    if (!waveActive || gameOver) return;
    paused=!paused;
    setStatus(paused?"Game paused.":"Back to defending the realm.");
    updateHud();
  });
  $("soundBtn").addEventListener("click", () => {
    soundOn=!soundOn;
    $("soundBtn").textContent=soundOn?"🔊 Sound: On":"🔊 Sound: Off";
    $("soundBtn").setAttribute("aria-pressed",String(soundOn));
    beep(540,.07);
  });

  function restartGame() {
    gold=180; lives=20; wave=0; kills=0;
    towers=[]; enemies=[]; projectiles=[]; particles=[];
    selectedTower=null; selectedTowerType="archer";
    waveActive=false; paused=false; gameOver=false;
    spawnRemaining=0; spawnTimer=0;
    document.querySelectorAll(".tower-option").forEach(b=>b.classList.toggle("selected",b.dataset.tower==="archer"));
    $("buildHint").textContent="Archer selected. Tap an empty grass tile to build.";
    setStatus("Ready to defend the realm");
    showOverlay("Defend the Realm!","Build towers beside the road, then start the first wave. Don't let the monsters reach the castle.","Start First Wave");
    updateHud();
  }
  $("restartBtn").addEventListener("click",restartGame);

  updateHud();
  draw();
  requestAnimationFrame(frame);
})();
