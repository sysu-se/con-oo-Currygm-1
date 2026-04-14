import { createSudokuFromJSON } from './sudoku.js';

/**
 * @typedef {import('./sudoku.js').SudokuObject} SudokuObject
 */

/**
 * @typedef {Object} GameObject
 * @property {function(): SudokuObject} getSudoku - 返回当前棋盘的独立副本
 * @property {function({ row: number, col: number, value: number|null }): boolean} guess - 填入数字并记录历史
 * @property {function(): boolean} undo - 撤销上一步
 * @property {function(): boolean} redo - 重做上一步
 * @property {function(): boolean} canUndo - 是否可撤销
 * @property {function(): boolean} canRedo - 是否可重做
 * @property {function(number, number): boolean} isFixedCell - 判断指定格是否为固定题面格
 * @property {function(): Object} toJSON - 序列化当前会话
 * @property {function(): string} toString - 格式化输出
 */

/**
 * 将当前 Sudoku 状态导出为历史快照。
 *
 * @param {SudokuObject} sudoku - 当前 Sudoku 对象
 * @returns {{ grid: number[][], fixed: boolean[][] }} 快照数据
 */
function snapshotSudoku(sudoku) {
	return sudoku.toJSON();
}

/**
 * 通过反序列化-再序列化复制单个历史快照，避免引用共享。
 *
 * @param {{ grid: number[][], fixed?: boolean[][] }} snapshot - 待复制的快照
 * @returns {{ grid: number[][], fixed: boolean[][] }} 独立的快照副本
 */
function cloneSnapshot(snapshot) {
	return createSudokuFromJSON(snapshot).toJSON();
}

/**
 * 深拷贝整条历史栈。
 *
 * @param {Array<{ grid: number[][], fixed?: boolean[][] }>} history - 历史快照数组
 * @param {string} fieldName - 字段名称，用于错误提示
 * @returns {Array<{ grid: number[][], fixed: boolean[][] }>} 独立的历史栈副本
 * @throws {TypeError} history 不是数组时抛出
 */
function cloneHistory(history, fieldName) {
	if (!Array.isArray(history)) {
		throw new TypeError(`${fieldName} must be an array.`);
	}

	return history.map(cloneSnapshot);
}

/**
 * 将输入标准化为 Sudoku 领域对象。
 *
 * 支持传入现成的 Sudoku 对象（自动 clone）或序列化数据。
 *
 * @param {SudokuObject|{ grid: number[][] }} sudoku - Sudoku 对象或其序列化结果
 * @returns {SudokuObject} 独立的 Sudoku 实例
 */
function normalizeSudokuInput(sudoku) {
	if (sudoku && typeof sudoku.clone === 'function' && typeof sudoku.toJSON === 'function') {
		return sudoku.clone();
	}

	return createSudokuFromJSON(sudoku);
}

/**
 * 创建 Game 领域对象，管理当前棋盘与 undo/redo 历史。
 *
 * @param {Object} options - 创建选项
 * @param {SudokuObject} options.sudoku - 当前 Sudoku 实例
 * @param {Array<{ grid: number[][], fixed?: boolean[][] }>} [options.undoStack=[]] - 撤销历史栈
 * @param {Array<{ grid: number[][], fixed?: boolean[][] }>} [options.redoStack=[]] - 重做历史栈
 * @returns {GameObject} Game 领域对象
 * @throws {TypeError} 缺少 sudoku 参数时抛出
 */
export function createGame({ sudoku, undoStack = [], redoStack = [] } = {}) {
	if (!sudoku) {
		throw new TypeError('createGame requires a sudoku instance.');
	}

	let activeSudoku = normalizeSudokuInput(sudoku);
	let undoHistory = cloneHistory(undoStack, 'undoStack');
	let redoHistory = cloneHistory(redoStack, 'redoStack');

	/**
	 * 用历史快照替换当前棋盘状态。
	 *
	 * @param {{ grid: number[][], fixed?: boolean[][] }} snapshot - 目标快照
	 */
	function restore(snapshot) {
		activeSudoku = createSudokuFromJSON(snapshot);
	}

	/**
	 * 读取当前局面的快照。
	 *
	 * @returns {{ grid: number[][], fixed: boolean[][] }} 当前棋盘快照
	 */
	function getCurrentSnapshot() {
		return snapshotSudoku(activeSudoku);
	}

	return {
		getSudoku() {
			return activeSudoku.clone();
		},

		guess(move) {
			const previousSnapshot = getCurrentSnapshot();
			const changed = activeSudoku.guess(move);

			if (!changed) {
				return false;
			}

			// Sudoku 负责 move 校验与固定格约束，Game 只在变化时记录历史。
			undoHistory.push(previousSnapshot);
			redoHistory = [];
			return true;
		},

		undo() {
			if (undoHistory.length === 0) {
				return false;
			}

			redoHistory.push(getCurrentSnapshot());
			restore(undoHistory.pop());
			return true;
		},

		redo() {
			if (redoHistory.length === 0) {
				return false;
			}

			undoHistory.push(getCurrentSnapshot());
			restore(redoHistory.pop());
			return true;
		},

		canUndo() {
			return undoHistory.length > 0;
		},

		canRedo() {
			return redoHistory.length > 0;
		},

		isFixedCell(row, col) {
			return activeSudoku.isFixedCell(row, col);
		},

		toJSON() {
			return {
				sudoku: getCurrentSnapshot(),
				undoStack: cloneHistory(undoHistory),
				redoStack: cloneHistory(redoHistory),
			};
		},

		toString() {
			return [
				'Game State:',
				activeSudoku.toString(),
				`undo=${undoHistory.length}, redo=${redoHistory.length}`,
			].join('\n');
		},
	};
}

/**
 * 从序列化数据恢复 Game 会话对象。
 *
 * @param {Object} json - 序列化数据
 * @param {{ grid: number[][], fixed?: boolean[][] }} json.sudoku - Sudoku 序列化数据
 * @param {Array<{ grid: number[][], fixed?: boolean[][] }>} [json.undoStack] - 撤销历史
 * @param {Array<{ grid: number[][], fixed?: boolean[][] }>} [json.redoStack] - 重做历史
 * @returns {GameObject} 恢复后的 Game 对象
 * @throws {TypeError} 输入不是对象时抛出
 */
export function createGameFromJSON(json) {
	if (!json || typeof json !== 'object') {
		throw new TypeError('Game JSON must be an object.');
	}

	return createGame({
		sudoku: createSudokuFromJSON(json.sudoku),
		undoStack: json.undoStack === undefined ? [] : json.undoStack,
		redoStack: json.redoStack === undefined ? [] : json.redoStack,
	});
}
