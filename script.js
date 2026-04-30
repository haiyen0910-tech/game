const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

// UI Elements
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const scoreEl = document.getElementById('score');
const highscoreEl = document.getElementById('highscore');
const finalScoreEl = document.getElementById('finalScore');
const gameWrapper = document.querySelector('.game-wrapper');
const comboContainer = document.getElementById('comboContainer');
const comboMultiplierEl = document.getElementById('comboMultiplier');
const powerupIndicator = document.getElementById('powerupIndicator');

// Sound Synth
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type, freq, duration, vol=0.1) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if(type === 'sawtooth') {
        osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + duration);
    }
    
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

const sounds = {
    shoot: () => playSound('square', 800, 0.1, 0.05),
    powerup: () => playSound('sine', 1200, 0.2, 0.1),
    explosion: () => playSound('sawtooth', 100, 0.3, 0.1),
    hitPlayer: () => playSound('sawtooth', 50, 0.8, 0.2),
    combo: (mult) => playSound('square', 400 + (mult * 50), 0.1, 0.05)
};

// Game State
let animationId;
let gameState = 'START';
let score = 0;
let highscore = localStorage.getItem('neonShooterHighscore_VN') || 0;
highscoreEl.innerText = highscore;

let comboCount = 0;
let comboMultiplier = 1;
let comboTimer = 0;

// Entities
let player;
let projectiles = [];
let enemyProjectiles = [];
let enemies = [];
let particles = [];
let powerups = [];
let stars = [];

// Input state
const keys = { w:false, a:false, s:false, d:false, ArrowUp:false, ArrowLeft:false, ArrowDown:false, ArrowRight:false };
const mouse = { x: canvas.width/2, y: canvas.height/2, isDown: false };

window.addEventListener('keydown', e => { if(keys.hasOwnProperty(e.key)) keys[e.key] = true; });
window.addEventListener('keyup', e => { if(keys.hasOwnProperty(e.key)) keys[e.key] = false; });
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', () => mouse.isDown = true);
canvas.addEventListener('mouseup', () => mouse.isDown = false);
canvas.addEventListener('mouseleave', () => mouse.isDown = false);

// Utility
function triggerShake() {
    gameWrapper.classList.remove('shake');
    void gameWrapper.offsetWidth; // trigger reflow
    gameWrapper.classList.add('shake');
}

function showPowerupText(text) {
    powerupIndicator.innerText = text;
    powerupIndicator.classList.remove('hidden');
    setTimeout(() => {
        powerupIndicator.classList.add('hidden');
    }, 2000);
}

// Classes
class Player {
    constructor(x, y, radius, color) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.speed = 5;
        this.angle = 0;
        this.cooldown = 0;
        
        // Buffs
        this.shield = false;
        this.powerType = null;
        this.powerTimer = 0;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        if (this.shield) {
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 10, 0, Math.PI * 2);
            ctx.strokeStyle = '#0055ff';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#0055ff';
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        
        ctx.rotate(this.angle);
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        
        // Draw spaceship
        ctx.beginPath();
        ctx.moveTo(this.radius, 0); // Nose
        ctx.lineTo(-this.radius, -this.radius * 0.8); // Left wing
        ctx.lineTo(-this.radius * 0.5, 0); // Back indent
        ctx.lineTo(-this.radius, this.radius * 0.8); // Right wing
        ctx.closePath();
        
        ctx.strokeStyle = this.powerTimer > 0 ? '#ffea00' : this.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#050510';
        ctx.fill();
        
        // Core
        ctx.beginPath();
        ctx.arc(-this.radius * 0.2, 0, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = this.powerTimer > 0 ? '#ffea00' : this.color;
        ctx.fill();
        
        ctx.restore();
    }
    update() {
        // Movement
        if ((keys.w || keys.ArrowUp) && this.y - this.radius > 0) this.y -= this.speed;
        if ((keys.s || keys.ArrowDown) && this.y + this.radius < canvas.height) this.y += this.speed;
        if ((keys.a || keys.ArrowLeft) && this.x - this.radius > 0) this.x -= this.speed;
        if ((keys.d || keys.ArrowRight) && this.x + this.radius < canvas.width) this.x += this.speed;
        
        // Aiming
        this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
        
        // Buff timing
        if (this.powerTimer > 0) {
            this.powerTimer--;
            if (this.powerTimer <= 0) this.powerType = null;
        }
        
        let fireRate = this.powerType === 'MachineGun' ? 4 : 10;
        
        // Shooting
        if (this.cooldown > 0) this.cooldown--;
        if (mouse.isDown && this.cooldown === 0) {
            this.shoot();
            this.cooldown = fireRate;
        }
        
        this.draw();
    }
    shoot() {
        sounds.shoot();
        const startX = this.x + Math.cos(this.angle) * this.radius;
        const startY = this.y + Math.sin(this.angle) * this.radius;
        
        let shots = this.powerType === 'Spread' ? 3 : 1;
        
        for (let i = 0; i < shots; i++) {
            let offset = this.angle;
            if (shots === 3) {
                if (i === 0) offset -= 0.3;
                if (i === 2) offset += 0.3;
            }
            const velocity = {
                x: Math.cos(offset) * 14,
                y: Math.sin(offset) * 14
            };
            projectiles.push(new Projectile(startX, startY, 4, '#fff', velocity));
        }
    }
}

class Projectile {
    constructor(x, y, radius, color, velocity) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.velocity = velocity;
        this.isEnemy = color === '#aa00ff';
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.draw();
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.radius = 12;
        this.type = type; // 'Spread', 'MachineGun', 'Shield'
        
        if (type === 'Spread') this.color = '#00ff00';
        else if (type === 'MachineGun') this.color = '#ffea00';
        else if (type === 'Shield') this.color = '#0055ff';
        
        this.alive = 600; // fade roughly 10 secs
        this.alpha = 1;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.stroke();
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let initial = this.type === 'MachineGun' ? 'M' : this.type[0];
        ctx.fillText(initial, this.x, this.y);
        ctx.restore();
    }
    update() {
        this.alive--;
        if (this.alive < 100) this.alpha = this.alive / 100;
        this.draw();
    }
}

class Enemy {
    constructor(x, y, radius, color, velocity, enemyType = 'normal') {
        this.x = x;
        this.y = y;
        this.type = enemyType;
        this.velocity = velocity;
        
        if (this.type === 'tank') {
            this.radius = radius * 1.5;
            this.color = '#ff003c';
            this.hp = 8;
            this.maxHp = 8;
            this.velocity.x *= 0.4;
            this.velocity.y *= 0.4;
        } else if (this.type === 'dasher') {
            this.radius = radius * 0.7;
            this.color = '#ffff00';
            this.hp = 1;
            this.velocity.x *= 2;
            this.velocity.y *= 2;
        } else if (this.type === 'shooter') {
            this.radius = radius;
            this.color = '#aa00ff';
            this.hp = 3;
            this.shootTimer = 120;
        } else {
            this.radius = radius;
            this.color = color;
            this.hp = radius > 25 ? 3 : 1;
        }
    }
    draw() {
        ctx.beginPath();
        let sides = 6;
        if (this.type === 'tank') sides = 8;
        if (this.type === 'dasher') sides = 3;
        if (this.type === 'shooter') sides = 4;
        
        for (let i = 0; i < sides; i++) {
            const angle = (i * Math.PI * 2) / sides;
            const px = this.x + Math.cos(angle) * this.radius;
            const py = this.y + Math.sin(angle) * this.radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        
        ctx.strokeStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.fillStyle = `rgba(255, 255, 255, 0.1)`;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        
        if (this.type === 'shooter') {
            this.shootTimer--;
            if (this.shootTimer <= 0) {
                let angle = Math.atan2(player.y - this.y, player.x - this.x);
                enemyProjectiles.push(new Projectile(this.x, this.y, 4, '#aa00ff', {
                    x: Math.cos(angle) * 6,
                    y: Math.sin(angle) * 6
                }));
                this.shootTimer = 150;
            }
        }
        
        this.draw();
    }
}

class Particle {
    constructor(x, y, radius, color, velocity) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.velocity = velocity;
        this.alpha = 1;
        this.friction = 0.98;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.restore();
    }
    update() {
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= 0.02;
        this.draw();
    }
}

class Star3D {
    constructor() {
        this.reset();
        this.z = Math.random() * 2000; // scramble initial depth
    }
    reset() {
        this.x = (Math.random() - 0.5) * 2000;
        this.y = (Math.random() - 0.5) * 2000;
        this.z = 2000;
        this.pz = 2000;
    }
    update() {
        this.z -= 25; // Warp speed!
        if (this.z < 1) {
            this.reset();
        }
    }
    draw() {
        // Perspective projection
        let sx = (this.x / this.z) * 600 + canvas.width / 2;
        let sy = (this.y / this.z) * 600 + canvas.height / 2;
        let px = (this.x / this.pz) * 600 + canvas.width / 2;
        let py = (this.y / this.pz) * 600 + canvas.height / 2;
        
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        // Star fade in based on depth
        let brightness = 1 - (this.z / 2000);
        ctx.strokeStyle = `rgba(0, 243, 255, ${brightness})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        this.pz = this.z;
    }
}

let frames = 0;
let spawnRate = 120;

function spawnEnemies() {
    if (frames % spawnRate === 0) {
        const radius = Math.random() * 15 + 15; 
        let x, y;
        
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? 0 - radius : canvas.width + radius;
            y = Math.random() * canvas.height;
        } else {
            x = Math.random() * canvas.width;
            y = Math.random() < 0.5 ? 0 - radius : canvas.height + radius;
        }
        
        const color = `hsl(${Math.random() * 60 + 330}, 100%, 60%)`;
        const angle = Math.atan2(player.y - y, player.x - x);
        const speedMultiplier = 1 + (score * 0.005);
        const velocity = {
            x: Math.cos(angle) * (Math.random() * 1.5 + 0.5) * speedMultiplier,
            y: Math.sin(angle) * (Math.random() * 1.5 + 0.5) * speedMultiplier
        };
        
        // Randomize Type
        let type = 'normal';
        const rand = Math.random();
        if (score > 1000 && rand < 0.15) type = 'tank';
        else if (score > 500 && rand > 0.8) type = 'shooter';
        else if (rand < 0.3) type = 'dasher';
        
        enemies.push(new Enemy(x, y, radius, color, velocity, type));
        
        if (spawnRate > 40) spawnRate -= 2;
    }
}

function processPlayerDamage() {
    if (player.shield) {
        player.shield = false;
        sounds.hitPlayer();
        createExplosion(player.x, player.y, '#0055ff', 20);
        triggerShake();
        // push away enemies slightly
        enemies.forEach(e => {
            e.x -= e.velocity.x * 20;
            e.y -= e.velocity.y * 20;
        });
        return; // survived
    }
    createExplosion(player.x, player.y, player.color, 40);
    triggerShake();
    gameOver();
}

function updateCombo(addedScore) {
    comboCount++;
    if (comboCount > 20) comboMultiplier = 4;
    else if (comboCount > 10) comboMultiplier = 3;
    else if (comboCount > 5) comboMultiplier = 2;
    else comboMultiplier = 1;
    
    score += addedScore * comboMultiplier;
    
    if (comboMultiplier > 1) {
        sounds.combo(comboMultiplier);
        comboContainer.style.display = 'flex';
        comboMultiplierEl.innerText = `x${comboMultiplier}`;
        
        // Trigger animation pop
        comboMultiplierEl.classList.remove('combo-pop');
        void comboMultiplierEl.offsetWidth;
        comboMultiplierEl.classList.add('combo-pop');
    }
    
    comboTimer = 180; // frames until combo decays
}

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(
            x, y,
            Math.random() * 3 + 1,
            color,
            {
                x: (Math.random() - 0.5) * (Math.random() * 8),
                y: (Math.random() - 0.5) * (Math.random() * 8)
            }
        ));
    }
}

function initGame() {
    player = new Player(canvas.width / 2, canvas.height / 2, 20, '#00f3ff');
    projectiles = [];
    enemyProjectiles = [];
    enemies = [];
    particles = [];
    powerups = [];
    stars = [];
    for(let i = 0; i < 300; i++) {
        stars.push(new Star3D());
    }
    
    score = 0;
    frames = 0;
    spawnRate = 120;
    comboCount = 0;
    comboMultiplier = 1;
    comboTimer = 0;
    
    scoreEl.innerText = score;
    comboContainer.style.display = 'none';
    gameState = 'PLAYING';
    
    if(audioCtx.state === 'suspended') audioCtx.resume();
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    
    animate();
}

function gameOver() {
    gameState = 'GAMEOVER';
    cancelAnimationFrame(animationId);
    sounds.hitPlayer();
    comboContainer.style.display = 'none';
    
    if (score > highscore) {
        highscore = score;
        localStorage.setItem('neonShooterHighscore_VN', highscore);
        highscoreEl.innerText = highscore;
    }
    
    finalScoreEl.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

function animate() {
    if (gameState !== 'PLAYING') return;
    animationId = requestAnimationFrame(animate);
    
    ctx.fillStyle = 'rgba(5, 5, 16, 0.4)'; // slightly darker trailing
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw 3D Starfield
    for (let i = 0; i < stars.length; i++) {
        stars[i].update();
        stars[i].draw();
    }
    
    player.update();
    spawnEnemies();
    
    // Combo decay
    if (comboTimer > 0) {
        comboTimer--;
        if (comboTimer <= 0) {
            comboCount = 0;
            comboMultiplier = 1;
            comboContainer.style.display = 'none';
        }
    }
    
    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p.alpha <= 0) particles.splice(i, 1);
        else p.update();
    }
    
    // Powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.update();
        if (p.alive <= 0) {
            powerups.splice(i, 1);
            continue;
        }
        
        // Pick up powerup
        const dist = Math.hypot(player.x - p.x, player.y - p.y);
        if (dist - player.radius - p.radius < 0) {
            sounds.powerup();
            if (p.type === 'Shield') {
                player.shield = true;
                showPowerupText('SHIELD ACTIVE!');
            } else {
                player.powerType = p.type;
                player.powerTimer = 600; // 10 seconds of power
                showPowerupText(`${p.type.toUpperCase()} ACTIVE!`);
            }
            powerups.splice(i, 1);
        }
    }
    
    // Enemy Projectiles
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const proj = enemyProjectiles[i];
        proj.update();
        
        if (proj.x < 0 || proj.x > canvas.width || proj.y < 0 || proj.y > canvas.height) {
            enemyProjectiles.splice(i, 1);
            continue;
        }
        
        const dist = Math.hypot(player.x - proj.x, player.y - proj.y);
        if (dist - player.radius - proj.radius < 0) {
            enemyProjectiles.splice(i, 1);
            processPlayerDamage();
            if (gameState === 'GAMEOVER') return;
        }
    }
    
    // Player Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        proj.update();
        if (proj.x < 0 || proj.x > canvas.width || proj.y < 0 || proj.y > canvas.height) {
            projectiles.splice(i, 1);
        }
    }
    
    // Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.update();
        
        // Collision with player
        const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (distToPlayer - enemy.radius - player.radius < 0) {
            processPlayerDamage();
            if (gameState === 'GAMEOVER') return;
            // if shield used
            enemies.splice(i, 1);
            continue;
        }
        
        // Collision with projectiles
        for (let j = projectiles.length - 1; j >= 0; j--) {
            const proj = projectiles[j];
            const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y);
            
            if (dist - enemy.radius - proj.radius < 0) {
                enemy.hp--;
                projectiles.splice(j, 1);
                
                if (enemy.hp <= 0) {
                    sounds.explosion();
                    createExplosion(enemy.x, enemy.y, enemy.color, enemy.type==='tank' ? 30 : enemy.radius);
                    
                    if (enemy.type === 'tank') triggerShake();
                    
                    updateCombo(Math.floor(enemy.radius));
                    scoreEl.innerText = score;
                    
                    // Powerup drop chance (10% normal, 40% tank)
                    const dropChance = enemy.type === 'tank' ? 0.4 : 0.08;
                    if (Math.random() < dropChance) {
                        const types = ['Spread', 'MachineGun', 'Shield'];
                        const type = types[Math.floor(Math.random() * types.length)];
                        powerups.push(new PowerUp(enemy.x, enemy.y, type));
                    }
                    
                    enemies.splice(i, 1);
                } else {
                    createExplosion(proj.x, proj.y, enemy.color, 5);
                    enemy.radius *= 0.95; // flash/shrink
                }
                break;
            }
        }
    }
    
    frames++;
}

startBtn.addEventListener('click', initGame);
restartBtn.addEventListener('click', initGame);

ctx.fillStyle = '#050510';
ctx.fillRect(0, 0, canvas.width, canvas.height);
