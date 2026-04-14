# DESIGN

## 概述

本次改造把核心逻辑拆成三层：

- 领域层：`src/domain/sudoku.js` 与 `src/domain/game.js`
- Svelte 适配层：`src/node_modules/@sudoku/stores/grid.js` 与 `src/node_modules/@sudoku/game.js`
- View 层：现有的 `.svelte` 组件

这样处理之后，`Sudoku` / `Game` 不再只存在于测试中，而是已经被真实界面的开始游戏、输入、提示、撤销、重做流程消费。

## 1. `Sudoku` / `Game` 的职责边界

### `Sudoku`

`Sudoku` 表示“当前 9x9 数独局面”，职责包括：

- 持有当前 `grid`
- 持有固定题面格 `fixed`
- 提供 `isFixedCell(row, col)` 判断某格是否为 givens
- 提供 `guess(move)` 修改局面
- 提供 `getInvalidCells()` 计算冲突格
- 提供 `clone()` 生成独立副本
- 提供 `toJSON()` / `toString()` 做序列化和调试输出

换句话说，`Sudoku` 只关心“棋盘现在是什么样”。

### `Game`

`Game` 表示“一局游戏会话”，职责包括：

- 持有当前 `Sudoku`
- 管理 `undoStack` / `redoStack`
- 提供 `guess()` / `undo()` / `redo()`
- 提供 `canUndo()` / `canRedo()`
- 提供 `isFixedCell()` 供 UI 复用领域规则
- 提供 `toJSON()` 让当前会话可序列化

换句话说，`Game` 只关心“这一局是如何一步步演进到当前状态的”。

## 2. `Move` 是什么

本次实现中，`Move` 没有单独建成领域对象，而是保留为普通值结构：

```js
{ row, col, value }
```

原因是这类输入没有独立生命周期，也不需要身份语义。真正有长期状态和行为的是 `Sudoku` 与 `Game`。  
因此 `Move` 作为轻量值输入最合适，由 `Sudoku.guess()` 和 `Game.guess()` 在内部完成标准化和校验。

## 3. history 中存储的是什么

history 中存储的是 `Sudoku` 的快照，而不是 `Move` 列表。

具体来说：

- `undoStack` 保存每次输入前的 `sudoku.toJSON()`
- `redoStack` 保存撤销后被弹出的当前快照
- 如果一次输入不会改变当前格子值，则这次 no-op 不进入历史

我选择快照而不是 move 的原因是：

- 9x9 数独盘面很小，快照成本低
- undo / redo 恢复逻辑更直接
- 不需要反向推导某一步之前的旧值
- 更容易避免引用共享导致的历史污染

## 4. 复制策略与深拷贝

只要涉及以下场景，就必须进行深拷贝：

- `createSudoku(input)` 创建时复制输入 grid
- `Sudoku.getGrid()` 返回 grid 时复制
- `Sudoku.clone()` 复制当前局面
- `Sudoku.toJSON()` 导出序列化数据时复制
- `Game.getSudoku()` 返回当前盘面时复制
- `Game` 存取历史快照时复制

这样做的原因是 `grid` 是二维数组，属于嵌套可变结构。如果只做浅拷贝，会出现：

- clone A 的修改污染 clone B
- 当前盘面修改后连 undo 历史一起被改掉
- UI 获得内部数组引用后绕过领域层直接改状态

## 5. 序列化 / 反序列化设计

### `Sudoku`

`Sudoku.toJSON()` 输出结构：

```js
{
  grid: number[][],
  fixed: boolean[][]
}
```

`createSudokuFromJSON(json)` 支持从该结构恢复对象。

### `Game`

`Game.toJSON()` 输出结构：

```js
{
  sudoku: { grid: number[][], fixed: boolean[][] },
  undoStack: Array<{ grid: number[][], fixed: boolean[][] }>,
  redoStack: Array<{ grid: number[][], fixed: boolean[][] }>
}
```

`createGameFromJSON(json)` 会恢复：

- 当前 `Sudoku`
- `undoStack`
- `redoStack`

这样恢复出来的不是静态数据，而是一个还可以继续执行 `guess()`、`undo()`、`redo()` 的完整会话对象。

本次没有把以下状态纳入领域序列化：

- cursor
- timer
- modal
- notes
- candidates
- settings

这些仍属于 UI 层状态，而不是本次作业要求中的核心领域状态。

## 6. View 层如何消费 `Sudoku` / `Game`

本次采用的是作业中推荐的 **Store Adapter** 方案。

### 6.1 适配层结构

在 `src/node_modules/@sudoku/stores/grid.js` 中创建了一个统一的 `gameSession` store，内部同时持有：

- `puzzle`：不可变题面
- `game`：当前会话对应的 `Game`

这样做的原因是：

- UI 既需要当前用户看到的局面
- 也需要知道哪些格子是原始 givens，不能编辑

### 6.2 对外暴露的响应式状态

适配层继续向旧 UI 结构暴露兼容接口：

- `grid`：题面
- `userGrid`：当前局面
- `invalidCells`：冲突格列表
- `canUndo`：是否可撤销
- `canRedo`：是否可重做

同时也暴露行为入口：

- `gameSession.guess(...)`
- `gameSession.undo()`
- `gameSession.redo()`

### 6.3 真实界面中的接入方式

当前已经完成以下接入：

1. 开始一局游戏  
   `src/node_modules/@sudoku/game.js` 中的 `startNew()` / `startCustom()` 会创建新的 `Sudoku` 和 `Game`，并加载到 `gameSession`

2. 界面渲染当前局面  
   `Board.svelte` 消费的 `$grid` / `$userGrid` 已经来自领域对象导出的 store 状态

3. 用户输入  
   `Keyboard.svelte` 最终仍调用 `userGrid.set(...)`，但 `userGrid.set(...)` 已改为统一委托给 `Game.guess(...)`

4. Hint  
   `userGrid.applyHint(...)` 最终也走 `Game.guess(...)`，因此 hint 能进入历史链路

5. Undo / Redo  
   `Actions.svelte` 的按钮已经接入 `game.undo` / `game.redo`，并使用 `$canUndo` / `$canRedo` 控制状态

6. 固定题面格的编辑权限  
   `stores/grid.js` 中的 `isEditableCell(...)` 不再只靠 UI 自己判断题面数组，而是通过 `Game.isFixedCell(...)` 复用领域规则

## 7. 为什么 Svelte 界面会更新

这是本次作业最重要的原理说明之一。

### 7.1 为什么直接改对象内部字段不可靠

如果只是修改领域对象内部字段，例如：

```js
game.getSudoku().grid[0][2] = 4
```

或者直接原地改 store 里对象的嵌套字段，Svelte 不一定会刷新。原因是：

- Svelte 组件依赖的是 store 的订阅通知
- `derived` store 重新计算依赖的是上游 store 的更新
- 对象内部字段变化本身，不等于 store 触发了 `set()` / `update()`

### 7.2 本次方案如何触发更新

`gameSession` 使用 `writable(...)` 保存领域会话。  
每次执行：

- `guess()`
- `undo()`
- `redo()`

都会调用 `session.update(...)` 主动发出一次更新通知。

虽然 `Game` / `Sudoku` 对象本身是普通 JavaScript 对象，但一旦 `update()` 被调用：

- 依赖 `gameSession` 的 derived store 会重新计算
- `$grid` / `$userGrid` / `$invalidCells` / `$canUndo` / `$canRedo` 会更新
- 组件中的 `$store` 重新渲染

因此，真正触发 UI 刷新的关键不是“对象内部变了”，而是“store 主动通知了依赖者”。

## 8. 如果错误地直接 mutate，会出现什么问题

如果继续沿用旧写法，直接改二维数组或对象内部字段，会出现几类问题：

- UI 可能不刷新或刷新时机不稳定
- undo / redo 历史无法统一维护
- hint 与普通输入会走不同逻辑链路
- 组件内逻辑越来越重，领域对象沦为只在测试中存在的摆设
- 固定题面格是否可编辑会散落在 UI 判断中，而不是由数独对象统一定义

本次通过 store adapter 把所有关键写操作统一汇聚到 `Game`，就是为了解决这个问题。

## 9. 本次相对 Homework 1 的改进点

本次最明确的改进有三项：

### 1. 改进了领域对象对 UI 的暴露方式

不是只在测试里拥有 `Sudoku` / `Game`，而是通过 `gameSession` 让真实界面消费领域对象。

### 2. 改进了前端历史链路的一致性

普通输入、hint、undo、redo 全部进入同一个 `Game` 会话逻辑，而不是散落在不同组件和数组操作中。

### 3. 改进了响应式同步机制

通过 Svelte store adapter 明确处理“领域对象状态变化后如何通知 UI”，避免了只改对象字段却不触发刷新的问题。

### 4. 改进了数独核心业务规则建模

固定题面格现在属于 `Sudoku` 的内部状态，`guess()` 会拒绝改写 givens。  
这意味着“题目给定数字不可编辑”不再只是 UI 习惯，而是领域约束。

### 5. 改进了对象边界与接口一致性

`Game.guess()` 不再重新实现 move 规则或读取二维数组判断 no-op，而是直接委托给 `Sudoku.guess()`。  
同时，`Sudoku.getInvalidCells()` 现在返回结构化的 `{ row, col }`，由适配层负责转换成旧 UI 所需的字符串键。

### 6. 改进了反序列化契约

`createGameFromJSON()` / `cloneHistory()` 对损坏的 `undoStack` / `redoStack` 不再静默吞掉，而是明确抛错。  
这样保存/恢复类问题更容易被定位。
