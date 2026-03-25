import React, { useState, useEffect } from 'react';
import Board from './Board';
import './Game2048.css';

const Game2048 = () => {
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  // 初始化棋盘
  const initializeBoard = () => {
    const newBoard = Array(4).fill().map(() => Array(4).fill(0));
    addNewTile(newBoard);
    addNewTile(newBoard);
    return newBoard;
  };

  // 添加新方块
  const addNewTile = (board) => {
    const emptyCells = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (board[i][j] === 0) {
          emptyCells.push({ i, j });
        }
      }
    }
    if (emptyCells.length > 0) {
      const { i, j } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      board[i][j] = Math.random() < 0.9 ? 2 : 4;
    }
  };

  // 处理移动
  const handleMove = (direction) => {
    if (gameOver) return;
    const newBoard = JSON.parse(JSON.stringify(board));
    let moved = false;
    let newScore = score;

    switch (direction) {
      case 'up':
        for (let j = 0; j < 4; j++) {
          const column = [];
          for (let i = 0; i < 4; i++) {
            if (newBoard[i][j] !== 0) column.push(newBoard[i][j]);
          }
          const merged = mergeTiles(column);
          newScore += merged.score;
          for (let i = 0; i < 4; i++) {
            if (i < merged.tiles.length) {
              if (newBoard[i][j] !== merged.tiles[i]) moved = true;
              newBoard[i][j] = merged.tiles[i];
            } else {
              if (newBoard[i][j] !== 0) moved = true;
              newBoard[i][j] = 0;
            }
          }
        }
        break;
      case 'down':
        for (let j = 0; j < 4; j++) {
          const column = [];
          for (let i = 3; i >= 0; i--) {
            if (newBoard[i][j] !== 0) column.push(newBoard[i][j]);
          }
          const merged = mergeTiles(column);
          newScore += merged.score;
          for (let i = 3; i >= 0; i--) {
            const index = 3 - i;
            if (index < merged.tiles.length) {
              if (newBoard[i][j] !== merged.tiles[index]) moved = true;
              newBoard[i][j] = merged.tiles[index];
            } else {
              if (newBoard[i][j] !== 0) moved = true;
              newBoard[i][j] = 0;
            }
          }
        }
        break;
      case 'left':
        for (let i = 0; i < 4; i++) {
          const row = [];
          for (let j = 0; j < 4; j++) {
            if (newBoard[i][j] !== 0) row.push(newBoard[i][j]);
          }
          const merged = mergeTiles(row);
          newScore += merged.score;
          for (let j = 0; j < 4; j++) {
            if (j < merged.tiles.length) {
              if (newBoard[i][j] !== merged.tiles[j]) moved = true;
              newBoard[i][j] = merged.tiles[j];
            } else {
              if (newBoard[i][j] !== 0) moved = true;
              newBoard[i][j] = 0;
            }
          }
        }
        break;
      case 'right':
        for (let i = 0; i < 4; i++) {
          const row = [];
          for (let j = 3; j >= 0; j--) {
            if (newBoard[i][j] !== 0) row.push(newBoard[i][j]);
          }
          const merged = mergeTiles(row);
          newScore += merged.score;
          for (let j = 3; j >= 0; j--) {
            const index = 3 - j;
            if (index < merged.tiles.length) {
              if (newBoard[i][j] !== merged.tiles[index]) moved = true;
              newBoard[i][j] = merged.tiles[index];
            } else {
              if (newBoard[i][j] !== 0) moved = true;
              newBoard[i][j] = 0;
            }
          }
        }
        break;
      default:
        return;
    }

    if (moved) {
      addNewTile(newBoard);
      setBoard(newBoard);
      setScore(newScore);
      checkGameOver(newBoard);
    }
  };

  // 合并方块
  const mergeTiles = (tiles) => {
    let score = 0;
    for (let i = 0; i < tiles.length - 1; i++) {
      if (tiles[i] === tiles[i + 1]) {
        tiles[i] *= 2;
        score += tiles[i];
        tiles.splice(i + 1, 1);
      }
    }
    return { tiles, score };
  };

  // 检查游戏是否结束
  const checkGameOver = (board) => {
    // 检查是否还有空单元格
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (board[i][j] === 0) return;
      }
    }

    // 检查是否还有可合并的方块
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const current = board[i][j];
        if (
          (i < 3 && current === board[i + 1][j]) ||
          (j < 3 && current === board[i][j + 1])
        ) {
          return;
        }
      }
    }

    setGameOver(true);
  };

  // 重新开始游戏
  const restartGame = () => {
    setBoard(initializeBoard());
    setScore(0);
    setGameOver(false);
  };

  // 键盘控制
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowUp':
          handleMove('up');
          break;
        case 'ArrowDown':
          handleMove('down');
          break;
        case 'ArrowLeft':
          handleMove('left');
          break;
        case 'ArrowRight':
          handleMove('right');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [board, gameOver]);

  // 初始化游戏
  useEffect(() => {
    setBoard(initializeBoard());
  }, []);

  return (
    <div className="game-2048">
      <h1>2048 Game</h1>
      <div className="score-container">
        <div className="score">Score: {score}</div>
        <button onClick={restartGame} className="restart-btn">Restart</button>
      </div>
      {gameOver && <div className="game-over">Game Over!</div>}
      <Board board={board} />
    </div>
  );
};

export default Game2048;