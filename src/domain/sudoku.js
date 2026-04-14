const BOX_SIZE = 3;
const SUDOKU_SIZE = 9;

/**
 * 功能：返回棋盘数据的深拷贝。
 * 上下文：此函数在 Sudoku 对外暴露 grid 时被调用，例如 getGrid() 和 toJSON()。
 * 逻辑：grid 是二维数组，不能只复制最外层数组；这里通过逐行 slice() 复制每一行，
 * 从而避免调用方修改返回值时污染领域对象内部状态。
 *
 * @param {number[][]} grid
 * @returns {number[][]}
 */
function copyGrid(grid) {
	return grid.map(row => row.slice());
}

/**
 * 功能：返回固定题面标记的深拷贝。
 * 上下文：固定格是数独领域规则的一部分，clone()、toJSON() 和反序列化都会复用这份数据。
 *
 * @param {boolean[][]} fixedCells
 * @returns {boolean[][]}
 */
function copyFixedCells(fixedCells) {
	return fixedCells.map(row => row.slice());
}

/**
 * 功能：校验单个单元格的值是否合法。
 * 上下文：此函数会在标准化初始棋盘和 move 输入时复用，保证领域对象内部状态始终一致。
 *
 * @param {number | null} value
 * @returns {number}
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
 * 功能：校验并标准化整张 9x9 棋盘。
 * 上下文：createSudoku() 与 createSudokuFromJSON() 都通过此函数保证内部存储结构合法。
 *
 * @param {number[][]} input
 * @returns {number[][]}
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
 * 功能：根据初始题面推导固定格掩码。
 * 上下文：当调用 createSudoku(grid) 创建新题目时，所有非 0 初始数字都应视为 givens。
 *
 * @param {number[][]} grid
 * @returns {boolean[][]}
 */
function deriveFixedCells(grid) {
	return grid.map(row => row.map(cell => cell !== 0));
}

/**
 * 功能：校验并标准化固定格掩码。
 * 上下文：当 Sudoku 从 JSON 恢复时，需要确保 fixed 字段也是一个合法的 9x9 布尔矩阵。
 *
 * @param {boolean[][]} fixedCells
 * @returns {boolean[][]}
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
 * 功能：校验并标准化一次输入操作。
 * 上下文：当前实现没有把 move 单独设计成领域对象，因此 Sudoku.guess() 直接调用此函数完成输入校验。
 * 逻辑：要求 move 至少包含 row、col、value 三个字段；其中 row 和 col 必须落在 9x9 棋盘范围内，
 * value 复用单元格值校验逻辑，并把 null 统一转换为 0。
 *
 * @param {{ row: number, col: number, value: number | null }} move
 * @returns {{ row: number, col: number, value: number }}
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
 * 功能：校验坐标参数。
 * 上下文：领域层中多个方法都需要读取指定位置的状态，例如判断某格是否为固定题面格。
 *
 * @param {number} row
 * @param {number} col
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
 * 功能：统计棋盘中已填写与未填写格子数量。
 * 上下文：toString() 会通过此函数补充调试摘要信息，便于快速判断当前局面状态。
 *
 * @param {number[][]} grid
 * @returns {{ filled: number, empty: number }}
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
 * 功能：把当前棋盘格式化为便于调试阅读的字符串。
 * 上下文：此函数为 Sudoku.toString() 服务，用于测试和人工检查当前局面。
 *
 * @param {number[][]} grid
 * @returns {string}
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
 * 功能：扫描当前棋盘中的冲突格子。
 * 上下文：此函数为 Sudoku.getInvalidCells() 提供底层实现，结果会被 UI 用来做冲突高亮。
 * 逻辑：对每个非零格子分别检查同行、同列和同一个 3x3 宫内是否存在相同数字；
 * 一旦发现重复，就把相关坐标按 "x,y" 的形式写入集合，最终返回唯一冲突位置列表。
 *
 * @param {number[][]} grid
 * @returns {string[]}
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
 * 功能：基于已标准化的状态创建 Sudoku 领域对象。
 * 上下文：createSudoku() 与 createSudokuFromJSON() 最终都会走到这里，以共享一致的领域行为实现。
 *
 * @param {{ grid: number[][], fixedCells: boolean[][] }} state
 * @returns {{
 *   getGrid(): number[][],
 *   isFixedCell(row: number, col: number): boolean,
 *   guess(move: { row: number, col: number, value: number | null }): boolean,
 *   clone(): ReturnType<typeof createSudoku>,
 *   getInvalidCells(): Array<{ row: number, col: number }>,
 *   toJSON(): { grid: number[][], fixed: boolean[][] },
 *   toString(): string,
 * }}
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
 * 功能：创建 Sudoku 领域对象。
 * 上下文：这是领域层对“当前数独局面”的核心入口，UI 层和 Game 对象都会通过它持有棋盘状态。
 * 逻辑：创建时先校验并深拷贝输入 grid，之后通过闭包封装内部状态，对外只暴露必要行为，
 * 避免调用方直接持有可变引用。
 *
 * @param {number[][]} input
 * @returns {{
 *   getGrid(): number[][],
 *   isFixedCell(row: number, col: number): boolean,
 *   guess(move: { row: number, col: number, value: number | null }): boolean,
 *   clone(): ReturnType<typeof createSudoku>,
 *   getInvalidCells(): Array<{ row: number, col: number }>,
 *   toJSON(): { grid: number[][], fixed: boolean[][] },
 *   toString(): string,
 * }}
 */
export function createSudoku(input) {
	const grid = normalizeGrid(input);

	return createSudokuFromState({
		grid,
		fixedCells: deriveFixedCells(grid),
	});
}

/**
 * 功能：根据序列化数据恢复 Sudoku 领域对象。
 * 上下文：此函数在反串行化流程中被调用，例如恢复历史快照、恢复保存状态。
 * 逻辑：同时兼容两种输入形式：
 * 1. 直接传入 9x9 二维数组
 * 2. 传入形如 { grid } 的序列化结果
 *
 * @param {{ grid: number[][] } | number[][]} json
 * @returns {ReturnType<typeof createSudoku>}
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
