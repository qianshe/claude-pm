#!/usr/bin/env node

const { program } = require('commander');
const { listProjects, switchProject, showCurrentProject, cleanProjects, manageSessionsCommand, historyClean } = require('../src/commands');
const { version } = require('../package.json');

program
  .name('claude-pm')
  .description('Claude Projects Local Manager - 本地项目管理工具')
  .version(version);

program
  .command('list')
  .alias('ls')
  .description('列出所有本地项目')
  .action(listProjects);

program
  .command('switch <projectName>')
  .alias('sw')
  .description('切换当前活跃项目')
  .option('--print-path', '输出路径信息（供 shell 函数使用）')
  .action((projectName, options) => switchProject(projectName, options));

program
  .command('current')
  .alias('c')
  .description('显示当前活跃项目')
  .action(showCurrentProject);

program
  .command('clean')
  .description('清理 .claude.json 中无缓存的项目')
  .option('--dry-run', '预览将要删除的项目，不实际删除')
  .action((options) => cleanProjects(options));

program
  .command('sessions [projectName]')
  .description('管理项目会话（查看和删除）')
  .option('--size <kb>', '自动选中小于指定大小的会话（单位：KB）', '2')
  .action((projectName, options) => manageSessionsCommand(projectName, options));

program
  .command('clean-history')
  .description('清理 .claude.json 中超过30条的历史记录（保留最近25条）')
  .action(historyClean);

program.parse(process.argv);
