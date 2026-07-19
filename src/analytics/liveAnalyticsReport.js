/**
 * Live Analytics report builder — renders recent analytics-log activity as
 * Discord-ready markdown chunks. Extracted verbatim from the prod_live_analytics
 * handler in app.js (router, not processor — CLAUDE.md golden rule).
 *
 * NOTE: generateLiveAnalyticsChunks tail-reads the analytics log (bounded, see
 * LIVE_TAIL_MAX_BYTES) — callers should still run a memory pre-flight first
 * (utils/memoryGuard.js, incident 06).
 */

import { getLogFilePath } from './analyticsLogger.js';
import { readFileTail } from '../../utils/fileTail.js';

// Bounded tail-read budget (incident 06): the 1-day view needs recent lines only.
// 2MB ≈ 4× the busiest day observed (Jul 2026, two live safari seasons ≈ 500KB/day).
const LIVE_TAIL_MAX_BYTES = 2 * 1024 * 1024;

// Default buttons to filter out (same as liveAnalytics.js)
const DEFAULT_FILTERED_BUTTONS = [
  'disabled_',
  'castlist2_nav_disabled',
];

/**
 * Format an analytics log line with Markdown. Exported for tests.
 * Parse format: [8:33AM] Thu 19 Jun 25 | User (username) in Server Name (1234567890) | ACTION_TYPE | details
 */
export function formatAnalyticsLine(line) {
  const match = line.match(/^(\[[\d:APM]+\]\s+\w{3}\s+\d{1,2}\s+\w{3}\s+\d{2})\s+\|\s+(.+?)\s+in\s+(.+?)\s+\((\d+)\)\s+\|\s+([\w_]+)\s+\|\s+(.+)$/);

  if (!match) {
    return line; // Return original if parsing fails
  }

  const [, timestamp, user, serverName, serverId, actionType, details] = match;

  // Format components with Markdown
  const formattedUser = `**\`${user}\`**`;
  const formattedServer = `__\`${serverName}\`__`;

  // Format the action details based on action type
  let formattedDetails;
  if (actionType === 'SLASH_COMMAND') {
    // Bold the entire command for slash commands (e.g., **/menu**)
    formattedDetails = `**${details}**`;
  } else if (actionType === 'BUTTON_CLICK') {
    // For button clicks, bold just the button name (first part before parentheses)
    const buttonMatch = details.match(/^(.+?)\s+\((.+)\)$/);
    if (buttonMatch) {
      const [, buttonName, buttonId] = buttonMatch;
      formattedDetails = `**${buttonName}** (${buttonId})`;
    } else {
      // Fallback if no parentheses found, bold the whole thing
      formattedDetails = `**${details}**`;
    }
  } else {
    // For other action types, keep details as-is
    formattedDetails = details;
  }

  return `${timestamp} | ${formattedUser} in ${formattedServer} (${serverId}) | ${actionType} | ${formattedDetails}`;
}

function shouldFilterOut(logLine, filterPatterns) {
  if (!filterPatterns || filterPatterns.length === 0) return false;
  return filterPatterns.some(pattern => logLine.includes(pattern));
}

/**
 * True when the log line's [time] Day DD Mon YY stamp falls within the last `days`
 * days (unparseable lines pass through). Exported for tests.
 */
export function isWithinRecentDays(logLine, days) {
  if (!days) return true;

  // Match format: [8:18AM] Thu 19 Jun 25
  const timestampMatch = logLine.match(/^\[(\d{1,2}:\d{2}[AP]M)\] (\w{3}) (\d{1,2}) (\w{3}) (\d{2})/);
  if (!timestampMatch) return true;

  const [, time, dayName, day, month, year] = timestampMatch;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = months.indexOf(month);

  if (monthIndex === -1) return true;

  const logDate = new Date(2000 + parseInt(year), monthIndex, parseInt(day));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return logDate >= cutoffDate;
}

/**
 * Build the report body from raw log content. Pure — exported for tests.
 */
export function buildLiveAnalyticsOutput(logContent, days = 1) {
  let analyticsOutput = `🔴 LIVE ANALYTICS - Last ${days} Day${days === 1 ? '' : 's'}\n`;
  analyticsOutput += '═'.repeat(50) + '\n\n';

  if (logContent === null) {
    analyticsOutput += '📊 No analytics data found yet.\n';
    analyticsOutput += 'Use CastBot to generate some interactions!';
    return analyticsOutput;
  }

  const lines = logContent.split('\n').filter(line => line.trim());
  let displayedCount = 0;

  lines.forEach(line => {
    // Check if line matches format: [8:18AM] Thu 19 Jun 25 | ...
    if (line.match(/^\[\d{1,2}:\d{2}[AP]M\]/)) {
      if (!shouldFilterOut(line, DEFAULT_FILTERED_BUTTONS) && isWithinRecentDays(line, days)) {
        // Parse and format the log line with Markdown
        const formattedLine = formatAnalyticsLine(line);
        analyticsOutput += `* ${formattedLine}\n`;
        displayedCount++;
      }
    }
  });

  if (displayedCount === 0) {
    analyticsOutput += `💡 No interactions found in the last ${days} day${days === 1 ? '' : 's'}.\n`;
    analyticsOutput += 'Try running CastBot commands to generate data!';
  } else {
    analyticsOutput += '\n' + '═'.repeat(50) + '\n';
    analyticsOutput += `📊 Displayed ${displayedCount} interactions from last ${days} day${days === 1 ? '' : 's'}`;
  }

  return analyticsOutput;
}

/**
 * Split report text into Discord-safe chunks, breaking at newlines where possible.
 * Pure — exported for tests.
 */
export function chunkOutput(formattedOutput, maxLength = 1900) {
  const chunks = [];

  if (formattedOutput.length <= maxLength) {
    chunks.push(formattedOutput);
  } else {
    let remaining = formattedOutput;
    while (remaining.length > 0) {
      let chunk = remaining.substring(0, maxLength);
      // Try to break at a newline
      const lastNewline = chunk.lastIndexOf('\n');
      if (lastNewline > maxLength * 0.8) {
        chunk = remaining.substring(0, lastNewline);
        remaining = remaining.substring(lastNewline + 1);
      } else {
        remaining = remaining.substring(maxLength);
      }
      chunks.push(chunk);
    }
  }

  return chunks;
}

/**
 * Read the analytics log tail and return the last-N-days report as Discord message chunks.
 * Bounded read (LIVE_TAIL_MAX_BYTES) — still run checkExpensiveOpHeadroom() before calling.
 */
export async function generateLiveAnalyticsChunks(days = 1) {
  const tail = await readFileTail(getLogFilePath(), LIVE_TAIL_MAX_BYTES);
  if (tail?.truncated) {
    console.log(`🔴 Live analytics: tail-read last ${(tail.text.length / 1048576).toFixed(1)}MB of ${(tail.fileSize / 1048576).toFixed(1)}MB log`);
  }
  return chunkOutput(buildLiveAnalyticsOutput(tail ? tail.text : null, days).trim());
}
