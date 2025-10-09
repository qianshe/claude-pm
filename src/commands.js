const chalk = require('chalk');
const ora = require('ora');
const { getLocalProjects, getProjectInfo, formatSize, getMostRecentProject, updateProjectHistory, getClaudeProjects, getRealPathFromJsonl } = require('./projectManager');
const { getCurrentProject, setCurrentProject } = require('./config');

/**
 * 列出所有本地项目
 */
async function listProjects() {
  const spinner = ora('正在读取项目列表...').start();

  try {
    const projects = getLocalProjects();
    const currentProject = getCurrentProject();
    const mostRecentProject = getMostRecentProject();

    spinner.stop();

    if (projects.length === 0) {
      console.log(chalk.yellow('\n⚠️  未找到任何项目'));
      console.log(chalk.gray('请确认 Claude 缓存路径配置是否正确\n'));
      return;
    }

    // 统计有缓存和无缓存的项目数量
    const cachedCount = projects.filter(p => p.hasCache).length;
    const noCacheCount = projects.length - cachedCount;

    console.log(chalk.bold.cyan(`\n📁 本地项目列表 (共 ${projects.length} 个，${cachedCount} 个有缓存):\n`));

    projects.forEach((project, index) => {
      // 判断是否为活跃项目（优先使用手动设置，其次使用自动识别）
      const isManualActive = project.name === currentProject || project.dirName === currentProject;
      const isAutoActive = !currentProject && project.realPath === mostRecentProject;
      const isActive = isManualActive || isAutoActive;

      const prefix = isActive ? chalk.green('●') : chalk.gray('○');
      const name = isActive ? chalk.bold.green(project.name) : chalk.white(project.name);

      // 项目状态标记
      let statusBadge = '';
      if (!project.hasCache) {
        statusBadge = chalk.red('[无缓存]');
      } else if (isAutoActive) {
        statusBadge = chalk.yellow('[最近使用]');
      }

      const size = project.hasCache ? chalk.gray(`(${formatSize(project.size)})`) : chalk.gray('(无数据)');
      const sessions = project.hasCache ? chalk.gray(`${project.sessionCount} 个会话`) : '';
      const date = project.lastModified.getTime() > 0
        ? chalk.gray(project.lastModified.toLocaleDateString('zh-CN'))
        : chalk.gray('未知');

      console.log(`  ${prefix} ${name} ${statusBadge} ${size}${sessions ? ' · ' + sessions : ''}`);
      console.log(`    ${chalk.gray('路径:')} ${chalk.cyan(project.realPath || project.dirName)}`);
      if (project.lastModified.getTime() > 0) {
        console.log(`    ${chalk.gray('最后修改:')} ${date}`);
      }
      console.log();
    });

    if (currentProject) {
      console.log(chalk.gray(`当前活跃项目: ${chalk.green(currentProject)} (手动设置)\n`));
    } else if (mostRecentProject) {
      console.log(chalk.gray(`最近使用项目: ${chalk.yellow(mostRecentProject)} (自动识别)\n`));
    } else {
      console.log(chalk.yellow('未设置活跃项目，使用 claude-pm switch <项目名> 切换\n'));
    }

    if (noCacheCount > 0) {
      console.log(chalk.yellow(`⚠️  ${noCacheCount} 个项目无缓存（可能已删除）\n`));
    }
  } catch (error) {
    spinner.fail(chalk.red('读取项目列表失败'));
    console.error(chalk.red(`错误: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * 切换当前活跃项目
 * @param {string} projectName - 项目名称
 * @param {Object} options - 选项
 */
async function switchProject(projectName, options = {}) {
  const spinner = ora(`正在切换到项目 "${projectName}"...`).start();

  try {
    const projectInfo = getProjectInfo(projectName);

    if (!projectInfo) {
      spinner.fail(chalk.red(`项目 "${projectName}" 不存在`));
      console.log(chalk.yellow('\n使用 claude-pm list 查看可用项目\n'));
      process.exit(1);
    }

    setCurrentProject(projectInfo.name);
    spinner.succeed(chalk.green(`已切换到项目: ${chalk.bold(projectInfo.name)}`));

    const targetPath = projectInfo.realPath || projectInfo.dirName;

    console.log(chalk.gray(`\n真实路径: ${chalk.cyan(targetPath)}`));
    console.log(chalk.gray(`缓存目录: ${projectInfo.path}`));
    console.log(chalk.gray(`项目大小: ${formatSize(projectInfo.size)}`));
    console.log(chalk.gray(`会话数量: ${projectInfo.sessionCount} 个\n`));

    // 输出切换目录命令
    console.log(chalk.bold.yellow('💡 切换到项目目录，请执行：'));
    console.log(chalk.bold.cyan(`   cd "${targetPath}"\n`));
  } catch (error) {
    spinner.fail(chalk.red('切换项目失败'));
    console.error(chalk.red(`错误: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * 显示当前活跃项目
 */
async function showCurrentProject() {
  const currentProject = getCurrentProject();

  if (!currentProject) {
    console.log(chalk.yellow('\n⚠️  未设置活跃项目\n'));
    console.log(chalk.gray('使用 claude-pm switch <项目名> 切换项目\n'));
    return;
  }

  const spinner = ora('正在获取项目信息...').start();

  try {
    const projectInfo = getProjectInfo(currentProject);

    if (!projectInfo) {
      spinner.warn(chalk.yellow(`当前项目 "${currentProject}" 已不存在`));
      setCurrentProject(null);
      console.log(chalk.gray('\n已清除活跃项目设置\n'));
      return;
    }

    spinner.stop();

    console.log(chalk.bold.cyan('\n📌 当前活跃项目:\n'));
    console.log(`  ${chalk.bold.green(projectInfo.name)}`);
    console.log(`  ${chalk.gray('真实路径:')} ${chalk.cyan(projectInfo.realPath || projectInfo.dirName)}`);
    console.log(`  ${chalk.gray('缓存目录:')} ${projectInfo.path}`);
    console.log(`  ${chalk.gray('项目大小:')} ${formatSize(projectInfo.size)}`);
    console.log(`  ${chalk.gray('会话数量:')} ${projectInfo.sessionCount} 个`);
    console.log(`  ${chalk.gray('最后修改:')} ${projectInfo.lastModified.toLocaleString('zh-CN')}\n`);
  } catch (error) {
    spinner.fail(chalk.red('获取项目信息失败'));
    console.error(chalk.red(`错误: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * 清理无缓存的项目
 * @param {Object} options - 选项
 */
async function cleanProjects(options = {}) {
  const spinner = ora('正在扫描无效项目...').start();

  try {
    const fs = require('fs');
    const path = require('path');
    const { getClaudeConfigPath, getClaudeCachePath } = require('./config');

    const projects = getLocalProjects();
    const claudeProjects = getClaudeProjects();
    const cachePath = getClaudeCachePath();

    // 1. 找出配置文件中存在但无缓存的项目
    const noCacheProjects = projects.filter(p => !p.hasCache && claudeProjects[p.realPath]);

    // 2. 找出缓存目录中存在但配置文件中没有的孤儿目录，以及空目录
    const orphanDirs = [];
    const matchedConfigPaths = new Set(); // 记录已被缓存目录匹配的配置路径

    if (fs.existsSync(cachePath)) {
      const items = fs.readdirSync(cachePath, { withFileTypes: true });
      const cacheDirs = items.filter(item => item.isDirectory());

      for (const dir of cacheDirs) {
        const projectDir = path.join(cachePath, dir.name);
        const files = fs.readdirSync(projectDir);
        const hasJsonl = files.some(f => f.endsWith('.jsonl'));
        const isEmpty = files.length === 0;

        const realPath = getRealPathFromJsonl(projectDir);

        // 如果能从 JSONL 中读取到真实路径
        if (realPath) {
          matchedConfigPaths.add(realPath);

          // 检查这个路径是否在配置文件中
          if (!claudeProjects[realPath]) {
            // 有内容但不在配置中 → 孤儿目录
            orphanDirs.push({
              dirName: dir.name,
              path: projectDir,
              realPath: realPath,
              reason: '不在配置文件中'
            });
          }
        } else {
          // 无法从 JSONL 读取真实路径（空目录或损坏的文件）
          const { convertDirNameToPath, convertPathToDirName } = require('./projectManager');
          const convertedPath = convertDirNameToPath(dir.name);

          // 检查转换后的路径是否在配置文件中
          let matchedConfigPath = null;
          if (claudeProjects[convertedPath]) {
            matchedConfigPath = convertedPath;
          } else {
            // 尝试反向匹配
            for (const configPath of Object.keys(claudeProjects)) {
              if (convertPathToDirName(configPath) === dir.name) {
                matchedConfigPath = configPath;
                break;
              }
            }
          }

          if (matchedConfigPath) {
            matchedConfigPaths.add(matchedConfigPath);
          }

          // 空目录或无效目录，直接标记为孤儿（无论是否在配置中）
          if (isEmpty || !hasJsonl) {
            orphanDirs.push({
              dirName: dir.name,
              path: projectDir,
              realPath: matchedConfigPath || (convertedPath + ' (推测)'),
              reason: isEmpty ? '空目录' : '无有效会话文件'
            });
          } else if (!matchedConfigPath) {
            // 有文件但无法匹配到配置 → 孤儿目录
            orphanDirs.push({
              dirName: dir.name,
              path: projectDir,
              realPath: convertedPath + ' (推测)',
              reason: '无法匹配到配置'
            });
          }
        }
      }
    }

    spinner.stop();

    const totalIssues = noCacheProjects.length + orphanDirs.length;

    if (totalIssues === 0) {
      console.log(chalk.green('\n✅ 没有需要清理的项目\n'));
      return;
    }

    console.log(chalk.bold.yellow(`\n🗑️  发现 ${totalIssues} 个需要清理的项目:\n`));

    if (noCacheProjects.length > 0) {
      console.log(chalk.bold('【配置文件中存在但无缓存的项目】'));
      noCacheProjects.forEach((project, index) => {
        console.log(`  ${index + 1}. ${chalk.cyan(project.displayName)}`);
      });
      console.log();
    }

    if (orphanDirs.length > 0) {
      console.log(chalk.bold('【需要清理的缓存目录】'));
      orphanDirs.forEach((dir, index) => {
        console.log(`  ${index + 1}. ${chalk.cyan(dir.dirName)} ${chalk.yellow(`[${dir.reason}]`)}`);
        console.log(`     ${chalk.gray('路径:')} ${dir.realPath}`);
      });
      console.log();
    }

    if (options.dryRun) {
      console.log(chalk.yellow('[预览模式] 以上项目将被清理'));
      console.log(chalk.gray('使用 claude-pm clean 执行实际删除\n'));
      return;
    }

    // 确认删除
    const inquirer = require('inquirer');
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确认要清理这 ${totalIssues} 个项目吗？`,
        default: false,
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\n❌ 已取消清理\n'));
      return;
    }

    // 读取配置文件
    const configPath = getClaudeConfigPath();
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    const deletedConfigPaths = [];
    const deletedCacheDirs = [];

    // 删除配置文件中无缓存的项目
    noCacheProjects.forEach(project => {
      if (config.projects && config.projects[project.realPath]) {
        delete config.projects[project.realPath];
        deletedConfigPaths.push(project.realPath);

        // 尝试删除对应的缓存目录
        try {
          if (fs.existsSync(project.path)) {
            const files = fs.readdirSync(project.path);
            if (files.length === 0) {
              fs.rmdirSync(project.path);
              deletedCacheDirs.push(project.path);
            } else {
              const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
              jsonlFiles.forEach(file => {
                const filePath = path.join(project.path, file);
                fs.unlinkSync(filePath);
              });
              deletedCacheDirs.push(`${project.path} (已清理 .jsonl 文件)`);
            }
          }
        } catch (error) {
          console.log(chalk.yellow(`警告: 无法清理缓存目录 ${project.path}: ${error.message}`));
        }
      }
    });

    // 删除孤儿缓存目录
    orphanDirs.forEach(dir => {
      try {
        // 如果这个孤儿目录对应的配置路径存在，也删除配置
        if (dir.realPath && claudeProjects[dir.realPath] && !deletedConfigPaths.includes(dir.realPath)) {
          delete config.projects[dir.realPath];
          deletedConfigPaths.push(dir.realPath);
        }

        // 递归删除整个目录
        const rmDir = (dirPath) => {
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            files.forEach(file => {
              const filePath = path.join(dirPath, file);
              if (fs.statSync(filePath).isDirectory()) {
                rmDir(filePath);
              } else {
                fs.unlinkSync(filePath);
              }
            });
            fs.rmdirSync(dirPath);
          }
        };

        rmDir(dir.path);
        deletedCacheDirs.push(`${dir.path} [${dir.reason}]`);
      } catch (error) {
        console.log(chalk.yellow(`警告: 无法删除目录 ${dir.path}: ${error.message}`));
      }
    });

    // 备份原配置到 ~/.claude/backup 目录
    const os = require('os');
    const backupDir = path.join(os.homedir(), '.claude', 'backup');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(backupDir, `claude.json.backup.${timestamp}`);
    fs.writeFileSync(backupPath, configContent, 'utf-8');
    console.log(chalk.gray(`\n📋 已备份到: ${backupPath}`));

    // 写入新配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    console.log(chalk.green(`\n✅ 清理完成\n`));

    if (deletedConfigPaths.length > 0) {
      console.log(chalk.yellow('📋 已从配置中删除的项目:'));
      deletedConfigPaths.forEach(p => {
        console.log(chalk.gray(`  - ${p}`));
      });
      console.log();
    }

    if (deletedCacheDirs.length > 0) {
      console.log(chalk.yellow('🗂️  已清理的缓存目录:'));
      deletedCacheDirs.forEach(dir => {
        console.log(chalk.gray(`  - ${dir}`));
      });
      console.log();
    }

  } catch (error) {
    spinner.fail(chalk.red('清理失败'));
    console.error(chalk.red(`错误: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * 管理单个项目的会话
 * @param {string} projectName - 项目名称
 * @param {Object} options - 选项
 */
async function manageSingleProjectSessions(projectName, options = {}) {
  const spinner = ora('正在加载会话列表...').start();

  try {
    // 确定要操作的项目
    let targetProject = null;

    if (projectName) {
      targetProject = getProjectInfo(projectName);
      if (!targetProject) {
        spinner.fail(chalk.red(`项目 "${projectName}" 不存在`));
        console.log(chalk.yellow('\n使用 claude-pm list 查看可用项目\n'));
        process.exit(1);
      }
    } else {
      // 使用当前活跃项目或最近使用项目
      const currentProject = getCurrentProject();
      const mostRecentProject = getMostRecentProject();
      const targetName = currentProject || mostRecentProject;

      if (!targetName) {
        spinner.fail(chalk.red('未找到活跃项目'));
        console.log(chalk.yellow('\n请先使用 claude-pm switch <项目名> 设置活跃项目\n'));
        console.log(chalk.gray('或使用 claude-pm session <项目名> 指定项目\n'));
        process.exit(1);
      }

      targetProject = getProjectInfo(targetName);
    }

    if (!targetProject.hasCache) {
      spinner.fail(chalk.red('该项目无缓存数据'));
      process.exit(1);
    }

    // 读取会话列表
    const fs = require('fs');
    const path = require('path');
    const sessions = [];

    const files = fs.readdirSync(targetProject.path);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    for (const file of jsonlFiles) {
      const filePath = path.join(targetProject.path, file);
      const stats = fs.statSync(filePath);
      const sizeKB = stats.size / 1024;

      sessions.push({
        id: file.replace('.jsonl', ''),
        fileName: file,
        filePath: filePath,
        size: stats.size,
        sizeKB: sizeKB,
        modified: stats.mtime,
      });
    }

    spinner.stop();

    if (sessions.length === 0) {
      console.log(chalk.yellow('\n⚠️  该项目没有会话记录\n'));
      return;
    }

    // 排序：按修改时间倒序
    sessions.sort((a, b) => b.modified - a.modified);

    console.log(chalk.bold.cyan(`\n📝 项目 ${chalk.green(targetProject.name)} 的会话列表:\n`));

    // 准备选择项
    const sizeThreshold = parseFloat(options.size);
    const choices = sessions.map((session, index) => {
      const date = session.modified.toLocaleString('zh-CN');
      const size = session.sizeKB < 1
        ? `${session.size} B`
        : `${session.sizeKB.toFixed(2)} KB`;
      const isSmall = session.sizeKB < sizeThreshold;

      return {
        name: `${chalk.gray(`${index + 1}.`)} ${chalk.cyan(session.id.slice(0, 8))}... - ${size} - ${date}${isSmall ? chalk.yellow(' [小文件]') : ''}`,
        value: session.filePath,
        checked: isSmall, // 默认选中小于阈值的会话
      };
    });

    // 交互式选择
    const inquirer = require('inquirer');
    const { selectedSessions } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedSessions',
        message: `选择要删除的会话 (默认已选中 ${sizeThreshold}KB 以下的会话):`,
        choices: choices,
        pageSize: 15,
      }
    ]);

    if (selectedSessions.length === 0) {
      console.log(chalk.yellow('\n❌ 未选择任何会话\n'));
      return;
    }

    // 确认删除
    const totalSize = selectedSessions.reduce((sum, filePath) => {
      const session = sessions.find(s => s.filePath === filePath);
      return sum + session.size;
    }, 0);

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确认删除 ${selectedSessions.length} 个会话（共 ${formatSize(totalSize)}）？`,
        default: false,
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\n❌ 已取消删除\n'));
      return;
    }

    // 删除会话
    let deletedCount = 0;
    for (const filePath of selectedSessions) {
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
      } catch (error) {
        console.log(chalk.red(`删除失败: ${path.basename(filePath)} - ${error.message}`));
      }
    }

    console.log(chalk.green(`\n✅ 已删除 ${deletedCount} 个会话\n`));

  } catch (error) {
    spinner.fail(chalk.red('操作失败'));
    console.error(chalk.red(`错误: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * 清理项目历史记录（基于 history 大小）
 */
async function historyClean() {
  const spinner = ora('正在扫描项目历史记录...').start();

  try {
    const claudeProjects = getClaudeProjects();
    const largeHistoryProjects = [];

    // 筛选 history 大于 30 的项目
    for (const [projectPath, config] of Object.entries(claudeProjects)) {
      if (config.history && config.history.length > 30) {
        const projectInfo = getProjectInfo(projectPath) || {
          name: projectPath.split(/[/\\]/).pop() || 'Unknown',
          realPath: projectPath
        };

        largeHistoryProjects.push({
          ...projectInfo,
          historySize: config.history.length,
          config: config
        });
      }
    }

    spinner.stop();

    if (largeHistoryProjects.length === 0) {
      console.log(chalk.green('\n✅ 所有项目的历史记录都在合理范围内（≤30条）\n'));
      return;
    }

    console.log(chalk.bold.yellow(`\n📋 发现 ${largeHistoryProjects.length} 个项目历史记录过多 (>30条):\n`));

    // 显示筛选出的项目
    largeHistoryProjects.forEach((project, index) => {
      console.log(`  ${index + 1}. ${chalk.cyan(project.name)} - ${chalk.red(project.historySize)} 条历史记录`);
      console.log(`     ${chalk.gray('路径:')} ${project.realPath}`);
      console.log();
    });

    // 准备选择项
    const inquirer = require('inquirer');
    const choices = largeHistoryProjects.map((project, index) => ({
      name: `${chalk.gray(`${index + 1}.`)} ${chalk.cyan(project.name)} - ${chalk.red(project.historySize)} 条历史记录 - ${chalk.gray(project.realPath)}`,
      value: project,
      checked: true, // 默认选中所有项目
    }));

    // 交互式选择
    const { selectedProjects } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedProjects',
        message: '选择要清理历史记录的项目 (将只保留最近25条):',
        choices: choices,
        pageSize: 15,
      }
    ]);

    if (selectedProjects.length === 0) {
      console.log(chalk.yellow('\n❌ 未选择任何项目\n'));
      return;
    }

    // 确认清理
    const totalHistorySize = selectedProjects.reduce((sum, project) => sum + project.historySize, 0);
    const { confirmClean } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmClean',
        message: `确认要清理 ${selectedProjects.length} 个项目的历史记录吗？（共 ${totalHistorySize} 条，将保留最近25条/项目）`,
        default: false,
      }
    ]);

    if (!confirmClean) {
      console.log(chalk.yellow('\n❌ 已取消清理\n'));
      return;
    }

    // 执行清理
    const finalSpinner = ora('正在清理历史记录...').start();
    let totalCleaned = 0;

    for (const project of selectedProjects) {
      const originalHistory = project.config.history || [];

      // 去重：保留最新的不重复的25条记录
      const seenDisplays = new Set();
      const uniqueHistory = [];

      for (const item of originalHistory) {
        const display = item.display?.trim();

        // 过滤无效记录
        if (!display || display.length < 2) continue;

        // 去重：只保留第一次出现的（最新的）
        if (!seenDisplays.has(display) && uniqueHistory.length < 25) {
          seenDisplays.add(display);
          uniqueHistory.push(item);
        }

        if (uniqueHistory.length >= 25) break;
      }

      const cleanedHistory = uniqueHistory;
      const cleanedCount = originalHistory.length - cleanedHistory.length;
      const duplicateCount = originalHistory.length - uniqueHistory.length - (originalHistory.length > 25 ? originalHistory.length - 25 : 0);

      if (cleanedCount > 0) {
        updateProjectHistory(project.realPath, cleanedHistory);
        totalCleaned += cleanedCount;
        const duplicateInfo = duplicateCount > 0 ? `, 去重 ${duplicateCount} 条` : '';
        console.log(`✓ ${project.name}: ${chalk.red(originalHistory.length)} → ${chalk.green(cleanedHistory.length)} 条 (清理 ${cleanedCount} 条${duplicateInfo})`);
      }
    }

    finalSpinner.succeed(chalk.green('历史记录清理完成'));
    console.log(`\n🎉 总共清理了 ${totalCleaned} 条历史记录\n`);

  } catch (error) {
    spinner.fail(chalk.red('清理历史记录失败'));
    console.error(chalk.red(`错误: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * 管理多个项目的会话（支持多选）
 * @param {Object} options - 选项
 */
async function manageSessionsCommand(options = {}) {
  const spinner = ora('正在读取项目列表...').start();

  try {
    const projects = getLocalProjects();
    const projectsWithCache = projects.filter(p => p.hasCache && p.sessionCount > 0);

    spinner.stop();

    if (projectsWithCache.length === 0) {
      console.log(chalk.yellow('\n⚠️  没有包含会话的项目\n'));
      return;
    }

    // 准备选择项
    const inquirer = require('inquirer');
    const choices = projectsWithCache.map((project, index) => ({
      name: `${chalk.cyan(project.name)} - ${chalk.gray(project.sessionCount + ' 个会话')} - ${chalk.gray(formatSize(project.size))}`,
      value: project,
      checked: false,
    }));

    // 交互式选择项目
    const { selectedProjects } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedProjects',
        message: '选择要查看会话的项目（可多选）:',
        choices: choices,
        pageSize: 15,
      }
    ]);

    if (selectedProjects.length === 0) {
      console.log(chalk.yellow('\n❌ 未选择任何项目\n'));
      return;
    }

    console.log(chalk.bold.cyan(`\n📊 已选择 ${selectedProjects.length} 个项目\n`));

    // 收集所有选中项目的会话
    const fs = require('fs');
    const path = require('path');
    const sizeThreshold = parseFloat(options.size) || 10; // 默认 10KB

    const allSessions = [];
    const projectSessionMap = new Map(); // 用于记录每个会话属于哪个项目

    for (const project of selectedProjects) {
      // 读取会话列表
      const sessions = [];
      const files = fs.readdirSync(project.path);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      for (const file of jsonlFiles) {
        const filePath = path.join(project.path, file);
        const stats = fs.statSync(filePath);
        const sizeKB = stats.size / 1024;

        const session = {
          id: file.replace('.jsonl', ''),
          fileName: file,
          filePath: filePath,
          size: stats.size,
          sizeKB: sizeKB,
          modified: stats.mtime,
          projectName: project.name,
          projectPath: project.realPath,
        };

        sessions.push(session);
        projectSessionMap.set(filePath, project);
      }

      // 排序：按修改时间倒序
      sessions.sort((a, b) => b.modified - a.modified);

      allSessions.push(...sessions);
    }

    if (allSessions.length === 0) {
      console.log(chalk.yellow('\n⚠️  所选项目没有会话记录\n'));
      return;
    }

    // 按项目分组显示统计信息
    console.log(chalk.bold.cyan('📋 会话统计:\n'));
    for (const project of selectedProjects) {
      const projectSessions = allSessions.filter(s => s.projectName === project.name);
      const cleanableSessions = projectSessions.filter(s => s.sizeKB < sizeThreshold);
      const totalSize = projectSessions.reduce((sum, s) => sum + s.size, 0);

      console.log(chalk.green(`📁 ${project.name}`));
      console.log(chalk.gray(`   总会话: ${projectSessions.length} 个 (${formatSize(totalSize)})`));

      if (cleanableSessions.length > 0) {
        const cleanableSize = cleanableSessions.reduce((sum, s) => sum + s.size, 0);
        console.log(chalk.yellow(`   可清理: ${cleanableSessions.length} 个 (${formatSize(cleanableSize)}) [<${sizeThreshold}KB]`));
      } else {
        console.log(chalk.gray(`   可清理: 0 个 [<${sizeThreshold}KB]`));
      }
      console.log();
    }

    // 准备会话选择项（按项目分组显示）
    const sessionChoices = [];
    for (const project of selectedProjects) {
      const projectSessions = allSessions.filter(s => s.projectName === project.name);

      if (projectSessions.length > 0) {
        // 添加项目分隔符
        sessionChoices.push(new inquirer.Separator(chalk.bold.cyan(`\n━━━ ${project.name} ━━━`)));

        // 添加该项目的所有会话
        projectSessions.forEach((session) => {
          const date = session.modified.toLocaleString('zh-CN');
          const size = session.sizeKB < 1
            ? `${session.size} B`
            : `${session.sizeKB.toFixed(2)} KB`;
          const isSmall = session.sizeKB < sizeThreshold;

          sessionChoices.push({
            name: `${chalk.gray(session.id.slice(0, 12))}... - ${size} - ${date}${isSmall ? chalk.yellow(' [小文件]') : ''}`,
            value: session.filePath,
            checked: isSmall, // 默认选中小于阈值的会话
          });
        });
      }
    }

    // 交互式选择要删除的会话
    const { selectedSessions } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedSessions',
        message: `选择要删除的会话 (默认已选中 <${sizeThreshold}KB 的会话):`,
        choices: sessionChoices,
        pageSize: 20,
      }
    ]);

    if (selectedSessions.length === 0) {
      console.log(chalk.yellow('\n❌ 未选择任何会话\n'));
      return;
    }

    // 统计要删除的会话
    const sessionsToDelete = allSessions.filter(s => selectedSessions.includes(s.filePath));
    const totalSize = sessionsToDelete.reduce((sum, s) => sum + s.size, 0);

    // 按项目分组统计
    const deleteByProject = new Map();
    for (const session of sessionsToDelete) {
      if (!deleteByProject.has(session.projectName)) {
        deleteByProject.set(session.projectName, []);
      }
      deleteByProject.get(session.projectName).push(session);
    }

    console.log(chalk.bold.yellow(`\n📊 删除预览:\n`));
    for (const [projectName, sessions] of deleteByProject.entries()) {
      const projectSize = sessions.reduce((sum, s) => sum + s.size, 0);
      console.log(chalk.cyan(`📁 ${projectName}: ${sessions.length} 个会话 (${formatSize(projectSize)})`));
    }
    console.log(chalk.bold(`\n总计: ${sessionsToDelete.length} 个会话 (${formatSize(totalSize)})\n`));

    // 确认删除
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确认删除这 ${sessionsToDelete.length} 个会话吗？`,
        default: false,
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\n❌ 已取消删除\n'));
      return;
    }

    // 执行删除
    let deletedCount = 0;
    const deleteErrors = [];

    for (const filePath of selectedSessions) {
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
      } catch (error) {
        deleteErrors.push({
          file: path.basename(filePath),
          error: error.message
        });
      }
    }

    console.log(chalk.green(`\n✅ 已删除 ${deletedCount} 个会话`));

    if (deleteErrors.length > 0) {
      console.log(chalk.red(`\n⚠️  ${deleteErrors.length} 个会话删除失败:`));
      deleteErrors.forEach(({ file, error }) => {
        console.log(chalk.gray(`  - ${file}: ${error}`));
      });
    }

    // 按项目显示删除结果
    console.log(chalk.bold.cyan('\n📊 删除结果:\n'));
    for (const [projectName, sessions] of deleteByProject.entries()) {
      const deletedInProject = sessions.filter(s => !deleteErrors.some(e => e.file === s.fileName)).length;
      const projectSize = sessions.filter(s => !deleteErrors.some(e => e.file === s.fileName)).reduce((sum, s) => sum + s.size, 0);
      console.log(chalk.green(`📁 ${projectName}: 已删除 ${deletedInProject} 个会话 (${formatSize(projectSize)})`));
    }
    console.log();

  } catch (error) {
    spinner.fail(chalk.red('操作失败'));
    console.error(chalk.red(`错误: ${error.message}\n`));
    process.exit(1);
  }
}

module.exports = {
  listProjects,
  switchProject,
  showCurrentProject,
  cleanProjects,
  manageSessionsCommand,
  manageSingleProjectSessions,
  historyClean,
};
