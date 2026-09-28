/**
 * 连珠（Renju）禁手规则 - 仅约束黑棋
 * 三三禁手 / 四四禁手 / 长连禁手；恰好五连不受禁手限制（成五获胜优先）
 * 由页面与 Web Worker 共享加载（经典脚本共享全局词法作用域）
 *
 * 实用版实现：活三判定时校验成活四点不产生长连（一层递归），
 * 不做更深层禁手递归推导，满足休闲对弈精度。
 */
const RenjuRules = (function () {
    const BLACK = 1;
    const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    /**
     * 取以 (x,y) 为中心（视为已落黑子）的整条线，编码为长 15 的字符串
     * '1'=黑 '0'=空 '2'=白/边界，中心下标固定为 7
     */
    function lineStr(board, size, x, y, dx, dy) {
        let s = '';
        for (let i = -7; i <= 7; i++) {
            if (i === 0) { s += '1'; continue; }
            const nx = x + dx * i, ny = y + dy * i;
            if (nx < 0 || nx >= size || ny < 0 || ny >= size) { s += '2'; continue; }
            const c = board[ny][nx];
            s += (c === 0 ? '0' : (c === BLACK ? '1' : '2'));
        }
        return s;
    }

    /** 串上某下标放黑子后，过该点的连续黑子段 */
    function runAt(s, idx) {
        let l = idx, r = idx;
        while (l > 0 && s[l - 1] === '1') l--;
        while (r < s.length - 1 && s[r + 1] === '1') r++;
        return { l, r, len: r - l + 1 };
    }

    /** 单方向分析（该方向已含中心假想黑子） */
    function analyzeDir(s) {
        const run = runAt(s, 7);
        const res = {
            five: run.len === 5,      // 恰好五连
            overline: run.len >= 6,   // 长连（六连及以上）
            liveFour: false,          // 活四（过中心段恰 4 且两端皆空）
            fivePoints: [],           // 可成恰好五连的空点（冲四/活四的成五点）
            liveThree: false          // 活三（存在一手成活四的点）
        };
        if (run.len === 4) {
            const lOpen = run.l > 0 && s[run.l - 1] === '0';
            const rOpen = run.r < s.length - 1 && s[run.r + 1] === '0';
            res.liveFour = lOpen && rOpen;
        }
        for (let i = 0; i < s.length; i++) {
            if (s[i] !== '0') continue;
            const t = runAt(s, i);
            // 成五点必须使"经过中心点"的段恰成五（不含中心的不算本点的四）
            if (t.len === 5 && 7 >= t.l && 7 <= t.r) res.fivePoints.push(i);
        }
        if (run.len >= 1 && run.len <= 3) {
            for (let i = 0; i < s.length; i++) {
                if (s[i] !== '0') continue;
                // 只有紧邻中心段的空点（含跳三的空档）才可能一手成活四
                if (i !== run.l - 1 && i !== run.r + 1) continue;
                const t = s.slice(0, i) + '1' + s.slice(i + 1);
                const nr = runAt(t, 7);
                if (nr.len === 4 && nr.l > 0 && t[nr.l - 1] === '0' &&
                    nr.r < s.length - 1 && t[nr.r + 1] === '0') {
                    res.liveThree = true;
                    break;
                }
            }
        }
        return res;
    }

    /** 单方向 → { five, overline, fours, liveThree }；活四记 1 个四，同线拆分双四按成五点数计 */
    function classifyDir(s) {
        const a = analyzeDir(s);
        const fours = a.liveFour ? 1 : a.fivePoints.length;
        return { five: a.five, overline: a.overline, fours, liveThree: a.liveThree };
    }

    /**
     * 判定黑棋落在空点 (x,y) 是否禁手
     * @returns {{forbidden: boolean, types: string[]}} types ⊆ ['三三','四四','长连']
     */
    function checkPoint(board, size, x, y) {
        if (board[y][x] !== 0) return { forbidden: false, types: [] };
        const dirs = DIRS.map(([dx, dy]) => classifyDir(lineStr(board, size, x, y, dx, dy)));
        // 成五（恰好五连）优先：任何方向成五即获胜，不算禁手
        if (dirs.some(d => d.five)) return { forbidden: false, types: [] };
        if (dirs.some(d => d.overline)) return { forbidden: true, types: ['长连'] };
        const fours = dirs.reduce((n, d) => n + d.fours, 0);
        const threes = dirs.filter(d => d.liveThree).length;
        const types = [];
        if (fours >= 2) types.push('四四');
        if (threes >= 2) types.push('三三');
        return { forbidden: types.length > 0, types };
    }

    /** 全盘黑棋禁手点列表 [{x, y, types}]（带邻近剪枝） */
    function forbiddenPoints(board, size) {
        const list = [];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (board[y][x] !== 0) continue;
                let near = false;
                for (let dy = -2; dy <= 2 && !near; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx] !== 0) {
                            near = true;
                            break;
                        }
                    }
                }
                if (!near) continue;
                const r = checkPoint(board, size, x, y);
                if (r.forbidden) list.push({ x, y, types: r.types });
            }
        }
        return list;
    }

    return { checkPoint, forbiddenPoints };
})();

// Node 环境测试用；浏览器/Worker 中为全局
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RenjuRules;
}
