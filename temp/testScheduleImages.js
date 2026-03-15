/**
 * Test script — generates all 4 schedule visualization concepts
 * Run: node temp/testScheduleImages.js
 */

import fs from 'fs';
import { generateVerticalTimeline, generateMonthCalendar, generateGanttChart, generateCountdownStrip } from '../scheduleImageGenerator.js';

// Use real data from playerData.json
const pd = JSON.parse(fs.readFileSync('playerData.json', 'utf8'));
const guild = pd['1331657596087566398'];

// Find the "Full Review" season (30 players) for best demo
let targetConfig = null;
let targetRounds = null;
for (const [configId, config] of Object.entries(guild.applicationConfigs || {})) {
  if (config.estimatedTotalPlayers && guild.seasonRounds?.[config.seasonId]) {
    const roundCount = Object.keys(guild.seasonRounds[config.seasonId]).length;
    if (!targetConfig || roundCount > Object.keys(targetRounds || {}).length) {
      targetConfig = config;
      targetRounds = guild.seasonRounds[config.seasonId];
    }
  }
}

if (!targetConfig || !targetRounds) {
  console.error('No planner seasons found');
  process.exit(1);
}

const seasonName = targetConfig.seasonName;
const startDate = new Date(targetConfig.estimatedStartDate);
console.log(`Using season: ${seasonName} (${Object.keys(targetRounds).length} rounds, start: ${startDate.toDateString()})`);

async function run() {
  console.log('Generating 4 concepts...\n');

  const t1 = Date.now();
  const buf1 = await generateVerticalTimeline(seasonName, targetRounds, startDate);
  fs.writeFileSync('/tmp/schedule_1_timeline.png', buf1);
  console.log(`1. Vertical Timeline: ${buf1.length} bytes (${Date.now() - t1}ms)`);

  const t2 = Date.now();
  const buf2 = await generateMonthCalendar(seasonName, targetRounds, startDate);
  fs.writeFileSync('/tmp/schedule_2_calendar.png', buf2);
  console.log(`2. Month Calendar:    ${buf2.length} bytes (${Date.now() - t2}ms)`);

  const t3 = Date.now();
  const buf3 = await generateGanttChart(seasonName, targetRounds, startDate);
  fs.writeFileSync('/tmp/schedule_3_gantt.png', buf3);
  console.log(`3. Gantt Chart:       ${buf3.length} bytes (${Date.now() - t3}ms)`);

  const t4 = Date.now();
  const buf4 = await generateCountdownStrip(seasonName, targetRounds, startDate);
  fs.writeFileSync('/tmp/schedule_4_countdown.png', buf4);
  console.log(`4. Countdown Strip:   ${buf4.length} bytes (${Date.now() - t4}ms)`);

  console.log('\nAll images written to /tmp/schedule_*.png');
}

run().catch(console.error);
