/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/*──────────────────────── CONSTANTS ──────────────────────*/
const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/*─────────────────────── HELPERS ───────────────────────────*/
const trim = s => (s ?? '').replace(/\s+/g, ' ').trim();

const toFloat = n => {
  const m = (n ?? '').replace(/[,₹]/g, '').match(/[-+]?\d*\.?\d+/);
  return m ? parseFloat(m[0]) : null;
};

const ddmmyyyy = raw => {
  if (!raw) return '';
  const tidy = raw.replace(/[-]/g, '/').replace(/\s+/g, '/').trim();

  const m1 = tidy.match(/^(\d{1,2})\/?([A-Za-z]{3})\/?(\d{2,4})$/);
  if (m1) {
    const [, d, mon, y] = m1;
    return `${d.padStart(2, '0')}/${MONTH_MAP[mon.toLowerCase()]}/${y.length === 2 ? '20' + y : y}`;
  }

  const m2 = tidy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m2) {
    const [, d, m, y] = m2;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y.length === 2 ? '20' + y : y}`;
  }

  return tidy;
};

const cleanNarr = t =>
  trim(t).replace(/\d{2}:\d{2}\s*(AM|PM)?/gi, '').replace(/^(\d+\s*)+/, '');

/*─────────────────── PATTERN DETECTION ─────────────────────*/
function detectPattern(txt) {
  const lines = txt.split('\n');
  const content = txt.toLowerCase();
  
  // Pattern 1: Contains "DATE NARRATION" header and "WITHDRAWAL (DR.)" "DEPOSIT (CR.)"
  if ((content.includes('date') && content.includes('narration') && 
      content.includes('withdrawal (dr.)') && content.includes('deposit (cr.)')) ||
      (content.includes('date') && content.includes('narration') && 
       content.includes('withdrawal') && content.includes('deposit') && 
       content.includes('balance') && /\d{2}-[a-z]{3}-\d{4}/.test(content))) {
    return 'pattern1';
  }
  
  // Pattern 2: More robust detection for 2.txt format
  if ((content.includes('txn date') && content.includes('value') && content.includes('description')) ||
      (content.includes('transaction date') && content.includes('value date') && content.includes('description')) ||
      (content.includes('to transfer-') && content.includes('upi/dr/') && 
       /\d{1,2}\s+\w{3}\s+\d{4}/.test(content)) ||
      (content.includes('ref no./cheque no.') && content.includes('debit') && 
       content.includes('credit') && /\d{1,2}\s+\w{3}\s+\d{4}/.test(content))) {
    return 'pattern2';
  }
  
  // Pattern 3: Contains "Entry Date" header and UPI transactions with amounts like "1.00"
  if ((content.includes('entry date') && content.includes('description') && 
      content.includes('chq no/ref no') && content.includes('value date')) ||
      (content.includes('entry date') && content.includes('upi/') && 
       /\d{2}-[a-z]{3}-\d{4}/.test(content))) {
    return 'pattern3';
  }
  
  // Pattern 4: Contains "Tran Date" and "Particulars" with UPI/P2M or NEFT patterns
  if ((content.includes('tran date') && content.includes('particulars')) ||
      (content.includes('tran date') && content.includes('chq no') && 
       (content.includes('upi/p2m') || content.includes('neft/'))) ||
      (/\d{2}-\d{2}-\d{4}/.test(content) && content.includes('particulars'))) {
    return 'pattern4';
  }
  
  // Pattern 5: Contains numbered transactions with "TRANSACTION DATE" and "VALUE DATE"
  if ((content.includes('transaction date') && content.includes('value date') && 
      content.includes('transaction details') && content.includes('chq / ref no.')) ||
      (content.includes('transaction date') && content.includes('value date') && 
       content.includes('debit/credit(₹)')) ||
      (/^\s*\d+\s+\d{2}\s+\w{3}\s+\d{4}/.test(content) && 
       content.includes('transaction details'))) {
    return 'pattern5';
  }
  
  // Pattern 6: More robust detection for 6.txt format
  if ((content.includes('withdrawal amt.') && content.includes('deposit amt.') && 
      content.includes('closing balance')) ||
      (/\d{2}\/\d{2}\/\d{2}/.test(content) && content.includes('withdrawal amt.')) ||
      (content.includes('chq./ref.no.') && content.includes('value dt')) ||
      (content.includes('narration') && content.includes('withdrawal amt.') && 
       content.includes('deposit amt.')) ||
      (content.includes('date') && content.includes('narration') && 
       content.includes('chq./ref.no.') && content.includes('value dt') && 
       content.includes('withdrawal amt.')) ||
      (/\d{2}\/\d{2}\/\d{2}/.test(content) && content.includes('upi-') && 
       content.includes('closing balance'))) {
    return 'pattern6';
  }
  
  // Additional fallback detection
  if (/\d{1,2}\s+\w{3}\s+\d{4}/.test(content) && 
      (content.includes('transfer') || content.includes('upi/dr/'))) {
    return 'pattern2';
  }
  
  if (/\d{2}-[a-z]{3}-\d{4}/.test(content) && 
      (content.includes('deposit') || content.includes('withdrawal'))) {
    return content.includes('entry date') ? 'pattern3' : 'pattern1';
  }
  
  if (/\d{2}-\d{2}-\d{4}/.test(content)) {
    return 'pattern4';
  }
  
  if (/^\s*\d+\s+\d{2}\s+\w{3}\s+\d{4}/.test(content)) {
    return 'pattern5';
  }
  
  if (/\d{2}\/\d{2}\/\d{2}/.test(content) && 
      (content.includes('upi-') || content.includes('closing balance'))) {
    return 'pattern6';
  }
  
  return 'unknown';
}

/*──────────────────── FILE-FORMAT PARSERS ──────────────────*/
function parse1(txt) {
  const out = [];
  let cur = null;
  
  txt.split('\n').forEach(l => {
    if (/Opening Balance|DATE\s+NARRATION/i.test(l)) return;

    const m = l.match(/^\s*(\d{2}-[A-Za-z]{3}-\d{4})/);
    if (m) {
      if (cur) out.push(cur);
      
      const date = ddmmyyyy(m[1]);
      const parts = l.substring(l.indexOf(m[1]) + m[1].length).split(/\s{3,}/).map(trim).filter(Boolean);
      
      let narration = parts[0] || '';
      let withdrawal = null, deposit = null;
      
      if (parts.length === 3) {
        const amount = toFloat(parts[1]);
        if (narration.includes('WTHDRL') || narration.includes('DR-RRN')) {
          withdrawal = amount;
        } else if (narration.includes('DEPOSIT') || narration.includes('CR-RRN')) {
          deposit = amount;
        }
      } else if (parts.length === 4) {
        if (/^\d+(\.\d{2})?$/.test(parts[1])) withdrawal = toFloat(parts[1]);
        if (/^\d+(\.\d{2})?$/.test(parts[2])) deposit = toFloat(parts[2]);
      }
      
      const amount = withdrawal || deposit;
      if (amount) {
        cur = { date, narration: cleanNarr(narration), amount, type: withdrawal ? 'Debit' : 'Credit' };
      }
    } else if (cur && l.trim()) {
      cur.narration += ' ' + cleanNarr(l);
    }
  });
  
  if (cur) out.push(cur);
  return out.filter(t => t.amount);
}

function parse2(txt) {
  const out = [];
  let cur = null;
  
  txt.split('\n').forEach(l => {
    if (/Txn Date/i.test(l)) return;
    
    const m = l.match(/^\s*(\d{1,2}\s+\w{3}\s+\d{4})/);
    if (m) {
      if (cur) out.push(cur);
      
      const date = ddmmyyyy(m[1]);
      const cols = l.split(/\s{2,}/).map(trim).filter(Boolean);
      const debit = cols.find(c => /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(c));
      
      const narration = cols.filter((col, index) => {
        if (index < 2) return false;
        if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(col)) return false;
        if (col === 'TRANSFER TO' || /^\d{13}$/.test(col)) return false;
        return true;
      }).join(' ');
      
      cur = { date, narration: cleanNarr(narration), amount: toFloat(debit), type: 'Debit' };
    } else if (cur && l.trim()) {
      const cleanLine = l.trim().replace(/\b\d{13}\b/g, '').trim();
      if (cleanLine) cur.narration += ' ' + cleanNarr(cleanLine);
    }
  });
  
  if (cur) out.push(cur);
  return out;
}

function parse3(txt) {
  const out = [];
  let cur = null;
  
  txt.split('\n').forEach(l => {
    if (/Entry Date|Opening Balance/i.test(l)) return;
    
    const m = l.match(/^\s*(\d{2}-[A-Za-z]{3}-\d{4})/);
    if (m) {
      if (cur) out.push(cur);
      
      const date = ddmmyyyy(m[1]);
      const afterDate = l.substring(l.indexOf(m[1]) + m[1].length);
      const amountMatches = afterDate.match(/\b\d+\.\d{2}\b/g);
      
      if (amountMatches?.length >= 2) {
        const narrMatch = afterDate.match(/^(.+?)\s+\d+\.\d{2}/);
        let narration = narrMatch?.[1]?.trim() || '';
        
        const parts = narration.split(/\s+/);
        if (parts.length > 1 && /^\d{12}$/.test(parts[parts.length - 1])) {
          narration = parts.slice(0, -1).join(' ');
        }
        
        narration = narration.replace(/\d{2}-[A-Za-z]{3}-\d{4}/g, '');
        
        const refMatch = narration.match(/\b(\d{12})\b/);
        if (refMatch) {
          const refNum = refMatch[1];
          let firstFound = false;
          narration = narration.replace(new RegExp(`\\b${refNum}\\b`, 'g'), match => 
            firstFound ? '' : (firstFound = true, match)
          );
        }
        
        narration = narration.replace(/\s+/g, ' ').trim();
        const amount = parseFloat(amountMatches[0]);
        const type = narration.includes('UPI/DR') ? 'Debit' : 'Credit';
        
        cur = { date, narration: cleanNarr(narration), amount, type };
      }
    } else if (cur && l.trim()) {
      const cleanLine = l.trim();
      if (!/^\d{12}$|^\d{2}-[A-Za-z]{3}-\d{4}$/.test(cleanLine)) {
        const cleaned = cleanLine.replace(/\d{2}-[A-Za-z]{3}-\d{4}/g, '').trim();
        if (cleaned) cur.narration += ' ' + cleanNarr(cleaned);
      }
    }
  });
  
  if (cur) out.push(cur);
  return out.filter(t => t.amount > 0);
}

function parse4(txt) {
  const out = [];
  let cur = null;
  let pendingContinuation = null;
  
  txt.split('\n').forEach(l => {
    if (/Tran Date|OPENING BALANCE/i.test(l)) return;
    
    const m = l.match(/^\s*(\d{2}-\d{2}-\d{4})/);
    if (m) {
      if (cur) out.push(cur);
      
      const date = ddmmyyyy(m[1]);
      const afterDate = l.substring(l.indexOf(m[1]) + m[1].length).trim();
      const amounts = afterDate.match(/\b\d{1,5}(?:,\d{3})*\.\d{2}\b/g) || [];
      
      if (amounts.length >= 2) {
        const amount = parseFloat(amounts[amounts.length - 2].replace(/,/g, ''));
        let narration = afterDate;
        amounts.forEach(amt => narration = narration.replace(amt, ''));
        narration = narration.replace(/\b\d{3,4}\s*$/, '').replace(/\s+/g, ' ').trim();
        
        if (pendingContinuation) {
          narration = pendingContinuation + ' ' + narration;
          pendingContinuation = null;
        }
        
        const type = afterDate.indexOf(amounts[amounts.length - 2]) < afterDate.length * 0.6 ? 'Debit' : 'Credit';
        cur = { date, narration: cleanNarr(narration), amount, type };
      }
    } else if (l.trim()) {
      const cleanLine = l.trim().replace(/\b\d{3,4}\s*$/, '');
      if (cleanLine) pendingContinuation = cleanNarr(cleanLine);
    }
  });
  
  if (cur) out.push(cur);
  return out.filter(t => t.amount > 0);
}

function parse5(txt) {
  const out = [], seen = new Set();
  const lines = txt.split('\n');
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    if (/TRANSACTION DATE|^#/i.test(line)) {
      i++;
      continue;
    }
    
    const m = line.match(/^\s*\d+\s+(\d{2}\s+\w{3}\s+\d{4})/);
    if (m) {
      const date = ddmmyyyy(m[1]);
      const amtM = line.match(/([+-])([\d,]+\.\d{2})/);
      const amount = toFloat(amtM?.[2]);
      const type = amtM?.[1] === '+' ? 'Credit' : 'Debit';
      
      const transactionLines = [line];
      let j = i + 1;
      
      while (j < lines.length && 
             !/^\s*\d+\s+\d{2}\s+\w{3}\s+\d{4}/.test(lines[j]) && 
             lines[j].trim()) {
        transactionLines.push(lines[j]);
        j++;
      }
      
      let mainLine = transactionLines[0]
        .replace(/^\s*\d+\s+\d{2}\s+\w{3}\s+\d{4}\s+\d{2}\s+\w{3}\s+\d{4}\s+/, '')
        .replace(/\s+[A-Za-z0-9-]+\s+([+-])[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/, '')
        .replace(/\d{2}:\d{2}\s*(AM|PM)?\s*/, '');
      
      const narrationParts = [mainLine.trim()].filter(Boolean);
      
      for (let k = 1; k < transactionLines.length; k++) {
        let contLine = transactionLines[k].trim();
        
        if (!/^\d{10,}$|^FCM-\w+$|^UPI-\d+$|^\d{2}:\d{2}\s*(AM|PM)?$|^240701BCZ9JN$/.test(contLine)) {
          contLine = contLine.replace(/([+-])[\d,]+\.\d{2}/g, '').replace(/\b[\d,]+\.\d{2}\b/g, '');
          if (contLine.trim()) narrationParts.push(contLine.trim());
        }
      }
      
      let fullNarration = narrationParts.join(' ')
        .replace(/(\b[A-Za-z]+-[A-Za-z0-9]+)\s+\1\b/g, '$1')
        .replace(/Repayme\s+nt/g, 'Repayment')
        .replace(/\s+/g, ' ').trim();
      
      if (amount && type && fullNarration) {
        const k = `${date}-${amount}-${type}`;
        if (!seen.has(k)) {
          out.push({ date, narration: cleanNarr(fullNarration), amount, type });
          seen.add(k);
        }
      }
      
      i = j;
    } else {
      i++;
    }
  }
  
  return out;
}

function parse6(txt) {
  const out = [];
  let cur = null;
  
  txt.split('\n').forEach(l => {
    if (/Date\s+Narration/i.test(l)) return;
    
    const m = l.match(/^\s*(\d{2}\/\d{2}\/\d{2})/);
    if (m) {
      if (cur) out.push(cur);
      
      const date = ddmmyyyy(m[1]);
      const afterDate = l.substring(l.indexOf(m[1]) + m[1].length).trim();
      const amountMatch = afterDate.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
      
      let narration = afterDate
        .replace(/\d{1,3}(?:,\d{3})*\.\d{2}/g, '')
        .replace(/\b0+\d{12,}\b/g, '')
        .replace(/\d{2}\/\d{2}\/\d{2}/g, '')
        .replace(/\s+/g, ' ').trim();
      
      if (amount && narration) {
        cur = { date, narration, amount, type: 'Debit' };
      }
    } else if (cur && l.trim()) {
      const cleanLine = l.trim()
        .replace(/\b0+\d{12,}\b/g, '')
        .replace(/\d{2}\/\d{2}\/\d{2}/g, '')
        .replace(/\s+/g, ' ').trim();
      
      if (cleanLine) cur.narration += cleanLine;
    }
  });
  
  if (cur) out.push(cur);
  return out.filter(t => t.amount > 0);
}

/*──────────────────── PARSE DISPATCHER ─────────────────────*/
const parsers = { 
  'pattern1': parse1, 'pattern2': parse2, 'pattern3': parse3,
  'pattern4': parse4, 'pattern5': parse5, 'pattern6': parse6 
};

function parseFile(txt, fname) {
  const pattern = detectPattern(txt);
  
  const fn = parsers[pattern];
  if (!fn) { 
    console.warn(`Unknown pattern: ${pattern} for file: ${fname}`); 
    return []; 
  }
  return fn(txt);
}

// Export functions for programmatic use
export { parseFile, detectPattern };

/*────────────────────────── CLI ───────────────────────────*/
// Keep CLI functionality for direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const args = process.argv.slice(2);

  if (!args.length) {
    console.error('Usage: node index.js <file1> [file2 …]');
    process.exit(1);
  }

  const resultsPerFile = [];
  args.forEach(f => {
    const full = path.resolve(__dirname, f);
    if (!fs.existsSync(full)) {
      console.error(`File not found: ${f}`);
      return;
    }
    const txt = fs.readFileSync(full, 'utf8');
    const parsed = parseFile(txt, path.basename(f));
    resultsPerFile.push({ [path.basename(f)]: parsed });
  });

  console.log(JSON.stringify(resultsPerFile, null, 2));
}
