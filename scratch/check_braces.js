
import fs from 'fs';

const content = fs.readFileSync('/Users/sagbharg/Desktop/Kinematic Code/Kinematic-dashboard/src/app/dashboard/attendance-overview/page.tsx', 'utf8');

let braces = 0;
let parens = 0;
let brackets = 0;
let inString = null;
let inComment = false;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i+1];

    if (inComment) {
        if (char === '*' && next === '/') {
            inComment = false;
            i++;
        } else if (char === '\n') {
            // Check if it was a // comment
        }
        continue;
    }

    if (inString) {
        if (char === inString) {
            // Check for escape
            if (content[i-1] !== '\\') inString = null;
        }
        continue;
    }

    if (char === '/' && next === '*') {
        inComment = true;
        i++;
        continue;
    }
    if (char === '/' && next === '/') {
        while (content[i] !== '\n' && i < content.length) i++;
        continue;
    }

    if (char === "'" || char === '"' || char === '`') {
        inString = char;
        continue;
    }

    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '(') parens++;
    if (char === ')') parens--;
    if (char === '[') brackets++;
    if (char === ']') brackets--;

    if (braces < 0 || parens < 0 || brackets < 0) {
        console.log(`Unmatched closing char at index ${i}: Char='${char}', Braces=${braces}, Parens=${parens}, Brackets=${brackets}`);
        // Print context
        console.log(content.substring(Math.max(0, i-50), Math.min(content.length, i+50)));
        // Reset to prevent flood
        if (braces < 0) braces = 0;
        if (parens < 0) parens = 0;
        if (brackets < 0) brackets = 0;
    }
}

console.log(`Final counts: Braces=${braces}, Parens=${parens}, Brackets=${brackets}`);
