/**
 * 领域层统一入口，导出 Sudoku 和 Game 的工厂函数及反序列化函数。
 *
 * @module domain
 */
export { createSudoku, createSudokuFromJSON } from './sudoku.js';
export { createGame, createGameFromJSON } from './game.js';
