/**
 * Web Worker - AI 后台计算
 */

importScripts('renju.js?v=20260928-3');
importScripts('ai.js?v=20260928-3');

self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'init':
            // 初始化 AI
            self.ai = new GomokuAI();
            self.postMessage({ type: 'ready' });
            break;

        case 'setForbidden':
            // 同步禁手开关（默认开）
            self.ai.forbiddenEnabled = !!data.enabled;
            break;

        case 'getMove':
            // 获取最佳走法
            const { board, moveHistory, player } = data;

            // 同步棋盘状态
            self.ai.board = board;
            self.ai.moveHistory = moveHistory;

            // 计算最佳走法
            const startTime = Date.now();
            const move = self.ai.getBestMove(player);
            const thinkTime = Date.now() - startTime;

            self.postMessage({
                type: 'move',
                data: {
                    move: move,
                    thinkTime: thinkTime
                }
            });
            break;

        case 'getHint':
            // 新手提示：帮玩家算一步最佳走法
            const { board: hintBoard, moveHistory: hintHistory, player: hintPlayer } = data;

            self.ai.board = hintBoard;
            self.ai.moveHistory = hintHistory;

            const hintMove = self.ai.getBestMove(hintPlayer);

            self.postMessage({
                type: 'hint',
                data: {
                    move: hintMove
                }
            });
            break;

        case 'getThreats':
            // 获取威胁点
            const { board: threatBoard, moveHistory: threatHistory, player: threatPlayer } = data;

            self.ai.board = threatBoard;
            self.ai.moveHistory = threatHistory;

            const threats = self.ai.getThreatPoints(threatPlayer);

            self.postMessage({
                type: 'threats',
                data: threats
            });
            break;

        case 'analyzeWinPath':
            // 分析必胜路径
            const { board: winBoard, moveHistory: winHistory, player: winPlayer } = data;

            self.ai.board = winBoard;
            self.ai.moveHistory = winHistory;

            const winPath = self.ai.analyzeWinPath(winPlayer);

            self.postMessage({
                type: 'winPath',
                data: winPath
            });
            break;
    }
};
