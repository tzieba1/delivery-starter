#!/usr/bin/env node

/**
 * TODO/FIXME Tracker - Configurable sync tool
 *
 * Scans configured services for TODO/FIXME comments and generates
 * markdown reports with smart tracking (line moves, completions, etc.)
 *
 * Usage:
 *   node tools/todo-tracker/sync.js [--todo|--fixme] [options]
 *
 * Options:
 *   --todo          Sync TODO comments (default)
 *   --fixme         Sync FIXME comments
 *   --config <path> Path to config file (default: .todorc.json)
 *   --service <name> Only scan specific service
 *   --dry-run       Show what would be synced without writing
 *   --verbose       Show detailed output
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    type: 'TODO',
    configPath: '.todorc.json',
    service: null,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--fixme':
        options.type = 'FIXME';
        break;
      case '--todo':
        options.type = 'TODO';
        break;
      case '--config':
        options.configPath = args[++i];
        break;
      case '--service':
        options.service = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
    }
  }

  return options;
}

// Find project root (where .todorc.json is)
function findProjectRoot(startDir = process.cwd()) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.todorc.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

// Load configuration
function loadConfig(configPath, projectRoot) {
  const fullPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(projectRoot, configPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`Config file not found: ${fullPath}`);
    console.error('Create a .todorc.json file or specify --config <path>');
    process.exit(1);
  }

  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to parse config: ${err.message}`);
    process.exit(1);
  }
}

// Merge default exclusions with service-specific ones
function getExclusions(config, service) {
  const defaults = config.defaults?.exclude || [];
  const serviceExcludes = service.exclude || [];
  return [...new Set([...defaults, ...serviceExcludes])];
}

// Build grep exclude arguments
function buildExcludeArgs(exclusions) {
  return exclusions
    .map(p => `--exclude-dir="${p}" --exclude="${p}"`)
    .join(' ');
}

// Generate content hash for tracking
function generateContentHash(label, content) {
  const normalized = `${label}:${content}`.toLowerCase().trim();
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 12);
}

// Extract priority/label from content
function extractPriority(content, priorities) {
  const match = content.match(/^\[([^\]]+)\]\s*/);
  if (match) {
    const label = match[1].toUpperCase();
    const cleanedContent = content.replace(/^\[([^\]]+)\]\s*/, '').trim();
    return { label, content: cleanedContent };
  }
  return { label: 'NONE', content };
}

// Scan a single service for items
function scanService(service, pattern, config, projectRoot, verbose) {
  const items = [];
  const servicePath = path.join(projectRoot, service.path);

  if (!fs.existsSync(servicePath)) {
    if (verbose) console.log(`  Skipping ${service.name}: path not found`);
    return items;
  }

  const exclusions = getExclusions(config, service);
  const excludeArgs = buildExcludeArgs(exclusions);
  const priorities = config.priorities || ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

  for (const include of service.include) {
    const searchPath = path.join(servicePath, include);

    try {
      const grepCmd = `grep -rn ${excludeArgs} "${pattern}:" ${searchPath} 2>/dev/null || true`;
      const output = execSync(grepCmd, { encoding: 'utf-8', cwd: projectRoot });

      output.split('\n').forEach(line => {
        if (!line.trim()) return;

        const match = line.match(/^(.+):(\d+):(.+)$/);
        if (match) {
          const [, file, lineNum, rawContent] = match;
          const content = rawContent.replace(new RegExp(`.*?${pattern}:\\s*`), '').trim();

          if (!content || content.length === 0) return;

          const { label, content: cleanContent } = extractPriority(content, priorities);

          if (!cleanContent || cleanContent.length === 0) return;

          const contentHash = generateContentHash(label, cleanContent);

          // Make path relative to project root
          const relativePath = path.relative(projectRoot, file);

          items.push({
            contentHash,
            service: service.name,
            file: relativePath,
            line: parseInt(lineNum),
            label,
            content: cleanContent,
          });
        }
      });
    } catch (err) {
      if (verbose) console.log(`  Error scanning ${include}: ${err.message}`);
    }
  }

  return items;
}

// Jaccard similarity for fuzzy matching
function similarity(str1, str2) {
  const set1 = new Set(str1.toLowerCase().split(/\s+/));
  const set2 = new Set(str2.toLowerCase().split(/\s+/));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// Generate unique ID for items
function generateUniqueId(hash, line, existingItems) {
  const baseId = `${hash}-${line}`;
  if (!existingItems[baseId]) return baseId;

  let suffix = 2;
  while (existingItems[`${hash}-${line}-${suffix}`]) {
    suffix++;
  }
  return `${hash}-${line}-${suffix}`;
}

// Match current items with state
function matchItems(currentItems, state) {
  const now = new Date().toISOString();
  const matchedCurrentItems = new Set();
  const matchedStateIds = new Set();
  const newState = { items: {} };

  // Find state items by hash
  function findStateItemsByHash(hash) {
    return Object.entries(state.items)
      .filter(([id]) => id.startsWith(hash + '-') || id === hash)
      .map(([id, item]) => ({ id, ...item }));
  }

  // Step 1: Exact hash matches
  currentItems.forEach((item, currentIdx) => {
    if (matchedCurrentItems.has(currentIdx)) return;

    const candidateStates = findStateItemsByHash(item.contentHash);
    const bestMatch = candidateStates
      .filter(s => !matchedStateIds.has(s.id) && !s.completedAt)
      .sort((a, b) => Math.abs(a.line - item.line) - Math.abs(b.line - item.line))[0];

    if (bestMatch) {
      matchedCurrentItems.add(currentIdx);
      matchedStateIds.add(bestMatch.id);

      const fileMoved = bestMatch.file !== item.file;
      const lineMoved = bestMatch.line !== item.line && !fileMoved;
      const lineHistory = bestMatch.lineHistory || [bestMatch.line];

      if (lineMoved && !lineHistory.includes(item.line)) {
        lineHistory.push(item.line);
      }

      const locationHistory = bestMatch.locationHistory || [{
        file: bestMatch.file,
        line: bestMatch.line,
        movedAt: bestMatch.firstSeen
      }];

      if (fileMoved) {
        locationHistory.push({
          file: item.file,
          line: item.line,
          movedAt: now
        });
      }

      newState.items[bestMatch.id] = {
        ...bestMatch,
        service: item.service,
        file: item.file,
        line: item.line,
        lineHistory: fileMoved ? [item.line] : lineHistory,
        locationHistory,
        fileMoveCount: fileMoved ? (bestMatch.fileMoveCount || 0) + 1 : (bestMatch.fileMoveCount || 0),
        lineMoveCount: lineMoved ? (bestMatch.lineMoveCount || 0) + 1 : (bestMatch.lineMoveCount || 0),
        lastLineMoved: lineMoved ? now : bestMatch.lastLineMoved,
        lastFileMoved: fileMoved ? now : bestMatch.lastFileMoved,
        completedAt: null
      };
    }
  });

  // Step 2: Fuzzy matching for state items not matched
  Object.entries(state.items).forEach(([id, stateItem]) => {
    if (matchedStateIds.has(id) || newState.items[id]) return;

    let fuzzyMatchIdx = currentItems.findIndex((item, idx) =>
      !matchedCurrentItems.has(idx) &&
      item.file === stateItem.file &&
      Math.abs(item.line - stateItem.line) <= 5 &&
      item.label === stateItem.label &&
      similarity(item.content, stateItem.content) > 0.7
    );

    let isFileMove = false;

    if (fuzzyMatchIdx === -1) {
      fuzzyMatchIdx = currentItems.findIndex((item, idx) =>
        !matchedCurrentItems.has(idx) &&
        item.file !== stateItem.file &&
        item.label === stateItem.label &&
        similarity(item.content, stateItem.content) > 0.85
      );
      isFileMove = fuzzyMatchIdx !== -1;
    }

    if (fuzzyMatchIdx !== -1) {
      const fuzzyMatch = currentItems[fuzzyMatchIdx];
      matchedCurrentItems.add(fuzzyMatchIdx);
      matchedStateIds.add(id);

      const newId = generateUniqueId(fuzzyMatch.contentHash, fuzzyMatch.line, newState.items);
      const fileMoved = fuzzyMatch.file !== stateItem.file;
      const lineMoved = fuzzyMatch.line !== stateItem.line && !fileMoved;

      const locationHistory = stateItem.locationHistory || [{
        file: stateItem.file,
        line: stateItem.line,
        movedAt: stateItem.firstSeen
      }];

      if (fileMoved) {
        locationHistory.push({
          file: fuzzyMatch.file,
          line: fuzzyMatch.line,
          movedAt: now
        });
      }

      newState.items[newId] = {
        ...stateItem,
        firstSeen: stateItem.firstSeen,
        lastUpdated: now,
        service: fuzzyMatch.service,
        file: fuzzyMatch.file,
        line: fuzzyMatch.line,
        lineHistory: !fileMoved
          ? [...(stateItem.lineHistory || [stateItem.line]), fuzzyMatch.line].filter((v, i, a) => a.indexOf(v) === i)
          : [fuzzyMatch.line],
        locationHistory,
        label: fuzzyMatch.label,
        content: fuzzyMatch.content,
        contentChangeCount: isFileMove ? (stateItem.contentChangeCount || 0) : (stateItem.contentChangeCount || 0) + 1,
        lineMoveCount: lineMoved ? (stateItem.lineMoveCount || 0) + 1 : (stateItem.lineMoveCount || 0),
        fileMoveCount: fileMoved ? (stateItem.fileMoveCount || 0) + 1 : (stateItem.fileMoveCount || 0),
        lastLineMoved: lineMoved ? now : stateItem.lastLineMoved,
        lastFileMoved: fileMoved ? now : stateItem.lastFileMoved,
        completedAt: null
      };
    } else {
      // Mark as completed
      newState.items[id] = {
        ...stateItem,
        completedAt: stateItem.completedAt || now
      };
    }
  });

  // Step 3: Create new items
  currentItems.forEach((item, currentIdx) => {
    if (matchedCurrentItems.has(currentIdx)) return;

    const uniqueId = generateUniqueId(item.contentHash, item.line, newState.items);

    newState.items[uniqueId] = {
      firstSeen: now,
      lastUpdated: now,
      service: item.service,
      file: item.file,
      line: item.line,
      lineHistory: [item.line],
      label: item.label,
      content: item.content,
      contentChangeCount: 0,
      lineMoveCount: 0,
      fileMoveCount: 0,
      lastLineMoved: null,
      lastFileMoved: null,
      completedAt: null
    };
  });

  return newState;
}

// Purge old completed items
function purgeOldCompleted(state, config) {
  const maxItems = config.tracking?.maxCompletedItems || 50;
  const retentionDays = config.tracking?.completedRetentionDays || 30;
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = new Date();

  const completedItems = Object.entries(state.items)
    .filter(([, item]) => item.completedAt)
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  let purgedCount = 0;
  completedItems.forEach((item, index) => {
    const completedAge = now - new Date(item.completedAt);
    if (completedAge > retentionMs || index >= maxItems) {
      delete state.items[item.id];
      purgedCount++;
    }
  });

  return purgedCount;
}

// Format date
function formatDate(isoString) {
  return new Date(isoString).toISOString().split('T')[0];
}

// Group and sort items
function groupAndSort(items, priorities, isCompleted = false) {
  const priorityOrder = [...priorities, 'NONE'];
  const groups = {};

  items.forEach(item => {
    if (!groups[item.label]) groups[item.label] = [];
    groups[item.label].push(item);
  });

  Object.keys(groups).forEach(label => {
    groups[label].sort((a, b) => {
      if (isCompleted && a.completedAt && b.completedAt) {
        return new Date(b.completedAt) - new Date(a.completedAt);
      }
      return new Date(a.firstSeen) - new Date(b.firstSeen);
    });
  });

  const sortedLabels = Object.keys(groups).sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a);
    const bIndex = priorityOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });

  return { groups, sortedLabels };
}

// Generate markdown
function generateMarkdown(type, activeItems, completedItems, config) {
  const priorities = config.priorities || ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

  let md = `# ${type}\n\n`;
  md += `> Last synced: ${formatDate(new Date().toISOString())}\n`;
  md += `> Active: ${activeItems.length} | Completed: ${completedItems.length}\n\n`;

  if (activeItems.length === 0 && completedItems.length === 0) {
    md += `✅ No ${type} items found\n`;
    return md;
  }

  // Active items
  if (activeItems.length > 0) {
    md += `## Active Items (${activeItems.length})\n\n`;

    const { groups, sortedLabels } = groupAndSort(activeItems, priorities);

    sortedLabels.forEach(label => {
      const labelItems = groups[label];
      const labelDisplay = label === 'NONE' ? 'No Priority' : label;
      md += `### ${labelDisplay} (${labelItems.length})\n\n`;

      labelItems.forEach(item => {
        const addedDate = formatDate(item.firstSeen);
        let timeInfo = `Added: ${addedDate}`;

        const changes = [];
        if (item.contentChangeCount > 0) changes.push(`Content: ${item.contentChangeCount}x`);
        if (item.fileMoveCount > 0) changes.push(`Relocated: ${item.fileMoveCount}x`);
        else if (item.lineMoveCount > 0) changes.push(`Line moved: ${item.lineMoveCount}x`);

        const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : '';

        md += `- [ ] ${item.content} _[${timeInfo}]_${changeSummary}\n`;
        md += `  \`${item.file}:${item.line}\``;

        if (item.locationHistory && item.locationHistory.length > 1) {
          const prev = item.locationHistory.slice(0, -1);
          const prevStr = prev.map(l => `\`${l.file}:${l.line}\``).join(' → ');
          md += `\n  _Previously: ${prevStr}_`;
        } else if (item.lineHistory && item.lineHistory.length > 1) {
          const prevLines = item.lineHistory.slice(0, -1);
          md += ` _(previously: ${prevLines.map(l => `line ${l}`).join(', ')})_`;
        }

        md += '\n\n';
      });
    });
  }

  // Completed items
  if (completedItems.length > 0) {
    md += '---\n\n';
    md += `## Completed Items (${completedItems.length})\n\n`;

    const { groups, sortedLabels } = groupAndSort(completedItems, priorities, true);

    sortedLabels.forEach(label => {
      const labelItems = groups[label];
      const labelDisplay = label === 'NONE' ? 'No Priority' : label;
      md += `### ${labelDisplay} (${labelItems.length})\n\n`;

      labelItems.forEach(item => {
        const addedDate = formatDate(item.firstSeen);
        const completedDate = formatDate(item.completedAt);

        md += `- [x] ${item.content} _[Added: ${addedDate}, Completed: ${completedDate}]_\n`;
        md += `  \`${item.file}:${item.line}\`\n\n`;
      });
    });
  }

  return md;
}

// Main execution
function main() {
  const options = parseArgs();
  const projectRoot = findProjectRoot();
  const config = loadConfig(options.configPath, projectRoot);

  if (options.verbose) {
    console.log(`Project root: ${projectRoot}`);
    console.log(`Config: ${options.configPath}`);
    console.log(`Type: ${options.type}`);
  }

  // Filter services if specified
  let services = config.services || [];
  if (options.service) {
    services = services.filter(s => s.name === options.service);
    if (services.length === 0) {
      console.error(`Service not found: ${options.service}`);
      console.error(`Available: ${config.services.map(s => s.name).join(', ')}`);
      process.exit(1);
    }
  }

  // Set up paths
  const stateDir = path.join(projectRoot, config.output?.stateDir || '.todo-tracker');
  const stateFile = path.join(stateDir, `${options.type.toLowerCase()}-state.json`);
  const outputFile = path.join(
    projectRoot,
    options.type === 'FIXME' ? (config.output?.fixmeFile || 'FIXME.md') : (config.output?.todoFile || 'TODO.md')
  );

  // Ensure state directory exists
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  // Load existing state
  let state = { items: {} };
  if (fs.existsSync(stateFile)) {
    try {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    } catch (err) {
      if (options.verbose) console.log('Starting with fresh state');
    }
  }

  // Scan all services
  console.log(`Scanning for ${options.type}s...`);
  const allItems = [];
  const scannedServices = new Set();

  services.forEach(service => {
    if (options.verbose) console.log(`  Scanning ${service.name}...`);
    const items = scanService(service, options.type, config, projectRoot, options.verbose);
    allItems.push(...items);
    scannedServices.add(service.name);
    if (options.verbose) console.log(`    Found ${items.length} items`);
  });

  // When filtering by service, preserve state for non-scanned services
  if (options.service) {
    // Add back items from non-scanned services to prevent marking them as completed
    Object.entries(state.items).forEach(([id, item]) => {
      if (item.service && !scannedServices.has(item.service) && !item.completedAt) {
        allItems.push({
          contentHash: id.split('-')[0],
          service: item.service,
          file: item.file,
          line: item.line,
          label: item.label,
          content: item.content,
        });
      }
    });
  }

  // Match and update state
  const newState = matchItems(allItems, state);

  // Separate active and completed
  const activeItems = [];
  const completedItems = [];

  Object.entries(newState.items).forEach(([id, item]) => {
    const enrichedItem = { id, ...item };
    if (item.completedAt) {
      completedItems.push(enrichedItem);
    } else {
      activeItems.push(enrichedItem);
    }
  });

  // Purge old completed items
  const purgedCount = purgeOldCompleted(newState, config);

  // Generate markdown
  const markdown = generateMarkdown(options.type, activeItems, completedItems, config);

  if (options.dryRun) {
    console.log('\n--- DRY RUN ---');
    console.log(markdown);
    console.log('--- END DRY RUN ---\n');
  } else {
    // Save state and output
    fs.writeFileSync(stateFile, JSON.stringify(newState, null, 2));
    fs.writeFileSync(outputFile, markdown);
  }

  // Summary
  console.log(`✅ Synced ${options.type}s to ${path.relative(projectRoot, outputFile)}`);
  console.log(`   Active: ${activeItems.length} | Completed: ${completedItems.length}`);

  if (activeItems.some(i => i.fileMoveCount > 0)) {
    console.log(`   🚚 ${activeItems.filter(i => i.fileMoveCount > 0).length} item(s) relocated`);
  }
  if (activeItems.some(i => i.lineMoveCount > 0)) {
    console.log(`   📍 ${activeItems.filter(i => i.lineMoveCount > 0).length} item(s) moved lines`);
  }
  if (activeItems.some(i => i.contentChangeCount > 0)) {
    console.log(`   ✏️  ${activeItems.filter(i => i.contentChangeCount > 0).length} item(s) content changed`);
  }
  if (purgedCount > 0) {
    console.log(`   🗑️  Purged ${purgedCount} old completed item(s)`);
  }

  console.log(`📊 State: ${path.relative(projectRoot, stateFile)}`);
}

main();
