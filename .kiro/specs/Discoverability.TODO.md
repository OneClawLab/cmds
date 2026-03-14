# cmds 可发现性整改清单

基于 ProgressiveDiscovery.md 规范逐项检查。

## 高优先级 (MUST 违规)

### 1. 缺少 `--help --verbose` 支持
- 规范要求: MUST 支持 `--help --verbose` 输出当前命令层级的完整信息
- 现状: 使用 commander 默认 --help，不支持 --verbose
- 影响: 主命令及所有子命令（cmds, cmds info, cmds list, cmds scan）
- 整改: 自定义 help 处理，检测 `--help --verbose` 时输出完整信息

### 2. USAGE 缺少 examples
- 规范要求: MUST 有 examples
- 现状: `--help` 输出中没有 examples（USAGE.md 有，但 --help 没有）
- 影响: 所有命令和子命令
- 整改: 在各命令的 `addHelpText('after', ...)` 中添加 examples

### 3. 自动 --help 时退出码不一致
- 规范要求: 因参数错误触发自动 --help 时退出码 MUST 为 2
- 现状: `cmds` 无参数时显示 help 并 exitCode=0（正确）。但 commander exitOverride 后参数错误的退出码取决于 commander 内部逻辑，未显式设为 2
- 整改: 确保参数错误场景退出码为 2

### 4. 子命令 `info` 缺少参数时未自动显示 --help
- 规范要求: 没有参数就无意义的命令 MUST 自动显示 --help
- 现状: `cmds info`（不带参数）由 commander 处理为 "missing required argument"，但输出的是 commander 默认错误信息而非 --help 内容
- 整改: 对 `info` 子命令配置 `.showHelpAfterError(true)` 或自定义处理

### 5. 环境与前置依赖未在 --help 中说明
- 规范要求: 如果依赖外部服务或其他命令，MUST 在 USAGE 中说明
- 现状: cmds 依赖 `cmds scan` 生成运行时索引后才能正常工作，但 --help 中没有提及这个前置条件
- 整改: 在主命令 help 中提示 "首次使用请先运行 `cmds scan`"

### 6. 机器可读输出说明不足
- 规范要求: 如果支持 --json，MUST 在 USAGE 中说明
- 现状: --json 作为 option 列出了，但没有说明 JSON 输出的格式/结构
- 补充: cmds 有智能 TTY 检测（非 TTY 自动 JSON），这个行为也 MUST 在 help 中说明，否则用户/LLM 在管道中使用时会困惑

### 7. stdin/管道支持标注
- 规范要求: 如果支持管道，MUST 在 USAGE 中标注
- 现状: cmds 的输出支持管道（且非 TTY 时自动切换 JSON），但 --help 中未说明
- 整改: 标注输出在管道模式下自动切换为 JSON

## 中优先级 (SHOULD 违规)

### 8. 错误输出缺少修复建议
- 规范要求: 错误信息 SHOULD 包含"什么错了"+"怎么修"
- 现状: "No runtime index found. Run `cmds scan` first." — 这个做得不错。但 `CommandNotFoundError` 只说命令未找到，没有建议
- 整改: CommandNotFoundError 补充建议，如 "Command 'xxx' not found in index. Try `cmds scan` to refresh, or `cmds \"xxx\"` to search."

### 9. 配置/数据文件路径未在 --help 中提及
- 规范要求: SHOULD 告诉使用者配置数据在哪里
- 现状: 运行时索引路径 `~/.config/cmds/index.json` 在 USAGE.md 中有，但 --help 中没有
- 整改: 在 scan 子命令的 help 中注明索引文件路径

### 10. --json 模式下错误未以 JSON 输出
- 规范要求: `--json` 模式下错误 MUST 也以 JSON 格式输出
- 现状: 即使指定 --json，错误仍然是纯文本到 stderr
- 整改: 当 --json 启用时，错误也输出为 JSON 格式

### 11. 退出码在 --help 中未说明
- 规范要求: 自定义退出码 MUST 在 USAGE 或文档中说明
- 现状: USAGE.md 中有退出码表，但 --help 中没有
- 整改: 在 --help --verbose 中包含退出码说明，或在 --help 末尾引用 USAGE.md

## 低优先级 (MAY / 建议)

### 12. examples 格式统一
- 规范要求: SHOULD 使用 `$` 前缀并附带注释
- 整改: 随高优先级 #2 一起处理

### 13. --version 输出过于简单
- 现状: 只输出 `0.1.0`
- 建议: 考虑加上命令名，如 `cmds 0.1.0`，与 pai 风格统一

### 14. USAGE.md 与 --help 的关联
- 现状: USAGE.md 内容详尽，但 --help 中没有引用
- 建议: 在 --help 末尾加一行引用
