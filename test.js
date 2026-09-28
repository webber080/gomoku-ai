/**
 * 回归测试：用真实对局棋谱验证新 AI
 * 棋谱中白方在第 22 步 G6 完成斜线五连（G6-H7-I8-J9-K10）
 * 关键失误点：白方第 16 步 J9 后形成活三，黑方第 17 步没堵
 */
const GomokuAI = require('./ai.js');

// 坐标转换：H8 -> (7,7)，字母A-O是列x，数字15-行是y
function toXY(pos) {
    const x = pos.charCodeAt(0) - 65;
    const y = 15 - parseInt(pos.slice(1));
    return { x, y };
}

// 棋谱（用户真实对局）
const game = ['H8','I9','J10','J8','H10','I10','H9','H7','H11','H12',
              'I11','I8','J12','K13','J11','J9','J13','J14','I12','K10','L11'];

function posName(x, y) {
    return String.fromCharCode(65 + x) + (15 - y);
}

let pass = 0, fail = 0;

function test(name, cond, detail) {
    if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ' -> ' + detail : ''}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); }
}

// ---------- 测试 1：白方活三形成后，AI 必须封堵或走更快的必胜着 ----------
console.log('\n[测试1] 重放到第 16 步（白 J9 形成活三 H7-I8-J9），黑方应堵 G6/K10 或走活四必胜 K11');
{
    const ai = new GomokuAI();
    ai.maxSearchTime = 5000;
    for (let i = 0; i < 16; i++) {
        const { x, y } = toXY(game[i]);
        ai.makeMove(x, y, i % 2 === 0 ? 1 : 2);
    }
    // 此时轮到黑方（AI）
    const t0 = Date.now();
    const mv = ai.getBestMove(1);
    const dt = Date.now() - t0;
    console.log(`  AI 选择: ${posName(mv.x, mv.y)}（思考 ${dt}ms）`);

    const isBlock = (mv.x === 6 && mv.y === 9) || (mv.x === 10 && mv.y === 5);   // 堵 G6/K10
    const isWin = (mv.x === 10 && mv.y === 4);                                   // K11 活四必胜
    test('封堵活三（G6/K10）或活四必胜（K11）', isBlock || isWin, `AI走了 ${posName(mv.x, mv.y)}`);

    if (isWin) {
        // 验证 K11 确实形成活四 H11-I11-J11-K11（两端 G11、L11 空）
        ai.makeMove(mv.x, mv.y, 1);
        const a = ai.analyzePoint(10, 4, 1);
        test('K11 确实形成活四（必胜验证）', a.liveFour === true || a.five === true);
    }
    test('思考时间 < 6s', dt < 6000, `${dt}ms`);
}

// ---------- 测试 2：白方活四形成后，AI 必须堵其中一端 ----------
console.log('\n[测试2] 重放到第 20 步（白 K10 形成活四 H7-I8-J9-K10），黑方应堵 G6 或 L11');
{
    const ai = new GomokuAI();
    ai.maxSearchTime = 5000;
    for (let i = 0; i < 20; i++) {
        const { x, y } = toXY(game[i]);
        ai.makeMove(x, y, i % 2 === 0 ? 1 : 2);
    }
    const t0 = Date.now();
    const mv = ai.getBestMove(1);
    const dt = Date.now() - t0;
    console.log(`  AI 选择: ${posName(mv.x, mv.y)}（思考 ${dt}ms）`);
    test('封堵活四端点（G6 或 L11）',
         (mv.x === 6 && mv.y === 9) || (mv.x === 11 && mv.y === 4),
         `AI走了 ${posName(mv.x, mv.y)}`);
}

// ---------- 测试 3：自己能赢时必须直接赢 ----------
console.log('\n[测试3] AI 有四连一端空时，应直接落子成五');
{
    const ai = new GomokuAI();
    ai.maxSearchTime = 3000;
    // 黑：H8,H9,H10,H11 四连，两端 H7/H12 空
    const blacks = [[7,7],[7,6],[7,5],[7,4]];
    blacks.forEach(([x,y]) => ai.makeMove(x, y, 1));
    // 白：随便放两颗
    ai.makeMove(8, 7, 2);
    ai.makeMove(9, 7, 2);
    const mv = ai.getBestMove(1);
    console.log(`  AI 选择: ${posName(mv.x, mv.y)}`);
    test('完成五连（H7 或 H12）',
         (mv.x === 7 && mv.y === 8) || (mv.x === 7 && mv.y === 3),
         `AI走了 ${posName(mv.x, mv.y)}`);
}

// ---------- 测试 4：AI 进攻意识——能成活四时优先进攻 ----------
console.log('\n[测试4] AI 有机会形成活三+冲四双向威胁点时应抓住');
{
    const ai = new GomokuAI();
    ai.maxSearchTime = 3000;
    // 黑：H8, I8 两子；白：J10, K10
    ai.makeMove(7, 7, 1);
    ai.makeMove(8, 7, 1);
    ai.makeMove(9, 5, 2);
    ai.makeMove(10, 5, 2);
    const mv = ai.getBestMove(1);
    console.log(`  AI 选择: ${posName(mv.x, mv.y)}`);
    // 合理走法：围绕 H8-I8 延伸（G8/J8/斜向），不应跑远
    const near = Math.abs(mv.x - 7) <= 3 && Math.abs(mv.y - 7) <= 3;
    test('进攻点在主力附近', near, `AI走了 ${posName(mv.x, mv.y)}`);
}

// ---------- 测试 5：随机完整对局，AI vs 随机白方，AI 应全胜 ----------
console.log('\n[测试5] AI 执黑 vs 随机防守白方，3 局全部获胜');
{
    for (let g = 0; g < 3; g++) {
        const ai = new GomokuAI();
        ai.maxSearchTime = 2000;
        let winner = 0, moves = 0;
        for (let i = 0; i < 60 && !winner; i++) {
            if (i % 2 === 0) {
                const mv = ai.getBestMove(1);
                ai.makeMove(mv.x, mv.y, 1);
                if (ai.checkWin(mv.x, mv.y, 1)) winner = 1;
            } else {
                // 白方：70% 概率贴着黑棋随机下（制造防守压力），30% 完全随机
                const cands = ai.getEmptyPositions(2);
                const mv = cands.length > 0 && Math.random() < 0.7
                    ? cands[Math.floor(Math.random() * cands.length)]
                    : { x: Math.floor(Math.random()*15), y: Math.floor(Math.random()*15) };
                if (ai.board[mv.y][mv.x] !== 0) { i--; continue; }
                ai.makeMove(mv.x, mv.y, 2);
                if (ai.checkWin(mv.x, mv.y, 2)) winner = 2;
            }
            moves++;
        }
        console.log(`  第${g+1}局: ${winner === 1 ? 'AI胜' : winner === 2 ? 'AI负!!' : '60步未分胜负'} (${moves}步)`);
        test(`第${g+1}局 AI 获胜`, winner === 1);
    }
}

console.log(`\n========== 结果: ${pass} 通过, ${fail} 失败 ==========`);
process.exit(fail > 0 ? 1 : 0);
