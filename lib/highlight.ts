export type TokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "func"
  | "type"
  | "punct";

export interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = new Set(
  [
    "const",
    "let",
    "var",
    "function",
    "return",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "export",
    "import",
    "from",
    "default",
    "class",
    "extends",
    "new",
    "this",
    "super",
    "typeof",
    "instanceof",
    "async",
    "await",
    "yield",
    "try",
    "catch",
    "throw",
    "finally",
    "void",
    "delete",
    "in",
    "of",
    "as",
    "interface",
    "type",
    "public",
    "private",
    "protected",
    "static",
    "readonly",
    "implements",
    "enum",
    "package",
    "func",
    "fn",
    "def",
    "struct",
    "impl",
    "trait",
    "pub",
    "mut",
    "match",
    "use",
    "mod",
    "true",
    "false",
    "null",
    "undefined",
    "nil",
    "None",
    "True",
    "False",
    "$state",
    "$derived",
    "$effect",
    "$props",
    "$bindable",
  ].filter(Boolean),
);

const HASH_COMMENT = new Set(["python", "shell", "yaml", "ruby"]);
const TYPE_LANG = new Set(["typescript", "tsx", "rust", "svelte", "javascript"]);

/**
 * Presentation highlighter for the reel. It is a scanner, not a parser:
 * good enough for title-sequence code, not a substitute for Shiki.
 */
export function highlight(line: string, language: string): Token[] {
  if (language === "markdown" || language === "text") {
    return [{ text: line, kind: "plain" }];
  }

  const tokens: Token[] = [];
  let i = 0;
  let expectTag = false;

  const push = (text: string, kind: TokenKind) => {
    if (text) tokens.push({ text, kind });
  };

  while (i < line.length) {
    const ch = line[i];

    if (ch === " " || ch === "\t") {
      let j = i + 1;
      while (j < line.length && (line[j] === " " || line[j] === "\t")) j++;
      push(line.slice(i, j), "plain");
      i = j;
      continue;
    }

    if (ch === "/" && line[i + 1] === "/") {
      push(line.slice(i), "comment");
      break;
    }

    if (ch === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      const stop = end === -1 ? line.length : end + 2;
      push(line.slice(i, stop), "comment");
      i = stop;
      continue;
    }

    if (ch === "#" && HASH_COMMENT.has(language)) {
      push(line.slice(i), "comment");
      break;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "\\") {
          j += 2;
          continue;
        }
        if (line[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      push(line.slice(i, j), "string");
      i = j;
      continue;
    }

    if (ch >= "0" && ch <= "9") {
      let j = i + 1;
      while (j < line.length && /[0-9a-fxA-F._]/.test(line[j])) j++;
      push(line.slice(i, j), "number");
      i = j;
      continue;
    }

    if (ch === "<") {
      push("<", "punct");
      i++;
      if (line[i] === "/") {
        push("/", "punct");
        i++;
      }
      expectTag = true;
      continue;
    }

    if (/[$A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < line.length && /[$A-Za-z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      let kind: TokenKind = "plain";
      if (KEYWORDS.has(word)) kind = "keyword";
      else if (expectTag) kind = "type";
      else if (TYPE_LANG.has(language) && /[A-Z]/.test(word[0])) kind = "type";
      else if (isCall(line, j)) kind = "func";
      push(word, kind);
      expectTag = false;
      i = j;
      continue;
    }

    push(ch, "punct");
    if (ch !== "/") expectTag = false;
    i++;
  }

  return tokens;
}

function isCall(line: string, index: number): boolean {
  let j = index;
  while (j < line.length && (line[j] === " " || line[j] === "\t")) j++;
  return line[j] === "(";
}
