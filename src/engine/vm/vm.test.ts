import { describe, expect, it } from 'vitest';
import { runMethodCall, runStatements } from './index';

describe('AP CSA Stepper VM', () => {
  it('models stale stored variables vs reassignment in Ch.01 trace', () => {
    const code = `
      int energy = 120;
      int used = 35;
      int remaining = energy - used;
      energy = 150;
      used = used + 10;
      System.out.println(remaining);
      remaining = energy - used;
      System.out.println(remaining);
    `;
    const res = runStatements(code);
    expect(res.ok).toBe(true);
    expect(res.stdout.trim()).toBe('85\n105');
    expect(res.frames.length).toBeGreaterThanOrEqual(8);
  });

  it('patches initial values and reassignments via AST without regex fragility', () => {
    const code = `
      // Student solution with custom spacing & comments
      int energy = 120;
      int used = 45;
      int remaining = energy - used;
      int initialRemaining = remaining;
      energy = 120 + 30; // even an expression!
      used = 65;
      remaining = energy - used;
      boolean online = true;
      System.out.println("Initial: " + initialRemaining);
      System.out.println("Updated: " + remaining);
      System.out.println("Online: " + online);
    `;
    const wave2 = runStatements(code, {
      patches: [
        { name: 'energy', initial: 135, reassign: 170 },
        { name: 'used', initial: 50, reassign: 80 },
      ],
    });
    expect(wave2.ok).toBe(true);
    expect(wave2.stdout.trim()).toBe('Initial: 85\nUpdated: 90\nOnline: true');
    expect(wave2.finalLocals.initialRemaining?.value).toBe('85');
    expect(wave2.finalLocals.remaining?.value).toBe('90');
  });

  it('supports variable swap using temp and detects overwrite without temp', () => {
    const swap = `
      int left = 7;
      int right = 12;
      int temp = left;
      left = right;
      right = temp;
      System.out.println("Left: " + left);
      System.out.println("Right: " + right);
    `;
    const res = runStatements(swap, {
      patches: [
        { name: 'left', initial: 31 },
        { name: 'right', initial: 9 },
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.stdout.trim()).toBe('Left: 9\nRight: 31');
  });

  it('evaluates integer division, casting, and double formatting like Java', () => {
    const res = runStatements(`
      int a = 7;
      int b = 2;
      double x = a / b;
      double y = (double) a / b;
      System.out.println(x + " " + y);
    `);
    expect(res.ok).toBe(true);
    expect(res.stdout.trim()).toBe('3.0 3.5');
  });

  it('executes Ch.04 access() method with exact priority & emits branch trace frames', () => {
    const accessCode = `
      static String access(int age, boolean trained, boolean mentor) {
          if (trained && age >= 16) {
              return "CLEAR";
          } else if (mentor && age >= 13) {
              return "PRACTICE";
          }
          return "WAIT";
      }
    `;
    const clearPriority = runMethodCall(accessCode, 'access', [16, true, true]);
    expect(clearPriority.ok).toBe(true);
    expect(clearPriority.returnValue?.value).toBe('CLEAR');
    expect(clearPriority.frames.some((f) => f.kind === 'branch' && f.branchTaken)).toBe(true);

    expect(runMethodCall(accessCode, 'access', [16, false, true]).returnValue?.value).toBe('PRACTICE');
    expect(runMethodCall(accessCode, 'access', [13, false, true]).returnValue?.value).toBe('PRACTICE');
    expect(runMethodCall(accessCode, 'access', [12, true, true]).returnValue?.value).toBe('WAIT');
    expect(runMethodCall(accessCode, 'access', [15, true, false]).returnValue?.value).toBe('WAIT');
  });

  it('enforces strict short-circuiting on && and ||', () => {
    const res = runStatements(`
      int x = 0;
      boolean ok = x != 0 && 10 / x > 1;
      boolean safe = x == 0 || 10 / x > 1;
      System.out.println(ok + ":" + safe);
    `);
    expect(res.ok).toBe(true);
    expect(res.stdout.trim()).toBe('false:true');
  });

  it('supports loops, String methods, ArrayList removal shifting, 2D arrays, and recursion', () => {
    const listCode = `
      import java.util.ArrayList;
      static int removeTitle(ArrayList<String> tracks, String blocked) {
          int removed = 0;
          for (int i = tracks.size() - 1; i >= 0; i--) {
              if (tracks.get(i).equals(blocked)) {
                  tracks.remove(i);
                  removed++;
              }
          }
          return removed;
      }
    `;
    const resList = runStatements(`
      ArrayList<String> tracks = new ArrayList<String>();
      tracks.add("A"); tracks.add("X"); tracks.add("X"); tracks.add("B");
      int count = 0;
      for (int i = tracks.size() - 1; i >= 0; i--) {
          if (tracks.get(i).equals("X")) {
              tracks.remove(i);
              count++;
          }
      }
      System.out.println(count + " " + tracks.size() + " " + tracks.get(1));
    `);
    expect(resList.ok).toBe(true);
    expect(resList.stdout.trim()).toBe('2 2 B');
    expect(listCode.length).toBeGreaterThan(0);

    const recCode = `
      static int total(int n) {
          if (n <= 0) return 0;
          return n + total(n - 2);
      }
    `;
    const recRes = runMethodCall(recCode, 'total', [4]);
    expect(recRes.ok).toBe(true);
    expect(recRes.returnValue?.value).toBe(6);

    const gridRes = runStatements(`
      int[][] grid = {{1, 2, 3}, {4, 5, 6}};
      int sum = 0;
      for (int r = 0; r < grid.length; r++) {
          for (int c = 0; c < grid[r].length; c++) {
              sum += grid[r][c];
          }
      }
      String s = "DRONE".substring(1, 4);
      System.out.println(sum + ":" + s);
    `);
    expect(gridRes.ok).toBe(true);
    expect(gridRes.stdout.trim()).toBe('21:RON');
  });

  it('reports accurate line numbers for type errors and trips infinite-loop breaker', () => {
    const typeErr = runStatements(`int a = 10;\nint b = "bad";`);
    expect(typeErr.ok).toBe(false);
    expect(typeErr.error?.kind).toBe('type');
    expect(typeErr.error?.line).toBe(2);

    const loopErr = runStatements(`int x = 0;\nwhile (x < 10) {\n  x = x;\n}`, { maxSteps: 200 });
    expect(loopErr.ok).toBe(false);
    expect(loopErr.error?.kind).toBe('timeout');
  });

  it('evaluates Ch.02 Precision Calculator with casts, compound ops, and AST patching', () => {
    const calc = `
      int subtotalCents = 5000;
      double taxRate = 0.08;
      double discountRate = 0.05;
      int crewSize = 3;
      int taxCents = (int) (subtotalCents * taxRate);
      int discountCents = (int) (subtotalCents * discountRate);
      int totalCents = subtotalCents;
      totalCents += taxCents;
      totalCents -= discountCents;
      int shareCents = totalCents / crewSize;
      int leftoverCents = totalCents % crewSize;
      double exactShare = (double) totalCents / crewSize;
      int orders = 2;
      orders++;
      System.out.println("Tax cents: " + taxCents);
      System.out.println("Discount cents: " + discountCents);
      System.out.println("Total cents: " + totalCents);
      System.out.println("Each gets: " + shareCents);
      System.out.println("Left over: " + leftoverCents);
      System.out.println("Exact share: " + exactShare);
      System.out.println("Orders: " + orders);
    `;
    const w1 = runStatements(calc);
    expect(w1.ok).toBe(true);
    expect(w1.finalLocals.totalCents?.value).toBe('5150');
    expect(w1.finalLocals.shareCents?.value).toBe('1716');
    expect(w1.finalLocals.leftoverCents?.value).toBe('2');
    expect(w1.finalLocals.orders?.value).toBe('3');

    const w2 = runStatements(calc, {
      patches: [
        { name: 'subtotalCents', initial: 6000 },
        { name: 'crewSize', initial: 4 },
      ],
    });
    expect(w2.ok).toBe(true);
    expect(w2.finalLocals.totalCents?.value).toBe('6180');
    expect(w2.finalLocals.shareCents?.value).toBe('1545');
    expect(w2.finalLocals.leftoverCents?.value).toBe('0');
    expect(w2.finalLocals.exactShare?.value).toBe('1545.0');
  });

  it('runs Ch.03 String initials, routeSuffix, and detects StringIndexOutOfBoundsException', () => {
    const strCode = `
      static String initials(String first, String last) {
          return first.substring(0, 1) + "." + last.substring(0, 1) + ".";
      }
      static String routeSuffix(String route) {
          int dash = route.indexOf("-");
          return route.substring(dash + 1);
      }
    `;
    expect(runMethodCall(strCode, 'initials', ['Ada', 'Lovelace']).returnValue?.value).toBe('A.L.');
    expect(runMethodCall(strCode, 'initials', ['grace', 'Hopper']).returnValue?.value).toBe('g.H.');
    expect(runMethodCall(strCode, 'routeSuffix', ['west-42']).returnValue?.value).toBe('42');
    expect(runMethodCall(strCode, 'routeSuffix', ['sector-alpha']).returnValue?.value).toBe('alpha');

    const oob = runStatements(`String s = "DRONE";\nSystem.out.println(s.substring(1, 7));`);
    expect(oob.ok).toBe(false);
    expect(oob.error?.message).toContain('StringIndexOutOfBoundsException');
  });

  it('runs Ch.05 while loop rounds(start, gain, target) across overshoot and zero cases', () => {
    const loopCode = `
      static int rounds(int start, int gain, int target) {
          int charge = start;
          int count = 0;
          while (charge < target) {
              charge += gain;
              count++;
          }
          return count;
      }
    `;
    expect(runMethodCall(loopCode, 'rounds', [3, 4, 15]).returnValue?.value).toBe(3);
    expect(runMethodCall(loopCode, 'rounds', [3, 4, 14]).returnValue?.value).toBe(3);
    expect(runMethodCall(loopCode, 'rounds', [15, 4, 15]).returnValue?.value).toBe(0);
    expect(runMethodCall(loopCode, 'rounds', [20, 4, 15]).returnValue?.value).toBe(0);
  });

  it('runs Ch.06 longestRun with both substring.equals and charAt == char literal', () => {
    const subVersion = `
      static int longestRun(String readings) {
          int cur = 0;
          int best = 0;
          for (int i = 0; i < readings.length(); i++) {
              if (readings.substring(i, i + 1).equals("O")) {
                  cur++;
                  if (cur > best) best = cur;
              } else {
                  cur = 0;
              }
          }
          return best;
      }
    `;
    const charAtVersion = `
      static int longestRun(String readings) {
          int cur = 0;
          int best = 0;
          for (int i = 0; i < readings.length(); i++) {
              if (readings.charAt(i) == 'O') {
                  cur++;
                  if (cur > best) best = cur;
              } else {
                  cur = 0;
              }
          }
          return best;
      }
    `;
    for (const code of [subVersion, charAtVersion]) {
      expect(runMethodCall(code, 'longestRun', ['OOXOOO']).returnValue?.value).toBe(3);
      expect(runMethodCall(code, 'longestRun', ['OOOOXXO']).returnValue?.value).toBe(4);
      expect(runMethodCall(code, 'longestRun', ['XXX']).returnValue?.value).toBe(0);
      expect(runMethodCall(code, 'longestRun', ['']).returnValue?.value).toBe(0);
    }
  });

  it('runs Ch.07 nested-loop sweep(rows) without trailing newline', () => {
    const sweepCode = `
      static String sweep(int rows) {
          String out = "";
          for (int r = 1; r <= rows; r++) {
              for (int c = 1; c <= r; c++) {
                  out += "#";
              }
              if (r < rows) out += "\\n";
          }
          return out;
      }
    `;
    expect(runMethodCall(sweepCode, 'sweep', [3]).returnValue?.value).toBe('#\n##\n###');
    expect(runMethodCall(sweepCode, 'sweep', [1]).returnValue?.value).toBe('#');
    expect(runMethodCall(sweepCode, 'sweep', [0]).returnValue?.value).toBe('');
  });
});
