// renju.js 单元测试：node tests/test_renju.js
const R = require('../gomoku-ai/renju.js');
const S = 15;
let pass = 0, fail = 0;

function mkBoard(stones) {
    const b = Array(S).fill(null).map(() => Array(S).fill(0));
    for (const [x, y, p] of stones) b[y][x] = p;
    return b;
}
function check(name, stones, px, py, expectForbidden, expectType) {
    const b = mkBoard(stones);
    const r = R.checkPoint(b, S, px, py);
    const ok = r.forbidden === expectForbidden &&
        (!expectForbidden || r.types.includes(expectType));
    if (ok) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name} -> got`, r); }
}

const B = 1, W = 2;

// ---- 长连：横线 11111 落端点成六 ----
check('长连-六连', [[3, 7, B], [4, 7, B], [5, 7, B], [6, 7, B], [7, 7, B]], 2, 7, true, '长连');

// ---- 恰好五连获胜优先（该点同时带双三结构也不禁）----
check('成五优先(带双三)', [[4, 7, B], [5, 7, B], [6, 7, B], [8, 4, B], [8, 5, B], [8, 6, B], [7, 3, B], [6, 2, B]], 7, 7, false);

// ---- 三三：横 011100 + 竖 011100 ----
check('三三禁手', [[4, 7, B], [5, 7, B], [7, 4, B], [7, 5, B]], 7, 7, true, '三三');

// ---- 被堵一头的眠三不算活三，不构成三三 ----
check('眠三不构成三三', [[3, 7, W], [4, 7, B], [5, 7, B], [7, 4, B], [7, 5, B]], 6, 7, false);

// ---- 四四：同一手棋，横成活四 + 竖成冲四 ----
check('四四-活四+冲四', [[5, 7, B], [6, 7, B], [8, 7, B], [7, 4, B], [7, 5, B], [7, 6, B], [7, 3, W]], 7, 7, true, '四四');

// ---- 四四：两个方向各一个冲四 ----
check('四四-异线', [[4, 7, B], [5, 7, B], [6, 7, B], [7, 4, B], [7, 5, B], [7, 6, B]], 7, 7, true, '四四');

// ---- 单冲四合法 ----
check('单冲四合法', [[3, 7, B], [4, 7, B], [5, 7, B]], 6, 7, false);

// ---- 跳三算活三（011010 型）----
check('跳三参与三三', [[4, 7, B], [6, 7, B], [7, 4, B], [7, 5, B]], 7, 7, true, '三三');

// ---- 活四中间落点成五优先 ----
check('活四中间成五', [[3, 7, B], [4, 7, B], [6, 7, B], [7, 7, B]], 5, 7, false);

// ---- 空盘任意点合法 ----
check('空盘合法', [], 7, 7, false);

// ---- 长连：111011 中间空点成 111111 ----
check('长连-中间空点', [[3, 7, B], [4, 7, B], [5, 7, B], [7, 7, B], [8, 7, B], [9, 7, B]], 6, 7, true, '长连');

// ---- 四三合法（冲四+活三）----
check('四三合法', [[4, 7, B], [5, 7, B], [6, 7, B], [7, 4, B], [7, 5, B], [6, 2, B]], 7, 7, false);

// ---- 集成：forbiddenPoints ----
{
    // 黑横五连 3..7：(2,7)/(8,7) 均成长连禁手
    const b = mkBoard([[3, 7, B], [4, 7, B], [5, 7, B], [6, 7, B], [7, 7, B]]);
    const pts = R.forbiddenPoints(b, S);
    const has2 = pts.find(p => p.x === 2 && p.y === 7);
    const has8 = pts.find(p => p.x === 8 && p.y === 7);
    if (has2 && has8) { pass++; console.log('PASS forbiddenPoints-长连两端'); }
    else { fail++; console.log('FAIL forbiddenPoints-长连两端', pts); }
}
{
    // 黑横四连 3..6：(2,7)/(7,7) 都是恰好成五，不得出现在禁手列表
    const b = mkBoard([[3, 7, B], [4, 7, B], [5, 7, B], [6, 7, B]]);
    const pts = R.forbiddenPoints(b, S);
    const bad = pts.find(p => (p.x === 7 || p.x === 2) && p.y === 7);
    if (!bad) { pass++; console.log('PASS forbiddenPoints-成五点不在禁手列表'); }
    else { fail++; console.log('FAIL forbiddenPoints-成五点被误判', bad); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
