import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from './helpers/domain-api.js'

describe('HW1 review-driven improvements', () => {
  it('models fixed givens inside Sudoku and rejects overwriting them', async () => {
    const { createSudoku } = await loadDomainApi()
    const sudoku = createSudoku(makePuzzle())

    expect(typeof sudoku.isFixedCell).toBe('function')
    expect(sudoku.isFixedCell(0, 0)).toBe(true)
    expect(sudoku.isFixedCell(0, 2)).toBe(false)
    expect(() => sudoku.guess({ row: 0, col: 0, value: 9 })).toThrow(/fixed/i)
    expect(sudoku.getGrid()[0][0]).toBe(5)
  })

  it('returns structured invalid cell coordinates instead of encoded strings', async () => {
    const { createSudoku } = await loadDomainApi()
    const sudoku = createSudoku(makePuzzle())

    sudoku.guess({ row: 0, col: 2, value: 5 })

    const invalidCells = sudoku.getInvalidCells()

    expect(invalidCells).toEqual(
      expect.arrayContaining([
        { row: 0, col: 0 },
        { row: 0, col: 2 },
      ]),
    )

    for (const cell of invalidCells) {
      expect(typeof cell).toBe('object')
      expect(typeof cell.row).toBe('number')
      expect(typeof cell.col).toBe('number')
    }
  })

  it('lets Game enforce fixed-cell rule through Sudoku instead of duplicating it', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    expect(typeof game.isFixedCell).toBe('function')
    expect(game.isFixedCell(0, 0)).toBe(true)
    expect(() => game.guess({ row: 0, col: 0, value: 9 })).toThrow(/fixed/i)
    expect(game.canUndo()).toBe(false)
  })

  it('throws on malformed serialized history instead of silently swallowing it', async () => {
    const { createGameFromJSON, createSudoku } = await loadDomainApi()
    const sudokuJson = createSudoku(makePuzzle()).toJSON()

    expect(() =>
      createGameFromJSON({
        sudoku: sudokuJson,
        undoStack: { broken: true },
        redoStack: [],
      }),
    ).toThrow(/undoStack/i)

    expect(() =>
      createGameFromJSON({
        sudoku: sudokuJson,
        undoStack: [],
        redoStack: { broken: true },
      }),
    ).toThrow(/redoStack/i)
  })
})
