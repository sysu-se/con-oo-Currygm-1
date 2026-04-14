import { createSudokuFromJSON } from './sudoku.js';

/**
 * 功能：把当前 Sudoku 状态导出为历史快照。
 * 上下文：此函数在 Game 的 undo/redo 历史记录中被调用。
 * 逻辑：当前设计保存的是整张棋盘快照，而不是 move 列表；
 * 这样 undo/redo 时可以直接恢复状态，不需要反向推导领域逻辑。
 *
 * @param {{ toJSON(): { grid: number[][] } }} sudoku
 * @returns {{ grid: number[][] }}
 */
function snapshotSudoku(sudoku) {
	return sudoku.toJSON();
}

/**
 * 功能：复制单个历史快照。
 * 上下文：此函数在构造 undo/redo 历史栈时被调用。
 * 逻辑：通过“反串行化再串行化”的方式生成新快照，避免不同历史节点共享内部数组引用。
 *
 * @param {{ grid: number[][] }} snapshot
 * @returns {{ grid: number[][] }}
 */
function cloneSnapshot(snapshot) {
	return createSudokuFromJSON(snapshot).toJSON();
}

/**
 * 功能：复制整条历史栈。
 * 上下文：createGame() 和 toJSON() 都会通过此函数确保历史记录彼此独立。
 *
 * @param {Array<{ grid: number[][] }>} history
 * @returns {Array<{ grid: number[][] }>}
 */
function cloneHistory(history, fieldName) {
	if (!Array.isArray(history)) {
		throw new TypeError(`${fieldName} must be an array.`);
	}

	return history.map(cloneSnapshot);
}

/**
 * 功能：把输入的 sudoku 参数标准化为领域对象。
 * 上下文：createGame() 既支持传入现成 Sudoku 对象，也支持传入其序列化结果。
 * 逻辑：如果输入已经是领域对象，则先 clone()；如果只是 plain data，则走反串行化恢复。
 *
 * @param {ReturnType<typeof createSudokuFromJSON> | { grid: number[][] }} sudoku
 * @returns {ReturnType<typeof createSudokuFromJSON>}
 */
function normalizeSudokuInput(sudoku) {
	if (sudoku && typeof sudoku.clone === 'function' && typeof sudoku.toJSON === 'function') {
		return sudoku.clone();
	}

	return createSudokuFromJSON(sudoku);
}

/**
 * 功能：创建 Game 领域对象。
 * 上下文：这是领域层对“一局游戏会话”的核心入口，负责连接当前棋盘与 undo/redo 历史。
 * 逻辑：Game 内部同时维护 activeSudoku、undoHistory、redoHistory 三份状态：
 * activeSudoku 表示当前局面，undoHistory 表示可撤销历史，redoHistory 表示可重做历史。
 *
 * @param {{ sudoku: ReturnType<typeof createSudokuFromJSON>, undoStack?: Array<{ grid: number[][] }>, redoStack?: Array<{ grid: number[][] }> }} param0
 * @returns {{
 *   getSudoku(): ReturnType<typeof createSudokuFromJSON>,
 *   guess(move: { row: number, col: number, value: number | null }): boolean,
 *   undo(): boolean,
 *   redo(): boolean,
 *   canUndo(): boolean,
 *   canRedo(): boolean,
 *   isFixedCell(row: number, col: number): boolean,
 *   toJSON(): { sudoku: { grid: number[][], fixed: boolean[][] }, undoStack: Array<{ grid: number[][], fixed: boolean[][] }>, redoStack: Array<{ grid: number[][], fixed: boolean[][] }> },
 *   toString(): string,
 * }}
 */
export function createGame({ sudoku, undoStack = [], redoStack = [] } = {}) {
	if (!sudoku) {
		throw new TypeError('createGame requires a sudoku instance.');
	}

	let activeSudoku = normalizeSudokuInput(sudoku);
	let undoHistory = cloneHistory(undoStack, 'undoStack');
	let redoHistory = cloneHistory(redoStack, 'redoStack');

	/**
	 * 功能：用历史快照替换当前棋盘状态。
	 * 上下文：此函数只在 undo() 和 redo() 流程中被调用。
	 * 逻辑：不直接复用历史中的旧引用，而是重新创建 Sudoku 对象，
	 * 从而保证当前状态和历史状态之间没有共享引用。
	 *
	 * @param {{ grid: number[][] }} snapshot
	 */
	function restore(snapshot) {
		activeSudoku = createSudokuFromJSON(snapshot);
	}

	/**
	 * 功能：读取当前局面的快照。
	 * 上下文：guess()、undo()、redo() 和 toJSON() 都会复用此函数。
	 *
	 * @returns {{ grid: number[][] }}
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

			// 这里先由 Sudoku 负责 move 校验、固定格约束和 no-op 判断，
			// Game 只在真正发生变化时记录历史，从而保持“盘面规则”和“会话历史”边界清晰。
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
 * 功能：根据序列化数据恢复 Game 会话对象。
 * 上下文：此函数在反串行化流程中被调用，用于恢复当前棋盘和历史栈。
 * 逻辑：先恢复当前 Sudoku，再把 undoStack 和 redoStack 一并交给 createGame()，
 * 从而得到一个可继续执行 guess / undo / redo 的完整会话对象。
 *
 * @param {{ sudoku: { grid: number[][] }, undoStack?: Array<{ grid: number[][] }>, redoStack?: Array<{ grid: number[][] }> }} json
 * @returns {ReturnType<typeof createGame>}
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
