/**
 * @typedef {Object} SudokuObject
 * @property {function(): number[][]} getGrid - 返回棋盘的深拷贝
 * @property {function(number, number): boolean} isFixedCell - 判断指定格是否为固定题面格
 * @property {function({ row: number, col: number, value: number|null }): boolean} guess - 填入数字，返回是否产生变化
 * @property {function(): SudokuObject} clone - 生成独立副本
 * @property {function(): Array<{ row: number, col: number }>} getInvalidCells - 返回冲突格坐标列表
 * @property {function(): { grid: number[][], fixed: boolean[][] }} toJSON - 序列化
 * @property {function(): string} toString - 格式化输出
 */

const BOX_SIZE = 3;
const SUDOKU_SIZE = 9;

/**
 * 深拷贝 9x9 棋盘二维数组，防止外部修改污染内部状态。
 *
 * @param {number[][]} grid - 9x9 数独棋盘
 * @returns {number[][]} grid 的深拷贝
 */
function copyGrid(grid) {
	return grid.map(row => row.slice());
}

/**
 * 深拷贝固定题面格掩码。
 *
 * @param {boolean[][]} fixedCells - 9x9 布尔矩阵，true 表示该格为 givens
 * @returns {boolean[][]} fixedCells 的深拷贝
 */
function copyFixedCells(fixedCells) {
	return fixedCells.map(row => row.slice());
}

/**
 * 校验并标准化单元格值，null 转为 0。
 *
 * @param {number|null} value - 单元格值，合法范围 0-9 或 null
 * @returns {number} 标准化后的值（0-9）
 * @throws {TypeError} 值不是 0-9 整数时抛出
 */
function normalizeCellValue(value) {
	if (value === null) {
		return 0;
	}

	if (!Number.isInteger(value) || value < 0 || value > 9) {
		throw new TypeError('Sudoku cell values must be integers between 0 and 9.');
	}

	return value;
}

/**
 * 校验并标准化整张 9x9 棋盘。
 *
 * @param {number[][]} input - 待校验的二维数组
 * @returns {number[][]} 标准化后的 9x9 棋盘
 * @throws {TypeError} 结构不符合 9x9 要求时抛出
 */
function normalizeGrid(input) {
	if (!Array.isArray(input) || input.length !== SUDOKU_SIZE) {
		throw new TypeError('Sudoku grid must be a 9x9 array.');
	}

	return input.map((row, rowIndex) => {
		if (!Array.isArray(row) || row.length !== SUDOKU_SIZE) {
			throw new TypeError(`Sudoku row ${rowIndex} must contain 9 cells.`);
		}

		return row.map(normalizeCellValue);
	});
}

/**
 * 根据初始题面推导固定格掩码，非零值视为 givens。
 *
 * @param {number[][]} grid - 标准化后的 9x9 棋盘
 * @returns {boolean[][]} 9x9 布尔矩阵
 */
function deriveFixedCells(grid) {
	return grid.map(row => row.map(cell => cell !== 0));
}

/**
 * 校验并标准化固定格掩码，确保为合法的 9x9 布尔矩阵。
 *
 * @param {boolean[][]} fixedCells - 待校验的固定格数据
 * @returns {boolean[][]} 校验通过的布尔矩阵
 * @throws {TypeError} 结构或类型不合法时抛出
 */
function normalizeFixedCells(fixedCells) {
	if (!Array.isArray(fixedCells) || fixedCells.length !== SUDOKU_SIZE) {
		throw new TypeError('Sudoku fixed field must be a 9x9 boolean array.');
	}

	return fixedCells.map((row, rowIndex) => {
		if (!Array.isArray(row) || row.length !== SUDOKU_SIZE) {
			throw new TypeError(`Sudoku fixed row ${rowIndex} must contain 9 cells.`);
		}

		return row.map(cell => {
			if (typeof cell !== 'boolean') {
				throw new TypeError('Sudoku fixed cells must be booleans.');
			}

			return cell;
		});
	});
}

/**
 * 校验并标准化一次用户输入操作。
 *
 * @param {Object} move - 用户输入
 * @param {number} move.row - 行索引（0-8）
 * @param {number} move.col - 列索引（0-8）
 * @param {number|null} move.value - 填入的数字（1-9）或清除（0/null）
 * @returns {{ row: number, col: number, value: number }} 标准化后的 move
 * @throws {TypeError} move 不是对象时抛出
 * @throws {RangeError} row/col 超出范围时抛出
 */
function normalizeMove(move) {
	if (!move || typeof move !== 'object') {
		throw new TypeError('Move must be an object.');
	}

	const { row, col } = move;
	const value = normalizeCellValue(move.value);

	if (!Number.isInteger(row) || row < 0 || row >= SUDOKU_SIZE) {
		throw new RangeError('Move row must be between 0 and 8.');
	}

	if (!Number.isInteger(col) || col < 0 || col >= SUDOKU_SIZE) {
		throw new RangeError('Move col must be between 0 and 8.');
	}

	return { row, col, value };
}

/**
 * 校验坐标是否在 9x9 棋盘范围内。
 *
 * @param {number} row - 行索引（0-8）
 * @param {number} col - 列索引（0-8）
 * @throws {RangeError} 坐标超出范围时抛出
 */
function validatePosition(row, col) {
	if (!Number.isInteger(row) || row < 0 || row >= SUDOKU_SIZE) {
		throw new RangeError('Row must be between 0 and 8.');
	}

	if (!Number.isInteger(col) || col < 0 || col >= SUDOKU_SIZE) {
		throw new RangeError('Col must be between 0 and 8.');
	}
}

/**
 * 统计棋盘中已填写与未填写的格子数量。
 *
 * @param {number[][]} grid - 9x9 数独棋盘
 * @returns {{ filled: number, empty: number }} 填写统计
 */
function countCellStats(grid) {
	let filled = 0;

	for (const row of grid) {
		for (const cell of row) {
			if (cell !== 0) {
				filled += 1;
			}
		}
	}

	return {
		filled,
		empty: SUDOKU_SIZE * SUDOKU_SIZE - filled,
	};
}

/**
 * 将棋盘格式化为可读字符串，用于调试输出。
 *
 * @param {number[][]} grid - 9x9 数独棋盘
 * @returns {string} 格式化的棋盘字符串
 */
function buildGridString(grid) {
	const { filled, empty } = countCellStats(grid);
	const invalidCount = collectInvalidCells(grid).length;
	const lines = [];

	lines.push(`Sudoku(filled=${filled}, empty=${empty}, invalid=${invalidCount})`);
	lines.push('    0 1 2   3 4 5   6 7 8');

	for (let row = 0; row < SUDOKU_SIZE; row += 1) {
		if (row > 0 && row % BOX_SIZE === 0) {
			lines.push('   ------+-------+------');
		}

		const cells = [];
		for (let col = 0; col < SUDOKU_SIZE; col += 1) {
			if (col > 0 && col % BOX_SIZE === 0) {
				cells.push('|');
			}

			cells.push(grid[row][col] === 0 ? '.' : String(grid[row][col]));
		}

		lines.push(`${row}  ${cells.join(' ')}`);
	}

	return lines.join('\n');
}

/**
 * 扫描棋盘中所有冲突格子（同行/同列/同宫内重复）。
 *
 * @param {number[][]} grid - 9x9 数独棋盘
 * @returns {Array<{ row: number, col: number }>} 冲突格坐标列表
 */
function collectInvalidCells(grid) {
	const invalid = new Set();
	const addInvalid = (row, col) => {
		invalid.add(`${row},${col}`);
	};

	for (let row = 0; row < SUDOKU_SIZE; row += 1) {
		for (let col = 0; col < SUDOKU_SIZE; col += 1) {
			const value = grid[row][col];

			if (value === 0) {
				continue;
			}

			for (let other = 0; other < SUDOKU_SIZE; other += 1) {
				if (other !== col && grid[row][other] === value) {
					addInvalid(row, col);
					addInvalid(row, other);
				}

				if (other !== row && grid[other][col] === value) {
					addInvalid(row, col);
					addInvalid(other, col);
				}
			}

			const startRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
			const startCol = Math.floor(col / BOX_SIZE) * BOX_SIZE;

			for (let boxRow = startRow; boxRow < startRow + BOX_SIZE; boxRow += 1) {
				for (let boxCol = startCol; boxCol < startCol + BOX_SIZE; boxCol += 1) {
					if ((boxRow !== row || boxCol !== col) && grid[boxRow][boxCol] === value) {
						addInvalid(row, col);
						addInvalid(boxRow, boxCol);
					}
				}
			}
		}
	}

	return Array.from(invalid, key => {
		const [row, col] = key.split(',').map(Number);
		return { row, col };
	});
}

/**
 * 基于已标准化的状态创建 Sudoku 领域对象（内部工厂）。
 *
 * @param {Object} state - 已标准化的初始状态
 * @param {number[][]} state.grid - 9x9 棋盘数据
 * @param {boolean[][]} state.fixedCells - 9x9 固定格掩码
 * @returns {SudokuObject} Sudoku 领域对象
 */
function createSudokuFromState({ grid, fixedCells }) {
	let currentGrid = copyGrid(grid);
	let currentFixedCells = copyFixedCells(fixedCells);

	return {
		getGrid() {
			return copyGrid(currentGrid);
		},

		isFixedCell(row, col) {
			validatePosition(row, col);
			return currentFixedCells[row][col];
		},

		guess(move) {
			const normalizedMove = normalizeMove(move);

			if (currentFixedCells[normalizedMove.row][normalizedMove.col]) {
				throw new Error('Cannot modify a fixed puzzle cell.');
			}

			if (currentGrid[normalizedMove.row][normalizedMove.col] === normalizedMove.value) {
				return false;
			}

			currentGrid[normalizedMove.row][normalizedMove.col] = normalizedMove.value;
			return true;
		},

		clone() {
			return createSudokuFromState({
				grid: currentGrid,
				fixedCells: currentFixedCells,
			});
		},

		getInvalidCells() {
			return collectInvalidCells(currentGrid);
		},

		toJSON() {
			return {
				grid: copyGrid(currentGrid),
				fixed: copyFixedCells(currentFixedCells),
			};
		},

		toString() {
			return buildGridString(currentGrid);
		},
	};
}

/**
 * 创建 Sudoku 领域对象。
 *
 * 通过闭包封装内部状态，对外只暴露不可变接口，
 * 避免调用方直接持有可变引用。
 *
 * @param {number[][]} input - 9x9 初始棋盘，非零值自动标记为 givens
 * @returns {SudokuObject} Sudoku 领域对象
 * @throws {TypeError} 棋盘结构不合法时抛出
 */
export function createSudoku(input) {
	const grid = normalizeGrid(input);

	return createSudokuFromState({
		grid,
		fixedCells: deriveFixedCells(grid),
	});
}

/**
 * 从序列化数据恢复 Sudoku 领域对象。
 *
 * 兼容两种输入：直接传入 9x9 二维数组，或传入 `{ grid, fixed }` 结构。
 *
 * @param {number[][]|{ grid: number[][], fixed?: boolean[][] }} json - 序列化数据
 * @returns {SudokuObject} 恢复后的 Sudoku 领域对象
 * @throws {TypeError} 输入格式不合法时抛出
 */
export function createSudokuFromJSON(json) {
	if (Array.isArray(json)) {
		return createSudoku(json);
	}

	if (!json || typeof json !== 'object' || !Array.isArray(json.grid)) {
		throw new TypeError('Sudoku JSON must contain a grid field.');
	}

	const grid = normalizeGrid(json.grid);
	const fixedCells = json.fixed === undefined
		? deriveFixedCells(grid)
		: normalizeFixedCells(json.fixed);

	return createSudokuFromState({
		grid,
		fixedCells,
	});
}
