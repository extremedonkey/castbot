# Data Structure Documentation

## PlayerData.json Structure

1. Server Level (Guild ID)
   - Each server has its own top-level node
   - Example: "1297188286191767603"

2. Server Components
   1. Players
      - Keyed by Discord User ID
      - Contains:
         - age: string
         - emojiCode: string
   2. Tribes
      - Keyed by Discord Role ID (e.g. "1324815211009671170")
      - Each entry contains:
        - emoji: (optional) Emoji displayed in castlist
        - castlist: (optional) Name of the castlist this tribe belongs to
   3. Timezones
      - Keyed by timezone name
      - Contains:
         - roleId: Discord Role ID
         - offset: number (UTC offset)

## Real-time Data
The following data is calculated in real-time and not stored:
- Player tribe membership (from Discord roles)
- Player timezone (from Discord roles)
- Player pronouns (from Discord roles)
- Current time in player's timezone

## Example Structure
```json
{
  "1297188286191767603": {
    "players": {
      "208197633846542336": {
        "age": "21",
        "emojiCode": "<:208197633846542336:1322728046964375572>"
      }
    },
    "tribes": {
      "tribe1": "1324815211009671170",
      "tribe1emoji": "🦞"
    },
    "timezones": {
      "EST": {
        "roleId": "1320094346288300124",
        "offset": -5
      }
    }
  }
}
```

## File Structure Comments
The playerData.json file uses a top-level comment to indicate server IDs:
```json
{
  "/* Server ID */": null,
  "1297188286191767603": {
    // Server data...
  }
}
```
This helps identify Discord guild IDs at a glance while maintaining valid JSON.
