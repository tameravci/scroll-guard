import { deflateRawSync } from "node:zlib";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const outputPath = resolve(
  projectRoot,
  process.argv[2] || "artifacts/slop-spotter-for-x-0.3.0.zip"
);
const includedPaths = [
  "manifest.json",
  "src",
  "popup",
  "options",
  "icons",
  "README.md",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.md",
  "LICENSE"
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function collectFiles(path) {
  const fullPath = resolve(projectRoot, path);
  if (statSync(fullPath).isFile()) {
    return [fullPath];
  }
  return readdirSync(fullPath)
    .sort()
    .flatMap((entry) => collectFiles(join(path, entry)));
}

function dosTimestamp() {
  // Deterministic 2026-01-01 00:00:00 timestamp.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  return { date, time };
}

const localParts = [];
const centralParts = [];
let localOffset = 0;
const { date, time } = dosTimestamp();

for (const fullPath of includedPaths.flatMap(collectFiles)) {
  const name = relative(projectRoot, fullPath).replaceAll("\\", "/");
  const nameBytes = Buffer.from(name, "utf8");
  const source = readFileSync(fullPath);
  const compressed = deflateRawSync(source, { level: 9 });
  const checksum = crc32(source);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(time, 10);
  localHeader.writeUInt16LE(date, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(source.length, 22);
  localHeader.writeUInt16LE(nameBytes.length, 26);
  localHeader.writeUInt16LE(0, 28);
  localParts.push(localHeader, nameBytes, compressed);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(time, 12);
  centralHeader.writeUInt16LE(date, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(source.length, 24);
  centralHeader.writeUInt16LE(nameBytes.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(localOffset, 42);
  centralParts.push(centralHeader, nameBytes);

  localOffset += localHeader.length + nameBytes.length + compressed.length;
}

const localData = Buffer.concat(localParts);
const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
const fileCount = centralParts.length / 2;
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(fileCount, 8);
end.writeUInt16LE(fileCount, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(localData.length, 16);
end.writeUInt16LE(0, 20);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.concat([localData, centralDirectory, end]));
console.log(relative(projectRoot, outputPath));
