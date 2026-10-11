# GitHub 发布指南

本指南用于维护者发布和更新仓库。项目地址：[lainXXX/llm-wiki](https://github.com/lainXXX/llm-wiki)。

## 创建仓库

需要重新创建仓库或发布 Fork 时，可在 GitHub 中新建仓库，名称为 `llm-wiki`，Description 可使用：

> Claude Code skill for incrementally compiling source material into a linked Markdown personal knowledge wiki.

选择 **Public** 以公开项目。不要勾选自动生成 README、`.gitignore` 或许可证，本地已经包含这些文件。

建议 Topics：`claude-code`、`skill`、`knowledge-base`、`personal-wiki`、`markdown`。

## 仓库元数据

README 安装命令已使用 `https://github.com/lainXXX/llm-wiki.git`，`package.json` 已填写对应的 `author`、`repository`、`homepage` 和 `bugs` 字段。

发布到其他账号时，同步更新这些地址和 README 中的克隆命令。

## 首次提交

以下命令在项目根目录执行，仅适用于尚未初始化 Git 的新目录。确保 Git 已配置提交者姓名和邮箱，并使用属于自己的仓库地址。

```bash
npm ci
npm test
git init
git branch -M main
git add .
git diff --cached --stat
git commit -m "chore: prepare initial open source release"
git remote add origin https://github.com/lainXXX/llm-wiki.git
git push -u origin main
```

`git diff --cached --stat` 用于查看准备提交的文件；确认内容后再执行提交和推送。

依赖目录、本地凭证、日志、私人 `raw/` / `wiki/` 以及本地 agent 设置已列入 `.gitignore`。发布前仍需核对暂存区，确保新增文件中没有私人数据；代码中的库模板和测试夹具应正常提交。

上传后，到 GitHub 的 Actions 页面确认 CI 结果。CI 已配置 Ubuntu / Windows 与 Node.js 18、22、24，但只有在 GitHub 上运行成功后才能确认这些环境的实际结果。

## 更新仓库

```bash
npm test
git status --short
git add -- <本次需要提交的文件>
git diff --cached --stat
git diff --cached
git commit -m "docs: describe the change"
git push
```

## 后续版本

需要正式版本时，再将 [更新记录](CHANGELOG.md) 的 `Unreleased` 整理为对应版本和发布日期，并创建匹配的 Git 标签及 GitHub Release。上传源码本身不会发布 npm 包。
