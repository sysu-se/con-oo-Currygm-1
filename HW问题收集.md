## HW 问题收集


### 已解决

1. 为什么把 `Game` / `Sudoku` 接进前端之后，界面有时不会自动刷新？
   1. **上下文**：一开始已经有了领域对象，但如果只是修改对象内部字段，Svelte 组件不会稳定更新。这个问题直接关系到这次作业要求里的“领域对象接入真实 Svelte 流程”。
   2. **解决手段**：自己阅读现有 `store` 代码、对照 `Svelte 3` 的 `writable` / `derived` 机制，并结合实际调试，最后确认不能只依赖对象内部 mutation，必须通过 `store.update()` 主动通知订阅者。最终我在 `src/node_modules/@sudoku/stores/grid.js` 里实现了 `gameSession` 适配层，让 `guess()`、`undo()`、`redo()` 都通过 store 更新触发 UI 刷新。

2. 如何把“题目给定数字不可修改”从 UI 判断提升为领域规则？
   1. **上下文**：在 review 里被指出，之前的 `Sudoku` 只保存 `grid`，没有保存固定题面格，因此理论上任何格子都可以被改写。这不符合数独的核心业务规则。
   2. **解决手段**：我先对照 review 重新梳理 `Sudoku` 和 `Game` 的职责边界，然后在 `src/domain/sudoku.js` 中增加了 `fixed` 状态、`isFixedCell()` 接口，并让 `guess()` 直接拒绝改写 givens。之后再把 `src/node_modules/@sudoku/stores/grid.js` 调整为通过 `game.isFixedCell()` 判断编辑权限，而不是只靠 UI 读取题面数组。

3. 为什么 `npm run build` 会在样式预处理阶段出错，如何修复？
   1. **上下文**：项目一度在构建阶段报 `postcss` / `svelte-preprocess` 相关错误，导致虽然代码和测试都没问题，但生产构建不能稳定通过。
   2. **解决手段**：我通过对比本次仓库和上一版 `oo-Currygm` 的 `package.json`、`rollup.config.js`、构建链路配置，定位到两个兼容性问题：一是 `postcss-load-config` 版本不匹配，二是额外接入的 `postcss-clean` 与当前样式链路不兼容。把版本和配置调整回兼容组合之后，`npm run build` 恢复正常。

### 未解决

1. `npm ci` 在当前挂载目录下仍然会遇到 `esbuild` 的执行权限问题
   1. **上下文**：我已经修掉了 `picomatch` 的依赖解析问题，但在 `/mnt/f/...` 这种目录下执行 `npm ci` 时，`esbuild/install.js` 仍然可能因为 `spawnSync ... EPERM` 失败。这更像是当前环境的执行权限限制，而不是项目业务代码问题。
   2. **尝试解决手段**：我已经排查过 `package.json/package-lock.json` 的一致性，也验证过 `npm ci --ignore-scripts` 可以成功安装并让测试、构建继续工作。但为什么当前环境会禁止 `esbuild` 安装脚本里的二进制校验，以及有没有更干净的项目内解决方案，我还没有彻底解决。

2. 领域层已经返回结构化冲突坐标，但 UI 侧还保留了一层字符串适配
   1. **上下文**：为了响应 review，我把 `Sudoku.getInvalidCells()` 改成了返回 `{ row, col }`，这比原来的 `"col,row"` 字符串更合理。但现有组件树仍然依赖字符串键判断冲突高亮，所以 `stores/grid.js` 里还保留了从对象转回字符串的适配。
   2. **尝试解决手段**：我先完成了“领域接口改正确、前端继续能用”的最小闭环，没有一次性重写全部组件。如果后续要做得更彻底，应该把 `Board.svelte` 一类组件也改成直接消费结构化坐标，而不是继续传 `"x,y"` 字符串。

3. 项目仍然存在一些历史 warning 和工程性小问题
   1. **上下文**：当前构建虽然已经成功，但还有几个非阻塞 warning，例如 `QRCode.svelte` 的 `img` 缺少 `alt`、`Settings.svelte` 有未使用 export、以及 `postcss-discard` 的 deprecated 提示。
   2. **尝试解决手段**：我已经确认这些 warning 不影响本次作业的核心目标，也和领域对象接入关系不大，所以没有优先处理。后续如果要继续完善工程质量，我认为可以把这些 warning 清掉，并顺便检查一遍项目里的无障碍和依赖老化问题。
