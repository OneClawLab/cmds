# Implementation Plan: cmds-cli

## Overview

基于设计文档，将 cmds CLI 工具的实现分解为增量式编码任务。每个任务构建在前一个任务之上，确保无孤立代码。使用 TypeScript + commander + fuzzysort + vitest + fast-check。

## Tasks

- [ ] 1. 定义核心类型与数据模型
  - [ ] 1.1 在 `src/types.ts` 中定义所有共享类型（TldrEntry, TldrIndex, CommandEntry, RuntimeIndex, RuntimeIndexMeta, SearchResult, CommandInfo, CategorySummary, ListSummary, RouteResult, ScanResult）
    - 严格按照设计文档中的数据模型定义
    - _Requirements: 7.4_

- [ ] 2. 实现数据层与输出格式化
  - [ ] 2.1 实现 `src/data.ts` — 索引加载与保存
    - 实现 loadTldrIndex, loadRuntimeIndex, saveRuntimeIndex, getRuntimeIndexPath, getTldrIndexPath
    - Runtime_Index 不存在时返回 null
    - 读取失败时抛出明确错误
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [ ]* 2.2 编写 data 层属性测试 — Runtime Index round-trip
    - **Property 9: Runtime Index 序列化 round-trip**
    - **Validates: Requirements 5.5, 7.4**

  - [ ] 2.3 实现 `src/formatter.ts` — 输出格式化
    - 实现 isTTY, shouldOutputJson, format 及各子命令的 Markdown 格式化函数
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 2.4 编写 formatter 属性测试 — 输出格式决策
    - **Property 10: 输出格式决策正确性**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [ ] 3. 实现工具函数与智能路由
  - [ ] 3.1 实现 `src/utils.ts` — 工具函数
    - 实现 commandExists（PATH 查找）、execCommand（执行外部命令）等辅助函数
    - _Requirements: 3.4, 5.1_

  - [ ] 3.2 实现 `src/router.ts` — 智能路由
    - 实现 routeQuery 函数，根据 query 是否匹配 Runtime_Index 中的命令名决定路由
    - _Requirements: 1.1, 1.2_

  - [ ]* 3.3 编写 router 属性测试 — 路由正确性
    - **Property 1: 智能路由正确性**
    - **Validates: Requirements 1.1, 1.2**

- [ ] 4. Checkpoint — 确保所有测试通过
  - 确保所有测试通过，如有问题请告知。

- [ ] 5. 实现搜索引擎
  - [ ] 5.1 安装 fuzzysort 依赖并实现 `src/search.ts`
    - 实现 searchFuzzy（基于 fuzzysort 匹配 name+description+examples）
    - 实现 searchVdb（调用外部 vdb 命令，失败返回 null）
    - 实现 search 主函数（VDB 优先，fallback 到 fuzzysort）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 5.2 编写 search 属性测试 — 排序与 limit
    - **Property 2: 搜索结果按相关性排序**
    - **Property 3: 搜索结果数量不超过 limit**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 5.3 编写 search 属性测试 — 匹配范围
    - **Property 4: 模糊搜索匹配范围覆盖 name**
    - **Validates: Requirements 2.6**

- [ ] 6. 实现 Info Resolver
  - [ ] 6.1 实现 `src/info.ts`
    - 实现 resolveInfo（从 Runtime_Index 查询命令信息）
    - 实现 helpFallback（执行 --help 提取描述）
    - 命令不存在时抛出 CommandNotFoundError
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 6.2 编写 info 属性测试 — 结构完整性
    - **Property 5: Info 返回完整结构化信息**
    - **Validates: Requirements 3.1**

- [ ] 7. 实现 List Aggregator
  - [ ] 7.1 实现 `src/list.ts`
    - 实现 listSummary（分类概览）和 listByCategory（分类过滤）
    - 分类不存在时抛出 CategoryNotFoundError
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 7.2 编写 list 属性测试 — 过滤与 summary 一致性
    - **Property 6: 分类过滤正确性**
    - **Property 7: Summary 概览一致性**
    - **Validates: Requirements 4.1, 4.2**

- [ ] 8. Checkpoint — 确保所有测试通过
  - 确保所有测试通过，如有问题请告知。

- [ ] 9. 实现 Scanner
  - [ ] 9.1 实现 `src/scanner.ts`
    - 实现 detectCommands（优先 compgen -c，fallback 遍历 PATH）
    - 实现 mergeWithTldr（与 tldr 索引比对）
    - 实现 checkVdbAvailability
    - 实现 scan 主函数，组装 RuntimeIndex 并写入文件
    - 自动创建 `~/.config/cmds/` 目录
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 9.2 编写 scanner 属性测试 — Tldr 比对
    - **Property 8: Tldr 索引比对正确性**
    - **Validates: Requirements 5.2**

- [ ] 10. 集成 CLI 入口与子命令注册
  - [ ] 10.1 更新 `src/index.ts` — 注册所有子命令
    - 注册默认命令（智能路由）、info、list、scan 子命令
    - 接入 Output_Formatter 处理输出
    - 实现退出码逻辑（0/1/2）
    - 错误输出写入 stderr
    - _Requirements: 1.3, 1.4, 2.7, 3.3, 4.3, 8.1, 8.2, 8.3_

  - [ ]* 10.2 编写 CLI 集成单元测试
    - 测试无参数输出帮助、info 子命令路由、搜索无结果退出码等
    - _Requirements: 1.3, 1.4, 2.7, 8.1, 8.2, 8.3_

- [ ] 11. 实现 fast-check 自定义 Arbitrary 生成器
  - [ ] 11.1 创建 `src/__tests__/helpers/arbitraries.ts`
    - 定义 RuntimeIndex、CommandEntry、TldrEntry、SearchResult 等类型的 fast-check Arbitrary 生成器
    - 供所有属性测试复用

- [ ] 12. Final Checkpoint — 确保所有测试通过
  - 运行完整测试套件，确保所有测试通过，如有问题请告知。

## Notes

- 标记 `*` 的子任务为可选任务（属性测试和单元测试），可跳过以加速 MVP
- 每个任务引用具体需求以确保可追溯性
- Checkpoint 任务确保增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
