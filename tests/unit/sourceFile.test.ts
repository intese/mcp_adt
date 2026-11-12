import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readSourceFile } from "../../src/utils/sourceFile.js";

describe("readSourceFile", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "srcfile-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a large UTF-8 file unchanged", async () => {
    const p = path.join(dir, "big.abap");
    const content = "* äöü\n" + "WRITE 'x'.\n".repeat(20000);
    await writeFile(p, content, "utf-8");
    expect(await readSourceFile(p)).toBe(content);
  });

  it("rejects relative paths, directories, missing, empty and .env files", async () => {
    await expect(readSourceFile("rel/x.abap")).rejects.toThrow(/absolute/);
    await expect(readSourceFile(dir)).rejects.toThrow(/regular file/);
    await expect(readSourceFile(path.join(dir, "nope.abap"))).rejects.toThrow(/does not exist/);
    const empty = path.join(dir, "empty.abap");
    await writeFile(empty, "");
    await expect(readSourceFile(empty)).rejects.toThrow(/empty/);
    const env = path.join(dir, ".env");
    await writeFile(env, "X=1");
    await expect(readSourceFile(env)).rejects.toThrow(/\.env/);
  });
});
