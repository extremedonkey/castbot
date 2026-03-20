import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Pure logic replicated from app.js buildQuestionManagementUI ───

function filterRegularQuestions(questions) {
  return questions
    .map((q, i) => ({ question: q, arrayIndex: i }))
    .filter(({ question }) => question.questionType !== 'completion');
}

function findCompletionQuestion(questions) {
  return questions.find(q => q.questionType === 'completion') || null;
}

function calculatePagination(regularCount, currentPage, questionsPerPage = 8) {
  const totalPages = Math.max(1, Math.ceil(regularCount / questionsPerPage));
  const startIndex = currentPage * questionsPerPage;
  const endIndex = Math.min(startIndex + questionsPerPage, regularCount);
  return { totalPages, startIndex, endIndex };
}

function formatPageInfo(regularCount, currentPage, totalPages, questionsPerPage = 8) {
  return regularCount > questionsPerPage
    ? ` (Pg ${currentPage + 1}/${totalPages})`
    : '';
}

function getQuestionDisplay(question) {
  const displayTitle = (question.questionTitle || 'Untitled').substring(0, 80);
  const answerType = question.questionStyle === 2 ? 'Paragraph' : 'Short answer';
  const typeEmoji = question.questionStyle === 2 ? '📄' : '📝';
  return { displayTitle, answerType, typeEmoji };
}

function buildSelectOptions(pageIdx, regularCount, displayTitle, typeEmoji, answerType) {
  const isFirstRegular = pageIdx === 0;
  const isLastRegular = pageIdx === regularCount - 1;
  const qLabel = `Q${pageIdx + 1}`;

  const options = [
    {
      label: `${qLabel}. ${displayTitle}`.substring(0, 100),
      value: 'summary',
      description: answerType,
      emoji: { name: typeEmoji },
      default: true
    },
    { label: 'Edit Question', value: 'edit', emoji: { name: '✏️' } }
  ];

  if (!isFirstRegular) options.push({ label: 'Move Up', value: 'move_up', emoji: { name: '⬆️' } });
  if (!isLastRegular) options.push({ label: 'Move Down', value: 'move_down', emoji: { name: '⬇️' } });

  options.push(
    { label: '───────────────────', value: 'divider' },
    { label: 'Duplicate', value: 'duplicate', emoji: { name: '📋' } },
    { label: 'Delete Question', value: 'delete', emoji: { name: '🗑️' } }
  );

  return options;
}

// ─── Pure logic replicated from app.js showApplicationQuestion ───

function detectQuestionPosition(questionIndex, totalQuestions) {
  return {
    isLastQuestion: questionIndex === totalQuestions - 1,
    isSecondToLast: questionIndex === totalQuestions - 2
  };
}

function formatQuestionContent(isLastQuestion, questionIndex, title, text) {
  return `## ${isLastQuestion ? '' : `Q${questionIndex + 1}. `}${title}\n\n${text}`;
}

function getNavigationProps(isSecondToLast) {
  return {
    label: isSecondToLast ? 'Complete Application' : 'Next Question',
    style: isSecondToLast ? 3 : 2, // Success vs Secondary
    emoji: isSecondToLast ? '✅' : '➡️'
  };
}

function getAccentColor(isLastQuestion) {
  return isLastQuestion ? 0x2ecc71 : 0x3498db;
}

// ─── Pure logic replicated from applicationManager.js ───

function sanitizeChannelName(displayName) {
  return displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .toLowerCase()
    .substring(0, 90);
}

function buildChannelName(channelFormat, displayName) {
  const sanitized = sanitizeChannelName(displayName);
  return channelFormat.replace('%name%', sanitized);
}

function validateChannelFormat(format) {
  return format.includes('%name%');
}

// ─── Pure logic replicated from src/fileImportHandler.js ───

function validateImportQuestions(questions) {
  if (!questions || !Array.isArray(questions)) return { valid: false, error: 'Not an array' };
  if (questions.length === 0) return { valid: false, error: 'Empty array' };
  for (let i = 0; i < questions.length; i++) {
    if (!questions[i].questionTitle || !questions[i].questionText) {
      return { valid: false, error: `Question ${i + 1} missing required fields` };
    }
  }
  return { valid: true };
}

function detectQuestionFormat(importData) {
  return importData.questions || (Array.isArray(importData) ? importData : null);
}

function buildExportQuestion(q) {
  return {
    questionTitle: q.questionTitle,
    questionText: q.questionText,
    questionStyle: q.questionStyle || 2,
    imageURL: q.imageURL || '',
    order: q.order
  };
}

function resolveSeasonName(cfg) {
  return cfg.buttonText || cfg.seasonName || 'Unknown';
}

function insertBeforeCompletion(questions, newQuestion) {
  const completionIdx = questions.findIndex(q => q.questionType === 'completion');
  if (completionIdx >= 0) {
    questions.splice(completionIdx, 0, newQuestion);
  } else {
    questions.push(newQuestion);
  }
  return questions;
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

// ─── Question Filtering ───

describe('filterRegularQuestions — separates completion from regular', () => {
  it('filters out completion questions', () => {
    const questions = [
      { questionTitle: 'Q1', questionType: undefined },
      { questionTitle: 'Q2', questionType: undefined },
      { questionTitle: 'Done', questionType: 'completion' }
    ];
    const result = filterRegularQuestions(questions);
    assert.equal(result.length, 2);
    assert.equal(result[0].question.questionTitle, 'Q1');
    assert.equal(result[1].question.questionTitle, 'Q2');
  });

  it('preserves array indices', () => {
    const questions = [
      { questionTitle: 'Q1' },
      { questionTitle: 'Done', questionType: 'completion' },
      { questionTitle: 'Q2' }
    ];
    const result = filterRegularQuestions(questions);
    assert.equal(result[0].arrayIndex, 0);
    assert.equal(result[1].arrayIndex, 2);
  });

  it('returns all questions when no completion exists', () => {
    const questions = [{ questionTitle: 'Q1' }, { questionTitle: 'Q2' }];
    assert.equal(filterRegularQuestions(questions).length, 2);
  });

  it('handles empty array', () => {
    assert.equal(filterRegularQuestions([]).length, 0);
  });
});

describe('findCompletionQuestion — locates completion type', () => {
  it('finds the completion question', () => {
    const questions = [
      { questionTitle: 'Q1' },
      { questionTitle: 'Thanks!', questionType: 'completion' }
    ];
    assert.equal(findCompletionQuestion(questions).questionTitle, 'Thanks!');
  });

  it('returns null when no completion exists', () => {
    assert.equal(findCompletionQuestion([{ questionTitle: 'Q1' }]), null);
  });

  it('returns null for empty array', () => {
    assert.equal(findCompletionQuestion([]), null);
  });
});

// ─── Pagination ───

describe('calculatePagination — page boundaries', () => {
  it('single page with few questions', () => {
    const { totalPages, startIndex, endIndex } = calculatePagination(3, 0);
    assert.equal(totalPages, 1);
    assert.equal(startIndex, 0);
    assert.equal(endIndex, 3);
  });

  it('multiple pages, first page', () => {
    const { totalPages, startIndex, endIndex } = calculatePagination(20, 0);
    assert.equal(totalPages, 3);
    assert.equal(startIndex, 0);
    assert.equal(endIndex, 8);
  });

  it('multiple pages, middle page', () => {
    const { totalPages, startIndex, endIndex } = calculatePagination(20, 1);
    assert.equal(totalPages, 3);
    assert.equal(startIndex, 8);
    assert.equal(endIndex, 16);
  });

  it('last page with partial results', () => {
    const { totalPages, startIndex, endIndex } = calculatePagination(20, 2);
    assert.equal(totalPages, 3);
    assert.equal(startIndex, 16);
    assert.equal(endIndex, 20);
  });

  it('zero questions returns 1 page', () => {
    const { totalPages, startIndex, endIndex } = calculatePagination(0, 0);
    assert.equal(totalPages, 1);
    assert.equal(startIndex, 0);
    assert.equal(endIndex, 0);
  });

  it('exactly 8 questions is one page', () => {
    const { totalPages } = calculatePagination(8, 0);
    assert.equal(totalPages, 1);
  });

  it('9 questions is two pages', () => {
    const { totalPages } = calculatePagination(9, 0);
    assert.equal(totalPages, 2);
  });
});

describe('formatPageInfo — page indicator string', () => {
  it('shows page info when multi-page', () => {
    assert.equal(formatPageInfo(20, 0, 3), ' (Pg 1/3)');
    assert.equal(formatPageInfo(20, 2, 3), ' (Pg 3/3)');
  });

  it('empty string for single page', () => {
    assert.equal(formatPageInfo(5, 0, 1), '');
  });

  it('empty string for exactly 8 questions', () => {
    assert.equal(formatPageInfo(8, 0, 1), '');
  });
});

// ─── Question Display ───

describe('getQuestionDisplay — title and type formatting', () => {
  it('paragraph question', () => {
    const { displayTitle, answerType, typeEmoji } = getQuestionDisplay({ questionTitle: 'Why?', questionStyle: 2 });
    assert.equal(displayTitle, 'Why?');
    assert.equal(answerType, 'Paragraph');
    assert.equal(typeEmoji, '📄');
  });

  it('short answer question', () => {
    const { answerType, typeEmoji } = getQuestionDisplay({ questionTitle: 'Name', questionStyle: 1 });
    assert.equal(answerType, 'Short answer');
    assert.equal(typeEmoji, '📝');
  });

  it('defaults to Short answer when no style', () => {
    const { answerType } = getQuestionDisplay({ questionTitle: 'Test' });
    assert.equal(answerType, 'Short answer');
  });

  it('truncates long titles to 80 chars', () => {
    const longTitle = 'A'.repeat(120);
    const { displayTitle } = getQuestionDisplay({ questionTitle: longTitle });
    assert.equal(displayTitle.length, 80);
  });

  it('falls back to Untitled for missing title', () => {
    const { displayTitle } = getQuestionDisplay({});
    assert.equal(displayTitle, 'Untitled');
  });
});

// ─── Select Options ───

describe('buildSelectOptions — option list building', () => {
  it('first question has no Move Up', () => {
    const opts = buildSelectOptions(0, 5, 'Test', '📝', 'Short answer');
    assert.ok(!opts.find(o => o.value === 'move_up'));
    assert.ok(opts.find(o => o.value === 'move_down'));
  });

  it('last question has no Move Down', () => {
    const opts = buildSelectOptions(4, 5, 'Test', '📝', 'Short answer');
    assert.ok(opts.find(o => o.value === 'move_up'));
    assert.ok(!opts.find(o => o.value === 'move_down'));
  });

  it('middle question has both Move Up and Down', () => {
    const opts = buildSelectOptions(2, 5, 'Test', '📝', 'Short answer');
    assert.ok(opts.find(o => o.value === 'move_up'));
    assert.ok(opts.find(o => o.value === 'move_down'));
  });

  it('single question has neither Move Up nor Down', () => {
    const opts = buildSelectOptions(0, 1, 'Test', '📝', 'Short answer');
    assert.ok(!opts.find(o => o.value === 'move_up'));
    assert.ok(!opts.find(o => o.value === 'move_down'));
  });

  it('always has summary, edit, divider, duplicate, delete', () => {
    const opts = buildSelectOptions(0, 1, 'Test', '📝', 'Short answer');
    assert.ok(opts.find(o => o.value === 'summary'));
    assert.ok(opts.find(o => o.value === 'edit'));
    assert.ok(opts.find(o => o.value === 'divider'));
    assert.ok(opts.find(o => o.value === 'duplicate'));
    assert.ok(opts.find(o => o.value === 'delete'));
  });

  it('summary label is Q-numbered and truncated to 100 chars', () => {
    const longTitle = 'B'.repeat(120);
    const opts = buildSelectOptions(0, 1, longTitle, '📝', 'Short answer');
    assert.ok(opts[0].label.startsWith('Q1. '));
    assert.ok(opts[0].label.length <= 100);
  });
});

// ─── Player Application Flow ───

describe('detectQuestionPosition — last/second-to-last detection', () => {
  it('last of 5 questions', () => {
    const { isLastQuestion, isSecondToLast } = detectQuestionPosition(4, 5);
    assert.equal(isLastQuestion, true);
    assert.equal(isSecondToLast, false);
  });

  it('second to last of 5 questions', () => {
    const { isLastQuestion, isSecondToLast } = detectQuestionPosition(3, 5);
    assert.equal(isLastQuestion, false);
    assert.equal(isSecondToLast, true);
  });

  it('first of 5 questions', () => {
    const { isLastQuestion, isSecondToLast } = detectQuestionPosition(0, 5);
    assert.equal(isLastQuestion, false);
    assert.equal(isSecondToLast, false);
  });

  it('only question (index 0, total 1)', () => {
    const { isLastQuestion, isSecondToLast } = detectQuestionPosition(0, 1);
    assert.equal(isLastQuestion, true);
    assert.equal(isSecondToLast, false);
  });

  it('two questions — first is second-to-last', () => {
    const { isSecondToLast } = detectQuestionPosition(0, 2);
    assert.equal(isSecondToLast, true);
  });
});

describe('formatQuestionContent — markdown display', () => {
  it('regular question has Q number prefix', () => {
    const content = formatQuestionContent(false, 0, 'Why?', 'Tell us.');
    assert.equal(content, '## Q1. Why?\n\nTell us.');
  });

  it('last question has no Q number prefix', () => {
    const content = formatQuestionContent(true, 4, 'Thanks!', 'Done.');
    assert.equal(content, '## Thanks!\n\nDone.');
  });

  it('Q number increments correctly', () => {
    const content = formatQuestionContent(false, 9, 'Q10', 'Text');
    assert.ok(content.startsWith('## Q10. '));
  });
});

describe('getNavigationProps — button styling', () => {
  it('second to last shows Complete Application (green)', () => {
    const props = getNavigationProps(true);
    assert.equal(props.label, 'Complete Application');
    assert.equal(props.style, 3); // Success
    assert.equal(props.emoji, '✅');
  });

  it('regular shows Next Question (grey)', () => {
    const props = getNavigationProps(false);
    assert.equal(props.label, 'Next Question');
    assert.equal(props.style, 2); // Secondary
    assert.equal(props.emoji, '➡️');
  });
});

describe('getAccentColor — container color', () => {
  it('green for last question', () => {
    assert.equal(getAccentColor(true), 0x2ecc71);
  });

  it('blue for regular questions', () => {
    assert.equal(getAccentColor(false), 0x3498db);
  });
});

// ─── Channel Name Sanitization ───

describe('sanitizeChannelName — name cleaning', () => {
  it('lowercases and removes special chars', () => {
    assert.equal(sanitizeChannelName('ReeceBot'), 'reecebot');
  });

  it('removes accented characters', () => {
    assert.equal(sanitizeChannelName('José'), 'jose');
  });

  it('preserves hyphens and underscores', () => {
    assert.equal(sanitizeChannelName('user-name_1'), 'user-name_1');
  });

  it('removes spaces and special characters', () => {
    assert.equal(sanitizeChannelName('User @#$ Name!'), 'username');
  });

  it('truncates to 90 chars', () => {
    const long = 'a'.repeat(100);
    assert.equal(sanitizeChannelName(long).length, 90);
  });

  it('handles empty string', () => {
    assert.equal(sanitizeChannelName(''), '');
  });

  it('handles emoji-only names', () => {
    assert.equal(sanitizeChannelName('🎮🎯'), '');
  });
});

describe('buildChannelName — format substitution', () => {
  it('replaces %name% with sanitized name', () => {
    assert.equal(buildChannelName('📝%name%-app', 'ReeceBot'), '📝reecebot-app');
  });

  it('handles format with no name placeholder', () => {
    assert.equal(buildChannelName('static-channel', 'User'), 'static-channel');
  });
});

describe('validateChannelFormat — format validation', () => {
  it('valid format with %name%', () => {
    assert.equal(validateChannelFormat('📝%name%-app'), true);
  });

  it('invalid format without %name%', () => {
    assert.equal(validateChannelFormat('static-channel'), false);
  });

  it('empty string is invalid', () => {
    assert.equal(validateChannelFormat(''), false);
  });
});

// ─── Import/Export Logic ───

describe('validateImportQuestions — question array validation', () => {
  it('valid questions array', () => {
    const result = validateImportQuestions([
      { questionTitle: 'Q1', questionText: 'Text 1' },
      { questionTitle: 'Q2', questionText: 'Text 2' }
    ]);
    assert.equal(result.valid, true);
  });

  it('rejects null', () => {
    assert.equal(validateImportQuestions(null).valid, false);
  });

  it('rejects non-array', () => {
    assert.equal(validateImportQuestions('string').valid, false);
  });

  it('rejects empty array', () => {
    assert.equal(validateImportQuestions([]).valid, false);
  });

  it('rejects question missing title', () => {
    const result = validateImportQuestions([{ questionText: 'Text' }]);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Question 1'));
  });

  it('rejects question missing text', () => {
    const result = validateImportQuestions([{ questionTitle: 'Title' }]);
    assert.equal(result.valid, false);
  });

  it('reports correct index for invalid question', () => {
    const result = validateImportQuestions([
      { questionTitle: 'OK', questionText: 'Fine' },
      { questionTitle: 'Bad' }
    ]);
    assert.ok(result.error.includes('Question 2'));
  });
});

describe('detectQuestionFormat — wrapped vs bare array', () => {
  it('extracts from { questions: [...] }', () => {
    const data = { questions: [{ questionTitle: 'Q1', questionText: 'T' }] };
    assert.deepEqual(detectQuestionFormat(data), data.questions);
  });

  it('extracts bare array', () => {
    const arr = [{ questionTitle: 'Q1', questionText: 'T' }];
    assert.deepEqual(detectQuestionFormat(arr), arr);
  });

  it('returns null for invalid data', () => {
    assert.equal(detectQuestionFormat({ noQuestions: true }), null);
  });

  it('returns null for string', () => {
    assert.equal(detectQuestionFormat('invalid'), null);
  });
});

describe('buildExportQuestion — field mapping with defaults', () => {
  it('maps all fields', () => {
    const q = { questionTitle: 'Q1', questionText: 'Text', questionStyle: 1, imageURL: 'http://img', order: 1 };
    const result = buildExportQuestion(q);
    assert.equal(result.questionTitle, 'Q1');
    assert.equal(result.questionStyle, 1);
    assert.equal(result.imageURL, 'http://img');
  });

  it('defaults questionStyle to 2', () => {
    const result = buildExportQuestion({ questionTitle: 'Q', questionText: 'T', order: 1 });
    assert.equal(result.questionStyle, 2);
  });

  it('defaults imageURL to empty string', () => {
    const result = buildExportQuestion({ questionTitle: 'Q', questionText: 'T', order: 1 });
    assert.equal(result.imageURL, '');
  });
});

describe('resolveSeasonName — fallback chain', () => {
  it('prefers buttonText', () => {
    assert.equal(resolveSeasonName({ buttonText: 'Apply', seasonName: 'S1' }), 'Apply');
  });

  it('falls back to seasonName', () => {
    assert.equal(resolveSeasonName({ seasonName: 'S1' }), 'S1');
  });

  it('falls back to Unknown', () => {
    assert.equal(resolveSeasonName({}), 'Unknown');
  });
});

describe('insertBeforeCompletion — insertion ordering', () => {
  it('inserts before completion question', () => {
    const questions = [
      { questionTitle: 'Q1' },
      { questionTitle: 'Done', questionType: 'completion' }
    ];
    insertBeforeCompletion(questions, { questionTitle: 'Q2' });
    assert.equal(questions.length, 3);
    assert.equal(questions[1].questionTitle, 'Q2');
    assert.equal(questions[2].questionType, 'completion');
  });

  it('appends if no completion exists', () => {
    const questions = [{ questionTitle: 'Q1' }];
    insertBeforeCompletion(questions, { questionTitle: 'Q2' });
    assert.equal(questions.length, 2);
    assert.equal(questions[1].questionTitle, 'Q2');
  });

  it('handles empty array with no completion', () => {
    const questions = [];
    insertBeforeCompletion(questions, { questionTitle: 'Q1' });
    assert.equal(questions.length, 1);
  });

  it('inserts at index 0 if completion is first', () => {
    const questions = [{ questionTitle: 'Done', questionType: 'completion' }];
    insertBeforeCompletion(questions, { questionTitle: 'Q1' });
    assert.equal(questions[0].questionTitle, 'Q1');
    assert.equal(questions[1].questionType, 'completion');
  });
});
