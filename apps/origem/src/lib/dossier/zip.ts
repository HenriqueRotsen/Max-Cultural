import { createWriteStream } from "fs";
import { mkdir, stat } from "fs/promises";
import path from "path";
import { ZipArchive } from "archiver";

/** Empacota arquivos em ZIP com deflate nível 9. */
export async function createZipFromFiles(params: {
  outPath: string;
  files: Array<{ relativePath: string; buffer: Buffer }>;
}): Promise<{ byteSize: number }> {
  await mkdir(path.dirname(params.outPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(params.outPath);
    const archive = new ZipArchive({
      zlib: { level: 9 },
    });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.on("warning", (err: Error & { code?: string }) => {
      if (err.code !== "ENOENT") reject(err);
    });

    archive.pipe(output);
    for (const file of params.files) {
      archive.append(file.buffer, { name: file.relativePath.replace(/\\/g, "/") });
    }
    void archive.finalize();
  });

  const st = await stat(params.outPath);
  return { byteSize: st.size };
}
