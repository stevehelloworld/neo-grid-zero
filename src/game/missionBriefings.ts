import { BiText } from '../engine/i18n/text';

export interface PhaseBriefingSpec {
  title: BiText;
  steps: BiText[];
  clearTitle: BiText;
  takeaway: BiText;
}

export interface ChapterBriefingSpec {
  recon: PhaseBriefingSpec;
  breach: PhaseBriefingSpec;
  battle: PhaseBriefingSpec & {
    warmupClearTitle?: BiText;
    bossName: BiText;
  };
}

export const MISSION_BRIEFINGS: Record<number, ChapterBriefingSpec> = {
  1: {
    recon: {
      title: { en: 'Why Memory Stays Stale', zh: '找出記憶體不同步的原因' },
      steps: [
        { en: 'Drag Supply → 120 and Usage → 45.', zh: '把 Supply 拉到 120、Usage 拉到 45。' },
        { en: 'Predict remaining and press EXECUTE.', zh: '輸入預測結果後按下 EXECUTE。' },
      ],
      clearTitle: { en: 'Recon Complete!', zh: '現場偵查完成！' },
      takeaway: {
        en: 'Variables store a snapshot computed at assignment time (=); they never auto-update later.',
        zh: '變數儲存的是執行 = 當下的數值快照，舊變數變動時不會回頭重算。',
      },
    },
    breach: {
      title: { en: 'Crack Reactor Locks', zh: '破解兩道反應爐鎖' },
      steps: [
        { en: 'Trace each = assignment line by line.', zh: '逐行追蹤每一次 = 賦值後的變數值。' },
        { en: 'Pick the true final register output.', zh: '選出最終真正印出或存入的結果。' },
      ],
      clearTitle: { en: 'Firewall Breached!', zh: '防火牆突破！' },
      takeaway: {
        en: 'Always execute statements top-to-bottom and remember that = overwrites memory.',
        zh: '程式由上往下逐行覆寫記憶體，務必追蹤到最後一個賦值語句。',
      },
    },
    battle: {
      title: { en: 'Defeat Overload Core', zh: '迎戰過載反應爐' },
      steps: [
        { en: 'Pass 01 Channel Swap with an int temp variable.', zh: '先用 int temp 通關 01 頻道交換。' },
        { en: 'Snapshot initialRemaining, then defeat Overload Core.', zh: '再於 02 關先備份快照並擊破三波測試。' },
      ],
      warmupClearTitle: { en: 'Warm-Up Cleared!', zh: '暖身關卡過關！' },
      bossName: { en: 'OVERLOAD CORE', zh: '過載反應爐' },
      clearTitle: { en: 'Overload Core Defeated!', zh: '過載反應爐擊破！' },
      takeaway: {
        en: 'Use a temp variable to swap cleanly and snapshot values before mutating inputs.',
        zh: '交換雙變數必備 temp，且需在修改原始輸入前先拍下初始值快照。',
      },
    },
  },
  2: {
    recon: {
      title: { en: 'Spot Integer Truncation', zh: '抓出整數除法截斷' },
      steps: [
        { en: 'Predict 17 / 5 (/), 17 % 5 (%), and exact decimal.', zh: '先預測 17 / 5 商數、餘數與精確小數。' },
        { en: 'Press DISPATCH CARGO to verify the split.', zh: '按下「鎖定預測並分配貨物」驗證結果。' },
      ],
      clearTitle: { en: 'Recon Complete!', zh: '夜市偵查完成！' },
      takeaway: {
        en: 'int / int drops decimals silently; cast one operand to (double) first to keep precision.',
        zh: '兩個 int 相除會無聲捨去小數；除法前至少有一邊需轉型為 (double)。',
      },
    },
    breach: {
      title: { en: 'Crack Ledger Locks', zh: '破解三道夜市計價鎖' },
      steps: [
        { en: 'Apply operator precedence before assignment.', zh: '先依運算優先序算完右側，再存入左側。' },
        { en: 'Watch where (double) is placed in casts.', zh: '看清楚 (double) 括號轉型套用在誰身上。' },
      ],
      clearTitle: { en: 'Ledger Breached!', zh: '夜市帳本解鎖！' },
      takeaway: {
        en: 'Casting (double) after int / int finishes is too late—the fraction is already lost.',
        zh: '若等 int / int 算完才包 (double)，小數早就被截斷救不回來。',
      },
    },
    battle: {
      title: { en: 'Defeat Truncation Titan', zh: '迎戰截斷泰坦' },
      steps: [
        { en: 'Clear 01 Cargo Splitter using /, %, and (double).', zh: '用 /、% 與 (double) 通關 01 貨物分配器。' },
        { en: 'Deploy compound ops & casting vs Truncation Titan.', zh: '再以複合指定與轉型擊破 Truncation Titan。' },
      ],
      warmupClearTitle: { en: 'Splitter Cleared!', zh: '分配器驗證完成！' },
      bossName: { en: 'TRUNCATION TITAN', zh: '截斷泰坦' },
      clearTitle: { en: 'Truncation Titan Defeated!', zh: '截斷泰坦擊破！' },
      takeaway: {
        en: 'Combine %, integer division, and early (double) casting for exact financial math.',
        zh: '善用 % 取餘數與「先轉型再除法」即可精準處理分帳與單位換算。',
      },
    },
  },
  3: {
    recon: {
      title: { en: 'Slice String Indexes', zh: '掌握字串切片與越界陷阱' },
      steps: [
        { en: 'Set begin/end sliders to slice "RON" from "DRONE".', zh: '調整起訖拉桿，從 "DRONE" 切出 "RON"。' },
        { en: 'Trigger one OOB or Immutability anomaly test.', zh: '接著點選一次「越界」或「不可變性」測試。' },
      ],
      clearTitle: { en: 'Recon Complete!', zh: '檔案偵查完成！' },
      takeaway: {
        en: 'substring(a, b) keeps [a, b-1]; out-of-range throws an exception and Strings never mutate in place.',
        zh: 'substring(a, b) 包含 a 不含 b；超出長度立即爆錯，且呼叫方法不會直接改動原字串。',
      },
    },
    breach: {
      title: { en: 'Crack Archive Locks', zh: '破解三道檔案館鎖' },
      steps: [
        { en: 'Count zero-based character indexes carefully.', zh: '從 0 開始數清楚每個字元的索引位置。' },
        { en: 'Check Math static bounds and .equals() logic.', zh: '留意 Math 靜態方法區間與 .equals() 判定。' },
      ],
      clearTitle: { en: 'Archive Unlocked!', zh: '檔案館解鎖！' },
      takeaway: {
        en: 'Always reassign returned Strings and compare Strings with .equals(), never ==.',
        zh: '字串不可變性要求把結果存回變數，比較字串內容永遠用 .equals()。',
      },
    },
    battle: {
      title: { en: 'Defeat Immutable Archivist', zh: '迎戰不變檔案官' },
      steps: [
        { en: 'Pass 01 Initials Slicer with substring(0, 1).', zh: '先用 substring(0, 1) 完成 01 首字母提取。' },
        { en: 'Extract routeSuffix after "-" safely in 02.', zh: '再用 indexOf("-") 安全切出 "-" 後方代碼擊敗 Boss。' },
      ],
      warmupClearTitle: { en: 'Slicer Cleared!', zh: '首字母切片過關！' },
      bossName: { en: 'IMMUTABLE ARCHIVIST', zh: '不變檔案官' },
      clearTitle: { en: 'Archivist Neutralized!', zh: '不變檔案官瓦解！' },
      takeaway: {
        en: 'Pair indexOf() guards with substring(pos + 1) to handle missing delimiters cleanly.',
        zh: '先檢查 indexOf() != -1 再切 substring(pos + 1)，就能安全應對缺分隔符的輸入。',
      },
    },
  },
  4: {
    recon: {
      title: { en: 'Catch Priority Hijacking', zh: '揪出條件優先順序漏洞' },
      steps: [
        { en: 'First click TEST CORRUPTED AUTOPILOT to see the bug.', zh: '先按「測試故障自動駕駛」親眼目擊撞毀原因。' },
        { en: 'Then route all 3 incoming drones into the right gates.', zh: '再依優先規則手動引導 3 架無人機進正確航道。' },
      ],
      clearTitle: { en: 'Recon Complete!', zh: '空域偵查完成！' },
      takeaway: {
        en: 'In an if / else-if chain, the first true branch wins—check the strictest rule first!',
        zh: 'if / else if 只會執行第一個成立的分支，最嚴格的高優先規則必須放最上面！',
      },
    },
    breach: {
      title: { en: 'Crack Sky-Gate Locks', zh: '破解三道空域邏輯鎖' },
      steps: [
        { en: 'Evaluate && and || with short-circuit order.', zh: '依序追蹤 && / || 短路求值與 De Morgan 反轉。' },
        { en: 'Verify inclusive boundary checks (>= vs >).', zh: '看清邊界包含 (>= 與 >) 及括號優先順序。' },
      ],
      clearTitle: { en: 'Sky-Gate Breached!', zh: '空域閘門解鎖！' },
      takeaway: {
        en: 'Double-check boundary equality (>=) and negation flipping (De Morgan’s Law).',
        zh: '判斷臨界值務必檢查等號，取反整個條件時 && 與 || 必須互換（笛摩根定律）。',
      },
    },
    battle: {
      title: { en: 'Defeat Sentinel Gatekeeper', zh: '迎戰哨兵閘門王' },
      steps: [
        { en: 'Check CLEAR (trained && age >= 16) first.', zh: '最優先檢查 trained && age >= 16 回傳 "CLEAR"。' },
        { en: 'Then check PRACTICE (mentor && age >= 13), else WAIT.', zh: '接著檢查 mentor && age >= 13，其餘回傳 "WAIT"。' },
      ],
      bossName: { en: 'SENTINEL GATEKEEPER', zh: '哨兵閘門王' },
      clearTitle: { en: 'Gatekeeper Defeated!', zh: '哨兵閘門王擊破！' },
      takeaway: {
        en: 'Putting the most specific boolean rule first prevents edge pilots from being shadowed.',
        zh: '把限制最嚴格的條件排在第一位，就能徹底防止高資格條件被提早攔截。',
      },
    },
  },
  5: {
    recon: {
      title: { en: 'Stop Infinite Loops', zh: '看穿無窮迴圈與充電終止' },
      steps: [
        { en: 'Trip the fuse once with TEST CORRUPTED LOOP.', zh: '先點「測無窮迴圈」看看條件為何永遠無法結束。' },
        { en: 'Pulse-charge from 3 to ≥ 14 to see the loop exit.', zh: '再按 PULSE 充能直到超越 14 觀察迴圈停止。' },
      ],
      clearTitle: { en: 'Recon Complete!', zh: '高塔偵查完成！' },
      takeaway: {
        en: 'Every loop body must move the loop variable toward making the guard condition false.',
        zh: '每次迴圈執行都必須讓狀態往「結束條件」推進，否則就會引爆無窮迴圈。',
      },
    },
    breach: {
      title: { en: 'Crack Coil Locks', zh: '破解三道迴圈鎖' },
      steps: [
        { en: 'Count iterations including entry and exit checks.', zh: '仔細數進入前檢查與最後一次跳出的條件邊界。' },
        { en: 'Spot off-by-one (< vs <=) differences.', zh: '分辨 < 與 <= 造成多一輪或少一輪的差異。' },
      ],
      clearTitle: { en: 'Coil Breached!', zh: '電圈防線解鎖！' },
      takeaway: {
        en: 'Trace the final iteration carefully—off-by-one bugs almost always happen at the boundary.',
        zh: '差一錯誤（off-by-one）常發生在進入前已達標或最後一輪邊界條件。',
      },
    },
    battle: {
      title: { en: 'Defeat Infinite Coil', zh: '迎戰無窮電圈' },
      steps: [
        { en: 'Implement rounds(start, gain, target) with a loop.', zh: '用迴圈累積加上 gain 並記錄輪數。' },
        { en: 'Handle start >= target returning 0 safely.', zh: '確保起始已達標 (start >= target) 時回傳 0。' },
      ],
      bossName: { en: 'INFINITE COIL', zh: '無窮電圈' },
      clearTitle: { en: 'Infinite Coil Defeated!', zh: '無窮電圈擊破！' },
      takeaway: {
        en: 'Using while (charge < target) cleanly yields 0 rounds when start already meets target.',
        zh: 'while (charge < target) 先判斷再進場，天然就能正確處理「已達標免充電 = 0 輪」。',
      },
    },
  },
  6: {
    recon: {
      title: { en: 'Track Current & Best Streaks', zh: '追蹤即時連續與歷史最佳極值' },
      steps: [
        { en: 'Click STEP PULSE through all 8 signals ("OOXOOOXO").', zh: '點按 STEP PULSE 掃完 8 格脈衝訊號。' },
        { en: 'Enter the longest unbroken O streak and lock it.', zh: '填入過程出現過的最長連續 O 長度並鎖定。' },
      ],
      clearTitle: { en: 'Recon Complete!', zh: '掃描偵查完成！' },
      takeaway: {
        en: 'Reset currentRun on bad items while continuously saving Math.max(bestRun, currentRun).',
        zh: '遇到雜訊只歸零 current，但要隨時用 max(best, current) 把歷史巔峰鎖住。',
      },
    },
    breach: {
      title: { en: 'Crack Scanner Locks', zh: '破解四道掃描演算法鎖' },
      steps: [
        { en: 'Avoid initializing max to 0 on negative inputs!', zh: '留意全負數輸入時 max 不可錯設為 0！' },
        { en: 'Follow digit peeling (% 10 / /= 10) and streak updates.', zh: '追蹤位數拆解 (% 10 與 /= 10) 及連續狀態更新。' },
      ],
      clearTitle: { en: 'Scanner Breached!', zh: '掃描核心解鎖！' },
      takeaway: {
        en: 'Initialize extrema from the first element (or sentinel) rather than assuming positive numbers.',
        zh: '找極值請用第一筆真實資料當起點，才不會在全負數測資被 0 騙過。',
      },
    },
    battle: {
      title: { en: 'Defeat Noise Phantom', zh: '迎戰雜訊幻影' },
      steps: [
        { en: 'Scan readings with charAt(i) == \'O\' or substring.', zh: '以 for 迴圈逐字元檢查是否為 O。' },
        { en: 'Maintain both cur and best in one pass ("" → 0).', zh: '單次掃描同時更新 cur 與 best（空字串回傳 0）。' },
      ],
      bossName: { en: 'NOISE PHANTOM', zh: '雜訊幻影' },
      clearTitle: { en: 'Noise Phantom Defeated!', zh: '雜訊幻影清除！' },
      takeaway: {
        en: 'Dual-register tracking solves streak problems cleanly in O(n) single pass.',
        zh: '一組 cur + best 雙暫存器即可在單次走訪 O(n) 解出所有連續極值題型。',
      },
    },
  },
  7: {
    recon: {
      title: { en: 'Compare Nested Loop Shapes', zh: '觀察巢狀迴圈掃描形狀' },
      steps: [
        { en: 'Choose Triangle or Rectangle & set rows.', zh: '選擇三角形 (c <= r) 或矩形掃描並設定列數。' },
        { en: 'Press SWEEP RADAR to watch outer × inner visits.', zh: '按 SWEEP RADAR 觀察內外層執行格數差異。' },
      ],
      clearTitle: { en: 'Recon Complete!', zh: '雷達偵查完成！' },
      takeaway: {
        en: 'Linking the inner bound (c <= r) to the outer variable creates a growing triangular sweep.',
        zh: '把內層上限綁到外層變數 (c <= r) 會掃出三角形；固定上限則掃出矩形。',
      },
    },
    breach: {
      title: { en: 'Crack Radar Locks', zh: '破解三道巢狀雷達鎖' },
      steps: [
        { en: 'Multiply outer iterations by inner iterations.', zh: '將外層與內層的真實執行次數展開相乘。' },
        { en: 'Predict how doubling n multiplies total grid visits.', zh: '思考 n 變成 2 倍時，二維運算量會暴增幾倍。' },
      ],
      clearTitle: { en: 'Radar Breached!', zh: '雷達陣列解鎖！' },
      takeaway: {
        en: 'Nested n × n loops scale quadratically—doubling n multiplies work by 4x.',
        zh: '雙層 n × n 巢狀迴圈呈平方級成長，當 n 加倍時總運算次數會暴增 4 倍。',
      },
    },
    battle: {
      title: { en: 'Defeat Quadratic Hydra', zh: '迎戰平方九頭蛇' },
      steps: [
        { en: 'Build rows lines where line r has r "#" symbols.', zh: '實作 sweep(rows) 輸出第 r 列含 r 個 # 的三角形。' },
        { en: 'Join lines with "\\n" (no trailing newline, sweep(0) -> "").', zh: '列間加 "\\n" 但最末行不可加（sweep(0) 回傳 ""）。' },
      ],
      bossName: { en: 'QUADRATIC HYDRA', zh: '平方九頭蛇' },
      clearTitle: { en: 'Quadratic Hydra Defeated!', zh: 'Act I & II 全 7 章破關！' },
      takeaway: {
        en: 'Guard fenceposts cleanly: append "\\n" only when r < rows so no trailing newline leaks.',
        zh: '只要在 r < rows 時才補 "\\n"，就能乾淨避開最常見的柵欄柱尾行換行錯誤。',
      },
    },
  },
};
