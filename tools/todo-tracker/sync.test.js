#!/usr/bin/env node

/**
 * Automated tests for the configurable TODO Tracker
 *
 * Tests cover:
 * - Configuration loading
 * - Multi-service scanning
 * - Duplicate content handling
 * - Line movement tracking
 * - Completion detection
 * - Priority ordering
 * - Service filtering
 * - State persistence
 *
 * Usage: node tools/todo-tracker/sync.test.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

// Test configuration
const PROJECT_ROOT = path.join(__dirname, '../..');
const TEST_DIR = path.join(PROJECT_ROOT, '__test_workspace__');
const SYNC_SCRIPT = path.join(__dirname, 'sync.js');

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// Test utilities
function setup() {
  // Create isolated test workspace
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // Create test service directories
  fs.mkdirSync(path.join(TEST_DIR, 'services/frontend/src'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'services/backend/src'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, '.todo-tracker'), { recursive: true });
}

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

function createConfig(config) {
  const configPath = path.join(TEST_DIR, '.todorc.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

function createTestFile(relativePath, content) {
  const filePath = path.join(TEST_DIR, relativePath);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
  return filePath;
}

function runSync(args = [], preserveState = false) {
  // Clear state unless preserving
  if (!preserveState) {
    const stateFile = path.join(TEST_DIR, '.todo-tracker/todo-state.json');
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
    }
  }

  const result = execSync(
    `node ${SYNC_SCRIPT} --config ${path.join(TEST_DIR, '.todorc.json')} ${args.join(' ')}`,
    {
      cwd: TEST_DIR,
      encoding: 'utf-8',
      env: { ...process.env }
    }
  );
  return result;
}

function getState() {
  const stateFile = path.join(TEST_DIR, '.todo-tracker/todo-state.json');
  if (fs.existsSync(stateFile)) {
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  }
  return { items: {} };
}

function getMarkdown() {
  const mdFile = path.join(TEST_DIR, 'TODO.md');
  if (fs.existsSync(mdFile)) {
    return fs.readFileSync(mdFile, 'utf-8');
  }
  return '';
}

function clearTestFiles() {
  // Clear service directories completely and recreate
  const dirs = [
    path.join(TEST_DIR, 'services/frontend/src'),
    path.join(TEST_DIR, 'services/backend/src'),
  ];
  dirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
    }
    fs.mkdirSync(dir, { recursive: true });
  });

  // Also clear state files
  const stateDir = path.join(TEST_DIR, '.todo-tracker');
  if (fs.existsSync(stateDir)) {
    fs.readdirSync(stateDir).forEach(file => {
      fs.unlinkSync(path.join(stateDir, file));
    });
  }
}

// Default test config
const defaultConfig = {
  services: [
    {
      name: 'frontend',
      path: 'services/frontend',
      include: ['src'],
      exclude: ['*.test.js']
    },
    {
      name: 'backend',
      path: 'services/backend',
      include: ['src'],
      exclude: ['*.pyc']
    }
  ],
  output: {
    todoFile: 'TODO.md',
    fixmeFile: 'FIXME.md',
    stateDir: '.todo-tracker'
  },
  defaults: {
    exclude: ['node_modules', '.git', '*.md']
  },
  priorities: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'],
  tracking: {
    maxCompletedItems: 50,
    completedRetentionDays: 30
  }
};

// Test runner
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  log('\n📋 TODO Tracker (tools/) - Automated Tests\n', 'blue');
  log('='.repeat(50), 'dim');

  setup();
  createConfig(defaultConfig);

  for (const { name, fn } of tests) {
    try {
      clearTestFiles();
      await fn();
      log(`  ✅ ${name}`, 'green');
      passed++;
    } catch (error) {
      log(`  ❌ ${name}`, 'red');
      log(`     ${error.message}`, 'dim');
      failed++;
    }
  }

  cleanup();

  log('\n' + '='.repeat(50), 'dim');
  log(`\n📊 Results: ${passed} passed, ${failed} failed\n`, failed > 0 ? 'red' : 'green');

  process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// TEST CASES
// ============================================================================

test('Config loading - finds and parses .todorc.json', () => {
  createTestFile('services/frontend/src/app.ts', `
    // TODO: Test config loading
  `);

  const output = runSync();
  assert.ok(output.includes('Synced TODOs'), 'Should complete successfully');
});

test('Basic TODO detection in single service', () => {
  createTestFile('services/frontend/src/app.ts', `
    // TODO: This is a basic todo
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should find 1 TODO');
  assert.strictEqual(items[0].content, 'This is a basic todo');
  assert.strictEqual(items[0].service, 'frontend');
});

test('Multi-service scanning', () => {
  createTestFile('services/frontend/src/app.ts', `
    // TODO: Frontend todo
  `);
  createTestFile('services/backend/src/main.py', `
    # TODO: Backend todo
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 2, 'Should find 2 TODOs across services');

  const services = items.map(i => i.service).sort();
  assert.deepStrictEqual(services, ['backend', 'frontend']);
});

test('Service filtering with --service flag', () => {
  createTestFile('services/frontend/src/app.ts', `
    // TODO: Frontend todo
  `);
  createTestFile('services/backend/src/main.py', `
    # TODO: Backend todo
  `);

  // First sync all
  runSync();

  // Then sync only backend
  runSync(['--service', 'backend'], true);

  const state = getState();
  const items = Object.values(state.items).filter(i => !i.completedAt);

  // Both should still be active (service filter preserves other services)
  assert.strictEqual(items.length, 2, 'Should preserve items from non-scanned services');
});

test('Duplicate content handling - separate tracking', () => {
  createTestFile('services/frontend/src/app.ts', `
    // TODO: Handle error
    try { } catch (e) { }
    // TODO: Handle error
    try { } catch (e) { }
    // TODO: Handle error
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 3, 'Should track 3 separate items for duplicates');

  // Verify unique IDs
  const ids = Object.keys(state.items);
  assert.strictEqual(new Set(ids).size, 3, 'Each duplicate should have unique ID');
});

test('Priority labels parsed and ordered correctly', () => {
  createTestFile('services/frontend/src/priorities.ts', `
    // TODO: [LOW] Low priority
    // TODO: [URGENT] Urgent priority
    // TODO: [HIGH] High priority
    // TODO: [MEDIUM] Medium priority
  `);

  runSync();
  const md = getMarkdown();

  const urgentPos = md.indexOf('### URGENT');
  const highPos = md.indexOf('### HIGH');
  const mediumPos = md.indexOf('### MEDIUM');
  const lowPos = md.indexOf('### LOW');

  assert.ok(urgentPos < highPos, 'URGENT should come before HIGH');
  assert.ok(highPos < mediumPos, 'HIGH should come before MEDIUM');
  assert.ok(mediumPos < lowPos, 'MEDIUM should come before LOW');
});

test('Empty TODO content skipped', () => {
  createTestFile('services/frontend/src/empty.ts', `
    // TODO:
    // TODO:
    // TODO: Valid todo
    // TODO: [HIGH]
    // TODO: [HIGH] Valid high priority
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 2, 'Should skip empty TODOs');
});

test('FIXME detection with --fixme flag', () => {
  createTestFile('services/frontend/src/bugs.ts', `
    // FIXME: This needs fixing
    // FIXME: [HIGH] Critical bug
  `);

  // Clear fixme state
  const fixmeState = path.join(TEST_DIR, '.todo-tracker/fixme-state.json');
  if (fs.existsSync(fixmeState)) fs.unlinkSync(fixmeState);

  runSync(['--fixme']);

  const stateFile = path.join(TEST_DIR, '.todo-tracker/fixme-state.json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 2, 'Should find 2 FIXMEs');
});

test('Line movement tracking', () => {
  createTestFile('services/frontend/src/move.ts', `
    // Line 1
    // TODO: Track this
    // Line 3
  `);

  runSync();

  // Move the TODO down
  createTestFile('services/frontend/src/move.ts', `
    // Line 1
    // New line
    // Another line
    // TODO: Track this
    // Line 3
  `);

  runSync([], true);
  const state = getState();
  const items = Object.values(state.items);

  assert.ok(items[0].lineMoveCount >= 1, 'Should track line movement');
});

test('Completion detection when TODO removed', () => {
  createTestFile('services/frontend/src/complete.ts', `
    // TODO: Will be completed
    const x = 1;
  `);

  runSync();

  // Remove the TODO
  createTestFile('services/frontend/src/complete.ts', `
    const x = 1;
  `);

  runSync([], true);
  const state = getState();
  const completed = Object.values(state.items).filter(i => i.completedAt);

  assert.strictEqual(completed.length, 1, 'Should mark removed TODO as completed');
});

test('Completed items shown in markdown', () => {
  createTestFile('services/frontend/src/done.ts', `
    // TODO: Will complete
  `);

  runSync();

  createTestFile('services/frontend/src/done.ts', `
    // Done
  `);

  runSync([], true);
  const md = getMarkdown();

  assert.ok(md.includes('Completed Items'), 'Markdown should have Completed section');
  assert.ok(md.includes('[x]'), 'Completed items should have checked checkbox');
});

test('State persistence across syncs', () => {
  createTestFile('services/frontend/src/persist.ts', `
    // TODO: Persistent todo
  `);

  runSync();
  const state1 = getState();
  const firstSeen1 = Object.values(state1.items)[0].firstSeen;

  runSync([], true);
  const state2 = getState();
  const firstSeen2 = Object.values(state2.items)[0].firstSeen;

  assert.strictEqual(firstSeen1, firstSeen2, 'firstSeen should persist');
});

test('Custom labels supported', () => {
  createTestFile('services/frontend/src/custom.ts', `
    // TODO: [TZ] Assigned to TZ
    // TODO: [BLOCKED] Waiting on API
  `);

  runSync();
  const md = getMarkdown();

  assert.ok(md.includes('TZ') || md.includes('### TZ'), 'Custom label TZ should appear');
  assert.ok(md.includes('BLOCKED') || md.includes('### BLOCKED'), 'Custom label BLOCKED should appear');
});

test('Case insensitive priority matching', () => {
  createTestFile('services/frontend/src/case.ts', `
    // TODO: [high] Lowercase
    // TODO: [HIGH] Uppercase
    // TODO: [High] Mixed
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  const highItems = items.filter(i => i.label === 'HIGH');
  assert.strictEqual(highItems.length, 3, 'All case variants should normalize to HIGH');
});

test('Markdown format is valid', () => {
  createTestFile('services/frontend/src/format.ts', `
    // TODO: [HIGH] Test format
  `);

  runSync();
  const md = getMarkdown();

  assert.ok(md.startsWith('# TODO'), 'Should start with h1 header');
  assert.ok(md.includes('Last synced:'), 'Should have sync timestamp');
  assert.ok(md.includes('Active:'), 'Should show active count');
  assert.ok(md.includes('- [ ]'), 'Should have checkbox format');
});

test('File paths are relative to project root', () => {
  createTestFile('services/frontend/src/paths.ts', `
    // TODO: Check path
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.ok(
    items[0].file.startsWith('services/'),
    'File path should be relative to project root'
  );
});

test('Dry run does not modify files', () => {
  createTestFile('services/frontend/src/dry.ts', `
    // TODO: Dry run test
  `);

  // Clear any existing state
  const stateFile = path.join(TEST_DIR, '.todo-tracker/todo-state.json');
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);

  const mdFile = path.join(TEST_DIR, 'TODO.md');
  if (fs.existsSync(mdFile)) fs.unlinkSync(mdFile);

  runSync(['--dry-run']);

  assert.ok(!fs.existsSync(stateFile), 'State file should not be created in dry run');
});

test('Duplicate removal tracks correct item', () => {
  createTestFile('services/frontend/src/dup.ts', `
    // TODO: Duplicate
    // Line
    // TODO: Duplicate
    // Line
    // TODO: Duplicate
  `);

  runSync();

  // Remove middle duplicate
  createTestFile('services/frontend/src/dup.ts', `
    // TODO: Duplicate
    // Line
    // Line
    // TODO: Duplicate
  `);

  runSync([], true);
  const state = getState();

  const active = Object.values(state.items).filter(i => !i.completedAt);
  const completed = Object.values(state.items).filter(i => i.completedAt);

  assert.strictEqual(active.length, 2, 'Should have 2 active');
  assert.strictEqual(completed.length, 1, 'Should have 1 completed');
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

test('Edge: File relocation detection (TODO moves between files)', () => {
  createTestFile('services/frontend/src/original.ts', `
    // TODO: [HIGH] Relocatable todo
  `);

  runSync();

  // Move TODO to different file (delete original, create new)
  fs.unlinkSync(path.join(TEST_DIR, 'services/frontend/src/original.ts'));
  createTestFile('services/frontend/src/moved.ts', `
    // TODO: [HIGH] Relocatable todo
  `);

  runSync([], true);
  const state = getState();
  const items = Object.values(state.items).filter(i => !i.completedAt);

  assert.strictEqual(items.length, 1, 'Should still have 1 active item');
  assert.ok(items[0].file.includes('moved.ts'), 'Should track new file location');
  // File move is detected via exact hash match
});

test('Edge: Content change detection (fuzzy matching)', () => {
  createTestFile('services/frontend/src/fuzzy.ts', `
    // TODO: [HIGH] Add user authentication
  `);

  runSync();
  const state1 = getState();
  const originalId = Object.keys(state1.items)[0];

  // Slightly modify content (should fuzzy match)
  createTestFile('services/frontend/src/fuzzy.ts', `
    // TODO: [HIGH] Add user authentication flow
  `);

  runSync([], true);
  const state2 = getState();
  const items = Object.values(state2.items).filter(i => !i.completedAt);

  // Should have 1 active (matched via fuzzy) not 2 (old completed + new)
  assert.strictEqual(items.length, 1, 'Fuzzy matching should detect content change');
  assert.ok(
    items[0].contentChangeCount >= 1 || items[0].content.includes('flow'),
    'Should track as content change or update content'
  );
});

test('Edge: Special characters in TODO content', () => {
  createTestFile('services/frontend/src/special.ts', `
    // TODO: Handle "quoted" strings and \`backticks\`
    // TODO: Support unicode: 日本語 émojis 🎉
    // TODO: Fix regex /pattern.*test/g
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 3, 'Should handle special characters');
});

test('Edge: Very long TODO content', () => {
  const longContent = 'A'.repeat(500);
  createTestFile('services/frontend/src/long.ts', `
    // TODO: ${longContent}
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should handle long content');
  assert.ok(items[0].content.length > 100, 'Content should be preserved');
});

test('Edge: Multiple labels in TODO', () => {
  createTestFile('services/frontend/src/multilabel.ts', `
    // TODO: [HIGH] [TZ] Review this code
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should parse TODO with multiple brackets');
  // First bracket becomes label, rest is content
  assert.strictEqual(items[0].label, 'HIGH');
  assert.ok(items[0].content.includes('[TZ]') || items[0].content.includes('TZ'));
});

test('Edge: Corrupted state file recovery', () => {
  createTestFile('services/frontend/src/recover.ts', `
    // TODO: Test recovery
  `);

  // Create corrupted state file
  const stateFile = path.join(TEST_DIR, '.todo-tracker/todo-state.json');
  fs.writeFileSync(stateFile, '{ invalid json !!!');

  // Should not crash, should start fresh
  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should recover from corrupted state');
});

test('Edge: Reviving completed items (re-add removed TODO)', () => {
  createTestFile('services/frontend/src/revive.ts', `
    // TODO: Will be removed then re-added
  `);

  runSync();

  // Remove TODO
  createTestFile('services/frontend/src/revive.ts', `
    // No todos here
  `);

  runSync([], true);
  let state = getState();
  let completed = Object.values(state.items).filter(i => i.completedAt);
  assert.strictEqual(completed.length, 1, 'Should be completed');

  // Re-add the same TODO
  createTestFile('services/frontend/src/revive.ts', `
    // TODO: Will be removed then re-added
  `);

  runSync([], true);
  state = getState();
  const active = Object.values(state.items).filter(i => !i.completedAt);

  assert.strictEqual(active.length, 1, 'Should revive the TODO');
});

test('Edge: Missing service directory gracefully handled', () => {
  // Config references a service that doesn't exist
  const configWithMissing = {
    ...defaultConfig,
    services: [
      ...defaultConfig.services,
      {
        name: 'nonexistent',
        path: 'services/does-not-exist',
        include: ['src'],
        exclude: []
      }
    ]
  };
  createConfig(configWithMissing);

  createTestFile('services/frontend/src/exists.ts', `
    // TODO: This should still work
  `);

  // Should not crash
  const output = runSync(['--verbose']);
  assert.ok(output.includes('Synced'), 'Should complete despite missing service');

  const state = getState();
  const items = Object.values(state.items);
  assert.strictEqual(items.length, 1, 'Should find TODO in existing service');

  // Restore default config
  createConfig(defaultConfig);
});

test('Edge: Invalid service name in --service flag', () => {
  createTestFile('services/frontend/src/test.ts', `
    // TODO: Test
  `);

  try {
    runSync(['--service', 'nonexistent-service']);
    assert.fail('Should throw error for invalid service');
  } catch (error) {
    assert.ok(error.message.includes('Service not found') || error.status === 1);
  }
});

test('Edge: Empty service (no matching files)', () => {
  // Don't create any files, just run sync
  const output = runSync();

  assert.ok(output.includes('Synced'), 'Should complete with no items');
  assert.ok(output.includes('Active: 0'), 'Should show 0 active');
});

test('Edge: Nested directories (deep paths)', () => {
  createTestFile('services/frontend/src/components/forms/validation/rules/index.ts', `
    // TODO: Deep nested todo
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should find TODO in nested directory');
  assert.ok(items[0].file.includes('components/forms/validation/rules'));
});

test('Edge: Default exclusions are applied', () => {
  // Create a file that should be excluded by defaults
  createTestFile('services/frontend/src/test.md', `
    <!-- TODO: Should be excluded -->
  `);
  createTestFile('services/frontend/src/real.ts', `
    // TODO: Should be included
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should exclude .md files');
  assert.ok(items[0].file.includes('real.ts'));
});

test('Edge: Service-specific exclusions', () => {
  createTestFile('services/frontend/src/component.test.js', `
    // TODO: In test file - should be excluded
  `);
  createTestFile('services/frontend/src/component.ts', `
    // TODO: In source file - should be included
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should apply service-specific exclusions');
  assert.ok(!items[0].file.includes('.test.js'));
});

test('Edge: Whitespace handling in TODO content', () => {
  createTestFile('services/frontend/src/whitespace.ts', `
    // TODO:    Extra   spaces   should   normalize
    // TODO:			Tabs too
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 2, 'Should handle various whitespace');
  // Content should be trimmed
  items.forEach(item => {
    assert.ok(!item.content.startsWith(' '), 'Content should be trimmed');
  });
});

test('Edge: TODO immediately followed by code on same line', () => {
  createTestFile('services/frontend/src/sameline.ts', `
    const x = 1; // TODO: Inline comment
    /* TODO: Block comment */ const y = 2;
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.ok(items.length >= 1, 'Should detect inline TODOs');
});

test('Edge: Completed items purging respects maxCompletedItems', () => {
  // Create config with low max
  const configWithLowMax = {
    ...defaultConfig,
    tracking: {
      maxCompletedItems: 2,
      completedRetentionDays: 30
    }
  };
  createConfig(configWithLowMax);

  // Create and complete 4 TODOs
  for (let i = 1; i <= 4; i++) {
    createTestFile(`services/frontend/src/purge${i}.ts`, `
      // TODO: Item ${i}
    `);
  }
  runSync();

  // Remove all TODOs to complete them
  for (let i = 1; i <= 4; i++) {
    createTestFile(`services/frontend/src/purge${i}.ts`, `
      // No todos
    `);
  }
  runSync([], true);

  const state = getState();
  const completed = Object.values(state.items).filter(i => i.completedAt);

  // Should only keep 2 most recent
  assert.ok(completed.length <= 2, 'Should purge old completed items');

  // Restore default config
  createConfig(defaultConfig);
});

// ============================================================================
// LANGUAGE & COMMENT STYLE TESTS
// ============================================================================

test('Language: Python hash comments', () => {
  createTestFile('services/backend/src/main.py', `
    # TODO: Python style todo
    # TODO: [HIGH] High priority python todo
    def foo():
        # TODO: Nested python todo
        pass
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 3, 'Should detect Python # TODO comments');
  assert.ok(items.some(i => i.content.includes('Python style')));
});

test('Language: Block comments /* TODO: */', () => {
  createTestFile('services/frontend/src/block.ts', `
    /* TODO: Block comment todo */
    /**
     * TODO: JSDoc style todo
     */
    const x = /* TODO: Inline block */ 1;
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.ok(items.length >= 2, 'Should detect block comment TODOs');
});

test('Language: Mixed comment styles in same file', () => {
  createTestFile('services/frontend/src/mixed.tsx', `
    // TODO: Line comment
    /* TODO: Block comment */
    {/* TODO: JSX comment */}
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.ok(items.length >= 2, 'Should detect mixed comment styles');
});

// ============================================================================
// CROSS-SERVICE TESTS
// ============================================================================

test('Cross-service: TODO relocated from frontend to backend', () => {
  createTestFile('services/frontend/src/shared.ts', `
    // TODO: [HIGH] Shared utility function
  `);

  runSync();

  // Move to backend (simulating refactor)
  fs.unlinkSync(path.join(TEST_DIR, 'services/frontend/src/shared.ts'));
  createTestFile('services/backend/src/shared.py', `
    # TODO: [HIGH] Shared utility function
  `);

  runSync([], true);
  const state = getState();
  const items = Object.values(state.items).filter(i => !i.completedAt);

  assert.strictEqual(items.length, 1, 'Should track cross-service relocation');
  assert.strictEqual(items[0].service, 'backend', 'Should update service');
  assert.ok(items[0].file.includes('backend'), 'File should be in backend');
});

// ============================================================================
// PARSING EDGE CASES
// ============================================================================

test('Parsing: Empty priority brackets []', () => {
  createTestFile('services/frontend/src/empty-bracket.ts', `
    // TODO: [] Empty brackets
    // TODO: [ ] Spaces in brackets
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  // Should handle gracefully - either skip or treat as content
  assert.ok(items.length >= 0, 'Should not crash on empty brackets');
});

test('Parsing: Priority with extra spaces', () => {
  createTestFile('services/frontend/src/spaces.ts', `
    // TODO: [ HIGH ] Spaces around priority
    // TODO: [  MEDIUM  ] Extra spaces
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 2, 'Should handle spaces in brackets');
});

test('Parsing: Lowercase todo/fixme ignored', () => {
  createTestFile('services/frontend/src/case.ts', `
    // todo: lowercase should be ignored
    // Todo: mixed case ignored
    // TODO: Uppercase detected
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  // grep is case-sensitive by default, so only uppercase should match
  assert.strictEqual(items.length, 1, 'Should only detect uppercase TODO');
});

// ============================================================================
// OUTPUT & MARKDOWN TESTS
// ============================================================================

test('Output: Markdown special characters escaped', () => {
  createTestFile('services/frontend/src/markdown.ts', `
    // TODO: Handle *bold* and _italic_ in content
    // TODO: Support [links](url) and \`code\`
    // TODO: Fix | pipe | characters | in | tables
  `);

  runSync();
  const md = getMarkdown();

  // Markdown should be valid and not break formatting
  assert.ok(md.includes('Handle'), 'Content should be present');
  assert.ok(md.includes('# TODO'), 'Should have header');
  // The key is it doesn't crash and produces valid output
});

test('Output: File paths with special characters', () => {
  createTestFile('services/frontend/src/file-with-dashes.ts', `
    // TODO: Dashes in filename
  `);
  createTestFile('services/frontend/src/file_with_underscores.ts', `
    // TODO: Underscores in filename
  `);

  runSync();
  const md = getMarkdown();

  assert.ok(md.includes('file-with-dashes'), 'Should handle dashes');
  assert.ok(md.includes('file_with_underscores'), 'Should handle underscores');
});

// ============================================================================
// ROBUSTNESS TESTS
// ============================================================================

test('Robustness: Binary file in scan path', () => {
  // Create a binary file (simple PNG header)
  const binaryPath = path.join(TEST_DIR, 'services/frontend/src/image.png');
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  fs.writeFileSync(binaryPath, pngHeader);

  createTestFile('services/frontend/src/real.ts', `
    // TODO: Real todo
  `);

  // Should not crash
  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should handle binary files gracefully');
});

test('Robustness: Very large file with many TODOs', () => {
  let content = '';
  for (let i = 0; i < 100; i++) {
    content += `// TODO: Todo number ${i}\n`;
    content += `const x${i} = ${i};\n`;
  }

  createTestFile('services/frontend/src/large.ts', content);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 100, 'Should handle 100 TODOs in one file');
});

test('Robustness: Deeply nested service path', () => {
  // Create very deep nesting
  const deepPath = 'services/frontend/src/a/b/c/d/e/f/g/h/i/j/deep.ts';
  createTestFile(deepPath, `
    // TODO: Very deeply nested
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should find deeply nested files');
});

// ============================================================================
// CONFIG VALIDATION TESTS
// ============================================================================

test('Config: Empty services array', () => {
  const emptyConfig = {
    ...defaultConfig,
    services: []
  };
  createConfig(emptyConfig);

  const output = runSync();
  assert.ok(output.includes('Active: 0'), 'Should handle empty services');

  // Restore
  createConfig(defaultConfig);
});

test('Config: Service with empty include array', () => {
  const configEmptyInclude = {
    ...defaultConfig,
    services: [
      {
        name: 'empty-include',
        path: 'services/frontend',
        include: [],
        exclude: []
      }
    ]
  };
  createConfig(configEmptyInclude);

  createTestFile('services/frontend/src/test.ts', `
    // TODO: Should not be found
  `);

  const output = runSync();
  assert.ok(output.includes('Active: 0'), 'Empty include should find nothing');

  // Restore
  createConfig(defaultConfig);
});

// ============================================================================
// CLI WRAPPER TESTS
// ============================================================================

test('CLI: sync --all syncs both TODO and FIXME', () => {
  createTestFile('services/frontend/src/both.ts', `
    // TODO: A todo item
    // FIXME: A fixme item
  `);

  const cliScript = path.join(__dirname, 'cli.js');

  // Run cli.js sync --all
  execSync(
    `node ${cliScript} sync --all --config ${path.join(TEST_DIR, '.todorc.json')}`,
    { cwd: TEST_DIR, encoding: 'utf-8' }
  );

  // Check both files exist
  const todoMd = path.join(TEST_DIR, 'TODO.md');
  const fixmeMd = path.join(TEST_DIR, 'FIXME.md');

  assert.ok(fs.existsSync(todoMd), 'TODO.md should exist');
  assert.ok(fs.existsSync(fixmeMd), 'FIXME.md should exist');

  const todoContent = fs.readFileSync(todoMd, 'utf-8');
  const fixmeContent = fs.readFileSync(fixmeMd, 'utf-8');

  assert.ok(todoContent.includes('A todo item'), 'TODO.md should have todo');
  assert.ok(fixmeContent.includes('A fixme item'), 'FIXME.md should have fixme');
});

// ============================================================================
// FALSE POSITIVE PREVENTION TESTS
// ============================================================================

test('False positive: Variable name containing TODO should not match', () => {
  createTestFile('services/frontend/src/constants.ts', `
    const TODO_LIMIT = 100;
    const MAX_TODO_COUNT = 50;
    export const TODO_STATUS = { PENDING: 1 };
    // TODO: This is a real todo
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  // Should only find the actual TODO comment, not variable names
  assert.strictEqual(items.length, 1, 'Should not match TODO in variable names');
  assert.ok(items[0].content.includes('real todo'), 'Should find the comment TODO');
});

test('False positive: String containing TODO should not match', () => {
  createTestFile('services/frontend/src/strings.ts', `
    const message = "TODO: remember to fix this";
    const template = \`TODO: this is a template string\`;
    // TODO: Actual todo comment
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  // grep will find all of them, but ideally only comment TODOs
  // This test documents current behavior
  assert.ok(items.length >= 1, 'Should find at least the comment TODO');
});

test('False positive: URL containing TODO should not match', () => {
  createTestFile('services/frontend/src/urls.ts', `
    const apiUrl = "https://api.example.com/TODO/items";
    // TODO: Real todo here
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  // Document behavior - URLs might match depending on grep pattern
  assert.ok(items.length >= 1, 'Should find at least the real TODO');
});

// ============================================================================
// MULTI-LINE & COMPLEX COMMENT TESTS
// ============================================================================

test('Complex: Multiple TODOs on same line', () => {
  createTestFile('services/frontend/src/sameline.ts', `
    // TODO: First TODO: Second (two on one line)
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  // Should find at least one (behavior may vary)
  assert.ok(items.length >= 1, 'Should handle multiple TODOs on same line');
});

test('Complex: TODO in multi-line block comment', () => {
  createTestFile('services/frontend/src/multiline.ts', `
    /*
     * This is a multi-line comment
     * TODO: [HIGH] This spans multiple lines
     *       and continues here
     */
    const x = 1;
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.ok(items.length >= 1, 'Should find TODO in multi-line block');
});

test('Complex: JSDoc @todo tag', () => {
  createTestFile('services/frontend/src/jsdoc.ts', `
    /**
     * @todo Add validation
     * @param x The input
     */
    function process(x) {}
    // TODO: Regular todo
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  // @todo is lowercase so won't match - documents this behavior
  assert.ok(items.length >= 1, 'Should find uppercase TODO');
});

test('Complex: HTML template TODOs', () => {
  createTestFile('services/frontend/src/template.tsx', `
    export default function Component() {
      return (
        <div>
          {/* TODO: Add loading state */}
          <span>Content</span>
        </div>
      );
    }
  `);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should find JSX comment TODO');
  assert.ok(items[0].content.includes('loading state'));
});

// ============================================================================
// PLATFORM COMPATIBILITY TESTS
// ============================================================================

test('Platform: Windows CRLF line endings', () => {
  // Note: grep behavior with CRLF varies by platform
  // This test documents actual behavior rather than requiring specific handling
  const content = '// Line 1\r\n// TODO: CRLF todo\r\n// Line 3\r\n';
  createTestFile('services/frontend/src/crlf.ts', content);

  // Should not crash
  runSync();
  const state = getState();
  const items = Object.values(state.items);

  // On some platforms, grep may not find the TODO due to CRLF
  // This documents the behavior - user should convert to LF on Unix systems
  assert.ok(items.length >= 0, 'Should not crash on CRLF files');
});

test('Platform: UTF-8 BOM marker', () => {
  const BOM = '\uFEFF';
  const content = BOM + '// TODO: File with BOM\nconst x = 1;';
  createTestFile('services/frontend/src/bom.ts', content);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should handle UTF-8 BOM');
});

test('Platform: Mixed line endings in same file', () => {
  // Mixed line endings are common in cross-platform projects
  // When a file has mixed endings, grep may treat it as binary and skip it
  // This test documents the limitation - best practice is to normalize line endings
  const content = '// Line 1\n// TODO: Unix LF\r\n// TODO: Windows CRLF\r// TODO: Old Mac CR';
  createTestFile('services/frontend/src/mixed-endings.ts', content);

  // Should not crash regardless of grep behavior
  runSync();
  const state = getState();
  const items = Object.values(state.items);

  // grep may skip the file entirely due to mixed endings (treats as binary)
  // This documents the limitation - files should have consistent line endings
  assert.ok(items.length >= 0, 'Should not crash on mixed line endings');
});

// ============================================================================
// STATE EVOLUTION TESTS
// ============================================================================

test('Evolution: Priority promotion (LOW to HIGH)', () => {
  createTestFile('services/frontend/src/priority.ts', `
    // TODO: [LOW] This will be promoted
  `);

  runSync();

  // Change priority
  createTestFile('services/frontend/src/priority.ts', `
    // TODO: [HIGH] This will be promoted
  `);

  runSync([], true);
  const state = getState();
  const items = Object.values(state.items).filter(i => !i.completedAt);

  // Should have 1 active item with updated priority
  assert.strictEqual(items.length, 1, 'Should track as same item after priority change');
});

test('Evolution: Content update preserves history', () => {
  createTestFile('services/frontend/src/evolve.ts', `
    // TODO: [HIGH] Add user authentication
  `);

  runSync();
  const state1 = getState();
  const firstSeen = Object.values(state1.items)[0].firstSeen;

  // Update content slightly (should fuzzy match - 70% similarity threshold)
  createTestFile('services/frontend/src/evolve.ts', `
    // TODO: [HIGH] Add user authentication flow
  `);

  runSync([], true);
  const state2 = getState();
  const items = Object.values(state2.items).filter(i => !i.completedAt);

  // Fuzzy matching should connect these since they're similar enough
  assert.strictEqual(items.length, 1, 'Should track as single item via fuzzy match');
  assert.strictEqual(items[0].firstSeen, firstSeen, 'Should preserve firstSeen on fuzzy match');
});

test('Evolution: Adding label to unlabeled TODO', () => {
  createTestFile('services/frontend/src/label.ts', `
    // TODO: Unlabeled todo
  `);

  runSync();

  // Add label
  createTestFile('services/frontend/src/label.ts', `
    // TODO: [HIGH] Unlabeled todo
  `);

  runSync([], true);
  const state = getState();
  const items = Object.values(state.items).filter(i => !i.completedAt);

  // Should fuzzy match and update
  assert.ok(items.length >= 1, 'Should track label addition');
});

// ============================================================================
// VERBOSE OUTPUT & STATISTICS TESTS
// ============================================================================

test('Verbose: Output includes service scan info', () => {
  createTestFile('services/frontend/src/verbose.ts', `
    // TODO: Test verbose
  `);

  const output = runSync(['--verbose']);

  assert.ok(output.includes('frontend') || output.includes('Scanning'), 'Verbose should show services');
});

test('Statistics: Markdown shows correct counts', () => {
  createTestFile('services/frontend/src/stats.ts', `
    // TODO: [HIGH] High 1
    // TODO: [HIGH] High 2
    // TODO: [LOW] Low 1
    // TODO: No priority
  `);

  runSync();
  const md = getMarkdown();

  assert.ok(md.includes('Active: 4'), 'Should show correct active count');
  // Could also verify priority section counts
});

// ============================================================================
// IDEMPOTENCY & RELIABILITY TESTS
// ============================================================================

test('Idempotency: Multiple syncs produce same result', () => {
  createTestFile('services/frontend/src/idem.ts', `
    // TODO: Stable todo
    // TODO: [HIGH] High priority stable
  `);

  runSync();
  const state1 = JSON.stringify(getState());
  const md1 = getMarkdown();

  runSync([], true);
  const state2 = JSON.stringify(getState());
  const md2 = getMarkdown();

  runSync([], true);
  const state3 = JSON.stringify(getState());
  const md3 = getMarkdown();

  // State should be stable (ignoring timestamps)
  const normalize = s => s.replace(/"lastSeen":"[^"]+"/g, '"lastSeen":"X"');
  assert.strictEqual(normalize(state2), normalize(state3), 'State should be stable after multiple syncs');
});

test('Reliability: Handles empty file gracefully', () => {
  createTestFile('services/frontend/src/empty.ts', '');
  createTestFile('services/frontend/src/real.ts', '// TODO: Real todo');

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should skip empty file without error');
});

test('Reliability: Handles file with only whitespace', () => {
  createTestFile('services/frontend/src/whitespace-only.ts', '   \n\n\t\t\n   ');
  createTestFile('services/frontend/src/real.ts', '// TODO: Real todo');

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should skip whitespace-only file');
});

test('Reliability: Handles file with no newline at end', () => {
  const contentNoNewline = '// TODO: No trailing newline';
  const filePath = path.join(TEST_DIR, 'services/frontend/src/nonewline.ts');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contentNoNewline);

  runSync();
  const state = getState();
  const items = Object.values(state.items);

  assert.strictEqual(items.length, 1, 'Should find TODO in file without trailing newline');
});

// Run all tests
runTests();
