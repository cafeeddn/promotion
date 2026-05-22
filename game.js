// ================================================================
// game.js  –  To Eternal Dream 메인 게임 로직
// ================================================================

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ── 이미지 사전 로드 ──
const IMGS = {};
function preloadImages(callback) {
  const keys = [
    'ticket_night', 'ticket_day', 'ticket_evening',
    'bg_title', 'bg_tutorial', 'bg_play', 'bg_result',
    'balloon', 'flame', 'pause_btn', 'go_off', 'go_hover',
    'score_ticket_l', 'score_ticket_r',
  ];
  let loaded = 0;
  const done = () => { if (++loaded === keys.length && callback) callback(); };
  keys.forEach(k => {
    const img = new Image();
    img.onload  = done;
    img.onerror = done;  // 실패해도 카운트
    img.src = ASSET_SRCS[k];
    IMGS[k] = img;
  });
}

// ── 게임 상태 ──
let tickets     = [];
let effects     = [];
let floatTexts  = [];
let slashPoints = [];
let pieces      = [];

let score    = 0;
let lives    = 3;
let running  = false;
let paused   = false;
let spawnInterval = null;
let combo    = 0;
let comboTimer   = null;

// ── 티켓 타입 ──
const TICKET_TYPES = [
  { key: 'ticket_night',   mustCut: true,  weight: 5 },
  { key: 'ticket_day',     mustCut: false, weight: 2 },
  { key: 'ticket_evening', mustCut: false, weight: 2 },
];

function pickType() {
  const total = TICKET_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of TICKET_TYPES) { r -= t.weight; if (r <= 0) return t; }
  return TICKET_TYPES[0];
}

// ────────────────────────────────────────────
// 배경 그리기
// ────────────────────────────────────────────
function drawPlayBackground() {
  const CW = 960, CH = 540;
  if (IMGS.bg_play && IMGS.bg_play.complete) {
    ctx.drawImage(IMGS.bg_play, 0, 0, CW, CH);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, '#ccdded'); g.addColorStop(1, '#ddeaf5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  }
}

// ────────────────────────────────────────────
// 티켓 생성 / 업데이트 / 그리기
// ────────────────────────────────────────────
function createTicket() {
  if (!running || paused) return;
  const t = pickType();
  const W = 160, H = 90;
  const CW = 960, CH = 540;

  const dir = Math.floor(Math.random() * 5);
  let x, y, vx, vy;

  if (dir === 0) {
    x  = Math.random() * (CW - W - 60) + 40;
    y  = CH + 10;
    vx = (Math.random() - 0.5) * 3;
    vy = -10 - Math.random() * 3;
  } else if (dir === 1) {
    x  = -W - 10;
    y  = CH * (0.4 + Math.random() * 0.4);
    vx = 6 + Math.random() * 3;
    vy = -7 - Math.random() * 4;
  } else if (dir === 2) {
    x  = CW + 10;
    y  = CH * (0.4 + Math.random() * 0.4);
    vx = -(6 + Math.random() * 3);
    vy = -7 - Math.random() * 4;
  } else if (dir === 3) {
    x  = -W - 10;
    y  = CH + 10;
    vx = 7 + Math.random() * 2;
    vy = -11 - Math.random() * 3;
  } else {
    x  = CW + 10;
    y  = CH + 10;
    vx = -(7 + Math.random() * 2);
    vy = -11 - Math.random() * 3;
  }

  tickets.push({
    x, y, vx, vy,
    w: W, h: H,
    rot: (Math.random() - 0.5) * 0.3,
    type:    t.key,
    mustCut: t.mustCut,
    cut:     false,
    missed:  false,
  });
}

function updateTickets() {
  const CW = 960, CH = 540;
  tickets.forEach(t => {
    t.x += t.vx; t.y += t.vy; t.vy += 0.18;
    if (!t.cut && !t.missed) {
      const out = t.y > CH + 80
               || t.x < -t.w - 80
               || t.x > CW + 80;
      if (out) t.missed = true;
    }
  });
  tickets = tickets.filter(t =>
    t.y < CH + 100 &&
    t.x > -t.w - 100 &&
    t.x < CW + 100
  );
}

function drawTickets() {
  tickets.forEach(t => {
    if (t.cut) return;
    ctx.save();
    ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
    ctx.rotate(t.rot);
    const im = IMGS[t.type];
    if (im && im.complete) ctx.drawImage(im, -t.w / 2, -t.h / 2, t.w, t.h);
    else { ctx.fillStyle = '#2a2060'; ctx.fillRect(-t.w / 2, -t.h / 2, t.w, t.h); }
    ctx.restore();
  });
}

// ────────────────────────────────────────────
// 잘린 조각
// ────────────────────────────────────────────
function spawnPieces(t, slashX) {
  const cx = t.x + t.w / 2;
  const localX = (slashX - cx) * Math.cos(t.rot);
  const splitRatio = Math.max(0.2, Math.min(0.8, (localX + t.w / 2) / t.w));

  const base = {
    img: IMGS[t.type],
    x: t.x, y: t.y, w: t.w, h: t.h,
    rot: t.rot, vy: t.vy + 1, gravity: 0.28, life: 45,
  };
  pieces.push({ ...base, vx: t.vx - 2 - Math.random(), vrot: -0.08 - Math.random() * 0.06, clipL: 0,          clipR: splitRatio });
  pieces.push({ ...base, vx: t.vx + 2 + Math.random(), vrot:  0.08 + Math.random() * 0.06, clipL: splitRatio, clipR: 1 });
}

function updatePieces() {
  pieces.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.rot += p.vrot; p.life--;
  });
  pieces = pieces.filter(p => p.life > 0 && p.y < canvas.height + 100);
}

function drawPieces() {
  pieces.forEach(p => {
    if (!p.img || !p.img.complete) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life / 15);
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(p.rot);
    ctx.beginPath();
    ctx.rect(-p.w / 2 + p.clipL * p.w, -p.h / 2, (p.clipR - p.clipL) * p.w, p.h);
    ctx.clip();
    ctx.drawImage(p.img, -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  });
}

// ────────────────────────────────────────────
// 슬래시 / 이펙트 / 플로팅 텍스트
// ────────────────────────────────────────────
function drawSlash() {
  if (slashPoints.length < 2) return;
  for (let i = 1; i < slashPoints.length; i++) {
    const p1 = slashPoints[i - 1], p2 = slashPoints[i];
    const a = Math.min(p1.life / 12, 1);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = `rgba(160,230,255,${a})`; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
  }
}

function drawEffects() {
  effects.forEach(e => {
    ctx.save(); ctx.globalAlpha = e.life / 20;
    if (e.good) {
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + e.life * 0.1;
        const len = 18 + (20 - e.life) * 1.8;
        ctx.beginPath(); ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(ang) * len, e.y + Math.sin(ang) * len); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = '#ff5555'; ctx.lineWidth = 4;
      const s = 16;
      ctx.beginPath(); ctx.moveTo(e.x-s,e.y-s); ctx.lineTo(e.x+s,e.y+s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.x+s,e.y-s); ctx.lineTo(e.x-s,e.y+s); ctx.stroke();
    }
    ctx.restore();
  });
  effects = effects.filter(e => --e.life > 0);
}

function drawFloats() {
  floatTexts.forEach(f => {
    ctx.save();
    ctx.globalAlpha = f.life / 30;
    ctx.font = `bold ${f.size}px 'Caveat', cursive`;
    ctx.fillStyle = f.color; ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
    f.y -= 1.5; f.life--;
    ctx.restore();
  });
  floatTexts = floatTexts.filter(f => f.life > 0);
}

// ────────────────────────────────────────────
// 목숨
// ────────────────────────────────────────────
function loseLife() {
  if (lives <= 0) return;
  lives--;
  const el = document.getElementById('life' + lives);
  if (el) {
    // 풍선 → 불꽃 이미지로 교체 (터지는 표현)
    el.src = ASSET_SRCS.flame;
    el.style.animation = 'flamePop .6s forwards';
    setTimeout(() => {
      el.style.animation = '';
      el.style.opacity = '0.3';
    }, 600);
  }
  if (lives <= 0) setTimeout(gameOver, 400);
}

// ────────────────────────────────────────────
// 슬라이스 판정
// ────────────────────────────────────────────
function slice(x, y) {
  slashPoints.push({ x, y, life: 12 });

  tickets = tickets.filter(t => {
    if (t.cut) return false;
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const cos = Math.cos(-t.rot), sin = Math.sin(-t.rot);
    const dx = x - cx, dy = y - cy;
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    const hit = Math.abs(lx) < t.w / 2 && Math.abs(ly) < t.h / 2;

    if (hit) {
      t.cut = true;
      spawnPieces(t, x);
      const ex = t.x + t.w / 2, ey = t.y + t.h / 2;

      if (t.mustCut) {
        score++;
        combo++;
        clearTimeout(comboTimer);
        comboTimer = setTimeout(() => { combo = 0; updateCombo(0); }, 1500);
        document.getElementById('score').innerText = score;
        effects.push({ x: ex, y: ey, life: 20, good: true });
        floatTexts.push({
          x: ex, y: t.y - 10,
          text: combo >= 2 ? `+1  COMBO x${combo}!` : '+1',
          color: '#ffe066', size: combo >= 2 ? 22 : 18, life: 30,
        });
        if (combo >= 2) updateCombo(combo);
      } else {
        loseLife();
        effects.push({ x: ex, y: ey, life: 18, good: false });
        floatTexts.push({ x: ex, y: t.y - 10, text: 'Miss!', color: '#ff6666', size: 20, life: 30 });
        combo = 0; updateCombo(0);
      }
      return false;
    }
    return true;
  });
}

function updateCombo(n) {
  const el = document.getElementById('comboEl');
  if (n >= 2) { el.innerText = `COMBO x${n}!`; el.style.opacity = '1'; }
  else el.style.opacity = '0';
}

// ────────────────────────────────────────────
// 점수 HUD (canvas에 직접 그리기)
// ────────────────────────────────────────────
function drawScoreHUD() {
  const cx = 960 / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;

  // SCORE 라벨
  ctx.font = 'bold 13px "Noto Sans KR"';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText('SCORE', cx, 20);

  // 숫자
  ctx.font = 'bold 56px "Noto Sans KR"';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 10;
  ctx.fillText(score, cx, 72);

  ctx.restore();
}

// ────────────────────────────────────────────
// 메인 루프
// ────────────────────────────────────────────
function loop() {
  if (!running) return;
  if (!paused) {
    updateTickets();
    updatePieces();
    slashPoints.forEach(p => p.life--);
    slashPoints = slashPoints.filter(p => p.life > 0);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlayBackground();
    drawPieces();
    drawTickets();
    drawEffects();
    drawSlash();
    drawFloats();
    drawScoreHUD();
  }
  requestAnimationFrame(loop);
}

// ────────────────────────────────────────────
// 화면 전환
// ────────────────────────────────────────────
function showOnly(id) {
  ['titleScreen','tutorialScreen','pauseScreen','gameOverScreen'].forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('active');
  });
  document.getElementById('hud').classList.add('hidden');
  if (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    if (id === 'gameOverScreen') el.classList.add('active');
  }
}

function startGame() {
  tickets = []; effects = []; slashPoints = []; floatTexts = []; pieces = [];
  score = 0; lives = 3; combo = 0;
  running = true; paused = false;

  document.getElementById('score').innerText = 0;
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById('life' + i);
    el.src = ASSET_SRCS.balloon;
    el.style.opacity = '1';
    el.style.animation = '';
  }

  showOnly(null);
  document.getElementById('hud').classList.remove('hidden');
  clearTimeout(spawnInterval);

  // 난이도 상승: 10초마다 스폰 간격 단축, 후반엔 2~3개 동시 스폰
  let gameStartTime = Date.now();
  function spawnTick() {
    if (!running || paused) return;
    const elapsed = (Date.now() - gameStartTime) / 1000; // 경과 초

    // 스폰 간격: 처음 1800ms → 30초 후 900ms
    const interval = Math.max(900, 1800 - elapsed * 15);

    // 동시 스폰 수: 0~20초=1개, 20~40초=1~2개, 40초+=2~3개
    let count = 1;
    if (elapsed > 40) count = Math.random() < 0.5 ? 2 : 3;
    else if (elapsed > 20) count = Math.random() < 0.4 ? 2 : 1;

    for (let i = 0; i < count; i++) {
      setTimeout(createTicket, i * 200); // 살짝 시차 두고 스폰
    }

    spawnInterval = setTimeout(spawnTick, interval);
  }
  spawnTick();
  loop();
}

function drawGameOverCanvas() {
  if (IMGS.bg_result && IMGS.bg_result.complete) {
    ctx.drawImage(IMGS.bg_result, 0, 0, canvas.width, canvas.height);
  } else {
    // 폴백: 티켓 흩뿌리기
    ctx.fillStyle = '#0a0818';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const types = ['ticket_night', 'ticket_day', 'ticket_evening'];
    for (let i = 0; i < 20; i++) {
      const im = IMGS[types[i % 3]];
      if (!im || !im.complete) continue;
      ctx.save();
      ctx.translate(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.rotate((Math.random() - 0.5) * 1.4);
      ctx.globalAlpha = 0.65 + Math.random() * 0.3;
      ctx.drawImage(im, -80, -45, 160, 90);
      ctx.restore();
    }
  }
  // 어두운 오버레이
  const ov = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ov.addColorStop(0, 'rgba(8,6,28,0.45)');
  ov.addColorStop(1, 'rgba(8,6,28,0.65)');
  ctx.fillStyle = ov;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function gameOver() {
  running = false;
  clearTimeout(spawnInterval);
  document.getElementById('finalScore').innerText = score;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGameOverCanvas();
  showOnly('gameOverScreen');
  document.getElementById('hud').classList.remove('hidden');
}

// ────────────────────────────────────────────
// UI 이벤트 & 초기화
// ────────────────────────────────────────────
function initUI() {
  // ── DPR(고해상도) 처리 ──
  const dpr = window.devicePixelRatio || 1;
  const W   = 960, H = 540;   // 16:9 논리 크기
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  // style은 CSS가 100%로 잡아줌 - 고정 px 지정하면 뷰포트 크기와 불일치
  ctx.scale(dpr, dpr);

  // 타이틀 배경을 캔버스에 그리기
  function drawTitleCanvas() {
    if (IMGS.bg_title && IMGS.bg_title.complete) {
      ctx.drawImage(IMGS.bg_title, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a0818';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // 시작버튼 hover
  // Paperlogy 폰트 동적 로드
  const paperlogyFont = new FontFace('Paperlogy',
    "url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_2309@1.0/Paperlogy-7Bold.woff2') format('woff2')"
  );
  paperlogyFont.load().then(font => {
    document.fonts.add(font);
  }).catch(() => {
    // 폴백: Caveat 폰트 사용
  });

  // 시작버튼 hover
  const startBtnImg = document.getElementById('startBtnImg');
  startBtnImg.addEventListener('mouseenter', () => startBtnImg.src = ASSET_SRCS.btn_start_hover);
  startBtnImg.addEventListener('mouseleave', () => startBtnImg.src = ASSET_SRCS.btn_start_default);

  // 나가기 버튼 (타이틀)
  const exitTitleBtn = document.getElementById('exitTitleBtn');
  if (exitTitleBtn) {
    exitTitleBtn.addEventListener('click', () => {
      window.history.back();
    });
  }

  // 튜토리얼 배경을 캔버스에 그리기 (GO! 이미지 포함)
  // GO! 영역은 이미지가 canvas에 그려진 실제 위치 기준으로 계산
  const CW = 960, CH = 540; // 논리 캔버스 크기 (16:9)

  const goOffImg   = new Image(); goOffImg.src   = ASSET_SRCS.go_off;
  const goHoverImg = new Image(); goHoverImg.src = ASSET_SRCS.go_hover;

  let goHovered = false;

  const GO_REL = { x1: 0.66, y1: 0.76, x2: 0.76, y2: 0.85 };

  function getGoArea() {
    return {
      x: CW * GO_REL.x1,
      y: CH * GO_REL.y1,
      w: CW * (GO_REL.x2 - GO_REL.x1),
      h: CH * (GO_REL.y2 - GO_REL.y1),
    };
  }

  function drawTutorialCanvas(hover) {
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CW, CH);

    const bg = IMGS.bg_tutorial;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, 0, CW, CH);
    } else {
      const img = new Image();
      img.onload = () => { IMGS.bg_tutorial = img; drawTutorialCanvas(hover); };
      img.src = ASSET_SRCS.bg_tutorial;
      return;
    }

    // GO! / GO!! 이미지 — 원본 비율 유지, 너비 기준으로만 크기 지정
    const ga = getGoArea();
    const goImg = hover ? goHoverImg : goOffImg;
    if (goImg.complete && goImg.naturalWidth > 0) {
      const goW = ga.w;
      const goH = goW * (goImg.naturalHeight / goImg.naturalWidth); // 비율 유지
      // 영역 중앙 정렬
      const goX = ga.x;
      const goY = ga.y + (ga.h - goH) / 2;
      ctx.drawImage(goImg, goX, goY, goW, goH);
    }
  }

  document.getElementById('startBtnWrap').addEventListener('click', () => {
    showOnly(null);
    goHovered = false;
    canvas.dataset.mode = 'tutorial';
    canvas.style.cursor = 'default';
    // bg_tutorial 이미지 먼저 로드 보장
    if (!IMGS.bg_tutorial) {
      IMGS.bg_tutorial = new Image();
      IMGS.bg_tutorial.onload = () => drawTutorialCanvas(false);
      IMGS.bg_tutorial.src = ASSET_SRCS.bg_tutorial;
    } else {
      drawTutorialCanvas(false);
    }
  });

  // canvas mousemove → GO! 영역 hover 감지
  canvas.addEventListener('mousemove', e => {
    if (canvas.dataset.mode !== 'tutorial') return;
    const r  = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (CW / r.width);
    const cy = (e.clientY - r.top)  * (CH / r.height);
    const ga = getGoArea();
    const onGo = cx >= ga.x && cx <= ga.x + ga.w
              && cy >= ga.y && cy <= ga.y + ga.h;
    if (onGo !== goHovered) {
      goHovered = onGo;
      canvas.style.cursor = onGo ? 'pointer' : 'default';
      drawTutorialCanvas(goHovered);
    }
  });

  // canvas 클릭 → GO! 영역 클릭 시 게임 시작
  canvas.addEventListener('click', e => {
    if (canvas.dataset.mode !== 'tutorial') return;
    const r  = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (CW / r.width);
    const cy = (e.clientY - r.top)  * (CH / r.height);
    const ga = getGoArea();
    if (cx >= ga.x && cx <= ga.x + ga.w
     && cy >= ga.y && cy <= ga.y + ga.h) {
      canvas.dataset.mode = '';
      canvas.style.cursor = 'crosshair';
      goHovered = false;
      startGame();
    }
  });

  document.getElementById('pauseBtnImg').addEventListener('click', () => {
    paused = true;
    showOnly('pauseScreen');
    document.getElementById('hud').classList.remove('hidden');
  });
  document.getElementById('resumeBtn').addEventListener('click', () => {
    paused = false;
    showOnly(null);
    document.getElementById('hud').classList.remove('hidden');
  });
  document.getElementById('pauseExitBtn').addEventListener('click', () => {
    running = false; paused = false;
    clearTimeout(spawnInterval);
    showOnly('titleScreen');
    drawTitleCanvas();
  });
  document.getElementById('retryBtn').addEventListener('click', startGame);
  document.getElementById('exitBtn').addEventListener('click', () => {
    showOnly('titleScreen');
    drawTitleCanvas();
  });

  // 드래그할 때만 슬라이스 (mousedown 상태에서 move)
  let isMouseDown = false;
  canvas.addEventListener('mousedown', () => { isMouseDown = true; });
  canvas.addEventListener('mouseup',   () => { isMouseDown = false; });
  canvas.addEventListener('mouseleave',() => { isMouseDown = false; });

  // 마우스 슬라이스
  canvas.addEventListener('mousemove', e => {
    if (!running || paused || !isMouseDown) return;
    const r = canvas.getBoundingClientRect();
    slice(
      (e.clientX - r.left) * (CW / r.width),
      (e.clientY - r.top)  * (CH / r.height)
    );
  });

  // 터치 슬라이스
  canvas.addEventListener('touchmove', e => {
    if (!running || paused) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    slice(
      (t.clientX - r.left) * (CW / r.width),
      (t.clientY - r.top)  * (CH / r.height)
    );
  }, { passive: false });

  // 별 생성
  const starsLayer = document.getElementById('starsLayer');
  for (let i = 0; i < 90; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const sz = Math.random() * 2.5 + 0.5;
    s.style.cssText = `
      width:${sz}px; height:${sz}px;
      left:${Math.random()*100}%; top:${Math.random()*100}%;
      opacity:${Math.random()*0.5+0.1};
      --dur:${2+Math.random()*3}s;
      animation-delay:${Math.random()*3}s;
    `;
    starsLayer.appendChild(s);
  }

  // 이미지 로드 후 타이틀 캔버스 그리기
  ctx.fillStyle = '#0a0818';
  ctx.fillRect(0, 0, W, H);

  preloadImages(() => {
    // score ticket 이미지 세팅
    const tl = document.getElementById('scoreTicketL');
    const tr = document.getElementById('scoreTicketR');
    if (tl && IMGS.score_ticket_l) tl.src = IMGS.score_ticket_l.src;
    if (tr && IMGS.score_ticket_r) tr.src = IMGS.score_ticket_r.src;
    drawTitleCanvas();
  });

  if (IMGS.bg_title && IMGS.bg_title.complete && IMGS.bg_title.naturalWidth > 0) {
    drawTitleCanvas();
  }
}

window.addEventListener('DOMContentLoaded', initUI);