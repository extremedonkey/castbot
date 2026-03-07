/**
 * Checkbox Group PoC — UI prototype for Type 22 checkbox group in modals.
 *
 * THIS IS A UI MOCKUP ONLY — not a real feature implementation.
 * All buttons and selects are no-ops with placeholder data.
 * See docs/ui/UIPrototyping.md for the prototyping approach.
 */

import { InteractionResponseType } from 'discord-interactions';

const LOCATIONS = [
  { label: 'Fiji', value: 'fiji', description: 'Mamanuca Islands — the classic' },
  { label: 'Borneo', value: 'borneo', description: 'Pulau Tiga — where it all began' },
  { label: 'Australian Outback', value: 'outback', description: 'Herbert River — harsh and iconic' },
  { label: 'Pearl Islands', value: 'pearl_islands', description: 'Panama — pirate vibes' },
  { label: 'Palau', value: 'palau', description: 'Rock Islands — crystal clear water' },
  { label: 'Tocantins', value: 'tocantins', description: 'Brazilian Highlands — scorching heat' },
  { label: 'Samoa', value: 'samoa', description: 'Upolu — lush tropical jungle' },
  { label: 'Gabon', value: 'gabon', description: 'West Africa — unique wildlife' },
  { label: 'China', value: 'china', description: 'Zhelin Reservoir — ancient scenery' },
  { label: 'Marquesas', value: 'marquesas', description: 'Nuku Hiva — remote and volcanic', default: true },
];

export function buildCheckboxModal() {
  return {
    type: 9,
    data: {
      custom_id: 'reeces_radio_mockup_submit',
      title: 'Checkbox Group PoC',
      components: [
        {
          type: 10,
          content: '### Pick your favourite Survivor locations\n\nThis is a proof-of-concept for the Checkbox Group component (Type 22). Select up to 10.'
        },
        {
          type: 18,
          label: 'Survivor Locations',
          description: 'Choose as many as you like (1-10)',
          component: {
            type: 22,
            custom_id: 'checkbox_locations',
            required: true,
            min_values: 1,
            max_values: 10,
            options: LOCATIONS
          }
        }
      ]
    }
  };
}

export function handleCheckboxSubmit(data, res) {
  const { components } = data;
  let selectedValues = [];
  for (const c of components) {
    if (c.type === 22 && c.custom_id === 'checkbox_locations') {
      selectedValues = c.values || [];
      break;
    }
    if (c.components) {
      for (const inner of c.components) {
        if (inner.type === 22 && inner.custom_id === 'checkbox_locations') {
          selectedValues = inner.values || [];
          break;
        }
      }
    }
  }
  const display = selectedValues.length > 0 ? selectedValues.map(v => `**${v}**`).join(', ') : '(nothing)';
  console.log(`☑️ Checkbox PoC: selected [${selectedValues.join(', ')}]`);
  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      components: [{
        type: 17, accent_color: 0x2ECC71,
        components: [
          { type: 10, content: `## ☑️ Checkbox Group PoC Result\n\nYou selected ${selectedValues.length}/10: ${display}` },
          { type: 14 },
          { type: 10, content: `-# Component type 22 · modal submit payload` },
          { type: 14 },
          { type: 1, components: [
            { type: 2, custom_id: 'reeces_radio_mockup', label: 'Try Again', style: 1, emoji: { name: '🔄' } },
            { type: 2, custom_id: 'reeces_stuff', label: "← Reece's Stuff", style: 2 }
          ]}
        ]
      }]
    }
  });
}
