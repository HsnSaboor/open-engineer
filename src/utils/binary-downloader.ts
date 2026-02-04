import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { log } from "./logger";
import { extractZip } from "./zip-extractor";

const REPO = "ast-grep/ast-grep";
const DEFAULT_VERSION = "0.40.0";

interface PlatformInfo {
  arch: string;
  os: string;
}

const PLATFORM_MAP: Record<string, PlatformInfo> = {
  "darwin-arm64": { arch: "aarch64", os: "apple-darwin" },
  "darwin-x64": { arch: "x86_64", os: "apple-darwin" },
  "linux-arm64": { arch: "aarch64", os: "unknown-linux-gnu" },
  "linux-x64": { arch: "x86_64", os: "unknown-linux-gnu" },
  "win32-x64": { arch: "x86_64", os: "pc-windows-msvc" },
  "win32-arm64": { arch: "aarch64", os: "pc-windows-msvc" },
  "win32-ia32": { arch: "i686", os: "pc-windows-msvc" },
};

export function getCacheDir(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || process.env.APPDATA;
    const base = localAppData || join(homedir(), "AppData", "Local");
    return join(base, "open-engineer", "bin");
  }

  const xdgCache = process.env.XDG_CACHE_HOME;
  const base = xdgCache || join(homedir(), ".cache");
  return join(base, "open-engineer", "bin");
}

export function getBinaryName(): string {
  return process.platform === "win32" ? "sg.exe" : "sg";
}

export function ensureCacheDir(cacheDir: string): void {
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
}

export async function downloadArchive(downloadUrl: string, archivePath: string): Promise<void> {
  const response = await fetch(downloadUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await Bun.write(archivePath, arrayBuffer);
}

export function cleanupArchive(archivePath: string): void {
  if (existsSync(archivePath)) {
    unlinkSync(archivePath);
  }
}

export function ensureExecutable(binaryPath: string): void {
  if (process.platform !== "win32" && existsSync(binaryPath)) {
    chmodSync(binaryPath, 0o755);
  }
}

export async function downloadAstGrep(version: string = DEFAULT_VERSION): Promise<string | null> {
  const platformKey = `${process.platform}-${process.arch}`;
  const platformInfo = PLATFORM_MAP[platformKey];

  if (!platformInfo) {
    await log.error("binary-downloader", `Unsupported platform for ast-grep: ${platformKey}`);
    return null;
  }

  const cacheDir = getCacheDir();
  const binaryName = getBinaryName();
  const binaryPath = join(cacheDir, binaryName);

  if (existsSync(binaryPath)) {
    return binaryPath;
  }

  const { arch, os } = platformInfo;
  const assetName = `app-${arch}-${os}.zip`;

  const downloadUrl = `https://github.com/${REPO}/releases/download/${version}/${assetName}`;

  await log.info("binary-downloader", `Downloading ast-grep binary from ${downloadUrl}...`);

  try {
    const archivePath = join(cacheDir, assetName);
    ensureCacheDir(cacheDir);
    await downloadArchive(downloadUrl, archivePath);
    await extractZip(archivePath, cacheDir);
    cleanupArchive(archivePath);
    ensureExecutable(binaryPath);

    await log.info("binary-downloader", `ast-grep binary ready at ${binaryPath}`);

    return binaryPath;
  } catch (err) {
    await log.error("binary-downloader", `Failed to download ast-grep: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function ensureAstGrepBinary(): Promise<string | null> {
  // Check if it exists first
  const cacheDir = getCacheDir();
  const binaryName = getBinaryName();
  const binaryPath = join(cacheDir, binaryName);
  if (existsSync(binaryPath)) return binaryPath;

  return downloadAstGrep();
}
