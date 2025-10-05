const chalk = require('chalk');
const ora = require('ora');
const { getLocalProjects, getProjectInfo, formatSize, getMostRecentProject } = require('./projectManager');
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
  const spinner = ora('正在扫描无缓存项目...').start();

  try {
    const projects = getLocalProjects();
    const noCacheProjects = projects.filter(p => !p.hasCache);

    spinner.stop();

    if (noCacheProjects.length === 0) {
      console.log(chalk.green('\n✅ 没有需要清理的项目\n'));
      return;
    }

    console.log(chalk.bold.yellow(`\n🗑️  发现 ${noCacheProjects.length} 个无缓存项目:\n`));

    noCacheProjects.forEach((project, index) => {
      console.log(`  ${index + 1}. ${chalk.cyan(project.displayName)}`);
    });

    if (options.dryRun) {
      console.log(chalk.yellow('\n[预览模式] 以上项目将被从 .claude.json 中删除'));
      console.log(chalk.gray('使用 claude-pm clean 执行实际删除\n'));
      return;
    }

    // 确认删除
    const inquirer = require('inquirer');
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确认要从 .claude.json 中删除这 ${noCacheProjects.length} 个项目吗？`,
        default: false,
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\n❌ 已取消清理\n'));
      return;
    }

    // 读取配置文件
    const fs = require('fs');
    const configPath = require('./config').getClaudeConfigPath();
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // 删除无缓存的项目
    const deletedPaths = [];
    noCacheProjects.forEach(project => {
      if (config.projects && config.projects[project.realPath]) {
        delete config.projects[project.realPath];
        deletedPaths.push(project.realPath);
      }
    });

    // 备份原配置到 ~/.claude/backup 目录
    const path = require('path');
    const os = require('os');
    const backupDir = path.join(os.homedir(), '.claude', 'backup');

    // 确保备份目录存在
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(backupDir, `claude.json.backup.${timestamp}`);
    fs.writeFileSync(backupPath, configContent, 'utf-8');
    console.log(chalk.gray(`\n📋 已备份到: ${backupPath}`));

    // 写入新配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    console.log(chalk.green(`\n✅ 已清理 ${deletedPaths.length} 个项目\n`));

    deletedPaths.forEach(path => {
      console.log(chalk.gray(`  - ${path}`));
    });

    console.log();
  } catch (error) {
    spinner.fail(chalk.red('清理失败'));
    console.error(chalk.red(`错误: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * 管理项目会话
 * @param {string} projectName - 项目名称（可选）
 * @param {Object} options - 选项
 */
async function manageSessionsCommand(projectName, options = {}) {
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
        console.log(chalk.gray('或使用 claude-pm sessions <项目名> 指定项目\n'));
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

module.exports = {
  listProjects,
  switchProject,
  showCurrentProject,
  cleanProjects,
  manageSessionsCommand,
};
