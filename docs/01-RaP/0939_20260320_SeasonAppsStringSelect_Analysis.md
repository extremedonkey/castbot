# Season Apps Questions — Button → String Select Migration

> **RaP #0939** | 2026-03-20
> **Status**: Ready to build
> **Related**: [Season Planner UI Prototype](../ui/SeasonPlannerUIPrototype.md), [Action Terminology](0956_20260308_ActionTerminology_Analysis.md)

---

## 1. Problem

The Season Apps "Manage Questions" screen uses 4 buttons per question (Edit, Delete, Move Up, Move Down) in separate ActionRows. With 5 questions per page, that's 20 buttons + 5 ActionRows = 25 components just for questions — plus header, nav, and management buttons. At 22/40 with only 2 questions, it'll hit the 40-component ceiling at ~4-5 questions.

```
Current layout (22 components for 2 questions):
1. Container
  2. TextDisplay (title)
  3. TextDisplay (question text)
  4. ActionRow (Q1 buttons: Edit, Delete, ▲, ▼)
  5-8. Buttons
  9. TextDisplay (Q2)
  10. ActionRow (Q2 buttons)
  11-14. Buttons
  15-18. ActionRow + management buttons
  19-22. ActionRow + nav buttons
```

**Per question cost**: TextDisplay (1) + ActionRow (1) + 4 Buttons (4) = **6 components**
**Max questions before hitting 40**: ~4-5 (with header + nav overhead)

## 2. Solution: String Select Pattern

Replace each question's button row with a single String Select — the same pattern used by the Season Planner round selects and the Action Editor outcome selects.

**Per question cost**: ActionRow (1) + StringSelect (1) = **2 components**
**Max questions per page**: ~15 (with header + nav overhead)

### String Select Structure Per Question

```
[Default] Q1. What is your favorite season? (Short answer)
───────────────────
  ✏️ Edit Question               | Click to modify question text and type
  ▲ Move Up                      | (hidden if first question)
  ▼ Move Down                    | (hidden if last question)
  ─────────────────── (divider)
  🗑️ Delete Question             | Remove this question permanently
```

**Option fields:**

| # | Label | Value | Description | Emoji |
|---|---|---|---|---|
| 1 | `Q{n}. {question text}` (default) | `summary` | `{answer type}` | Type emoji |
| 2 | `Edit Question` | `edit` | `Modify question text and type` | ✏️ |
| 3 | `Move Up` | `move_up` | *(omitted if first)* | ⬆️ |
| 4 | `Move Down` | `move_down` | *(omitted if last)* | ⬇️ |
| 5 | `─────────────────` | `divider` | *(disabled divider)* | — |
| 6 | `Delete Question` | `delete` | `Remove permanently` | 🗑️ |

**Answer type emojis:**
- 📝 Short answer (style 1)
- 📄 Paragraph (style 2)

### custom_id Format

```
question_select_{configId}_{questionIndex}
```

Example: `question_select_config_1760196737532_391415444084490240_0`

## 3. Component Budget

```
New layout (~12 components for 5 questions):
1. Container
  2. TextDisplay (title + season name + page info)
  3. Separator
  4. ActionRow → StringSelect (Q1)
  5. ActionRow → StringSelect (Q2)
  6. ActionRow → StringSelect (Q3)
  7. ActionRow → StringSelect (Q4)
  8. ActionRow → StringSelect (Q5)
  9. Separator
  10. ActionRow (Add Question + Edit Season buttons)
  11. ActionRow (Nav: ← Menu, ◀ Previous, Next ▶)
```

**12 components for 5 questions** vs 22 currently for 2.
**10 questions per page**: ~17 components (well under 40).

Discord limits: max 25 options per String Select, max 5 ActionRows with selects... wait:

**🚨 CRITICAL**: Discord allows max **5 ActionRows** total per message. But we can have selects inside a Container alongside other components. Let me verify...

Actually, the Season Planner already has 11 string selects per page (11 ActionRows) inside a Container and it works at 38/40. ActionRows inside Containers don't share the "5 per message" limit — that's a legacy limit for non-V2 messages. Components V2 counts recursively to 40, not by ActionRow count.

**Verified**: Season Planner uses 11 ActionRows with selects. The 40-component ceiling is the only limit.

## 4. Questions Per Page Calculation

Each question = 2 components (ActionRow + Select).
Fixed overhead = ~7 components (title, separator, add button row, nav row, container).

**Max questions per page** = (40 - 7) / 2 = **16 questions**

Practical recommendation: **10 questions per page** for readability, matching the Season Planner's approach.

## 5. Handler Changes

### Current Handlers
- `season_question_edit_{configId}_{index}` → shows edit modal
- `season_question_delete_{configId}_{index}` → deletes question
- `season_question_up_{configId}_{index}` → moves up
- `season_question_down_{configId}_{index}` → moves down

### New Handler
Single handler: `question_select_{configId}_{index}`

```javascript
} else if (custom_id.startsWith('question_select_')) {
  const selectedValue = req.body.data.values?.[0];
  // Parse configId and index from custom_id

  switch (selectedValue) {
    case 'summary': // No-op, re-render same page
    case 'edit':    // Show edit modal
    case 'move_up': // Swap with previous
    case 'move_down': // Swap with next
    case 'delete':  // Delete question
    case 'divider': // No-op
  }
}
```

## 6. UPDATE_MESSAGE Considerations

Per ComponentsV2.md:
- Button clicks use UPDATE_MESSAGE (type 7) — no flags allowed
- The String Select interaction is also a MESSAGE_COMPONENT (type 3)
- ButtonHandlerFactory with `updateMessage: true` handles this correctly
- No `flags` field in the response — inherits from original message

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| custom_id length >100 chars | Medium | configId can be long. Use index-based parsing like outcome_select |
| String Select 25 option limit | None | Max 6 options per question select |
| Migration of existing button handlers | Low | Old handlers can coexist during transition |
| No "disabled" state for Move Up/Down | Low | Omit the option entirely (first question has no Move Up) |

## 8. Implementation

1. Rewrite `buildQuestionManagementUI` to use string selects
2. Add `question_select_` handler in app.js
3. Route actions to existing edit/delete/move logic
4. Update questions per page from 5 to 10
5. Remove old button handlers (or keep as legacy fallback)
