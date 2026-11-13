'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var Q = require('../src/core/quiz.js');

test('QZ-01 题库结构完整：共 48 题、单选/多选/填空齐全、逐项解析齐备', function () {
  assert.equal(Q.QUIZ_QUESTIONS.length, 48);
  var seen = {};
  var counts = { single: 0, multi: 0, fill: 0 };
  Q.QUIZ_QUESTIONS.forEach(function (q) {
    assert.ok(!seen[q.id], '存在重复题目 ID: ' + q.id);
    seen[q.id] = true;
    assert.ok(['single', 'multi', 'fill'].indexOf(q.type) >= 0, q.id + ' 题型无效');
    counts[q.type]++;
    assert.ok(/第\d+章/.test(q.chapter), q.id + ' 缺少教材章节标注');
    assert.ok(q.stem && q.stem.length >= 10, q.id + ' 题干过短');
    assert.ok(q.explain && q.explain.length >= 15, q.id + ' 解析过短');
    assert.ok(['基础', '进阶', '综合'].indexOf(q.diff) >= 0, q.id + ' 难度枚举无效');
    if (q.type === 'single') {
      assert.ok(Array.isArray(q.options) && q.options.length >= 4, q.id + ' 单选选项数量不足');
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, q.id + ' 单选答案索引越界');
      assert.ok(Array.isArray(q.optionNotes) && q.optionNotes.length === q.options.length, q.id + ' 缺少逐项剖析');
      q.optionNotes.forEach(function (n, idx) {
        assert.ok(typeof n === 'string' && n.length >= 10, q.id + ' 选项 ' + idx + ' 剖析过短');
      });
    } else if (q.type === 'multi') {
      assert.ok(Array.isArray(q.options) && q.options.length >= 4, q.id + ' 多选选项数量不足');
      assert.ok(Array.isArray(q.answer) && q.answer.length >= 2, q.id + ' 多选至少含 2 个正确项');
      q.answer.forEach(function (a) {
        assert.ok(Number.isInteger(a) && a >= 0 && a < q.options.length, q.id + ' 多选答案索引越界');
      });
      assert.ok(Array.isArray(q.optionNotes) && q.optionNotes.length === q.options.length, q.id + ' 多选缺少逐项剖析');
    } else {
      assert.ok(Array.isArray(q.accept) && q.accept.length >= 1, q.id + ' 填空缺少参考可接受答案');
      assert.ok(typeof q.answerText === 'string' && q.answerText.length > 0, q.id + ' 填空缺少标准展示答案');
    }
  });
  assert.equal(counts.single, 28);
  assert.equal(counts.multi, 10);
  assert.equal(counts.fill, 10);
});

test('QZ-02 教材与实验覆盖均衡：基础 8 题 + M1~M8 各 5 题且均含三种题型', function () {
  assert.equal(Q.QUIZ_TOPICS.length, 10);
  var found = Q.quizFilter({ topic: 'found', diff: 'all' });
  assert.equal(found.length, 8);
  ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'].forEach(function (id) {
    var list = Q.quizByExp(id);
    assert.equal(list.length, 5, id + ' 应绑定 5 道随堂题');
    assert.ok(list.some(function (q) { return q.type === 'single'; }), id + ' 需含单选');
    assert.ok(list.some(function (q) { return q.type === 'multi'; }), id + ' 需含多选');
    assert.ok(list.some(function (q) { return q.type === 'fill'; }), id + ' 需含填空');
  });
});

test('QZ-03 quizFilter 支持按主题、难度与题型联合过滤', function () {
  var multiM6 = Q.quizFilter({ topic: 'm6', type: 'multi' });
  assert.equal(multiM6.length, 1);
  assert.equal(multiM6[0].type, 'multi');
  var fills = Q.quizFilter({ type: 'fill' });
  assert.equal(fills.length, 10);
  var adv = Q.quizFilter({ topic: 'all', diff: '综合' });
  assert.ok(adv.length > 0);
  adv.forEach(function (q) { assert.equal(q.diff, '综合'); });
});

test('QZ-04 quizSample 支持确定性抽题且不超出题库长度', function () {
  var s1 = Q.quizSample(Q.QUIZ_QUESTIONS, 10, 42);
  var s2 = Q.quizSample(Q.QUIZ_QUESTIONS, 10, 42);
  assert.equal(s1.length, 10);
  assert.deepEqual(s1.map(function (q) { return q.id; }), s2.map(function (q) { return q.id; }));
  assert.equal(Q.quizSample(Q.QUIZ_QUESTIONS, 999, 1).length, 48);
});

test('QZ-05 quizCheck 与 quizStats 正确判分单选、多选与填空（含全半角容错）', function () {
  var emptyStats = Q.quizStats({}, Q.QUIZ_QUESTIONS);
  assert.equal(emptyStats.total, 48);
  assert.equal(emptyStats.answered, 0);
  assert.equal(emptyStats.accuracy, null);
  assert.equal(emptyStats.progress, 0);

  var m1 = Q.quizByExp('m1');
  var singleQ = m1.filter(function (q) { return q.type === 'single'; })[0];
  var multiQ = m1.filter(function (q) { return q.type === 'multi'; })[0];
  var fillQ = m1.filter(function (q) { return q.type === 'fill'; })[0];

  // 单选对 + 多选全对（乱序也可）+ 多选漏选判错 + 填空全角百分比判对
  assert.equal(Q.quizCheck(multiQ, multiQ.answer.slice().reverse()), true);
  assert.equal(Q.quizCheck(multiQ, [multiQ.answer[0]]), false);
  assert.equal(Q.quizCheck(fillQ, ' ４０％ '), true);
  assert.equal(Q.quizCheck(fillQ, '99%'), false);

  var ans = {};
  ans[singleQ.id] = singleQ.answer;
  ans[multiQ.id] = multiQ.answer.slice();
  ans[fillQ.id] = '错误答案';
  var st = Q.quizStats(ans, m1);
  assert.equal(st.total, 5);
  assert.equal(st.answered, 3);
  assert.equal(st.correct, 2);
  assert.equal(st.wrong, 1);
  assert.deepEqual(st.wrongIds, [fillQ.id]);
});
