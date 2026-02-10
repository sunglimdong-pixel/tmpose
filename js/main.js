/**
 * main.js
 * 포즈 인식과 게임 로직을 초기화하고 서로 연결하는 진입점
 *
 * PoseEngine, GameEngine, Stabilizer를 조합하여 애플리케이션을 구동
 */

// 전역 변수
let poseEngine;
let gameEngine;
let stabilizer;
let ctx;
let labelContainer;

/**
 * 애플리케이션 초기화
 */
async function init() {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");

  startBtn.disabled = true;

  try {
    // 1. PoseEngine 초기화
    poseEngine = new PoseEngine("./my_model/");
    const { maxPredictions, webcam } = await poseEngine.init({
      size: 200,
      flip: true
    });

    // 2. Stabilizer 초기화
    stabilizer = new PredictionStabilizer({
      threshold: 0.5,
      smoothingFrames: 2
    });

    // 3. GameEngine 초기화 (선택적)
    gameEngine = new GameEngine();

    // 4. 캔버스 설정
    const canvas = document.getElementById("canvas");
    canvas.width = 200;
    canvas.height = 200;
    ctx = canvas.getContext("2d");

    // 5. Label Container 설정
    labelContainer = document.getElementById("label-container");
    labelContainer.innerHTML = ""; // 초기화
    for (let i = 0; i < maxPredictions; i++) {
      labelContainer.appendChild(document.createElement("div"));
    }

    // 6. PoseEngine 콜백 설정
    poseEngine.setPredictionCallback(handlePrediction);
    poseEngine.setDrawCallback(drawPose);

    // 7. PoseEngine 시작
    poseEngine.start();

    // 8. Start Game Logic
    startGameMode();

    stopBtn.disabled = false;
  } catch (error) {
    console.error("초기화 중 오류 발생:", error);
    alert(`초기화에 실패했습니다.\n오류 원인: ${error.message}\n\n1. 로컬 서버(Live Server)로 실행했는지 확인하세요.\n2. my_model 폴더에 모델 파일이 있는지 확인하세요.`);
    startBtn.disabled = false;
  }
}

/**
 * 애플리케이션 중지
 */
function stop() {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");

  if (poseEngine) {
    poseEngine.stop();
  }

  if (gameEngine && gameEngine.isGameActive) {
    gameEngine.stop();
  }

  if (stabilizer) {
    stabilizer.reset();
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
}

// 게임 모드 시작 함수
function startGameMode(config) {
  if (!gameEngine) {
    console.warn("GameEngine이 초기화되지 않았습니다.");
    return;
  }

  // UI 요소 캐싱
  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const livesEl = document.getElementById("lives");
  const basketEl = document.getElementById("basket");
  const itemContainer = document.getElementById("item-container");
  const laneLeft = document.getElementById("lane-left"); // For positioning ref if needed

  // UI 업데이트 콜백
  gameEngine.setUpdateUICallback((state) => {
    // 1. Text Info Update
    if (state.scoreMultiplier > 1) {
      const remainSec = Math.ceil(state.multiplierTimer / 60);
      scoreEl.innerText = state.score + ` x${state.scoreMultiplier} 💰 (${remainSec}s)`;
    } else {
      scoreEl.innerText = state.score;
    }
    levelEl.innerText = state.level;
    livesEl.innerText = "❤️".repeat(state.lives);

    // 2. Basket Movement
    // Lane positions: LEFT=0, CENTER=1, RIGHT=2 => but here we use css-like logic
    // Let's assume lanes map to left percentages: LEFT: 0, CENTER: 33.3%, RIGHT: 66.6%
    const lanePositions = {
      "LEFT": "0%",
      "CENTER": "33.33%",
      "RIGHT": "66.66%"
    };
    if (basketEl) {
      basketEl.style.left = lanePositions[state.playerLane] || "33.33%";
    }

    // 3. Render Items
    // Clear existing for simplicity (Optimization: reuse elements)
    itemContainer.innerHTML = "";

    state.items.forEach(item => {
      const itemEl = document.createElement("div");
      itemEl.className = "item";
      itemEl.innerText = item.symbol;

      // Horizontal Position
      itemEl.style.left = lanePositions[item.lane];

      // Vertical Position (item.y is %)
      itemEl.style.top = item.y + "%";

      itemContainer.appendChild(itemEl);
    });
  });

  gameEngine.setGameOverCallback((finalScore, finalLevel) => {
    alert(`Game Over! 💔\n\n최종 점수: ${finalScore}\n최종 레벨: ${finalLevel}`);

    // Reset UI
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });

  gameEngine.start(config);
}

// init function override to hook up start button properly
const originalInit = init;
// We actually don't need to override init if we just change how main.js calls start.
// main.js calls poseEngine.start() but gameEngine.start() is not called automatically in the original code?
// Ah, the original code had `init` -> `poseEngine.start()`. It didn't call `gameEngine.start()`.
// accessing `init` from here is tricky if it's not exported or if we are just replacing lines.
// Let's modify the `init` function in `main.js` to call `startGameMode` automatically after pose engine starts.

/**
 * 예측 결과 처리 콜백
 * @param {Array} predictions - TM 모델의 예측 결과
 * @param {Object} pose - PoseNet 포즈 데이터
 */
function handlePrediction(predictions, pose) {
  // 1. Stabilizer로 예측 안정화
  const stabilized = stabilizer.stabilize(predictions);

  // 2. Label Container 업데이트 (Debug)
  for (let i = 0; i < predictions.length; i++) {
    const classPrediction =
      predictions[i].className + ": " + predictions[i].probability.toFixed(2);
    labelContainer.childNodes[i].innerHTML = classPrediction;
  }

  // 3. 최고 확률 예측 표시
  const maxPredictionDiv = document.getElementById("max-prediction");
  maxPredictionDiv.innerHTML = stabilized.className || "Detecting...";

  // 4. GameEngine에 포즈 전달
  if (gameEngine && gameEngine.isGameActive && stabilized.className) {
    gameEngine.onPoseDetected(stabilized.className);
  }
}

/**
 * 포즈 그리기 콜백
 * @param {Object} pose - PoseNet 포즈 데이터
 */
function drawPose(pose) {
  if (poseEngine.webcam && poseEngine.webcam.canvas) {
    ctx.drawImage(poseEngine.webcam.canvas, 0, 0);

    // 키포인트와 스켈레톤 그리기
    if (pose) {
      const minPartConfidence = 0.5;
      tmPose.drawKeypoints(pose.keypoints, minPartConfidence, ctx);
      tmPose.drawSkeleton(pose.keypoints, minPartConfidence, ctx);
    }
  }
}

