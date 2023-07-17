const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const upButton = document.getElementById('keyboard_key_up');
const downButton = document.getElementById('keyboard_key_down');
const leftButton = document.getElementById('keyboard_key_left');
const rightButton = document.getElementById('keyboard_key_right');

const img = new Image();
img.src = './images/cat.jpg';

const img2 = new Image();
img2.src = './images/moon2.jpg';

const img3 = new Image();
img3.src = './images/moon.jpg';

function changeBackground(image) {
  const pattern = ctx.createPattern(image, 'repeat');
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, 400, 400);
}

class SnakePart {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

let speed = 7;

let tileCount = 20;
let tileSize = canvas.width / tileCount - 2;

let headX = 10;
let headY = 10;
const snakeParts = [];
let tailLength = 2;

let appleX = 5;
let appleY = 5;

let xVelocity = 0;
let yVelocity = 0;

let score = 0;

const eat = new Audio('./sounds/eat.mp3');
const fail = new Audio('./sounds/fail.mp3');

function drawGame() {
  changeSnakePosition();

  let result = isgameOver();
  if (result) {
    return;
  }

  clearScreen();
  checkAppleCollision();
  drawApple();
  drawSnake();
  drawScore();

  if (score > 1) {
    speed = 10;
  }
  if (score > 3) {
    speed = 15;
  }
  if (score > 6) {
    speed = 20;
  }

  setTimeout(drawGame, 1000 / speed);
}

function isgameOver() {
  let gameOver = false;

  if (yVelocity === 0 && xVelocity === 0) {
    return false;
  }
  //стены
  if (headX < 0) {
    gameOver = true;
  } else if (headX === tileCount) {
    gameOver = true;
  } else if (headY < 0) {
    gameOver = true;
  } else if (headY === tileCount) {
    gameOver = true;
  }

  for (let i = 0; i < snakeParts.length; i++) {
    let part = snakeParts[i];
    if (part.x == headX && part.y === headY) {
      gameOver = true;
      break;
    }
  }

  if (gameOver) {
    fail.play();
    ctx.fillStyle = 'red';
    ctx.font = '50px Georgia';
    ctx.fillText('Wasted', canvas.width / 3, canvas.height / 2);
    setTimeout(() => location.reload(), 1000);
  }

  return gameOver;
}

function drawScore() {
  ctx.fillStyle = 'red';
  ctx.font = '10px Verdana';
  ctx.fillText('Score ' + score, canvas.width - 50, 10);
}

function clearScreen() {
  if (score >= 0) {
    changeBackground(img);
  }
  if (score > 3) {
    changeBackground(img2);
  }
  if (score > 6) {
    changeBackground(img3);
  }
}

function drawSnake() {
  ctx.fillStyle = 'green';
  for (let i = 0; i < snakeParts.length; i++) {
    let part = snakeParts[i];
    ctx.fillRect(part.x * tileCount, part.y * tileCount, tileSize, tileSize);
  }

  snakeParts.push(new SnakePart(headX, headY));
  if (snakeParts.length > tailLength) {
    snakeParts.shift();
  }

  ctx.fillStyle = 'orange';
  ctx.fillRect(headX * tileCount, headY * tileCount, tileSize, tileSize);
}

function changeSnakePosition() {
  headX = headX + xVelocity;
  headY = headY + yVelocity;
}

function drawApple() {
  ctx.fillStyle = 'red';
  ctx.fillRect(appleX * tileCount, appleY * tileCount, tileSize, tileSize);
}

function checkAppleCollision() {
  if (appleX == headX && appleY == headY) {
    appleX = Math.floor(Math.random() * tileCount);
    appleY = Math.floor(Math.random() * tileCount);
    tailLength++;
    score++;
    eat.play();
  }
}

document.body.addEventListener('keydown', keyDown);

function keyDown(event) {
  if (event.keyCode == 38) {
    if (yVelocity == 1) return;
    yVelocity = -1;
    xVelocity = 0;
  }

  if (event.keyCode == 40) {
    if (yVelocity == -1) return;
    yVelocity = 1;
    xVelocity = 0;
  }

  if (event.keyCode == 37) {
    if (xVelocity == 1) return;
    yVelocity = 0;
    xVelocity = -1;
  }

  if (event.keyCode == 39) {
    if (xVelocity == -1) return;
    yVelocity = 0;
    xVelocity = 1;
  }
}

upButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (yVelocity == 1) return;
  yVelocity = -1;
  xVelocity = 0;
});

downButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (yVelocity == -1) return;
  yVelocity = 1;
  xVelocity = 0;
});

leftButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (xVelocity == 1) return;
  yVelocity = 0;
  xVelocity = -1;
});

rightButton.addEventListener('touchstart', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (xVelocity == -1) return;
  yVelocity = 0;
  xVelocity = 1;
});

drawGame();
