# con-oo-Currygm-1 - Review

## Review 结论

当前实现已经把 Sudoku/Game 真实接入了 Svelte 主流程，开始新局、界面渲染、用户输入、Undo/Redo 都能通过领域对象链路完成，这一点明显优于“领域对象只存在于测试里”的方案。但整体设计还没有完全收紧：核心业务规则“获胜判定”仍留在 Svelte store 中，适配层同时维护 puzzle 和 game 两份状态源，反序列化也没有守住 fixed 掩码的不变量，所以它更像一个可工作的接入版，而不是边界非常稳固的高质量 OOD 版本。

## 总体评价

| 维度 | 评价 |
| --- | --- |
| OOP | good |
| JS Convention | fair |
| Sudoku Business | fair |
| OOD | fair |

## 缺点

### 1. 胜负规则仍停留在 Svelte store，而不是 Game/Sudoku 领域层

- 严重程度：core
- 位置：src/node_modules/@sudoku/stores/game.js:7-18, src/App.svelte:12-17
- 原因：“这一局是否已经完成并获胜”是数独游戏的核心业务规则，但这里由 derived store 通过“没有 0 且 invalidCells 为空”临时拼装，随后由 App 订阅它来弹出 game over。这样会让领域模型无法自证自己的业务状态，业务规则分散在适配层和组件边界之外，后续如果有存档恢复、非 Svelte 端复用或更复杂的结束条件，就容易重复实现或出现漂移。

### 2. 反序列化没有校验 fixed 掩码与棋盘内容的一致性

- 严重程度：major
- 位置：src/domain/sudoku.js:357-374
- 原因：createSudokuFromJSON 只校验 fixed 的形状和布尔类型，没有校验它与 grid 是否满足业务不变量。这样可以构造出“空格却 fixed=true”或“题面 givens 却 fixed=false”的非法数独对象，进而让固定格约束、题面渲染和历史恢复在语义上发生分裂。

### 3. 适配层同时保存 puzzle 和 game，形成两个可独立漂移的状态源

- 严重程度：major
- 位置：src/node_modules/@sudoku/stores/grid.js:29-35, src/node_modules/@sudoku/stores/grid.js:88-97
- 原因：UI 用 puzzle.getGrid() 判断 givens 和渲染题面，而编辑权限、历史和当前盘面又依赖 game。loadSession 还允许传入任意 puzzle/game 组合而不验证一致性。当前启动流程恰好传入匹配数据，所以运行路径基本正常，但从 OOD 角度看，这说明模型仍然允许双源失配，边界没有真正收敛。

### 4. 手动订阅 gameWon 缺少释放，副作用直接挂在组件顶层

- 严重程度：minor
- 位置：src/App.svelte:12-17
- 原因：在组件脚本顶层直接 subscribe 而不在 onDestroy 取消订阅，不符合常见 Svelte 组件习惯。根组件通常只挂载一次，所以短期风险不大，但热更新、复挂载或后续重构时容易出现重复订阅和重复弹窗。

### 5. 第一方适配代码放在 src/node_modules 下，不符合 JS 生态对 node_modules 的通常语义

- 严重程度：minor
- 位置：src/node_modules/@sudoku/game.js:1-124, src/node_modules/@sudoku/stores/grid.js:1-228
- 原因：这些文件实际承担的是本项目自己的游戏门面和 Svelte 适配层职责，不是真正的第三方依赖。把它们放在 node_modules 形态路径下会模糊代码所有权和架构边界，也会增加团队理解和工具链定位源码时的认知成本。

## 优点

### 1. Undo/Redo 被真正收回到 Game 中

- 位置：src/domain/game.js:114-145
- 原因：guess、undo、redo 都围绕 Game 的历史栈和 Sudoku 快照工作，组件没有自己维护撤销/重做逻辑，职责边界明显比把历史散落在 `.svelte` 文件里更清晰。

### 2. 使用 store adapter 把领域对象接入了 Svelte 响应式链路

- 位置：src/node_modules/@sudoku/stores/grid.js:58-79, src/node_modules/@sudoku/stores/grid.js:107-128
- 原因：gameSession 持有 Game/Sudoku，并把 guess、undo、redo 封装为 store 方法，再通过 derived 暴露 grid、invalidCells、canUndo、canRedo，这正是作业要求里推荐的接入方式。

### 3. 开始一局游戏的真实流程已经进入领域层

- 位置：src/components/Modal/Types/Welcome.svelte:16-23, src/node_modules/@sudoku/game.js:19-31
- 原因：欢迎弹窗并没有自己拼装旧状态，而是通过 startNew/startCustom 创建 Sudoku 和 Game，再整体装载进 session，符合“真实游戏界面消费领域对象”的要求。

### 4. 用户输入、清空和提示都统一走 Game.guess 链路

- 位置：src/components/Controls/Keyboard.svelte:10-25, src/components/Controls/ActionBar/Actions.svelte:14-35, src/node_modules/@sudoku/stores/grid.js:177-216
- 原因：普通填数、擦除以及 hint 最终都委托给 gameSession.guess，因此固定格约束和 undo/redo 历史能够保持一致，这对数独游戏的一致性非常重要。

### 5. Sudoku 对输入校验、固定格约束和外表化做了较完整封装

- 位置：src/domain/sudoku.js:61-140, src/domain/sudoku.js:280-321
- 原因：grid、move、fixed 都有显式标准化，guess 会拦截 fixed cell，且对象还提供 clone、getInvalidCells、toJSON、toString，说明它已经不是简单的二维数组包装。

## 补充说明

- 本次结论完全基于静态阅读；按要求未运行测试，也未实际操作页面验证运行时行为。
- 关于“是否真实接入 Svelte 游戏流程”的判断，主要依据 src/node_modules/@sudoku/game.js、src/node_modules/@sudoku/stores/grid.js、src/node_modules/@sudoku/stores/game.js 与 Board/Controls/Welcome/App 的调用链做静态推断。
- 本次只审查了 src/domain/* 及其关联的 Svelte 接入代码，没有扩展审查无关目录，也没有评价 DESIGN.md 的解释是否充分。
