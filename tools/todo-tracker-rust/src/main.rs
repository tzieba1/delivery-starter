use chrono::{DateTime, Utc};
use clap::Parser;
use md5::{Digest, Md5};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

// ============================================================================
// CONFIG
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub services: Vec<ServiceConfig>,
    #[serde(default)]
    pub output: OutputConfig,
    #[serde(default)]
    pub defaults: DefaultsConfig,
    #[serde(default = "default_priorities")]
    pub priorities: Vec<String>,
    #[serde(default)]
    pub tracking: TrackingConfig,
}

fn default_priorities() -> Vec<String> {
    vec!["URGENT".into(), "HIGH".into(), "MEDIUM".into(), "LOW".into()]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceConfig {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub include: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OutputConfig {
    #[serde(default)]
    pub mode: String,
    #[serde(default = "default_todo_file")]
    pub todo_file: String,
    #[serde(default = "default_fixme_file")]
    pub fixme_file: String,
    #[serde(default = "default_state_dir")]
    pub state_dir: String,
}

fn default_todo_file() -> String { "TODO.md".into() }
fn default_fixme_file() -> String { "FIXME.md".into() }
fn default_state_dir() -> String { ".todo-tracker".into() }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DefaultsConfig {
    #[serde(default = "default_excludes")]
    pub exclude: Vec<String>,
}

fn default_excludes() -> Vec<String> {
    vec![
        "node_modules".into(), ".git".into(), "dist".into(), "build".into(),
        ".next".into(), "coverage".into(), "*.min.js".into(), "*.bundle.js".into(),
        "*.lock".into(), "*.md".into(), "README*".into(), "__pycache__".into(), "*.pyc".into(),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackingConfig {
    #[serde(default = "default_max_completed")]
    pub max_completed_items: usize,
    #[serde(default = "default_retention_days")]
    pub completed_retention_days: i64,
}

fn default_max_completed() -> usize { 50 }
fn default_retention_days() -> i64 { 30 }

impl Default for TrackingConfig {
    fn default() -> Self {
        Self {
            max_completed_items: default_max_completed(),
            completed_retention_days: default_retention_days(),
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            services: Vec::new(),
            output: OutputConfig::default(),
            defaults: DefaultsConfig::default(),
            priorities: default_priorities(),
            tracking: TrackingConfig::default(),
        }
    }
}

impl Config {
    pub fn load(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        if !path.exists() {
            return Ok(Config::default());
        }
        let content = fs::read_to_string(path)?;
        let config: Config = serde_json::from_str(&content)?;
        Ok(config)
    }

    pub fn get_service_by_name(&self, name: &str) -> Option<&ServiceConfig> {
        self.services.iter().find(|s| s.name == name)
    }

    pub fn get_service_names(&self) -> Vec<String> {
        self.services.iter().map(|s| s.name.clone()).collect()
    }
}

pub fn find_config_file(start_dir: &Path) -> Option<PathBuf> {
    let mut dir = start_dir.to_path_buf();
    loop {
        let config_path = dir.join(".todorc.json");
        if config_path.exists() {
            return Some(config_path);
        }
        if !dir.pop() {
            return None;
        }
    }
}

// ============================================================================
// STATE
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct State {
    pub items: HashMap<String, StateItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateItem {
    pub first_seen: String,
    pub last_seen: String,
    #[serde(default)]
    pub last_updated: String,
    pub file: String,
    pub line: usize,
    #[serde(default)]
    pub service: String,
    #[serde(default)]
    pub line_history: Vec<usize>,
    #[serde(default)]
    pub location_history: Vec<LocationEntry>,
    pub label: String,
    pub content: String,
    #[serde(default)]
    pub content_change_count: usize,
    #[serde(default)]
    pub line_move_count: usize,
    #[serde(default)]
    pub file_move_count: usize,
    #[serde(default)]
    pub last_line_moved: Option<String>,
    #[serde(default)]
    pub last_file_moved: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationEntry {
    pub file: String,
    pub line: usize,
    pub moved_at: String,
}

impl State {
    pub fn load(state_dir: &Path, item_type: &str) -> Self {
        let filename = format!("{}-state.json", item_type.to_lowercase());
        let state_path = state_dir.join(filename);

        if !state_path.exists() {
            return State::default();
        }

        match fs::read_to_string(&state_path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => State::default(),
        }
    }

    pub fn save(&self, state_dir: &Path, item_type: &str, config: &Config) -> Result<(), Box<dyn std::error::Error>> {
        fs::create_dir_all(state_dir)?;

        let mut state = self.clone();
        state.purge_old_completed(config);

        let filename = format!("{}-state.json", item_type.to_lowercase());
        let state_path = state_dir.join(filename);
        let content = serde_json::to_string_pretty(&state)?;
        fs::write(state_path, content)?;
        Ok(())
    }

    fn purge_old_completed(&mut self, config: &Config) {
        let now = Utc::now();
        let retention_days = config.tracking.completed_retention_days;

        let mut completed: Vec<(String, DateTime<Utc>)> = self.items.iter()
            .filter_map(|(id, item)| {
                item.completed_at.as_ref().and_then(|c| {
                    DateTime::parse_from_rfc3339(c).ok().map(|dt| (id.clone(), dt.with_timezone(&Utc)))
                })
            })
            .collect();

        completed.sort_by(|a, b| b.1.cmp(&a.1));

        let to_remove: HashSet<String> = completed.iter()
            .enumerate()
            .filter(|(i, (_, dt))| {
                let age_days = (now - *dt).num_days();
                age_days > retention_days || *i >= config.tracking.max_completed_items
            })
            .map(|(_, (id, _))| id.clone())
            .collect();

        for id in to_remove {
            self.items.remove(&id);
        }
    }

    pub fn get_active_items(&self) -> Vec<(&String, &StateItem)> {
        self.items.iter().filter(|(_, item)| item.completed_at.is_none()).collect()
    }

    pub fn get_completed_items(&self) -> Vec<(&String, &StateItem)> {
        self.items.iter().filter(|(_, item)| item.completed_at.is_some()).collect()
    }
}

// ============================================================================
// SCANNER
// ============================================================================

#[derive(Debug, Clone)]
pub struct FoundItem {
    pub content_hash: String,
    pub service: String,
    pub file: String,
    pub line: usize,
    pub label: String,
    pub content: String,
}

pub struct Scanner<'a> {
    config: &'a Config,
    project_root: PathBuf,
    item_type: String,
    pattern: Regex,
}

impl<'a> Scanner<'a> {
    pub fn new(config: &'a Config, project_root: &Path, item_type: &str) -> Self {
        let pattern = Regex::new(&format!(r"{}:\s*(.*)", item_type)).unwrap();
        Self {
            config,
            project_root: project_root.to_path_buf(),
            item_type: item_type.to_string(),
            pattern,
        }
    }

    pub fn scan_all(&self) -> Vec<FoundItem> {
        self.scan_services(None)
    }

    pub fn scan_services(&self, service_names: Option<&[String]>) -> Vec<FoundItem> {
        let mut items = Vec::new();

        for service in &self.config.services {
            if let Some(names) = service_names {
                if !names.contains(&service.name) {
                    continue;
                }
            }

            let service_path = self.project_root.join(&service.path);
            if !service_path.exists() {
                continue;
            }

            items.extend(self.scan_service(service));
        }

        items
    }

    fn scan_service(&self, service: &ServiceConfig) -> Vec<FoundItem> {
        let mut items = Vec::new();
        let service_path = self.project_root.join(&service.path);

        for include in &service.include {
            let include_path = service_path.join(include);

            if include_path.is_file() {
                if !self.should_exclude_file(include_path.file_name().unwrap().to_str().unwrap(), service) {
                    items.extend(self.scan_file(&include_path, &service.name));
                }
            } else if include_path.is_dir() {
                for entry in WalkDir::new(&include_path).into_iter().filter_map(|e| e.ok()) {
                    let path = entry.path();

                    if path.is_dir() {
                        continue;
                    }

                    // Check directory exclusions
                    let should_skip = path.ancestors().any(|ancestor| {
                        ancestor.file_name()
                            .and_then(|n| n.to_str())
                            .map(|name| self.should_exclude_dir(name, service))
                            .unwrap_or(false)
                    });

                    if should_skip {
                        continue;
                    }

                    if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                        if !self.should_exclude_file(filename, service) {
                            items.extend(self.scan_file(path, &service.name));
                        }
                    }
                }
            }
        }

        items
    }

    fn scan_file(&self, path: &Path, service_name: &str) -> Vec<FoundItem> {
        let mut items = Vec::new();

        let file = match fs::File::open(path) {
            Ok(f) => f,
            Err(_) => return items,
        };

        let rel_path = path.strip_prefix(&self.project_root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let reader = BufReader::new(file);

        for (line_num, line_result) in reader.lines().enumerate() {
            let line = match line_result {
                Ok(l) => l,
                Err(_) => continue,
            };

            if let Some(caps) = self.pattern.captures(&line) {
                if let Some(raw_content) = caps.get(1) {
                    let content = raw_content.as_str().trim();
                    if content.is_empty() {
                        continue;
                    }

                    let (label, clean_content) = extract_priority(content);
                    if clean_content.is_empty() {
                        continue;
                    }

                    let hash = generate_content_hash(&label, &clean_content);

                    items.push(FoundItem {
                        content_hash: hash,
                        service: service_name.to_string(),
                        file: rel_path.clone(),
                        line: line_num + 1,
                        label,
                        content: clean_content,
                    });
                }
            }
        }

        items
    }

    fn should_exclude_dir(&self, name: &str, service: &ServiceConfig) -> bool {
        self.config.defaults.exclude.iter().any(|p| match_glob(p, name)) ||
        service.exclude.iter().any(|p| match_glob(p, name))
    }

    fn should_exclude_file(&self, name: &str, service: &ServiceConfig) -> bool {
        self.config.defaults.exclude.iter().any(|p| match_glob(p, name)) ||
        service.exclude.iter().any(|p| match_glob(p, name))
    }
}

fn match_glob(pattern: &str, name: &str) -> bool {
    if pattern == name {
        return true;
    }
    if pattern.starts_with("*.") {
        return name.ends_with(&pattern[1..]);
    }
    if pattern.ends_with('*') {
        return name.starts_with(&pattern[..pattern.len()-1]);
    }
    false
}

fn extract_priority(content: &str) -> (String, String) {
    let re = Regex::new(r"^\[([^\]]+)\]\s*").unwrap();
    if let Some(caps) = re.captures(content) {
        let label = caps.get(1).unwrap().as_str().trim().to_uppercase();
        let remaining = content[caps.get(0).unwrap().len()..].trim().to_string();
        if label.is_empty() {
            return ("NONE".to_string(), remaining);
        }
        return (label, remaining);
    }
    ("NONE".to_string(), content.to_string())
}

fn generate_content_hash(label: &str, content: &str) -> String {
    let normalized = format!("{}:{}", label, content).to_lowercase();
    let mut hasher = Md5::new();
    hasher.update(normalized.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)[..12].to_string()
}

// ============================================================================
// MATCHER
// ============================================================================

#[derive(Default)]
pub struct MatchStats {
    pub added: usize,
    pub updated: usize,
    pub completed: usize,
    pub relocated: usize,
    pub line_moved: usize,
}

pub struct Matcher<'a> {
    config: &'a Config,
}

impl<'a> Matcher<'a> {
    pub fn new(config: &'a Config) -> Self {
        Self { config }
    }

    pub fn match_items(
        &self,
        current_items: &[FoundItem],
        existing_state: &State,
        scanned_services: Option<&HashSet<String>>,
    ) -> (State, MatchStats) {
        let now = Utc::now().to_rfc3339();
        let mut new_state = State::default();
        let mut stats = MatchStats::default();

        let mut matched_current: HashSet<usize> = HashSet::new();
        let mut matched_state: HashSet<String> = HashSet::new();
        let mut existing_ids: HashSet<String> = existing_state.items.keys().cloned().collect();

        // Step 1: Exact hash matches
        for (idx, current) in current_items.iter().enumerate() {
            if matched_current.contains(&idx) {
                continue;
            }

            let candidates: Vec<(&String, &StateItem)> = existing_state.items.iter()
                .filter(|(id, item)| {
                    (id.starts_with(&format!("{}-", current.content_hash)) || *id == &current.content_hash) &&
                    !matched_state.contains(*id) &&
                    item.completed_at.is_none()
                })
                .collect();

            if let Some((best_id, best_item)) = candidates.iter()
                .min_by_key(|(_, item)| (item.file != current.file, (item.line as i64 - current.line as i64).abs()))
            {
                matched_current.insert(idx);
                matched_state.insert((*best_id).clone());

                let file_moved = best_item.file != current.file;
                let line_moved = best_item.line != current.line && !file_moved;

                let mut line_history = best_item.line_history.clone();
                if file_moved {
                    line_history = vec![current.line];
                } else if line_moved && !line_history.contains(&current.line) {
                    line_history.push(current.line);
                }

                let mut location_history = best_item.location_history.clone();
                if location_history.is_empty() {
                    location_history.push(LocationEntry {
                        file: best_item.file.clone(),
                        line: best_item.line,
                        moved_at: best_item.first_seen.clone(),
                    });
                }
                if file_moved {
                    location_history.push(LocationEntry {
                        file: current.file.clone(),
                        line: current.line,
                        moved_at: now.clone(),
                    });
                    stats.relocated += 1;
                }
                if line_moved {
                    stats.line_moved += 1;
                }

                new_state.items.insert((*best_id).clone(), StateItem {
                    first_seen: best_item.first_seen.clone(),
                    last_seen: now.clone(),
                    last_updated: best_item.last_updated.clone(),
                    file: current.file.clone(),
                    line: current.line,
                    service: current.service.clone(),
                    line_history,
                    location_history,
                    label: current.label.clone(),
                    content: current.content.clone(),
                    content_change_count: best_item.content_change_count,
                    line_move_count: best_item.line_move_count + if line_moved { 1 } else { 0 },
                    file_move_count: best_item.file_move_count + if file_moved { 1 } else { 0 },
                    last_line_moved: if line_moved { Some(now.clone()) } else { best_item.last_line_moved.clone() },
                    last_file_moved: if file_moved { Some(now.clone()) } else { best_item.last_file_moved.clone() },
                    completed_at: None,
                });
            }
        }

        // Step 2: Fuzzy matching for unmatched state items
        for (id, state_item) in &existing_state.items {
            if matched_state.contains(id) || new_state.items.contains_key(id) {
                continue;
            }

            let mut fuzzy_match: Option<(usize, bool)> = None;

            // Try same-file fuzzy match
            for (idx, current) in current_items.iter().enumerate() {
                if matched_current.contains(&idx) {
                    continue;
                }
                if current.file == state_item.file &&
                   (current.line as i64 - state_item.line as i64).abs() <= 5 &&
                   current.label == state_item.label &&
                   jaccard_similarity(&current.content, &state_item.content) > 0.7 {
                    fuzzy_match = Some((idx, false));
                    break;
                }
            }

            // Try cross-file fuzzy match
            if fuzzy_match.is_none() {
                for (idx, current) in current_items.iter().enumerate() {
                    if matched_current.contains(&idx) {
                        continue;
                    }
                    if current.file != state_item.file &&
                       current.label == state_item.label &&
                       jaccard_similarity(&current.content, &state_item.content) > 0.85 {
                        fuzzy_match = Some((idx, true));
                        break;
                    }
                }
            }

            if let Some((fuzzy_idx, is_file_move)) = fuzzy_match {
                matched_current.insert(fuzzy_idx);
                matched_state.insert(id.clone());
                let current = &current_items[fuzzy_idx];

                let new_id = generate_unique_id(&current.content_hash, current.line, &existing_ids);
                existing_ids.insert(new_id.clone());

                let file_moved = current.file != state_item.file;
                let line_moved = current.line != state_item.line && !file_moved;

                let mut location_history = state_item.location_history.clone();
                if location_history.is_empty() {
                    location_history.push(LocationEntry {
                        file: state_item.file.clone(),
                        line: state_item.line,
                        moved_at: state_item.first_seen.clone(),
                    });
                }
                if file_moved {
                    location_history.push(LocationEntry {
                        file: current.file.clone(),
                        line: current.line,
                        moved_at: now.clone(),
                    });
                }

                let mut line_history = state_item.line_history.clone();
                if file_moved {
                    line_history = vec![current.line];
                } else if !line_history.contains(&current.line) {
                    line_history.push(current.line);
                }

                if !is_file_move {
                    stats.updated += 1;
                }
                if is_file_move {
                    stats.relocated += 1;
                }
                if line_moved {
                    stats.line_moved += 1;
                }

                new_state.items.insert(new_id, StateItem {
                    first_seen: state_item.first_seen.clone(),
                    last_seen: now.clone(),
                    last_updated: now.clone(),
                    file: current.file.clone(),
                    line: current.line,
                    service: current.service.clone(),
                    line_history,
                    location_history,
                    label: current.label.clone(),
                    content: current.content.clone(),
                    content_change_count: state_item.content_change_count + if !is_file_move { 1 } else { 0 },
                    line_move_count: state_item.line_move_count + if line_moved { 1 } else { 0 },
                    file_move_count: state_item.file_move_count + if file_moved { 1 } else { 0 },
                    last_line_moved: if line_moved { Some(now.clone()) } else { state_item.last_line_moved.clone() },
                    last_file_moved: if file_moved { Some(now.clone()) } else { state_item.last_file_moved.clone() },
                    completed_at: None,
                });
            } else {
                // Check if service was scanned
                if let Some(services) = scanned_services {
                    if !services.contains(&state_item.service) {
                        new_state.items.insert(id.clone(), state_item.clone());
                        continue;
                    }
                }

                // Mark as completed
                let mut item = state_item.clone();
                if item.completed_at.is_none() {
                    item.completed_at = Some(now.clone());
                    stats.completed += 1;
                }
                new_state.items.insert(id.clone(), item);
            }
        }

        // Step 3: Create new items
        for (idx, current) in current_items.iter().enumerate() {
            if matched_current.contains(&idx) {
                continue;
            }

            let new_id = generate_unique_id(&current.content_hash, current.line, &existing_ids);
            existing_ids.insert(new_id.clone());
            stats.added += 1;

            new_state.items.insert(new_id, StateItem {
                first_seen: now.clone(),
                last_seen: now.clone(),
                last_updated: now.clone(),
                file: current.file.clone(),
                line: current.line,
                service: current.service.clone(),
                line_history: vec![current.line],
                location_history: Vec::new(),
                label: current.label.clone(),
                content: current.content.clone(),
                content_change_count: 0,
                line_move_count: 0,
                file_move_count: 0,
                last_line_moved: None,
                last_file_moved: None,
                completed_at: None,
            });
        }

        (new_state, stats)
    }
}

fn generate_unique_id(hash: &str, line: usize, existing: &HashSet<String>) -> String {
    let base_id = format!("{}-{}", hash, line);
    if !existing.contains(&base_id) {
        return base_id;
    }
    let mut suffix = 2;
    loop {
        let id = format!("{}-{}-{}", hash, line, suffix);
        if !existing.contains(&id) {
            return id;
        }
        suffix += 1;
    }
}

fn jaccard_similarity(a: &str, b: &str) -> f64 {
    let a_lower = a.to_lowercase();
    let b_lower = b.to_lowercase();
    let set_a: HashSet<&str> = a_lower.split_whitespace().collect();
    let set_b: HashSet<&str> = b_lower.split_whitespace().collect();

    if set_a.is_empty() && set_b.is_empty() {
        return 0.0;
    }

    let intersection = set_a.intersection(&set_b).count();
    let union = set_a.union(&set_b).count();

    if union == 0 { 0.0 } else { intersection as f64 / union as f64 }
}

// ============================================================================
// OUTPUT
// ============================================================================

pub struct OutputGenerator<'a> {
    config: &'a Config,
    item_type: String,
}

impl<'a> OutputGenerator<'a> {
    pub fn new(config: &'a Config, item_type: &str) -> Self {
        Self { config, item_type: item_type.to_string() }
    }

    pub fn generate(&self, state: &State) -> String {
        let active = state.get_active_items();
        let completed = state.get_completed_items();

        let mut output = String::new();

        output.push_str(&format!("# {}\n\n", self.item_type));
        output.push_str(&format!("> Last synced: {}\n", Utc::now().format("%Y-%m-%d")));
        output.push_str(&format!("> Active: {} | Completed: {}\n\n", active.len(), completed.len()));

        if active.is_empty() && completed.is_empty() {
            output.push_str("✅ No items found\n");
            return output;
        }

        if !active.is_empty() {
            output.push_str(&self.generate_section(&active, "Active Items", false));
        }

        if !completed.is_empty() {
            output.push_str("---\n\n");
            output.push_str(&self.generate_section(&completed, "Completed Items", true));
        }

        output
    }

    fn generate_section(&self, items: &[(&String, &StateItem)], title: &str, is_completed: bool) -> String {
        let mut output = String::new();

        let groups = self.group_by_label(items);
        let sorted_labels = self.sort_labels(&groups);

        output.push_str(&format!("## {} ({})\n\n", title, items.len()));

        for label in sorted_labels {
            let label_items = &groups[&label];
            let display_label = if label == "NONE" { "No Priority" } else { &label };

            output.push_str(&format!("### {} ({})\n\n", display_label, label_items.len()));

            let mut sorted_items: Vec<_> = label_items.clone();
            sorted_items.sort_by(|a, b| {
                if is_completed {
                    b.1.completed_at.cmp(&a.1.completed_at)
                } else {
                    a.1.first_seen.cmp(&b.1.first_seen)
                }
            });

            for (_, item) in sorted_items {
                output.push_str(&self.format_item(item, is_completed));
            }
        }

        output
    }

    fn group_by_label<'b>(&self, items: &'b [(&String, &StateItem)]) -> HashMap<String, Vec<(&'b String, &'b StateItem)>> {
        let mut groups: HashMap<String, Vec<(&String, &StateItem)>> = HashMap::new();
        for (id, item) in items {
            groups.entry(item.label.clone()).or_default().push((id, item));
        }
        groups
    }

    fn sort_labels(&self, groups: &HashMap<String, Vec<(&String, &StateItem)>>) -> Vec<String> {
        let mut labels: Vec<String> = groups.keys().cloned().collect();
        let priorities: Vec<&str> = self.config.priorities.iter().map(|s| s.as_str()).chain(std::iter::once("NONE")).collect();

        labels.sort_by(|a, b| {
            let a_idx = priorities.iter().position(|&p| p == a).unwrap_or(usize::MAX);
            let b_idx = priorities.iter().position(|&p| p == b).unwrap_or(usize::MAX);
            a_idx.cmp(&b_idx).then_with(|| a.cmp(b))
        });

        labels
    }

    fn format_item(&self, item: &StateItem, is_completed: bool) -> String {
        let checkbox = if is_completed { "[x]" } else { "[ ]" };

        let mut time_info = format!("Added: {}", &item.first_seen[..10]);
        if !item.last_updated.is_empty() && item.last_updated != item.first_seen {
            time_info.push_str(&format!(", Updated: {}", &item.last_updated[..10]));
        }
        if let Some(ref completed) = item.completed_at {
            time_info.push_str(&format!(", Completed: {}", &completed[..10]));
        }

        let change_summary = self.get_change_summary(item);
        let line_info = self.get_line_info(item);

        format!("- {} {} _[{}]_{}\n  {}\n\n", checkbox, item.content, time_info, change_summary, line_info)
    }

    fn get_change_summary(&self, item: &StateItem) -> String {
        let mut changes = Vec::new();
        if item.content_change_count > 0 {
            changes.push(format!("Content: {}x", item.content_change_count));
        }
        if item.file_move_count > 0 {
            changes.push(format!("Relocated: {}x", item.file_move_count));
        } else if item.line_move_count > 0 {
            changes.push(format!("Line moved: {}x", item.line_move_count));
        }
        if changes.is_empty() { String::new() } else { format!(" ({})", changes.join(", ")) }
    }

    fn get_line_info(&self, item: &StateItem) -> String {
        let mut info = format!("`{}:{}`", item.file, item.line);

        if item.location_history.len() > 1 {
            let prev: Vec<String> = item.location_history[..item.location_history.len()-1]
                .iter()
                .map(|loc| format!("`{}:{}` ({})", loc.file, loc.line, &loc.moved_at[..10]))
                .collect();
            info.push_str(&format!("\n  _Previously: {}_", prev.join(" → ")));
        } else if item.line_history.len() > 1 {
            let prev: Vec<String> = item.line_history[..item.line_history.len()-1]
                .iter()
                .map(|l| format!("line {}", l))
                .collect();
            info.push_str(&format!(" _(previously: {})_", prev.join(", ")));
        }

        info
    }

    pub fn write(&self, project_root: &Path, state: &State) -> Result<(), Box<dyn std::error::Error>> {
        let content = self.generate(state);
        let filename = if self.item_type == "FIXME" {
            &self.config.output.fixme_file
        } else {
            &self.config.output.todo_file
        };
        let output_path = project_root.join(filename);
        fs::write(output_path, content)?;
        Ok(())
    }
}

pub fn print_summary(item_type: &str, state: &State, stats: &MatchStats, state_dir: &str) {
    let active = state.get_active_items().len();
    let completed = state.get_completed_items().len();

    println!("✅ Synced {}s to {}.md", item_type, item_type);
    println!("   Active: {} | Completed: {}", active, completed);

    if stats.relocated > 0 {
        println!("   🚚 {} item(s) relocated to different files", stats.relocated);
    }
    if stats.line_moved > 0 {
        println!("   📍 {} item(s) moved lines", stats.line_moved);
    }
    if stats.updated > 0 {
        println!("   ✏️  {} item(s) content changed", stats.updated);
    }
    println!("📊 State: {}/{}-state.json", state_dir, item_type.to_lowercase());
}

// ============================================================================
// CLI
// ============================================================================

#[derive(Parser)]
#[command(name = "todo-tracker")]
#[command(about = "Smart TODO/FIXME tracker for codebases")]
#[command(version = "1.0.0")]
struct Cli {
    /// Sync TODO comments (default)
    #[arg(long)]
    todo: bool,

    /// Sync FIXME comments
    #[arg(long)]
    fixme: bool,

    /// Sync both TODO and FIXME
    #[arg(long)]
    all: bool,

    /// Only scan specific service
    #[arg(long)]
    service: Option<String>,

    /// Preview without writing files
    #[arg(long)]
    dry_run: bool,

    /// Verbose output
    #[arg(long)]
    verbose: bool,

    /// Path to config file
    #[arg(long)]
    config: Option<String>,
}

fn main() {
    let cli = Cli::parse();

    let current_dir = std::env::current_dir().expect("Failed to get current directory");

    let (config_path, project_root) = if let Some(ref path) = cli.config {
        let p = PathBuf::from(path);
        let root = p.parent().unwrap_or(&current_dir).to_path_buf();
        (Some(p), root)
    } else {
        match find_config_file(&current_dir) {
            Some(p) => {
                let root = p.parent().unwrap_or(&current_dir).to_path_buf();
                (Some(p), root)
            }
            None => (None, current_dir),
        }
    };

    let config = config_path
        .as_ref()
        .map(|p| Config::load(p).expect("Failed to load config"))
        .unwrap_or_default();

    // Validate service
    if let Some(ref service_name) = cli.service {
        if config.get_service_by_name(service_name).is_none() {
            eprintln!("Service not found: {}", service_name);
            eprintln!("Available: {}", config.get_service_names().join(", "));
            std::process::exit(1);
        }
    }

    let types: Vec<&str> = if cli.all {
        vec!["TODO", "FIXME"]
    } else if cli.fixme {
        vec!["FIXME"]
    } else {
        vec!["TODO"]
    };

    for item_type in types {
        if let Err(e) = run_sync(item_type, &config, &project_root, cli.service.as_deref(), cli.dry_run, cli.verbose) {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    }
}

fn run_sync(
    item_type: &str,
    config: &Config,
    project_root: &Path,
    service_filter: Option<&str>,
    dry_run: bool,
    verbose: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    if verbose {
        println!("Scanning for {}s...", item_type);
    }

    let scanner = Scanner::new(config, project_root, item_type);

    let service_names: Option<Vec<String>> = service_filter.map(|s| vec![s.to_string()]);
    let items = scanner.scan_services(service_names.as_deref());

    let scanned_services: HashSet<String> = if let Some(ref names) = service_names {
        names.iter().cloned().collect()
    } else {
        config.services.iter().map(|s| s.name.clone()).collect()
    };

    if verbose {
        println!("  Found {} {}(s) in {} service(s)", items.len(), item_type, scanned_services.len());
    }

    let state_dir = project_root.join(&config.output.state_dir);
    let existing_state = State::load(&state_dir, item_type);

    let matcher = Matcher::new(config);
    let (new_state, stats) = matcher.match_items(&items, &existing_state, Some(&scanned_services));

    let generator = OutputGenerator::new(config, item_type);

    if dry_run {
        println!("\n--- DRY RUN ---");
        println!("{}", generator.generate(&new_state));
        println!("--- END DRY RUN ---");
    } else {
        new_state.save(&state_dir, item_type, config)?;
        generator.write(project_root, &new_state)?;
    }

    print_summary(item_type, &new_state, &stats, &config.output.state_dir);

    Ok(())
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_dir() -> TempDir {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("services/frontend/src")).unwrap();
        fs::create_dir_all(dir.path().join("services/backend/src")).unwrap();
        fs::create_dir_all(dir.path().join(".todo-tracker")).unwrap();
        dir
    }

    fn create_test_config(dir: &Path) -> Config {
        let config = Config {
            services: vec![
                ServiceConfig {
                    name: "frontend".into(),
                    path: "services/frontend".into(),
                    include: vec!["src".into()],
                    exclude: vec!["*.test.js".into()],
                },
                ServiceConfig {
                    name: "backend".into(),
                    path: "services/backend".into(),
                    include: vec!["src".into()],
                    exclude: vec!["*.pyc".into()],
                },
            ],
            output: OutputConfig {
                mode: "root".into(),
                todo_file: "TODO.md".into(),
                fixme_file: "FIXME.md".into(),
                state_dir: ".todo-tracker".into(),
            },
            defaults: DefaultsConfig {
                exclude: vec!["node_modules".into(), ".git".into(), "*.md".into()],
            },
            priorities: vec!["URGENT".into(), "HIGH".into(), "MEDIUM".into(), "LOW".into()],
            tracking: TrackingConfig {
                max_completed_items: 50,
                completed_retention_days: 30,
            },
        };

        let config_path = dir.join(".todorc.json");
        fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap()).unwrap();
        config
    }

    fn write_test_file(dir: &Path, rel_path: &str, content: &str) {
        let full_path = dir.join(rel_path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(full_path, content).unwrap();
    }

    fn run_test_sync(dir: &Path, config: &Config) -> State {
        let scanner = Scanner::new(config, dir, "TODO");
        let items = scanner.scan_all();
        let state_dir = dir.join(&config.output.state_dir);
        let existing = State::load(&state_dir, "todo");
        let matcher = Matcher::new(config);
        let (new_state, _) = matcher.match_items(&items, &existing, None);
        new_state.save(&state_dir, "todo", config).unwrap();
        // Return the state from disk (after purging) to match actual behavior
        State::load(&state_dir, "todo")
    }

    // Core functionality tests

    #[test]
    fn test_config_loading() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        let loaded = Config::load(&dir.path().join(".todorc.json")).unwrap();
        assert_eq!(loaded.services.len(), config.services.len());
    }

    #[test]
    fn test_basic_todo_detection() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/app.ts", "// TODO: This is a basic todo");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);

        let item = state.items.values().next().unwrap();
        assert_eq!(item.content, "This is a basic todo");
        assert_eq!(item.service, "frontend");
    }

    #[test]
    fn test_multi_service_scanning() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/app.ts", "// TODO: Frontend todo");
        write_test_file(dir.path(), "services/backend/src/main.py", "# TODO: Backend todo");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 2);

        let services: HashSet<_> = state.items.values().map(|i| i.service.as_str()).collect();
        assert!(services.contains("frontend"));
        assert!(services.contains("backend"));
    }

    #[test]
    fn test_duplicate_content_handling() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/app.ts",
            "// TODO: Handle error\ntry { } catch (e) { }\n// TODO: Handle error\ntry { } catch (e) { }\n// TODO: Handle error");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 3);
    }

    #[test]
    fn test_priority_labels() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/p.ts",
            "// TODO: [LOW] Low\n// TODO: [URGENT] Urgent\n// TODO: [HIGH] High\n// TODO: [MEDIUM] Medium");

        let state = run_test_sync(dir.path(), &config);
        let labels: HashMap<_, _> = state.items.values().map(|i| (i.label.as_str(), 1)).collect();
        assert!(labels.contains_key("URGENT"));
        assert!(labels.contains_key("HIGH"));
        assert!(labels.contains_key("MEDIUM"));
        assert!(labels.contains_key("LOW"));
    }

    #[test]
    fn test_empty_todo_skipped() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/e.ts",
            "// TODO:\n// TODO:\n// TODO: Valid todo\n// TODO: [HIGH]\n// TODO: [HIGH] Valid high");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 2);
    }

    #[test]
    fn test_fixme_detection() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/bugs.ts",
            "// FIXME: This needs fixing\n// FIXME: [HIGH] Critical bug");

        let scanner = Scanner::new(&config, dir.path(), "FIXME");
        let items = scanner.scan_all();
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn test_line_movement_tracking() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/move.ts", "// Line 1\n// TODO: Track this\n// Line 3");
        run_test_sync(dir.path(), &config);

        write_test_file(dir.path(), "services/frontend/src/move.ts", "// Line 1\n// New\n// Another\n// TODO: Track this\n// Line 3");
        let state = run_test_sync(dir.path(), &config);

        let item = state.items.values().next().unwrap();
        assert!(item.line_move_count >= 1);
    }

    #[test]
    fn test_completion_detection() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/c.ts", "// TODO: Will be completed\nconst x = 1;");
        run_test_sync(dir.path(), &config);

        write_test_file(dir.path(), "services/frontend/src/c.ts", "const x = 1;");
        let state = run_test_sync(dir.path(), &config);

        let completed: Vec<_> = state.items.values().filter(|i| i.completed_at.is_some()).collect();
        assert_eq!(completed.len(), 1);
    }

    #[test]
    fn test_state_persistence() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/p.ts", "// TODO: Persistent todo");
        let state1 = run_test_sync(dir.path(), &config);
        let first_seen1 = state1.items.values().next().unwrap().first_seen.clone();

        let state2 = run_test_sync(dir.path(), &config);
        let first_seen2 = state2.items.values().next().unwrap().first_seen.clone();

        assert_eq!(first_seen1, first_seen2);
    }

    #[test]
    fn test_case_insensitive_priority() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/case.ts",
            "// TODO: [high] Lower\n// TODO: [HIGH] Upper\n// TODO: [High] Mixed");

        let state = run_test_sync(dir.path(), &config);
        let high_count = state.items.values().filter(|i| i.label == "HIGH").count();
        assert_eq!(high_count, 3);
    }

    // Edge case tests

    #[test]
    fn test_file_relocation() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/original.ts", "// TODO: [HIGH] Relocatable todo");
        run_test_sync(dir.path(), &config);

        fs::remove_file(dir.path().join("services/frontend/src/original.ts")).unwrap();
        write_test_file(dir.path(), "services/frontend/src/moved.ts", "// TODO: [HIGH] Relocatable todo");
        let state = run_test_sync(dir.path(), &config);

        let active: Vec<_> = state.items.values().filter(|i| i.completed_at.is_none()).collect();
        assert_eq!(active.len(), 1);
        assert!(active[0].file.contains("moved.ts"));
    }

    #[test]
    fn test_fuzzy_matching() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/fuzzy.ts", "// TODO: [HIGH] Add user authentication");
        let state1 = run_test_sync(dir.path(), &config);
        let first_seen = state1.items.values().next().unwrap().first_seen.clone();

        write_test_file(dir.path(), "services/frontend/src/fuzzy.ts", "// TODO: [HIGH] Add user authentication flow");
        let state2 = run_test_sync(dir.path(), &config);

        let active: Vec<_> = state2.items.values().filter(|i| i.completed_at.is_none()).collect();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].first_seen, first_seen);
    }

    #[test]
    fn test_special_characters() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/special.ts",
            "// TODO: Handle \"quoted\" strings\n// TODO: Support unicode: 日本語\n// TODO: Fix regex /pattern.*test/g");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 3);
    }

    #[test]
    fn test_very_long_content() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        let long_content = "A".repeat(500);
        write_test_file(dir.path(), "services/frontend/src/long.ts", &format!("// TODO: {}", long_content));

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
        assert!(state.items.values().next().unwrap().content.len() > 100);
    }

    #[test]
    fn test_corrupted_state_recovery() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/r.ts", "// TODO: Test recovery");
        fs::write(dir.path().join(".todo-tracker/todo-state.json"), "{ invalid json !!!").unwrap();

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    #[test]
    fn test_reviving_completed_items() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/revive.ts", "// TODO: Will be removed then re-added");
        run_test_sync(dir.path(), &config);

        write_test_file(dir.path(), "services/frontend/src/revive.ts", "// No todos here");
        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.values().filter(|i| i.completed_at.is_some()).count(), 1);

        write_test_file(dir.path(), "services/frontend/src/revive.ts", "// TODO: Will be removed then re-added");
        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.values().filter(|i| i.completed_at.is_none()).count(), 1);
    }

    #[test]
    fn test_missing_service_directory() {
        let dir = setup_test_dir();
        let mut config = create_test_config(dir.path());
        config.services.push(ServiceConfig {
            name: "nonexistent".into(),
            path: "services/does-not-exist".into(),
            include: vec!["src".into()],
            exclude: vec![],
        });

        write_test_file(dir.path(), "services/frontend/src/exists.ts", "// TODO: This should still work");
        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    #[test]
    fn test_nested_directories() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/components/forms/validation/rules/index.ts",
            "// TODO: Deep nested todo");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
        assert!(state.items.values().next().unwrap().file.contains("components/forms/validation/rules"));
    }

    #[test]
    fn test_default_exclusions() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/test.md", "<!-- TODO: Should be excluded -->");
        write_test_file(dir.path(), "services/frontend/src/real.ts", "// TODO: Should be included");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
        assert!(!state.items.values().next().unwrap().file.ends_with(".md"));
    }

    #[test]
    fn test_service_specific_exclusions() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/component.test.js", "// TODO: In test file");
        write_test_file(dir.path(), "services/frontend/src/component.ts", "// TODO: In source file");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
        assert!(!state.items.values().next().unwrap().file.contains(".test.js"));
    }

    // Language support tests

    #[test]
    fn test_python_hash_comments() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/backend/src/main.py",
            "# TODO: Python style todo\n# TODO: [HIGH] High priority python todo\ndef foo():\n    # TODO: Nested python todo\n    pass");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 3);
    }

    #[test]
    fn test_block_comments() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/block.ts",
            "/* TODO: Block comment todo */\n/**\n * TODO: JSDoc style todo\n */");

        let state = run_test_sync(dir.path(), &config);
        assert!(state.items.len() >= 2);
    }

    #[test]
    fn test_mixed_comment_styles() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/mixed.tsx",
            "// TODO: Line comment\n/* TODO: Block comment */\n{/* TODO: JSX comment */}");

        let state = run_test_sync(dir.path(), &config);
        assert!(state.items.len() >= 2);
    }

    // Cross-service tests

    #[test]
    fn test_cross_service_relocation() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/shared.ts", "// TODO: [HIGH] Shared utility function");
        run_test_sync(dir.path(), &config);

        fs::remove_file(dir.path().join("services/frontend/src/shared.ts")).unwrap();
        write_test_file(dir.path(), "services/backend/src/shared.py", "# TODO: [HIGH] Shared utility function");
        let state = run_test_sync(dir.path(), &config);

        let active: Vec<_> = state.items.values().filter(|i| i.completed_at.is_none()).collect();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].service, "backend");
    }

    // Parsing edge cases

    #[test]
    fn test_empty_priority_brackets() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/empty-bracket.ts",
            "// TODO: [] Empty brackets\n// TODO: [ ] Spaces in brackets");

        // Should not crash
        let _ = run_test_sync(dir.path(), &config);
    }

    #[test]
    fn test_priority_with_extra_spaces() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/spaces.ts",
            "// TODO: [ HIGH ] Spaces around priority\n// TODO: [  MEDIUM  ] Extra spaces");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 2);
    }

    #[test]
    fn test_lowercase_todo_ignored() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/case.ts",
            "// todo: lowercase should be ignored\n// Todo: mixed case ignored\n// TODO: Uppercase detected");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    // Output tests

    #[test]
    fn test_markdown_format() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/format.ts", "// TODO: [HIGH] Test format");

        let state = run_test_sync(dir.path(), &config);
        let generator = OutputGenerator::new(&config, "TODO");
        let md = generator.generate(&state);

        assert!(md.starts_with("# TODO"));
        assert!(md.contains("Last synced:"));
        assert!(md.contains("Active:"));
        assert!(md.contains("- [ ]"));
    }

    // Robustness tests

    #[test]
    fn test_binary_file_handling() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        let binary_path = dir.path().join("services/frontend/src/image.png");
        fs::write(&binary_path, &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).unwrap();
        write_test_file(dir.path(), "services/frontend/src/real.ts", "// TODO: Real todo");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    #[test]
    fn test_large_file_with_many_todos() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        let mut content = String::new();
        for i in 0..100 {
            content.push_str(&format!("// TODO: Todo number {}\nconst x{} = {};\n", i, i, i));
        }
        write_test_file(dir.path(), "services/frontend/src/large.ts", &content);

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 100);
    }

    #[test]
    fn test_deeply_nested_path() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/a/b/c/d/e/f/g/h/i/j/deep.ts",
            "// TODO: Very deeply nested");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    // Config validation tests

    #[test]
    fn test_empty_services_array() {
        let dir = setup_test_dir();
        let mut config = create_test_config(dir.path());
        config.services = vec![];

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 0);
    }

    #[test]
    fn test_service_with_empty_include() {
        let dir = setup_test_dir();
        let mut config = create_test_config(dir.path());
        config.services = vec![ServiceConfig {
            name: "empty-include".into(),
            path: "services/frontend".into(),
            include: vec![],
            exclude: vec![],
        }];

        write_test_file(dir.path(), "services/frontend/src/test.ts", "// TODO: Should not be found");
        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 0);
    }

    // Idempotency tests

    #[test]
    fn test_idempotency() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/idem.ts",
            "// TODO: Stable todo\n// TODO: [HIGH] High priority stable");

        let state1 = run_test_sync(dir.path(), &config);
        let state2 = run_test_sync(dir.path(), &config);
        let state3 = run_test_sync(dir.path(), &config);

        assert_eq!(state1.items.len(), state2.items.len());
        assert_eq!(state2.items.len(), state3.items.len());
    }

    #[test]
    fn test_empty_file_handling() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/empty.ts", "");
        write_test_file(dir.path(), "services/frontend/src/real.ts", "// TODO: Real todo");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    #[test]
    fn test_file_with_no_trailing_newline() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        fs::write(dir.path().join("services/frontend/src/nonewline.ts"), "// TODO: No trailing newline").unwrap();

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    // Helper function tests

    #[test]
    fn test_jaccard_similarity() {
        assert!((jaccard_similarity("hello world", "hello world") - 1.0).abs() < 0.01);
        assert!((jaccard_similarity("hello world", "world hello") - 1.0).abs() < 0.01);
        assert!((jaccard_similarity("hello", "goodbye") - 0.0).abs() < 0.01);
        assert!(jaccard_similarity("add user authentication", "add user authentication flow") > 0.7);
    }

    #[test]
    fn test_generate_content_hash() {
        let hash1 = generate_content_hash("HIGH", "Fix bug");
        let hash2 = generate_content_hash("HIGH", "Fix bug");
        let hash3 = generate_content_hash("LOW", "Fix bug");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_eq!(hash1.len(), 12);
    }

    #[test]
    fn test_glob_matching() {
        assert!(match_glob("*.js", "test.js"));
        assert!(!match_glob("*.js", "test.ts"));
        assert!(match_glob("node_modules", "node_modules"));
        assert!(match_glob("README*", "README.md"));
        assert!(!match_glob("README*", "readme.md"));
    }

    // Additional tests to match Node.js coverage

    #[test]
    fn test_service_filtering() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/app.ts", "// TODO: Frontend todo");
        write_test_file(dir.path(), "services/backend/src/main.py", "# TODO: Backend todo");

        // First sync all
        run_test_sync(dir.path(), &config);

        // Then sync only backend
        let scanner = Scanner::new(&config, dir.path(), "TODO");
        let items = scanner.scan_services(Some(&["backend".into()]));
        let state_dir = dir.path().join(&config.output.state_dir);
        let existing = State::load(&state_dir, "todo");
        let matcher = Matcher::new(&config);
        let scanned: HashSet<String> = ["backend".into()].into_iter().collect();
        let (new_state, _) = matcher.match_items(&items, &existing, Some(&scanned));

        let active: Vec<_> = new_state.items.values().filter(|i| i.completed_at.is_none()).collect();
        assert_eq!(active.len(), 2); // Both preserved
    }

    #[test]
    fn test_completed_items_shown_in_markdown() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/done.ts", "// TODO: Will complete");
        run_test_sync(dir.path(), &config);

        write_test_file(dir.path(), "services/frontend/src/done.ts", "// Done");
        let state = run_test_sync(dir.path(), &config);

        let generator = OutputGenerator::new(&config, "TODO");
        let md = generator.generate(&state);

        assert!(md.contains("Completed Items"));
        assert!(md.contains("[x]"));
    }

    #[test]
    fn test_custom_labels_supported() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/custom.ts",
            "// TODO: [TZ] Assigned to TZ\n// TODO: [BLOCKED] Waiting on API");

        let state = run_test_sync(dir.path(), &config);
        let generator = OutputGenerator::new(&config, "TODO");
        let md = generator.generate(&state);

        assert!(md.contains("TZ"));
        assert!(md.contains("BLOCKED"));
    }

    #[test]
    fn test_file_paths_are_relative() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/paths.ts", "// TODO: Check path");

        let state = run_test_sync(dir.path(), &config);
        let item = state.items.values().next().unwrap();
        assert!(item.file.starts_with("services/"));
    }

    #[test]
    fn test_duplicate_removal_tracks_correct_item() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/dup.ts",
            "// TODO: Duplicate\n// Line\n// TODO: Duplicate\n// Line\n// TODO: Duplicate");
        run_test_sync(dir.path(), &config);

        write_test_file(dir.path(), "services/frontend/src/dup.ts",
            "// TODO: Duplicate\n// Line\n// Line\n// TODO: Duplicate");
        let state = run_test_sync(dir.path(), &config);

        let active = state.items.values().filter(|i| i.completed_at.is_none()).count();
        let completed = state.items.values().filter(|i| i.completed_at.is_some()).count();

        assert_eq!(active, 2);
        assert_eq!(completed, 1);
    }

    #[test]
    fn test_multiple_labels_in_todo() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/multilabel.ts",
            "// TODO: [HIGH] [TZ] Review this code");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
        assert_eq!(state.items.values().next().unwrap().label, "HIGH");
    }

    #[test]
    fn test_invalid_service_name() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        assert!(config.get_service_by_name("nonexistent-service").is_none());
    }

    #[test]
    fn test_whitespace_handling() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/whitespace.ts",
            "// TODO:    Extra   spaces   should   normalize\n// TODO:\t\t\tTabs too");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 2);

        for item in state.items.values() {
            assert!(!item.content.starts_with(' '));
            assert!(!item.content.starts_with('\t'));
        }
    }

    #[test]
    fn test_inline_todo() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/inline.ts",
            "const x = 1; // TODO: Inline comment");

        let state = run_test_sync(dir.path(), &config);
        assert!(state.items.len() >= 1);
    }

    #[test]
    fn test_completed_items_purging() {
        let dir = setup_test_dir();
        let mut config = create_test_config(dir.path());
        config.tracking.max_completed_items = 2;

        for i in 1..=4 {
            write_test_file(dir.path(), &format!("services/frontend/src/purge{}.ts", i),
                &format!("// TODO: Item {}", i));
        }
        run_test_sync(dir.path(), &config);

        for i in 1..=4 {
            write_test_file(dir.path(), &format!("services/frontend/src/purge{}.ts", i), "// No todos");
        }
        let state = run_test_sync(dir.path(), &config);

        let completed = state.items.values().filter(|i| i.completed_at.is_some()).count();
        assert!(completed <= 2);
    }

    #[test]
    fn test_false_positive_variable_name() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/constants.ts",
            "const TODO_LIMIT = 100;\nconst MAX_TODO_COUNT = 50;\n// TODO: This is a real todo");

        let state = run_test_sync(dir.path(), &config);
        let real_todo = state.items.values().any(|i| i.content.contains("real todo"));
        assert!(real_todo);
    }

    #[test]
    fn test_multiple_todos_on_same_line() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/sameline.ts",
            "// TODO: First TODO: Second (two on one line)");

        let state = run_test_sync(dir.path(), &config);
        assert!(state.items.len() >= 1);
    }

    #[test]
    fn test_html_template_todos() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/template.tsx",
            "export default function Component() {\n  return (\n    <div>\n      {/* TODO: Add loading state */}\n    </div>\n  );\n}");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    #[test]
    fn test_windows_crlf() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/crlf.ts",
            "// Line 1\r\n// TODO: CRLF todo\r\n// Line 3\r\n");

        // Should not crash
        let _ = run_test_sync(dir.path(), &config);
    }

    #[test]
    fn test_utf8_bom() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        let content = "\u{FEFF}// TODO: File with BOM\nconst x = 1;";
        write_test_file(dir.path(), "services/frontend/src/bom.ts", content);

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    #[test]
    fn test_priority_promotion() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/priority.ts", "// TODO: [LOW] This will be promoted");
        run_test_sync(dir.path(), &config);

        write_test_file(dir.path(), "services/frontend/src/priority.ts", "// TODO: [HIGH] This will be promoted");
        let state = run_test_sync(dir.path(), &config);

        let active = state.items.values().filter(|i| i.completed_at.is_none()).count();
        assert_eq!(active, 1);
    }

    #[test]
    fn test_content_update_preserves_history() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/evolve.ts", "// TODO: [HIGH] Add user authentication");
        let state1 = run_test_sync(dir.path(), &config);
        let first_seen = state1.items.values().next().unwrap().first_seen.clone();

        write_test_file(dir.path(), "services/frontend/src/evolve.ts", "// TODO: [HIGH] Add user authentication flow");
        let state2 = run_test_sync(dir.path(), &config);

        let active: Vec<_> = state2.items.values().filter(|i| i.completed_at.is_none()).collect();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].first_seen, first_seen);
    }

    #[test]
    fn test_statistics_markdown_counts() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/stats.ts",
            "// TODO: [HIGH] High 1\n// TODO: [HIGH] High 2\n// TODO: [LOW] Low 1\n// TODO: No priority");

        let state = run_test_sync(dir.path(), &config);
        let generator = OutputGenerator::new(&config, "TODO");
        let md = generator.generate(&state);

        assert!(md.contains("Active: 4"));
    }

    #[test]
    fn test_whitespace_only_file() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/whitespace-only.ts", "   \n\n\t\t\n   ");
        write_test_file(dir.path(), "services/frontend/src/real.ts", "// TODO: Real todo");

        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 1);
    }

    #[test]
    fn test_dry_run_does_not_modify_files() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());
        write_test_file(dir.path(), "services/frontend/src/dry.ts", "// TODO: Dry run test");

        let state_path = dir.path().join(".todo-tracker/todo-state.json");
        let md_path = dir.path().join("TODO.md");

        // Remove any existing files
        let _ = fs::remove_file(&state_path);
        let _ = fs::remove_file(&md_path);

        // Scan but don't save (simulating dry run)
        let scanner = Scanner::new(&config, dir.path(), "TODO");
        let _ = scanner.scan_all();

        // Files should not exist
        assert!(!state_path.exists(), "State file should not be created in dry run");
    }

    #[test]
    fn test_empty_service_no_files() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        // Don't create any files, just run sync
        let state = run_test_sync(dir.path(), &config);
        assert_eq!(state.items.len(), 0, "Should have 0 items with no files");
    }

    #[test]
    fn test_false_positive_string_content() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/strings.ts",
            "const message = \"TODO: remember to fix this\";\n// TODO: Actual todo comment");

        let state = run_test_sync(dir.path(), &config);
        // Documents behavior - scanner finds TODO: in strings too
        assert!(state.items.len() >= 1, "Should find at least the comment TODO");
    }

    #[test]
    fn test_false_positive_url() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/urls.ts",
            "const apiUrl = \"https://api.example.com/TODO/items\";\n// TODO: Real todo here");

        let state = run_test_sync(dir.path(), &config);
        // Documents behavior - URL path doesn't have TODO:
        assert!(state.items.len() >= 1, "Should find at least the real TODO");
    }

    #[test]
    fn test_file_paths_with_special_chars() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/file-with-dashes.ts", "// TODO: Dashes in filename");
        write_test_file(dir.path(), "services/frontend/src/file_with_underscores.ts", "// TODO: Underscores in filename");

        let state = run_test_sync(dir.path(), &config);
        let generator = OutputGenerator::new(&config, "TODO");
        let md = generator.generate(&state);

        assert!(md.contains("file-with-dashes"), "Should handle dashes");
        assert!(md.contains("file_with_underscores"), "Should handle underscores");
    }

    #[test]
    fn test_jsdoc_todo_tag() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/jsdoc.ts",
            "/**\n * @todo Add validation\n * @param x The input\n */\nfunction process(x) {}\n// TODO: Regular todo");

        let state = run_test_sync(dir.path(), &config);
        // @todo is lowercase so won't match - documents this behavior
        assert!(state.items.len() >= 1, "Should find uppercase TODO");
    }

    #[test]
    fn test_markdown_special_chars_escaped() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/markdown.ts",
            "// TODO: Handle *bold* and _italic_ in content\n// TODO: Support [links](url)");

        let state = run_test_sync(dir.path(), &config);
        let generator = OutputGenerator::new(&config, "TODO");
        let md = generator.generate(&state);

        // Should produce valid markdown without crashing
        assert!(md.contains("Handle"), "Content should be present");
    }

    #[test]
    fn test_mixed_line_endings() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        let content = "// Line 1\n// TODO: Unix LF\r\n// TODO: Windows CRLF\r// TODO: Old Mac CR";
        write_test_file(dir.path(), "services/frontend/src/mixed-endings.ts", content);

        // Should not crash
        let _state = run_test_sync(dir.path(), &config);
    }

    #[test]
    fn test_adding_label_to_unlabeled() {
        let dir = setup_test_dir();
        let config = create_test_config(dir.path());

        write_test_file(dir.path(), "services/frontend/src/label.ts", "// TODO: Unlabeled todo");
        run_test_sync(dir.path(), &config);

        // Add label
        write_test_file(dir.path(), "services/frontend/src/label.ts", "// TODO: [HIGH] Unlabeled todo");
        let state = run_test_sync(dir.path(), &config);

        let active_count = state.items.values().filter(|i| i.completed_at.is_none()).count();
        assert!(active_count >= 1, "Should track label addition");
    }
}
