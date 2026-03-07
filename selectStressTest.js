/**
 * Select Stress Test — paginated string select demo
 * Tests Discord's component limits with maximum string selects per page.
 *
 * 24 total selects across 2 pages (12 per page).
 * Accessible via Reece's Stuff > Select Stress button.
 */

import { countComponents, validateComponentLimit } from './utils.js';

const ALL_SELECT_TOPICS = [
  { id: 'color', placeholder: 'F18 \u2981 Sat 7 Mar \u2981 Marooning \u2981 Challenge 1', options: [{ label: 'Red', value: 'red', emoji: { name: '🔴' } }, { label: 'Blue', value: 'blue', emoji: { name: '🔵' } }, { label: 'Green', value: 'green', emoji: { name: '🟢' } }] },
  { id: 'animal', placeholder: 'Pick an animal', options: [{ label: 'Cat', value: 'cat', emoji: { name: '🐱' } }, { label: 'Dog', value: 'dog', emoji: { name: '🐶' } }, { label: 'Fish', value: 'fish', emoji: { name: '🐟' } }] },
  { id: 'food', placeholder: 'Pick a food', options: [{ label: 'Pizza', value: 'pizza', emoji: { name: '🍕' } }, { label: 'Sushi', value: 'sushi', emoji: { name: '🍣' } }, { label: 'Taco', value: 'taco', emoji: { name: '🌮' } }] },
  { id: 'weather', placeholder: 'Pick weather', options: [{ label: 'Sunny', value: 'sunny', emoji: { name: '☀️' } }, { label: 'Rainy', value: 'rainy', emoji: { name: '🌧️' } }, { label: 'Snowy', value: 'snowy', emoji: { name: '❄️' } }] },
  { id: 'music', placeholder: 'Pick a genre', options: [{ label: 'Rock', value: 'rock', emoji: { name: '🎸' } }, { label: 'Jazz', value: 'jazz', emoji: { name: '🎷' } }, { label: 'Pop', value: 'pop', emoji: { name: '🎤' } }] },
  { id: 'sport', placeholder: 'Pick a sport', options: [{ label: 'Soccer', value: 'soccer', emoji: { name: '⚽' } }, { label: 'Tennis', value: 'tennis', emoji: { name: '🎾' } }, { label: 'Swim', value: 'swim', emoji: { name: '🏊' } }] },
  { id: 'drink', placeholder: 'Pick a drink', options: [{ label: 'Coffee', value: 'coffee', emoji: { name: '☕' } }, { label: 'Tea', value: 'tea', emoji: { name: '🍵' } }, { label: 'Juice', value: 'juice', emoji: { name: '🧃' } }] },
  { id: 'planet', placeholder: 'Pick a planet', options: [{ label: 'Mars', value: 'mars', emoji: { name: '🔴' } }, { label: 'Saturn', value: 'saturn', emoji: { name: '🪐' } }, { label: 'Earth', value: 'earth', emoji: { name: '🌍' } }] },
  { id: 'season', placeholder: 'Pick a season', options: [{ label: 'Spring', value: 'spring', emoji: { name: '🌸' } }, { label: 'Summer', value: 'summer', emoji: { name: '🌞' } }, { label: 'Autumn', value: 'autumn', emoji: { name: '🍂' } }] },
  { id: 'tool', placeholder: 'Pick a tool', options: [{ label: 'Hammer', value: 'hammer', emoji: { name: '🔨' } }, { label: 'Wrench', value: 'wrench', emoji: { name: '🔧' } }, { label: 'Saw', value: 'saw', emoji: { name: '🪚' } }] },
  { id: 'fruit', placeholder: 'Pick a fruit', options: [{ label: 'Apple', value: 'apple', emoji: { name: '🍎' } }, { label: 'Banana', value: 'banana', emoji: { name: '🍌' } }, { label: 'Grape', value: 'grape', emoji: { name: '🍇' } }] },
  { id: 'vehicle', placeholder: 'Pick a vehicle', options: [{ label: 'Car', value: 'car', emoji: { name: '🚗' } }, { label: 'Bike', value: 'bike', emoji: { name: '🚲' } }, { label: 'Boat', value: 'boat', emoji: { name: '⛵' } }] },
  { id: 'flower', placeholder: 'Pick a flower', options: [{ label: 'Rose', value: 'rose', emoji: { name: '🌹' } }, { label: 'Tulip', value: 'tulip', emoji: { name: '🌷' } }, { label: 'Daisy', value: 'daisy', emoji: { name: '🌼' } }] },
  { id: 'gem', placeholder: 'Pick a gem', options: [{ label: 'Diamond', value: 'diamond', emoji: { name: '💎' } }, { label: 'Ruby', value: 'ruby', emoji: { name: '❤️' } }, { label: 'Emerald', value: 'emerald', emoji: { name: '💚' } }] },
  { id: 'element', placeholder: 'Pick an element', options: [{ label: 'Fire', value: 'fire', emoji: { name: '🔥' } }, { label: 'Water', value: 'water', emoji: { name: '💧' } }, { label: 'Wind', value: 'wind', emoji: { name: '💨' } }] },
  { id: 'mood', placeholder: 'Pick a mood', options: [{ label: 'Happy', value: 'happy', emoji: { name: '😊' } }, { label: 'Chill', value: 'chill', emoji: { name: '😎' } }, { label: 'Sleepy', value: 'sleepy', emoji: { name: '😴' } }] },
  { id: 'shape', placeholder: 'Pick a shape', options: [{ label: 'Circle', value: 'circle', emoji: { name: '🔵' } }, { label: 'Square', value: 'square', emoji: { name: '🟧' } }, { label: 'Triangle', value: 'triangle', emoji: { name: '🔺' } }] },
  { id: 'time', placeholder: 'Pick a time', options: [{ label: 'Morning', value: 'morning', emoji: { name: '🌅' } }, { label: 'Noon', value: 'noon', emoji: { name: '☀️' } }, { label: 'Night', value: 'night', emoji: { name: '🌙' } }] },
  { id: 'instrument', placeholder: 'Pick an instrument', options: [{ label: 'Piano', value: 'piano', emoji: { name: '🎹' } }, { label: 'Drums', value: 'drums', emoji: { name: '🥁' } }, { label: 'Violin', value: 'violin', emoji: { name: '🎻' } }] },
  { id: 'biome', placeholder: 'Pick a biome', options: [{ label: 'Forest', value: 'forest', emoji: { name: '🌲' } }, { label: 'Desert', value: 'desert', emoji: { name: '🏜️' } }, { label: 'Ocean', value: 'ocean', emoji: { name: '🌊' } }] },
  { id: 'candy', placeholder: 'Pick a candy', options: [{ label: 'Chocolate', value: 'chocolate', emoji: { name: '🍫' } }, { label: 'Gummy', value: 'gummy', emoji: { name: '🍬' } }, { label: 'Lollipop', value: 'lollipop', emoji: { name: '🍭' } }] },
  { id: 'transport', placeholder: 'Pick transport', options: [{ label: 'Train', value: 'train', emoji: { name: '🚂' } }, { label: 'Plane', value: 'plane', emoji: { name: '✈️' } }, { label: 'Rocket', value: 'rocket', emoji: { name: '🚀' } }] },
  { id: 'building', placeholder: 'Pick a building', options: [{ label: 'Castle', value: 'castle', emoji: { name: '🏰' } }, { label: 'House', value: 'house', emoji: { name: '🏠' } }, { label: 'Tower', value: 'tower', emoji: { name: '🗼' } }] },
  { id: 'flag', placeholder: 'Pick a flag', options: [{ label: 'Pirate', value: 'pirate', emoji: { name: '🏴‍☠️' } }, { label: 'Rainbow', value: 'rainbow', emoji: { name: '🏳️‍🌈' } }, { label: 'Checkered', value: 'checkered', emoji: { name: '🏁' } }] },
];

const SELECTS_PER_PAGE = 12;
const TOTAL_PAGES = Math.ceil(ALL_SELECT_TOPICS.length / SELECTS_PER_PAGE);

/**
 * Build a single page of the select stress test
 * @param {number} page - 0-indexed page number
 * @returns {Object} Components V2 response
 */
export function buildSelectStressPage(page = 0) {
  if (page < 0 || page >= TOTAL_PAGES) page = 0;

  const startIndex = page * SELECTS_PER_PAGE;
  const pageTopics = ALL_SELECT_TOPICS.slice(startIndex, startIndex + SELECTS_PER_PAGE);

  const selectRows = pageTopics.map((topic, i) => ({
    type: 1,
    components: [{
      type: 3,
      custom_id: `stress_select_${topic.id}`,
      placeholder: `${startIndex + i + 1}. ${topic.placeholder}`,
      options: topic.options
    }]
  }));

  const navButtons = [
    { type: 2, custom_id: 'reeces_stuff', label: "← Reece's Stuff", style: 2 },
    { type: 2, custom_id: 'stress_page_0', label: '◀ Previous', style: 2, disabled: page === 0 },
    { type: 2, custom_id: `stress_page_${page + 1}`, label: 'Next ▶', style: 2, disabled: page >= TOTAL_PAGES - 1 },
  ];

  const container = {
    type: 17, accent_color: 0x9b59b6,
    components: [
      { type: 10, content: `## 📝 Season Planner | S12: Sacred Band of Thebes` },
      { type: 14 },
      { type: 10, content: `> **\`📋 Page ${page + 1}/${TOTAL_PAGES} — Selects ${startIndex + 1}-${startIndex + pageTopics.length} of ${ALL_SELECT_TOPICS.length}\`**` },
      ...selectRows,
      { type: 14 },
      { type: 1, components: navButtons },
    ]
  };

  countComponents([container], { verbosity: "full", label: `Select Stress Test (Page ${page + 1})` });
  validateComponentLimit([container], `Select Stress Test (Page ${page + 1})`);

  return { components: [container] };
}
