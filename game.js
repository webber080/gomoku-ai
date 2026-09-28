/**
 * 五子棋游戏逻辑 - Web Worker + 四模式版本
 * 模式：teaching(AI先手+教学) / ai-first(AI先手) / player-first(玩家先手) / pvp(双人对战)
 */

class GomokuGame {
    constructor() {
        this.canvas = document.getElementById('board');
        this.ctx = this.canvas.getContext('2d');

        // 本地棋盘状态（用于渲染）
        this.board = Array(15).fill(null).map(() => Array(15).fill(0));
        this.moveHistory = [];

        this.cellSize = 40;
        this.padding = 20;
        this.boardSize = 15;

        this.mode = 'ai-first';  // 默认 AI 先手模式
        this.currentPlayer = 1;
        this.gameOver = false;
        this.moveCount = 0;
        this.hintMove = null;

        // 禁手规则（默认开启，localStorage 记忆用户选择）
        this.forbiddenEnabled = localStorage.getItem('gomoku-forbidden') !== 'off';
        this.forbiddenPoints = [];  // 当前黑棋禁手点缓存（用于渲染与拦截）

        // Web Worker（?v= 资源版本号：老用户绕过旧的一年期缓存，发版时递增）
        this.worker = new Worker('worker.js?v=20260928-3');
        this.workerReady = false;

        this.init();
    }

    init() {
        this.setupWorker();
        this.setupEventListeners();
        document.getElementById('forbidden-toggle').checked = this.forbiddenEnabled;
        this.drawBoard();
    }

    setupWorker() {
        this.worker.onerror = (e) => {
            console.error('Worker error:', e);
        };

        this.worker.onmessage = (e) => {
            const { type, data } = e.data;

            switch (type) {
                case 'ready':
                    this.workerReady = true;
                    this.startByMode();
                    break;

                case 'move':
                    this.handleAIMove(data);
                    break;

                case 'hint':
                    this.handleHint(data);
                    break;
            }
        };

        // 初始化 Worker
        this.worker.postMessage({ type: 'init' });
    }

    /**
     * 同步禁手开关到 Worker 并刷新本方缓存
     */
    setForbidden(enabled) {
        this.forbiddenEnabled = enabled;
        localStorage.setItem('gomoku-forbidden', enabled ? 'on' : 'off');
        document.getElementById('forbidden-toggle').checked = enabled;
        this.worker.postMessage({ type: 'setForbidden', data: { enabled } });
        this.refreshForbiddenPoints();
        this.drawBoard();
        this.showMessage(enabled ? '禁手规则已开启：黑棋三三、四四、长连判负' : '禁手规则已关闭：自由五子棋规则');
    }

    /**
     * 重新计算当前黑棋禁手点（开关开启且对局中才有意义）
     */
    refreshForbiddenPoints() {
        this.forbiddenPoints = (this.forbiddenEnabled && typeof RenjuRules !== 'undefined')
            ? RenjuRules.forbiddenPoints(this.board, this.boardSize)
            : [];
    }

    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => this.handleClick(e));

        document.getElementById('btn-new-game').addEventListener('click', () => this.newGame());
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-hint').addEventListener('click', () => this.requestHint());
        document.getElementById('btn-export').addEventListener('click', () => this.exportGame());

        // 模式切换
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.mode = btn.dataset.mode;
                this.newGame();
            });
        });

        // 禁手开关
        document.getElementById('forbidden-toggle').addEventListener('change', (e) => {
            this.setForbidden(e.target.checked);
        });
    }

    /**
     * 根据模式开始游戏
     */
    startByMode() {
        const turnEl = document.getElementById('current-turn');
        const hintBtn = document.getElementById('btn-hint');
        const tutorialPanel = document.getElementById('tutorial-panel');

        switch (this.mode) {
            case 'teaching':
                // AI 执黑先手，带教学
                hintBtn.style.display = '';
                tutorialPanel.style.display = '';
                this.aiMove();
                break;

            case 'ai-first':
                // AI 执黑先手，无教学
                hintBtn.style.display = 'none';
                tutorialPanel.style.display = 'none';
                this.aiMove();
                break;

            case 'player-first':
                // 玩家执黑先手
                hintBtn.style.display = '';
                tutorialPanel.style.display = 'none';
                this.currentPlayer = 1;
                this.updateUI();
                this.showMessage('你执黑先行，请点击棋盘落子');
                break;

            case 'pvp':
                // 双人对战
                hintBtn.style.display = 'none';
                tutorialPanel.style.display = 'none';
                this.currentPlayer = 1;
                this.updateUI();
                this.showMessage('双人对战：黑方先行，轮流落子');
                break;
        }
    }

    /**
     * 请求 AI 落子（发送到 Worker）
     */
    aiMove() {
        this.showMessage('AI 思考中...', 'warning');
        this.worker.postMessage({
            type: 'getMove',
            data: {
                board: this.board,
                moveHistory: this.moveHistory,
                player: this.aiPlayer()
            }
        });
    }

    /**
     * AI 执子颜色：teaching/ai-first 模式下执黑(1)，player-first 模式下执白(2)
     */
    aiPlayer() {
        return this.mode === 'player-first' ? 2 : 1;
    }

    /**
     * 是否是玩家回合（pvp 模式总是玩家回合）
     */
    isPlayerTurn() {
        if (this.mode === 'pvp') return true;
        return this.currentPlayer !== this.aiPlayer() || this.moveHistory.length === 0 && this.mode === 'player-first';
    }

    /**
     * 处理点击事件
     */
    handleClick(e) {
        if (this.gameOver) return;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const x = Math.round(((e.clientX - rect.left) * scaleX - this.padding) / this.cellSize);
        const y = Math.round(((e.clientY - rect.top) * scaleY - this.padding) / this.cellSize);

        if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) return;
        if (this.board[y][x] !== 0) return;

        // 禁手点拦截（黑棋落子时生效）
        if (this.forbiddenEnabled) {
            const color = this.mode === 'pvp' ? this.currentPlayer : (this.aiPlayer() === 1 ? 2 : 1);
            if (color === 1) {
                const fp = this.forbiddenPoints.find(p => p.x === x && p.y === y);
                if (fp) {
                    this.showMessage(`禁手！${fp.types.join('、')}是黑棋禁手，换一个位置`, 'danger');
                    return;
                }
            }
        }

        if (this.mode === 'pvp') {
            // 双人对战：直接落子
            const mover = this.currentPlayer;
            this.makeMove(x, y, mover);

            // 禁手裁判：黑方犯规判白胜
            const foul = this.judgeForbidden(x, y);
            if (foul) {
                this.gameOver = true;
                this.showMessage(`黑方${foul.types.join('、')}禁手，白方获胜！`, 'success');
                return;
            }

            if (this.checkWin(x, y, mover)) {
                this.gameOver = true;
                this.showMessage(`${mover === 1 ? '黑方' : '白方'}获胜！`, 'success');
                return;
            }
            this.currentPlayer = mover === 1 ? 2 : 1;
            this.updateUI();
            this.showMessage(`轮到${this.currentPlayer === 1 ? '黑方' : '白方'}落子`);
            return;
        }

        // 人机模式：只有轮到玩家时才能点击
        const playerColor = this.aiPlayer() === 1 ? 2 : 1;
        if (this.currentPlayer !== playerColor) return;

        // 玩家落子
        this.playerMove(x, y, playerColor);
    }

    /**
     * 玩家落子
     */
    playerMove(x, y, playerColor) {
        this.makeMove(x, y, playerColor);

        // 清除提示
        this.hintMove = null;

        // 禁手裁判：黑棋玩家犯规直接判负（拦截层漏网时兜底，如悔棋后棋型变化）
        const foul = this.judgeForbidden(x, y);
        if (foul) {
            this.gameOver = true;
            this.showMessage(`黑棋${foul.types.join('、')}禁手，白方获胜`, 'danger');
            return;
        }

        // 检查玩家是否获胜
        if (this.checkWin(x, y, playerColor)) {
            this.gameOver = true;
            this.showMessage('你赢了！🎉', 'success');
            return;
        }

        // AI 回合
        this.currentPlayer = this.aiPlayer();
        this.updateUI();
        this.aiMove();
    }

    /**
     * 处理 AI 走法
     */
    handleAIMove(data) {
        const { move, thinkTime } = data;

        if (!move) {
            this.showMessage('平局！棋盘已满', 'warning');
            this.gameOver = true;
            return;
        }

        const ai = this.aiPlayer();
        this.makeMove(move.x, move.y, ai);
        document.getElementById('ai-status').textContent = `${thinkTime}ms`;

        // 禁手裁判：AI 执黑犯规 → 判玩家获胜
        // （正常情况下 AI 候选点已过滤禁手，这里是规则兜底，确保裁判独立于 AI 实现）
        const aiFoul = this.judgeForbidden(move.x, move.y);
        if (aiFoul) {
            this.gameOver = true;
            this.showMessage(`AI 黑棋${aiFoul.types.join('、')}禁手，你赢了！🎉`, 'success');
            return;
        }

        // 检查 AI 是否获胜
        if (this.checkWin(move.x, move.y, ai)) {
            this.gameOver = true;
            this.showMessage('AI 获胜！', 'danger');
            return;
        }

        this.currentPlayer = ai === 1 ? 2 : 1;
        // 教学模式显示走法解释
        if (this.mode === 'teaching') {
            this.showMessage(`AI 第 ${this.moveCount} 手走了 ${this.posName(move.x, move.y)}：${move.reason || ''}`);
        } else {
            this.showMessage('轮到你落子');
        }
        this.updateUI();
    }

    /**
     * 请求提示（仅教学模式和玩家先手模式）
     */
    requestHint() {
        if (this.gameOver || this.mode === 'pvp' || this.mode === 'ai-first') return;
        if (this.currentPlayer === this.aiPlayer() && this.moveHistory.length > 0) return;

        const playerColor = this.aiPlayer() === 1 ? 2 : 1;
        this.showMessage('正在为你计算最佳走法...');
        this.worker.postMessage({
            type: 'getHint',
            data: {
                board: this.mode === 'teaching' ? this.board : this.board,
                moveHistory: this.moveHistory,
                player: playerColor
            }
        });
    }

    /**
     * 处理提示结果
     */
    handleHint(data) {
        const { move } = data;
        if (!move) return;
        this.hintMove = move;
        this.showMessage(`提示：建议走 ${this.posName(move.x, move.y)} —— ${move.reason || ''}`, 'warning');
        this.drawBoard();
        setTimeout(() => {
            this.hintMove = null;
            this.drawBoard();
        }, 10000);
    }

    /**
     * 落子
     */
    makeMove(x, y, player) {
        this.board[y][x] = player;
        this.moveHistory.push({ x, y, player });
        this.moveCount++;
        this.drawBoard();
        this.updateUI();
    }

    /**
     * 坐标转名称（如 H8）
     */
    posName(x, y) {
        return String.fromCharCode(65 + x) + (15 - y);
    }

    /**
     * 检查是否获胜
     * 禁手模式下黑棋必须恰好五连（长连不算赢，由禁手裁判判负）；白棋 ≥5 即胜
     */
    checkWin(x, y, player) {
        const exactlyFive = this.forbiddenEnabled && player === 1;
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

        for (const [dx, dy] of directions) {
            let count = 1;

            for (let i = 1; i < 5; i++) {
                const nx = x + dx * i;
                const ny = y + dy * i;
                if (nx >= 0 && nx < this.boardSize && ny >= 0 && ny < this.boardSize && this.board[ny][nx] === player) {
                    count++;
                } else break;
            }

            for (let i = 1; i < 5; i++) {
                const nx = x - dx * i;
                const ny = y - dy * i;
                if (nx >= 0 && nx < this.boardSize && ny >= 0 && ny < this.boardSize && this.board[ny][nx] === player) {
                    count++;
                } else break;
            }

            if (exactlyFive ? count === 5 : count >= 5) return true;
        }

        return false;
    }

    /**
     * 禁手裁判：黑棋落子后检查是否犯规（仅禁手开启时）
     * 返回 null 或 { types }；长连场景同时意味着"不成五"
     */
    judgeForbidden(x, y) {
        if (!this.forbiddenEnabled || typeof RenjuRules === 'undefined') return null;
        if (this.mode === 'pvp') {
            if (this.board[y][x] !== 1) return null;
        } else if (this.aiPlayer() !== 1) {
            return null;  // AI 执白，无人执黑受限
        }
        const r = RenjuRules.checkPoint(this.board, this.boardSize, x, y);
        // checkPoint 对"已成五"的点返回合法；但长连（六连）不是五，
        // RenjuRules 已把长连单独归类为禁手，这里直接采用其结论
        return r.forbidden ? r : null;
    }

    /**
     * 绘制棋盘
     */
    drawBoard() {
        const ctx = this.ctx;
        const size = this.cellSize;
        const padding = this.padding;

        // 刷新禁手点缓存（开关开启时标出黑棋禁手位置）
        this.refreshForbiddenPoints();

        // 清空画布
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制棋盘背景
        ctx.fillStyle = '#dcb35c';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 绘制网格线
        ctx.strokeStyle = '#8b6914';
        ctx.lineWidth = 1;

        for (let i = 0; i < this.boardSize; i++) {
            ctx.beginPath();
            ctx.moveTo(padding, padding + i * size);
            ctx.lineTo(padding + (this.boardSize - 1) * size, padding + i * size);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(padding + i * size, padding);
            ctx.lineTo(padding + i * size, padding + (this.boardSize - 1) * size);
            ctx.stroke();
        }

        // 绘制星位
        const starPoints = [
            [3, 3], [3, 11], [11, 3], [11, 11], [7, 7],
            [3, 7], [7, 3], [7, 11], [11, 7]
        ];
        ctx.fillStyle = '#8b6914';
        for (const [x, y] of starPoints) {
            ctx.beginPath();
            ctx.arc(padding + x * size, padding + y * size, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // 绘制棋子（带步数序号）
        for (let i = 0; i < this.moveHistory.length; i++) {
            const move = this.moveHistory[i];
            this.drawStone(move.x, move.y, move.player, i + 1);
        }

        // 标记最后一步
        if (this.moveHistory.length > 0) {
            const lastMove = this.moveHistory[this.moveHistory.length - 1];
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(padding + lastMove.x * size, padding + lastMove.y * size, size / 2 - 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 绘制黑棋禁手标记（红叉）
        if (this.forbiddenEnabled && this.forbiddenPoints.length > 0) {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
            ctx.lineWidth = 2;
            for (const p of this.forbiddenPoints) {
                const cx = padding + p.x * size;
                const cy = padding + p.y * size;
                const r = size / 2 - 10;
                ctx.beginPath();
                ctx.moveTo(cx - r, cy - r);
                ctx.lineTo(cx + r, cy + r);
                ctx.moveTo(cx + r, cy - r);
                ctx.lineTo(cx - r, cy + r);
                ctx.stroke();
            }
        }

        // 绘制提示标记
        if (this.hintMove) {
            const hx = padding + this.hintMove.x * size;
            const hy = padding + this.hintMove.y * size;
            ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
            ctx.beginPath();
            ctx.arc(hx, hy, size / 2 - 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(hx, hy, size / 2 - 1, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    /**
     * 绘制棋子（带步数序号）
     */
    drawStone(x, y, player, moveNumber) {
        const ctx = this.ctx;
        const size = this.cellSize;
        const padding = this.padding;
        const cx = padding + x * size;
        const cy = padding + y * size;
        const radius = size / 2 - 3;

        // 绘制阴影
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // 绫制棋子
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);

        if (player === 1) {
            const gradient = ctx.createRadialGradient(cx - radius / 3, cy - radius / 3, 0, cx, cy, radius);
            gradient.addColorStop(0, '#4a4a4a');
            gradient.addColorStop(1, '#1a1a1a');
            ctx.fillStyle = gradient;
        } else {
            const gradient = ctx.createRadialGradient(cx - radius / 3, cy - radius / 3, 0, cx, cy, radius);
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(1, '#e0e0e0');
            ctx.fillStyle = gradient;
        }

        ctx.fill();

        // 重置阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // 绘制步数序号
        if (moveNumber) {
            ctx.fillStyle = player === 1 ? '#ffffff' : '#1a1a1a';
            ctx.font = `bold ${Math.floor(size * 0.42)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(moveNumber), cx, cy + 1);
        }
    }

    /**
     * 更新 UI
     */
    updateUI() {
        const ai = this.aiPlayer();
        let turnText;
        if (this.mode === 'pvp') {
            turnText = this.currentPlayer === 1 ? '黑方' : '白方';
        } else {
            turnText = this.currentPlayer === ai ? 'AI' : '你';
        }
        document.getElementById('current-turn').textContent = turnText;
        document.getElementById('move-count').textContent = this.moveCount;
    }

    /**
     * 显示消息
     */
    showMessage(text, type = '') {
        const msgEl = document.getElementById('game-message');
        msgEl.textContent = text;
        msgEl.className = 'message' + (type ? ` ${type}` : '');
    }

    /**
     * 新游戏
     */
    newGame() {
        this.board = Array(15).fill(null).map(() => Array(15).fill(0));
        this.moveHistory = [];
        this.currentPlayer = 1;
        this.gameOver = false;
        this.moveCount = 0;
        this.hintMove = null;
        document.getElementById('ai-status').textContent = '就绪';

        this.drawBoard();
        this.updateUI();
        if (this.workerReady) {
            this.worker.postMessage({ type: 'setForbidden', data: { enabled: this.forbiddenEnabled } });
            this.startByMode();
        }
    }

    /**
     * 悔棋
     */
    undo() {
        if (this.gameOver || this.moveHistory.length === 0) return;

        if (this.mode === 'pvp') {
            // 双人模式悔一步
            this.popMove();
            this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
            this.drawBoard();
            this.updateUI();
            this.showMessage('已悔棋');
            return;
        }

        // 人机模式：悔两步（AI + 玩家），不足两步悔一步
        if (this.moveHistory.length >= 2) {
            this.popMove();
            this.popMove();
        } else {
            this.popMove();
        }

        this.currentPlayer = this.aiPlayer() === 1 ? 2 : 1;
        // 如果悔到 AI 先手且棋盘空了，重新让 AI 走
        if (this.moveHistory.length === 0 && (this.mode === 'teaching' || this.mode === 'ai-first')) {
            this.currentPlayer = 1;
            this.drawBoard();
            this.updateUI();
            this.aiMove();
            return;
        }
        this.drawBoard();
        this.updateUI();
        this.showMessage('已悔棋，轮到你落子');
    }

    /**
     * 弹出最后一步
     */
    popMove() {
        const move = this.moveHistory.pop();
        if (move) {
            this.board[move.y][move.x] = 0;
            this.moveCount--;
        }
    }

    /**
     * 导出棋谱
     */
    exportGame() {
        const modeNames = {
            'teaching': '教学模式(AI先手)',
            'ai-first': 'AI先手',
            'player-first': '玩家先手',
            'pvp': '双人对战'
        };
        const moves = this.moveHistory.map((m, i) => {
            const player = m.player === 1 ? '黑' : '白';
            return `${i + 1}. ${player} ${this.posName(m.x, m.y)}`;
        }).join('\n');

        const text = `五子棋棋谱\n模式：${modeNames[this.mode]}\n时间：${new Date().toLocaleString()}\n\n${moves}`;

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        moves ? a.download = `gomoku-${Date.now()}.txt` : null;
        a.click();
        URL.revokeObjectURL(url);

        this.showMessage('棋谱已导出');
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    new GomokuGame();
});
