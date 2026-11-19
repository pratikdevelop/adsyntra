import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  constants as fsConstants,
  createReadStream,
  type ReadStream,
} from "node:fs";
import {
  copyFile,
  mkdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  AssetStorageProvider,
} from "../models/asset.model.js";

/**
 * Asset Library local-storage service.
 *
 * MongoDB stores the storage provider and storage key. The actual binary is
 * stored outside MongoDB under data/assets by default.
 *
 * Set ASSET_STORAGE_DIR to an absolute path when deploying with a persistent
 * volume. Relative values are resolved from the API process working directory.
 */

const LOCAL_STORAGE_PROVIDER: AssetStorageProvider = "LOCAL";

const MIME_TYPE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

const STORAGE_KEY_PATTERN =
  /^[a-f0-9]{64}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp4|mov|webm)$/i;

export interface PersistAssetFileInput {
  ownerUserId: string;
  mimeType: string;
  originalFileName: string;
  /** Supply the in-memory file buffer when using Multer memoryStorage. */
  buffer?: Buffer;
  /** Supply a temporary upload path when using Multer diskStorage. */
  temporaryFilePath?: string;
}

export interface StoredAssetFile {
  storageProvider: "LOCAL";
  storageKey: string;
  absolutePath: string;
  mimeType: string;
  extension: string;
}

export interface StoredAssetFileInfo {
  absolutePath: string;
  sizeBytes: number;
  modifiedAt: Date;
  isFile: boolean;
}

function getStorageRoot(): string {
  const configuredDirectory = process.env.ASSET_STORAGE_DIR?.trim();

  if (configuredDirectory) {
    return path.resolve(configuredDirectory);
  }

  // The API package already ignores its data/ directory in .gitignore.
  return path.resolve(process.cwd(), "data", "assets");
}

function getExtensionForMimeType(mimeType: string): string {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const extension = MIME_TYPE_EXTENSIONS[normalizedMimeType];

  if (!extension) {
    throw new Error(
      `Unsupported asset MIME type for local storage: ${normalizedMimeType || "missing"}.`,
    );
  }

  return extension;
}

function getSafeStoragePath(storageKey: string): string {
  if (
    typeof storageKey !== "string" ||
    !STORAGE_KEY_PATTERN.test(storageKey)
  ) {
    throw new Error("Invalid asset storage key.");
  }

  const storageRoot = getStorageRoot();
  const segments = storageKey.split("/");
  const absolutePath = path.resolve(storageRoot, ...segments);
  const relativePath = path.relative(storageRoot, absolutePath);

  // Defense in depth: reject traversal or an absolute path outside the root.
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Asset storage key resolves outside the storage directory.");
  }

  return absolutePath;
}

/**
 * Persist one uploaded image or video using a generated, non-user-controlled
 * storage key. The original filename is metadata only and is never used as a
 * filesystem path.
 */
export async function persistAssetFile(
  input: PersistAssetFileInput,
): Promise<StoredAssetFile> {
  const ownerUserId = input.ownerUserId?.trim();
  const mimeType = input.mimeType?.trim().toLowerCase();
  const originalFileName = input.originalFileName?.trim();

  if (!ownerUserId) {
    throw new Error("An authenticated ownerUserId is required to store an asset.");
  }

  if (!mimeType) {
    throw new Error("Asset MIME type is required.");
  }

  if (!originalFileName) {
    throw new Error("Original asset filename is required.");
  }

  const hasBuffer = Buffer.isBuffer(input.buffer);
  const hasTemporaryPath =
    typeof input.temporaryFilePath === "string" &&
    input.temporaryFilePath.trim().length > 0;

  if (hasBuffer === hasTemporaryPath) {
    throw new Error(
      "Provide exactly one asset source: buffer or temporaryFilePath.",
    );
  }

  const extension = getExtensionForMimeType(mimeType);
  const ownerDirectory = createHash("sha256")
    .update(ownerUserId)
    .digest("hex");
  const fileName = `${randomUUID()}${extension}`;
  const storageKey = `${ownerDirectory}/${fileName}`;
  const absolutePath = getSafeStoragePath(storageKey);
  const ownerStorageDirectory = path.dirname(absolutePath);

  await mkdir(ownerStorageDirectory, {
    recursive: true,
    mode: 0o700,
  });

  try {
    if (hasBuffer) {
      await writeFile(absolutePath, input.buffer as Buffer, {
        flag: "wx",
        mode: 0o600,
      });
    } else {
      const sourcePath = path.resolve(input.temporaryFilePath as string);
      const sourceStats = await stat(sourcePath);

      if (!sourceStats.isFile()) {
        throw new Error("Temporary asset upload is not a regular file.");
      }

      // COPYFILE_EXCL prevents overwriting an existing generated storage key.
      await copyFile(
        sourcePath,
        absolutePath,
        fsConstants.COPYFILE_EXCL,
      );

      await unlink(sourcePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") {
          // The final stored copy is valid; temporary cleanup can be retried
          // by the upload route's own finally block.
        }
      });
    }
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }

  return {
    storageProvider: LOCAL_STORAGE_PROVIDER,
    storageKey,
    absolutePath,
    mimeType,
    extension,
  };
}

/** Resolve an internally stored key to a safe local path. */
export function resolveStoredAssetPath(storageKey: string): string {
  return getSafeStoragePath(storageKey);
}

/** Open a stored file as a stream for authenticated content responses. */
export function createStoredAssetReadStream(
  storageKey: string,
): ReadStream {
  return createReadStream(getSafeStoragePath(storageKey));
}

/** Return file information without exposing the filesystem path to clients. */
export async function getStoredAssetFileInfo(
  storageKey: string,
): Promise<StoredAssetFileInfo> {
  const absolutePath = getSafeStoragePath(storageKey);
  const fileStats = await stat(absolutePath);

  return {
    absolutePath,
    sizeBytes: fileStats.size,
    modifiedAt: fileStats.mtime,
    isFile: fileStats.isFile(),
  };
}

/** Delete a single stored asset file. Missing files are treated as already deleted. */
export async function deleteStoredAssetFile(
  storageKey: string,
): Promise<void> {
  const absolutePath = getSafeStoragePath(storageKey);

  try {
    await unlink(absolutePath);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;

    if (fileError.code !== "ENOENT") {
      throw error;
    }
  }
}

/** Exposed for startup diagnostics and storage-volume configuration checks. */
export function getAssetStorageDirectory(): string {
  return getStorageRoot();
}
