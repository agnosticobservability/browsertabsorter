"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareBy = exports.sortTabs = exports.pinnedScore = exports.hierarchyScore = exports.recencyScore = void 0;
const groupingStrategies_js_1 = require("./groupingStrategies.js");
const logger_js_1 = require("../shared/logger.js");
const utils_js_1 = require("../shared/utils.js");
const recencyScore = (tab) => tab.lastAccessed ?? 0;
exports.recencyScore = recencyScore;
const hierarchyScore = (tab) => (tab.openerTabId !== undefined ? 1 : 0);
exports.hierarchyScore = hierarchyScore;
const pinnedScore = (tab) => (tab.pinned ? 0 : 1);
exports.pinnedScore = pinnedScore;
const sortTabs = (tabs, strategies) => {
    const scoring = strategies.length ? strategies : ["pinned", "recency"];
    return [...tabs].sort((a, b) => {
        for (const strategy of scoring) {
            const diff = (0, exports.compareBy)(strategy, a, b);
            if (diff !== 0)
                return diff;
        }
        return a.id - b.id;
    });
};
exports.sortTabs = sortTabs;
const compareBy = (strategy, a, b) => {
    // 1. Check Custom Strategies for Sorting Rules
    const customStrats = (0, groupingStrategies_js_1.getCustomStrategies)();
    const custom = customStrats.find(s => s.id === strategy);
    if (custom) {
        const sortRulesList = (0, utils_js_1.asArray)(custom.sortingRules);
        if (sortRulesList.length > 0) {
            // Evaluate custom sorting rules in order
            try {
                for (const rule of sortRulesList) {
                    if (!rule)
                        continue;
                    const valA = (0, groupingStrategies_js_1.getFieldValue)(a, rule.field);
                    const valB = (0, groupingStrategies_js_1.getFieldValue)(b, rule.field);
                    let result = 0;
                    if (valA < valB)
                        result = -1;
                    else if (valA > valB)
                        result = 1;
                    if (result !== 0) {
                        return rule.order === 'desc' ? -result : result;
                    }
                }
            }
            catch (e) {
                (0, logger_js_1.logDebug)("Error evaluating custom sorting rules", { error: String(e) });
            }
            // If all rules equal, continue to next strategy (return 0)
            return 0;
        }
    }
    // 2. Built-in or fallback
    switch (strategy) {
        case "recency":
            return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
        case "nesting": // Formerly hierarchy
            return (0, exports.hierarchyScore)(a) - (0, exports.hierarchyScore)(b);
        case "pinned":
            return (0, exports.pinnedScore)(a) - (0, exports.pinnedScore)(b);
        case "title":
            return a.title.localeCompare(b.title);
        case "url":
            return a.url.localeCompare(b.url);
        case "context":
            return (a.context ?? "").localeCompare(b.context ?? "");
        case "domain":
        case "domain_full":
            return (0, groupingStrategies_js_1.domainFromUrl)(a.url).localeCompare((0, groupingStrategies_js_1.domainFromUrl)(b.url));
        case "topic":
            return (0, groupingStrategies_js_1.semanticBucket)(a.title, a.url).localeCompare((0, groupingStrategies_js_1.semanticBucket)(b.title, b.url));
        case "lineage":
            return (0, groupingStrategies_js_1.navigationKey)(a).localeCompare((0, groupingStrategies_js_1.navigationKey)(b));
        case "age":
            // Reverse alphabetical for age buckets (Today < Yesterday), rough approx
            return ((0, groupingStrategies_js_1.groupingKey)(a, "age") || "").localeCompare((0, groupingStrategies_js_1.groupingKey)(b, "age") || "");
        default:
            // Check if it's a generic field first
            const valA = (0, groupingStrategies_js_1.getFieldValue)(a, strategy);
            const valB = (0, groupingStrategies_js_1.getFieldValue)(b, strategy);
            if (valA !== undefined && valB !== undefined) {
                if (valA < valB)
                    return -1;
                if (valA > valB)
                    return 1;
                return 0;
            }
            // Fallback for custom strategies grouping key (if using custom strategy as sorting but no sorting rules defined)
            // or unhandled built-ins
            return ((0, groupingStrategies_js_1.groupingKey)(a, strategy) || "").localeCompare((0, groupingStrategies_js_1.groupingKey)(b, strategy) || "");
    }
};
exports.compareBy = compareBy;
