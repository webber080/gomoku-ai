/**
 * 五子棋 AI - 重写版
 * 核心：基于棋型模式匹配的准确评估 + 威胁优先级防守 + Alpha-Beta 搜索
 */

const BOARD_SIZE = 15;
const EMPTY = 0;
const BLACK = 1;  // AI 先手
const WHITE = 2;  // 玩家

const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

// 棋型分值
const P = {
    FIVE: 10000000,       // 连五
    LIVE_FOUR: 1000000,   // 活四
    RUSH_FOUR: 100000,    // 冲四
    LIVE_THREE: 50000,    // 活三
    SLEEP_THREE: 5000,    // 眠三
    LIVE_TWO: 1000,       // 活二
    SLEEP_TWO: 100,       // 眠二
};

const WIN = 1000000000;  // 搜索中的胜负分

// 棋型模式表（按优先级从高到低，'1'=我方 '0'=空 '2'=对方或边界）
// 匹配要求：模式必须包含线的中心点（即落子点本身）
const PATTERNS = [
    [P.FIVE,       ['11111']],
    [P.LIVE_FOUR,  ['011110']],
    [P.RUSH_FOUR,  ['11110', '01111', '11011', '10111', '11101']],
    [P.LIVE_THREE, ['011100', '001110', '010110', '011010']],
    [P.SLEEP_THREE,['11100', '00111', '11010', '01011', '10110', '01101', '10011', '11001', '10101']],
    [P.LIVE_TWO,   ['001100', '010100', '001010']],
    [P.SLEEP_TWO,  ['000112', '211000', '011002', '200110']],
];

class GomokuAI {
    constructor() {
        this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY));
        this.moveHistory = [];
        this.maxSearchTime = 5000;
        this.startTime = 0;
        this.forbiddenEnabled = true;  // 黑棋禁手（三三/四四/长连），规则判定见 renju.js
    }

    reset() {
        this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY));
        this.moveHistory = [];
    }

    makeMove(x, y, player) {
        if (this.board[y][x] !== EMPTY) return false;
        this.board[y][x] = player;
        this.moveHistory.push({ x, y, player });
        return true;
    }

    undoMove() {
        if (this.moveHistory.length === 0) return false;
        const move = this.moveHistory.pop();
        this.board[move.y][move.x] = EMPTY;
        return true;
    }

    checkWin(x, y, player) {
        for (const [dx, dy] of DIRECTIONS) {
            let count = 1;
            for (let i = 1; i < 5; i++) {
                const nx = x + dx * i, ny = y + dy * i;
                if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && this.board[ny][nx] === player) count++;
                else break;
            }
            for (let i = 1; i < 5; i++) {
                const nx = x - dx * i, ny = y - dy * i;
                if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && this.board[ny][nx] === player) count++;
                else break;
            }
            if (count >= 5) return true;
        }
        return false;
    }

    /**
     * 取以 (x,y) 为中心某方向的 9 格线，编码为字符串
     * 中心点固定记为 '1'（表示假设我方落子于此），无需真正改棋盘
     */
    lineStr(x, y, dx, dy, player) {
        let s = '';
        for (let i = -4; i <= 4; i++) {
            if (i === 0) { s += '1'; continue; }
            const nx = x + dx * i, ny = y + dy * i;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) { s += '2'; continue; }
            const c = this.board[ny][nx];
            s += (c === EMPTY ? '0' : (c === player ? '1' : '2'));
        }
        return s;
    }

    /**
     * 在一条线上匹配最高优先级的棋型（必须包含中心点）
     */
    matchPattern(str) {
        for (const [score, pats] of PATTERNS) {
            for (const pat of pats) {
                let idx = str.indexOf(pat);
                while (idx !== -1) {
                    if (idx <= 4 && 4 <= idx + pat.length - 1) {
                        return {
                            score: score,
                            four: score >= P.RUSH_FOUR,          // 连五/活四/冲四都算"四级威胁"
                            liveThree: score === P.LIVE_THREE
                        };
                    }
                    idx = str.indexOf(pat, idx + 1);
                }
            }
        }
        return { score: 0, four: false, liveThree: false };
    }

    /**
     * 分析在 (x,y) 落子对 player 的价值（四个方向棋型汇总）
     */
    analyzePoint(x, y, player) {
        let score = 0, fours = 0, liveThrees = 0;
        let five = false, liveFour = false;
        for (const [dx, dy] of DIRECTIONS) {
            const m = this.matchPattern(this.lineStr(x, y, dx, dy, player));
            score += m.score;
            if (m.score === P.FIVE) { five = true; fours++; }
            else if (m.score === P.LIVE_FOUR) { liveFour = true; fours++; }
            else if (m.score === P.RUSH_FOUR) fours++;
            else if (m.score === P.LIVE_THREE) liveThrees++;
        }
        return { score, fours, liveThrees, five, liveFour };
    }

    /**
     * 黑棋落点是否禁手（仅 forbiddenEnabled 时生效）
     */
    isForbidden(x, y, player) {
        if (!this.forbiddenEnabled || player !== BLACK) return false;
        return RenjuRules.checkPoint(this.board, BOARD_SIZE, x, y).forbidden;
    }

    /**
     * 获取候选空位（只取已有棋子附近 2 格内）
     */
    getEmptyPositions(range = 2) {
        const positions = [];
        const visited = new Set();
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (this.board[y][x] !== EMPTY) {
                    for (let dy = -range; dy <= range; dy++) {
                        for (let dx = -range; dx <= range; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const nx = x + dx, ny = y + dy;
                            const key = ny * BOARD_SIZE + nx;
                            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE &&
                                this.board[ny][nx] === EMPTY && !visited.has(key)) {
                                visited.add(key);
                                positions.push({ x: nx, y: ny });
                            }
                        }
                    }
                }
            }
        }
        return positions;
    }

    /**
     * 生成候选点并按"我方进攻 + 对方进攻(防守价值)"综合评分排序
     */
    generateCandidates(player, limit) {
        const opp = player === BLACK ? WHITE : BLACK;
        const positions = this.getEmptyPositions(2);
        const cands = [];
        for (const p of positions) {
            // 黑棋禁手点不进入候选（AI 不会主动犯规）
            if (this.isForbidden(p.x, p.y, player)) continue;
            const me = this.analyzePoint(p.x, p.y, player).score;
            const op = this.analyzePoint(p.x, p.y, opp).score;
            cands.push({ x: p.x, y: p.y, me: me, opp: op, combined: me + op });
        }
        cands.sort((a, b) => b.combined - a.combined);
        return cands.slice(0, limit);
    }

    /**
     * 全盘评估（五连窗口扫描，从 player 视角，正分有利）
     */
    evaluateBoard(player) {
        const val = [0, 1, 12, 150, 2500, 1000000];  // 窗口内同色棋子数 -> 分值
        let score = 0;
        const check = (x, y, dx, dy) => {
            let mine = 0, theirs = 0;
            for (let i = 0; i < 5; i++) {
                const c = this.board[y + dy * i][x + dx * i];
                if (c === player) mine++;
                else if (c !== EMPTY) theirs++;
            }
            if (mine > 0 && theirs > 0) return;
            if (mine > 0) score += val[mine];
            else if (theirs > 0) score -= val[theirs];
        };
        for (let y = 0; y < BOARD_SIZE; y++)
            for (let x = 0; x <= BOARD_SIZE - 5; x++) check(x, y, 1, 0);
        for (let x = 0; x < BOARD_SIZE; x++)
            for (let y = 0; y <= BOARD_SIZE - 5; y++) check(x, y, 0, 1);
        for (let y = 0; y <= BOARD_SIZE - 5; y++)
            for (let x = 0; x <= BOARD_SIZE - 5; x++) check(x, y, 1, 1);
        for (let y = 4; y < BOARD_SIZE; y++)
            for (let x = 0; x <= BOARD_SIZE - 5; x++) check(x, y, 1, -1);
        return score;
    }

    /**
     * 主入口：威胁优先级 + 搜索
     * 返回 {x, y, reason} —— reason 是给新手看的走法解释
     */
    getBestMove(player) {
        this.startTime = Date.now();

        // 第一步：天元
        if (this.moveHistory.length === 0) return { x: 7, y: 7, reason: '开局占天元（棋盘中心），四方发展空间最大' };

        const opp = player === BLACK ? WHITE : BLACK;
        const cands = this.generateCandidates(player, 24);
        if (cands.length === 0) return null;

        // 1. 我能成五 -> 直接赢
        for (const c of cands) {
            if (this.analyzePoint(c.x, c.y, player).five) {
                return { ...c, reason: '五连！直接获胜' };
            }
        }
        // 2. 对方能成五 -> 必堵
        const oppFives = cands.filter(c => this.analyzePoint(c.x, c.y, opp).five);
        if (oppFives.length > 0) {
            oppFives.sort((a, b) => b.combined - a.combined);
            return { ...oppFives[0], reason: '紧急防守：对方下一手就能五连，必须堵住' };
        }
        // 3. 我能成活四或双冲四
        for (const c of cands) {
            if (this.isForbidden(c.x, c.y, player)) continue;  // 黑棋双冲四属四四禁手
            const a = this.analyzePoint(c.x, c.y, player);
            if (a.liveFour) {
                return { ...c, reason: '做出活四（两头都能成五），对方已防不住' };
            }
            if (a.fours >= 2) {
                return { ...c, reason: '双冲四：两个点都能成五，对方只能堵一头' };
            }
        }
        // 4. 对方能成活四/双冲四 -> 必堵
        const oppLf = cands.filter(c => {
            const a = this.analyzePoint(c.x, c.y, opp);
            return a.liveFour || a.fours >= 2;
        });
        if (oppLf.length > 0) {
            oppLf.sort((a, b) => b.combined - a.combined);
            return { ...oppLf[0], reason: '紧急防守：对方即将形成活四/双冲四，先堵住要害' };
        }
        // 5. 我能成冲四+活三
        for (const c of cands) {
            if (this.isForbidden(c.x, c.y, player)) continue;  // 四四/三三组合禁手点不可走
            const a = this.analyzePoint(c.x, c.y, player);
            if (a.fours >= 1 && a.liveThrees >= 1) {
                return { ...c, reason: '冲四+活三双重威胁：先冲四逼对方应对，再做活四获胜' };
            }
        }
        // 6. 对方能成冲四+活三或双活三 -> 必堵
        const oppDouble = cands.filter(c => {
            const a = this.analyzePoint(c.x, c.y, opp);
            return (a.fours >= 1 && a.liveThrees >= 1) || a.liveThrees >= 2;
        });
        if (oppDouble.length > 0) {
            oppDouble.sort((a, b) => b.combined - a.combined);
            return { ...oppDouble[0], reason: '防守要害：对方即将形成双活三或四三威胁，必须打断' };
        }
        // 7. 我能成双活三
        for (const c of cands) {
            if (this.isForbidden(c.x, c.y, player)) continue;  // 黑棋双活三属三三禁手
            const a = this.analyzePoint(c.x, c.y, player);
            if (a.liveThrees >= 2) {
                return { ...c, reason: '双活三：两个方向同时进攻，对方顾此失彼' };
            }
        }

        // 8. 迭代加深 Alpha-Beta 搜索
        let best = null;
        for (let depth = 2; depth <= 6; depth += 2) {
            if (Date.now() - this.startTime > this.maxSearchTime * 0.7) break;
            const mv = this.searchRoot(player, depth);
            if (mv) best = mv;
        }
        if (best) {
            // 给搜索结果生成解释：看这手棋对双方的价值构成
            const a = this.analyzePoint(best.x, best.y, player);
            let detail;
            if (a.liveThrees >= 1) detail = '构建活三，形成连续进攻的态势';
            else if (a.score >= P.LIVE_TWO * 2) detail = '多点开花，为后续进攻蓄力';
            else detail = '攻守平衡：既延伸己方棋型，也压缩对方空间';
            return { ...best, reason: detail };
        }
        return { ...cands[0], reason: '攻守平衡的一手' };
    }

    /**
     * 搜索根节点：返回最佳走法
     */
    searchRoot(player, depth) {
        const cands = this.generateCandidates(player, 14);
        if (cands.length === 0) return null;
        let bestMove = cands[0];
        let bestScore = -Infinity;
        let alpha = -Infinity;
        const beta = Infinity;

        for (const c of cands) {
            if (Date.now() - this.startTime > this.maxSearchTime) break;
            this.board[c.y][c.x] = player;
            let score;
            if (this.checkWin(c.x, c.y, player)) {
                score = WIN;
            } else {
                score = this.minimax(depth - 1, alpha, beta,
                    player === BLACK ? WHITE : BLACK, player, depth - 1);
            }
            this.board[c.y][c.x] = EMPTY;

            if (score > bestScore) {
                bestScore = score;
                bestMove = c;
            }
            alpha = Math.max(alpha, score);
        }
        return bestMove;
    }

    /**
     * Alpha-Beta 极大极小搜索
     */
    minimax(depth, alpha, beta, toMove, root, plyLeft) {
        if (Date.now() - this.startTime > this.maxSearchTime) return this.evaluateBoard(root);
        if (depth === 0) return this.evaluateBoard(root);

        const cands = this.generateCandidates(toMove, 12);
        if (cands.length === 0) return this.evaluateBoard(root);

        const maximizing = toMove === root;
        let best = maximizing ? -Infinity : Infinity;

        for (const c of cands) {
            this.board[c.y][c.x] = toMove;
            let score;
            if (this.checkWin(c.x, c.y, toMove)) {
                // 越快获胜分越高
                score = maximizing ? WIN - (10 - plyLeft) : -(WIN - (10 - plyLeft));
            } else {
                score = this.minimax(depth - 1, alpha, beta,
                    toMove === BLACK ? WHITE : BLACK, root, plyLeft - 1);
            }
            this.board[c.y][c.x] = EMPTY;

            if (maximizing) {
                best = Math.max(best, score);
                alpha = Math.max(alpha, score);
            } else {
                best = Math.min(best, score);
                beta = Math.min(beta, score);
            }
            if (beta <= alpha) break;
        }
        return best;
    }

    /**
     * 威胁点列表（供分析面板用）
     */
    getThreatPoints(player) {
        const threats = [];
        for (const p of this.getEmptyPositions(2)) {
            const a = this.analyzePoint(p.x, p.y, player);
            if (a.score >= P.LIVE_THREE) {
                threats.push({
                    x: p.x, y: p.y, score: a.score,
                    type: a.five ? '连五' : a.liveFour ? '活四' : a.fours >= 1 ? '冲四' : '活三'
                });
            }
        }
        threats.sort((a, b) => b.score - a.score);
        return threats.slice(0, 10);
    }

    /**
     * 模拟未来数步，判断是否存在必胜路径（供分析面板用）
     */
    analyzeWinPath(player) {
        const savedTime = this.maxSearchTime;
        this.maxSearchTime = 600;  // 模拟时用短思考时间
        const savedBoard = this.board;
        const savedHistory = this.moveHistory;
        this.board = savedBoard.map(r => r.slice());
        this.moveHistory = savedHistory.slice();

        const steps = [];
        let canWin = false;
        for (let i = 0; i < 6; i++) {
            const mv = this.getBestMove(player);
            if (!mv) break;
            this.makeMove(mv.x, mv.y, player);
            steps.push({ step: steps.length + 1, x: mv.x, y: mv.y, player: player });
            if (this.checkWin(mv.x, mv.y, player)) { canWin = true; break; }

            const opp = player === BLACK ? WHITE : BLACK;
            const om = this.getBestMove(opp);
            if (!om) break;
            this.makeMove(om.x, om.y, opp);
            if (this.checkWin(om.x, om.y, opp)) break;
        }

        this.board = savedBoard;
        this.moveHistory = savedHistory;
        this.maxSearchTime = savedTime;
        return { canWin, steps };
    }
}

// 导出（Node 环境测试用；Worker 中通过 importScripts 加载为全局）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GomokuAI;
}
