/**
 * gameEngine.js
 * Fruit Catcher Game Logic
 * 
 * Handles game state, item spawning, collision detection, and scoring.
 */

class GameEngine {
    constructor() {
        this.score = 0;
        this.level = 1;
        this.lives = 3;
        this.isGameActive = false;
        this.gameLoopId = null;

        // Game Entities
        this.player = { lane: "CENTER" }; // LEFT, CENTER, RIGHT
        this.items = []; // Array of { x, y, type, lane, speed }

        // Config
        this.lanes = {
            "LEFT": 33,   // % Position
            "CENTER": 100, // % Position (handled via flex logic usually, but here abstract)
            "RIGHT": 166  // % Position
        };

        this.itemTypes = [
            { type: "APPLE", score: 100, symbol: "🍎", probability: 0.45 },
            { type: "BANANA", score: 200, symbol: "🍌", probability: 0.2 },
            { type: "PINEAPPLE", score: 300, symbol: "🍍", probability: 0.05 },
            { type: "HEART", score: 0, symbol: "❤️", probability: 0.1 },
            { type: "MONEY", score: 0, symbol: "💰", probability: 0.1 },
            { type: "BOMB", score: 0, symbol: "💣", probability: 0.1 }
        ];

        // 놓친 과일 카운터
        this.missedCount = 0;

        // 점수 2배 버프
        this.scoreMultiplier = 1;
        this.multiplierTimer = 0;
        this.multiplierDuration = 600; // 10초 (약 60fps * 10)

        // Spawning
        this.spawnTimer = 0;
        this.spawnInterval = 60; // Frames

        // Callbacks
        this.onUpdateUI = null; // (state) => void
        this.onGameOver = null; // (score, level) => void
    }

    /**
     * Start the game
     */
    start() {
        this.isGameActive = true;
        this.score = 0;
        this.level = 1;
        this.lives = 3;
        this.items = [];
        this.spawnInterval = 60;
        this.missedCount = 0;
        this.scoreMultiplier = 1;
        this.multiplierTimer = 0;

        this.startGameLoop();
        this.updateUI();
    }

    /**
     * Stop the game
     */
    stop() {
        this.isGameActive = false;
        if (this.gameLoopId) {
            cancelAnimationFrame(this.gameLoopId);
            this.gameLoopId = null;
        }
    }

    /**
     * Main Game Loop
     */
    startGameLoop() {
        const loop = () => {
            if (!this.isGameActive) return;

            this.update();

            this.gameLoopId = requestAnimationFrame(loop);
        };
        this.gameLoopId = requestAnimationFrame(loop);
    }

    /**
     * Update game state (called every frame)
     */
    update() {
        // 0. 점수 배율 타이머 감소
        if (this.multiplierTimer > 0) {
            this.multiplierTimer--;
            if (this.multiplierTimer <= 0) {
                this.scoreMultiplier = 1;
            }
        }

        // 1. Spawn Items
        this.spawnTimer++;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnItem();
            this.spawnTimer = 0;
        }

        // 2. Move Items (느린 속도)
        const baseSpeed = 1 + (this.level * 0.2);

        // Use a reverse loop to remove items safely
        for (let i = this.items.length - 1; i >= 0; i--) {
            let item = this.items[i];
            item.y += baseSpeed;

            // 3. Collision Detection (Base of screen is roughly 100%)
            // Assuming player is at bottom (e.g., y > 85%)
            if (item.y > 85 && item.y < 95) {
                if (item.lane === this.player.lane) {
                    this.handleCollision(item);
                    this.items.splice(i, 1);
                    continue;
                }
            }

            // 4. Remove if off screen — 과일 놓치면 카운트 증가
            if (item.y > 100) {
                if (item.type !== "BOMB" && item.type !== "HEART" && item.type !== "MONEY") {
                    this.missedCount++;
                    // 2개 놓칠 때마다 하트 1개 차감
                    if (this.missedCount >= 2) {
                        this.missedCount = 0;
                        this.lives--;
                        if (this.lives <= 0) {
                            this.items.splice(i, 1);
                            this.gameOver();
                            return;
                        }
                    }
                }
                this.items.splice(i, 1);
            }
        }

        this.updateUI(); // Continuous update for smooth animation if using DOM
    }

    spawnItem() {
        const lanes = ["LEFT", "CENTER", "RIGHT"];
        const randomLane = lanes[Math.floor(Math.random() * lanes.length)];

        // Random item type based on probability
        const rand = Math.random();
        let cumulativeProb = 0;
        let selectedType = this.itemTypes[0];

        for (let type of this.itemTypes) {
            cumulativeProb += type.probability;
            if (rand <= cumulativeProb) {
                selectedType = type;
                break;
            }
        }

        this.items.push({
            id: Date.now() + Math.random(), // Unique ID for DOM mapping
            x: 0, // Will be determined by lane in CSS/Render
            y: 0,
            lane: randomLane,
            ...selectedType
        });
    }

    handleCollision(item) {
        if (item.type === "BOMB") {
            // 폭탄: 하트 3개 차감
            this.lives -= 3;
            if (this.lives <= 0) {
                this.lives = 0;
                this.gameOver();
            }
        } else if (item.type === "HEART") {
            // 하트: 생명 +1
            this.lives++;
        } else if (item.type === "MONEY") {
            // 돈: 10초간 점수 2배
            this.scoreMultiplier = 2;
            this.multiplierTimer = this.multiplierDuration;
        } else {
            // 과일: 점수 추가 (배율 적용)
            this.score += item.score * this.scoreMultiplier;
            // Level up logic
            if (this.score >= this.level * 500) {
                this.level++;
                this.spawnInterval = Math.max(20, 60 - (this.level * 5));
            }
        }
    }

    gameOver() {
        this.isGameActive = false;
        if (this.onGameOver) {
            this.onGameOver(this.score, this.level);
        }
        this.stop();
    }

    /**
     * Handle Pose Input
     * @param {string} detectedPose - "LEFT", "CENTER", "RIGHT"
     */
    onPoseDetected(detectedPose) {
        if (!this.isGameActive) return;

        if (["LEFT", "CENTER", "RIGHT"].includes(detectedPose)) {
            this.player.lane = detectedPose;
        }
    }

    /**
     * Set update callback
     */
    setUpdateUICallback(callback) {
        this.onUpdateUI = callback;
    }

    setGameOverCallback(callback) {
        this.onGameOver = callback;
    }

    updateUI() {
        if (this.onUpdateUI) {
            this.onUpdateUI({
                score: this.score,
                level: this.level,
                lives: this.lives,
                items: this.items,
                playerLane: this.player.lane,
                scoreMultiplier: this.scoreMultiplier,
                multiplierTimer: this.multiplierTimer
            });
        }
    }
}

// Export
window.GameEngine = GameEngine;
