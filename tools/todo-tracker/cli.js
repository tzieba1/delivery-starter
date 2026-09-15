#!/usr/bin/env node

/**
 * TODO Tracker CLI
 *
 * Simple wrapper around sync.js with common shortcuts
 *
 * Usage:
 *   todo-tracker [command] [options]
 *
 * Commands:
 *   sync [--todo|--fixme]  Sync comments to markdown
 *   list                   Quick list of all TODOs
 *   help                   Show this help
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const SYNC_SCRIPT = path.join(__dirname, 'sync.js');

const args = process.argv.slice(2);
const command = args[0] || 'sync';

function showHelp() {
  console.log(`
TODO Tracker - Smart TODO/FIXME tracking for monorepos

Usage:
  npx todo-tracker [command] [options]
  node tools/todo-tracker/cli.js [command] [options]

Commands:
  sync              Sync TODO comments (default)
  sync --fixme      Sync FIXME comments
  sync --all        Sync both TODO and FIXME
  list              Quick list without syncing
  help              Show this help

Options:
  --service <name>  Only scan specific service
  --dry-run         Preview without writing files
  --verbose         Show detailed output
  --config <path>   Custom config file path

Examples:
  todo-tracker                    # Sync TODOs
  todo-tracker sync --fixme       # Sync FIXMEs
  todo-tracker sync --all         # Sync both
  todo-tracker --service backend  # Only backend service

Configuration:
  Create .todorc.json in your project root.
  See tools/todo-tracker/README.md for details.
`);
}

function runSync(extraArgs = []) {
  const syncArgs = [...args.slice(1), ...extraArgs];
  const result = spawn('node', [SYNC_SCRIPT, ...syncArgs], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  result.on('close', code => process.exit(code));
}

function quickList() {
  // Just run sync with dry-run to show items
  runSync(['--dry-run']);
}

switch (command) {
  case 'sync':
    if (args.includes('--all')) {
      // Run both TODO and FIXME
      console.log('Syncing TODOs...');
      execSync(`node ${SYNC_SCRIPT} --todo ${args.slice(1).filter(a => a !== '--all').join(' ')}`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('\nSyncing FIXMEs...');
      execSync(`node ${SYNC_SCRIPT} --fixme ${args.slice(1).filter(a => a !== '--all').join(' ')}`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } else {
      runSync();
    }
    break;

  case 'list':
    quickList();
    break;

  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;

  default:
    // Assume it's an option, run sync
    runSync([command, ...args.slice(1)]);
}
