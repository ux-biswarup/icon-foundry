import type { PathCommand, PathShape } from "./geometry.js";

export class PathDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathDataError";
  }
}

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

function tokenize(d: string): Array<string | number> {
  const out: Array<string | number> = [];
  const re = /([MmLlHhVvCcAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)|([SsQqTt])|(\S)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) out.push(m[1]);
    else if (m[2]) out.push(Number(m[2]));
    else if (m[3]) throw new PathDataError(`unsupported path command "${m[3]}"; use M, L, H, V, C, A, Z`);
    else if (m[4] && m[4] !== ",") throw new PathDataError(`unexpected character "${m[4]}" in path data`);
  }
  return out;
}

/**
 * Parse SVG path data into commands. Supports absolute and relative
 * M, L, H, V, C, A and Z with implicit repetition. Everything is converted to
 * absolute coordinates so downstream code never deals with relative moves.
 */
export function parsePathData(d: string): PathCommand[] {
  const tokens = tokenize(d);
  const out: PathCommand[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let cmd: string | undefined;

  const next = (): number => {
    const t = tokens[i++];
    if (typeof t !== "number") throw new PathDataError(`expected a number in "${cmd}" command`);
    return t;
  };
  const numbersAhead = (): boolean => typeof tokens[i] === "number";

  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === "string") {
      cmd = t;
      i++;
    } else if (cmd === undefined) {
      throw new PathDataError("path data must start with a command");
    } else if (cmd === "Z" || cmd === "z") {
      throw new PathDataError("numbers after Z");
    }
    if (cmd === undefined) break;
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();

    if (upper === "Z") {
      out.push({ c: "Z" });
      cx = startX;
      cy = startY;
      continue;
    }

    do {
      switch (upper) {
        case "M": {
          const x = next() + (rel ? cx : 0);
          const y = next() + (rel ? cy : 0);
          out.push({ c: "M", x, y });
          cx = startX = x;
          cy = startY = y;
          // Subsequent implicit pairs are line-tos.
          cmd = rel ? "l" : "L";
          break;
        }
        case "L": {
          const x = next() + (rel ? cx : 0);
          const y = next() + (rel ? cy : 0);
          out.push({ c: "L", x, y });
          cx = x;
          cy = y;
          break;
        }
        case "H": {
          const x = next() + (rel ? cx : 0);
          out.push({ c: "L", x, y: cy });
          cx = x;
          break;
        }
        case "V": {
          const y = next() + (rel ? cy : 0);
          out.push({ c: "L", x: cx, y });
          cy = y;
          break;
        }
        case "C": {
          const x1 = next() + (rel ? cx : 0);
          const y1 = next() + (rel ? cy : 0);
          const x2 = next() + (rel ? cx : 0);
          const y2 = next() + (rel ? cy : 0);
          const x = next() + (rel ? cx : 0);
          const y = next() + (rel ? cy : 0);
          out.push({ c: "C", x1, y1, x2, y2, x, y });
          cx = x;
          cy = y;
          break;
        }
        case "A": {
          const rx = next();
          const ry = next();
          const rotation = next();
          const largeArc = next() !== 0;
          const sweep = next() !== 0;
          const x = next() + (rel ? cx : 0);
          const y = next() + (rel ? cy : 0);
          out.push({ c: "A", rx: Math.abs(rx), ry: Math.abs(ry), rotation, largeArc, sweep, x, y });
          cx = x;
          cy = y;
          break;
        }
        default:
          throw new PathDataError(`unsupported path command "${cmd}"`);
      }
    } while (numbersAhead());
  }

  if (out.length === 0) throw new PathDataError("empty path data");
  if (out[0]?.c !== "M") throw new PathDataError("path data must start with M");
  return out;
}

/** True when the path ends with a close command (its last subpath is closed). */
export function isClosedPath(commands: readonly PathCommand[]): boolean {
  return commands[commands.length - 1]?.c === "Z";
}

/** Parse path data into a shape. Closed paths are fillable unless overridden. */
export function pathShapeFromData(d: string, fillable?: boolean): PathShape {
  const commands = parsePathData(d);
  return { kind: "path", commands, fillable: fillable ?? isClosedPath(commands) };
}

export { NUMBER as PATH_NUMBER_PATTERN };
