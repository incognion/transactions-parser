# transactions-parser

`transactions-parser` is a Node.js library and CLI tool that automatically detects and parses a variety of bank statement text files into structured JSON transaction data.

## Installation

Install in your project:

```
npm install transactions-parser
```

Or run without installing using npx:

```
npx transactions-parser file1.txt [file2.txt ...]
```

## Usage

### Command Line

Parse one or more bank statement `.txt` files and print JSON to the terminal:

```
npx transactions-parser file1.txt file2.txt file3.txt
```

To parse all `.txt` files in a folder:

- **Linux/macOS:**

  ```
  npx transactions-parser *.txt
  ```

- **Windows:**

  Use Git Bash, WSL, or specify files explicitly as above:

### Programmatic (Node.js)

Use within your Node.js code:

```js
import { parseFile } from 'transactions-parser';
import fs from 'fs';

const content = fs.readFileSync('file1.txt', 'utf8');
const transactions = parseFile(content, 'file1.txt');

console.log(JSON.stringify(transactions, null, 2));
```

## Input and Output

- **Input:** Plain text bank statement files (not PDFs or images).

- **Output:** Array of JSON transaction objects:

  | Field       | Type   | Description                        |
  |-------------|--------|------------------------------------|
  | `date`      | String | Transaction date (DD/MM/YYYY)      |
  | `narration` | String | Cleaned transaction description    |
  | `amount`    | Number | Positive transaction amount        |
  | `type`      | String | "Debit" or "Credit"                |

#### Example

```json
[
  {
    "date": "01/07/2025",
    "narration": "EXAMPLE VENDOR PAYMENT",
    "amount": 2500,
    "type": "Debit"
  },
  {
    "date": "02/07/2025",
    "narration": "SALARY CREDIT",
    "amount": 80000,
    "type": "Credit"
  }
]
```

## Notes

- The parser auto-detects the bank statement format for each file.
- Unsupported or unparsable files will output an empty array for that file.

**transactions-parser** makes it easy to extract clean, structured transaction data from your bank statement text files.